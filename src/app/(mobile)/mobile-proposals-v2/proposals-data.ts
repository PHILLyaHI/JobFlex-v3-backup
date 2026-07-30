// Mobile proposals (mobile-proposals-v2) — demo fixture.
//
// Values carried verbatim from the canonical proposals donor fixture
// (src/components/v3/proposals-blueprint/proposals-data.ts) so the mobile
// composition is judged against the same content as the desktop ledger.
// Seattle-area roofing/fence contractor texture: amounts $850–$24,600, real
// material names, diverse client names.
//
// This is a design surface: the data layer is out of scope, so nothing here
// touches Prisma or a server action. The array is mutated at runtime by the
// row-action sheet (duplicate / delete / accept / mark completed / un-accept),
// so the component clones this seed per mount.

export type Installment = {
  label: string;
  /** null = "on completion" rather than a dated instalment. */
  due: string | null;
  /** A percentage of the total when `pct`, otherwise a dollar figure. */
  amount: number;
  pct: boolean;
};

export type StatusKey = "DRAFT" | "SENT" | "VIEWED" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "PAID";

export type Proposal = {
  id: number;
  title: string;
  client: string;
  city: string;
  status: StatusKey;
  total: number;
  updated: string;
  views: number;
  owner: string;
  /** Line-item count. */
  mat: number;
  /** Whether the client record carries an address — drives the disabled
   *  "Get directions" row in the actions sheet. */
  addr: boolean;
  accepted?: string;
  paid?: string;
  inst?: Installment[];
};

/** Three tones per status; Sent = sky, Viewed = deep blueprint. */
export const PSTATUS: Record<StatusKey, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "" },
  SENT: { label: "Sent", cls: "pstatusSent" },
  VIEWED: { label: "Viewed", cls: "pstatusViewed" },
  ACCEPTED: { label: "Accepted", cls: "pstatusAccepted" },
  DECLINED: { label: "Declined", cls: "pstatusDeclined" },
  EXPIRED: { label: "Expired", cls: "pstatusExpired" },
  PAID: { label: "Completed", cls: "pstatusPaid" },
};

/** Chip rail on the ALL tab. Accepted and Completed have their own tabs, so
 *  they deliberately get no chip — matching the desktop ledger. */
export const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "SENT", label: "Sent" },
  { key: "VIEWED", label: "Viewed" },
  { key: "DECLINED", label: "Declined" },
  { key: "EXPIRED", label: "Expired" },
] as const;

export type FilterKey = (typeof FILTERS)[number]["key"];

export const TABS = [
  { key: "all", label: "All" },
  { key: "accepted", label: "Accepted" },
  { key: "completed", label: "Done" },
] as const;

export type TabKey = (typeof TABS)[number]["key"];

// Page sizes are smaller than the desktop ledger's (8/3/2): a phone row is
// taller, and density drops along the funnel — the tear-sheets are the least
// dense block on the page, so one per page.
export const PAGE_ALL = 6;
export const PAGE_ACC = 2;
export const PAGE_DONE = 1;

