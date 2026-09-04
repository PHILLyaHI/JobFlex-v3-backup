// Lead Center cascade — the routing state machine every other surface calls.
// Plain server module (NOT "use server"): invoked only from guarded actions
// (accept/decline, admin assign), the public-but-validated homeowner intake,
// and the CRON_SECRET-gated sweep route.
//
// Lifecycle:  MATCHING ─startCascade→ OFFERED ─accept→ MATCHED
//                │                      │decline/expire
//                │                      └─advanceCascade→ next candidate…
//                └(no candidates)→ MANUAL_QUEUE   (≥3 attempts)→ MANUAL_QUEUE
//
// Ranking is SNAPSHOTTED at submission (rankingJson) for admin explainability;
// each step re-validates the next candidate's live eligibility and skips orgs
// that have since opted out, lost their geocode, or dropped the trade.
import { db } from "@/lib/db";
import { buildRanking, type Candidate } from "./matching";
import { parseTradeTypes, orgCoversTrade, isTradeType, type TradeType } from "@/lib/tradeTypes";
import { notifyLeadOfferCreated } from "@/lib/notify";

export const OFFER_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_ATTEMPTS = 3;
const STUCK_MATCHING_MS = 10 * 60 * 1000;

export async function startCascade(platformLeadId: string): Promise<void> {
  const pl = await db.platformLead.findUnique({ where: { id: platformLeadId } });
  // Only drive fresh/stuck leads — the cron re-drive may race a submission
  // that already progressed.
  if (!pl || pl.status !== "MATCHING") return;

  // No usable detected trade — this lead must not cascade at all (owner,
  // 2026-09-04: the AI classification is the ONLY trade source, and an
  // unclassified lead goes to a human, never to the "Other" bucket). The
  // intake normally parks these itself; this guard covers the cron re-drive
  // of leads whose submission crashed between insert and routing.
  if (!pl.detectedTrade || !isTradeType(pl.detectedTrade) || pl.detectedTrade === "Other") {
    await db.platformLead.update({
      where: { id: platformLeadId },
      data: { status: "MANUAL_QUEUE", queueReason: "TRADE_UNDETERMINED: no routable detected trade" },
    });
    return;
  }

  const ranking = await buildRanking(pl);
  await db.platformLead.update({
    where: { id: platformLeadId },
    data: { rankingJson: JSON.stringify(ranking) },
  });
  if (!ranking.length) {
    await db.platformLead.update({
      where: { id: platformLeadId },
      data: { status: "MANUAL_QUEUE", queueReason: "NO_CANDIDATES" },
    });
    return;
  }
  await offerToNext(platformLeadId);
}

// Called after a decline or expiry has already transitioned the offer row.
export async function advanceCascade(platformLeadId: string): Promise<void> {
  const pl = await db.platformLead.findUnique({ where: { id: platformLeadId } });
  if (!pl) return;
  // Terminal states — e.g. an admin manually assigned while an offer was open.
  if (pl.status === "MATCHED" || pl.status === "MANUAL_QUEUE") return;

  if (pl.attemptCount >= MAX_ATTEMPTS) {
    await db.platformLead.update({
      where: { id: platformLeadId },
      data: { status: "MANUAL_QUEUE", queueReason: "EXHAUSTED" },
    });
    return;
  }
  await offerToNext(platformLeadId);
}

