"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSalesOrManager, isSalesRole, UnauthorizedError } from "@/lib/orgContext";
import { db } from "@/lib/db";

const input = z.object({
  id: z.string().optional(),
  reason: z.string().min(1),
  startsAt: z.union([z.string(), z.date()]),
  endsAt: z.union([z.string(), z.date()]),
});

function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

export async function createBlockedTime(raw: unknown) {
  // Blocks are always created self-owned, so sales reps creating their own
  // blocked time is safe by construction.
  const { organizationId, user } = await requireSalesOrManager();
  const data = input.parse(raw);
  const block = await db.blockedTime.create({
    data: {
      organizationId,
      ownerId: user.id,
      reason: data.reason,
      startsAt: toDate(data.startsAt),
      endsAt: toDate(data.endsAt),
    },
  });
  revalidatePath("/dashboard/calendar");
  return { id: block.id };
}

export async function deleteBlockedTime(id: string) {
  const { organizationId, user, role } = await requireSalesOrManager();
  const b = await db.blockedTime.findUnique({ where: { id } });
  if (!b || b.organizationId !== organizationId) throw new Error("Not found");
  // Sales reps can only remove their own blocks (org-wide blocks are manager turf).
  if (isSalesRole(role) && b.ownerId !== user.id) {
    throw new UnauthorizedError("You can only remove your own blocked time");
  }
  await db.blockedTime.delete({ where: { id } });
  revalidatePath("/dashboard/calendar");
}

export async function rescheduleBlockedTime(id: string, newStartISO: string) {
  const { organizationId, user, role } = await requireSalesOrManager();
  const b = await db.blockedTime.findUnique({ where: { id } });
  if (!b || b.organizationId !== organizationId) throw new Error("Not found");
  if (isSalesRole(role) && b.ownerId !== user.id) {
    throw new UnauthorizedError("You can only move your own blocked time");
  }
  const newStart = new Date(newStartISO);
  const duration = b.endsAt.getTime() - b.startsAt.getTime();
  newStart.setHours(b.startsAt.getHours(), b.startsAt.getMinutes(), 0, 0);
  const newEnd = new Date(newStart.getTime() + duration);
  await db.blockedTime.update({
    where: { id },
    data: { startsAt: newStart, endsAt: newEnd },
  });
  revalidatePath("/dashboard/calendar");
}
