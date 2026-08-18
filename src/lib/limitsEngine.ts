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
//   1. Load Subscription → `plan` + `status` + `currentPeriodEnd` + `trialEndsAt`.
//   2. Lapsed check: PAST_DUE/CANCELED/EXPIRED — or ACTIVE past periodEnd +
//      3-day grace, or TRIALING past trialEndsAt — resolves to the "free"
//      catalog plan (DEFAULT_FREE_LIMITS if no such row) instead of the paid one.
//   3. Load the matching PricingPlan and parse its limitsJson.
//   4. Unlimited (absent/null/-1) → allow immediately, no count query.
//   5. Otherwise count usage (windowed for "monthly", lifetime for "absolute")
//      and compare.
//
// Intentional ALLOW-BUT-COUNT paths (client/public-triggered creation is never
// blocked; the rows still count toward usage so the org hits its cap on its
// own actions). Keep this list current — it is the audit point:
//   - public quote accept → src/lib/jobFromProposal.ts (Job + JobEvent)
//   - public homeowner form → src/actions/homeowner.ts + api/homeowner-request (Lead)
//   - AI-call lead capture → createLeadFromCall (Lead)
//   - auto job-completion review ask → src/lib/reviewRequestInternal.ts
//   - auto job-crew thread → src/lib/jobConversation.ts (JOB kind, excluded
//     from the conversationsStarted counter entirely)
// Exception by product decision: over-limit inbound AI phone calls ARE blocked
// (polite unavailable TwiML in api/twilio/voice).
// ─────────────────────────────────────────────────────────────────────────
import { db } from "@/lib/db";
import {
  parsePlanLimits,
  isUnlimited,
  DEFAULT_FREE_LIMITS,
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
  /**
   * Effective remaining. Normally limit - used (floored at 0), but for a
   * "capped by" resource (see CAPPED_BY) it can be lowered by the capping
   * resource's remaining. null when unlimited.
   */
  remaining: number | null;
  /** False when the next create(s) would exceed this OR its capping resource. */
  allowed: boolean;
  /**
   * Set when another resource's remaining is the tighter constraint on this
   * one (e.g. estimatorUses limited by proposalsCreated because every estimate
   * becomes a proposal). Drives the "tied to proposals" upsell copy and the
   * blocking-resource attribution.
   */
  cappedBy?: LimitResource;
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

/** Tolerates renewal-webhook lag before an ACTIVE/TRIALING sub is treated as lapsed. */
const LAPSE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * A lapsed subscription is enforced at FREE limits — this is what closes the
 * "cancel/stop paying, keep the paid quotas" hole. FREE-status subs already
 * resolve to the free plan; ACTIVE gets a 3-day grace past currentPeriodEnd
 * for webhook lag; TRIALING lapses when the trial (or period) ends; every
 * other status (PAST_DUE, CANCELED, EXPIRED, unknown) lapses immediately.
 */
function isLapsed(
  sub: { status: string; currentPeriodEnd: Date | null; trialEndsAt: Date | null } | null,
  now: Date,
): boolean {
  if (!sub || sub.status === "FREE") return false;
  const periodOver =
    !!sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() + LAPSE_GRACE_MS < now.getTime();
  if (sub.status === "ACTIVE") return periodOver;
  if (sub.status === "TRIALING") {
    const trialOver = !!sub.trialEndsAt && sub.trialEndsAt.getTime() < now.getTime();
    return trialOver || periodOver;
  }
  return true;
}

/**
 * Resolve the org's effective limits + the start of the current monthly window.
 * The window is anchored to the subscription's billing day but always contains
 * `now` (see monthlyCycleStart). With no subscription / no period end (e.g.
 * FREE), it falls back to the calendar month. Lapsed subscriptions resolve to
 * the "free" catalog plan (see isLapsed).
 */
async function resolvePlan(
  organizationId: string,
): Promise<{ limits: PlanLimits; cycleStart: Date }> {
  const sub = await db.subscription.findUnique({
    where: { organizationId },
    select: { plan: true, status: true, currentPeriodEnd: true, trialEndsAt: true },
  });

  const now = new Date();
  const cycleStart = monthlyCycleStart(
    sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null,
    now,
  );

  const lapsed = isLapsed(sub, now);
  const planKey = lapsed ? "free" : (sub?.plan ?? "FREE").toLowerCase();
  // Subscription.plan casing (e.g. "PROFESSIONAL") may differ from the
  // admin-entered PricingPlan.slug, and SQLite has no case-insensitive `mode`.
  // There are few plans, so match case-insensitively in JS to avoid a
  // mixed-case slug (e.g. "Professional") silently failing open to unlimited.
  const plans = await db.pricingPlan.findMany({ select: { slug: true, limitsJson: true } });
  const plan = plans.find((p) => p.slug.toLowerCase() === planKey) ?? null;

  // A lapsed org with no "free" catalog row must not fail open to unlimited.
  if (lapsed && !plan) return { limits: { ...DEFAULT_FREE_LIMITS }, cycleStart };

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
    case "conversationsStarted":
      // JOB-kind threads are auto-created from a job's crew (ensureJobConversation)
      // and must not burn quota; only user-started threads count.
      return db.conversation.count({
        where: { organizationId, createdAt: since, kind: { not: "JOB" } },
      });
    case "messagesSent":
      // Message carries no organizationId; scope through its conversation.
      return db.message.count({
        where: { createdAt: since, conversation: { organizationId } },
      });
    case "leads":
      return db.lead.count({ where: { organizationId, createdAt: since } });
    case "aiPhoneCalls":
      return db.aiPhoneCall.count({ where: { organizationId, startedAt: since } });
    case "reviewRequests":
      return db.reviewRequest.count({ where: { organizationId, createdAt: since } });
    case "teamSeats": {
      // Absolute — office seats: non-INSTALLER members plus live pending
      // invites (a pending invite reserves its seat so acceptInvite never gets
      // stranded by a limit lowered after the invite went out). INSTALLER
      // seats are metered separately by "workers" (WorkerProfile).
      const [members, pending] = await Promise.all([
        db.membership.count({ where: { organizationId, role: { not: "INSTALLER" } } }),
        db.invite.count({
          where: {
            organizationId,
            acceptedAt: null,
            expiresAt: { gt: new Date() },
            role: { not: "INSTALLER" },
          },
        }),
      ]);
      return members + pending;
    }
    default: {
      // Exhaustiveness guard: a new LimitKey without a counter is a bug.
      const _never: never = resource;
      throw new Error(`No usage counter for limit "${String(_never)}"`);
    }
  }
}

