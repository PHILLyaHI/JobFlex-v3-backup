// Offering a platform lead to ONE named contractor — the write itself, with no
// opinion about who asked for it.
//
// Two callers need exactly this: the admin's manual send
// (actions/adminLeadCenter.ts) and manual mode's re-route after a match falls
// through (lib/leadCenter/unmatch.ts routeToNextBest). They ran different code
// for the same act until 2026-08-27, which is how a decline could leave a
// PlatformLead reading MATCHED to the shop that had just refused it.
//
// A HAND-PICKED SHOP GETS AN OFFER, NOT THE LEAD (2026-10-02). Until then this
// wrote a Lead row straight into the shop's Incoming tab (status ROUTED) and
// marked the PlatformLead MATCHED: the shop saw the homeowner's email, phone
// and street before deciding anything, the homeowner was told "you're matched"
// by a shop that had not said yes, and the 24-hour lock on "find me another
// contractor" started running against nobody. Now the hand-picked shop gets
// the same LeadOffer the cascade sends — city and scope, Accept / Pass, 24
// hours — and acceptLeadOffer does the rest (the Lead row with the contacts
// and the scope, MATCHED, the homeowner's "you're matched"). A pass or a lapse
// moves the lead on exactly like a cascade offer's.
//
// Legacy ROUTED rows made before this still work through claimLead /
// declineRoutedLead (actions/leadOffers.ts).
import { db } from "@/lib/db";
import { OFFER_TTL_MS } from "./cascade";
import { buildRanking, loadRankingInputs, rankWith } from "./matching";

export async function offerPlatformLeadToOrg(
  platformLeadId: string,
  organizationId: string,
  /** The admin who did it by hand, or null when the system re-routed. */
  adminId: string | null,
): Promise<{ offerId: string }> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true },
  });
  if (!org) throw new Error("Organization not found");

  const before = await db.platformLead.findUnique({ where: { id: platformLeadId } });
  if (!before) throw new Error("Lead not found");
  if (before.status === "MATCHED") throw new Error("This lead was already matched.");

  // The shop's score as the cascade would compute it — trade filter off, since
  // a person may send a lead outside a shop's listed trades. A shop with no
  // address or with offers paused has no score: 0, as unmatch.ts records.
  const scored = rankWith(before, await loadRankingInputs(), { anyTrade: true, anyDistance: true }).find(
    (c) => c.orgId === organizationId,
  );
  // If this shop passes, the cascade walks the snapshot to the next one — so
  // a lead that was never ranked (manual mode parks before ranking) gets one.
  const needsRanking = !before.rankingJson || before.rankingJson === "[]";
  const ranking = needsRanking ? await buildRanking(before) : null;

  const now = new Date();
  const offerId = await db.$transaction(async (tx) => {
    // Re-read inside the transaction so we lose cleanly to a concurrent accept.
    const pl = await tx.platformLead.findUnique({ where: { id: platformLeadId } });
    if (!pl) throw new Error("Lead not found");
    if (pl.status === "MATCHED") throw new Error("This lead was already matched.");

    const existing = await tx.leadOffer.findUnique({
      where: { platformLeadId_organizationId: { platformLeadId, organizationId } },
    });
    if (existing && existing.status === "OFFERED" && existing.expiresAt > now) {
      throw new Error(`${org.name} already has this offer open.`);
    }

    // One open offer per lead: whoever held it loses it, and their later
    // accept fails its conditional update with "no longer available".
    await tx.leadOffer.updateMany({
      where: { platformLeadId, status: "OFFERED" },
      data: { status: "CANCELLED" },
    });

    const data = {
      attempt: pl.attemptCount + 1,
      score: scored?.score ?? 0,
      // `manual` is how the admin sheet tells a hand-sent offer from the
      // cascade's; the rest is the cascade's own breakdown.
      scoreBreakdownJson: JSON.stringify({
        ...(scored ?? { orgId: organizationId, orgName: org.name }),
        manual: true,
        adminId,
      }),
      expiresAt: new Date(now.getTime() + OFFER_TTL_MS),
      // The lead's price, when an admin set one (lib/leadCenter/purchase).
      priceCents: pl.priceCents && pl.priceCents > 0 ? pl.priceCents : null,
    };
    // (platformLeadId, organizationId) is unique: a shop that passed on this
    // lead before has a row already, and a person sending it back to them on
    // purpose reopens that row rather than being refused.
    const offer = existing
      ? await tx.leadOffer.update({
          where: { id: existing.id },
          data: {
            ...data,
            status: "OFFERED",
            createdAt: now,
            respondedAt: null,
            respondedById: null,
            declineReason: null,
            unlockedAt: null,
          },
        })
      : await tx.leadOffer.create({ data: { ...data, platformLeadId, organizationId } });

    await tx.platformLead.update({
      where: { id: platformLeadId },
      data: {
        status: "OFFERED",
        attemptCount: { increment: 1 },
        // The queue note belongs to the time this lead was IN the queue.
        queueReason: null,
        ...(ranking ? { rankingJson: JSON.stringify(ranking) } : {}),
        ...(adminId ? { assignedByAdminId: adminId } : {}),
      },
    });
    return offer.id;
  });

  // Everything below is best-effort: the offer stands whether or not anyone
  // can be told about it. Same mail, text and activity line as a cascade offer.
  try {
    const { notifyLeadOfferCreated } = await import("@/lib/notify");
    await notifyLeadOfferCreated(offerId);
  } catch (err) {
    console.warn("[lead-center] offer notify failed:", err);
  }
  try {
    await db.activityEvent.create({
      data: {
        organizationId,
        kind: "CREATED",
        summary: `New lead offer: ${before.name} · ${before.detectedTrade ?? before.projectType ?? "project"} — respond within 24h`,
      },
    });
  } catch {
    /* non-fatal */
  }

  return { offerId };
}
