"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager, requireJobEventCreator, isWorkerRole } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { JobStatus } from "@/lib/prismaEnums";
import { enforcePlanLimit } from "@/lib/limitsEngine";

const jobInput = z.object({
  title: z.string().min(1),
  clientId: z.string().optional().nullable(),
  proposalId: z.string().optional().nullable(),
  status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELED"]).optional(),
  notes: z.string().optional().nullable(),
  scopeOfWork: z.string().optional().nullable(),
  startsAt: z.union([z.string(), z.date()]).optional().nullable(),
  endsAt: z.union([z.string(), z.date()]).optional().nullable(),
  workerIds: z.array(z.string()).optional().nullable(),
});

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  return v instanceof Date ? v : new Date(v);
}

export async function createJob(raw: unknown) {
  // Installers may create jobs too (manager + installer role); the guard blocks
  // sales/estimator. An installer-created job is auto-assigned to them and can't
  // staff anyone else.
  const { organizationId, user, role } = await requireJobEventCreator();
  await enforcePlanLimit(organizationId, "jobs");
  const data = jobInput.parse(raw);
  const starts = toDate(data.startsAt);
  const ends = toDate(data.endsAt);
  // A dated job auto-creates its calendar event below — that seat must exist too.
  if (starts) await enforcePlanLimit(organizationId, "calendarEvents");

  // Effective crew: installers are forced to self (any passed ids ignored);
  // managers use whatever was picked. An installer with no WorkerProfile can't
  // be assigned, which would leave the new job invisible to them — refuse
  // up front rather than create an orphan.
  const installer = isWorkerRole(role);
  let effectiveWorkerIds = data.workerIds ?? [];
  if (installer) {
    const self = await db.workerProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!self) {
      throw new Error(
        "Your account isn't set up as a worker yet — ask a manager to add you to the team roster.",
      );
    }
    effectiveWorkerIds = [self.id];
  }

  const job = await db.job.create({
    data: {
      organizationId,
      title: data.title,
      clientId: data.clientId ?? null,
      proposalId: data.proposalId ?? null,
      status: data.status ?? JobStatus.SCHEDULED,
      scopeOfWork: data.scopeOfWork ?? null,
      notes: data.notes ?? null,
      startsAt: starts,
      endsAt: ends,
    },
  });

  if (starts) {
    await db.jobEvent.create({
      data: {
        organizationId,
        jobId: job.id,
        createdById: user.id,
        title: job.title,
        startsAt: starts,
        endsAt: ends ?? new Date(starts.getTime() + 1000 * 60 * 60 * 4),
        notes: data.notes ?? null,
      },
    });
    await db.activityEvent.create({
      data: {
        organizationId,
        actorId: user.id,
        proposalId: job.proposalId ?? null,
        clientId: job.clientId ?? null,
        kind: "SCHEDULED",
        summary: `Scheduled "${job.title}" — starts ${starts.toLocaleDateString()}`,
      },
    });
  }

  // Crew picked at creation. Only workers that belong to this org are attached
  // (guards a tampered payload); ids are de-duped before insert.
  if (effectiveWorkerIds.length) {
    const ids = Array.from(new Set(effectiveWorkerIds));
    const valid = await db.workerProfile.findMany({
      where: { organizationId, id: { in: ids } },
      select: { id: true, userId: true },
    });
    if (valid.length) {
      // Manager-invited crew starts PENDING (they accept via the worker portal);
      // an installer's own job needs no self-invite — it's ACCEPTED outright,
      // so it doesn't ping their own Jobs badge.
      await db.jobAssignment.createMany({
        data: valid.map((w) => ({
          jobId: job.id,
          workerId: w.id,
          ...(installer ? { status: "ACCEPTED" } : {}),
        })),
      });
      // Auto-create the job's group chat with the invited crew + the manager who
      // built it, so it shows up on the Messages page ready to use. Skipped when
      // the creator would be the only member (installer self-created job) — a
      // solo thread is just noise.
      const chatUserIds = Array.from(new Set([user.id, ...valid.map((w) => w.userId)]));
      if (chatUserIds.length > 1) {
        const { ensureJobConversation } = await import("@/lib/jobConversation");
        await ensureJobConversation({
          jobId: job.id,
          organizationId,
          title: job.title,
          userIds: chatUserIds,
        });
      }
    }
  }

  revalidatePath("/dashboard/jobs");
  revalidatePath("/dashboard/calendar");
  return { id: job.id };
}

