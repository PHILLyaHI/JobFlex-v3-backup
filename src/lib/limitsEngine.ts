// ─────────────────────────────────────────────────────────────────────────
// Limits Engine — per-plan NUMERIC quota enforcement.
//
// Distinct from src/lib/entitlements.ts, which handles boolean FEATURE gating
// (does this plan unlock AI proposals?). This engine answers "how many?" and is
// SERVER-ONLY (imports Prisma) — never import it from a client component. For
// shared key/scope definitions a client can read, import src/lib/planLimits.ts.
//
// Usage (wired into user-facing actions in a later step):
//   await enforcePlanLimit(organizationId, "proposalsCreated");
//   // …throws Error("Plan limit reached") when the org is at/over its cap.
//
// Resolution order for an org:
//   1. Load Subscription → its `plan` (slug-ish) + `currentPeriodEnd`.
//   2. Load the matching PricingPlan and parse its limitsJson.
//   3. Unlimited (absent/null/-1) → allow immediately, no count query.
//   4. Otherwise count usage (windowed for "monthly", lifetime for "absolute")
//      and compare.
// ─────────────────────────────────────────────────────────────────────────
import { db } from "@/lib/db";
import {
  parsePlanLimits,
  isUnlimited,
  LIMIT_DEFS,
  PLAN_LIMIT_MESSAGE,
  type LimitKey,
  type LimitScope,
  type PlanLimits,
} from "@/lib/planLimits";

export type LimitResource = LimitKey;

export interface LimitStatus {
  resource: LimitResource;
  /** The configured cap, or null when unlimited. */
  limit: number | null;
  /** Current usage within the relevant window. 0 when unlimited (count skipped). */
  used: number;
  /** limit - used, floored at 0; null when unlimited. */
  remaining: number | null;
  /** False when used >= limit (the next create would exceed the plan). */
  allowed: boolean;
}

const SCOPE_BY_KEY = new Map<LimitKey, LimitScope>(LIMIT_DEFS.map((d) => [d.key, d.scope]));

/** Start of the calendar month containing `d` (local time). */
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Day-clamped date for (year, month) — month over/underflow normalizes. */
function atAnchorDay(year: number, month: number, day: number): Date {
  const base = new Date(year, month, 1); // normalizes month rollover (e.g. -1 → prev Dec)
  const y = base.getFullYear();
  const m = base.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(day, lastDay));
}

/**
 * Start of the monthly usage window containing `now`, anchored to the billing
 * day-of-month from `anchor` (the subscription's period end). Returns the most
 * recent anchor-day boundary on or before `now`, so it is always day-safe and
 * never in the future — correct for monthly, annual, and lapsed subscriptions
 * alike. Falls back to the calendar month when there is no anchor (e.g. FREE).
 */
function monthlyCycleStart(anchor: Date | null, now: Date): Date {
  if (!anchor) return startOfMonth(now);
  const day = anchor.getDate();
  const thisMonth = atAnchorDay(now.getFullYear(), now.getMonth(), day);
  if (thisMonth.getTime() > now.getTime()) {
    return atAnchorDay(now.getFullYear(), now.getMonth() - 1, day);
  }
  return thisMonth;
}

/**
 * Resolve the org's effective limits + the start of the current monthly window.
 * The window is anchored to the subscription's billing day but always contains
 * `now` (see monthlyCycleStart). With no subscription / no period end (e.g.
 * FREE), it falls back to the calendar month.
 */
async function resolvePlan(
  organizationId: string,
): Promise<{ limits: PlanLimits; cycleStart: Date }> {
  const sub = await db.subscription.findUnique({
    where: { organizationId },
    select: { plan: true, currentPeriodEnd: true },
  });

  const cycleStart = monthlyCycleStart(
    sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null,
    new Date(),
  );

  const planKey = (sub?.plan ?? "FREE").toLowerCase();
  // Subscription.plan casing (e.g. "PROFESSIONAL") may differ from the
  // admin-entered PricingPlan.slug, and SQLite has no case-insensitive `mode`.
  // There are few plans, so match case-insensitively in JS to avoid a
  // mixed-case slug (e.g. "Professional") silently failing open to unlimited.
  const plans = await db.pricingPlan.findMany({ select: { slug: true, limitsJson: true } });
  const plan = plans.find((p) => p.slug.toLowerCase() === planKey) ?? null;

  return { limits: parsePlanLimits(plan?.limitsJson ?? null), cycleStart };
}

