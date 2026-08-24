"use client";

// Viewport switch for the promoted blueprint routes.
//
// /dashboard and /dashboard/proposals now serve BOTH designs from one URL: the
// desktop blueprint shell above 768px, the handheld rebuild at or below it.
// The switch is a MEDIA QUERY, never the user agent — the mobile-first rule
// forbids UA detection, and a query is also the only thing that makes DevTools'
// device toolbar work: drag the viewport under 768px and the surface swaps
// live, no reload and no second URL to remember.
//
// Exactly one tree is mounted, never both. That matters more than it looks.
// The mobile shell is `position: fixed; inset: 0` and its mount effect sets
// `body { overflow: hidden }` — rendering it on top of a live desktop shell
// would strand the desktop page's scroll and leave twenty-odd sidebar links
// sitting in the tab order underneath an opaque overlay.
//
// Routes with no handheld build yet (/dashboard/leads, /jobs, /crm, /calendar,
// …) fall through to the desktop shell at every width, deliberately: a page
// you have to pan around beats a half-built mobile one.

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { BlueprintShell } from "@/components/v3/blueprint-shell/blueprint-shell";
import { NavRoleProvider, type NavIdentity } from "@/components/v3/blueprint-shell/nav-role";
import { ChunkRecoveryBoundary } from "@/components/v3/shared/chunk-recovery-boundary";
import { SupportWidget } from "@/components/v3/support-widget/support-widget";
import { MarkNavSeen } from "@/components/layout/MarkNavSeen";
import type { SeenKey } from "@/lib/badgeCounts";

/** CLAUDE.md's handheld target: ≤768px. Matches the mobile modules' own scale. */
const HANDHELD = "(max-width: 768px)";

// Paper-coloured full-bleed hold for the one chunk fetch that happens when the
// viewport first crosses 768px. Without it `dynamic` renders null and the swap
// blinks through to whatever is behind the app — reads as a crash rather than
// a load. Inline styles on purpose: this has to paint before any CSS module
// for the tree it is standing in for has been fetched, which is also why the
// #f2f0eb drafting cream is written out rather than read from --paper.
const MobileHold = () => (
  <div style={{ position: "fixed", inset: 0, zIndex: 20, background: "#f2f0eb" }} />
);

