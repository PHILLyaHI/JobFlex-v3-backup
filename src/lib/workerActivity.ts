// Records that a worker was genuinely active in their portal, so an idle token
// can be auto-revoked after 6 MONTHS of inactivity (handled by the daily cron in
// the schema step). This is the single helper every "worker did something" point
// will call.
//
// ⚠️ WorkerProfile.lastSeenAt does NOT exist yet — it is added in the next
// (schema) step. Until then this is a deliberate NO-OP: it must not run a Prisma
// query that references a missing column, which would break the generated types
// and the build. Do NOT enable the write until the field exists.
//
// TODO(worker-inactivity · schema step): after adding `lastSeenAt DateTime?` to
// WorkerProfile, (1) enable the update below, and (2) wire a call to this helper
// into every point where a worker is really active — added all at once, on
// purpose, in that step:
//   1. src/app/(worker-portal)/w/[token]/layout.tsx          — worker opened the portal
//   2. src/app/api/worker/assignment/[assignmentId]/route.ts — accepted/declined a job
//   3. src/app/api/worker/job/[jobId]/status/route.ts        — updated a job's status
//   4. src/app/api/worker/receipt/route.ts                   — uploaded a receipt
//   5. src/app/api/worker/upload/route.ts                    — uploaded a photo
// Throttling the write to ~once/day per worker is optional (avoids a DB write on
// every single request) and can be decided then.
export async function touchWorkerActivity(_workerId: string): Promise<void> {
  // Intentional no-op until WorkerProfile.lastSeenAt exists (schema step).
  // Enable then (and add: import { db } from "@/lib/db"):
  //
  //   await db.workerProfile.update({
  //     where: { id: workerId },
  //     data: { lastSeenAt: new Date() },
  //   });
  return;
}
