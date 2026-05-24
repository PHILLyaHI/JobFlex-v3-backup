// Central registry of v3-ported routes. Anything that has a v3 sibling lives
// here so internal links use a single source of truth and we can sweep them
// during the v3 → main port.
//
// IMPORTANT: only add the entry for the page you own — never delete or
// overwrite another agent's entry. If you must edit a sibling entry the
// user will resolve the merge by keeping both.
export const V3_PORTED_ROUTES = {
  manualBuilderA: "/v3/proposals/manual-builder-a",
  // The frontend-design build of the calendar redesign. Lives under
  // app/v3/(dashboard)/calendar-a — the `(dashboard)` segment is a route
  // group, so it does not appear in the URL.
  "calendar-a": "/v3/calendar-a",
  company: "/v3/company",
  companyLandingBuilder: "/v3/company/landing-builder",
  companyTeam: "/v3/company/team",
  companySubscription: "/v3/company/subscription",
  // From-scratch desktop-first workers page. Lives under
  // app/v3/(dashboard)/workers-new. The same WorkersLedger component is now
  // also the live /dashboard/workers page — both routes share it via
  // src/components/v3/workers-new/workers-ledger.tsx.
  "workers-new": "/v3/workers-new",
} as const;

export type V3RouteKey = keyof typeof V3_PORTED_ROUTES;

/**
 * Resolve a v3 route by key. Pass keys, not raw paths — that way any v3 path
 * rename happens here once instead of being chased across pages.
 */
export function v3Link(route: V3RouteKey): string {
  return V3_PORTED_ROUTES[route];
}
