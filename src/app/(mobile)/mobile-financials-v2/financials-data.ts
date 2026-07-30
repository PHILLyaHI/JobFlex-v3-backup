// Mobile financials (mobile-financials-v2) — demo fixture.
//
// Carried over VERBATIM from the desktop financials donor fixture
// (src/components/v3/financials-blueprint/financials-data.ts): same values,
// same field names, same order, so the handheld composition is judged against
// exactly the same sheet as the desktop one. Seattle-area contractor texture —
// Bothell / Kirkland / Redmond / Woodinville / Mill Creek jobs, GAF-grade
// materials, amounts $96–$18,700.
//
// This is a design surface: the data layer is out of scope, so nothing here
// touches Prisma or a server action. All three collections are mutated at
// runtime (log / duplicate / delete an expense, send or approve a change
// order, collect or void an invoice), so the component clones every seed per
// mount and a remount starts from the state a fresh page load would show.
//
// Everything below the "MOBILE ADDITIONS" rule is handheld-only: the tab map,
// the page size, the per-tab filter options and the client-side matchers that
// back the search box. No new endpoint.

export type MonthPoint = { m: string; revenue: number; expenses: number };

/** Monthly roll-up: paid invoices against job expenses (12 months). */
export const MONTHLY: MonthPoint[] = [
  { m: 'Aug', revenue: 38200, expenses: 21400 },
  { m: 'Sep', revenue: 44100, expenses: 24800 },
  { m: 'Oct', revenue: 51600, expenses: 27300 },
  { m: 'Nov', revenue: 39800, expenses: 23900 },
  { m: 'Dec', revenue: 28400, expenses: 18700 },
  { m: 'Jan', revenue: 31200, expenses: 19600 },
  { m: 'Feb', revenue: 35800, expenses: 22100 },
  { m: 'Mar', revenue: 46300, expenses: 26400 },
  { m: 'Apr', revenue: 52900, expenses: 29800 },
  { m: 'May', revenue: 58400, expenses: 31200 },
  { m: 'Jun', revenue: 61700, expenses: 33600 },
  { m: 'Jul', revenue: 48250, expenses: 26900 },
];

export const ROLLUP = {
  revenue30d: 48250,
  expenses30d: 26900,
  get profit30d(): number {
    return this.revenue30d - this.expenses30d;
  },
  get marginPct(): number {
    return this.revenue30d ? (this.profit30d / this.revenue30d) * 100 : 0;
  },
  pipelineValue: 132400,
  invoicesPending: 4,
  invoicesOverdue: 1,
  changeOrdersPending: 2,
};

export const EXPENSE_CATEGORIES = [
  'Materials',
  'Labor',
  'Equipment',
  'Permits',
  'Fuel',
  'Disposal',
  'Other',
];

/** Job picker options in the staged-receipt form. */
export const STAGE_JOBS = [
  'Roof tear-off — 4812 Maple Ave',
  'Cedar fence — 902 Alder Ct',
  'Asphalt reroof — Henderson',
  'Siding patch — Mill Creek',
];

export type Expense = {
  id: string;
  job: string;
  category: string;
  amount: number;
  note: string;
  when: string;
  receipt: boolean;
};

/** Donor: `let expSeq = 60`. */
export const EXP_SEQ_START = 60;

export const EXPENSES_SEED: Expense[] = [
  { id: 'x1', job: 'Roof tear-off — 4812 Maple Ave', category: 'Materials', amount: 4820, note: 'Shingles + underlayment — Bothell Supply', when: 'Jul 22', receipt: true },
  { id: 'x2', job: 'Roof tear-off — 4812 Maple Ave', category: 'Disposal',  amount: 640,  note: '20-yard dumpster swap', when: 'Jul 22', receipt: true },
  { id: 'x3', job: 'Cedar fence — 902 Alder Ct',     category: 'Materials', amount: 3180, note: 'Cedar pickets, posts, concrete', when: 'Jul 21', receipt: true },
  { id: 'x4', job: 'Asphalt reroof — Henderson',     category: 'Equipment', amount: 420,  note: 'Lift rental — 2 days', when: 'Jul 20', receipt: false },
  { id: 'x5', job: 'Deck power wash — 55 Cedar Loop',category: 'Fuel',      amount: 96,   note: 'Truck fuel', when: 'Jul 20', receipt: true },
  { id: 'x6', job: 'Skylight install — 210 Fir St',  category: 'Permits',   amount: 310,  note: 'City of Woodinville permit', when: 'Jul 18', receipt: true },
  { id: 'x7', job: 'Gutter guards — Redmond',        category: 'Materials', amount: 1240, note: 'Guard sections + fasteners', when: 'Jul 17', receipt: false },
  { id: 'x8', job: 'Siding patch — Mill Creek',      category: 'Labor',     amount: 1600, note: 'Subcontract crew — one day', when: 'Jul 15', receipt: true },
];

export type ChangeOrder = {
  id: string;
  title: string;
  job: string;
  status: string;
  when: string;
  amount: number;
};