export async function updateJob(id: string, raw: Partial<z.infer<typeof jobInput>>) {
  const { organizationId, user } = await requireManager();
  const existing = await db.job.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== organizationId) throw new Error("Not found");

  await db.job.update({
    where: { id },
    data: {
      title: raw.title ?? undefined,
      status: raw.status ?? undefined,
      notes: raw.notes === null ? null : raw.notes ?? undefined,
      startsAt:
        raw.startsAt === null ? null : raw.startsAt ? toDate(raw.startsAt) ?? undefined : undefined,
      endsAt:
        raw.endsAt === null ? null : raw.endsAt ? toDate(raw.endsAt) ?? undefined : undefined,
    },
  });

  // Auto-create review request when the job transitions to COMPLETED
  if (raw.status === "COMPLETED" && existing.status !== "COMPLETED") {
    try {
      const { createReviewRequestInternal } = await import("@/lib/reviewRequestInternal");
      await createReviewRequestInternal(id);
    } catch (err) {
      console.warn("[updateJob] review request failed:", err);
    }
    await db.activityEvent.create({
      data: {
        organizationId,
        actorId: user.id,
        proposalId: existing.proposalId ?? null,
        clientId: existing.clientId ?? null,
        kind: "COMPLETED",
        summary: `Completed "${existing.title}"`,
      },
    });
  }

  revalidatePath("/dashboard/jobs");
  revalidatePath(`/dashboard/jobs/${id}`);
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard/reviews");
}

export async function createJobFromProposal(proposalId: string) {
  const { organizationId, user } = await requireManager();
  const proposal = await db.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal || proposal.organizationId !== organizationId) throw new Error("Not found");

  // Avoid duplicate jobs for the same proposal
  const existing = await db.job.findFirst({
    where: { organizationId, proposalId: proposal.id },
  });
  if (existing) return { id: existing.id, created: false as const };

  // Creates a Job AND its auto-scheduled JobEvent — both quotas must clear.
  await enforcePlanLimit(organizationId, "jobs");
  await enforcePlanLimit(organizationId, "calendarEvents");

  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + 7);
  startsAt.setHours(9, 0, 0, 0);
  const endsAt = new Date(startsAt);
  endsAt.setHours(14, 0, 0, 0);

  const job = await db.job.create({
    data: {
      organizationId,
      title: proposal.title,
      clientId: proposal.clientId,
      proposalId: proposal.id,
      status: JobStatus.SCHEDULED,
      scopeOfWork: proposal.scopeOfWork ?? null,
      startsAt,
      endsAt,
    },
  });

  await db.jobEvent.create({
    data: {
      organizationId,
      jobId: job.id,
      title: proposal.title,
      startsAt,
      endsAt,
      notes: "Auto-scheduled from accepted proposal — reschedule as needed.",
    },
  });

  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      proposalId: proposal.id,
      clientId: proposal.clientId,
      kind: "SCHEDULED",
      summary: `Scheduled "${proposal.title}" — starts ${startsAt.toLocaleDateString()}`,
    },
  });

  revalidatePath("/dashboard/jobs");
  revalidatePath("/dashboard/calendar");
  return { id: job.id, created: true as const };
}

// (moved) createJobFromProposalInternal now lives in src/lib/jobFromProposal.ts
// — a plain server module, not a "use server" export — so it's no longer a
// POST-invokable action, and it derives the org from the proposal rather than a
// caller parameter.

// ── JobEvent (calendar-level) ────────────────────

const eventInput = z.object({
  title: z.string().min(1),
  jobId: z.string().optional().nullable(),
  // Scheduling a proposal with no job yet: the action gets-or-creates the Job
  // for it (so it appears in Jobs and under the proposal's client), then hangs
  // the event off that job. Mutually exclusive with jobId.
  proposalId: z.string().optional().nullable(),
  startsAt: z.union([z.string(), z.date()]),
  endsAt: z.union([z.string(), z.date()]),
  notes: z.string().optional().nullable(),
});

