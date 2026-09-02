"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";

export async function createReviewRequest(jobId: string) {
  const { organizationId } = await requireManager();
  const job = await db.job.findUnique({ where: { id: jobId }, include: { client: true } });
  if (!job || job.organizationId !== organizationId) throw new Error("Not found");

  // Idempotent per job
  const existing = await db.reviewRequest.findFirst({ where: { jobId } });
  if (existing) return { id: existing.id, publicToken: existing.publicToken };

  const req = await db.reviewRequest.create({
    data: {
      organizationId,
      // 122-bit CSPRNG token instead of the structured cuid() default.
      publicToken: randomUUID(),
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
      const { renderEmail } = await import("@/lib/email/renderEmail");
      const { buildReviewRequest } = await import("@/lib/email/build/client");
      const org = await db.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, logoUrl: true, phone: true },
      });
      const appUrl = await appBaseUrl();
      const { subject, html } = renderEmail(
        buildReviewRequest({
          org: { name: org?.name ?? "JobFlex", logoUrl: org?.logoUrl, phone: org?.phone },
          clientName: job.client.name,
          jobTitle: job.title,
          href: `${appUrl}/review/${req.publicToken}`,
        }),
      );
      await sendEmail({
        to: job.client.email,
        subject,
        html,
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
