"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/orgContext";
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
  const { organizationId, user } = await requireOrg();
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
