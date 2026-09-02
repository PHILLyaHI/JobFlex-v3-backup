// Plain server module (NOT "use server"). Auto-creates a review request when a
// job is completed. The organization is DERIVED from the job, never taken from a
// caller-supplied parameter. Idempotent per job.
//
// Quota: intentionally ALLOW-BUT-COUNT — completing a job should never fail on
// the review-request cap; the row still counts toward usage. The manual send
// (src/actions/reviewRequests.ts) is the enforced path.
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

export async function createReviewRequestInternal(jobId: string) {
  const existing = await db.reviewRequest.findFirst({ where: { jobId } });
  if (existing) return { id: existing.id };
  const job = await db.job.findUnique({ where: { id: jobId }, include: { client: true } });
  if (!job) return null;
  const req = await db.reviewRequest.create({
    data: {
      organizationId: job.organizationId,
      publicToken: randomUUID(),
      jobId,
      clientId: job.clientId,
      status: "SENT",
      sentAt: new Date(),
    },
  });
  return { id: req.id };
}
