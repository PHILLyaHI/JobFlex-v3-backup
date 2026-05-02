"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";

export async function createReviewRequest(jobId: string) {
  const { organizationId } = await requireOrg();
  const job = await db.job.findUnique({ where: { id: jobId }, include: { client: true } });
  if (!job || job.organizationId !== organizationId) throw new Error("Not found");

  // Idempotent per job
  const existing = await db.reviewRequest.findFirst({ where: { jobId } });
  if (existing) return { id: existing.id, publicToken: existing.publicToken };

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
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
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

// Internal variant (no auth) — used when auto-triggered from inside another server action
export async function createReviewRequestInternal(jobId: string, organizationId: string) {
  const existing = await db.reviewRequest.findFirst({ where: { jobId } });
  if (existing) return { id: existing.id };
  const job = await db.job.findUnique({ where: { id: jobId }, include: { client: true } });
  if (!job || job.organizationId !== organizationId) return null;
  const req = await db.reviewRequest.create({
    data: {
      organizationId,
      jobId,
      clientId: job.clientId,
      status: "SENT",
      sentAt: new Date(),
    },
  });
  return { id: req.id };
}

const submitInput = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable().optional(),
});

export async function submitReviewPublic(token: string, raw: unknown) {
  const data = submitInput.parse(raw);
  const rr = await db.reviewRequest.findUnique({ where: { publicToken: token } });
  if (!rr) throw new Error("Not found");
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