// The mobile route components, imported out of the (mobile) group rather than
// copied, so /mobile-v2 and /dashboard cannot drift apart — there is one
// implementation with two entry points. Lazy so a desktop visitor never
// downloads either bundle; /dashboard is the app's busiest page and should not
// carry a handheld build it will not render.
const MobileDashboard = dynamic(
  () => import("@/app/(mobile)/mobile-v2/mobile-dashboard").then((m) => m.MobileDashboard),
  { ssr: false, loading: MobileHold },
);
const MobileProposals = dynamic(
  () => import("@/app/(mobile)/mobile-proposals-v2/mobile-proposals").then((m) => m.MobileProposals),
  { ssr: false, loading: MobileHold },
);
const MobileClients = dynamic(
  () => import("@/app/(mobile)/mobile-clients-v2/mobile-clients").then((m) => m.MobileClients),
  { ssr: false, loading: MobileHold },
);
// Batch of nine, 2026-07-29: one agent per page, all on the shared MobileNav.
const MobileLeads = dynamic(
  () => import("@/app/(mobile)/mobile-leads-v2/mobile-leads").then((m) => m.MobileLeads),
  { ssr: false, loading: MobileHold },
);
const MobileProjects = dynamic(
  () => import("@/app/(mobile)/mobile-projects-v2/mobile-projects").then((m) => m.MobileProjects),
  { ssr: false, loading: MobileHold },
);
const MobileCrm = dynamic(
  () => import("@/app/(mobile)/mobile-crm-v2/mobile-crm").then((m) => m.MobileCrm),
  { ssr: false, loading: MobileHold },
);
const MobileCalendar = dynamic(
  () => import("@/app/(mobile)/mobile-calendar-v2/mobile-calendar").then((m) => m.MobileCalendar),
  { ssr: false, loading: MobileHold },
);
const MobileJobs = dynamic(
  () => import("@/app/(mobile)/mobile-jobs-v2/mobile-jobs").then((m) => m.MobileJobs),
  { ssr: false, loading: MobileHold },
);
const MobileWorkers = dynamic(
  () => import("@/app/(mobile)/mobile-workers-v2/mobile-workers").then((m) => m.MobileWorkers),
  { ssr: false, loading: MobileHold },
);
const MobileHire = dynamic(
  () => import("@/app/(mobile)/mobile-hire-v2/mobile-hire").then((m) => m.MobileHire),
  { ssr: false, loading: MobileHold },
);
const MobileCompany = dynamic(
  () => import("@/app/(mobile)/mobile-company-v2/mobile-company").then((m) => m.MobileCompany),
  { ssr: false, loading: MobileHold },
);
const MobileFinancials = dynamic(
  () => import("@/app/(mobile)/mobile-financials-v2/mobile-financials").then((m) => m.MobileFinancials),
  { ssr: false, loading: MobileHold },
);
// The Automation section, 2026-07-30: the ten remaining drawer surfaces. Mostly
// NOT ledgers — a composer, two drawing tools, a dialer, a thread view, three
// feeds, a board and a charts page — so these vary far more in shape than the
// list pages above, while sharing the same nav, tokens and motion.
const MobileSmartProposal = dynamic(
  () => import("@/app/(mobile)/mobile-advanced-ai-v2/mobile-advanced-ai").then((m) => m.MobileSmartProposal),
  { ssr: false, loading: MobileHold },
);
const MobileRoofEstimator = dynamic(
  () => import("@/app/(mobile)/mobile-roof-estimator-v2/mobile-roof-estimator").then((m) => m.MobileRoofEstimator),
  { ssr: false, loading: MobileHold },
);
const MobileFenceEstimator = dynamic(
  () => import("@/app/(mobile)/mobile-fence-estimator-v2/mobile-fence-estimator").then((m) => m.MobileFenceEstimator),
  { ssr: false, loading: MobileHold },
);
const MobilePhone = dynamic(
  () => import("@/app/(mobile)/mobile-phone-v2/mobile-phone").then((m) => m.MobilePhone),
  { ssr: false, loading: MobileHold },
);
const MobileMessages = dynamic(
  () => import("@/app/(mobile)/mobile-messages-v2/mobile-messages").then((m) => m.MobileMessages),
  { ssr: false, loading: MobileHold },
);
const MobileAnnouncements = dynamic(
  () => import("@/app/(mobile)/mobile-announcements-v2/mobile-announcements").then((m) => m.MobileAnnouncements),
  { ssr: false, loading: MobileHold },
);
const MobileReviews = dynamic(
  () => import("@/app/(mobile)/mobile-reviews-v2/mobile-reviews").then((m) => m.MobileReviews),
  { ssr: false, loading: MobileHold },
);
const MobileTrade = dynamic(
  () => import("@/app/(mobile)/mobile-trade-v2/mobile-trade").then((m) => m.MobileTrade),
  { ssr: false, loading: MobileHold },
);
const MobileReferrals = dynamic(
  () => import("@/app/(mobile)/mobile-referrals-v2/mobile-referrals").then((m) => m.MobileReferrals),
  { ssr: false, loading: MobileHold },
);
// The manual builder, 2026-07-30. Its estimator PICKER has no handheld page of
// its own — it is a dialog mounted in MobileNav, reachable from every mobile
// surface — so only the builder needs a route here.
const MobileManualBuilder = dynamic(
  () =>
    import("@/app/(mobile)/mobile-manual-builder-v2/mobile-manual-builder").then(
      (m) => m.MobileManualBuilder,
    ),
  { ssr: false, loading: MobileHold },
);
const MobileReports = dynamic(
  () => import("@/app/(mobile)/mobile-reports-v2/mobile-reports").then((m) => m.MobileReports),
  { ssr: false, loading: MobileHold },
);

/** Add a route here the day its handheld build lands. */
const HANDHELD_SURFACES: Record<string, React.ComponentType> = {
  "/dashboard": MobileDashboard,
  "/dashboard/proposals": MobileProposals,
  "/dashboard/clients": MobileClients,
  "/dashboard/leads": MobileLeads,
  "/dashboard/projects": MobileProjects,
  "/dashboard/crm": MobileCrm,
  "/dashboard/calendar": MobileCalendar,
  "/dashboard/jobs": MobileJobs,
  "/dashboard/workers": MobileWorkers,
  "/dashboard/hire": MobileHire,
  "/dashboard/company": MobileCompany,
  "/dashboard/financials": MobileFinancials,
  // Automation. The route slug /dashboard/advanced-ai is historical; the
  // surface is called Smart Proposal everywhere a user can see it.
  "/dashboard/advanced-ai": MobileSmartProposal,
  "/dashboard/roof-estimator": MobileRoofEstimator,
  "/dashboard/fence-estimator": MobileFenceEstimator,
  "/dashboard/phone": MobilePhone,
  "/dashboard/messages": MobileMessages,
  "/dashboard/announcements": MobileAnnouncements,
  "/dashboard/reviews": MobileReviews,
  "/dashboard/trade": MobileTrade,
  "/dashboard/referrals": MobileReferrals,
  "/dashboard/reports": MobileReports,
  "/dashboard/estimators/manual": MobileManualBuilder,
};

