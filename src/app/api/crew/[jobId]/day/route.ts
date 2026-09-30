import { NextResponse } from "next/server";
import { crewActorForJob, jsonBody } from "@/lib/crewActor";
import { recordJobProgress } from "@/lib/jobProgress";
import { touchWorkerActivity } from "@/lib/workerActivity";
import type { ProgressWhat } from "@/lib/jobProgressShared";

export const runtime = "nodejs";

const ACTIONS: Record<string, ProgressWhat> = { start: "started", continue: "continued", close: "closed", complete: "completed" };

// A DAY ON SITE, FROM EITHER DOOR (stage C, 2026-09-30): start, back on site,
// close (a note or a file — today's, or a past day by its date) and complete.
// The crew through the portal or the dashboard; the office too, whose press
// counts the day and texts nobody (the owner's rule for the office's moves).
// All of it is lib/jobProgress's one rule, the second developer's texts
// included.
export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  const body = await jsonBody<{ token: string; action: string; note: string; date: string }>(req);
  const what = ACTIONS[body.action ?? ""];
  if (!what) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const actor = await crewActorForJob(jobId, body.token ?? null);
  if (!actor) return NextResponse.json({ error: "You can only work on a job you are on." }, { status: 403 });
  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
  const r = await recordJobProgress({
    organizationId: actor.organizationId,
    jobId,
    actor: { userId: actor.userId, name: actor.name },
    what,
    via: actor.viaToken ? "worker-portal" : "dashboard",
    source: actor.office ? "office" : "worker",
    silent: actor.office,
    note: typeof body.note === "string" ? body.note.slice(0, 2000) : null,
    date,
  });
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.code === "not-found" ? 404 : 409 });
  if (actor.workerId && actor.viaToken) await touchWorkerActivity(actor.workerId);
  return NextResponse.json({ ok: true, status: r.status, day: r.day, what: r.what, workDayId: r.workDayId ?? null });
}
