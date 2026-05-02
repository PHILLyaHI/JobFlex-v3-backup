import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ assignmentId: string }> },
) {
  const { assignmentId } = await ctx.params;
  const body = (await req.json()) as { token?: string; status?: string };
  if (!body.token || !body.status) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Token-gate: the assignment's worker must match the supplied token.
  const assignment = await db.jobAssignment.findUnique({
    where: { id: assignmentId },
    include: { worker: { select: { token: true, id: true } } },
  });
  if (!assignment || assignment.worker.token !== body.token) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ALLOWED = ["PENDING", "ACCEPTED", "DECLINED", "COMPLETED"];
  if (!ALLOWED.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  await db.jobAssignment.update({
    where: { id: assignment.id },
    data: { status: body.status },
  });
  return NextResponse.json({ ok: true });
}
