// Main financials — Blueprint edition. Pixel-identical port of the canonical
// financials donor (jobflex-financials-blueprint_7.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
//
// NOTHING ON THIS PAGE IS A FIXTURE ANY MORE. The chart, the margin gauge, the
// stat strip, the attention list and all three books are read here, from the
// database, through the same queries the classic financials pages use:
//   - overview          → old-design-pages/dashboard/financials/page.tsx
//   - expenses book     → (dashboard)/dashboard/financials/expenses/page.tsx
//   - change-order book → (dashboard)/dashboard/financials/change-orders/page.tsx
//   - invoices book     → (dashboard)/dashboard/financials/invoices/page.tsx
// The row actions (delete expense, send / delete change order) call the same
// server actions those tables call — see financials-behavior.ts.
//
// Dates are formatted here rather than in the behavior module so the ledger
// plates ("Jul 22") are produced once, by one clock, for every row.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireOrg, NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { getFinancialsRollup, getMonthlyRollup } from "@/actions/financials";
import { FinancialsContent } from "@/components/v3/financials-blueprint/financials-content";
import type {
  ChangeOrder,
  Expense,
  Invoice,
  MonthPoint,
  Rollup,
} from "@/components/v3/financials-blueprint/financials-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Financials",
  description:
    "Financials — revenue against expenses, margin gauge, receipt capture and the expense, change-order and invoice books on one sheet.",
};

/** The ledger plate the tables print: "Jul 22", never a full date. */
function plate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

export default async function FinancialsPage() {
  let organizationId: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard%2Ffinancials");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

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

  return (
    <FinancialsContent
      jobs={jobs}
      monthly={monthly}
      rollup={rollup}
      expenses={expenses}
      orders={orders}
      invoices={invoices}
    />
  );
}
