import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { touchWorkerActivity } from "@/lib/workerActivity";
import { recordJobProgress } from "@/lib/jobProgress";

// Worker-portal job status update. Token-gated like the assignment route:
// the supplied token must belong to a worker assigned to this job. Workers
// may only move work forward: start it, mark a new day on site (CONTINUE,
// 2026-09-27) or complete it — they cannot reschedule, reassign, or cancel.
// The rule itself lives in lib/jobProgress, shared with the dashboard door,
// and texts the owner and the manager after the response.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await ctx.params;
  const body = (await req.json()) as { token?: string; status?: string; note?: string | null; date?: string | null };
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

  // CLOSE_DAY (stage A, 2026-09-30): close today's day on site, or a past
  // day by its date, with a note or a file of the day.
  const WHAT = { IN_PROGRESS: "started", CONTINUE: "continued", COMPLETED: "completed", CLOSE_DAY: "closed" } as const;
  const what = WHAT[body.status as keyof typeof WHAT];
  if (!what) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  const r = await recordJobProgress({
    organizationId: worker.organizationId,
    jobId,
    actor: { userId: worker.userId, name: worker.displayName },
    what,
    via: "worker-portal",
    source: "worker",
    note: body.note ?? null,
    date: body.date ?? null,
  });
  if (!r.ok) {
    const status = r.code === "not-found" ? 404 : 409;
    return NextResponse.json({ error: r.error }, { status });
  }
  await touchWorkerActivity(worker.id);
  return NextResponse.json({ ok: true, status: r.status, day: r.day, what: r.what, workDayId: r.workDayId ?? null });
}
