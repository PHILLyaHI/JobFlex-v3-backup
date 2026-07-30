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

export function ResponsiveDashboardShell({ children }: { children: React.ReactNode }) {
  const isHandheld = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const pathname = usePathname();

  const Handheld = HANDHELD_SURFACES[pathname ?? ""];
  if (isHandheld && Handheld) return <Handheld />;

  return <BlueprintShell>{children}</BlueprintShell>;
}
