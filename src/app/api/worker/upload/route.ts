import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isBlobEnabled, uploadBlob } from "@/lib/sdk/blob";
import { touchWorkerActivity } from "@/lib/workerActivity";
import { IMAGE_DATA_URL, safeFilename } from "@/lib/safeHref";

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
  const worker = await db.workerProfile.findUnique({ where: { token: body.token } });
  if (!worker) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const assigned = await db.jobAssignment.findFirst({
    where: {
      jobId: body.jobId,
      workerId: worker.id,
      job: { organizationId: worker.organizationId },
      status: { not: "DECLINED" },
    },
  });
  if (!assigned) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const buf = Buffer.from(match[2], "base64");
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Photo is too large (4 MB max)" }, { status: 413 });
  }

  let url = body.dataUrl;
  if (isBlobEnabled()) {
    // With a blob store configured the upload must succeed — never fall back
    // to persisting a multi-megabyte data URL in the row.
    const res = await uploadBlob(
      `jobs/${body.jobId}/${Date.now()}-${safeFilename(body.filename, "photo")}`,
      buf,
      { contentType: match[1].toLowerCase() },
    );
    url = res.url;
  }

  const photo = await db.jobPhoto.create({
    data: {
      jobId: body.jobId,
      url,
      kind,
    },
  });
  await touchWorkerActivity(worker.id);
  return NextResponse.json({ id: photo.id, url });
}