export async function createJobEvent(raw: unknown) {
  const { organizationId, role, user } = await requireJobEventCreator();
  await enforcePlanLimit(organizationId, "calendarEvents");
  const data = eventInput.parse(raw);
  const startsAt = toDate(data.startsAt)!;
  const endsAt = toDate(data.endsAt)!;

  // Installers: the job is now OPTIONAL (a jobless event is allowed — it renders
  // on their calendar via createdById below). If they DO link a job it must be
  // one they're assigned to. Proposal-to-job creation stays manager-only.
  const installer = isWorkerRole(role);
  if (installer && data.jobId) {
    const assigned = await db.jobAssignment.findFirst({
      where: { jobId: data.jobId, worker: { userId: user.id } },
      select: { id: true },
    });
    if (!assigned) throw new Error("You can only add events to jobs assigned to you");
  }

  let jobId = data.jobId ?? null;
  if (jobId) {
    const job = await db.job.findUnique({ where: { id: jobId } });
    if (!job || job.organizationId !== organizationId) throw new Error("Job not found");
  } else if (!installer && data.proposalId) {
    const proposal = await db.proposal.findUnique({ where: { id: data.proposalId } });
    if (!proposal || proposal.organizationId !== organizationId)
      throw new Error("Proposal not found");
    const existing = await db.job.findFirst({
      where: { organizationId, proposalId: proposal.id },
    });
    if (existing) {
      jobId = existing.id;
    } else {
      // This branch creates a NEW Job (not just the event) — check its quota too.
      await enforcePlanLimit(organizationId, "jobs");
      // Unlike createJobFromProposal (7-days-out default), the job schedule
      // mirrors the event the user is creating right now.
      const job = await db.job.create({
        data: {
          organizationId,
          title: proposal.title,
          clientId: proposal.clientId,
          proposalId: proposal.id,
          status: JobStatus.SCHEDULED,
          scopeOfWork: proposal.scopeOfWork ?? null,
          startsAt,
          endsAt,
        },
      });
      jobId = job.id;
    }
  }

  const ev = await db.jobEvent.create({
    data: {
      organizationId,
      createdById: user.id,
      title: data.title,
      jobId,
      startsAt,
      endsAt,
      notes: data.notes ?? null,
    },
  });
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard/jobs");
  if (jobId) revalidatePath(`/dashboard/jobs/${jobId}`);
  return { id: ev.id, jobId };
}

export async function rescheduleJobEvent(id: string, newStartISO: string) {
  const { organizationId } = await requireManager();
  const ev = await db.jobEvent.findUnique({ where: { id } });
  if (!ev || ev.organizationId !== organizationId) throw new Error("Not found");
  // Product rule: at the calendar cap, drag/drop moves are blocked too, even
  // though a move creates no new row.
  await enforcePlanLimit(organizationId, "calendarEvents");
  const newStart = new Date(newStartISO);
  // preserve event duration
  const duration = ev.endsAt.getTime() - ev.startsAt.getTime();
  // preserve time-of-day when dropping to a different date
  newStart.setHours(ev.startsAt.getHours(), ev.startsAt.getMinutes(), 0, 0);
  const newEnd = new Date(newStart.getTime() + duration);
  await db.jobEvent.update({
    where: { id },
    data: { startsAt: newStart, endsAt: newEnd },
  });
  revalidatePath("/dashboard/calendar");
  if (ev.jobId) revalidatePath(`/dashboard/jobs/${ev.jobId}`);
}

export async function deleteJobEvent(id: string) {
  const { organizationId } = await requireManager();
  const ev = await db.jobEvent.findUnique({ where: { id } });
  if (!ev || ev.organizationId !== organizationId) throw new Error("Not found");
  await db.jobEvent.delete({ where: { id } });
  revalidatePath("/dashboard/calendar");
  if (ev.jobId) revalidatePath(`/dashboard/jobs/${ev.jobId}`);
}

// Edit a job event's own fields (title / notes) from the calendar detail sheet.
// Time, worker assignment, and job status are handled by their own actions.
export async function updateJobEvent(
  id: string,
  data: { title?: string; notes?: string | null },
) {
  const { organizationId } = await requireManager();
  const ev = await db.jobEvent.findUnique({ where: { id } });
  if (!ev || ev.organizationId !== organizationId) throw new Error("Not found");
  await db.jobEvent.update({
    where: { id },
    data: {
      title: data.title?.trim() ? data.title.trim() : undefined,
      notes: data.notes === undefined ? undefined : data.notes,
    },
  });
  revalidatePath("/dashboard/calendar");
  if (ev.jobId) revalidatePath(`/dashboard/jobs/${ev.jobId}`);
}

// Reschedule with explicit start AND end times (in addition to the legacy
// preserve-duration variant above). Snaps to 15-minute granularity.
export async function rescheduleJobEventTime(
  id: string,
  newStartISO: string,
  newEndISO: string,
) {
  const { organizationId } = await requireManager();
  const ev = await db.jobEvent.findUnique({ where: { id } });
  if (!ev || ev.organizationId !== organizationId) throw new Error("Not found");
  // Product rule: at the calendar cap, time moves are blocked too (see
  // rescheduleJobEvent).
  await enforcePlanLimit(organizationId, "calendarEvents");
  const start = roundTo15(new Date(newStartISO));
  let end = roundTo15(new Date(newEndISO));
  // Enforce minimum 15-minute duration
  if (end.getTime() - start.getTime() < 15 * 60 * 1000) {
    end = new Date(start.getTime() + 15 * 60 * 1000);
  }
  await db.jobEvent.update({
    where: { id },
    data: { startsAt: start, endsAt: end },
  });
  revalidatePath("/dashboard/calendar");
  if (ev.jobId) revalidatePath(`/dashboard/jobs/${ev.jobId}`);
}

