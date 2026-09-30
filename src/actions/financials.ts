import { db } from "@/lib/db";
import { EXPENSE_COUNTED, cents, expenseDate } from "@/lib/expenseTotals";

// WHAT COUNTS (stage A, 2026-09-30): a job expense is in the totals only
// once APPROVED (or REIMBURSED), by the day the money was spent; a receipt
// on review (SUBMITTED) is reported apart and never added. Project expenses
// count too. The job page uses the same rule (lib/jobCosting +
// lib/expenseTotals), so a job's figure is exactly its share of these.
const COUNTED = [...EXPENSE_COUNTED];

// JOB OR STOCK (stage D, 2026-09-30): the company's money counts once, the
// day it is spent — a receipt for a job AND a purchase for stock (no job) are
// both expenses here. Stock issued to a job later is that job's cost
// (lib/jobCost) and never a second expense here.
const ofOrg = (organizationId: string) => ({ OR: [{ organizationId }, { job: { organizationId } }] });
const spentSince = (since: Date) => ({ OR: [{ spentAt: { gte: since } }, { spentAt: null, createdAt: { gte: since } }] });

export interface MonthBucket {
  key: string;        // "2026-04"
  label: string;      // "Apr"
  revenue: number;
  expenses: number;
  profit: number;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString("en-US", { month: "short" });
}

export async function getMonthlyRollup(
  organizationId: string,
  months = 12,
): Promise<MonthBucket[]> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const [payments, expenses, crewPaid, projectExpenses] = await Promise.all([
    db.payment.findMany({
      where: { organizationId, status: "PAID", paidAt: { gte: start } },
      select: { amount: true, paidAt: true },
    }),
    db.jobExpense.findMany({
      where: { status: { in: COUNTED }, AND: [ofOrg(organizationId), spentSince(start)] },
      select: { amount: true, createdAt: true, spentAt: true },
    }),
    // The crew's pay lands in the month it was handed over.
    db.jobAssignment.findMany({
      where: { job: { organizationId }, paidAt: { gte: start } },
      select: { pay: true, paidAt: true },
    }),
    db.projectExpense.findMany({
      where: { project: { organizationId }, spentAt: { gte: start } },
      select: { amount: true, spentAt: true },
    }),
  ]);

  const buckets = new Map<string, MonthBucket>();
  for (let i = 0; i < months; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const k = monthKey(d);
    buckets.set(k, { key: k, label: monthLabel(k), revenue: 0, expenses: 0, profit: 0 });
  }

  for (const p of payments) {
    if (!p.paidAt) continue;
    const k = monthKey(p.paidAt);
    const b = buckets.get(k);
    if (b) b.revenue += p.amount;
  }
  for (const e of expenses) {
    const b = buckets.get(monthKey(expenseDate(e)));
    if (b) b.expenses += e.amount;
  }
  for (const e of projectExpenses) {
    const b = buckets.get(monthKey(e.spentAt));
    if (b) b.expenses += e.amount;
  }
  for (const c of crewPaid) {
    if (!c.paidAt) continue;
    const b = buckets.get(monthKey(c.paidAt));
    if (b) b.expenses += c.pay;
  }
  for (const b of buckets.values()) {
    b.expenses = cents(b.expenses);
    b.profit = cents(b.revenue - b.expenses);
  }
  return Array.from(buckets.values());
}

export interface FinancialsRollup {
  revenue30d: number;
  expenses30d: number;
  profit30d: number;
  marginPct: number;
  pipelineValue: number;
  invoicesPending: number;
  invoicesOverdue: number;
  changeOrdersPending: number;
  /** Receipts on review (SUBMITTED, any date): apart, never in expenses30d. */
  expensesOnReview: number;
  expensesOnReviewCount: number;
  /** Approved receipts a worker paid for, not yet handed back. */
  owedToWorkers: number;
}

export async function getFinancialsRollup(organizationId: string): Promise<FinancialsRollup> {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [paid, expenses, crewPaid, openProposals, invoices, changeOrders, projectExpenses, onReview, owed] = await Promise.all([
    db.payment.findMany({
      where: { organizationId, status: "PAID", paidAt: { gte: since } },
      select: { amount: true },
    }),
    db.jobExpense.findMany({
      where: { status: { in: COUNTED }, AND: [ofOrg(organizationId), spentSince(since)] },
      select: { amount: true },
    }),
    // The crew's pay is money out too (2026-09-20): it counts on the day the
    // office marks it handed over, the same rule a receipt follows.
    db.jobAssignment.findMany({
      where: { job: { organizationId }, paidAt: { gte: since } },
      select: { pay: true },
    }),
    db.proposal.findMany({
      where: { organizationId, status: { in: ["SENT", "VIEWED", "DRAFT"] } },
      select: { total: true },
    }),
    db.invoice.findMany({
      where: { organizationId },
      select: { status: true, dueDate: true },
    }),
    db.changeOrder.findMany({
      where: { organizationId, status: { in: ["DRAFT", "SENT"] } },
      select: { id: true },
    }),
    db.projectExpense.findMany({
      where: { project: { organizationId }, spentAt: { gte: since } },
      select: { amount: true },
    }),
    db.jobExpense.findMany({ where: { ...ofOrg(organizationId), status: "SUBMITTED" }, select: { amount: true } }),
    db.jobExpense.findMany({ where: { ...ofOrg(organizationId), status: "APPROVED", paidBy: "WORKER", reimbursedAt: null }, select: { amount: true } }),
  ]);

  const revenue30d = cents(paid.reduce((a, p) => a + p.amount, 0));
  const expenses30d = cents(expenses.reduce((a, e) => a + e.amount, 0) + projectExpenses.reduce((a, e) => a + e.amount, 0) + crewPaid.reduce((a, c) => a + c.pay, 0));
  const profit30d = cents(revenue30d - expenses30d);
  const marginPct = revenue30d > 0 ? (profit30d / revenue30d) * 100 : 0;
  const pipelineValue = openProposals.reduce((a, p) => a + p.total, 0);
  const now = new Date();
  const invoicesPending = invoices.filter((i) => i.status === "PENDING").length;
  const invoicesOverdue = invoices.filter(
    (i) => i.status === "PENDING" && i.dueDate && i.dueDate < now,
  ).length;
  return {
    revenue30d,
    expenses30d,
    profit30d,
    marginPct,
    pipelineValue,
    invoicesPending,
    invoicesOverdue,
    changeOrdersPending: changeOrders.length,
    expensesOnReview: cents(onReview.reduce((a, e) => a + e.amount, 0)),
    expensesOnReviewCount: onReview.length,
    owedToWorkers: cents(owed.reduce((a, e) => a + e.amount, 0)),
  };
}
