"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isLimitedRole, requireManager, requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { isBlobEnabled, uploadBlob } from "@/lib/sdk/blob";
import { enforcePlanLimit } from "@/lib/limitsEngine";
import { IMAGE_DATA_URL, safeFilename } from "@/lib/safeHref";

const expenseInput = z.object({
  category: z.string().min(1),
  amount: z.number().positive(),
  note: z.string().optional().nullable(),
});

export async function addJobExpense(jobId: string, raw: unknown) {
  const { organizationId } = await requireManager();
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
  const { organizationId } = await requireManager();
  const ex = await db.jobExpense.findUnique({
    where: { id: expenseId },
    include: { job: true },
  });
  if (!ex || ex.job.organizationId !== organizationId) throw new Error("Not found");
  await db.jobExpense.delete({ where: { id: expenseId } });
  revalidatePath(`/dashboard/jobs/${ex.jobId}`);
}

/**
 * Find (or lazily create) the single Conversation that backs a job's message
 * thread. Job threads are real Conversations with `jobId` set, so they appear on
 * /dashboard/messages alongside every other thread, with resolved author names.
 */
async function getOrCreateJobConversation(job: {
  id: string;
  organizationId: string;
  title: string;
}) {
  const existing = await db.conversation.findUnique({ where: { jobId: job.id } });
  if (existing) return existing;
  // JOB kind (like ensureJobConversation): auto job threads are a side effect
  // of the job, not a user-started conversation, so they don't consume the
  // conversationsStarted quota.
  return db.conversation.create({
    data: { organizationId: job.organizationId, jobId: job.id, kind: "JOB", title: job.title },
  });
}

export async function postJobMessage(jobId: string, body: string) {
  const { organizationId, user } = await requireManager();
  const trimmed = body.trim();
  if (!trimmed) return;
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job || job.organizationId !== organizationId) throw new Error("Not found");
  await enforcePlanLimit(organizationId, "messagesSent");

  const conversation = await getOrCreateJobConversation(job);
  await db.message.create({
    data: { conversationId: conversation.id, authorId: user.id, body: trimmed },
  });
  revalidatePath(`/dashboard/jobs/${jobId}`);
  revalidatePath("/dashboard/messages");
}

const photoInput = z.object({
  url: z.string().url(),
  kind: z.enum(["BEFORE", "PROGRESS", "AFTER"]).default("BEFORE"),
  caption: z.string().optional().nullable(),
});

// Photo writes are OPEN TO THE CREW (2026-08-21, owner request): a manager may
// photograph any org job, a limited role (installer/sales/estimator) only a
// job they are assigned to. Everything else in this file stays manager-only —
// expenses and deletes are office work.
async function requireJobPhotoAccess(jobId: string) {
  const { organizationId, user, role } = await requireOrg();
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job || job.organizationId !== organizationId) throw new Error("Not found");
  if (isLimitedRole(role)) {
    const assigned = await db.jobAssignment.findFirst({
      where: { jobId, worker: { userId: user.id } },
      select: { id: true },
    });
    if (!assigned) throw new Error("You can only add photos to jobs assigned to you");
  }
  return { organizationId };
}

export async function createJobPhoto(jobId: string, raw: unknown) {
  await requireJobPhotoAccess(jobId);
  const data = photoInput.parse(raw);
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
  const { organizationId } = await requireManager();
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
  await requireJobPhotoAccess(jobId);

  // Inline image only — anything else would be stored verbatim as the photo
  // URL and rendered by every viewer of the job.
  const match = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match || !IMAGE_DATA_URL.test(dataUrl)) throw new Error("Photo must be an image");

  let url = dataUrl;
  if (isBlobEnabled()) {
    const buf = Buffer.from(match[2], "base64");
    const res = await uploadBlob(
      `jobs/${jobId}/${Date.now()}-${safeFilename(filename, "photo")}`,
      buf,
      { contentType: match[1].toLowerCase() },
    );
    url = res.url;
  }

  const photo = await db.jobPhoto.create({
    data: { jobId, url, kind },
  });
  revalidatePath(`/dashboard/jobs/${jobId}`);
  return { id: photo.id, url };
}
