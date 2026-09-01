"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSalesOrManager } from "@/lib/orgContext";
import { advanceCascade } from "@/lib/leadCenter/cascade";
import { buildRanking } from "@/lib/leadCenter/matching";
import { getRoutingMode } from "@/lib/leadCenter/routingMode";

// Contractor responses to Lead Center offers. Guard parity with claimLead
// (sales + managers). Every terminal transition is a CONDITIONAL updateMany on
// status "OFFERED" so a concurrent accept / expiry sweep / admin manual-assign
// loses cleanly instead of double-materializing the lead.

// Live offers for the active org — powers the app-wide "elite lead routed to
// you" pop-up (polled). Same role gate as accept/decline so only people who can
// act on a lead ever see the prompt.
export async function pendingLeadOffers(): Promise<
  {
    id: string;
    name: string;
    projectType: string | null;
    detectedTrade: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    description: string | null;
    attempt: number;
    expiresAt: string;
  }[]
> {
  const ctx = await requireSalesOrManager();
  const offers = await db.leadOffer.findMany({
    where: { organizationId: ctx.organizationId, status: "OFFERED", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    include: {
      platformLead: {
        select: {
          name: true,
          projectType: true,
          detectedTrade: true,
          city: true,
          state: true,
          zip: true,
          description: true,
        },
      },
    },
  });
  return offers.map((o) => ({
    id: o.id,
    name: o.platformLead.name,
    projectType: o.platformLead.projectType,
    detectedTrade: o.platformLead.detectedTrade,
    city: o.platformLead.city,
    state: o.platformLead.state,
    zip: o.platformLead.zip,
    description: o.platformLead.description,
    attempt: o.attempt,
    expiresAt: o.expiresAt.toISOString(),
  }));
}

async function loadOwnOffer(offerId: string) {
  const ctx = await requireSalesOrManager();
  const offer = await db.leadOffer.findUnique({
    where: { id: offerId },
    include: { platformLead: true },
  });
  // Cross-org probing gets the same answer as a bad id.
  if (!offer || offer.organizationId !== ctx.organizationId) {
    throw new Error("Offer not found");
  }
  return { ctx, offer };
}

export async function acceptLeadOffer(offerId: string): Promise<{ ok: true; leadId: string }> {
  const { ctx, offer } = await loadOwnOffer(offerId);
  const pl = offer.platformLead;
  const now = new Date();

  const leadId = await db.$transaction(async (tx) => {
    const won = await tx.leadOffer.updateMany({
      where: { id: offerId, status: "OFFERED", expiresAt: { gt: now } },
      data: { status: "ACCEPTED", respondedAt: now, respondedById: ctx.user.id },
    });
    if (won.count === 0) {
      throw new Error("This offer is no longer available.");
    }

    // Quota: ALLOW-BUT-COUNT, same policy as the homeowner form — a routed
    // lead is the contractor's revenue and is never blocked by their plan cap.
    const lead = await tx.lead.create({
      data: {
        organizationId: ctx.organizationId,
        name: pl.name,
        email: pl.email,
        phone: pl.phone,
        address: pl.address,
        city: pl.city,
        state: pl.state,
        zip: pl.zip,
        projectType: pl.projectType,
        description: pl.description,
        photos: pl.photos ?? "[]",
        source: "LEAD_CENTER",
        status: "CLAIMED",
        claimedById: ctx.user.id,
        claimedAt: now,
        aiCategory: pl.detectedTrade,
        aiConfidence: pl.aiConfidence,
      },
    });

    await tx.platformLead.update({
      where: { id: pl.id },
      data: { status: "MATCHED", matchedOrgId: ctx.organizationId, matchedLeadId: lead.id, matchedAt: now },
    });

    // Defensive: normally there is exactly one open offer per platform lead.
    await tx.leadOffer.updateMany({
      where: { platformLeadId: pl.id, status: "OFFERED", id: { not: offerId } },
      data: { status: "CANCELLED" },
    });

    return lead.id;
  });

  try {
    await db.activityEvent.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.user.id,
        leadId,
        kind: "ACCEPTED",
        summary: `Accepted platform lead: ${pl.name} · ${pl.detectedTrade ?? pl.projectType ?? "project"}`,
      },
    });
  } catch {
    /* non-fatal */
  }
  try {
    const { notifyHomeownerMatched } = await import("@/lib/notify");
    await notifyHomeownerMatched(pl.id);
  } catch (err) {
    console.warn("[lead-offers] matched notify failed:", err);
  }

  revalidatePath("/dashboard/leads");
  return { ok: true, leadId };
}

export async function declineLeadOffer(offerId: string): Promise<{ ok: true }> {
  const { ctx, offer } = await loadOwnOffer(offerId);

  const res = await db.leadOffer.updateMany({
    where: { id: offerId, status: "OFFERED" },
    data: { status: "DECLINED", respondedAt: new Date(), respondedById: ctx.user.id },
  });
  if (res.count === 0) {
    throw new Error("This offer is no longer available.");
  }

  try {
    await advanceCascade(offer.platformLeadId);
  } catch (err) {
    // The decline stood; the cron sweep's stuck-lead re-drive won't help an
    // OFFERED→(declined) lead, so log loudly for the admin queue to catch.
    console.warn("[lead-offers] cascade advance after decline failed:", err);
  }

  try {
    await db.activityEvent.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.user.id,
        kind: "DECLINED",
        summary: `Declined platform lead offer: ${offer.platformLead.name}`,
      },
    });
  } catch {
    /* non-fatal */
  }

  revalidatePath("/dashboard/leads");
  return { ok: true };
}

