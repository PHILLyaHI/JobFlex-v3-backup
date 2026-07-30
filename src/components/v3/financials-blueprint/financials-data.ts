// Blueprint financials — demo data, hardcoded verbatim from the donor file's
// <script> (jobflex-financials-blueprint_7.html). Every number, label, order
// and string is the donor's exact value; only the TypeScript shapes are added.
//
// The two arrays the page mutates at runtime (expenses, change orders) are
// exported as SEEDs and cloned per mount, so a remount starts from the same
// state as a fresh page load — which is what the donor does.

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
