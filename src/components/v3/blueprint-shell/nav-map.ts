// The blueprint navigation map — ONE source of truth for every shell that
// draws the nav: the desktop sidebar (blueprint-shell/sidebar.tsx) and the
// mobile hamburger drawers on both handheld surfaces.
//
// Extracted from sidebar.tsx on 2026-07-29. Until then the mobile drawers read
// a second, href-less copy of this list out of mobile-v2/mobile-data.ts, which
// is why every mobile nav item was a dead `href="#"` and the drawer could not
// change pages. Two lists meant two truths; there is now one.
//
// Plain data + a pure function, no "use client" — safe to import from a server
// component, a client component or a data module.
//
// Source of the ordering and grouping: design-system.md → "Sidebar navigation
// map". `href: "#"` marks a surface with no page yet; those stay deliberately
// dead rather than routing somewhere that 404s.

import { ROLE_ROUTE_GATES, isPathAllowed } from "@/lib/roleRoutes";

export type NavItem = { label: string; icon: string; href: string };
export type NavSection = { label: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Work",
    items: [
      { label: "Overview", icon: "i-grid", href: "/dashboard" },
      { label: "Proposals", icon: "i-file", href: "/dashboard/proposals" },
      { label: "Clients", icon: "i-users", href: "/dashboard/clients" },
      { label: "Leads", icon: "i-target", href: "/dashboard/leads" },
      { label: "Projects", icon: "i-folder", href: "/dashboard/projects" },
      { label: "CRM", icon: "i-crm", href: "/dashboard/crm" },
    ],
  },
  {
    label: "Delivery",
    items: [
      { label: "Calendar", icon: "i-cal", href: "/dashboard/calendar" },
      { label: "Jobs", icon: "i-jobs", href: "/dashboard/jobs" },
      { label: "Workers", icon: "i-hardhat", href: "/dashboard/workers" },
      { label: "Hire", icon: "i-userplus", href: "/dashboard/hire" },
      { label: "Company", icon: "i-building", href: "/dashboard/company" },
    ],
  },
  {
    label: "Money",
    items: [
      { label: "Financials", icon: "i-bank", href: "/dashboard/financials" },
      // REPOINTED 2026-08-13 (owner's call): the button now opens the NEW
      // design at /dashboard/subscription-blueprint — the blueprint port above
      // 768px, the handheld build at or below it, one switch in that page. The
      // old design is still served at /dashboard/subscription, which nothing
      // links to any more.
      //
      // OWNER-only, enforced by OWNER_ONLY_HREFS below (2026-08-17). The gap
      // this comment used to record — "the blueprint shell filters NAV_SECTIONS
      // by nothing at all" — is closed: navSectionsFor() is now the one rule
      // both shells and the palette read. Financials, one line above, is NOT
      // owner-only: the production sidebar shows it to every office role.
      { label: "Subscription", icon: "i-card", href: "/dashboard/subscription-blueprint" },
    ],
  },
  {
    label: "Automation",
    items: [
      // No "Estimators" item, deliberately: picking an engine is done in the
      // topbar's New Estimate dialog (estimators-blueprint/estimator-picker),
      // reachable from every page, so a nav entry would be a second door to a
      // decision you make on your way somewhere else. The engines themselves
      // keep their items below.
      { label: "Smart Proposal", icon: "i-bulb", href: "/dashboard/advanced-ai" },
      { label: "Roof estimator", icon: "i-roof", href: "/dashboard/roof-estimator" },
      { label: "Fence estimator", icon: "i-fence", href: "/dashboard/fence-estimator" },
      { label: "Phone", icon: "i-phone", href: "/dashboard/phone" },
      { label: "Messages", icon: "i-msg", href: "/dashboard/messages" },
      { label: "Announcements", icon: "i-megaphone", href: "/dashboard/announcements" },
      { label: "Reviews", icon: "i-thumb", href: "/dashboard/reviews" },
      { label: "Trade board", icon: "i-board", href: "/dashboard/trade" },
      { label: "Referrals", icon: "i-gift", href: "/dashboard/referrals" },
      { label: "Reports", icon: "i-chart", href: "/dashboard/reports" },
    ],
  },
];

/**
 * The standalone handheld review URLs are the same SURFACES as their
 * /dashboard counterparts, so they must light the same nav item. Without this
 * the drawer opens with nothing active on /mobile-v2 and the sliding indicator
 * plate has no link to measure itself against.
 */
