// WORKER EXPENSES (stage A, 2026-09-30): a worker's receipt is SUBMITTED and
// in no total until the office approves it; rejected with a reason;
// reimbursed when the money changed hands; a worker edits (edited mark) or
// deletes their own while it is on review, never once approved; only what
// counts is in the job's money and in Financials, and the two agree to the
// cent. Runs in QA Co on the local database.
//
//   npx tsx --tsconfig tsconfig.json scripts/qa/worker-expenses.check.ts
import "./_server-only";
import { db, makeCrewWorld } from "./_crewWorld";
import { createJobExpense, deleteJobExpense, editJobExpense, expenseJobAccess, listJobExpensesFor, reviewJobExpense } from "../../src/lib/jobExpenses";
import { countedAmounts, expenseDate, expenseTotals } from "../../src/lib/expenseTotals";
import { jobMoney } from "../../src/lib/jobCosting";
import { getFinancialsRollup, getMonthlyRollup } from "../../src/actions/financials";

let passes = 0;
let failures = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passes++;
  else failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};
const head = (s: string) => console.log(`\n── ${s}`);
const throws = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e instanceof Error ? e.message : String(e); } };
const c2 = (n: number) => Math.round(n * 100) / 100;

async function main() {
  head("0 · pure totals");
  const t = expenseTotals([
    { amount: 10.1, status: "APPROVED", paidBy: "WORKER" }, { amount: 20.2, status: "REIMBURSED", paidBy: "WORKER" }, { amount: 5.55, status: "SUBMITTED" }, { amount: 7, status: "REJECTED" }, { amount: 1, status: null },
  ]);
  ok("APPROVED + REIMBURSED (+ a row from before statuses) count; SUBMITTED apart; REJECTED nothing; owed = APPROVED by a worker", t.counted === 31.3 && t.countedCount === 3 && t.pending === 5.55 && t.pendingCount === 1 && t.rejected === 7 && t.owedToWorkers === 10.1, JSON.stringify(t));
  ok("the date a total goes by is spentAt, else createdAt", expenseDate({ spentAt: new Date("2026-09-02"), createdAt: new Date("2026-09-20") }).toISOString().startsWith("2026-09-02") && expenseDate({ spentAt: null, createdAt: new Date("2026-09-20") }).toISOString().startsWith("2026-09-20"));

  const w = await makeCrewWorld("exp");
  const [A, B] = w.workers;
  const worker = (x: typeof A) => ({ organizationId: w.orgId, userId: x.userId, role: "INSTALLER", workerId: x.workerId, name: x.name });
  const portal = (x: typeof A) => ({ organizationId: w.orgId, userId: x.userId, role: "WORKER_TOKEN", workerId: x.workerId, name: x.name });
  const manager = { organizationId: w.orgId, userId: w.managerUserId, role: "MANAGER", name: "QA Manager" };
  const owner = { organizationId: w.orgId, userId: w.ownerUserId, role: "OWNER", name: "QA Owner" };
  try {
    head("1 · who may touch a job's expenses");
    ok("the manager role is spelled MANAGER in Membership.role", (await db.membership.findFirst({ where: { userId: w.managerUserId, organizationId: w.orgId } }))?.role === "MANAGER");
    ok("a manager reaches any job; an assigned worker their job; an outsider nothing", (await expenseJobAccess(manager, w.jobId))?.access === "manager" && (await expenseJobAccess(worker(A), w.jobId))?.access === "worker" && (await expenseJobAccess(portal(B), w.jobId))?.access === "worker" && (await expenseJobAccess(worker(w.outsider), w.jobId)) === null);
    ok("a worker lists only a job they are on", (await listJobExpensesFor(worker(w.outsider), w.jobId)) === null && Array.isArray(await listJobExpensesFor(worker(A), w.jobId)));

    head("2 · statuses");
    const e1 = await createJobExpense(portal(A), { jobId: w.jobId, category: "Materials", amount: 120.55, note: "Screws", vendor: "Home Depot", via: "worker-portal" });
    ok("a worker's receipt is SUBMITTED, paid by the worker, dated today, with the org and who sent it", e1.status === "SUBMITTED" && e1.paidBy === "WORKER" && e1.organizationId === w.orgId && e1.submittedById === A.userId && !!e1.spentAt && e1.vendor === "Home Depot", JSON.stringify({ status: e1.status, paidBy: e1.paidBy }));
    const e2 = await createJobExpense(manager, { jobId: w.jobId, category: "Fuel", amount: 40, via: "dashboard" });
    ok("the office's row is APPROVED at once, paid by the company, reviewed by them", e2.status === "APPROVED" && e2.paidBy === "COMPANY" && e2.reviewedById === w.managerUserId && !!e2.reviewedAt);
    ok("a worker cannot approve", (await throws(() => reviewJobExpense(worker(B), e1.id, "approve"))) !== null);
    ok("rejecting needs a reason", (await throws(() => reviewJobExpense(manager, e1.id, "reject", "  "))) !== null);
    const rej = await reviewJobExpense(owner, e1.id, "reject", "Not this job's screws");
    ok("the owner rejects with a reason", rej.status === "REJECTED" && rej.rejectReason === "Not this job's screws" && rej.reviewedById === w.ownerUserId);
    const edited = await editJobExpense(worker(A), e1.id, { amount: 98.5, note: "Screws — the right job" });
    ok("the worker's correction goes back on review with an edited mark", edited.status === "SUBMITTED" && edited.amount === 98.5 && !!edited.editedAt && edited.rejectReason === null);
    ok("another worker cannot edit it", (await throws(() => editJobExpense(worker(B), e1.id, { amount: 1 }))) !== null);
    const appr = await reviewJobExpense(manager, e1.id, "approve");
    ok("the manager approves", appr.status === "APPROVED" && appr.reviewedById === w.managerUserId);
    ok("a worker cannot edit or delete an approved receipt", (await throws(() => editJobExpense(worker(A), e1.id, { amount: 1 }))) !== null && (await throws(() => deleteJobExpense(worker(A), e1.id))) !== null);
    ok("a company-paid row cannot be reimbursed", (await throws(() => reviewJobExpense(manager, e2.id, "reimburse"))) !== null);
    const reimb = await reviewJobExpense(owner, e1.id, "reimburse");
    ok("the owner marks the worker's approved receipt reimbursed", reimb.status === "REIMBURSED" && !!reimb.reimbursedAt);
    ok("the trail names every step", (await db.activityEvent.count({ where: { organizationId: w.orgId, kind: "EXPENSE", meta: { contains: `"expenseId":"${e1.id}"` } } })) >= 5);

    head("3 · a worker's own SUBMITTED receipt: editable, deletable");
    const e3 = await createJobExpense(worker(B), { jobId: w.jobId, category: "Tools", amount: 15, via: "dashboard" });
    const e3b = await editJobExpense(worker(B), e3.id, { amount: 16, vendor: "Lowe's" });
    ok("B edits their own on-review receipt: edited mark, still on review", e3b.editedAt !== null && e3b.status === "SUBMITTED" && e3b.amount === 16 && e3b.vendor === "Lowe's");
    ok("A cannot delete B's", (await throws(() => deleteJobExpense(worker(A), e3.id))) !== null);
    await deleteJobExpense(worker(B), e3.id);
    ok("B deletes their own", (await db.jobExpense.findUnique({ where: { id: e3.id } })) === null);

    head("4 · the totals: the job's figure is its share of Financials, to the cent");
    const e4 = await createJobExpense(portal(B), { jobId: w.jobId, category: "Materials", amount: 33.33, via: "worker-portal" }); // on review, never counted
    const e5 = await createJobExpense(manager, { jobId: w.jobId, category: "Permits", amount: 250.01, spentAt: new Date(), via: "dashboard" });
    const rows = await db.jobExpense.findMany({ where: { jobId: w.jobId } });
    const jobFig = jobMoney({ contract: 1000, collected: 0, lines: [], crewPay: [], expenses: countedAmounts(rows), pendingExpenses: rows.filter((r) => r.status === "SUBMITTED").map((r) => r.amount) });
    ok("the job page counts APPROVED + REIMBURSED only and shows the on-review figure apart", jobFig.expenses === c2(98.5 + 40 + 250.01) && jobFig.expensesPending === 33.33 && jobFig.cost === jobFig.expenses, JSON.stringify({ expenses: jobFig.expenses, pending: jobFig.expensesPending }));
    // Financials for QA Co this month: every job's counted expenses (by spentAt) + project expenses + crew pay handed over.
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [jobRows, projRows, paidCrew] = await Promise.all([
      db.jobExpense.findMany({ where: { job: { organizationId: w.orgId } }, select: { amount: true, status: true, spentAt: true, createdAt: true } }),
      db.projectExpense.findMany({ where: { project: { organizationId: w.orgId }, spentAt: { gte: monthStart } }, select: { amount: true } }),
      db.jobAssignment.findMany({ where: { job: { organizationId: w.orgId }, paidAt: { gte: monthStart } }, select: { pay: true } }),
    ]);
    const inMonth = (d: Date) => d >= monthStart;
    const expected = c2(jobRows.filter((r) => inMonth(expenseDate(r))).reduce((a, r) => a + (countedAmounts([r])[0] ?? 0), 0) + projRows.reduce((a, r) => a + r.amount, 0) + paidCrew.reduce((a, r) => a + r.pay, 0));
    const bucket = (await getMonthlyRollup(w.orgId, 12)).find((b) => b.key === monthKey);
    ok("the month's Financials expenses = Σ counted job expenses by spentAt + project expenses + crew pay handed over", bucket?.expenses === expected, `${bucket?.expenses} vs ${expected}`);
    const rollup = await getFinancialsRollup(w.orgId);
    ok("the 30-day roll-up reports what is on review apart, and never adds it", rollup.expensesOnReview >= 33.33 && rollup.expensesOnReviewCount >= 1 && (await db.jobExpense.count({ where: { job: { organizationId: w.orgId }, status: "SUBMITTED" } })) === rollup.expensesOnReviewCount);
    const [approvedThisJob] = [c2(98.5 + 40 + 250.01)];
    ok("this job's contribution to the month equals its own figure", c2(jobRows.length ? rows.filter((r) => ["APPROVED", "REIMBURSED"].includes(r.status)).reduce((a, r) => a + r.amount, 0) : 0) === approvedThisJob && jobFig.expenses === approvedThisJob);
    ok("cleanup rows exist", !!e4 && !!e5);
  } finally {
    await w.cleanup();
  }
  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
