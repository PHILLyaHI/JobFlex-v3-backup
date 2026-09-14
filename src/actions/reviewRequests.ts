"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { enforcePlanLimit } from "@/lib/limitsEngine";
import { sendReviewRequestEmail } from "@/lib/reviews/email";
import { publicReviewsPath } from "@/lib/reviews/publicSummary";

/** The manual "Send request" button on the reviews page. */
export async function createReviewRequest(jobId: string) {
  const { organizationId } = await requireManager();
  const job = await db.job.findUnique({ where: { id: jobId }, include: { client: true } });
  if (!job || job.organizationId !== organizationId) throw new Error("Not found");

  // Idempotent per job — and per proposal when the job has one, since a
  // proposal completed by hand already owns the request its jobs would share.
  const existing = await db.reviewRequest.findFirst({
    where: job.proposalId ? { OR: [{ jobId }, { proposalId: job.proposalId }] } : { jobId },
  });
  if (existing) return { id: existing.id, publicToken: existing.publicToken };

  // Per-cycle cap from the plan; a re-send of an existing request (above)
  // costs nothing.
  await enforcePlanLimit(organizationId, "reviewRequests");

  const hasEmail = Boolean(job.client?.email?.trim());
  const req = await db.reviewRequest.create({
    data: {
      organizationId,
      // 122-bit CSPRNG token instead of the structured cuid() default.
      publicToken: randomUUID(),
      jobId,
      proposalId: job.proposalId,
      clientId: job.clientId,
      status: hasEmail ? "SENT" : "PENDING",
      sentAt: hasEmail ? new Date() : null,
    },
  });

  // Best-effort email — the row and its copyable link exist either way.
  if (hasEmail) {
    try {
      await sendReviewRequestEmail(req.id, "request");
    } catch (err) {
      console.warn("[createReviewRequest] email failed:", err);
    }
  }

  revalidatePath("/dashboard/reviews");
  return { id: req.id, publicToken: req.publicToken };
}

// (moved) createReviewRequestInternal now lives in src/lib/reviewRequestInternal.ts
// — a plain server module (not a "use server" export) that derives the org from
// the job rather than a caller parameter.

const submitInput = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).nullable().optional(),
});

export async function submitReviewPublic(token: string, raw: unknown) {
  const data = submitInput.parse(raw);
  const rr = await db.reviewRequest.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      status: true,
      organizationId: true,
      proposalId: true,
      clientId: true,
      organization: { select: { slug: true } },
    },
  });
  if (!rr) throw new Error("Not found");
  // Idempotency: a review token may be submitted only once. If it's already
  // completed, acknowledge politely and do NOT overwrite the stored review or
  // log another activity event. This blocks replay/overwrite via direct API
  // calls that bypass the one-time UI form.
  if (rr.status === "COMPLETED") {
    return {
      ok: true as const,
      alreadySubmitted: true as const,
      message: "This review has already been submitted. Thank you!",
    };
  }
  await db.reviewRequest.update({
    where: { id: rr.id },
    data: {
      status: "COMPLETED",
      rating: data.rating,
      comment: data.comment?.trim() ? data.comment.trim() : null,
      completedAt: new Date(),
    },
  });
  await db.activityEvent.create({
    data: {
      organizationId: rr.organizationId,
      proposalId: rr.proposalId,
      clientId: rr.clientId,
      kind: "REVIEW",
      summary: `Client submitted a ${data.rating}-star review`,
    },
  });
  revalidatePath("/dashboard/reviews");
  revalidatePath(publicReviewsPath(rr.organization.slug));
  return { ok: true };
}

/**
 * Hide a review from (or show it again on) the public /r/[slug] page and the
 * portal badge. It stays on the dashboard, in the dashboard average and in
 * Lead Center routing — hiding is presentation, not deletion.
 */
export async function setReviewHidden(id: string, hidden: boolean) {
  const { organizationId } = await requireManager();
  const rr = await db.reviewRequest.findFirst({
    where: { id, organizationId },
    select: { id: true, hiddenAt: true, organization: { select: { slug: true } } },
  });
  if (!rr) throw new Error("Not found");
  if (Boolean(rr.hiddenAt) !== hidden) {
    await db.reviewRequest.update({ where: { id }, data: { hiddenAt: hidden ? new Date() : null } });
  }
  revalidatePath("/dashboard/reviews");
  revalidatePath(publicReviewsPath(rr.organization.slug));
  return { ok: true as const, hidden };
}
