// THE CREW ON SITE (2026-09-27) — server. One rule behind both doors.
//
// The worker portal's status route and the dashboard's setJobProgress used
// to each move the job and write their own trail row; neither told the
// office. Now both call `recordJobProgress`: it moves the status, writes the
// STARTED / COMPLETED row the bell and the job trail read (with the day
// number), promotes the proposal and sends the review request on
// completion, and — after the response — texts the owner and the manager.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { afterResponse } from "@/lib/server-events";
import { nextDay, progressSummary, type ProgressWhat } from "@/lib/jobProgressShared";

export type ProgressResult =
  | { ok: true; status: string; day: number; what: ProgressWhat }
  | { ok: false; error: string; code: "not-found" | "closed" | "not-started" | "already-today" };

export interface ProgressActor {
  userId: string;
  /** The name the trail and the text use. */
  name: string;
}

async function tzOf(organizationId: string): Promise<string> {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } });
  return org?.timezone || "America/New_York";
}

/** The STARTED rows of a job, for the day count. */
async function startRows(organizationId: string, jobId: string) {
  return db.activityEvent.findMany({
    where: { organizationId, kind: "STARTED", meta: { contains: `"jobId":"${jobId}"` } },
    select: { kind: true, createdAt: true, meta: true },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
}

/** Where a job stands for the crew's buttons: the day number, whether
 *  today has a start, how many days so far. */
export async function jobProgressInfo(organizationId: string, jobId: string): Promise<{ day: number; startedToday: boolean; daysSoFar: number }> {
  try {
    const [tz, rows] = await Promise.all([tzOf(organizationId), startRows(organizationId, jobId)]);
    return nextDay(rows, tz);
  } catch {
    return { day: 1, startedToday: false, daysSoFar: 0 };
  }
}

export async function recordJobProgress(input: {
  organizationId: string;
  jobId: string;
  actor: ProgressActor;
  what: ProgressWhat;
  via: "worker-portal" | "dashboard";
}): Promise<ProgressResult> {
  const { organizationId, jobId, actor, what, via } = input;
  const job = await db.job.findFirst({
    where: { id: jobId, organizationId },
    select: { id: true, title: true, status: true, proposalId: true, clientId: true },
  });
  if (!job) return { ok: false, error: "Job not found.", code: "not-found" };
  if (job.status === "CANCELED" || job.status === "COMPLETED") return { ok: false, error: "This job is closed.", code: "closed" };
  if (what === "continued" && job.status !== "IN_PROGRESS") return { ok: false, error: "Start the job first.", code: "not-started" };

  const [tz, rows] = await Promise.all([tzOf(organizationId), startRows(organizationId, jobId)]);
  const info = nextDay(rows, tz);
  if (what === "continued" && info.startedToday) return { ok: false, error: "Today is already on the clock.", code: "already-today" };
  // A Start on a job that is already in progress on a new day counts as a day back.
  const effective: ProgressWhat = what === "started" && job.status === "IN_PROGRESS" && !info.startedToday && info.daysSoFar > 0 ? "continued" : what;
  const day = effective === "completed" ? Math.max(1, info.daysSoFar) : info.day;
  const nextStatus = effective === "completed" ? "COMPLETED" : "IN_PROGRESS";

  if (job.status !== nextStatus) await db.job.update({ where: { id: jobId }, data: { status: nextStatus } });
  if (effective === "completed") {
    // Same finish-line side effects as updateJob: the ACCEPTED proposal reads
    // COMPLETED, the review request goes out.
    if (job.proposalId) {
      await db.proposal.updateMany({ where: { id: job.proposalId, organizationId, status: "ACCEPTED" }, data: { status: "COMPLETED" } });
    }
    try {
      const { createReviewRequestInternal } = await import("@/lib/reviewRequestInternal");
      await createReviewRequestInternal(jobId, actor.userId);
    } catch (err) {
      console.warn("[jobProgress] review request failed:", err);
    }
  }
  // One row the bell, the overview and the job trail all read: STARTED for a
  // start and for a day back (the day number in meta), COMPLETED at the end.
  // (A start that repeats on the same day writes no second row.)
  const skipRow = effective === "started" && info.startedToday;
  if (!skipRow) {
    await db.activityEvent.create({
      data: {
        organizationId,
        actorId: actor.userId,
        proposalId: job.proposalId,
        clientId: job.clientId,
        kind: effective === "completed" ? "COMPLETED" : "STARTED",
        summary: progressSummary(actor.name, job.title, effective, day),
        meta: JSON.stringify({ jobId, status: nextStatus, day, continued: effective === "continued", via }),
      },
    });
  }
  try {
    revalidatePath(`/dashboard/jobs/${jobId}`);
    revalidatePath("/dashboard/jobs");
    // The calendar's chips carry the status; the old action refreshed it too.
    revalidatePath("/dashboard/calendar");
    if (effective === "completed") {
      revalidatePath("/dashboard/proposals");
      revalidatePath("/dashboard/reviews");
    }
  } catch {
    /* outside a request */
  }
  // The owner and the manager hear about it — after the response, never on it.
  if (!skipRow) {
    afterResponse(async () => {
      const { notifyJobProgress } = await import("@/lib/notify");
      await notifyJobProgress(jobId, actor, effective, day);
    });
  }
  return { ok: true, status: nextStatus, day, what: effective };
}
