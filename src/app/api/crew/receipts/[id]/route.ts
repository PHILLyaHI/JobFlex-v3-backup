import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { crewCaller, jsonBody } from "@/lib/crewActor";
import { deleteJobExpense, editJobExpense } from "@/lib/jobExpenses";
import { isPrivateJobFile } from "@/lib/media/privateStore";
import { IMAGE_DATA_URL } from "@/lib/safeHref";

export const runtime = "nodejs";

interface Patch {
  token: string;
  amount: number;
  vendor: string | null;
  category: string;
  spentAt: string | null;
  paidBy: "WORKER" | "COMPANY";
  note: string | null;
  /** A replacement picture (the old one leaves the store). */
  url: string | null;
}

// ONE RECEIPT: EDIT OR DELETE (stage C, 2026-09-30). The office edits and
// deletes any; a crew member only their own, and only while it is on review
// or rejected — an approved receipt stays (lib/jobExpenses). An edit leaves
// the "edited" mark; a corrected rejected receipt goes back on review.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await jsonBody<Patch>(req);
  const caller = await crewCaller(body.token ?? null);
  if (!caller) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const ex = await db.jobExpense.findFirst({ where: { id, job: { organizationId: caller.organizationId } }, select: { jobId: true } });
  if (!ex) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (body.url && !isPrivateJobFile(body.url, "receipts", ex.jobId) && !IMAGE_DATA_URL.test(body.url)) {
    return NextResponse.json({ error: "That picture is not in this job's receipts folder." }, { status: 400 });
  }
  const spentAt = body.spentAt === undefined ? undefined : body.spentAt && /^\d{4}-\d{2}-\d{2}$/.test(body.spentAt) ? new Date(`${body.spentAt}T12:00:00`) : null;
  if (body.amount !== undefined && !(Number(body.amount) > 0)) return NextResponse.json({ error: "Enter the amount on the receipt." }, { status: 400 });
  try {
    const row = await editJobExpense(
      { organizationId: caller.organizationId, userId: caller.userId, role: caller.role, workerId: caller.workerId, name: caller.name },
      id,
      {
        amount: body.amount === undefined ? undefined : Number(body.amount),
        vendor: body.vendor,
        category: body.category,
        spentAt,
        paidBy: body.paidBy === "COMPANY" || body.paidBy === "WORKER" ? body.paidBy : undefined,
        note: body.note,
        receiptUrl: body.url === undefined ? undefined : body.url,
      },
    );
    return NextResponse.json({ id: row.id, status: row.status, editedAt: row.editedAt });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not save that." }, { status: 403 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await jsonBody<{ token: string }>(req);
  const caller = await crewCaller(body.token ?? null);
  if (!caller) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  try {
    await deleteJobExpense({ organizationId: caller.organizationId, userId: caller.userId, role: caller.role, workerId: caller.workerId, name: caller.name }, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not delete that.";
    return NextResponse.json({ error: msg }, { status: msg === "Not found" ? 404 : 403 });
  }
}
