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

/** Trial length when nothing has been set in /admin/plans. The admin value
 *  lives in SyncState (lib/customPlanConfig) because the custom plan has no
 *  PricingPlan row to hold a trialDays column; this is the client-safe floor
 *  the signup step labels itself with until the server answers. */
export const DEFAULT_CUSTOM_TRIAL_DAYS = 7;

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

/* WHAT THE CUSTOM PLAN TICKS on the compare matrix (subscription page).
   The matrix rows are the catalog's benefit strings; the custom plan is base
   + pages, so each is mapped to the row it opens. Lower-cased to match the
   matrix's own lookup. If a benefit is renamed in /admin/plans, rename it
   here too or its tick goes missing — the matrix is text-keyed. */
const CUSTOM_BASE_ROWS = [
  "proposal management",
  "client management",
  "crm",
  "financials",
  "messages",
  "1 user",
];
const CUSTOM_PAGE_ROWS: Record<string, string[]> = {
  "smart-proposal": ["smart proposal generation"],
  "roof-estimator": ["roof estimator"],
  "fence-estimator": ["fence estimator"],
  "video-estimator": ["video estimator"],
  calendar: ["calendar"],
  leads: ["free leads"],
  workers: ["workers management"],
  company: [],
  phone: ["ai phone answering"],
};

/** Rows a custom plan with these pages includes (lower-cased). */
export function customPlanIncludes(pages: readonly string[] | null | undefined): Set<string> {
  const out = new Set<string>(CUSTOM_BASE_ROWS);
  for (const id of normalizeCustomPages(pages)) {
    for (const row of CUSTOM_PAGE_ROWS[id] ?? []) out.add(row);
  }
  return out;
}

/** Rows that a custom plan COULD add (any page's row), lower-cased. */
export function customPlanAddable(): Set<string> {
  const out = new Set<string>();
  for (const rows of Object.values(CUSTOM_PAGE_ROWS)) for (const r of rows) out.add(r);
  return out;
}
