// Records that a worker was genuinely active in their portal, so an idle token
// can be auto-revoked after 6 MONTHS of inactivity (see the daily cron at
// src/app/api/cron/daily-cleanup). This is the single helper every "worker did
// something" point calls. Wired into:
//   1. src/app/(worker-portal)/w/[token]/layout.tsx          — opened the portal
//   2. src/app/api/worker/assignment/[assignmentId]/route.ts — accepted/declined a job
//   3. src/app/api/worker/job/[jobId]/status/route.ts        — updated a job's status
//   4. src/app/api/worker/receipt/route.ts                   — uploaded a receipt
//   5. src/app/api/worker/upload/route.ts                    — uploaded a photo
import { db } from "@/lib/db";

/**
 * Stamp WorkerProfile.lastSeenAt = now(). Deliberately "silent": any failure is
 * swallowed so an activity-stamp problem can never break the worker's actual
 * action. Lightweight — a single indexed update by id.
 */
export async function touchWorkerActivity(workerId: string): Promise<void> {
  try {
    await db.workerProfile.update({
      where: { id: workerId },
      data: { lastSeenAt: new Date() },
    });
  } catch {
    // Non-fatal — the worker's main action already succeeded.
  }
}
