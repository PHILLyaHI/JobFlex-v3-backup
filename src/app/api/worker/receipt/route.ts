import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isBlobEnabled, uploadBlob } from "@/lib/sdk/blob";
import { touchWorkerActivity } from "@/lib/workerActivity";

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

  const worker = await db.workerProfile.findUnique({ where: { token: body.token } });
  if (!worker) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const assigned = await db.jobAssignment.findFirst({
    where: { jobId: body.jobId, workerId: worker.id },
  });
  if (!assigned) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  let receiptUrl = body.dataUrl;
  if (isBlobEnabled()) {
    try {
      const match = body.dataUrl.match(/^data:(.+?);base64,(.+)$/);
      if (match) {
        const buf = Buffer.from(match[2], "base64");
        const res = await uploadBlob(
          `receipts/${body.jobId}/${Date.now()}-${body.filename ?? "receipt"}`,
          buf,
        );
        receiptUrl = res.url;
      }
    } catch {
      // fallback to data URL
    }
  }

  const amount = Number.isFinite(body.amount) ? Number(body.amount) : 0;
  const category = body.category?.trim() || "Materials";

  const expense = await db.jobExpense.create({
    data: {
      jobId: body.jobId,
      category,
      amount,
      note: body.note?.trim() || null,
      receiptUrl,
    },
  });
  await touchWorkerActivity(worker.id);
  return NextResponse.json({ id: expense.id, url: receiptUrl });
}
