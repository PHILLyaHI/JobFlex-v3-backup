"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager, requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { safeHref } from "@/lib/safeHref";
import { INVENTORY_PATHS } from "@/lib/inventory";
import {
  createJobExpense,
  createStockPurchase,
  deleteJobExpense as deleteExpenseFor,
  editJobExpense as editExpenseFor,
  reviewJobExpense,
  reviewJobExpenses as reviewManyFor,
  type ExpenseActor,
  type ReviewDecision,
} from "@/lib/jobExpenses";

// THE OFFICE'S AND THE CREW'S EXPENSES (stage A, 2026-09-30). Every write
// goes through lib/jobExpenses — one rule for the dashboard, the worker
// portal's token route and the QA: the office's row is APPROVED at once, a
// worker's is SUBMITTED until the owner or a manager approves it; only
// APPROVED and REIMBURSED rows are in any total (lib/expenseTotals).

const receiptUrlInput = z
  .string()
  .max(2_000_000)
  // Rendered as <a href> / <img src> for every manager: only https URLs and
  // inline images may be stored (no javascript:, no external http pages).
  .refine((v) => safeHref(v) !== null && !v.startsWith("/"), "Receipt must be an https URL or image")
  .optional()
  .nullable();

const expenseInput = z.object({
  jobId: z.string(),
  category: z.string().min(1),
  amount: z.number().min(0),
  note: z.string().optional().nullable(),
  receiptUrl: receiptUrlInput,
  ocrJson: z.string().optional().nullable(),
  vendor: z.string().max(120).optional().nullable(),
  /** ISO date of the purchase; today when empty. */
  spentAt: z.string().optional().nullable(),
  paidBy: z.enum(["WORKER", "COMPANY"]).optional().nullable(),
});

const patchInput = z.object({
  category: z.string().min(1).optional(),
  amount: z.number().min(0).optional(),
  note: z.string().optional().nullable(),
  vendor: z.string().max(120).optional().nullable(),
  spentAt: z.string().optional().nullable(),
  paidBy: z.enum(["WORKER", "COMPANY"]).optional(),
  receiptUrl: receiptUrlInput,
});

const dateOf = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

async function actorOf(): Promise<ExpenseActor> {
  const { organizationId, user, role } = await requireOrg();
  return { organizationId, userId: user.id, role, name: user.name ?? user.email ?? null };
}

function refresh(jobId: string | null) {
  revalidatePath("/dashboard/financials/expenses");
  revalidatePath("/dashboard/financials");
  if (jobId) revalidatePath(`/dashboard/jobs/${jobId}`);
  revalidatePath("/dashboard/workers");
}

/** The office's "Add expense": APPROVED at once. Manager-only, as before. */
export async function addJobExpense(raw: unknown) {
  const { organizationId, user, role } = await requireManager();
  const data = expenseInput.parse(raw);
  const job = await db.job.findUnique({ where: { id: data.jobId } });
  if (!job || job.organizationId !== organizationId) throw new Error("Not found");
  const exp = await createJobExpense(
    { organizationId, userId: user.id, role },
    { ...data, spentAt: dateOf(data.spentAt), paidBy: data.paidBy ?? "COMPANY", via: "dashboard" },
  );
  refresh(data.jobId);
  return { id: exp.id };
}

const stockInput = z.object({
  category: z.string().min(1),
  amount: z.number().min(0),
  note: z.string().optional().nullable(),
  receiptUrl: receiptUrlInput,
  vendor: z.string().max(120).optional().nullable(),
  spentAt: z.string().optional().nullable(),
  paidBy: z.enum(["WORKER", "COMPANY"]).optional().nullable(),
  stockItemId: z.string().optional().nullable(),
  stockQty: z.number().positive().optional().nullable(),
});

/** The office's purchase FOR STOCK (stage D): company money and warehouse
 *  value, no job — a job pays for it only when the stock is issued to it. */
export async function addStockPurchase(raw: unknown) {
  const { organizationId, user, role } = await requireManager();
  const data = stockInput.parse(raw);
  const exp = await createStockPurchase({ organizationId, userId: user.id, role }, { ...data, spentAt: dateOf(data.spentAt) });
  refresh(null);
  // The stock tab of every trade's inventory (2026-10-10).
  for (const p of INVENTORY_PATHS) revalidatePath(p);
  return { id: exp.id };
}

/** The office's review queue, one receipt or several at once (stage D). */
export async function reviewJobExpenses(ids: string[], decision: ReviewDecision, reason?: string | null) {
  const { organizationId, user, role } = await requireManager();
  const list = z.array(z.string().min(1)).min(1).max(200).parse(ids);
  const which = z.enum(["approve", "reject", "reimburse"]).parse(decision);
  const out = await reviewManyFor({ organizationId, userId: user.id, role }, list, which, reason ?? null);
  refresh(null);
  const jobs = await db.jobExpense.findMany({ where: { id: { in: out.done } }, select: { jobId: true } });
  for (const j of new Set(jobs.map((x) => x.jobId))) if (j) revalidatePath(`/dashboard/jobs/${j}`);
  return out;
}

/** A receipt from anyone on the job (the crew's own dashboard): a worker's is
 *  SUBMITTED and on review, the office's is APPROVED. */
export async function submitJobExpense(raw: unknown) {
  const actor = await actorOf();
  const data = expenseInput.parse(raw);
  const exp = await createJobExpense(actor, { ...data, spentAt: dateOf(data.spentAt), paidBy: data.paidBy ?? null, via: "dashboard" });
  refresh(data.jobId);
  return { id: exp.id, status: exp.status };
}

/** The owner or a manager approves a receipt on review. */
export async function approveJobExpense(id: string) {
  const { organizationId, user, role } = await requireManager();
  const row = await reviewJobExpense({ organizationId, userId: user.id, role }, id, "approve");
  refresh(row.jobId);
  return { id: row.id, status: row.status };
}

/** … or rejects it, with a reason the worker reads. */
export async function rejectJobExpense(id: string, reason: string) {
  const { organizationId, user, role } = await requireManager();
  const row = await reviewJobExpense({ organizationId, userId: user.id, role }, id, "reject", reason);
  refresh(row.jobId);
  return { id: row.id, status: row.status };
}

/** … or marks an approved receipt the worker paid for as reimbursed (the money
 *  changed hands outside the app). */
export async function markJobExpenseReimbursed(id: string) {
  const { organizationId, user, role } = await requireManager();
  const row = await reviewJobExpense({ organizationId, userId: user.id, role }, id, "reimburse");
  refresh(row.jobId);
  return { id: row.id, status: row.status };
}

/** Edit one: the office any, a worker their own while it is on review or
 *  rejected. The row keeps an "edited" mark. */
export async function editJobExpense(id: string, raw: unknown) {
  const actor = await actorOf();
  const p = patchInput.parse(raw);
  const row = await editExpenseFor(actor, id, { ...p, spentAt: p.spentAt === undefined ? undefined : dateOf(p.spentAt) });
  refresh(row.jobId);
  return { id: row.id, status: row.status, editedAt: row.editedAt?.toISOString() ?? null };
}

/** Delete one: the office any, a worker their own — never once approved. */
export async function deleteJobExpense(id: string) {
  const actor = await actorOf();
  const { jobId } = await deleteExpenseFor(actor, id);
  refresh(jobId);
}
