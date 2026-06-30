"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { AssignmentStatus, Role, roleLabel } from "@/lib/prismaEnums";
import { signIn } from "@/lib/auth";
import { enforcePlanLimit } from "@/lib/limitsEngine";

const inviteInput = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  // Field worker vs office staff. Drives the org membership role (and thus the
  // restricted-vs-full dashboard via isWorkerRole). Defaults to INSTALLER.
  role: z.enum(["INSTALLER", "SALES", "ESTIMATOR", "MANAGER"]).default("INSTALLER"),
  phone: z.string().optional().nullable(),
  specialties: z.array(z.string()).default([]),
  hourlyRate: z.number().optional().nullable(),
});

export async function createWorkerInvite(raw: unknown) {
  const { organizationId, user: inviter } = await requireManager();
  const data = inviteInput.parse(raw);

  // Gate on the absolute "workers" seat limit. Only count it against the plan
  // when this invite would add a NEW seat (re-inviting an existing worker in
  // this org must not be blocked just because the org is at its cap).
  const existingUserForLimit = await db.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  });
  const alreadyAWorker = existingUserForLimit
    ? await db.workerProfile.findFirst({
        where: { organizationId, userId: existingUserForLimit.id },
        select: { id: true, inviteStatus: true },
      })
    : null;
  // Never let a re-invite clobber an already-onboarded worker: re-sending would
  // reset them to PENDING and allow acceptWorkerInvite to set a NEW password —
  // an account-takeover path. Managers must Edit or Remove instead.
  if (alreadyAWorker?.inviteStatus === "ACCEPTED") {
    throw new Error("That worker has already joined. Use Edit or Remove instead.");
  }
  if (!alreadyAWorker) await enforcePlanLimit(organizationId, "workers");

  // Upsert a lightweight User (no password yet). The worker sets a password when
  // they accept the invite (see acceptWorkerInvite).
  const existing = await db.user.findUnique({ where: { email: data.email } });
  const user =
    existing ??
    (await db.user.create({
      data: {
        email: data.email,
        name: data.name,
      },
    }));

  // Membership — the org seat + permission level. The chosen role decides whether
  // this person is a field worker (INSTALLER → restricted) or office staff.
  await db.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId } },
    update: { role: data.role },
    create: { userId: user.id, organizationId, role: data.role },
  });

  // WorkerProfile (unique per user). Every invite — new or re-sent — starts
  // PENDING so the roster shows "in progress" and the magic link lands on the
  // accept/decline gate until the worker responds.
  const profile = await db.workerProfile.upsert({
    where: { userId: user.id },
    update: {
      displayName: data.name,
      phone: data.phone ?? null,
      specialties: JSON.stringify(data.specialties),
      hourlyRate: data.hourlyRate ?? null,
      inviteStatus: "PENDING",
      respondedAt: null,
    },
    create: {
      userId: user.id,
      organizationId,
      displayName: data.name,
      phone: data.phone ?? null,
      specialties: JSON.stringify(data.specialties),
      hourlyRate: data.hourlyRate ?? null,
      token: randomUUID(),
      inviteStatus: "PENDING",
    },
  });

  // Best-effort invite email (link doubles as the manual shareable link).
  try {
    const { sendEmail } = await import("@/lib/sdk/resend");
    const { wrapEmail } = await import("@/lib/email/render");
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const orgName = org?.name ?? "JobFlex";
    // Reflect the role the manager actually assigned (not a generic "crew member").
    const roleName = roleLabel(data.role).toLowerCase();
    const article = /^[aeiou]/i.test(roleName) ? "an" : "a";
    const wrapped = wrapEmail({
      subject: `${inviter.name ?? orgName} invited you to join ${orgName}`,
      body: `Hi ${data.name.split(" ")[0]},

${inviter.name ?? "Your team"} has invited you to join ${orgName} on JobFlex as ${article} ${roleName}.

Open your invite to accept or decline:
${appUrl}/w/${profile.token}

If you accept, you'll set a password and get your own login to see the jobs assigned to you and your schedule.

— ${orgName}`,
      orgName,
    });
    await sendEmail({ to: data.email, subject: wrapped.subject, html: wrapped.html });
  } catch (err) {
    console.warn("[createWorkerInvite] invite email failed:", err);
  }

  revalidatePath("/dashboard/workers");
  return { id: profile.id, token: profile.token };
}

// ── Worker invite response (token-gated, no session) ────────────────────────
// These run before the worker has a login, so they authenticate by the
// WorkerProfile.token carried in the magic link — never by session/role.

