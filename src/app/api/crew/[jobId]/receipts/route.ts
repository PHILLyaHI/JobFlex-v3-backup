import { NextResponse } from "next/server";
import { crewActorForJob, jsonBody } from "@/lib/crewActor";
import { createJobExpense } from "@/lib/jobExpenses";
import { isPrivateJobFile } from "@/lib/media/privateStore";
import { IMAGE_DATA_URL } from "@/lib/safeHref";
import { touchWorkerActivity } from "@/lib/workerActivity";
import { notifyExpenseSubmitted } from "@/lib/expenseNotify";
import { afterResponse } from "@/lib/server-events";

export const runtime = "nodejs";

interface Body {
  token: string;
  /** The stored picture: a private file under receipts/<jobId>/, or — before the store exists — an inline image. */
  url: string | null;
  amount: number;
  vendor: string;
  category: string;
  /** "2026-09-30" */
  spentAt: string;
  paidBy: "WORKER" | "COMPANY";
  note: string;
}

// A RECEIPT ON A JOB, FROM EITHER DOOR (stage C, 2026-09-30). The picture was
// already uploaded straight from the phone (lib/media/uploadJobMedia) into the
// job's private receipts folder; this records it. A crew member's receipt is
// SUBMITTED — on review, in no total — and the owner and the managers hear
// about it (the bell, and mail by their settings); the office's own row is
// approved at once (lib/jobExpenses).
export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  const body = await jsonBody<Body>(req);
  const actor = await crewActorForJob(jobId, body.token ?? null);
  if (!actor) return NextResponse.json({ error: "You can only add receipts to a job you are on." }, { status: 403 });
  const url = typeof body.url === "string" && body.url ? body.url : null;
  if (url && !isPrivateJobFile(url, "receipts", jobId) && !IMAGE_DATA_URL.test(url)) {
    return NextResponse.json({ error: "That picture is not in this job's receipts folder." }, { status: 400 });
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Enter the amount on the receipt." }, { status: 400 });
  const spentAt = typeof body.spentAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.spentAt) ? new Date(`${body.spentAt}T12:00:00`) : null;
  const row = await createJobExpense(
    { organizationId: actor.organizationId, userId: actor.userId, role: actor.role, workerId: actor.workerId, name: actor.name },
    {
      jobId,
      category: body.category ?? "Materials",
      amount,
      vendor: body.vendor ?? null,
      note: body.note ?? null,
      receiptUrl: url,
      spentAt,
      paidBy: body.paidBy === "COMPANY" ? "COMPANY" : body.paidBy === "WORKER" ? "WORKER" : null,
      via: actor.viaToken ? "worker-portal" : "dashboard",
    },
  );
  if (row.status === "SUBMITTED") afterResponse(() => notifyExpenseSubmitted(row.id));
  if (actor.workerId && actor.viaToken) await touchWorkerActivity(actor.workerId);
  return NextResponse.json({ id: row.id, status: row.status });
}
