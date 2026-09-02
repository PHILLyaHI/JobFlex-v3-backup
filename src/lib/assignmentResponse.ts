// Everything a crew member's ANSWER to a job assignment means beyond the row
// itself (2026-08-22, owner request). Plain server module — called only from
// already-guarded server actions and the token-gated worker route, the same
// contract as notify.ts. Three doors write assignment answers (the session
// action respondToAssignment, the token portal's POST, and the manager's
// manual "Mark accepted"), and before this module each door carried a
// different subset of the consequences.
//
// The consequences, in order:
//   1. JOB STATUS follows the crew's answer — an accept puts (or puts back)
//      the job on the schedule; a decline with nobody else still on the job
//      CANCELS it. A job someone is already mid-way through (IN_PROGRESS /
//      COMPLETED) is never touched.
//   2. The office BELL hears it (ActivityEvent — the manager feed).
//   3. The office EMAIL hears it (owner + the assigning manager, notify.ts).
import { db } from "@/lib/db";

export async function applyAssignmentResponse(opts: {
  assignmentId: string;
  response: "ACCEPTED" | "DECLINED";
  organizationId: string;
  /** Who answered (or recorded the answer): session user id, or the worker's
   *  own user id on the token path. Null only if truly unknown. */
  actorUserId: string | null;
  workerDisplayName: string;
  job: { id: string; title: string; status: string };
}): Promise<{ jobStatusNow: string | null }> {
  const { assignmentId, response, organizationId, actorUserId, workerDisplayName, job } = opts;

  // 1 ── job transition. Runs AFTER the assignment row was updated, so the
  // remaining-crew count naturally excludes a fresh decline.
  let jobStatusNow: string | null = null;
  if (response === "ACCEPTED") {
    if (job.status === "CANCELED") {
      // Everyone had declined and the job fell off the schedule; this accept
      // revives it.
      await db.job.update({ where: { id: job.id }, data: { status: "SCHEDULED" } });
      jobStatusNow = "Scheduled";
    } else if (job.status === "SCHEDULED") {
      jobStatusNow = "Scheduled";
    }
  } else {
    const remaining = await db.jobAssignment.count({
      where: { jobId: job.id, status: { in: ["PENDING", "ACCEPTED"] } },
    });
    if (remaining === 0 && job.status === "SCHEDULED") {
      await db.job.update({ where: { id: job.id }, data: { status: "CANCELED" } });
      jobStatusNow = "Canceled";
    }
  }

  // 2 ── the bell (manager feed reads ActivityEvent).
  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: actorUserId,
      kind: response === "ACCEPTED" ? "ACCEPTED" : "DECLINED",
      summary:
        response === "ACCEPTED"
          ? `${workerDisplayName} accepted "${job.title}"`
          : `${workerDisplayName} declined "${job.title}"` +
            (jobStatusNow === "Canceled" ? " — job canceled, needs crew" : ""),
      meta: JSON.stringify({ assignmentId, jobId: job.id, response }),
    },
  });

  // 3 ── the email. Best-effort: a dead SMTP must not fail the answer.
  try {
    const { notifyAssignmentResponded } = await import("@/lib/notify");
    await notifyAssignmentResponded(assignmentId, response, jobStatusNow);
  } catch (err) {
    console.warn("[assignmentResponse] office email failed:", err);
  }

  return { jobStatusNow };
}