export const ORDERS_SEED: ChangeOrder[] = [
  { id: 'co1', title: 'Add ridge vent run',            job: 'Asphalt reroof — Henderson',    status: 'SENT',     when: 'Jul 21', amount: 1850 },
  { id: 'co2', title: 'Extra 20 ft of fence',          job: 'Cedar fence — 902 Alder Ct',    status: 'APPROVED', when: 'Jul 19', amount: 2400 },
  { id: 'co3', title: 'Replace rotten sheathing',      job: 'Roof tear-off — 4812 Maple Ave',status: 'DRAFT',    when: 'Jul 22', amount: 980 },
  { id: 'co4', title: 'Upgrade to composite railings', job: 'Composite deck rebuild',        status: 'DECLINED', when: 'Jul 12', amount: 3200 },
];

export type Invoice = {
  id: string;
  num: string;
  client: string;
  status: string;
  provider: string;
  due: string;
  amount: number;
};

export const INVOICES: Invoice[] = [
  { id: 'in1', num: 'INV-1042', client: 'M. Henderson', status: 'PENDING',  provider: 'Stripe', due: 'Jul 29', amount: 12300 },
  { id: 'in2', num: 'INV-1041', client: 'Cascade PM',   status: 'PAID',     provider: 'Stripe', due: 'Jul 18', amount: 18700 },
  { id: 'in3', num: 'INV-1040', client: 'D. Reyes',     status: 'PENDING',  provider: 'Manual', due: 'Jul 24', amount: 3720 },
  { id: 'in4', num: 'INV-1039', client: 'C. Ferreira',  status: 'PAID',     provider: 'Stripe', due: 'Jul 10', amount: 8400 },
  { id: 'in5', num: 'INV-1038', client: 'R. Tran',      status: 'FAILED',   provider: 'Stripe', due: 'Jul 08', amount: 1900 },
  { id: 'in6', num: 'INV-1037', client: 'K. Sorensen',  status: 'PAID',     provider: 'Manual', due: 'Jul 02', amount: 6200 },
  { id: 'in7', num: 'INV-1036', client: 'D. Pham',      status: 'REFUNDED', provider: 'Stripe', due: 'Jun 26', amount: 480 },
  { id: 'in8', num: 'INV-1035', client: 'S. Patel',     status: 'PENDING',  provider: 'Stripe', due: 'Jul 31', amount: 9600 },
];

/* ============================================================
   MOBILE ADDITIONS
   ============================================================ */

export type TabKey = 'overview' | 'expenses' | 'orders' | 'invoices';

export const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'orders', label: 'Change orders' },
  { key: 'invoices', label: 'Invoices' },
];

/**
 * The desktop tables show every row at once. A handheld row is three lines
 * tall, so the ledgers page — same reasoning that took the proposals ledger
 * from 8 to 6 and the client book from 12 to 8.
 */
export const PAGE_SIZE = 6;

/** The filter key that is not a literal category or status. */
export const ALL = 'ALL';

export const CO_STATUSES = ['DRAFT', 'SENT', 'APPROVED', 'DECLINED'];
export const INV_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'];

/**
 * The two 30-day roll-up figures are a WIDER scope than the rows this page
 * lists: ROLLUP.expenses30d (26,900) already contains the eight logged
 * expenses, and ROLLUP.revenue30d (48,250 — the same figure MONTHLY carries
 * for Jul) already contains the collected invoices. So the live roll-up is the
 * fixture figure plus whatever the ledgers have moved since the seed:
 *
 *   expenses30d = ROLLUP.expenses30d + (loggedNow − SEED_LOGGED)
 *   revenue30d  = ROLLUP.revenue30d  + (collectedNow − SEED_COLLECTED)
 *
 * That is what makes the Overview masthead, the stat strip, the gauge and the
 * chart's last month all move when you log an expense or collect an invoice,
 * instead of sitting on constants.
 */
export const SEED_LOGGED = EXPENSES_SEED.reduce((a, e) => a + e.amount, 0);
export const SEED_COLLECTED = INVOICES.filter((i) => i.status === 'PAID').reduce(
  (a, i) => a + i.amount,
  0,
);

/**
 * Two letters, so a page of invoices is scannable: "M. Henderson" → MH,
 * "Cascade PM" → CP, a single word → its first two letters. Punctuation is
 * stripped first, which keeps the "M." initial from becoming ".".
 */
export function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const hit = (query: string, ...fields: string[]) => {
  if (!query) return true;
  const q = query.toLowerCase();
  return fields.some((f) => f.toLowerCase().includes(q));
};

/** Job, vendor note, category and the logged date all answer the search box. */
export function matchesExpense(e: Expense, query: string): boolean {
  return hit(query, e.job, e.note, e.category, e.when);
}

export function matchesOrder(o: ChangeOrder, query: string): boolean {
  return hit(query, o.title, o.job, o.status, o.when);
}

export function matchesInvoice(i: Invoice, query: string): boolean {
  return hit(query, i.num, i.client, i.status, i.provider, i.due);
}
