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
  const { organizationId, user } = await requireManager();
  await enforcePlanLimit(organizationId, "jobs");
  const data = jobInput.parse(raw);
  const starts = toDate(data.startsAt);
  const ends = toDate(data.endsAt);

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
  if (data.workerIds && data.workerIds.length) {
    const ids = Array.from(new Set(data.workerIds));
    const valid = await db.workerProfile.findMany({
      where: { organizationId, id: { in: ids } },
      select: { id: true, userId: true },
    });
    if (valid.length) {
      await db.jobAssignment.createMany({
        data: valid.map((w) => ({ jobId: job.id, workerId: w.id })),
      });
      // Auto-create the job's group chat with the invited crew + the manager who
      // built it, so it shows up on the Messages page ready to use.
      const { ensureJobConversation } = await import("@/lib/jobConversation");
      await ensureJobConversation({
        jobId: job.id,
        organizationId,
        title: job.title,
        userIds: [user.id, ...valid.map((w) => w.userId)],
      });
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
      const { createReviewRequestInternal } = await import("./reviewRequests");
      await createReviewRequestInternal(id, organizationId);
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

export async function createJobFromProposalInternal(proposalId: string, organizationId: string) {
  // Same as createJobFromProposal but called from contexts without a user session (e.g., public portal)
  const existing = await db.job.findFirst({
    where: { organizationId, proposalId },
  });
  if (existing) return { id: existing.id, created: false as const };

  const proposal = await db.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal || proposal.organizationId !== organizationId) throw new Error("Not found");

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
      notes: "Auto-scheduled from accepted proposal.",
    },
  });

  return { id: job.id, created: true as const };
}

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

  // Installers may only add an event to a job they're assigned to — never a
  // bare event or a proposal-to-job creation (those stay manager-only).
  const installer = isWorkerRole(role);
  if (installer) {
    if (!data.jobId) throw new Error("Pick one of your jobs for this event");
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
