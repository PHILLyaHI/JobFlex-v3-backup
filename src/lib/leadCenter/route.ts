// Routing a platform lead to ONE named contractor — the write itself, with no
// opinion about who asked for it.
//
// Two callers need exactly this: the admin's manual assign
// (actions/adminLeadCenter.ts) and the re-route that follows a contractor
// passing on a hand-routed lead (actions/leadOffers.ts). They ran different
// code for the same act until 2026-08-27, which is how a decline could leave a
// PlatformLead reading MATCHED to the shop that had just refused it.
//
// The lead lands as a Lead row with status ROUTED — in the shop's Incoming tab,
// not in their pipeline. Accepting it is still their decision.
import { db } from "@/lib/db";

export async function routePlatformLeadToOrg(
  platformLeadId: string,
  organizationId: string,
  /** The admin who did it by hand, or null when the system re-routed. */
  adminId: string | null,
): Promise<{ leadId: string }> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });
  if (!org) throw new Error("Organization not found");

  const now = new Date();
  const leadId = await db.$transaction(async (tx) => {
    // Re-read inside the transaction so we lose cleanly to a concurrent accept.
    const pl = await tx.platformLead.findUnique({ where: { id: platformLeadId } });
    if (!pl) throw new Error("Lead not found");
    if (pl.status === "MATCHED") throw new Error("This lead was already matched.");

    await tx.leadOffer.updateMany({
      where: { platformLeadId, status: "OFFERED" },
      data: { status: "CANCELLED" },
    });

    const lead = await tx.lead.create({
      data: {
        organizationId,
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
        status: "ROUTED",
        aiCategory: pl.detectedTrade,
        aiConfidence: pl.aiConfidence,
      },
    });

    await tx.platformLead.update({
      where: { id: platformLeadId },
      data: {
        status: "MATCHED",
        matchedOrgId: organizationId,
        matchedLeadId: lead.id,
        matchedAt: now,
        ...(adminId ? { assignedByAdminId: adminId } : {}),
      },
    });
    return lead.id;
  });

  // Everything below is best-effort: the routing stands whether or not anyone
  // can be told about it.
  try {
    await db.activityEvent.create({
      data: {
        organizationId,
        leadId,
        kind: "CREATED",
        summary: `Lead assigned to you from the lead center`,
      },
    });
  } catch {
    /* non-fatal */
  }
  try {
    const { notifyLeadCreated, notifyHomeownerMatched } = await import("@/lib/notify");
    await notifyLeadCreated(leadId);
    await notifyHomeownerMatched(platformLeadId);
  } catch (err) {
    console.warn("[lead-center] route notify failed:", err);
  }

  return { leadId };
}