// Walk the snapshot past already-offered orgs, re-validate live eligibility,
// and open a 24h offer to the first org that still qualifies. No candidates
// left → manual queue.
async function offerToNext(platformLeadId: string): Promise<void> {
  const pl = await db.platformLead.findUnique({
    where: { id: platformLeadId },
    include: { offers: { select: { organizationId: true } } },
  });
  if (!pl || pl.status === "MATCHED" || pl.status === "MANUAL_QUEUE") return;

  let ranking: Candidate[] = [];
  try {
    ranking = JSON.parse(pl.rankingJson ?? "[]");
  } catch {
    ranking = [];
  }
  const alreadyOffered = new Set(pl.offers.map((o) => o.organizationId));
  const detected: TradeType =
    pl.detectedTrade && isTradeType(pl.detectedTrade) ? pl.detectedTrade : "Other";

  for (const cand of ranking) {
    if (alreadyOffered.has(cand.orgId)) continue;

    const org = await db.organization.findUnique({
      where: { id: cand.orgId },
      select: { id: true, leadOffersEnabled: true, lat: true, lng: true, tradeTypesJson: true },
    });
    if (!org || !org.leadOffersEnabled || org.lat == null || org.lng == null) continue;
    if (!orgCoversTrade(parseTradeTypes(org.tradeTypesJson), detected)) continue;

    const offer = await db.$transaction(async (tx) => {
      const created = await tx.leadOffer.create({
        data: {
          platformLeadId,
          organizationId: cand.orgId,
          attempt: pl.attemptCount + 1,
          score: cand.score,
          scoreBreakdownJson: JSON.stringify(cand),
          expiresAt: new Date(Date.now() + OFFER_TTL_MS),
        },
      });
      await tx.platformLead.update({
        where: { id: platformLeadId },
        data: { status: "OFFERED", attemptCount: { increment: 1 } },
      });
      return created;
    });

    // Best-effort: the offer stands even if the org can't be pinged.
    await notifyLeadOfferCreated(offer.id).catch((err) =>
      console.warn("[lead-center] offer notify failed:", err),
    );
    try {
      await db.activityEvent.create({
        data: {
          organizationId: cand.orgId,
          kind: "CREATED",
          summary: `New lead offer: ${pl.name} · ${pl.detectedTrade ?? pl.projectType ?? "project"} — respond within 24h`,
        },
      });
    } catch {
      /* non-fatal */
    }
    return;
  }

  await db.platformLead.update({
    where: { id: platformLeadId },
    data: {
      status: "MANUAL_QUEUE",
      queueReason: pl.offers.length > 0 ? "EXHAUSTED" : "NO_CANDIDATES",
    },
  });
}

// Cron sweep: expire due offers and cascade each one, then re-drive leads
// stuck in MATCHING (a submission-time cascade error leaves them there).
export async function runDueOfferSweep(): Promise<{
  expired: number;
  advanced: number;
  redriven: number;
}> {
  const now = new Date();
  const due = await db.leadOffer.findMany({
    where: { status: "OFFERED", expiresAt: { lte: now } },
    select: { id: true, platformLeadId: true },
    take: 100,
  });

  let expired = 0;
  let advanced = 0;
  for (const o of due) {
    // Conditional transition — loses cleanly to a concurrent accept/decline/cancel.
    const res = await db.leadOffer.updateMany({
      where: { id: o.id, status: "OFFERED" },
      data: { status: "EXPIRED" },
    });
    if (res.count === 0) continue;
    expired++;
    try {
      await advanceCascade(o.platformLeadId);
      advanced++;
    } catch (err) {
      console.warn("[lead-center] cascade advance failed:", err);
    }
  }

  const stuck = await db.platformLead.findMany({
    where: { status: "MATCHING", createdAt: { lt: new Date(now.getTime() - STUCK_MATCHING_MS) } },
    select: { id: true },
    take: 25,
  });
  for (const pl of stuck) {
    await startCascade(pl.id).catch((err) =>
      console.warn("[lead-center] re-drive failed:", err),
    );
  }

  // Orphan recovery: an OFFERED lead with no open offer (a decline whose
  // advanceCascade errored) would otherwise wait forever.
  const orphaned = await db.platformLead.findMany({
    where: {
      status: "OFFERED",
      updatedAt: { lt: new Date(now.getTime() - STUCK_MATCHING_MS) },
      offers: { none: { status: "OFFERED" } },
    },
    select: { id: true },
    take: 25,
  });
  for (const pl of orphaned) {
    await advanceCascade(pl.id).catch((err) =>
      console.warn("[lead-center] orphan re-drive failed:", err),
    );
  }

  return { expired, advanced, redriven: stuck.length + orphaned.length };
}
