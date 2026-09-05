// THE FINANCIALS READ — one query set, two editions.
//
// These queries and the mapping into the page's row shapes used to live inline
// in src/app/dashboard/financials/page.tsx, which was fine while the desktop
// sheet was the only surface reading them. The handheld edition of the same
// route is mounted PROPS-LESS by the responsive shell
// (components/v3/responsive-shell/responsive-dashboard-shell.tsx), so it cannot
// be handed the page's data — it has to ask for it. Rather than let a second
// copy of these queries drift away from the first, both editions read this
// module: the desktop page calls it directly, the handheld one through the
// org-scoped `loadFinancials()` action (src/actions/financialsMobile.ts).
//
// SERVER ONLY — it touches Prisma. A client component wanting these shapes
// imports the TYPES from components/v3/financials-blueprint/financials-data
// (or the handheld copy in (mobile)/mobile-financials-v2/financials-data),
// never this file.

import { db } from "@/lib/db";
import { getFinancialsRollup, getMonthlyRollup } from "@/actions/financials";
import type {
  ChangeOrder,
  Expense,
  Invoice,
  MonthPoint,
  Rollup,
} from "@/components/v3/financials-blueprint/financials-data";

/** A job a receipt can be charged to. Mirrors `FinancialsJob` in
 *  components/v3/financials-blueprint/financials-behavior.ts. */
export type FinancialsJob = { id: string; title: string; status: string };

/** Everything either edition of the Financials surface draws, except the
 *  Overhead tab — that one is its own read (lib/overhead.ts) on both. */
export type FinancialsSnapshot = {
  jobs: FinancialsJob[];
  monthly: MonthPoint[];
  rollup: Rollup;
  expenses: Expense[];
  orders: ChangeOrder[];
  invoices: Invoice[];
};

/** The ledger plate the tables print: "Jul 22", never a full date. Formatted
 *  here rather than on the client so every row is stamped by ONE clock. */
function plate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

export async function getFinancialsSnapshot(
  organizationId: string,
): Promise<FinancialsSnapshot> {
  const [rollupRaw, monthlyRaw, expenseRows, orderRows, invoiceRows, jobs] = await Promise.all([
    getFinancialsRollup(organizationId),
    getMonthlyRollup(organizationId, 12),
    db.jobExpense.findMany({
      where: { job: { organizationId } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { job: { select: { id: true, title: true } } },
    }),
    db.changeOrder.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        job: { select: { id: true, title: true } },
        proposal: { select: { title: true } },
      },
    }),
    db.invoice.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    // Jobs a receipt can be charged to. Live work first — a receipt in hand
    // almost always belongs to something open — then the rest, newest first.
    db.job.findMany({
      where: { organizationId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: { id: true, title: true, status: true },
      take: 200,
    }),
  ]);

  // Invoices carry a clientId, not a client relation, so the names are looked
  // up in one extra query — same shape as the classic invoices page.
  const clientIds = Array.from(
    new Set(invoiceRows.map((i) => i.clientId).filter((x): x is string => Boolean(x))),
  );
  const clients = clientIds.length
    ? await db.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } })
    : [];
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  const now = new Date();

  const monthly: MonthPoint[] = monthlyRaw.map((m) => ({
    m: m.label,
    revenue: m.revenue,
    expenses: m.expenses,
  }));

  const rollup: Rollup = { ...rollupRaw };

  const expenses: Expense[] = expenseRows.map((e) => ({
    id: e.id,
    jobId: e.jobId,
    job: e.job.title,
    category: e.category,
    amount: e.amount,
    note: e.note ?? "",
    when: plate(e.createdAt),
    receiptUrl: e.receiptUrl,
  }));

  const orders: ChangeOrder[] = orderRows.map((c) => ({
    id: c.id,
    title: c.title,
    jobId: c.jobId,
    // A change order hangs off a job OR a proposal; name whichever it amends.
    job: c.job?.title ?? c.proposal?.title ?? "—",
    status: c.status,
    when: plate(c.createdAt),
    amount: c.amount,
  }));

  const invoices: Invoice[] = invoiceRows.map((i) => ({
    id: i.id,
    num: i.number,
    client: i.clientId ? (clientName.get(i.clientId) ?? "—") : "—",
    status: i.status,
    provider: i.provider,
    due: plate(i.dueDate),
    amount: i.amount,
    proposalId: i.proposalId,
    overdue: i.status === "PENDING" && !!i.dueDate && i.dueDate < now,
  }));

  return { jobs, monthly, rollup, expenses, orders, invoices };
}
