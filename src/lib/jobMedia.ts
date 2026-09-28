// PHOTOS AND VIDEOS OF THE WORK (2026-09-27) — server. Both doors, one record.
//
// A file reaches a job through the worker portal (a token) or the dashboard
// (a session). `authorizeJobMedia` answers "may this caller add to this job"
// for either; `recordJobMedia` writes the row, the trail and — after the
// response — the office's text and bell note. The file itself either came
// straight from the phone to the store (api/jobs/media/token) or, without a
// store, as a data URL (the older routes), which these helpers do not care
// about: they take a URL.

import { db } from "@/lib/db";
import { afterResponse } from "@/lib/server-events";
import { logActivity, TRAIL_KINDS } from "@/lib/activityLog";
import { isLimitedRole, requireOrg } from "@/lib/orgContext";
import { mediaMetaJson, type MediaKind, type MediaMeta } from "@/lib/jobMediaShared";

export interface MediaCaller {
  organizationId: string;
  userId: string;
  workerId: string | null;
  name: string;
  job: { id: string; title: string; proposalId: string | null; clientId: string | null };
}

/**
 * Who is adding to this job. A worker token names a worker profile, which
 * must hold a live assignment; a session names a member — a manager may add
 * to any job of the company, a limited role only to a job they are on.
 */
export async function authorizeJobMedia(jobId: string, token: string | null | undefined): Promise<MediaCaller | null> {
  if (token) {
    const worker = await db.workerProfile.findUnique({ where: { token }, select: { id: true, userId: true, organizationId: true, displayName: true } });
    if (!worker) return null;
    const assigned = await db.jobAssignment.findFirst({
      where: { jobId, workerId: worker.id, job: { organizationId: worker.organizationId }, status: { not: "DECLINED" } },
      select: { job: { select: { id: true, title: true, proposalId: true, clientId: true } } },
    });
    if (!assigned) return null;
    return { organizationId: worker.organizationId, userId: worker.userId, workerId: worker.id, name: worker.displayName, job: assigned.job };
  }
  let ctx: { organizationId: string; user: { id: string; name?: string | null; email?: string | null }; role: string };
  try {
    ctx = (await requireOrg()) as typeof ctx;
  } catch {
    return null;
  }
  const job = await db.job.findFirst({ where: { id: jobId, organizationId: ctx.organizationId }, select: { id: true, title: true, proposalId: true, clientId: true } });
  if (!job) return null;
  const wp = await db.workerProfile.findUnique({ where: { userId: ctx.user.id }, select: { id: true, displayName: true } });
  if (isLimitedRole(ctx.role)) {
    if (!wp) return null;
    const assigned = await db.jobAssignment.findFirst({ where: { jobId, workerId: wp.id, status: { not: "DECLINED" } }, select: { id: true } });
    if (!assigned) return null;
  }
  const name = wp?.displayName || ctx.user.name?.trim() || ctx.user.email || "A member";
  return { organizationId: ctx.organizationId, userId: ctx.user.id, workerId: wp?.id ?? null, name, job };
}

/** The row, the trail row that names it, and the office's note. */
export async function recordJobMedia(input: {
  caller: MediaCaller;
  url: string;
  kind: MediaKind;
  meta: MediaMeta;
  caption?: string | null;
  via: "worker-portal" | "dashboard";
}): Promise<{ id: string }> {
  const { caller, url, kind, meta, via } = input;
  const row = await db.jobPhoto.create({
    data: { jobId: caller.job.id, url, kind, caption: input.caption?.trim() || null, analysis: mediaMetaJson(meta) },
  });
  const what = meta.media === "video" ? "video" : "photo";
  const tag = kind.toLowerCase();
  await logActivity({
    organizationId: caller.organizationId,
    actorId: caller.userId,
    kind: TRAIL_KINDS.PHOTO,
    summary: `Uploaded ${/^[aeiou]/.test(tag) ? "an" : "a"} ${tag} ${what} to ${caller.job.title}`,
    proposalId: caller.job.proposalId,
    clientId: caller.job.clientId,
    meta: { jobId: caller.job.id, photoId: row.id, kind, media: meta.media, via },
  });
  afterResponse(async () => {
    const { notifyJobMedia } = await import("@/lib/notify");
    await notifyJobMedia(caller.job.id, { userId: caller.userId, name: caller.name }, meta.media);
  });
  return { id: row.id };
}