// Cross-resource caps. A key here has its effective remaining bounded by the
// remaining of its capping resource, because consuming one consumes the other
// downstream. AI / roof / fence estimates (all metered as "estimatorUses") each
// get converted into a proposal, so an org can never have more estimate
// headroom than proposal headroom — even with estimate quota untouched. The
// bound is one-directional: burning proposals shrinks estimate headroom, but
// running an estimate does NOT consume a proposal until it's converted.
const CAPPED_BY: Partial<Record<LimitResource, LimitResource>> = {
  estimatorUses: "proposalsCreated",
};

/** Own status for one resource (before any cross-resource cap is applied). */
async function rawStatusFor(
  limits: PlanLimits,
  cycleStart: Date,
  organizationId: string,
  resource: LimitResource,
  needed = 1,
): Promise<LimitStatus> {
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
    allowed: used + needed <= limit,
  };
}

/** Fold a capping resource's headroom into a resource's own status. */
function applyCap(own: LimitStatus, cap: LimitStatus, needed: number): LimitStatus {
  // An unlimited capping resource never constrains.
  if (cap.remaining === null) return own;
  const ownRemaining = own.remaining === null ? Infinity : own.remaining;
  const effRemaining = Math.min(ownRemaining, cap.remaining);
  return {
    ...own,
    remaining: effRemaining === Infinity ? null : effRemaining,
    // Blocked if EITHER resource lacks headroom for `needed`.
    allowed: own.allowed && cap.remaining >= needed,
    // Annotate only when the cap is the strictly tighter constraint, so the UI
    // and blocking attribution point at the resource actually running out.
    cappedBy: cap.remaining < ownRemaining ? cap.resource : own.cappedBy,
  };
}

