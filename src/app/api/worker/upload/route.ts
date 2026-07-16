import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isBlobEnabled, uploadBlob } from "@/lib/sdk/blob";
import { touchWorkerActivity } from "@/lib/workerActivity";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    token?: string;
    jobId?: string;
    dataUrl?: string;
    filename?: string;
    kind?: "BEFORE" | "PROGRESS" | "AFTER";
  };
  if (!body.token || !body.jobId || !body.dataUrl) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Token-gate: the worker (via token) must be assigned to this job.
  const worker = await db.workerProfile.findUnique({ where: { token: body.token } });
  if (!worker) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const assigned = await db.jobAssignment.findFirst({
    where: { jobId: body.jobId, workerId: worker.id },
  });
  if (!assigned) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  let url = body.dataUrl;
  if (isBlobEnabled()) {
    try {
      const match = body.dataUrl.match(/^data:(.+?);base64,(.+)$/);
      if (match) {
        const buf = Buffer.from(match[2], "base64");
        const res = await uploadBlob(
          `jobs/${body.jobId}/${Date.now()}-${body.filename ?? "photo"}`,
          buf,
        );
        url = res.url;
      }
    } catch {
      // fallback to data URL
    }
  }

  const photo = await db.jobPhoto.create({
    data: {
      jobId: body.jobId,
      url,
      kind: body.kind ?? "BEFORE",
    },
  });
  await touchWorkerActivity(worker.id);
  return NextResponse.json({ id: photo.id, url });
}