function roundTo15(d: Date): Date {
  const r = new Date(d);
  const m = r.getMinutes();
  const snapped = Math.round(m / 15) * 15;
  r.setMinutes(snapped, 0, 0);
  return r;
}

// Drag a job from the unscheduled tray onto a calendar date — creates a
// JobEvent at 9am-2pm by default, links it to the job.
export async function scheduleJobFromTray(jobId: string, dateISO: string) {
  const { organizationId, user } = await requireManager();
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job || job.organizationId !== organizationId) throw new Error("Not found");
  await enforcePlanLimit(organizationId, "calendarEvents");

  const day = new Date(dateISO);
  const startsAt = new Date(day);
  startsAt.setHours(9, 0, 0, 0);
  const endsAt = new Date(day);
  endsAt.setHours(14, 0, 0, 0);

  // Update the job's primary schedule too
  await db.job.update({
    where: { id: jobId },
    data: { startsAt, endsAt, status: job.status === "CANCELED" ? "SCHEDULED" : job.status },
  });

  const event = await db.jobEvent.create({
    data: {
      organizationId,
      jobId: job.id,
      title: job.title,
      startsAt,
      endsAt,
      notes: "Scheduled from dispatch tray.",
    },
  });

  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      proposalId: job.proposalId ?? null,
      clientId: job.clientId ?? null,
      kind: "SCHEDULED",
      summary: `Scheduled "${job.title}" for ${day.toLocaleDateString()}`,
    },
  });

  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard/jobs");
  revalidatePath(`/dashboard/jobs/${jobId}`);
  return { id: event.id };
}

// Assign all crew on the linked job to a target worker (or unassign if null).
// Used by the swimlane Team view drag-to-assign interaction.
export async function assignEventWorker(
  eventId: string,
  workerId: string | null,
  newDateISO?: string,
) {
  const { organizationId, user } = await requireManager();
  const ev = await db.jobEvent.findUnique({
    where: { id: eventId },
    include: { job: { include: { assignments: true } } },
  });
  if (!ev || ev.organizationId !== organizationId) throw new Error("Not found");

  // Optional date move (mirror of rescheduleJobEvent — preserves duration + time of day)
  if (newDateISO) {
    // Same product rule as rescheduleJobEvent: moves are blocked at the cap.
    await enforcePlanLimit(organizationId, "calendarEvents");
    const newStart = new Date(newDateISO);
    newStart.setHours(ev.startsAt.getHours(), ev.startsAt.getMinutes(), 0, 0);
    const duration = ev.endsAt.getTime() - ev.startsAt.getTime();
    const newEnd = new Date(newStart.getTime() + duration);
    await db.jobEvent.update({
      where: { id: eventId },
      data: { startsAt: newStart, endsAt: newEnd },
    });
  }

  // Manage JobAssignment rows on the linked job
  if (ev.jobId) {
    if (workerId === null) {
      // unassign all (Team view "Unassigned" row)
      await db.jobAssignment.deleteMany({ where: { jobId: ev.jobId } });
    } else {
      // The workerId is client-supplied — verify it belongs to THIS org before
      // attaching (mirrors createJob's tamper guard), or a manager could pin a
      // foreign org's worker to their job and leak the job to that worker's
      // portal.
      const validWorker = await db.workerProfile.findFirst({
        where: { id: workerId, organizationId },
        select: { id: true },
      });
      if (!validWorker) throw new Error("Not found");
      // ensure target worker is assigned (don't strip others)
      const exists = ev.job?.assignments.find((a) => a.workerId === workerId);
      if (!exists) {
        await db.jobAssignment.create({
          data: {
            jobId: ev.jobId,
            workerId,
            status: "PENDING",
          },
        });
      }
    }
  }

  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      kind: "UPDATED",
      summary:
        workerId === null
          ? `Unassigned event "${ev.title}"`
          : `Reassigned event "${ev.title}"`,
    },
  });

  revalidatePath("/dashboard/calendar");
  if (ev.jobId) revalidatePath(`/dashboard/jobs/${ev.jobId}`);
}
