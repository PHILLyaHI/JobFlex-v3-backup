// WHAT AN EXPENSE COUNTS FOR (stage A, 2026-09-30) — pure, client-safe.
//
// One rule for the job page, the Financials page and the QA: only an
// APPROVED or REIMBURSED expense is in any total; a SUBMITTED one is "on
// review" and shown as its own line; a REJECTED one is nothing. The date a
// total goes by is when the money was spent, falling back to when the row
// was made (rows from before the change have no spentAt).

export const EXPENSE_COUNTED: readonly string[] = ["APPROVED", "REIMBURSED"];

export interface ExpenseLike {
  amount: number;
  /** Null or missing reads as APPROVED (a row from before statuses existed). */
  status?: string | null;
  spentAt?: Date | string | null;
  createdAt?: Date | string | null;
}

export function countsInTotals(status: string | null | undefined): boolean {
  return !status || EXPENSE_COUNTED.includes(status);
}

export function isPending(status: string | null | undefined): boolean {
  return status === "SUBMITTED";
}

/** When the expense lands in a month: spentAt, else createdAt. */
export function expenseDate(e: Pick<ExpenseLike, "spentAt" | "createdAt">): Date {
  const raw = e.spentAt ?? e.createdAt ?? new Date(0);
  return raw instanceof Date ? raw : new Date(raw);
}

export const cents = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

export interface ExpenseTotals {
  /** In the totals: APPROVED + REIMBURSED. */
  counted: number;
  countedCount: number;
  /** On review: SUBMITTED, shown apart, never in a total. */
  pending: number;
  pendingCount: number;
  rejected: number;
  /** Approved and paid by a worker, not yet handed back. */
  owedToWorkers: number;
}

export function expenseTotals(rows: readonly (ExpenseLike & { paidBy?: string | null })[]): ExpenseTotals {
  let counted = 0, countedCount = 0, pending = 0, pendingCount = 0, rejected = 0, owed = 0;
  for (const r of rows) {
    const amt = Math.max(0, Number.isFinite(r.amount) ? r.amount : 0);
    if (countsInTotals(r.status)) {
      counted += amt;
      countedCount++;
      if (r.status === "APPROVED" && r.paidBy === "WORKER") owed += amt;
    } else if (isPending(r.status)) {
      pending += amt;
      pendingCount++;
    } else if (r.status === "REJECTED") rejected += amt;
  }
  return { counted: cents(counted), countedCount, pending: cents(pending), pendingCount, rejected: cents(rejected), owedToWorkers: cents(owed) };
}

/** The amounts a total is made of — for callers that already hold the rows. */
export function countedAmounts(rows: readonly ExpenseLike[]): number[] {
  return rows.filter((r) => countsInTotals(r.status)).map((r) => Math.max(0, r.amount));
}
