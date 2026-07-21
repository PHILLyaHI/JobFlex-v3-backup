"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { enforcePlanLimit } from "@/lib/limitsEngine";

export async function createReviewRequest(jobId: string) {
  const { organizationId } = await requireManager();
  const job = await db.job.findUnique({ where: { id: jobId }, include: { client: true } });
  if (!job || job.organizationId !== organizationId) throw new Error("Not found");

  // Idempotent per job
  const existing = await db.reviewRequest.findFirst({ where: { jobId } });
  if (existing) return { id: existing.id, publicToken: existing.publicToken };

  // Manual send — gated. The automatic job-completion ask
  // (src/lib/reviewRequestInternal.ts) stays allow-but-count.
  await enforcePlanLimit(organizationId, "reviewRequests");

  const req = await db.reviewRequest.create({
    data: {
      organizationId,
      jobId,
      clientId: job.clientId,
      status: "SENT",
      sentAt: new Date(),
    },
  });

  // Best-effort email
  try {
    if (job.client?.email) {
      const { sendEmail } = await import("@/lib/sdk/resend");
      const { wrapEmail } = await import("@/lib/email/render");
      const org = await db.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      });
      const appUrl = await appBaseUrl();
      const wrapped = wrapEmail({
        subject: `How did we do? — ${org?.name ?? "JobFlex"}`,
        body: `Hi ${job.client.name},

Thanks for letting us work on "${job.title}". We'd love a quick review — it takes 30 seconds:

${appUrl}/review/${req.publicToken}

— ${org?.name ?? "Your team"}`,
        orgName: org?.name ?? "JobFlex",
      });
      await sendEmail({
        to: job.client.email,
        subject: wrapped.subject,
        html: wrapped.html,
      });
    }
  } catch (err) {
    console.warn("[createReviewRequest] email failed:", err);
  }

  revalidatePath("/dashboard/reviews");
  return { id: req.id, publicToken: req.publicToken };
}

// (moved) createReviewRequestInternal now lives in src/lib/reviewRequestInternal.ts
// — a plain server module (not a "use server" export) that derives the org from
// the job rather than a caller parameter.

const submitInput = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable().optional(),
});

export async function submitReviewPublic(token: string, raw: unknown) {
  const data = submitInput.parse(raw);
  const rr = await db.reviewRequest.findUnique({ where: { publicToken: token } });
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
      comment: data.comment ?? null,
      completedAt: new Date(),
    },
  });
  await db.activityEvent.create({
    data: {
      organizationId: rr.organizationId,
      kind: "NOTE",
      summary: `Client submitted a ${data.rating}-star review`,
    },
  });
  revalidatePath("/dashboard/reviews");
  return { ok: true };
}
