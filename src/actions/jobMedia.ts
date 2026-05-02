"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { isBlobEnabled, uploadBlob } from "@/lib/sdk/blob";

const expenseInput = z.object({
  category: z.string().min(1),
  amount: z.number().positive(),
  note: z.string().optional().nullable(),
});

export async function addJobExpense(jobId: string, raw: unknown) {
  const { organizationId } = await requireOrg();
  const data = expenseInput.parse(raw);
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job || job.organizationId !== organizationId) throw new Error("Not found");
  await db.jobExpense.create({
    data: {
      jobId,
      category: data.category,
      amount: data.amount,
      note: data.note ?? null,
    },
  });
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function deleteJobExpense(expenseId: string) {
  const { organizationId } = await requireOrg();
  const ex = await db.jobExpense.findUnique({
    where: { id: expenseId },
    include: { job: true },
  });
  if (!ex || ex.job.organizationId !== organizationId) throw new Error("Not found");
  await db.jobExpense.delete({ where: { id: expenseId } });
  revalidatePath(`/dashboard/jobs/${ex.jobId}`);
}

export async function postJobMessage(jobId: string, body: string) {
  const { organizationId, user } = await requireOrg();
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job || job.organizationId !== organizationId) throw new Error("Not found");
  await db.jobMessage.create({
    data: {
      jobId,
      authorId: user.id,
      body,
    },
  });
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

const photoInput = z.object({
  url: z.string().url(),
  kind: z.enum(["BEFORE", "PROGRESS", "AFTER"]).default("BEFORE"),
  caption: z.string().optional().nullable(),
});

export async function createJobPhoto(jobId: string, raw: unknown) {
  const { organizationId } = await requireOrg();
  const data = photoInput.parse(raw);
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job || job.organizationId !== organizationId) throw new Error("Not found");
  await db.jobPhoto.create({
    data: {
      jobId,
      url: data.url,
      kind: data.kind,
      caption: data.caption ?? null,
    },
  });
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function deleteJobPhoto(photoId: string) {
  const { organizationId } = await requireOrg();
  const p = await db.jobPhoto.findUnique({
    where: { id: photoId },
    include: { job: true },
  });
  if (!p || p.job.organizationId !== organizationId) throw new Error("Not found");
  await db.jobPhoto.delete({ where: { id: photoId } });
  revalidatePath(`/dashboard/jobs/${p.jobId}`);
}

/**
 * uploadJobPhoto — called from the client with a data URL (base64).
 * If Vercel Blob is configured, push to Blob; otherwise persist the data URL inline
 * so the demo keeps working with zero external dependencies.
 */
export async function uploadJobPhoto(
  jobId: string,
  dataUrl: string,
  filename: string,
  kind: "BEFORE" | "PROGRESS" | "AFTER" = "BEFORE",
) {
  const { organizationId } = await requireOrg();
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job || job.organizationId !== organizationId) throw new Error("Not found");

  let url = dataUrl;
  if (isBlobEnabled()) {
    try {
      const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
      if (match) {
        const buf = Buffer.from(match[2], "base64");
        const res = await uploadBlob(`jobs/${jobId}/${Date.now()}-${filename}`, buf);
        url = res.url;
      }
    } catch {
      // fall through to data URL
    }
  }

  const photo = await db.jobPhoto.create({
    data: { jobId, url, kind },
  });
  revalidatePath(`/dashboard/jobs/${jobId}`);
  return { id: photo.id, url };
}