/** Count current usage for a resource. `cycleStart` is ignored for absolute scopes. */
async function countUsage(
  resource: LimitResource,
  organizationId: string,
  cycleStart: Date,
): Promise<number> {
  const since = { gte: cycleStart };
  switch (resource) {
    case "proposalsCreated":
      return db.proposal.count({ where: { organizationId, createdAt: since } });
    case "proposalsAccepted":
      // Count by the real acceptance timestamp so usage lands in the cycle it
      // actually happened (not whenever the row was last touched). Accepted
      // OR paid both imply acceptance.
      return db.proposal.count({
        where: { organizationId, OR: [{ acceptedAt: since }, { paidAt: since }] },
      });
    case "proposalsCompleted":
      // "Completed" === paid in this schema; count by the real paid timestamp.
      return db.proposal.count({
        where: { organizationId, paidAt: since },
      });
    case "calendarCards":
      return db.appointment.count({ where: { organizationId, startsAt: since } });
    case "calendarEvents":
      // JobEvent has no createdAt; window by the event's scheduled start.
      return db.jobEvent.count({ where: { organizationId, startsAt: since } });
    case "projects":
      return db.project.count({ where: { organizationId, createdAt: since } });
    case "jobs":
      return db.job.count({ where: { organizationId, createdAt: since } });
    case "workers":
      // Absolute — total seats regardless of cycle. A DECLINED invite frees its
      // seat, so it must not count against the plan limit.
      return db.workerProfile.count({
        where: { organizationId, inviteStatus: { not: "DECLINED" } },
      });
    case "estimatorUses":
      return db.aiEstimate.count({ where: { organizationId, createdAt: since } });
    default: {
      // Exhaustiveness guard: a new LimitKey without a counter is a bug.
      const _never: never = resource;
      throw new Error(`No usage counter for limit "${String(_never)}"`);
    }
  }
}

/**
 * Non-throwing check. Returns the org's current status for a single resource.
 * Skips the count query entirely when the resource is unlimited.
 */
export async function checkPlanLimit(
  organizationId: string,
  resource: LimitResource,
): Promise<LimitStatus> {
  const { limits, cycleStart } = await resolvePlan(organizationId);
  const cap = limits[resource];

  if (isUnlimited(cap)) {
    return { resource, limit: null, used: 0, remaining: null, allowed: true };
  }

  const limit = cap as number;
  const scope = SCOPE_BY_KEY.get(resource);
  const used = await countUsage(
    resource,
    organizationId,
    scope === "absolute" ? new Date(0) : cycleStart,
  );

  return {
    resource,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    allowed: used < limit,
  };
}

/**
 * Throwing enforcement. Call before creating a limited resource.
 * Throws Error("Plan limit reached") when the org is at/over its cap; otherwise
 * returns the LimitStatus so callers can surface remaining quota if useful.
 */
export async function enforcePlanLimit(
  organizationId: string,
  resource: LimitResource,
): Promise<LimitStatus> {
  const status = await checkPlanLimit(organizationId, resource);
  if (!status.allowed) {
    // Stable message so the client can detect this and raise the upgrade dialog.
    const err = new Error(PLAN_LIMIT_MESSAGE) as Error & {
      code?: string;
      resource?: string;
      limit?: number | null;
      used?: number;
    };
    err.code = "PLAN_LIMIT_REACHED";
    err.resource = resource;
    err.limit = status.limit;
    err.used = status.used;
    throw err;
  }
  return status;
}

/** Convenience: full usage snapshot across every limit for an org. */
export async function getOrgLimitUsage(organizationId: string): Promise<LimitStatus[]> {
  return Promise.all(LIMIT_DEFS.map((d) => checkPlanLimit(organizationId, d.key)));
}
