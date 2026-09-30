import { NextResponse } from "next/server";
import { authorizeJobMedia } from "@/lib/jobMedia";
import { IMAGE_TYPES, MAX_FILE_BYTES, VIDEO_TYPES, blobPathFor, fileSize } from "@/lib/jobMediaShared";
import { safePathname, storageMode } from "@/lib/media/privateStore";
import { uploadTicket } from "@/lib/media/signedLink";

export const runtime = "nodejs";

const RECEIPT_TYPES = [...IMAGE_TYPES, "application/pdf"];

// WHERE A FILE GOES (stage B, 2026-09-30). The phone asks before anything
// moves: the caller — a worker's portal token or the session — must be on the
// job (the office may add to any of the company's jobs), the file must be a
// picture or a video of the work (or a picture / PDF of a receipt) and at most
// 100 MB. The answer names the path and the way: the private Blob store, the
// local fallback in development, or "inline" in production before the store
// exists.
export async function POST(req: Request) {
  let body: { jobId?: string; token?: string | null; folder?: string; name?: string; contentType?: string; bytes?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const folder = body.folder === "receipts" ? "receipts" : body.folder === "jobs" ? "jobs" : null;
  if (!body.jobId || !folder) return NextResponse.json({ error: "Which job, and what kind of file?" }, { status: 400 });
  const caller = await authorizeJobMedia(body.jobId, body.token ?? null);
  if (!caller) return NextResponse.json({ error: "You can only add files to a job you are on." }, { status: 403 });
  const type = (body.contentType ?? "").toLowerCase();
  const allowed = folder === "jobs" ? [...IMAGE_TYPES, ...VIDEO_TYPES] : RECEIPT_TYPES;
  if (!allowed.includes(type)) return NextResponse.json({ error: "That kind of file is not accepted here." }, { status: 415 });
  const bytes = Number(body.bytes);
  if (!Number.isFinite(bytes) || bytes <= 0) return NextResponse.json({ error: "The file is empty." }, { status: 400 });
  if (bytes > MAX_FILE_BYTES) return NextResponse.json({ error: `That file is ${fileSize(bytes)} — files up to ${fileSize(MAX_FILE_BYTES)}.` }, { status: 413 });

  const mode = storageMode();
  const pathname = safePathname(blobPathFor(body.jobId, body.name, type.startsWith("video/") ? "video.mp4" : type === "application/pdf" ? "receipt.pdf" : "photo.jpg").replace(/^jobs\//, `${folder}/`));
  if (mode === "blob") return NextResponse.json({ mode, pathname });
  if (mode === "local") {
    const ticket = uploadTicket(pathname, type, Math.min(MAX_FILE_BYTES, Math.ceil(bytes * 1.01) + 1024));
    return NextResponse.json({ mode, pathname, uploadUrl: `/api/crew/upload-local?ticket=${encodeURIComponent(ticket)}` });
  }
  return NextResponse.json({ mode });
}
