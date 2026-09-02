import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isBlobEnabled, uploadBlob } from "@/lib/sdk/blob";
import { touchWorkerActivity } from "@/lib/workerActivity";
import { IMAGE_DATA_URL, safeFilename } from "@/lib/safeHref";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

// Worker-scoped receipt attach. Mirrors /api/worker/upload's token-gate: the
// worker (proven by their portal token) must be assigned to the job. Creates a
// JobExpense so the office sees the receipt in the job's expenses immediately.
export async function POST(req: Request) {
  const body = (await req.json()) as {
    token?: string;
    jobId?: string;
    dataUrl?: string;
    filename?: string;
    amount?: number;
    category?: string;
    note?: string | null;
  };
  if (!body.token || !body.jobId || !body.dataUrl) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  // Inline image only — the stored URL is rendered as a link + thumbnail in
  // the office's financials, so an arbitrary string here was stored XSS /
  // content injection against every manager who opened the ledger.
  const match = body.dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match || !IMAGE_DATA_URL.test(body.dataUrl)) {
    return NextResponse.json({ error: "Receipt must be an image" }, { status: 400 });
  }

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
    return NextResponse.json({ error: "Receipt is too large (4 MB max)" }, { status: 413 });
  }

  let receiptUrl = body.dataUrl;
  if (isBlobEnabled()) {
    const res = await uploadBlob(
      `receipts/${body.jobId}/${Date.now()}-${safeFilename(body.filename, "receipt")}`,
      buf,
      { contentType: match[1].toLowerCase() },
    );
    receiptUrl = res.url;
  }

  const rawAmount = Number(body.amount);
  // Non-negative, finite, and capped: a worker token must not be able to post
  // a -$99,999 "expense" that flips the org's margin figures.
  const amount = Number.isFinite(rawAmount) ? Math.min(Math.max(rawAmount, 0), 1_000_000) : 0;
  const category = (body.category?.trim() || "Materials").slice(0, 60);

  const expense = await db.jobExpense.create({
    data: {
      jobId: body.jobId,
      category,
      amount,
      note: body.note?.trim().slice(0, 2000) || null,
      receiptUrl,
    },
  });
  await touchWorkerActivity(worker.id);
  return NextResponse.json({ id: expense.id, url: receiptUrl });
}
