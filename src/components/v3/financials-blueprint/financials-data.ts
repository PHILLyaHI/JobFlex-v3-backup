// Blueprint financials — the SHAPES the page renders, and the one genuine
// constant it owns.
//
// This file used to hold the donor's demo book: twelve hardcoded months, a
// hardcoded roll-up and three hardcoded tables that the page mutated in memory
// and forgot on navigation. Every one of those arrays now comes from the
// database in src/app/dashboard/financials/page.tsx, so the fixtures are gone —
// leaving them exported invites the next edit to re-point a control at one.
//
// (The mobile edition keeps its own copy of the fixture at
// src/app/(mobile)/mobile-financials-v2/financials-data.ts; it is a separate
// file and is untouched by this.)

/** One column pair in the revenue-vs-expenses chart. */
export type MonthPoint = { m: string; revenue: number; expenses: number };

/** The 30-day roll-up behind the gauge, the stat strip and the attention list.
 *  Mirrors `FinancialsRollup` in src/actions/financials.ts. */
export type Rollup = {
  revenue30d: number;
  expenses30d: number;
  profit30d: number;
  marginPct: number;
  pipelineValue: number;
  invoicesPending: number;
  invoicesOverdue: number;
  changeOrdersPending: number;
};

/**
 * Expense categories offered in the staged-receipt form.
 *
 * The union of the two lists that already existed: the donor's seven, plus
 * `Tools` and `Subcontractor`, which are values the vision prompt in
 * src/actions/receiptOcr.ts is explicitly allowed to return. Without them an
 * OCR result of "Tools" fell out of the <select> and was silently saved as
 * "Materials".
 */
export const EXPENSE_CATEGORIES = [
  'Materials',
  'Labor',
  'Equipment',
  'Subcontractor',
  'Tools',
  'Permits',
  'Fuel',
  'Disposal',
  'Other',
];

/** A row of the expenses book — one `JobExpense`. */
export type Expense = {
  /** The real `JobExpense.id`; `deleteJobExpense` is called with it. */
  id: string;
  jobId: string;
  job: string;
  category: string;
  amount: number;
  note: string;
  /** Pre-formatted "Jul 22" — the ledger plate, not a full date. */
  when: string;
  /** Blob (or data) URL of the attached receipt image, when there is one. */
  receiptUrl: string | null;
};

/** A row of the change-order book — one `ChangeOrder`. */
export type ChangeOrder = {
  id: string;
  title: string;
  jobId: string | null;
  job: string;
  /** DRAFT | SENT | APPROVED | DECLINED. Only DRAFT can be sent or deleted. */
  status: string;
  when: string;
  amount: number;
};

/** A row of the invoices book — one `Invoice`. Read-only on this page. */
export type Invoice = {
  id: string;
  num: string;
  client: string;
  status: string;
  provider: string;
  due: string;
  amount: number;
  proposalId: string | null;
  overdue: boolean;
};
