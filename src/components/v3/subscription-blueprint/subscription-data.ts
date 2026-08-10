// SUBSCRIPTION — BLUEPRINT · page fixtures.
// Route: /dashboard/subscription-blueprint.
//
// Verbatim from the "ДАННЫЕ СТРАНИЦЫ" (page data) block of the approved
// mockup, jobflex-subscription-blueprint (8).html. Every figure, plan name,
// price, invoice number and feature string is copy of record and ships exactly
// as authored.
//
// STATIC BY DESIGN. There is no data layer here: no server action, no API
// route, no Prisma query and — deliberately, on a billing surface — no Stripe
// call. The live subscription page is /dashboard/subscription; this route is a
// layout under review, and a mock that silently talked to the real billing
// system would be the worst possible way to find that out.

export type Plan = {
  slug: string;
  name: string;
  /** Monthly price in whole dollars; `null` renders as "Custom". */
  mo: number | null;
  /** The org's current plan — tints its column and swaps the CTA for a label. */
  cur: boolean;
  cta: string | null;
  /** Primary (filled) CTA rather than ghost. */
  hot?: boolean;
};

export const PLANS: Plan[] = [
  { slug: "free", name: "Free", mo: 0, cur: true, cta: null },
  {
    slug: "professional",
    name: "Professional",
    mo: 79,
    cur: false,
    cta: "Start 14-day trial",
    hot: true,
  },
  { slug: "advanced", name: "Advanced", mo: 179, cur: false, cta: "Upgrade", hot: false },
  { slug: "custom", name: "Build your plan", mo: null, cur: false, cta: "Get started", hot: false },
  { slug: "enterprise", name: "Enterprise", mo: 199, cur: false, cta: "Contact sales", hot: false },
];

export type UsageRow = { label: string; used: number; limit: number };

export const USAGE: UsageRow[] = [
  { label: "Proposals created", used: 4, limit: 5 },
  { label: "Smart estimates", used: 3, limit: 3 },
  { label: "Leads captured", used: 6, limit: 15 },
  { label: "Jobs", used: 4, limit: 10 },
  { label: "Messages sent", used: 38, limit: 100 },
  { label: "Review requests", used: 2, limit: 5 },
];

export type Invoice = { no: string; date: string; status: string; amt: string };

export const INVOICES: Invoice[] = [
  { no: "JF-2026-0043", date: "Jul 1, 2026", status: "Paid", amt: "$29.00" },
  { no: "JF-2026-0042", date: "Jun 1, 2026", status: "Paid", amt: "$29.00" },
  { no: "JF-2026-0041", date: "May 1, 2026", status: "Paid", amt: "$29.00" },
  { no: "JF-2026-0040", date: "Apr 1, 2026", status: "Paid", amt: "$29.00" },
];

/**
 * [feature, firstIncludedTierIndex] — the number is the index into PLANS at
 * which the feature turns on, so 1 = "Professional and up", 2 = "Advanced and
 * up", 4 = "Enterprise only". The "Build your plan" column (index 3) is drawn
 * as an optional dashed box regardless, by slug.
 */
export const FEATURES: Array<[string, number]> = [
  ["Unlimited proposals", 1],
  ["Smart Proposal drafts", 1],
  ["Smart estimating · roof & fence", 1],
  ["Proposal templates", 1],
  ["Branded PDF export", 1],
  ["Follow-up automation", 1],
  ["SMS notifications", 1],
  ["CSV report exports", 1],
  ["Multiple organizations", 2],
  ["Custom domain", 2],
  ["White-label client portal", 4],
];
