// Un-matching a routed platform lead and sending it onward — the ONE write
// path for "this match did not work out", whoever says so.
//
// Two callers need exactly this: the contractor passing on a routed lead
// (actions/leadOffers.ts declineRoutedLead) and the homeowner's "find me
// another contractor" button (actions/homeownerPortal.ts). They differ only in
// what the pass is called (DECLINED vs REJECTED_BY_CLIENT) and in what happens
// to the shop's Lead row — a contractor pass deletes it (they never accepted;
// a row would be a record of nothing), a client rejection marks it LOST (the
// shop DID accept and may have started work; their book keeps the history).
// Everything else — recording the attempt so the cascade never re-offers the
// same shop, un-matching, and re-driving toward the next candidate — is
// identical, and running it as two copies is how a decline once left a
// PlatformLead reading MATCHED to the shop that had refused it.
//
// Lifecycle it drives:  MATCHED ──unmatchAndAdvance──▶ MATCHING ─▶ OFFERED
//                                                        │ (≥MAX_ATTEMPTS / empty pool)
//                                                        ▼
//                                                   MANUAL_QUEUE
//
// Plain server module (NOT "use server") — invoked only from guarded actions.
import { db } from "@/lib/db";
import { advanceCascade } from "./cascade";
import { buildRanking } from "./matching";
import { getRoutingMode } from "./routingMode";

/**
 * How long after a match the homeowner's "find me another contractor" button
 * stays locked (owner's rule #1: give the shop time to make the call). The
 * page shows the unlock moment; the action enforces it.
 */
export const CLIENT_REROUTE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** When the button unlocks for a match made at `matchedAt`; null = no match. */
export function clientRerouteUnlocksAt(matchedAt: Date | null | undefined): Date | null {
  return matchedAt ? new Date(matchedAt.getTime() + CLIENT_REROUTE_COOLDOWN_MS) : null;
}

export interface UnmatchOptions {
  /** What the pass is recorded as on the LeadOffer history row. */
  offerStatus: "DECLINED" | "REJECTED_BY_CLIENT";
  /** The contractor user who passed; null when the homeowner did it. */
  respondedById?: string | null;
  /** REJECTED_BY_CLIENT only: the homeowner's optional reason. */
  declineReason?: string | null;
  /** What happens to the org-scoped Lead row (see the header). */
  leadDisposition: "delete" | "lost";
  /**
   * Idempotency guard: the caller acts against the match it SAW. When the lead
   * is no longer MATCHED to this org by the time the write runs (the shop
   * already passed, an admin re-assigned, a double click), nothing changes and
   * `changed: false` comes back for the caller to answer honestly.
   */
  expectedOrgId: string;
}

export interface UnmatchResult {
  /** False = the guard refused: the lead was not MATCHED to expectedOrgId. */
  changed: boolean;
  /** True when the re-drive placed the lead with (or offered it to) a next shop. */
  rerouted: boolean;
  /** The platform lead's status after everything settled. */
  status: string;
}

