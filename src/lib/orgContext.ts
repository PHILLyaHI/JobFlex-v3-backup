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
  // Session revocation: a stateless JWT is otherwise valid for its full 7-day
  // maxAge even after a password reset. Every USER-principal request re-checks
  // the credential epoch against the DB — a reset bumps User.credentialVersion,
  // instantly invalidating every previously-issued token (the "log out
  // everywhere" a bare JWT can't do). Influencers use a separate table with
  // their own status re-check in requireInfluencer, so they're exempt here.
  if (session.user.principal !== "INFLUENCER") {
    const fresh = await db.user.findUnique({
      where: { id: session.user.id },
      select: { credentialVersion: true },
    });
    if (!fresh) throw new UnauthorizedError();
    if (fresh.credentialVersion !== (session.user.credentialVersion ?? 0)) {
      throw new UnauthorizedError("Session expired — please sign in again");
    }
  }
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
  if (m) return { user, organizationId: m.organizationId, role: m.role };
  // JWT has a stale activeOrgId (e.g. membership was removed and re-created, or
  // DB was partially reset). Fall back to the oldest remaining membership so a
  // valid user is never locked out by a stale token.
  const fallback = await db.membership.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  if (!fallback) throw new NoOrgError();
  return { user, organizationId: fallback.organizationId, role: fallback.role };
}

// ── Role taxonomy ────────────────────────────────────────────────────────────
// Membership.role is a plain string. Office roles (OWNER / ADMIN / MANAGER —
// plus the legacy ACCOUNTANT / USER values, which keep their historical full
// access) get the whole dashboard. The three LIMITED roles get a scoped slice:
//   INSTALLER — field worker: read-only jobs + own schedule + messages
//   SALES     — pipeline: leads / clients / proposals / CRM / calendar / phone
//   ESTIMATOR — estimating: proposals + AI estimators + clients (read) + messages
export const WORKER_ROLE = "INSTALLER";
export const SALES_ROLE = "SALES";
export const ESTIMATOR_ROLE = "ESTIMATOR";
export const OWNER_ROLE = "OWNER";

/** True when the active-org membership role is the field-worker role. */
export function isWorkerRole(role: string | null | undefined): boolean {
  return role === WORKER_ROLE;
}

/** True for the sales-rep role. */
export function isSalesRole(role: string | null | undefined): boolean {
  return role === SALES_ROLE;
}

/** True for the estimator role. */
export function isEstimatorRole(role: string | null | undefined): boolean {
  return role === ESTIMATOR_ROLE;
}

/** True for any restricted role (worker / sales / estimator). */
export function isLimitedRole(role: string | null | undefined): boolean {
  return isWorkerRole(role) || isSalesRole(role) || isEstimatorRole(role);
}

// "Manager" in guard terms = any non-limited role. Deliberately a deny-list so
// the legacy ACCOUNTANT / USER roles keep the full access they've always had —
// only the three limited roles are carved out.
export function isOwnerOrManager(role: string | null | undefined): boolean {
  return !isLimitedRole(role);
}

/** True only for the organization owner role. */
export function isOwnerRole(role: string | null | undefined): boolean {
  return role === OWNER_ROLE;
}

// Manager-only server-action guard. Re-reads the active-org role from the DB via
// requireOrg (never trusts the JWT) and rejects every limited role (worker,
// sales, estimator). Use on any action those roles must not call even if they
// craft the request directly — middleware + nav only hide the UI; this is the
// real write boundary. NOT for token-portal actions (those are token-gated and
// have no session/role).
export async function requireManager() {
  const ctx = await requireOrg();
  if (isLimitedRole(ctx.role)) {
    throw new UnauthorizedError("Manager access required");
  }
  return ctx;
}

// Job-event creation guard: managers plus INSTALLERS (field workers add events
// to jobs they're assigned to — the action itself enforces that scoping).
// Sales and estimator are the pipeline roles and don't create job events.
export async function requireJobEventCreator() {
  const ctx = await requireOrg();
  if (isSalesRole(ctx.role) || isEstimatorRole(ctx.role)) {
    throw new UnauthorizedError("Not allowed to create job events");
  }
  return ctx;
}

// Sales-surface guard: managers plus SALES. For actions on the sales slice
// (leads, clients, appointments, CRM queue, phone). Callers still self-scope
// sales mutations where the action touches another user's records.
export async function requireSalesOrManager() {
  const ctx = await requireOrg();
  if (isWorkerRole(ctx.role) || isEstimatorRole(ctx.role)) {
    throw new UnauthorizedError("Sales or manager access required");
  }
  return ctx;
}

// Estimator-surface guard: managers plus ESTIMATOR. For the AI / roof / fence
// estimator actions that draft and convert estimates into proposals.
export async function requireEstimatorOrManager() {
  const ctx = await requireOrg();
  if (isWorkerRole(ctx.role) || isSalesRole(ctx.role)) {
    throw new UnauthorizedError("Estimator or manager access required");
  }
  return ctx;
}

// Proposal-capable staff: everyone except field workers. SALES and ESTIMATOR
// callers additionally get `proposalScope`, a where-fragment to AND into every
// proposal query so they can only read/mutate proposals they own; for managers
// it's empty (whole org).
export async function requireProposalStaff() {
  const ctx = await requireOrg();
  if (isWorkerRole(ctx.role)) {
    throw new UnauthorizedError("Manager access required");
  }
  const ownProposalsOnly = isSalesRole(ctx.role) || isEstimatorRole(ctx.role);
  const proposalScope: { ownerId?: string } = ownProposalsOnly ? { ownerId: ctx.user.id } : {};
  return { ...ctx, ownProposalsOnly, proposalScope };
}

// Owner-only guard for billing/subscription surfaces. Strictly OWNER — managers
// (and the legacy ADMIN/ACCOUNTANT/USER roles) run operations, not the money.
export async function requireOwner() {
  const ctx = await requireOrg();
  if (!isOwnerRole(ctx.role)) {
    throw new UnauthorizedError("Owner access required");
  }
  return ctx;
}
