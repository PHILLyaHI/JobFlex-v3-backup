import { NextResponse } from "next/server";
import { putPrivate } from "@/lib/media/privateStore";
import { touchWorkerActivity } from "@/lib/workerActivity";
import { IMAGE_DATA_URL, safeFilename } from "@/lib/safeHref";
import { authorizeJobMedia, recordJobMedia } from "@/lib/jobMedia";

const KINDS = ["BEFORE", "PROGRESS", "AFTER"] as const;
// Vercel caps request bodies at 4.5 MB; base64 inflates ~4/3, so this is the
// largest decoded image that can arrive anyway. Stated explicitly so a
// self-hosted deploy gets the same ceiling.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const body = (await req.json()) as {
    token?: string;
    jobId?: string;
    dataUrl?: string;
    filename?: string;
    kind?: string;
    date?: string | null;
  };
  if (!body.token || !body.jobId || !body.dataUrl) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  // Only an inline IMAGE is accepted. The old code stored any non-matching
  // string verbatim as the photo URL — a worker could plant an arbitrary
  // external (or javascript:) URL that every manager's browser then loaded.
  const match = body.dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match || !IMAGE_DATA_URL.test(body.dataUrl)) {
    return NextResponse.json({ error: "Photo must be an image" }, { status: 400 });
  }
  const kind = KINDS.includes(body.kind as (typeof KINDS)[number])
    ? (body.kind as (typeof KINDS)[number])
    : "BEFORE";

  // Token-gate: the worker (via token) must be assigned to this job.
  const caller = await authorizeJobMedia(body.jobId, body.token);
  if (!caller) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const buf = Buffer.from(match[2], "base64");
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Photo is too large (4 MB max)" }, { status: 413 });
  }

  // The private store (stage B), the local fallback, or — production before
  // the store exists — the data URL on the row, as before.
  const { url } = await putPrivate(`jobs/${body.jobId}/${Date.now()}-${safeFilename(body.filename, "photo")}`, buf, match[1].toLowerCase());

  // The row, the trail and the office's note — the same record as the store path.
  const photo = await recordJobMedia({ caller, url, kind, meta: { media: "photo", contentType: match[1].toLowerCase(), bytes: buf.byteLength }, via: "worker-portal", workDate: typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null });
  if (caller.workerId) await touchWorkerActivity(caller.workerId);
  return NextResponse.json({ id: photo.id, url });
}
