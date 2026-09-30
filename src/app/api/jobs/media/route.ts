import { NextResponse } from "next/server";
import { authorizeJobMedia, recordJobMedia } from "@/lib/jobMedia";
import { touchWorkerActivity } from "@/lib/workerActivity";
import { MEDIA_KINDS, isJobBlobUrl, isVideoType, type MediaKind } from "@/lib/jobMediaShared";
import { isPrivateJobFile } from "@/lib/media/privateStore";

export const runtime = "nodejs";

// A file the browser just put in the store, recorded on the job (2026-09-27).
// The URL must be the store's, under this job's own folder — the token route
// only issues tokens there — so a caller cannot file an outside link as a
// job photo. Worker token or session, like the token route.
export async function POST(req: Request) {
  let body: { jobId?: string; token?: string | null; url?: string; kind?: string; contentType?: string; bytes?: number; name?: string; caption?: string | null; date?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!body.jobId || !body.url) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  // The private store or the local fallback (stage B), or the older public store.
  if (!isPrivateJobFile(body.url, "jobs", body.jobId) && !isJobBlobUrl(body.url, body.jobId)) return NextResponse.json({ error: "That file is not in this job's folder." }, { status: 400 });
  const caller = await authorizeJobMedia(body.jobId, body.token ?? null);
  if (!caller) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const kind: MediaKind = MEDIA_KINDS.includes(body.kind as MediaKind) ? (body.kind as MediaKind) : "AFTER";
  const video = isVideoType(body.contentType);
  const row = await recordJobMedia({
    caller,
    url: body.url,
    kind,
    meta: { media: video ? "video" : "photo", contentType: body.contentType, bytes: typeof body.bytes === "number" ? body.bytes : undefined, name: body.name?.slice(0, 120) },
    caption: body.caption ?? null,
    via: body.token ? "worker-portal" : "dashboard",
    workDate: typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null,
  });
  if (caller.workerId) await touchWorkerActivity(caller.workerId);
  return NextResponse.json({ id: row.id, url: body.url, media: video ? "video" : "photo" });
}
