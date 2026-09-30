// THE OFFICE'S SIDE OF THE CREW'S MONEY (stage D, 2026-09-30) — shapes.
// Pure, client-safe. Read by lib/financialsSnapshot, drawn by
// ./office-review.tsx on both editions of Financials → Expenses.

/** One receipt waiting for the owner or a manager. */
export type ReviewItem = {
  id: string;
  /** Who sent it. */
  who: string | null;
  job: string;
  jobId: string | null;
  amount: number;
  vendor: string | null;
  category: string;
  /** "Sep 30" — when the money was spent. */
  spent: string;
  paidBy: "WORKER" | "COMPANY";
  note: string | null;
  /** A short signed link to the picture or PDF, when there is one. */
  receipt: { href: string; pdf: boolean } | null;
  /** "edited Sep 30" when the sender changed it after sending. */
  edited: string | null;
};

/** What the company owes one worker: approved receipts they paid, not yet handed back. */
export type OwedWorker = {
  key: string;
  name: string;
  total: number;
  items: Array<{ id: string; job: string; amount: number; spent: string }>;
};

/** One job's cost, from lib/jobCost — the same figure its job page shows. */
export type JobCostRow = {
  jobId: string;
  title: string;
  status: string;
  crew: number;
  receipts: number;
  receiptsPending: number;
  stock: number;
  total: number;
  /** Stock lines with no price anywhere, counted at $0. */
  unpriced: string[];
};

export type StockPick = { id: string; name: string; unit: string; trade: string };

export type OfficeMoney = {
  queue: ReviewItem[];
  owed: OwedWorker[];
  owedTotal: number;
  costs: JobCostRow[];
  /** Purchases for stock (no job) that count, last 30 days. */
  stockPurchases30d: number;
  /** Warehouse items a purchase for stock can name. */
  stockItems: StockPick[];
};

export const EMPTY_OFFICE_MONEY: OfficeMoney = { queue: [], owed: [], owedTotal: 0, costs: [], stockPurchases30d: 0, stockItems: [] };

export const EXPENSE_STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "SUBMITTED", label: "On review" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
  { key: "REIMBURSED", label: "Reimbursed" },
];

export const money2 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
