"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { LeadStatus } from "@/lib/prismaEnums";

const statusSchema = z.enum([
  LeadStatus.NEW,
  LeadStatus.ROUTED,
  LeadStatus.CLAIMED,
  LeadStatus.CONTACTED,
  LeadStatus.QUOTED,
  LeadStatus.WON,
  LeadStatus.LOST,
  LeadStatus.ARCHIVED,
]);

export async function updateLeadStatus(id: string, next: string) {
  const { organizationId, user } = await requireManager();
  const status = statusSchema.parse(next);
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead || lead.organizationId !== organizationId) throw new Error("Not found");
  if (lead.status === status) return { ok: true, unchanged: true };
  await db.lead.update({ where: { id }, data: { status } });
  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      kind: "UPDATED",
      summary: `${lead.name} → ${status.toLowerCase()}`,
    },
  });
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/leads/kanban");
  return { ok: true };
}

// Accept an incoming lead: mark CLAIMED and record who took it + when.
export async function claimLead(id: string) {
  const { organizationId, user } = await requireManager();
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead || lead.organizationId !== organizationId) throw new Error("Not found");
  await db.lead.update({
    where: { id },
    data: { status: "CLAIMED", claimedById: user.id, claimedAt: new Date() },
  });
  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      kind: "UPDATED",
      summary: `${lead.name} → claimed`,
    },
  });
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/leads/kanban");
  return { ok: true };
}

// Permanently remove a lead. Related activity/call/appointment rows survive with
// their leadId nulled (optional relations default to SetNull on delete), so the
// history isn't hard-deleted alongside it. Org-scoped; logs the deletion.
export async function deleteLead(id: string) {
  const { organizationId, user } = await requireManager();
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead || lead.organizationId !== organizationId) throw new Error("Not found");
  await db.lead.delete({ where: { id } });
  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      kind: "DELETED",
      summary: `Deleted lead ${lead.name}`,
    },
  });
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/leads/kanban");
  return { ok: true };
}

const importLeadInput = z.object({
  name: z.string().min(1),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  projectType: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  source: z.enum(["MANUAL", "EMAIL", "IMPORT"]).default("IMPORT"),
});
const importLeadsInput = z.array(importLeadInput).min(1).max(500);

// Bring staged leads into the pipeline as real NEW-status rows, owner-notified.
export async function importLeads(raw: unknown) {
  const { organizationId, user } = await requireManager();
  const rows = importLeadsInput.parse(raw);

  const created = await Promise.all(
    rows.map((r) =>
      db.lead.create({
        data: {
          organizationId,
          name: r.name,
          email: r.email ?? null,
          phone: r.phone ?? null,
          projectType: r.projectType ?? null,
          description: r.description ?? null,
          source: r.source,
          status: "NEW",
        },
        select: { id: true },
      }),
    ),
  );

  // Best-effort owner notification per imported lead (never block the import).
  try {
    const { notifyLeadCreated } = await import("./notify");
    await Promise.all(created.map((l) => notifyLeadCreated(l.id)));
  } catch (err) {
    console.warn("[importLeads] notify failed:", err);
  }

  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      kind: "CREATED",
      summary: `Imported ${created.length} lead${created.length === 1 ? "" : "s"}`,
    },
  });

  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/leads/kanban");
  return { created: created.length };
}
