"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { startCascade } from "@/lib/leadCenter/cascade";

// Platform-admin Lead Center controls. Manual assignment is the escape hatch
// for MANUAL_QUEUE leads (and can override a pending offer: cancelling it
// inside the transaction makes the contractor's later accept fail its
// conditional update with "no longer available").

export async function manualAssignPlatformLead(
  platformLeadId: string,
  organizationId: string,
): Promise<{ ok: true; leadId: string }> {
  const admin = await requirePlatformAdmin();

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true },
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

    // ROUTED (not CLAIMED): a manual assignment still lands in the org's
    // Incoming tab for them to accept into their pipeline.
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
        assignedByAdminId: admin.id,
      },
    });
    return lead.id;
  });

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
    console.warn("[admin-lead-center] assign notify failed:", err);
  }

  revalidatePath("/admin/lead-center");
  return { ok: true, leadId };
}

// Send a MANUAL_QUEUE lead back through the cascade — useful once new shops
// sign up or an existing one completes its profile. Attempts reset, but orgs
// that already received an offer are never offered the same lead twice
// (LeadOffer's unique constraint / the cascade's already-offered skip).
export async function requeuePlatformLead(platformLeadId: string): Promise<{ ok: true }> {
  await requirePlatformAdmin();

  const res = await db.platformLead.updateMany({
    where: { id: platformLeadId, status: "MANUAL_QUEUE" },
    data: { status: "MATCHING", queueReason: null, attemptCount: 0 },
  });
  if (res.count === 0) throw new Error("Only leads in the manual queue can be requeued.");

  try {
    await startCascade(platformLeadId);
  } catch (err) {
    console.warn("[admin-lead-center] requeue cascade failed — cron will re-drive:", err);
  }

  revalidatePath("/admin/lead-center");
  return { ok: true };
}
