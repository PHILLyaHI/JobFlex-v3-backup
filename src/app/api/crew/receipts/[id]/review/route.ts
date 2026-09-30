import { NextResponse } from "next/server";
import { crewCaller, jsonBody } from "@/lib/crewActor";
import { reviewJobExpense, type ReviewDecision } from "@/lib/jobExpenses";

export const runtime = "nodejs";

// THE OFFICE'S ANSWER ON A RECEIPT (stage C, 2026-09-30): approve, reject with
// a reason, or mark an approved one the worker paid for reimbursed. The
// session only — a portal token is never the office — and the owner and
// managers only (lib/jobExpenses refuses the limited roles).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await jsonBody<{ decision: string; reason: string }>(req);
  const decision = (["approve", "reject", "reimburse"] as const).find((d) => d === body.decision) as ReviewDecision | undefined;
  if (!decision) return NextResponse.json({ error: "Unknown decision." }, { status: 400 });
  const caller = await crewCaller(null);
  if (!caller || !caller.office) return NextResponse.json({ error: "Only the owner or a manager reviews receipts." }, { status: 403 });
  try {
    const row = await reviewJobExpense({ organizationId: caller.organizationId, userId: caller.userId, role: caller.role, name: caller.name }, id, decision, body.reason ?? null);
    return NextResponse.json({ id: row.id, status: row.status });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not save that." }, { status: 409 });
  }
}
