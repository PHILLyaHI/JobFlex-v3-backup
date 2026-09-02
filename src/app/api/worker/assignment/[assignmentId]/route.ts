import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { touchWorkerActivity } from "@/lib/workerActivity";
import { applyAssignmentResponse } from "@/lib/assignmentResponse";
import { tokensEqual } from "@/lib/tokens";

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
    include: {
      worker: { select: { token: true, id: true, userId: true, displayName: true } },
      job: { select: { id: true, title: true, status: true, organizationId: true } },
    },
  });
  // Constant-time compare: a plain `!==` returns at the first differing byte,
  // which is the classic timing side channel on a bearer token.
  if (!assignment || !tokensEqual(assignment.worker.token, body.token)) {
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
  // An ANSWER through the magic link carries the same consequences as one from
  // the dashboard: job transition, office bell, office email (2026-08-22 —
  // this route used to update the row and stop, so the token portal's accepts
  // and declines were invisible to the office).
  if (body.status === "ACCEPTED" || body.status === "DECLINED") {
    await applyAssignmentResponse({
      assignmentId: assignment.id,
      response: body.status,
      organizationId: assignment.job.organizationId,
      actorUserId: assignment.worker.userId,
      workerDisplayName: assignment.worker.displayName,
      job: assignment.job,
    });
  }
  await touchWorkerActivity(assignment.worker.id);
  return NextResponse.json({ ok: true });
}