const SURFACE_ALIASES: Record<string, string> = {
  "/mobile-v2": "/dashboard",
  "/mobile-proposals-v2": "/dashboard/proposals",
  "/mobile-clients-v2": "/dashboard/clients",
  "/mobile-leads-v2": "/dashboard/leads",
  "/mobile-projects-v2": "/dashboard/projects",
  "/mobile-crm-v2": "/dashboard/crm",
  "/mobile-calendar-v2": "/dashboard/calendar",
  "/mobile-jobs-v2": "/dashboard/jobs",
  "/mobile-workers-v2": "/dashboard/workers",
  "/mobile-hire-v2": "/dashboard/hire",
  "/mobile-company-v2": "/dashboard/company",
  "/mobile-financials-v2": "/dashboard/financials",
  "/mobile-advanced-ai-v2": "/dashboard/advanced-ai",
  "/mobile-roof-estimator-v2": "/dashboard/roof-estimator",
  "/mobile-fence-estimator-v2": "/dashboard/fence-estimator",
  "/mobile-phone-v2": "/dashboard/phone",
  "/mobile-messages-v2": "/dashboard/messages",
  "/mobile-announcements-v2": "/dashboard/announcements",
  "/mobile-reviews-v2": "/dashboard/reviews",
  "/mobile-trade-v2": "/dashboard/trade",
  "/mobile-referrals-v2": "/dashboard/referrals",
  "/mobile-reports-v2": "/dashboard/reports",
};

// ── ROLE FILTER ─────────────────────────────────────────────────────────────
// Added 2026-08-17. Until now the blueprint shell drew NAV_SECTIONS whole for
// everybody, so an INSTALLER invited as a field worker got the full 22-item
// sidebar and a drawer to match — every link a route their gate bounces.
//
// ONE RULE, THREE SHELLS. The desktop sidebar, the handheld drawer and the
// command palette all call navSectionsFor(); nothing filters on its own. Two
// filters would be two truths, which is the same mistake the href-less second
// nav list made before this module existed.
//
// SOURCE OF THE RULES, both halves:
//   · WHICH surfaces  — @/lib/roleRoutes ROLE_ROUTE_GATES, the same allow-list
//     the middleware and the (dashboard) layout enforce. Deriving from it (not
//     restating it) is what makes "the nav never shows a link the route-gate
//     would bounce" true by construction rather than by review.
//   · ORDER, GROUPING and LABELS — components/layout/Sidebar.tsx, the
//     production sidebar's WORKER_GROUPS / SALES_GROUPS / ESTIMATOR_GROUPS.
//     A worker's Calendar is titled "Schedule" there, so it is here.
//
// Nothing is invented: ROLE_NAV may only ever narrow. Any href in a plan that
// the role's gate does not allow is DROPPED rather than granted — see the
// filter in navSectionsFor.

/** Items only the organisation OWNER may see, whatever else their role allows.
 *  Matches the production sidebar, which drops Subscription for every non-owner
 *  office role; the page itself re-checks with isOwnerRole. */
const OWNER_ONLY_HREFS = new Set<string>(["/dashboard/subscription-blueprint"]);

/** A limited role's nav, as section titles plus the hrefs they hold. */
type RoleNavPlan = { label: string; hrefs: string[] }[];

const ROLE_NAV: Record<string, RoleNavPlan> = {
  // Field workers: their jobs and their schedule, plus the thread back to the
  // office. Read-only surfaces — every create path is elsewhere.
  INSTALLER: [
    {
      label: "Your work",
      hrefs: ["/dashboard/jobs", "/dashboard/calendar", "/dashboard/messages"],
    },
  ],
  // Sales reps: the pipeline slice.
  SALES: [
    {
      label: "Pipeline",
      hrefs: [
        "/dashboard/leads",
        "/dashboard/clients",
        "/dashboard/proposals",
        "/dashboard/crm",
      ],
    },
    {
      label: "Day to day",
      hrefs: ["/dashboard/calendar", "/dashboard/messages", "/dashboard/phone"],
    },
  ],
  // Estimators: proposals plus the estimating engines.
  ESTIMATOR: [
    { label: "Estimating", hrefs: ["/dashboard/proposals", "/dashboard/projects"] },
    {
      label: "Automation",
      // Roof and Fence are listed because the production sidebar lists them for
      // this role. They used to be listed and then DROPPED by the gate filter
      // below — the blueprint port had moved both surfaces off
      // /dashboard/advanced-ai/* (which ESTIMATOR holds) onto their own
      // top-level routes (which it did not). That gap was reconnected in
      // @/lib/roleRoutes on 2026-08-18, so these two now survive the filter and
      // the estimator sees the engines its role is named after.
      hrefs: [
        "/dashboard/advanced-ai",
        "/dashboard/roof-estimator",
        "/dashboard/fence-estimator",
        "/dashboard/messages",
      ],
    },
  ],
};

