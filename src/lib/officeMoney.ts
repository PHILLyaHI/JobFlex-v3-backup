// THE OFFICE'S SIDE OF THE CREW'S MONEY (stage D, 2026-09-30) — server.
//
// The review queue (every receipt on review), what the company owes each
// worker (approved receipts they paid, not reimbursed), the cost of each job
// (lib/jobCost — the job page's own figure), and the purchases for stock.
// Read by lib/financialsSnapshot for both editions of Financials.

import { db } from "@/lib/db";
import { jobCosts } from "@/lib/jobCost";
import { cents } from "@/lib/expenseTotals";
import { mediaHref } from "@/lib/media/signedLink";
import type { JobCostRow, OfficeMoney, OwedWorker, ReviewItem } from "@/components/v3/crew-board/office-review-data";

const ofOrg = (organizationId: string) => ({ OR: [{ organizationId }, { job: { organizationId } }] });
const plate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

async function namesOf(organizationId: string, userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Map();
  const [profiles, users] = await Promise.all([
    db.workerProfile.findMany({ where: { organizationId, userId: { in: ids } }, select: { userId: true, displayName: true } }),
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }),
  ]);
  const out = new Map<string, string>();
  for (const u of users) out.set(u.id, u.name || u.email || "Member");
  for (const p of profiles) out.set(p.userId, p.displayName);
  return out;
}

export async function getOfficeMoney(organizationId: string): Promise<OfficeMoney> {
  const since = new Date(Date.now() - 30 * 86400_000);
  const [queueRows, owedRows, stockRows, items, costMap] = await Promise.all([
    db.jobExpense.findMany({
      where: { ...ofOrg(organizationId), status: "SUBMITTED" },
      orderBy: [{ spentAt: "asc" }, { createdAt: "asc" }],
      take: 300,
      include: { job: { select: { id: true, title: true } } },
    }),
    db.jobExpense.findMany({
      where: { ...ofOrg(organizationId), status: "APPROVED", paidBy: "WORKER", reimbursedAt: null },
      orderBy: [{ spentAt: "asc" }, { createdAt: "asc" }],
      include: { job: { select: { title: true } } },
    }),
    db.jobExpense.findMany({
      where: { ...ofOrg(organizationId), purpose: "STOCK", status: { in: ["APPROVED", "REIMBURSED"] }, AND: [{ OR: [{ spentAt: { gte: since } }, { spentAt: null, createdAt: { gte: since } }] }] },
      select: { amount: true },
    }),
    db.inventoryItem.findMany({ where: { organizationId }, orderBy: [{ trade: "asc" }, { name: "asc" }], select: { id: true, name: true, unit: true, trade: true }, take: 500 }),
    jobCosts(organizationId),
  ]);

  const names = await namesOf(organizationId, [...queueRows, ...owedRows].map((r) => r.submittedById).filter((x): x is string => !!x));

  const queue: ReviewItem[] = queueRows.map((e) => {
    const href = mediaHref(e.receiptUrl);
    return {
      id: e.id,
      who: e.submittedById ? (names.get(e.submittedById) ?? null) : null,
      job: e.job?.title ?? "Stock purchase",
      jobId: e.jobId,
      amount: e.amount,
      vendor: e.vendor,
      category: e.category,
      spent: plate(e.spentAt ?? e.createdAt),
      paidBy: e.paidBy === "WORKER" ? "WORKER" : "COMPANY",
      note: e.note,
      receipt: href ? { href, pdf: /\.pdf($|\?)/i.test(e.receiptUrl ?? "") || /^data:application\/pdf/i.test(e.receiptUrl ?? "") } : null,
      edited: e.editedAt ? `edited ${plate(e.editedAt)}` : null,
    };
  });

  const byWorker = new Map<string, OwedWorker>();
  for (const e of owedRows) {
    const key = e.submittedById ?? "unknown";
    const w = byWorker.get(key) ?? { key, name: e.submittedById ? (names.get(e.submittedById) ?? "A worker") : "A worker", total: 0, items: [] };
    w.total += e.amount;
    w.items.push({ id: e.id, job: e.job?.title ?? "Stock purchase", amount: e.amount, spent: plate(e.spentAt ?? e.createdAt) });
    byWorker.set(key, w);
  }
  const owed = [...byWorker.values()].map((w) => ({ ...w, total: cents(w.total) })).sort((a, b) => b.total - a.total);

  const jobIds = [...costMap.keys()];
  const jobs = jobIds.length ? await db.job.findMany({ where: { organizationId, id: { in: jobIds } }, select: { id: true, title: true, status: true, createdAt: true } }) : [];
  const costs: JobCostRow[] = jobs
    .map((j) => {
      const c = costMap.get(j.id)!;
      return { jobId: j.id, title: j.title, status: j.status, crew: c.crew, receipts: c.receipts, receiptsPending: c.receiptsPending, stock: c.stock, total: c.total, unpriced: c.unpriced };
    })
    .filter((r) => r.total > 0 || r.receiptsPending > 0)
    .sort((a, b) => b.total - a.total);

  return {
    queue,
    owed,
    owedTotal: cents(owed.reduce((a, w) => a + w.total, 0)),
    costs,
    stockPurchases30d: cents(stockRows.reduce((a, r) => a + r.amount, 0)),
    stockItems: items,
  };
}
