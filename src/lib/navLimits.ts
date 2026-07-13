// Server-only plain module (NOT "use server" — mirrors badgeCounts.ts so it
// can't be invoked as an unauthenticated POST endpoint; the layout passes a
// trusted organizationId).
//
// Maps sidebar nav hrefs to their metered resource(s) and returns the
// remaining/limit pair for each LIMITED one. Unlimited resources are simply
// absent, so the sidebar renders no counter for them. When one nav surface is
// governed by two quotas (calendar: job events + appointment cards), the
// tighter remaining wins.
import { getOrgLimitUsage } from "@/lib/limitsEngine";
import type { LimitKey } from "@/lib/planLimits";

export interface NavLimitInfo {
  remaining: number;
  limit: number;
  /** The tighter resource bounding this one (e.g. estimators tied to proposals). */
  cappedBy?: LimitKey;
}

const NAV_LIMIT_KEYS: Record<string, LimitKey[]> = {
  "/dashboard/proposals": ["proposalsCreated"],
  "/dashboard/leads": ["leads"],
  "/dashboard/projects": ["projects"],
  "/dashboard/calendar": ["calendarEvents", "calendarCards"],
  "/dashboard/jobs": ["jobs"],
  "/dashboard/workers": ["workers"],
  "/dashboard/messages": ["messagesSent"],
  "/dashboard/phone": ["aiPhoneCalls"],
  "/dashboard/reviews": ["reviewRequests"],
  // All three AI estimators share the estimatorUses pool, which is itself
  // capped by proposalsCreated — so each shows the same proposal-bounded count.
  "/dashboard/advanced-ai": ["estimatorUses"],
  "/dashboard/advanced-ai/roof": ["estimatorUses"],
  "/dashboard/advanced-ai/fence/studio": ["estimatorUses"],
};

export async function getNavLimitCounters(
  organizationId: string,
): Promise<Record<string, NavLimitInfo>> {
  // One plan resolution + one COUNT per limited key (unlimited keys cost
  // nothing) — cheap enough to run on every dashboard layout render.
  const usage = await getOrgLimitUsage(organizationId);
  const byKey = new Map(usage.map((s) => [s.resource, s]));

  const out: Record<string, NavLimitInfo> = {};
  for (const [href, keys] of Object.entries(NAV_LIMIT_KEYS)) {
    let tightest: NavLimitInfo | null = null;
    for (const key of keys) {
      const s = byKey.get(key);
      if (!s || s.limit === null || s.remaining === null) continue;
      if (!tightest || s.remaining < tightest.remaining) {
        tightest = { remaining: s.remaining, limit: s.limit, cappedBy: s.cappedBy };
      }
    }
    if (tightest) out[href] = tightest;
  }
  return out;
}
