import { db } from "@/lib/db";

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

  const [payments, expenses] = await Promise.all([
    db.payment.findMany({
      where: { organizationId, status: "PAID", paidAt: { gte: start } },
      select: { amount: true, paidAt: true },
    }),
    db.jobExpense.findMany({
      where: { job: { organizationId }, createdAt: { gte: start } },
      select: { amount: true, createdAt: true },
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
    const k = monthKey(e.createdAt);
    const b = buckets.get(k);
    if (b) b.expenses += e.amount;
  }
  for (const b of buckets.values()) b.profit = b.revenue - b.expenses;
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
}

export async function getFinancialsRollup(organizationId: string): Promise<FinancialsRollup> {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [paid, expenses, openProposals, invoices, changeOrders] = await Promise.all([
    db.payment.findMany({
      where: { organizationId, status: "PAID", paidAt: { gte: since } },
      select: { amount: true },
    }),
    db.jobExpense.findMany({
      where: { job: { organizationId }, createdAt: { gte: since } },
      select: { amount: true },
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
  ]);

  const revenue30d = paid.reduce((a, p) => a + p.amount, 0);
  const expenses30d = expenses.reduce((a, e) => a + e.amount, 0);
  const profit30d = revenue30d - expenses30d;
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
  };
}
