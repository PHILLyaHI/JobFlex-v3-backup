// THE CUSTOM PLAN — pay for the pages you actually open.
//
// Every other plan is a bundle somebody else decided. This one starts at
// BASE_CENTS with the everyday workspace included, and each of the pages below
// is a PAID ADD-ON at PAGE_CENTS. A shop that only wants the manual builder and
// the client book pays the base; one that wants the estimators and the crew
// tools pays for exactly those.
//
// WHAT IS IN THE BASE, and why these are the ones that are not:
// the base is the paperwork a contractor cannot work without — the dashboard,
// proposals (manual builder included), clients, projects, CRM, jobs, messages,
// financials, announcements, reviews. The add-ons are the machines and the
// team surfaces: every ESTIMATOR except the manual builder, plus Company,
// Workers, Phone, Calendar and Leads.
//
// Shared by the signup picker (client) and the checkout route (server). The
// server NEVER prices from the client's number: it re-runs `customPriceCents`
// over the stored selection, so a doctored request buys nothing cheaper.

/** Base price of the custom plan, per month, in cents. */
export const CUSTOM_BASE_CENTS = 2000;
/** Each add-on page, per month, in cents. */
export const CUSTOM_PAGE_CENTS = 1000;
/** Yearly is ten months — two free, the same ~17% the catalog plans save and
 *  the same number the signup switch reads off them. */
export const CUSTOM_YEAR_MULTIPLIER = 10;

export interface CustomPage {
  /** Stable id stored with the subscription. */
  id: string;
  label: string;
  /** What the page is, in three or four words — the picker shows this. */
  note: string;
  /** The route it unlocks, for the gate that reads this selection. */
  href: string;
}

export const CUSTOM_PAGES: CustomPage[] = [
  { id: "smart-proposal", label: "Smart Proposal", note: "AI estimate from a prompt", href: "/dashboard/advanced-ai" },
  { id: "roof-estimator", label: "Roof estimator", note: "Aerial roof takeoff", href: "/dashboard/roof-estimator" },
  { id: "fence-estimator", label: "Fence estimator", note: "Draw the fence on a map", href: "/dashboard/fence-estimator" },
  { id: "video-estimator", label: "Video estimator", note: "Estimate from a walkthrough", href: "/dashboard/video-estimator" },
  { id: "calendar", label: "Calendar", note: "Scheduling and crew days", href: "/dashboard/calendar" },
  { id: "leads", label: "Leads", note: "Inbox and platform leads", href: "/dashboard/leads" },
  { id: "workers", label: "Workers", note: "Crew, roles and portals", href: "/dashboard/workers" },
  { id: "company", label: "Company", note: "Branding and lead matching", href: "/dashboard/company" },
  { id: "phone", label: "Phone", note: "AI answering and call log", href: "/dashboard/phone" },
];

/** What every custom plan includes before a single add-on is picked. */
export const CUSTOM_BASE_FEATURES = [
  "Dashboard, clients & projects",
  "Manual proposal builder",
  "Invoices & online payments",
  "Jobs, messages & financials",
];

const VALID = new Set(CUSTOM_PAGES.map((p) => p.id));

/** Drop anything that is not a real add-on id, and de-duplicate. */
export function normalizeCustomPages(pages: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(pages)) return [];
  const out: string[] = [];
  for (const p of pages) {
    const id = String(p);
    if (VALID.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Monthly price in cents for a selection. Yearly is ten of these. */
export function customPriceCents(
  pages: readonly string[] | null | undefined,
  interval: "MONTH" | "YEAR" = "MONTH",
): number {
  const monthly = CUSTOM_BASE_CENTS + normalizeCustomPages(pages).length * CUSTOM_PAGE_CENTS;
  return interval === "YEAR" ? monthly * CUSTOM_YEAR_MULTIPLIER : monthly;
}

/** The slug the rest of the app recognises for this plan. */
export const CUSTOM_PLAN_SLUG = "custom";

// ── Access, derived from the selection ──────────────────────────────────────
// Pure helpers, shared by the server gate (lib/customPageAccess) and the nav
// filters, which are client components. The DB read stays server-side; what a
// selection MEANS is decided in exactly one place, here.

/** The add-on hrefs a custom-plan org did NOT buy — the list every gate and
 *  nav filter blocks on. Anything not in CUSTOM_PAGES is base and never here. */
export function blockedCustomHrefs(bought: readonly string[] | null | undefined): string[] {
  const have = new Set(normalizeCustomPages(bought));
  return CUSTOM_PAGES.filter((p) => !have.has(p.id)).map((p) => p.href);
}

/** Prefix match, the same shape roleRoutes' isPathAllowed uses: "/x" blocks
 *  "/x" and "/x/…", never "/xy". Query strings are the caller's to strip. */
export function isCustomBlockedPath(
  blocked: readonly string[] | null | undefined,
  pathname: string,
): boolean {
  if (!blocked?.length) return false;
  return blocked.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
