"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { JobStatus } from "@/lib/prismaEnums";

const jobInput = z.object({
  title: z.string().min(1),
  clientId: z.string().optional().nullable(),
  proposalId: z.string().optional().nullable(),
  status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELED"]).optional(),
  notes: z.string().optional().nullable(),
  startsAt: z.union([z.string(), z.date()]).optional().nullable(),
  endsAt: z.union([z.string(), z.date()]).optional().nullable(),
});

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  return v instanceof Date ? v : new Date(v);
}

export async function createJob(raw: unknown) {
  const { organizationId } = await requireOrg();
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
  }

  revalidatePath("/dashboard/jobs");
  revalidatePath("/dashboard/calendar");
  return { id: job.id };
}

export async function updateJob(id: string, raw: Partial<z.infer<typeof jobInput>>) {
  const { organizationId } = await requireOrg();
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
  }

  revalidatePath("/dashboard/jobs");
  revalidatePath(`/dashboard/jobs/${id}`);
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard/reviews");
}

export async function createJobFromProposal(proposalId: string) {
  const { organizationId } = await requireOrg();
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
      notes: proposal.scopeOfWork ?? null,
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
      proposalId: proposal.id,
      clientId: proposal.clientId,
      kind: "CREATED",
      summary: `Job created from accepted proposal "${proposal.title}"`,
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
      notes: proposal.scopeOfWork ?? null,
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
  startsAt: z.union([z.string(), z.date()]),
  endsAt: z.union([z.string(), z.date()]),
  notes: z.string().optional().nullable(),
});

export async function createJobEvent(raw: unknown) {
  const { organizationId } = await requireOrg();
  const data = eventInput.parse(raw);
  const ev = await db.jobEvent.create({
    data: {
      organizationId,
      title: data.title,
      jobId: data.jobId ?? null,
      startsAt: toDate(data.startsAt)!,
      endsAt: toDate(data.endsAt)!,
      notes: data.notes ?? null,
    },
  });
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard/jobs");
  if (data.jobId) revalidatePath(`/dashboard/jobs/${data.jobId}`);
  return { id: ev.id };
}

export async function rescheduleJobEvent(id: string, newStartISO: string) {
  const { organizationId } = await requireOrg();
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
  const { organizationId } = await requireOrg();
  const ev = await db.jobEvent.findUnique({ where: { id } });
  if (!ev || ev.organizationId !== organizationId) throw new Error("Not found");
  await db.jobEvent.delete({ where: { id } });
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
  const { organizationId } = await requireOrg();
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
  const { organizationId, user } = await requireOrg();
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
      kind: "UPDATED",
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
  const { organizationId, user } = await requireOrg();
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