/** Per-role label overrides, from the production sidebar's own wording. */
const ROLE_LABELS: Record<string, Record<string, string>> = {
  INSTALLER: { "/dashboard/calendar": "Schedule" },
};

/** Every item in the master map, by href — the icon and default label source. */
const ITEM_BY_HREF: Record<string, NavItem> = {};
for (const section of NAV_SECTIONS) {
  for (const item of section.items) {
    if (item.href !== "#") ITEM_BY_HREF[item.href] = item;
  }
}

/**
 * True when `role` may open `href`. The route allow-list decides for the three
 * limited roles; owner-only items are dropped for everyone else. Office roles
 * (OWNER / ADMIN / MANAGER and the legacy ACCOUNTANT / USER) have no gate, so
 * everything else is open to them — the same deny-list shape as
 * orgContext's isOwnerOrManager.
 *
 * Use it for anything that NAVIGATES but is not a nav item: the topbar's New
 * Estimate engines, the palette's Create rows.
 */
export function canOpen(role: string | null | undefined, href: string): boolean {
  if (href === "#") return false;
  if (OWNER_ONLY_HREFS.has(href) && role !== "OWNER") return false;
  const gate = role ? ROLE_ROUTE_GATES[role] : undefined;
  if (!gate) return true;
  // Strip a query string before matching: the gate reasons about pathnames.
  return isPathAllowed(gate, href.split("?")[0]);
}

/**
 * True for the roles that carry a route gate — INSTALLER, SALES, ESTIMATOR.
 * Asked of ROLE_ROUTE_GATES rather than written out again, so a role that gains
 * or loses a gate does not need a second edit here.
 *
 * The shell footer's sign out is drawn for exactly these roles (owner's call,
 * 2026-08-18): their allow-lists keep them off the account and settings pages
 * that carry the office roles' own sign out, so the footer is the only place
 * they can leave the app from.
 */
export function isLimitedRole(role: string | null | undefined): boolean {
  return !!role && !!ROLE_ROUTE_GATES[role];
}

/**
 * The nav this role should see. Limited roles get their own grouping from the
 * production sidebar, intersected with their route gate; office roles get the
 * full map minus anything owner-only.
 */
export function navSectionsFor(role: string | null | undefined): NavSection[] {
  const plan = role ? ROLE_NAV[role] : undefined;
  if (plan) {
    const labels = (role && ROLE_LABELS[role]) || {};
    return plan
      .map((group) => ({
        label: group.label,
        items: group.hrefs
          .filter((href) => canOpen(role, href))
          .map((href) => {
            const item = ITEM_BY_HREF[href];
            if (!item) return null;
            return labels[href] ? { ...item, label: labels[href] } : item;
          })
          .filter((item): item is NavItem => item !== null),
      }))
      .filter((group) => group.items.length > 0);
  }

  // Office roles. OWNER sees the map as authored; everyone else loses the
  // owner-only items, and any section they emptied goes with them.
  if (role === "OWNER") return NAV_SECTIONS;
  return NAV_SECTIONS.map((section) => ({
    label: section.label,
    items: section.items.filter((item) => canOpen(role, item.href)),
  })).filter((section) => section.items.length > 0);
}

/**
 * The nav item that owns this path, by longest-prefix match, so child routes
 * (e.g. /dashboard/workers/[id]) keep their parent item lit. Returns null when
 * nothing in the map claims the path.
 */
export function activeHref(pathname: string): string | null {
  const path = SURFACE_ALIASES[pathname] ?? pathname;
  let best: string | null = null;
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.href === "#") continue;
      const hit = path === item.href || path.startsWith(item.href + "/");
      if (hit && (best === null || item.href.length > best.length)) best = item.href;
    }
  }
  return best;
}