const acceptInput = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function acceptWorkerInvite(raw: unknown) {
  const { token, password } = acceptInput.parse(raw);
  const profile = await db.workerProfile.findUnique({
    where: { token },
    include: { user: { select: { id: true, email: true } } },
  });
  // Require a still-open invite. One constant message for missing/declined/
  // already-accepted so a random token can't be probed for its state, and so a
  // stale link can never re-set the password of an onboarded worker.
  if (!profile || profile.inviteStatus !== "PENDING") {
    throw new Error("This invite link is no longer valid.");
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  await db.user.update({
    where: { id: profile.userId },
    data: {
      hashedPassword,
      // Make their company the active org so the session resolves correctly.
      activeOrgId: profile.organizationId,
    },
  });
  await db.workerProfile.update({
    where: { id: profile.id },
    data: { inviteStatus: "ACCEPTED", respondedAt: new Date() },
  });

  // Heads-up for the office (drives the activity feed + notification bell).
  await db.activityEvent.create({
    data: {
      organizationId: profile.organizationId,
      actorId: profile.userId,
      kind: "ACCEPTED",
      summary: `${profile.displayName} accepted your crew invite`,
    },
  });

  revalidatePath("/dashboard/workers");

  // Auto-authorize: establish the session and land on the dashboard in THIS same
  // server step (right after the password write, one request). Signing in here —
  // instead of having the client do a separate sign-in afterward — avoids the
  // worker being bounced to the login screen for a second sign-in. On success
  // NextAuth redirects; on failure it throws (the client shows the error and the
  // already-created account can still log in normally).
  const email = profile.user?.email;
  if (email) {
    await signIn("credentials", { email, password, redirectTo: "/dashboard/jobs" });
  }
  return { email: email ?? null };
}

export async function declineWorkerInvite(token: string) {
  const profile = await db.workerProfile.findUnique({ where: { token } });
  if (!profile) return { ok: true };
  if (profile.inviteStatus === "ACCEPTED") {
    // Already onboarded — don't let a stale link revoke an active worker.
    return { ok: true };
  }
  await db.workerProfile.update({
    where: { id: profile.id },
    data: { inviteStatus: "DECLINED", respondedAt: new Date() },
  });
  await db.activityEvent.create({
    data: {
      organizationId: profile.organizationId,
      actorId: profile.userId,
      kind: "UPDATED",
      summary: `${profile.displayName} declined your crew invite`,
    },
  });
  revalidatePath("/dashboard/workers");
  return { ok: true };
}

const updateWorkerInput = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.enum(["INSTALLER", "SALES", "ESTIMATOR", "MANAGER"]).optional(),
  phone: z.string().optional().nullable(),
  specialties: z.array(z.string()).default([]),
  hourlyRate: z.number().optional().nullable(),
});

// Edit an existing worker's profile (name, phone, specialties, rate). Email is
// the worker's login identity and is intentionally not editable here.
export async function updateWorker(raw: unknown) {
  const { organizationId } = await requireManager();
  const data = updateWorkerInput.parse(raw);
  const w = await db.workerProfile.findUnique({ where: { id: data.id } });
  if (!w || w.organizationId !== organizationId) throw new Error("Not found");
  await db.workerProfile.update({
    where: { id: data.id },
    data: {
      displayName: data.name,
      phone: data.phone ?? null,
      specialties: JSON.stringify(data.specialties),
      hourlyRate: data.hourlyRate ?? null,
    },
  });
  // A role change writes to the membership (the org seat / permission level).
  // Guard the last owner so a role edit can't lock an org out of its own admin.
  if (data.role) {
    const current = await db.membership.findUnique({
      where: { userId_organizationId: { userId: w.userId, organizationId } },
    });
    // data.role is always a worker role (never OWNER), so changing an owner here
    // is always a demotion — guard the last one.
    if (current?.role === Role.OWNER) {
      const owners = await db.membership.count({ where: { organizationId, role: Role.OWNER } });
      if (owners <= 1) throw new Error("Can't change the last owner's role.");
    }
    await db.membership.updateMany({
      where: { userId: w.userId, organizationId },
      data: { role: data.role },
    });
  }
  revalidatePath("/dashboard/workers");
  revalidatePath(`/dashboard/workers/${data.id}`);
  return { id: data.id };
}

export async function revokeWorker(workerId: string) {
  const { organizationId } = await requireManager();
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

// Fully remove a worker from the company: delete their roster profile (which
// cascades their JobAssignments via the schema relation) and drop the org seat.
// We only delete the INSTALLER membership so an owner/admin who also happens to
// hold a worker profile is never locked out of their own org. The shared User
// record is left intact — they may belong to other organizations.
export async function removeWorker(workerId: string) {
  const { organizationId } = await requireManager();
  const w = await db.workerProfile.findUnique({ where: { id: workerId } });
  if (!w || w.organizationId !== organizationId) throw new Error("Not found");

  // Don't strip the last owner's seat.
  const membership = await db.membership.findUnique({
    where: { userId_organizationId: { userId: w.userId, organizationId } },
  });
  if (membership?.role === Role.OWNER) {
    const owners = await db.membership.count({ where: { organizationId, role: Role.OWNER } });
    if (owners <= 1) throw new Error("Can't remove the last owner.");
  }

  await db.workerProfile.delete({ where: { id: workerId } });
  // Drop the org seat regardless of role (the roster now holds any role).
  await db.membership.deleteMany({ where: { userId: w.userId, organizationId } });

  revalidatePath("/dashboard/workers");
}

export async function assignWorker(jobId: string, workerId: string) {
  const { organizationId } = await requireManager();
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
  const { organizationId } = await requireManager();
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
  const { organizationId, user } = await requireManager();
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
  const { organizationId, user } = await requireManager();
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
  const { organizationId, user } = await requireManager();
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