/** Status for one resource, with any cross-resource cap (CAPPED_BY) applied. */
async function statusFor(
  limits: PlanLimits,
  cycleStart: Date,
  organizationId: string,
  resource: LimitResource,
  needed = 1,
): Promise<LimitStatus> {
  const own = await rawStatusFor(limits, cycleStart, organizationId, resource, needed);
  const capKey = CAPPED_BY[resource];
  if (!capKey) return own;
  // The capping resource is never itself capped, so this doesn't recurse.
  const cap = await rawStatusFor(limits, cycleStart, organizationId, capKey, needed);
  return applyCap(own, cap, needed);
}

/**
 * Non-throwing check. Returns the org's current status for a single resource.
 * Skips the count query entirely when the resource is unlimited. `needed` is
 * the headroom required (bulk creates like CSV imports pass their row count).
 */
// 2026-08-14 (owner's call): quota enforcement disabled app-wide together with
// the entitlements gates (src/lib/entitlements.ts) — no "Plan limit reached"
// upsells anywhere. Flip to false to restore the engine untouched below.
const LIMITS_DISABLED = true;

export async function checkPlanLimit(
  organizationId: string,
  resource: LimitResource,
  needed = 1,
): Promise<LimitStatus> {
  if (LIMITS_DISABLED) {
    return { resource, limit: null, used: 0, remaining: null, allowed: true };
  }
  const { limits, cycleStart } = await resolvePlan(organizationId);
  return statusFor(limits, cycleStart, organizationId, resource, needed);
}

/**
 * Throwing enforcement. Call before creating a limited resource.
 * Throws Error("Plan limit reached") when the org is at/over its cap; otherwise
 * returns the LimitStatus so callers can surface remaining quota if useful.
 * `needed` = how many the caller is about to create (default 1).
 */
export async function enforcePlanLimit(
  organizationId: string,
  resource: LimitResource,
  needed = 1,
): Promise<LimitStatus> {
  const status = await checkPlanLimit(organizationId, resource, needed);
  if (!status.allowed) {
    // Stable message so the client can detect this and raise the upgrade dialog.
    const err = new Error(PLAN_LIMIT_MESSAGE) as Error & {
      code?: string;
      resource?: string;
      limit?: number | null;
      used?: number;
    };
    err.code = "PLAN_LIMIT_REACHED";
    // Attribute the block to whatever actually ran out: the capping resource
    // (e.g. proposals) when it's the tighter constraint, else this resource.
    err.resource = status.cappedBy ?? resource;
    err.limit = status.limit;
    err.used = status.used;
    throw err;
  }
  return status;
}

/**
 * Convenience: full usage snapshot across every limit for an org. Resolves the
 * plan ONCE and runs one COUNT per *limited* key (unlimited keys cost zero
 * queries), so it is cheap enough for per-render use (sidebar counters).
 */
export async function getOrgLimitUsage(organizationId: string): Promise<LimitStatus[]> {
  if (LIMITS_DISABLED) {
    return LIMIT_DEFS.map((d) => ({
      resource: d.key,
      limit: null,
      used: 0,
      remaining: null,
      allowed: true,
    }));
  }
  const { limits, cycleStart } = await resolvePlan(organizationId);
  return Promise.all(
    LIMIT_DEFS.map((d) => statusFor(limits, cycleStart, organizationId, d.key)),
  );
}
