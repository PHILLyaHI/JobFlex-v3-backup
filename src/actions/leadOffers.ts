"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSalesOrManager } from "@/lib/orgContext";
import { advanceCascade } from "@/lib/leadCenter/cascade";

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
