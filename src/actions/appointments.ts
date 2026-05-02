"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";

const input = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  leadId: z.string().nullable().optional(),
  startsAt: z.union([z.string(), z.date()]),
  endsAt: z.union([z.string(), z.date()]),
  notes: z.string().nullable().optional(),
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELED", "NO_SHOW"]).optional(),
});

function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

export async function createAppointment(raw: unknown) {
  const { organizationId } = await requireOrg();
  const data = input.parse(raw);
  const apt = await db.appointment.create({
    data: {
      organizationId,
      title: data.title,
      leadId: data.leadId ?? null,
      startsAt: toDate(data.startsAt),
      endsAt: toDate(data.endsAt),
      notes: data.notes ?? null,
      status: data.status ?? "SCHEDULED",
    },
  });
  revalidatePath("/dashboard/calendar");
  return { id: apt.id };
}

export async function updateAppointment(id: string, raw: Partial<z.infer<typeof input>>) {
  const { organizationId } = await requireOrg();
  const apt = await db.appointment.findUnique({ where: { id } });
  if (!apt || apt.organizationId !== organizationId) throw new Error("Not found");
  await db.appointment.update({
    where: { id },
    data: {
      title: raw.title ?? undefined,
      leadId: raw.leadId === null ? null : raw.leadId ?? undefined,
      startsAt: raw.startsAt ? toDate(raw.startsAt) : undefined,
      endsAt: raw.endsAt ? toDate(raw.endsAt) : undefined,
      notes: raw.notes === null ? null : raw.notes ?? undefined,
      status: raw.status ?? undefined,
    },
  });
  revalidatePath("/dashboard/calendar");
}

export async function deleteAppointment(id: string) {
  const { organizationId } = await requireOrg();
  const apt = await db.appointment.findUnique({ where: { id } });
  if (!apt || apt.organizationId !== organizationId) throw new Error("Not found");
  await db.appointment.delete({ where: { id } });
  revalidatePath("/dashboard/calendar");
}

export async function rescheduleAppointment(id: string, newStartISO: string) {
  const { organizationId } = await requireOrg();
  const apt = await db.appointment.findUnique({ where: { id } });
  if (!apt || apt.organizationId !== organizationId) throw new Error("Not found");
  const newStart = new Date(newStartISO);
  const duration = apt.endsAt.getTime() - apt.startsAt.getTime();
  newStart.setHours(apt.startsAt.getHours(), apt.startsAt.getMinutes(), 0, 0);
  const newEnd = new Date(newStart.getTime() + duration);
  await db.appointment.update({
    where: { id },
    data: { startsAt: newStart, endsAt: newEnd },
  });
  revalidatePath("/dashboard/calendar");
}