/** Routes whose PAGE owns the handheld switch because the map above cannot:
 *  a dynamic pathname, and a handheld build that needs the page's server data.
 *  Deliberately anchored and single-segment — see the guard's comment below.
 *
 *  · /dashboard/projects/<id> — mobile-project-detail/project-detail-viewport-switch
 *  · /dashboard/jobs/<id>     — mobile-job-detail/job-detail-viewport-switch
 *
 *  Single-segment anchoring is what keeps the static siblings out: /dashboard/
 *  projects/new and /dashboard/jobs/new match neither branch, and the list
 *  pages /dashboard/projects and /dashboard/jobs are handled by the map above,
 *  which returns before this line. */
const PAGE_OWNED_HANDHELD = /^\/dashboard\/(projects|jobs)\/[^/]+$/;

/** Static routes whose PAGE owns the switch for the other reason: the handheld
 *  build needs the page's server data, so it cannot be a props-less component
 *  mounted from this layout.
 *
 *  · /dashboard/subscription — the URL the sidebar's Subscription button
 *    points at (the promoted route; its handheld half was folded in
 *    2026-08-18). The handheld half is the real-data
 *    components/v3/mobile-subscription build, fed by the page's own loader; see
 *    app/dashboard/subscription/subscription-responsive.tsx.
 *  · /dashboard/subscription-blueprint — the responsive staging route; it
 *    renders the SAME switch through a re-export, so it needs the same
 *    exemption for as long as it stands.
 *  · /dashboard/client-detail — the record the handheld clients book opens
 *    (2026-08-15). It was the one surface reachable from a mobile page with no
 *    mobile chrome: the desktop topbar was clipped off the right edge of a
 *    390px viewport and there was no hamburger, so there was no way back into
 *    the app. Its handheld half is the SAME ClientDetailContent — the page body
 *    already collapses — wrapped in the fleet's MobileNav by
 *    components/v3/client-detail-blueprint/client-detail-viewport-switch.tsx,
 *    which needs the `?client=` row the page's own loader read. */
const PAGE_OWNED_STATIC = new Set([
  "/dashboard/subscription",
  "/dashboard/subscription-blueprint",
  "/dashboard/client-detail",
  // Both editions need the org's next ticket number and whether the estimator
  // key is configured — server facts — so the switch lives with the page
  // (video-estimator-blueprint/video-estimator-viewport-switch.tsx) rather than
  // in the props-less map above. Added 2026-08-22 with the wired estimator;
  // before it, a phone on this URL got the desktop page and no handheld nav.
  "/dashboard/video-estimator",
]);

/** Mapped handheld surfaces that do NOT render <MobileNav />.
 *
 *  /dashboard (mobile-v2) is the fleet's oldest handheld page and the only one
 *  that kept its own inline topbar, drawer and bottom bar when the other 21
 *  moved onto the shared nav. Anything MobileNav mounts for every surface — the
 *  estimator picker, the support widget — therefore has to be mounted for this
 *  one from here. Verified by grep, not assumed: every other entry in
 *  HANDHELD_SURFACES and every PAGE_OWNED branch imports mobile-shell/mobile-nav.
 *  The day mobile-v2 adopts MobileNav, this set empties and goes. */
const NO_MOBILE_NAV = new Set(["/dashboard"]);

/** Seen-stamps for the HANDHELD branch. The desktop edition stamps from each
 *  server page.tsx (<MarkNavSeen /> in the returned tree), but at ≤768px this
 *  shell renders the mapped mobile component INSTEAD of the page's children —
 *  the stamp in the page never mounts, and a badge a phone visit should clear
 *  would survive the visit. So the handheld branch stamps here, keyed by
 *  route. Deliberately absent:
 *  · /dashboard/jobs — the offers popup stamps it (owner request 2026-08-21),
 *    on both viewports; a route-level stamp would clear it on mere arrival.
 *  · /dashboard/messages — clears per-thread via markConversationRead. */
const HANDHELD_SEEN: Record<string, SeenKey> = {
  "/dashboard/leads": "leads",
  "/dashboard/proposals": "proposals",
  "/dashboard/calendar": "calendar",
  "/dashboard/workers": "workers",
  "/dashboard/announcements": "announcements",
  "/dashboard/trade": "trade",
  "/dashboard/phone": "phone",
  "/dashboard/referrals": "referrals",
  "/dashboard/reviews": "reviews",
};

// Module-scope so the identities are stable across renders — a fresh
// `subscribe` on every render makes useSyncExternalStore re-subscribe each
// time, which on a resize-driven store means tearing down the listener in the
// middle of the resize that triggered the render.
function subscribe(onStoreChange: () => void) {
  const mq = window.matchMedia(HANDHELD);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}
