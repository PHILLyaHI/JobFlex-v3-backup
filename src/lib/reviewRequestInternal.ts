// Plain server module (NOT "use server"). Auto-creates a review request when a
// job is completed. The organization is DERIVED from the job, never taken from a
// caller-supplied parameter. Idempotent per job.
//
// A job that belongs to a proposal goes through
// src/lib/reviews/requestForProposal.ts instead (one request per proposal,
// whichever door finished the work); this module is the path for a job with
// no proposal behind it. Since 2026-09-13 it mails the client too — the
// request used to be created silently and sat on the reviews page unsent.
//
// Quota: intentionally ALLOW-BUT-COUNT — completing a job should never fail on
// the review-request cap; the row still counts toward usage. The manual send
// (src/actions/reviewRequests.ts) is the enforced path.
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { ensureReviewRequestForProposal } from "@/lib/reviews/requestForProposal";
import { sendReviewRequestEmail } from "@/lib/reviews/email";

export async function createReviewRequestInternal(jobId: string) {
  const existing = await db.reviewRequest.findFirst({ where: { jobId } });
  if (existing) return { id: existing.id };
  const job = await db.job.findUnique({ where: { id: jobId }, include: { client: true } });
  if (!job) return null;
  if (job.proposalId) {
    const viaProposal = await ensureReviewRequestForProposal(job.proposalId, { jobId });
    return viaProposal ? { id: viaProposal.id } : null;
  }
  const hasEmail = Boolean(job.client?.email?.trim());
  const req = await db.reviewRequest.create({
    data: {
      organizationId: job.organizationId,
      publicToken: randomUUID(),
      jobId,
      clientId: job.clientId,
      status: hasEmail ? "SENT" : "PENDING",
      sentAt: hasEmail ? new Date() : null,
    },
  });
  if (hasEmail) {
    try {
      await sendReviewRequestEmail(req.id, "request");
    } catch (err) {
      console.warn("[createReviewRequestInternal] email failed:", err);
    }
  }
  return { id: req.id };
}
