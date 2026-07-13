"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSalesOrManager, isSalesRole, UnauthorizedError } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { enforcePlanLimit } from "@/lib/limitsEngine";

const baseInput = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  leadId: z.string().nullable().optional(),
  clientId: z.string().nullable().optional(),
  proposalId: z.string().nullable().optional(),
  startsAt: z.union([z.string(), z.date()]),
  endsAt: z.union([z.string(), z.date()]),
  notes: z.string().nullable().optional(),
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELED", "NO_SHOW"]).optional(),
  workerIds: z.array(z.string()).optional(),
});

const oneLink = (d: { leadId?: string | null; clientId?: string | null; proposalId?: string | null }) =>
  [d.leadId, d.clientId, d.proposalId].filter(Boolean).length <= 1;

const input = baseInput.refine(oneLink, {
  message: "Link a lead, a client, or a proposal — not more than one",
});

function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

// The linked lead/client/proposal must belong to the caller's org — the ids
// arrive from the client and would otherwise let a crafted request attach
// another tenant's records.
async function assertLinksInOrg(
  organizationId: string,
  d: { leadId?: string | null; clientId?: string | null; proposalId?: string | null },
) {
  if (d.leadId) {
    const lead = await db.lead.findUnique({ where: { id: d.leadId } });
    if (!lead || lead.organizationId !== organizationId) throw new Error("Lead not found");
  }
  if (d.clientId) {
    const client = await db.client.findUnique({ where: { id: d.clientId } });
    if (!client || client.organizationId !== organizationId) throw new Error("Client not found");
  }
  if (d.proposalId) {
    const proposal = await db.proposal.findUnique({ where: { id: d.proposalId } });
    if (!proposal || proposal.organizationId !== organizationId)
      throw new Error("Proposal not found");
  }
}

// Sales reps operate on their own slice of the calendar: appointments they
// created or are staffed on (mirrors the sales calendar query). Managers touch
// anything in the org. Returns the caller's WorkerProfile id (if any) so
// staffing writes can be limited to self-assignment.
async function salesWorkerId(userId: string): Promise<string | null> {
  const wp = await db.workerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  return wp?.id ?? null;
}

async function assertSalesCanTouchAppointment(appointmentId: string, userId: string) {
  const apt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { createdById: true, assignments: { select: { workerId: true } } },
  });
  if (!apt) throw new Error("Not found");
  if (apt.createdById === userId) return;
  const wid = await salesWorkerId(userId);
  if (!wid || !apt.assignments.some((a) => a.workerId === wid)) {
    throw new UnauthorizedError("You can only change appointments you created or are staffed on");
  }
}

// Sales reps may only staff themselves; silently drop any other ids a crafted
// request smuggles in. Managers pass the list through untouched.
async function filterWorkerIdsForRole(
  role: string,
  userId: string,
  workerIds: string[] | undefined,
): Promise<string[] | undefined> {
  if (!workerIds || !isSalesRole(role)) return workerIds;
  const wid = await salesWorkerId(userId);
  return wid ? workerIds.filter((id) => id === wid) : [];
}

// Replace the appointment's staff list. Worker ids are org-checked for the same
// reason as the entity links above.
async function syncAssignments(
  organizationId: string,
  appointmentId: string,
  workerIds: string[],
) {
  const valid = await db.workerProfile.findMany({
    where: { id: { in: workerIds }, organizationId },
    select: { id: true },
  });
  const validIds = valid.map((w) => w.id);
  await db.appointmentAssignment.deleteMany({
    where: { appointmentId, workerId: { notIn: validIds } },
  });
  for (const workerId of validIds) {
    await db.appointmentAssignment.upsert({
      where: { appointmentId_workerId: { appointmentId, workerId } },
      update: {},
      create: { appointmentId, workerId },
    });
  }
}