const getSnapshot = () => window.matchMedia(HANDHELD).matches;
// The server cannot know the viewport, so it renders desktop and the client
// corrects during hydration. A phone therefore shows desktop for one frame;
// the alternative — render nothing until mounted — flashes blank for every
// visitor on every route, which is a worse trade.
const getServerSnapshot = () => false;

export function ResponsiveDashboardShell({
  children,
  user,
  identity,
  badges,
}: {
  children: React.ReactNode;
  /** Signed-in identity, read in the server layout and handed to the desktop
   *  sidebar. The handheld shell draws its own account row. */
  user?: { name: string; role: string };
  /** The same identity with the RAW role, published to every client piece that
   *  filters by it — the desktop sidebar, the handheld drawer mounted deep
   *  inside a mobile page, and the command palette. It wraps BOTH branches
   *  below, because the drawer is inside the handheld one. */
  identity?: NavIdentity;
  /** Unread/pending counts by nav href, read server-side in the layout
   *  (getBadgeCounts). Published through the same provider the identity rides,
   *  for the same reason: the two nav shells sit at very different depths. */
  badges?: Record<string, number>;
}) {
  const isHandheld = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const pathname = usePathname();

  const Handheld = HANDHELD_SURFACES[pathname ?? ""];
  // Wrapped because every entry in the map above is a `dynamic(…, { ssr:false })`
  // chunk fetched at navigation time. When a deploy lands under a tab that is
  // already open, that fetch 404s and React surfaces the dead import as the
  // generic client-side exception; the boundary spends one reload picking up
  // the new build instead. Keyed on the pathname so navigating off a surface
  // whose chunk is missing clears the panel rather than carrying it along.
  if (isHandheld && Handheld) {
    const seenSurface = HANDHELD_SEEN[pathname ?? ""];
    return (
      <NavRoleProvider identity={identity} badges={badges}>
        {/* Keyed: this shell persists across navigation, and MarkNavSeen only
            stamps once per mount — a new key remounts it for the new surface. */}
        {seenSurface && <MarkNavSeen key={seenSurface} surface={seenSurface} />}
        <ChunkRecoveryBoundary resetKey={pathname ?? ""}>
          <Handheld />
        </ChunkRecoveryBoundary>
        {/* The support composer. Every other handheld surface gets it from
            <MobileNav />; /dashboard is the one mapped surface that kept its
            own topbar and drawer instead of the shared nav, so its copy is
            mounted from out here. Its LAUNCHER is the Help button in that
            page's own topbar (mobile-v2/mobile-dashboard.tsx) — nothing floats
            at this width, which is what keeps the button off the error toast's
            only dismiss control. Mounted last so the sheet paints over the
            page, which is `position: fixed; z-index: 20`. */}
        {NO_MOBILE_NAV.has(pathname ?? "") && (
          <SupportWidget signedIn={Boolean(identity?.name)} />
        )}
      </NavRoleProvider>
    );
  }

  // Project detail (2026-08-12) and job detail (2026-08-13) — the two routes
  // the map above cannot express. Both are DYNAMIC (/dashboard/projects/<cuid>,
  // /dashboard/jobs/<id>), so no literal key matches them. So the PAGE owns the
  // switch, on the same (max-width: 768px) query, and this guard is the other
  // half of it: at handheld width the shell renders the page bare rather than
  // wrapping a self-contained fixed-position tree in the desktop chrome, which
  // would put both trees in the DOM at once. Above 768px nothing changes.
  //
  // Scope of the pattern, checked for BOTH branches: the list pages
  // /dashboard/projects and /dashboard/jobs are matched by the map above and
  // return before this line; /dashboard/projects/new and /dashboard/jobs/new
  // both live in the (dashboard) route group, a different layout that never
  // mounts this shell, so the single-segment pattern matching them is inert;
  // no other route under this layout has a second path segment.
  // Page-owned handheld branches render their own chrome (which reaches for
  // MobileNav), so they need the provider just as much as the mapped ones.
  if (isHandheld && PAGE_OWNED_HANDHELD.test(pathname ?? "")) {
    return <NavRoleProvider identity={identity} badges={badges}>{children}</NavRoleProvider>;
  }
  if (isHandheld && PAGE_OWNED_STATIC.has(pathname ?? "")) {
    return <NavRoleProvider identity={identity} badges={badges}>{children}</NavRoleProvider>;
  }

  return (
    <NavRoleProvider identity={identity} badges={badges}>
      <BlueprintShell user={user}>{children}</BlueprintShell>
    </NavRoleProvider>
  );
}