// ── Manually routed leads ──────────────────────────────────────────────────
// A lead an admin routed by hand never becomes a LeadOffer: it is written
// straight into the org's Incoming tab as a Lead with status ROUTED. The
// pop-up polls this alongside the live offers so BOTH ways a platform lead can
// arrive announce themselves — before this, a hand-routed lead sat in a tab
// nobody had a reason to open.
export async function pendingRoutedLeads(): Promise<
  {
    id: string;
    name: string;
    projectType: string | null;
    detectedTrade: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    description: string | null;
    createdAt: string;
  }[]
> {
  const ctx = await requireSalesOrManager();
  const rows = await db.lead.findMany({
    where: { organizationId: ctx.organizationId, source: "LEAD_CENTER", status: "ROUTED" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      name: true,
      projectType: true,
      aiCategory: true,
      city: true,
      state: true,
      zip: true,
      description: true,
      createdAt: true,
    },
  });
  return rows.map((l) => ({
    id: l.id,
    name: l.name,
    projectType: l.projectType,
    detectedTrade: l.aiCategory,
    city: l.city,
    state: l.state,
    zip: l.zip,
    description: l.description,
    createdAt: l.createdAt.toISOString(),
  }));
}

/**
 * Pass on a lead an admin routed by hand.
 *
 * Marking the org's Lead row LOST is not enough: the PlatformLead still reads
 * MATCHED to that shop, so the Lead Center showed a declined lead as accepted
 * and the homeowner's request quietly stopped moving. A decline has to undo the
 * match AND send the lead onward:
 *
 *   1. the shop's Lead row goes LOST (out of their Incoming tab),
 *   2. the pass is recorded as a DECLINED LeadOffer so no path ever offers the
 *      same shop this lead again (the cascade skips orgs it has already asked),
 *   3. the PlatformLead is un-matched and re-driven — the cascade offers it to
 *      the next-best shop, or, when the platform is routing by hand, it is
 *      routed straight to the next-best shop.
 */
export async function declineRoutedLead(leadId: string): Promise<{ ok: true; rerouted: boolean }> {
  const ctx = await requireSalesOrManager();
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.organizationId !== ctx.organizationId) throw new Error("Lead not found");

  const pl = await db.platformLead.findFirst({ where: { matchedLeadId: leadId } });

  await db.$transaction(async (tx) => {
    // The row goes, it is not parked as LOST: this shop never accepted the
    // lead, it is on its way to another one, and a "lost" row in their book
    // for work they were only ever offered is a record of nothing. Who passed
    // is recorded on the platform side, as the DECLINED offer below.
    await tx.activityEvent.deleteMany({ where: { leadId } });
    await tx.lead.deleteMany({ where: { id: leadId, organizationId: ctx.organizationId } });
    if (!pl) return;
    // The shop had it and passed: that is an attempt, and it is what stops the
    // lead coming straight back to them.
    await tx.leadOffer.create({
      data: {
        platformLeadId: pl.id,
        organizationId: ctx.organizationId,
        attempt: pl.attemptCount + 1,
        score: 0,
        status: "DECLINED",
        respondedAt: new Date(),
        respondedById: ctx.user.id,
        expiresAt: new Date(),
      },
    });
    await tx.platformLead.update({
      where: { id: pl.id },
      data: {
        status: "MATCHING",
        matchedOrgId: null,
        matchedLeadId: null,
        matchedAt: null,
        queueReason: null,
        attemptCount: { increment: 1 },
      },
    });
  });

  let rerouted = false;
  if (pl) {
    try {
      // A hand-routed lead may never have been ranked, and the cascade walks a
      // snapshot — so make sure there is one before asking it to walk.
      const fresh = await db.platformLead.findUnique({ where: { id: pl.id } });
      if (fresh && (!fresh.rankingJson || fresh.rankingJson === "[]")) {
        const ranking = await buildRanking(fresh);
        await db.platformLead.update({
          where: { id: pl.id },
          data: { rankingJson: JSON.stringify(ranking) },
        });
      }
      if ((await getRoutingMode()) === "MANUAL") {
        rerouted = await routeToNextBest(pl.id);
      } else {
        await advanceCascade(pl.id);
        const after = await db.platformLead.findUnique({
          where: { id: pl.id },
          select: { status: true },
        });
        rerouted = after?.status === "OFFERED";
      }
    } catch (err) {
      console.warn("[lead-offers] re-route after decline failed:", err);
    }
  }

  try {
    await db.activityEvent.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.user.id,
        kind: "DECLINED",
        summary: `Passed on platform lead: ${lead.name}`,
      },
    });
  } catch {
    /* non-fatal */
  }

  revalidatePath("/dashboard/leads");
  revalidatePath("/admin/lead-center");
  return { ok: true, rerouted };
}

/**
 * Manual mode's version of "next": rank again, skip every shop that has
 * already seen this lead, and hand it to the best one left. False when nobody
 * is left — the lead drops into the admin queue rather than nowhere.
 */
async function routeToNextBest(platformLeadId: string): Promise<boolean> {
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
  const { routePlatformLeadToOrg } = await import("@/lib/leadCenter/route");
  await routePlatformLeadToOrg(platformLeadId, next.orgId, null);
  return true;
}
