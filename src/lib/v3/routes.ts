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
  //
  // PROMOTED 2026-07-29: MobileDashboard also serves the LIVE /dashboard URL at
  // ≤768px, via the media-query switch in
  // src/components/v3/responsive-shell/responsive-dashboard-shell.tsx (mounted
  // from src/app/dashboard/layout.tsx). Above 768px /dashboard is still the
  // desktop BlueprintShell. This URL stays as the direct-review entry point;
  // both point at the same component, so there is nothing to keep in sync.
  mobileV2: "/mobile-v2",
  // jobflex-page-styler + mobile-app-ui-design — handheld rebuild of the
  // Proposals surface, responsive 320–768px. Sibling of mobileV2, same
  // (mobile) route group and same shell (dark topbar + hamburger drawer +
  // FAB, white paper). Covers every desktop component: 3 tabs with live
  // counts and a sliding rule, the per-tab masthead (one numeral + mono
  // kicker + exactly two annotations), 6 filter chips that inherit their
  // badge tones, all 7 status badges, ledger row cards (the 7-column table
  // re-cut for 320px), contract dossiers with BOTH payment variants
  // (≤5 instalments → columns, 6+ → row table with Remind), completion
  // tear-sheets with stat strip / checklist / photo boxes / receipt footer,
  // the "⋮" menu as a bottom sheet (5 tonal boxes + disabled + danger),
  // pagers and empty states. Donor demo fixture.
  //
  // PROMOTED 2026-07-29: same arrangement as mobileV2 — MobileProposals also
  // serves the LIVE /dashboard/proposals URL at ≤768px through
  // responsive-dashboard-shell.tsx. Above 768px that URL is unchanged.
  mobileProposalsV2: "/mobile-proposals-v2",
  // jobflex-page-styler + mobile-app-ui-design — handheld rebuild of the
  // Clients surface, responsive 320–768px. Third sibling of mobileV2 and
  // mobileProposalsV2: same (mobile) route group, same shell (dark topbar with
  // framed controls + hamburger drawer, cream paper, no FAB). Covers the whole
  // desktop sheet: CRM head + New client, computed masthead (one numeral +
  // mono kicker + exactly two annotations), the tag chip rail as ONE dropdown
  // (plus VIP and Untagged), the 7-column table re-cut as row cards with
  // initials avatars, VIP / multi-tag / untagged / zero-pipeline states, pager,
  // BOTH empty states, the "⋮" menu as a bottom sheet (5 tonal boxes, the
  // no-email row disabled, one danger), and the create-client modal as a sheet
  // with required-field validation and the drawn VIP toggle. Adds a search box
  // the desktop leaves to the global topbar — on a phone it is the fast route
  // to a named client. Donor demo fixture.
  //
  // Also serves the LIVE /dashboard/clients URL at ≤768px via
  // responsive-dashboard-shell.tsx. Above 768px that URL is unchanged.
  mobileClientsV2: "/mobile-clients-v2",
  // ── The batch of nine, 2026-07-29 ────────────────────────────────────────
  // Same skills, same (mobile) route group, same shell — but these are the
  // first pages built on the EXTRACTED nav
  // (src/components/v3/mobile-shell/mobile-nav.tsx + sprite.tsx) instead of
  // carrying a private copy of the drawer, so the chrome is one implementation
  // across the whole handheld family. One agent per page, built in parallel
  // against the three shipped siblings as the spec.
  //
  // All nine also serve their LIVE /dashboard/* URL at ≤768px via
  // responsive-dashboard-shell.tsx. Above 768px those URLs are unchanged.
  // These /mobile-*-v2 URLs stay as direct-review entry points; both point at
  // the same component, so there is nothing to keep in sync.
  mobileLeadsV2: "/mobile-leads-v2",
  mobileProjectsV2: "/mobile-projects-v2",
  mobileCrmV2: "/mobile-crm-v2",
  mobileCalendarV2: "/mobile-calendar-v2",
  mobileJobsV2: "/mobile-jobs-v2",
  mobileWorkersV2: "/mobile-workers-v2",
  mobileHireV2: "/mobile-hire-v2",
  mobileCompanyV2: "/mobile-company-v2",
  mobileFinancialsV2: "/mobile-financials-v2",
  // ── The Automation section, 2026-07-30 ───────────────────────────────────
  // The ten remaining drawer surfaces, completing the handheld family at 22.
  // Unlike every batch before it, these are mostly NOT ledgers: a stepped
  // composer, two drawing tools that render the takeoff as an SVG blueprint
  // plan (no map — network calls are out of scope and there are no keys in
  // this build), a dialer, a thread view, three feeds, a board and a charts
  // page. Same shared nav, tokens and motion; very different insides.
  //
  // All ten also serve their LIVE /dashboard/* URL at ≤768px via
  // responsive-dashboard-shell.tsx. Above 768px those URLs are unchanged.
  //
  // NOTE: mobileSmartProposalV2 is the Smart Proposal surface. Its route slug
  // is /dashboard/advanced-ai for historical reasons, but "AI" must never
  // appear in the interface — the feature is called Smart Proposal.
  mobileSmartProposalV2: "/mobile-advanced-ai-v2",
  mobileRoofEstimatorV2: "/mobile-roof-estimator-v2",
  mobileFenceEstimatorV2: "/mobile-fence-estimator-v2",
  mobilePhoneV2: "/mobile-phone-v2",
  mobileMessagesV2: "/mobile-messages-v2",
  mobileReviewsV2: "/mobile-reviews-v2",
  mobileTradeV2: "/mobile-trade-v2",
  mobileReferralsV2: "/mobile-referrals-v2",
  mobileReportsV2: "/mobile-reports-v2",
  // Review harness for the estimator picker, which is the one handheld surface
  // with no route of its own: it is a `position: fixed` dialog mounted in both
  // shells and opened by the `jf:estimator-picker` document event, so no URL
  // puts it on screen. This one does — it mounts <MobileNav /> (the real
  // handheld host, which mounts the real dialog) and dispatches that event on
  // load. Deliberately NOT auth-gated, unlike the rest of the fleet: the
  // picker's roster is a static fixture, so there is nothing to gate, and a
  // harness that answers 307 cannot be reviewed.
  mobileEstimatorPickerV2: "/mobile-estimator-picker-v2",
  // ── Handheld auth, mobile-v1 ─────────────────────────────────────────────
  // jobflex-page-styler + mobile-app-ui-design. A handheld-first Blueprint
  // build of the sign-in surface, fluid 320–768px, shipped BESIDE the desktop
  // /auth/login (which is untouched) per the mobile route strategy. Composition:
  // full-bleed ink drafting band (graph grid + blueprint wash, brand, kicker,
  // H1, and a mono annotation naming the ?next= destination when there is one)
  // → a paper form sheet clipped over it with a 5px hard ink shadow → blueprint
  // CTA → Google → proof title block. Real NextAuth wiring, carried verbatim
  // from the desktop page: same signIn() calls, same three error branches, same
  // ?next= open-redirect guard. Data layer untouched.
  //
  // NOT gated by middleware (it is the sign-in page). Styles are a PLAIN
  // stylesheet with a uniform `.jf-mobile-auth-login` root-class prefix, not a
  // CSS Module — see src/components/v3/mobile-auth-login/mobile-auth-login.css.
  mobileAuthLoginV1: "/mobile-v1/auth/login",
  // ── Handheld marketing landing ───────────────────────────────────────────
  // jobflex-page-styler + mobile-app-ui-design. The handheld rebuild of the
  // marketing landing, fluid 320–768px. Unlike its (mobile) siblings this is
  // a PUBLIC page (no auth gate, no data layer) and it is not a second URL for
  // the same content: /landing itself now serves this build at <= 768px via a
  // media-query switch in src/app/(marketing)/landing/landing-responsive.tsx.
  // This entry is the direct preview, so the composition can be reviewed at any
  // viewport width. Both entry points import the same component from
  // src/components/v3/mobile-landing/, so they cannot drift.
  mobileLandingV2: "/mobile-landing-v2",
  // ── Handheld project detail ──────────────────────────────────────────────
  // jobflex-page-styler + mobile-app-ui-design. The handheld rebuild of the
  // project detail surface, fluid 320–768px, on real project data (same
  // queries and the same attachJob server action as the desktop page — the
  // data layer is untouched). This entry is the direct preview, keyed by id;
  // the LIVE /dashboard/projects/[id] serves the same component at <= 768px
  // via the media-query switch in
  // src/components/v3/mobile-project-detail/project-detail-viewport-switch.tsx,
  // so both entry points import one implementation and cannot drift. Styles
  // are a PLAIN stylesheet with a uniform `.jf-mobile-project-detail` root-class
  // prefix, not a CSS Module.
  mobileProjectDetailV2: "/mobile-project-detail-v2",
  // ── Client-facing proposal, handheld ─────────────────────────────────────
  // jobflex-page-styler + mobile-app-ui-design. The page a homeowner opens
  // from a proposal email — and the PayPal/Square checkout return_url — rebuilt
  // for the phone it is almost always opened on. Fluid 320–768px, no shell
  // (the `(portal)` group has no layout.tsx and must not grow one: the reader
  // is a homeowner, not a signed-in contractor). Composition: monogram header
  // with a 44px framed PDF control → white intro card with a hard ink shadow,
  // kicker, caps H1 and the Total / Valid-until fact pair → Overview → the
  // estimate ledger → Scope → payment schedule re-cut as two-line rows → the
  // ink call-out with the phone as a 48px plate → footer; plus a STICKY action
  // bar carrying Accept (blueprint fill) with Pay-now and Decline beneath it,
  // the three checkout providers moved into a bottom sheet. Real proposal
  // data, read on the server; data layer untouched.
  //
  // Styles are a PLAIN stylesheet with a uniform `.jf-mobile-proposal-client`
  // root-class prefix, NOT a CSS Module — see the header of
  // src/components/v3/mobile-proposal-client/mobile-proposal-client.css.
  //
  // ALSO SERVES THE LIVE /portal/q/<publicId> URL at ≤768px, through the
  // media-query switch in
  // src/app/(portal)/portal/q/[publicId]/portal-viewport.tsx. Above 768px that
  // URL is unchanged. This entry is the direct preview, keyed by publicId;
  // both entry points import one implementation and cannot drift. The single
  // deliberate difference: the preview route does NOT write the VIEWED
  // side-effect, so reviewing a layout cannot inflate a real client's view
  // count.
  mobileProposalClientV2: "/mobile-proposal-client-v2",
  // jobflex-page-styler + mobile-app-ui-design — handheld rebuild of the
  // PUBLIC homeowner marketing page, responsive 320–768px. Standalone: its own
  // sticky ink nav and footer, no blueprint-shell, no MobileNav.
  // Composition: hero + the four-step intake wizard on a sticky bottom action
  // bar (category picker re-laid-out as a bottom sheet) → trust strip → four
  // stacked live vignettes → the ink band with the four full-width blueprint
  // drawings and the count-up → a two-column photo board + three reviews →
  // ink CTA → footer.
  //
  // Styles are a PLAIN stylesheet with a uniform `.jf-mobile-homeowner` root
  // class prefix, NOT a CSS Module — see the header of
  // src/components/v3/mobile-homeowner/mobile-homeowner.css.
  //
  // ALSO SERVES THE LIVE /homeowner URL at ≤768px, through the media-query
  // switch in src/app/(marketing)/homeowner/homeowner-responsive.tsx. Above
  // 768px that URL still serves the untouched desktop build. Both entry points
  // import one implementation and cannot drift.
  mobileHomeownerV2: "/mobile-homeowner-v2",
  // jobflex-page-styler + mobile-app-ui-design — handheld rebuild of the
  // SUBSCRIPTION / BILLING surface, responsive 320–768px, on the shared
  // MobileNav chrome. Composition: page head → plan-limit banner (raised only
  // by a real cap at ≥90%) → ink plan hero with the rotated status stamp →
  // pressure-sorted usage meters + the change-plan bottom sheet → stacked plan
  // cards with the current plan pinned first → invoice ROWS (the desktop table
  // cannot hold 320px) → refer & earn with the 3-cell KPI strip.
  //
  // Styles are a PLAIN stylesheet with a uniform `.jf-mobile-subscription`
  // root class prefix, NOT a CSS Module — see the header of
  // src/components/v3/mobile-subscription/mobile-subscription.css.
  //
  // REAL BILLING DATA on both entry points, never a fixture: the admin plan
  // catalog, the limits engine, live Stripe invoices and the org's referral
  // code, through the shared loader in the live route's folder. Owner-only on
  // both, like the live page.
  //
  // ALSO SERVES THE LIVE /dashboard/subscription URL at ≤768px, through the
  // media-query switch in
  // src/app/(dashboard)/dashboard/subscription/subscription-responsive.tsx.
  // Above 768px that URL still serves the untouched desktop view. Both entry
  // points import one implementation and cannot drift.
  mobileSubscriptionV2: "/mobile-subscription-v2",
  // jobflex-page-styler + mobile-app-ui-design — handheld rebuild of the JOB
  // DETAIL surface, fluid 320–768px, on the shared MobileNav chrome. Stands
  // BESIDE the desktop /dashboard/jobs/[id] (src/components/v3/
  // job-detail-blueprint/*), which serves its own build above 768px and this
  // one below it; this is a preview URL, keyed by id, that always draws the
  // handheld composition whatever the width.
  //
  // Composition: page head (kicker + status badge, caps H1, mono date line) →
  // the six-tab bar re-cut as a horizontally scrolling ink-framed rail that
  // keeps the mono counts and the ink-fill active state, auto-centring the
  // active tab → one view per tab (Overview's 2fr/1fr grid stacked, Client
  // contact following it as its own card; fields 4-up → 2-up; photos 4-up →
  // 2-up; the change-order 4-column grid restacked into an identity block over
  // an amount / badge / Approve strip) → a thumb-zone action bar carrying
  // "View proposal", the one action the desktop head shows on all six tabs.
  //
  // REAL DATA, ONE READ: both this URL and /dashboard/jobs/[id] load the Job
  // behind `[id]` through job-detail-blueprint/job-detail-load.ts, so the two
  // pages can only disagree about layout. Writes reuse the existing actions
  // (updateJob / createJobEvent / assignWorker / unassignAssignment /
  // uploadJobPhoto / sendChangeOrder / approveChangeOrderPublic) — no new
  // action, API route or Prisma change.
  //
  // Styles are a PLAIN stylesheet with a uniform `.jf-mobile-job-detail` root
  // class prefix, NOT a CSS Module — see the header of
  // src/components/v3/mobile-job-detail/mobile-job-detail.css.
  mobileJobDetailV1: "/mobile-job-detail-v1",
  // jobflex-page-styler + mobile-app-ui-design — handheld re-cut of the Smart
  // Proposal ESTIMATE (result) screen, fluid 320–768px. A sibling preview URL
  // beside the desktop /dashboard/advanced-ai, which is untouched.
  //
  // Estimate ONLY: the intake console (project type / location / brief /
  // Generate) is deliberately not ported, so this URL opens straight onto the
  // sheet. Distinct from mobileSmartProposalV2 (/mobile-advanced-ai-v2), which
  // is the step-by-step console build.
  //
  // Composition: summary hoisted above the ledgers → materials / labor with
  // each four-column row cut into name-then-[qty × unit … line total] →
  // materials request in two bands → scope → assumptions (split out of the
  // summary) → the three-stage "change the estimate" → a sticky thumb-zone bar
  // carrying the live total and "Send to proposal".
  //
  // Styles are a PLAIN stylesheet with a uniform `.jf-mobile-smart-estimate`
  // root class prefix, NOT a CSS Module — see the header of
  // src/components/v3/mobile-smart-estimate/mobile-smart-estimate.css.
  //
  // Donor fixture only (advanced-ai-data.ts): no server actions, no API routes,
  // no Prisma.
  mobileSmartEstimateV1: "/mobile-smart-estimate-v1",
} as const;

export type V3RouteKey = keyof typeof V3_PORTED_ROUTES;

/**
 * Resolve a v3 route by key. Pass keys, not raw paths — that way any v3 path
 * rename happens here once instead of being chased across pages.
 */
export function v3Link(route: V3RouteKey): string {
  return V3_PORTED_ROUTES[route];
}
