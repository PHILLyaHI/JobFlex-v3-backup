import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class NoOrgError extends Error {
  constructor(message = "No active organization") {
    super(message);
    this.name = "NoOrgError";
  }
}

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  return session.user;
}

// Platform-admin authority for the (admin) console. Re-reads the DB flag every
// call — never trusts the 7-day JWT — so revoking access takes effect at once.
// Returns the live User row so callers can use it as the action's "issuer".
export async function requirePlatformAdmin() {
  const sessionUser = await requireUser();
  const user = await db.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, email: true, name: true, isPlatformAdmin: true },
  });
  if (!user?.isPlatformAdmin) throw new UnauthorizedError("Platform admin only");
  return user;
}

// Influencer principal for the (influencer) portal. Re-reads the Influencer row
// and rejects suspended/terminated accounts even if the JWT is still valid.
export async function requireInfluencer() {
  const sessionUser = await requireUser();
  if (sessionUser.principal !== "INFLUENCER" || !sessionUser.influencerId) {
    throw new UnauthorizedError("Influencer login required");
  }
  const influencer = await db.influencer.findUnique({
    where: { id: sessionUser.influencerId },
  });
  if (!influencer) throw new UnauthorizedError("Influencer not found");
  if (influencer.status === "SUSPENDED" || influencer.status === "TERMINATED") {
    throw new UnauthorizedError("Influencer account is not active");
  }
  return influencer;
}

// Use on any id-bearing influencer route: the resource id is never trusted from
// the client for scoping — it must match the session's own influencer.
export async function requireInfluencerSelf(resourceInfluencerId: string) {
  const influencer = await requireInfluencer();
  if (influencer.id !== resourceInfluencerId) {
    throw new UnauthorizedError("Forbidden");
  }
  return influencer;
}

export async function requireOrg() {
  const user = await requireUser();
  if (!user.activeOrgId) {
    const m = await db.membership.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    if (!m) throw new NoOrgError();
    return { user, organizationId: m.organizationId, role: m.role };
  }
  const m = await db.membership.findFirst({
    where: { userId: user.id, organizationId: user.activeOrgId },
  });
  if (!m) throw new NoOrgError();
  return { user, organizationId: m.organizationId, role: m.role };
}

// The single role that maps to a field worker (vs. office/manager staff). A
// worker gets a read-only, self-scoped slice of the dashboard (their jobs +
// calendar); everything else is manager-only.
export const WORKER_ROLE = "INSTALLER";

/** True when the active-org membership role is the field-worker role. */
export function isWorkerRole(role: string | null | undefined): boolean {
  return role === WORKER_ROLE;
}

// Manager-only server-action guard. Re-reads the active-org role from the DB via
// requireOrg (never trusts the JWT) and rejects field workers. Use on any action
// a worker must not call even if they craft the request directly — middleware +
// nav only hide the UI; this is the real write boundary. NOT for token-portal
// actions (those are token-gated and have no session/role).
export async function requireManager() {
  const ctx = await requireOrg();
  if (isWorkerRole(ctx.role)) {
    throw new UnauthorizedError("Manager access required");
  }
  return ctx;
}
