import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { putPrivate } from "@/lib/media/privateStore";
import { touchWorkerActivity } from "@/lib/workerActivity";
import { IMAGE_DATA_URL, safeFilename } from "@/lib/safeHref";
import { createJobExpense } from "@/lib/jobExpenses";

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
    vendor?: string | null;
    /** Who paid: the worker (to be reimbursed, the default) or the company's card. */
    paidBy?: "WORKER" | "COMPANY";
    /** When the money was spent (ISO date); today when empty. */
    spentAt?: string | null;
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

  // The older base64 door, kept for a cached portal page: the file goes to
  // the private store now (stage B). The new pages upload straight from the
  // phone and record through /api/crew/<jobId>/receipts.
  const { url: receiptUrl } = await putPrivate(`receipts/${body.jobId}/${Date.now()}-${safeFilename(body.filename, "receipt")}`, buf, match[1].toLowerCase());

  // The one rule (lib/jobExpenses, stage A 2026-09-30): a worker's receipt is
  // SUBMITTED — on review, in no total — until the office approves it. The
  // amount is clamped there (never negative, never absurd).
  const spentAt = body.spentAt ? new Date(body.spentAt) : null;
  const expense = await createJobExpense(
    { organizationId: worker.organizationId, userId: worker.userId, role: "WORKER_TOKEN", workerId: worker.id, name: worker.displayName },
    {
      jobId: body.jobId,
      category: body.category ?? "Materials",
      amount: Number(body.amount),
      note: body.note,
      receiptUrl,
      vendor: body.vendor,
      paidBy: body.paidBy === "COMPANY" ? "COMPANY" : "WORKER",
      spentAt: spentAt && !Number.isNaN(spentAt.getTime()) ? spentAt : null,
      via: "worker-portal",
    },
  );
  await touchWorkerActivity(worker.id);
  return NextResponse.json({ id: expense.id, url: receiptUrl, status: expense.status });
}
