"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { AssignmentStatus, Role } from "@/lib/prismaEnums";

const inviteInput = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  specialties: z.array(z.string()).default([]),
  hourlyRate: z.number().optional().nullable(),
});

export async function createWorkerInvite(raw: unknown) {
  const { organizationId } = await requireOrg();
  const data = inviteInput.parse(raw);

  // Upsert a lightweight User (no password). They'll sign in through the magic-link portal.
  const existing = await db.user.findUnique({ where: { email: data.email } });
  const user =
    existing ??
    (await db.user.create({
      data: {
        email: data.email,
        name: data.name,
      },
    }));

  // Membership
  await db.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId } },
    update: { role: Role.INSTALLER },
    create: { userId: user.id, organizationId, role: Role.INSTALLER },
  });

  // WorkerProfile (unique per user)
  const profile = await db.workerProfile.upsert({
    where: { userId: user.id },
    update: {
      displayName: data.name,
      phone: data.phone ?? null,
      specialties: JSON.stringify(data.specialties),
      hourlyRate: data.hourlyRate ?? null,
    },
    create: {
      userId: user.id,
      organizationId,
      displayName: data.name,
      phone: data.phone ?? null,
      specialties: JSON.stringify(data.specialties),
      hourlyRate: data.hourlyRate ?? null,
      token: randomUUID(),
    },
  });

  revalidatePath("/dashboard/workers");
  return { id: profile.id, token: profile.token };
}

export async function revokeWorker(workerId: string) {
  const { organizationId } = await requireOrg();
  const w = await db.workerProfile.findUnique({ where: { id: workerId } });
  if (!w || w.organizationId !== organizationId) throw new Error("Not found");

  // Rotate the magic-link token so the previous one is invalidated immediately
  await db.workerProfile.update({
    where: { id: workerId },
    data: { token: randomUUID() },
  });
  revalidatePath("/dashboard/workers");
  revalidatePath(`/dashboard/workers/${workerId}`);
}

export async function assignWorker(jobId: string, workerId: string) {
  const { organizationId } = await requireOrg();
  const [job, worker] = await Promise.all([
    db.job.findUnique({ where: { id: jobId } }),
    db.workerProfile.findUnique({ where: { id: workerId } }),
  ]);
  if (
    !job ||
    !worker ||
    job.organizationId !== organizationId ||
    worker.organizationId !== organizationId
  )
    throw new Error("Not found");

  const assignment = await db.jobAssignment.upsert({
    where: { jobId_workerId: { jobId, workerId } },
    update: {},
    create: {
      jobId,
      workerId,
      status: AssignmentStatus.PENDING,
    },
  });

  // Best-effort email + SMS notify to the worker
  try {
    const { notifyAssignmentCreated } = await import("./notify");
    await notifyAssignmentCreated(assignment.id);
  } catch (err) {
    console.warn("[assignWorker] notify failed:", err);
  }

  revalidatePath(`/dashboard/jobs/${jobId}`);
  revalidatePath(`/dashboard/workers/${workerId}`);
}

export async function unassignWorker(assignmentId: string) {
  const { organizationId } = await requireOrg();
  const a = await db.jobAssignment.findUnique({
    where: { id: assignmentId },
    include: { job: true },
  });
  if (!a || a.job.organizationId !== organizationId) throw new Error("Not found");
  await db.jobAssignment.delete({ where: { id: assignmentId } });
  revalidatePath(`/dashboard/jobs/${a.jobId}`);
}

export async function updateAssignmentStatus(assignmentId: string, status: string) {
  const a = await db.jobAssignment.findUnique({
    where: { id: assignmentId },
    include: { job: true },
  });
  if (!a) throw new Error("Not found");
  // Worker-portal path: no auth, token-gated upstream in the route handler.
  await db.jobAssignment.update({
    where: { id: assignmentId },
    data: { status },
  });
  revalidatePath(`/dashboard/jobs/${a.jobId}`);
}

// ── Inbox actions (owner-side) ──────────────────────────

export async function pingAssignment(assignmentId: string) {
  const { organizationId, user } = await requireOrg();
  const a = await db.jobAssignment.findUnique({
    where: { id: assignmentId },
    include: { job: true, worker: { include: { user: { select: { email: true } } } } },
  });
  if (!a || a.job.organizationId !== organizationId) throw new Error("Not found");

  await db.jobAssignment.update({
    where: { id: assignmentId },
    data: { pingedAt: new Date() },
  });

  // Best-effort re-notify (email + SMS where configured)
  try {
    const { notifyAssignmentCreated } = await import("./notify");
    await notifyAssignmentCreated(assignmentId);
  } catch (err) {
    console.warn("[pingAssignment] notify failed:", err);
  }

  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      kind: "NOTE",
      summary: `Pinged ${a.worker.displayName} about "${a.job.title}"`,
    },
  });

  revalidatePath("/dashboard/calendar");
  revalidatePath(`/dashboard/jobs/${a.jobId}`);
}

export async function markAssignmentAccepted(assignmentId: string) {
  const { organizationId, user } = await requireOrg();
  const a = await db.jobAssignment.findUnique({
    where: { id: assignmentId },
    include: { job: true, worker: true },
  });
  if (!a || a.job.organizationId !== organizationId) throw new Error("Not found");
  await db.jobAssignment.update({
    where: { id: assignmentId },
    data: { status: "ACCEPTED" },
  });
  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      kind: "ACCEPTED",
      summary: `${a.worker.displayName} marked accepted on "${a.job.title}"`,
    },
  });
  revalidatePath("/dashboard/calendar");
  revalidatePath(`/dashboard/jobs/${a.jobId}`);
}

export async function unassignAssignment(assignmentId: string) {
  const { organizationId, user } = await requireOrg();
  const a = await db.jobAssignment.findUnique({
    where: { id: assignmentId },
    include: { job: true, worker: true },
  });
  if (!a || a.job.organizationId !== organizationId) throw new Error("Not found");
  await db.jobAssignment.delete({ where: { id: assignmentId } });
  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      kind: "UPDATED",
      summary: `Removed ${a.worker.displayName} from "${a.job.title}"`,
    },
  });
  revalidatePath("/dashboard/calendar");
  revalidatePath(`/dashboard/jobs/${a.jobId}`);
}