export const PROPOSALS_SEED: Proposal[] = [
  { id: 2851, title: "Asphalt reroof — 4812 Maple Ave", client: "M. Henderson", city: "Bothell", status: "SENT", total: 24600, updated: "25m", views: 0, owner: "Ivan", mat: 12, addr: true },
  { id: 2849, title: "Skylight install", client: "K. Marsh", city: "Woodinville", status: "VIEWED", total: 5400, updated: "2h", views: 3, owner: "Ivan", mat: 4, addr: true },
  { id: 2846, title: "Cedar fence, 140 ft", client: "D. Reyes", city: "Kirkland", status: "ACCEPTED", total: 12400, updated: "1d", views: 5, owner: "Ivan", mat: 6, addr: true, accepted: "JUL 18",
    inst: [
      { label: "Deposit", due: "JUL 20", amount: 30, pct: true },
      { label: "Material drop", due: "JUL 24", amount: 40, pct: true },
      { label: "Final on completion", due: null, amount: 30, pct: true },
    ] },
  { id: 2845, title: "Gutter replacement", client: "R. Okafor", city: "Redmond", status: "DRAFT", total: 3800, updated: "6h", views: 0, owner: "Marcus", mat: 3, addr: false },
  // Six instalments — the 6+ case that switches the payment strip from
  // columns to the row table with per-row Remind.
  { id: 2843, title: "Composite deck rebuild", client: "A. Kim", city: "Bellevue", status: "ACCEPTED", total: 21500, updated: "2d", views: 7, owner: "Ivan", mat: 9, addr: true, accepted: "JUL 15",
    inst: [
      { label: "Deposit", due: "JUL 17", amount: 4300, pct: false },
      { label: "Materials order", due: "JUL 22", amount: 3800, pct: false },
      { label: "Progress — framing", due: "JUL 29", amount: 4300, pct: false },
      { label: "Progress — decking", due: "AUG 05", amount: 4300, pct: false },
      { label: "Railings + stairs", due: "AUG 12", amount: 2400, pct: false },
      { label: "Final walkthrough", due: "AUG 20", amount: 2400, pct: false },
    ] },
  { id: 2842, title: "Vinyl fence, 220 ft", client: "P. Delgado", city: "Kenmore", status: "EXPIRED", total: 11300, updated: "1w", views: 2, owner: "Marcus", mat: 5, addr: true },
  { id: 2840, title: "Metal roof repair", client: "J. Whitfield", city: "Everett", status: "SENT", total: 9600, updated: "3d", views: 1, owner: "Ivan", mat: 7, addr: true },
  { id: 2838, title: "Deck power wash + seal", client: "R. Tran", city: "Bothell", status: "DECLINED", total: 1900, updated: "4d", views: 4, owner: "Sofia", mat: 2, addr: false },
  { id: 2836, title: "Chain-link fence, 90 ft", client: "N. Ivanov", city: "Lynnwood", status: "DRAFT", total: 6200, updated: "5d", views: 0, owner: "Ivan", mat: 4, addr: true },
  { id: 2834, title: "Pergola build", client: "L. Wong", city: "Sammamish", status: "VIEWED", total: 14800, updated: "6d", views: 9, owner: "Sofia", mat: 8, addr: true },
  { id: 2833, title: "Siding replacement", client: "S. Patel", city: "Mill Creek", status: "SENT", total: 18700, updated: "1w", views: 2, owner: "Marcus", mat: 11, addr: true },
  { id: 2830, title: "Roof inspection + tune-up", client: "T. Ortiz", city: "Bothell", status: "DRAFT", total: 850, updated: "1w", views: 0, owner: "Ivan", mat: 1, addr: true },
  { id: 2828, title: "Skylight + solar tube combo", client: "T. Bishop", city: "Woodinville", status: "ACCEPTED", total: 7900, updated: "2w", views: 6, owner: "Ivan", mat: 4, addr: true, accepted: "JUL 08",
    inst: [
      { label: "Deposit", due: "JUL 10", amount: 50, pct: true },
      { label: "Final on completion", due: null, amount: 50, pct: true },
    ] },
  { id: 2825, title: "Asphalt reroof — 61 Cypress Ln", client: "C. Ferreira", city: "Bothell", status: "PAID", total: 16400, updated: "2w", views: 8, owner: "Ivan", mat: 12, addr: true, accepted: "JUN 30", paid: "JUL 14",
    inst: [
      { label: "Deposit", due: "JUL 02", amount: 30, pct: true },
      { label: "Completion", due: null, amount: 70, pct: true },
    ] },
  { id: 2821, title: "Cedar privacy fence, 90 ft", client: "K. Sorensen", city: "Kirkland", status: "PAID", total: 6200, updated: "3w", views: 5, owner: "Sofia", mat: 5, addr: true, accepted: "JUN 22", paid: "JUL 05",
    inst: [
      { label: "Deposit", due: "JUN 24", amount: 50, pct: true },
      { label: "Completion", due: null, amount: 50, pct: true },
    ] },
  { id: 2816, title: "Gutter guards install", client: "D. Pham", city: "Redmond", status: "PAID", total: 2400, updated: "1mo", views: 3, owner: "Marcus", mat: 3, addr: true, accepted: "JUN 12", paid: "JUN 25",
    inst: [{ label: "Full on completion", due: null, amount: 100, pct: true }] },
];

/** A percentage instalment resolves against the proposal total. */
export function instDollars(p: Proposal, it: Installment): number {
  return it.pct ? Math.round((p.total * it.amount) / 100) : it.amount;
}

export const sumOf = (list: Proposal[]) => list.reduce((a, p) => a + p.total, 0);
export const OPEN_STATUSES: StatusKey[] = ["DRAFT", "SENT", "VIEWED"];