export async function createAppointment(raw: unknown) {
  const { organizationId, user, role } = await requireSalesOrManager();
  await enforcePlanLimit(organizationId, "calendarCards");
  const data = input.parse(raw);
  await assertLinksInOrg(organizationId, data);
  const workerIds = await filterWorkerIdsForRole(role, user.id, data.workerIds);
  const apt = await db.appointment.create({
    data: {
      organizationId,
      createdById: user.id,
      title: data.title,
      leadId: data.leadId ?? null,
      clientId: data.clientId ?? null,
      proposalId: data.proposalId ?? null,
      startsAt: toDate(data.startsAt),
      endsAt: toDate(data.endsAt),
      notes: data.notes ?? null,
      status: data.status ?? "SCHEDULED",
    },
  });
  if (workerIds?.length) {
    await syncAssignments(organizationId, apt.id, workerIds);
  }
  revalidatePath("/dashboard/calendar");
  return { id: apt.id };
}

export async function updateAppointment(id: string, rawInput: Partial<z.infer<typeof baseInput>>) {
  const { organizationId, user, role } = await requireSalesOrManager();
  // Server actions are network-invokable — parse at runtime, don't trust the
  // TypeScript signature.
  const raw = baseInput.partial().parse(rawInput);
  const apt = await db.appointment.findUnique({ where: { id } });
  if (!apt || apt.organizationId !== organizationId) throw new Error("Not found");
  if (isSalesRole(role)) await assertSalesCanTouchAppointment(id, user.id);
  // Enforce the one-link invariant against the MERGED row, not just the patch —
  // adding clientId to an appointment that already has leadId must fail.
  const merged = {
    leadId: raw.leadId === undefined ? apt.leadId : raw.leadId,
    clientId: raw.clientId === undefined ? apt.clientId : raw.clientId,
    proposalId: raw.proposalId === undefined ? apt.proposalId : raw.proposalId,
  };
  if (!oneLink(merged)) {
    throw new Error("Link a lead, a client, or a proposal — not more than one");
  }
  // Product rule: date/time moves are blocked at the calendar-cards cap, even
  // though a move creates no new row (matches rescheduleAppointment).
  if (raw.startsAt || raw.endsAt) {
    await enforcePlanLimit(organizationId, "calendarCards");
  }
  await assertLinksInOrg(organizationId, raw);
  await db.appointment.update({
    where: { id },
    data: {
      title: raw.title ?? undefined,
      leadId: raw.leadId === null ? null : raw.leadId ?? undefined,
      clientId: raw.clientId === null ? null : raw.clientId ?? undefined,
      proposalId: raw.proposalId === null ? null : raw.proposalId ?? undefined,
      startsAt: raw.startsAt ? toDate(raw.startsAt) : undefined,
      endsAt: raw.endsAt ? toDate(raw.endsAt) : undefined,
      notes: raw.notes === null ? null : raw.notes ?? undefined,
      status: raw.status ?? undefined,
    },
  });
  if (raw.workerIds) {
    const workerIds = await filterWorkerIdsForRole(role, user.id, raw.workerIds);
    await syncAssignments(organizationId, id, workerIds ?? []);
  }
  revalidatePath("/dashboard/calendar");
}

export async function deleteAppointment(id: string) {
  const { organizationId, user, role } = await requireSalesOrManager();
  const apt = await db.appointment.findUnique({ where: { id } });
  if (!apt || apt.organizationId !== organizationId) throw new Error("Not found");
  if (isSalesRole(role)) await assertSalesCanTouchAppointment(id, user.id);
  await db.appointment.delete({ where: { id } });
  revalidatePath("/dashboard/calendar");
}

export async function rescheduleAppointment(id: string, newStartISO: string) {
  const { organizationId, user, role } = await requireSalesOrManager();
  const apt = await db.appointment.findUnique({ where: { id } });
  if (!apt || apt.organizationId !== organizationId) throw new Error("Not found");
  if (isSalesRole(role)) await assertSalesCanTouchAppointment(id, user.id);
  // Product rule: drag/drop moves are blocked at the calendar-cards cap.
  await enforcePlanLimit(organizationId, "calendarCards");
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
