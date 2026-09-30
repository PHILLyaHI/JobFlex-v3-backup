// WHO IS PRESSING, THROUGH EITHER DOOR (stage C, 2026-09-30) — server.
//
// The crew works a job from two entrances with the same buttons: the worker
// portal (a magic-link token, no session) and the dashboard (a session, the
// INSTALLER role — or the office). The routes under /api/crew take either and
// ask here who that is and what they may do on this job:
//   office   — any member who is not a limited role (owner, admin, manager…):
//              every job of the company, and the reviewer's buttons;
//   crew     — a worker with a live (not declined) assignment on the job.
// Anyone else gets null, and the route answers 403.

import { db } from "@/lib/db";
import { isLimitedRole, requireOrg } from "@/lib/orgContext";

export interface CrewActor {
  organizationId: string;
  userId: string;
  /** The membership role, or "WORKER_TOKEN" through the portal. */
  role: string;
  workerId: string | null;
  name: string;
  /** The office (reviews receipts, closes any day, sees every job). */
  office: boolean;
  /** Came through the portal's magic link. */
  viaToken: boolean;
}

/** The caller behind a token or the session, without a job in mind. */
export async function crewCaller(token: string | null | undefined): Promise<Omit<CrewActor, "office"> & { office: boolean } | null> {
  if (token) {
    const w = await db.workerProfile.findUnique({ where: { token }, select: { id: true, userId: true, organizationId: true, displayName: true } });
    if (!w) return null;
    return { organizationId: w.organizationId, userId: w.userId, role: "WORKER_TOKEN", workerId: w.id, name: w.displayName, office: false, viaToken: true };
  }
  let ctx: { organizationId: string; user: { id: string; name?: string | null; email?: string | null }; role: string };
  try {
    ctx = (await requireOrg()) as typeof ctx;
  } catch {
    return null;
  }
  const wp = await db.workerProfile.findUnique({ where: { userId: ctx.user.id }, select: { id: true, displayName: true, organizationId: true } });
  const workerId = wp && wp.organizationId === ctx.organizationId ? wp.id : null;
  return {
    organizationId: ctx.organizationId,
    userId: ctx.user.id,
    role: ctx.role,
    workerId,
    name: (workerId && wp?.displayName) || ctx.user.name?.trim() || ctx.user.email || "A member",
    office: !isLimitedRole(ctx.role),
    viaToken: false,
  };
}

/** The caller, allowed on this job: the office on any job of the company, the
 *  crew only on a job they hold a live assignment on. */
export async function crewActorForJob(jobId: string, token: string | null | undefined): Promise<CrewActor | null> {
  const c = await crewCaller(token);
  if (!c) return null;
  const job = await db.job.findFirst({ where: { id: jobId, organizationId: c.organizationId }, select: { id: true } });
  if (!job) return null;
  if (c.office) return c;
  if (!c.workerId) return null;
  const a = await db.jobAssignment.findFirst({ where: { jobId, workerId: c.workerId, status: { not: "DECLINED" } }, select: { id: true } });
  return a ? c : null;
}

/** Read the JSON body; a bad one is an empty object. */
export async function jsonBody<T extends object>(req: Request): Promise<Partial<T>> {
  try {
    return ((await req.json()) ?? {}) as Partial<T>;
  } catch {
    return {};
  }
}
