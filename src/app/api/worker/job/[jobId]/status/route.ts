import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { touchWorkerActivity } from "@/lib/workerActivity";

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

  // Only a live assignment moves work forward — a DECLINED (or otherwise
  // inactive) crew member must not be able to complete the job through the
  // token door when the session door (setJobProgress) refuses them.
  const assignment = await db.jobAssignment.findFirst({
    where: {
      jobId,
      workerId: worker.id,
      job: { organizationId: worker.organizationId },
      status: { not: "DECLINED" },
    },
  });
  if (!assignment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ALLOWED = ["IN_PROGRESS", "COMPLETED"];
  if (!ALLOWED.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const current = await db.job.findFirst({
    where: { id: jobId, organizationId: worker.organizationId },
    select: { status: true },
  });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (current.status === "CANCELED" || current.status === "COMPLETED") {
    return NextResponse.json({ error: "Job is closed" }, { status: 409 });
  }

  const job = await db.job.update({ where: { id: jobId }, data: { status: body.status } });
  // Same promotion updateJob does: the ACCEPTED proposal behind a finished
  // job reads COMPLETED, no matter which door completed the work.
  if (body.status === "COMPLETED" && job.proposalId) {
    await db.proposal.updateMany({
      where: { id: job.proposalId, organizationId: job.organizationId, status: "ACCEPTED" },
      data: { status: "COMPLETED" },
    });
  }
  await touchWorkerActivity(worker.id);
  return NextResponse.json({ ok: true });
}
