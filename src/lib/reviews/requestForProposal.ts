// Plain server module (NOT "use server"). The proposal-side review trigger:
// a proposal that reaches COMPLETED gets exactly one review request and, when
// the client has an email, the "How did we do?" mail.
//
// Four doors mark a proposal complete — "Mark completed" on the dashboard,
// a manager finishing the linked job, crew finishing it from the job page, and
// crew finishing it from the token portal. All four call this. It is
// idempotent across every door: a request already hanging off this proposal,
// OR off any job of this proposal, is reused and NOT re-mailed.
//
// Quota: ALLOW-BUT-COUNT, like reviewRequestInternal.ts — finishing work never
// fails on the review-request cap; the row still counts toward usage.
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { sendReviewRequestEmail } from "./email";

export type EnsureReviewRequestResult = {
  id: string;
  publicToken: string;
  /** True only when this call created the row. */
  created: boolean;
  /** True when the first-ask email went out on this call. */
  emailed: boolean;
};

export async function ensureReviewRequestForProposal(
  proposalId: string,
  /** `actorId`: the member who finished the work; null when the client's own door did. */
  opts: { jobId?: string | null; actorId?: string | null } = {},
): Promise<EnsureReviewRequestResult | null> {
  const existing = await db.reviewRequest.findFirst({
    where: { OR: [{ proposalId }, { job: { proposalId } }] },
    orderBy: { createdAt: "asc" },
    select: { id: true, publicToken: true, proposalId: true, jobId: true },
  });
  if (existing) {
    // A job-created row predates the proposal link — stamp it so the
    // proposal-side readers (timeline, dedupe) find it directly next time.
    if (!existing.proposalId || (!existing.jobId && opts.jobId)) {
      await db.reviewRequest.update({
        where: { id: existing.id },
        data: {
          ...(existing.proposalId ? {} : { proposalId }),
          ...(existing.jobId || !opts.jobId ? {} : { jobId: opts.jobId }),
        },
      });
    }
    return { id: existing.id, publicToken: existing.publicToken, created: false, emailed: false };
  }

  const proposal = await db.proposal.findUnique({
    where: { id: proposalId },
    select: {
      id: true,
      organizationId: true,
      clientId: true,
      client: { select: { name: true, email: true } },
    },
  });
  if (!proposal) return null;

  const hasEmail = Boolean(proposal.client?.email?.trim());
  const row = await db.reviewRequest.create({
    data: {
      organizationId: proposal.organizationId,
      proposalId,
      jobId: opts.jobId ?? null,
      clientId: proposal.clientId,
      // 122-bit CSPRNG token instead of the structured cuid() default.
      publicToken: randomUUID(),
      // PENDING = the link exists but nobody was mailed; the reviews page
      // shows it with a copy button so the contractor can hand it over.
      status: hasEmail ? "SENT" : "PENDING",
      sentAt: hasEmail ? new Date() : null,
    },
  });

  let emailed = false;
  if (hasEmail) {
    try {
      emailed = await sendReviewRequestEmail(row.id, "request");
    } catch (err) {
      console.warn("[ensureReviewRequestForProposal] email failed:", err);
    }
  }

  const who = proposal.client?.name?.trim() || "the client";
  await db.activityEvent.create({
    data: {
      organizationId: proposal.organizationId,
      actorId: opts.actorId ?? null,
      proposalId,
      clientId: proposal.clientId ?? null,
      kind: "REVIEW_REQUESTED",
      summary: emailed
        ? `Review link sent to ${who}`
        : hasEmail
          ? `Review link ready for ${who} (email did not go out)`
          : `Review link ready — ${who} has no email on file`,
    },
  });

  revalidatePath("/dashboard/reviews");
  return { id: row.id, publicToken: row.publicToken, created: true, emailed };
}
