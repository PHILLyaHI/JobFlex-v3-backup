"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager } from "@/lib/orgContext";
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
  const { organizationId, user } = await requireManager();
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
  const { organizationId } = await requireManager();
  const b = await db.blockedTime.findUnique({ where: { id } });
  if (!b || b.organizationId !== organizationId) throw new Error("Not found");
  await db.blockedTime.delete({ where: { id } });
  revalidatePath("/dashboard/calendar");
}

export async function rescheduleBlockedTime(id: string, newStartISO: string) {
  const { organizationId } = await requireManager();
  const b = await db.blockedTime.findUnique({ where: { id } });
  if (!b || b.organizationId !== organizationId) throw new Error("Not found");
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