export async function unmatchAndAdvance(
  platformLeadId: string,
  opts: UnmatchOptions,
): Promise<UnmatchResult> {
  // ── the un-match itself, transactional against the client-vs-shop race ──
  const changed = await db.$transaction(async (tx) => {
    // Re-read inside the transaction so a concurrent accept / re-assign /
    // double click loses cleanly instead of double-unmatching.
    const pl = await tx.platformLead.findUnique({ where: { id: platformLeadId } });
    if (!pl || pl.status !== "MATCHED" || pl.matchedOrgId !== opts.expectedOrgId) return false;

    if (pl.matchedLeadId) {
      if (opts.leadDisposition === "delete") {
        await tx.activityEvent.deleteMany({ where: { leadId: pl.matchedLeadId } });
        await tx.lead.deleteMany({
          where: { id: pl.matchedLeadId, organizationId: opts.expectedOrgId },
        });
      } else {
        await tx.lead.updateMany({
          where: { id: pl.matchedLeadId, organizationId: opts.expectedOrgId },
          data: { status: "LOST" },
        });
      }
    }

    // The shop had it and it ended: that is an attempt, and the recorded offer
    // is what stops every future selection path from asking this shop again.
    // upsert, not create: the shop usually ALREADY has an offer row for this
    // lead (it accepted one) and (platformLeadId, organizationId) is unique.
    await tx.leadOffer.upsert({
      where: {
        platformLeadId_organizationId: {
          platformLeadId,
          organizationId: opts.expectedOrgId,
        },
      },
      create: {
        platformLeadId,
        organizationId: opts.expectedOrgId,
        attempt: pl.attemptCount + 1,
        score: 0,
        status: opts.offerStatus,
        declineReason: opts.declineReason ?? null,
        respondedAt: new Date(),
        respondedById: opts.respondedById ?? null,
        expiresAt: new Date(),
      },
      update: {
        status: opts.offerStatus,
        declineReason: opts.declineReason ?? null,
        respondedAt: new Date(),
        respondedById: opts.respondedById ?? null,
      },
    });

    // attemptCount is NOT incremented here: it counts OFFERS, and the cascade's
    // offerToNext increments it when the next offer goes out. Counting the pass
    // as well double-charged the cap — one rejection would spend two of the
    // three attempts (this is also how the pre-refactor contractor decline
    // over-counted on the AUTO path).
    await tx.platformLead.update({
      where: { id: platformLeadId },
      data: {
        status: "MATCHING",
        matchedOrgId: null,
        matchedLeadId: null,
        matchedAt: null,
        queueReason: null,
      },
    });
    return true;
  });

  if (!changed) {
    const pl = await db.platformLead.findUnique({
      where: { id: platformLeadId },
      select: { status: true },
    });
    return { changed: false, rerouted: false, status: pl?.status ?? "MATCHING" };
  }

  // ── the re-drive — best-effort, the cron sweep re-drives MATCHING strays ──
  let rerouted = false;
  try {
    // A hand-routed lead may never have been ranked, and the cascade walks a
    // snapshot — so make sure there is one before asking it to walk.
    const fresh = await db.platformLead.findUnique({ where: { id: platformLeadId } });
    if (fresh && (!fresh.rankingJson || fresh.rankingJson === "[]")) {
      const ranking = await buildRanking(fresh);
      await db.platformLead.update({
        where: { id: platformLeadId },
        data: { rankingJson: JSON.stringify(ranking) },
      });
    }
    if ((await getRoutingMode()) === "MANUAL") {
      rerouted = await routeToNextBest(platformLeadId);
    } else {
      // The cascade owns MAX_ATTEMPTS: at the cap it parks the lead in the
      // manual queue instead of offering — a client rejection spends an
      // attempt exactly like a contractor pass (owner's rule #2).
      await advanceCascade(platformLeadId);
      const after = await db.platformLead.findUnique({
        where: { id: platformLeadId },
        select: { status: true },
      });
      rerouted = after?.status === "OFFERED";
    }
  } catch (err) {
    console.warn("[lead-center] re-drive after unmatch failed:", err);
  }

  const pl = await db.platformLead.findUnique({
    where: { id: platformLeadId },
    select: { status: true },
  });
  return { changed: true, rerouted, status: pl?.status ?? "MATCHING" };
}

/**
 * Manual mode's version of "next": rank again, skip every shop that has
 * already seen this lead, and hand it to the best one left. False when nobody
 * is left — the lead drops into the admin queue rather than nowhere.
 */
export async function routeToNextBest(platformLeadId: string): Promise<boolean> {
  const pl = await db.platformLead.findUnique({
    where: { id: platformLeadId },
    include: { offers: { select: { organizationId: true } } },
  });
  if (!pl) return false;
  const seen = new Set(pl.offers.map((o) => o.organizationId));
  const ranking = await buildRanking(pl);
  const next = ranking.find((c) => !seen.has(c.orgId));
  if (!next) {
    await db.platformLead.update({
      where: { id: platformLeadId },
      data: { status: "MANUAL_QUEUE", queueReason: "EXHAUSTED" },
    });
    return false;
  }
  const { routePlatformLeadToOrg } = await import("./route");
  await routePlatformLeadToOrg(platformLeadId, next.orgId, null);
  return true;
}
