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
    items: [{ label: "Financials", icon: "i-bank", href: "/dashboard/financials" }],
  },
  {
    label: "Automation",
    items: [
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
};

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
