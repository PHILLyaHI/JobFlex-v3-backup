import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Worker-portal job status update. Token-gated like the assignment route:
// the supplied token must belong to a worker assigned to this job. Workers may
// only move work forward through the active lifecycle (start / complete) — they
// cannot reschedule, reassign, or cancel.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await ctx.params;
  const body = (await req.json()) as { token?: string; status?: string };
  if (!body.token || !body.status) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const worker = await db.workerProfile.findUnique({ where: { token: body.token } });
  if (!worker) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const assignment = await db.jobAssignment.findFirst({
    where: { jobId, workerId: worker.id },
  });
  if (!assignment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ALLOWED = ["IN_PROGRESS", "COMPLETED"];
  if (!ALLOWED.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  await db.job.update({ where: { id: jobId }, data: { status: body.status } });
  return NextResponse.json({ ok: true });
}
