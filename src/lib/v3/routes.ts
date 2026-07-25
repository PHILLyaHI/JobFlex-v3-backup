// Central registry of v3-ported routes. Anything that has a v3 sibling lives
// here so internal links use a single source of truth and we can sweep them
// during the v3 → main port.
//
// IMPORTANT: only add the entry for the page you own — never delete or
// overwrite another agent's entry. If you must edit a sibling entry the
// user will resolve the merge by keeping both.
export const V3_PORTED_ROUTES = {
  manualBuilderA: "/v3/proposals/manual-builder-a",
  // Frontend-design calendar redesign. Lives under
  // app/v3/(dashboard)/calendar-a. The same CalendarViewA orchestrator now
  // also serves the live /dashboard/calendar page — both routes share it via
  // src/components/v3/calendar-a/*.
  "calendar-a": "/v3/calendar-a",
  // From-scratch desktop-first workers page. Lives under
  // app/v3/(dashboard)/workers-new. The same WorkersLedger component is now
  // also the live /dashboard/workers page — both routes share it via
  // src/components/v3/workers-new/workers-ledger.tsx.
  "workers-new": "/v3/workers-new",
  // Frontend-design proposals redesign — Pressroom edition. Three-tab layout
  // (All / Accepted / Completed) with masthead revenue headlines. Duplicate of
  // the live proposals page; original at /dashboard/proposals stays untouched.
  proposalsC: "/v3/proposals-c",
  // jobflex-page-styler proposals redesign — Blueprint edition ("The Proposal
  // Ledger", Sheet 02 of the dashboard-v2 family). Server-rendered ledger with
  // searchParams status filters. Original at /dashboard/proposals untouched.
  proposalsBlueprint: "/v3/proposals",
  // Pixel-identical port of the canonical blueprint dashboard donor
  // (.claude/skills/jobflex-page-styler/assets/jobflex-dashboard-blueprint.html):
  // sidebar + topbar + dashboard with the donor's demo data and behaviors.
  // PROMOTED: the shared BlueprintDashboard (src/components/v3/dashboard-blueprint/)
  // now also serves the live /dashboard page (hoisted to src/app/dashboard/,
  // outside the (dashboard) group so the classic shell doesn't double-wrap it).
  dashboardBlueprint: "/v3/dashboard",
  // jobflex-page-styler proposals redesign — "The Proposal Desk". The reference
  // dashboard's real app shell (sidebar + topbar) on the proposals surface:
  // KPI strip, clickable status funnel, estimate-style book with client-side
  // filter/sort/search, live org data. Original at /dashboard/proposals untouched.
  proposalsV2: "/v3/proposals-v2",
  // jobflex-page-styler proposals redesign — Blueprint edition of the LIVE
  // page's structure: dateline head → revenue masthead → All/Accepted/
  // Completed tabs → ledger / accepted dossiers / completed tear-sheets,
  // in the reference app shell. Original at /dashboard/proposals untouched.
  proposalsV3: "/v3/proposals-v3",
  // Pixel-identical port of the canonical proposals donor
  // (jobflex-proposals-blueprint.html): masthead, tabs, status chips, table,
  // accepted job cards, completed sheets, row context menu, pagers, FLUID
  // SCALE + mobile drawer — donor demo data and behaviors verbatim. Shared
  // component at src/components/v3/proposals-blueprint/.
  // PROMOTED: also serves the live /dashboard/proposals list (hoisted to
  // src/app/dashboard/proposals/, outside the (dashboard) group; child
  // routes new/create/[id]/ai/templates keep the classic layout).
  proposalsBlueprintDonor: "/v3/proposals-blueprint",
  // jobflex-page-styler + mobile-app-ui-design — handheld rebuild of the
  // Overview surface, responsive 320–768px. Lives in the (mobile) route group
  // per the mobile route strategy, so the URL carries no /v3 prefix.
  // Composition: masthead hero numeral + 3-up KPI strip, recent activity →
  // this week (5-day work strip) → upcoming jobs → touch-scrub revenue chart
  // on a re-cut plot box → swipeable Lead Flow rail with a tap-to-move bottom
  // sheet. Navigation is the reference sidebar as a hamburger drawer (the
  // bottom tab bar was tried and dropped at the owner's call, 2026-07-24).
  // Donor demo fixture; desktop /dashboard and /v3/dashboard untouched.
  //
  // NOTE: sibling experiments /mobile-v1 and /mobile-v3 were deleted on
  // 2026-07-24 at the owner's request — mobile-v2 is the surviving direction.
  mobileV2: "/mobile-v2",
} as const;

export type V3RouteKey = keyof typeof V3_PORTED_ROUTES;

/**
 * Resolve a v3 route by key. Pass keys, not raw paths — that way any v3 path
 * rename happens here once instead of being chased across pages.
 */
export function v3Link(route: V3RouteKey): string {
  return V3_PORTED_ROUTES[route];
}
