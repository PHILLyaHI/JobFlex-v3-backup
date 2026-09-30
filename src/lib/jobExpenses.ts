// A JOB'S EXPENSES AND WHO MAY TOUCH THEM (stage A, 2026-09-30) — server.
//
// Owner's rules: a worker sends a receipt from their own dashboard or portal;
// it is SUBMITTED and counts nowhere until the owner or a manager approves
// it (never automatically) or rejects it with a reason. Reimbursement happens
// outside the app; the office only marks it. A worker may edit or delete
// their own receipt after sending — an edit leaves an "edited" mark — but
// not once it is approved. The office's own entries are approved at once.
//
// Every function takes a plain actor, so the session actions, the token
// route and the QA scripts share the one rule.

import { db } from "@/lib/db";
import { logActivity, TRAIL_KINDS } from "@/lib/activityLog";
import { isLimitedRole } from "@/lib/orgContext";
import { ExpensePaidBy, ExpenseStatus } from "@/lib/prismaEnums";
import { deleteStored } from "@/lib/media/privateStore";

export interface ExpenseActor {
  organizationId: string;
  userId: string;
  /** The membership role, or "WORKER_TOKEN" through the portal (a limited role). */
  role: string;
  /** The crew profile, when the actor has one (the portal always does). */
  workerId?: string | null;
  name?: string | null;
}

export type ExpenseAccess = "manager" | "worker";

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** May this actor see and add to this job's expenses? A manager: any job of
 *  the company. A limited role: only a job they hold a live assignment on. */
export async function expenseJobAccess(actor: ExpenseActor, jobId: string): Promise<{ access: ExpenseAccess; job: { id: string; title: string; proposalId: string | null; clientId: string | null } } | null> {
  const job = await db.job.findFirst({ where: { id: jobId, organizationId: actor.organizationId }, select: { id: true, title: true, proposalId: true, clientId: true } });
  if (!job) return null;
  if (!isLimitedRole(actor.role) && actor.role !== "WORKER_TOKEN") return { access: "manager", job };
  const assigned = await db.jobAssignment.findFirst({
    where: { jobId, status: { not: "DECLINED" }, ...(actor.workerId ? { workerId: actor.workerId } : { worker: { userId: actor.userId } }) },
    select: { id: true },
  });
  return assigned ? { access: "worker", job } : null;
}

export interface NewExpense {
  jobId: string;
  category: string;
  amount: number;
  note?: string | null;
  receiptUrl?: string | null;
  ocrJson?: string | null;
  vendor?: string | null;
  spentAt?: Date | null;
  paidBy?: "WORKER" | "COMPANY" | null;
  via: "worker-portal" | "dashboard";
}

/** Create one. The office's row is APPROVED at once; a worker's is SUBMITTED. */
export async function createJobExpense(actor: ExpenseActor, input: NewExpense) {
  const gate = await expenseJobAccess(actor, input.jobId);
  if (!gate) throw new Error("Not found");
  const manager = gate.access === "manager";
  const amount = Number.isFinite(input.amount) ? Math.min(Math.max(input.amount, 0), 1_000_000) : 0;
  const category = (input.category?.trim() || "Materials").slice(0, 60);
  const paidBy = input.paidBy ?? (manager ? ExpensePaidBy.COMPANY : ExpensePaidBy.WORKER);
  const now = new Date();
  const row = await db.jobExpense.create({
    data: {
      jobId: input.jobId,
      organizationId: actor.organizationId,
      submittedById: actor.userId,
      category,
      amount,
      note: input.note?.trim().slice(0, 2000) || null,
      receiptUrl: input.receiptUrl ?? null,
      ocrJson: input.ocrJson ?? null,
      vendor: input.vendor?.trim().slice(0, 120) || null,
      spentAt: input.spentAt ?? now,
      paidBy,
      status: manager ? ExpenseStatus.APPROVED : ExpenseStatus.SUBMITTED,
      reviewedById: manager ? actor.userId : null,
      reviewedAt: manager ? now : null,
    },
  });
  await logActivity({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    kind: TRAIL_KINDS.EXPENSE,
    summary: manager
      ? `Added a ${money(amount)} expense to ${gate.job.title} — ${category}${input.receiptUrl ? " (receipt attached)" : ""}`
      : `Sent a ${money(amount)} receipt for ${gate.job.title} — ${category}, on review`,
    proposalId: gate.job.proposalId,
    clientId: gate.job.clientId,
    meta: { jobId: input.jobId, expenseId: row.id, amount, category, status: row.status, paidBy, via: input.via },
  });
  return row;
}

export type ReviewDecision = "approve" | "reject" | "reimburse";

/** Approve, reject (with a reason) or mark reimbursed — the office only. The
 *  transitions are guarded in the query, so two reviewers cannot both win. */
export async function reviewJobExpense(actor: ExpenseActor, id: string, decision: ReviewDecision, reason?: string | null) {
  if (isLimitedRole(actor.role) || actor.role === "WORKER_TOKEN") throw new Error("Manager access required");
  const ex = await db.jobExpense.findFirst({ where: { id, job: { organizationId: actor.organizationId } }, include: { job: { select: { title: true, proposalId: true, clientId: true } } } });
  if (!ex) throw new Error("Not found");
  const now = new Date();
  let r: { count: number };
  let summary: string;
  if (decision === "approve") {
    r = await db.jobExpense.updateMany({ where: { id, status: { in: [ExpenseStatus.SUBMITTED, ExpenseStatus.REJECTED] } }, data: { status: ExpenseStatus.APPROVED, reviewedById: actor.userId, reviewedAt: now, rejectReason: null } });
    summary = `Approved a ${money(ex.amount)} receipt on ${ex.job.title} — ${ex.category}`;
  } else if (decision === "reject") {
    const why = (reason ?? "").trim().slice(0, 500);
    if (!why) throw new Error("Give a reason for rejecting it.");
    r = await db.jobExpense.updateMany({ where: { id, status: { in: [ExpenseStatus.SUBMITTED, ExpenseStatus.APPROVED] } }, data: { status: ExpenseStatus.REJECTED, reviewedById: actor.userId, reviewedAt: now, rejectReason: why } });
    summary = `Rejected a ${money(ex.amount)} receipt on ${ex.job.title} — ${why}`;
  } else {
    if (ex.paidBy !== ExpensePaidBy.WORKER) throw new Error("Only a receipt the worker paid for can be reimbursed.");
    r = await db.jobExpense.updateMany({ where: { id, status: ExpenseStatus.APPROVED }, data: { status: ExpenseStatus.REIMBURSED, reimbursedAt: now } });
    summary = `Marked a ${money(ex.amount)} receipt on ${ex.job.title} reimbursed`;
  }
  if (r.count === 0) throw new Error("That expense cannot be moved from where it stands.");
  await logActivity({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    kind: TRAIL_KINDS.EXPENSE,
    summary,
    proposalId: ex.job.proposalId,
    clientId: ex.job.clientId,
    meta: { jobId: ex.jobId, expenseId: id, amount: ex.amount, category: ex.category, decision, reason: reason ?? undefined },
  });
  return db.jobExpense.findUniqueOrThrow({ where: { id } });
}

export interface ExpensePatch {
  category?: string;
  amount?: number;
  note?: string | null;
  vendor?: string | null;
  spentAt?: Date | null;
  paidBy?: "WORKER" | "COMPANY";
  receiptUrl?: string | null;
}

/** Edit one. The office edits any; a worker edits their own while it is
 *  SUBMITTED or REJECTED (a rejected one goes back on review). The row keeps
 *  an "edited" mark. */
export async function editJobExpense(actor: ExpenseActor, id: string, patch: ExpensePatch) {
  const ex = await db.jobExpense.findFirst({ where: { id, job: { organizationId: actor.organizationId } }, include: { job: { select: { title: true, proposalId: true, clientId: true } } } });
  if (!ex) throw new Error("Not found");
  const manager = !isLimitedRole(actor.role) && actor.role !== "WORKER_TOKEN";
  if (!manager) {
    if (ex.submittedById !== actor.userId) throw new Error("You can only edit your own receipts");
    if (ex.status !== ExpenseStatus.SUBMITTED && ex.status !== ExpenseStatus.REJECTED) throw new Error("An approved receipt can no longer be edited");
  }
  const data: Record<string, unknown> = { editedAt: new Date() };
  if (patch.category !== undefined) data.category = patch.category.trim().slice(0, 60) || ex.category;
  if (patch.amount !== undefined) data.amount = Number.isFinite(patch.amount) ? Math.min(Math.max(patch.amount, 0), 1_000_000) : ex.amount;
  if (patch.note !== undefined) data.note = patch.note?.trim().slice(0, 2000) || null;
  if (patch.vendor !== undefined) data.vendor = patch.vendor?.trim().slice(0, 120) || null;
  if (patch.spentAt !== undefined) data.spentAt = patch.spentAt;
  if (patch.paidBy !== undefined) data.paidBy = patch.paidBy;
  if (patch.receiptUrl !== undefined) data.receiptUrl = patch.receiptUrl;
  // A worker's correction of a rejected receipt puts it back on review.
  if (!manager && ex.status === ExpenseStatus.REJECTED) Object.assign(data, { status: ExpenseStatus.SUBMITTED, rejectReason: null, reviewedById: null, reviewedAt: null });
  const row = await db.jobExpense.update({ where: { id }, data });
  // A replaced receipt picture leaves the store with the edit (stage B).
  if (patch.receiptUrl !== undefined && ex.receiptUrl && ex.receiptUrl !== patch.receiptUrl) await deleteStored(ex.receiptUrl);
  await logActivity({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    kind: TRAIL_KINDS.EXPENSE,
    summary: `Edited a ${money(row.amount)} expense on ${ex.job.title} — ${row.category}`,
    proposalId: ex.job.proposalId,
    clientId: ex.job.clientId,
    meta: { jobId: ex.jobId, expenseId: id, amount: row.amount, category: row.category, edited: true },
  });
  return row;
}

/** Delete one. The office deletes any; a worker their own, never once approved. */
export async function deleteJobExpense(actor: ExpenseActor, id: string) {
  const ex = await db.jobExpense.findFirst({ where: { id, job: { organizationId: actor.organizationId } }, include: { job: { select: { title: true, proposalId: true, clientId: true } } } });
  if (!ex) throw new Error("Not found");
  const manager = !isLimitedRole(actor.role) && actor.role !== "WORKER_TOKEN";
  if (!manager) {
    if (ex.submittedById !== actor.userId) throw new Error("You can only delete your own receipts");
    if (ex.status === ExpenseStatus.APPROVED || ex.status === ExpenseStatus.REIMBURSED) throw new Error("An approved receipt can no longer be deleted");
  }
  await db.jobExpense.delete({ where: { id } });
  await deleteStored(ex.receiptUrl);
  await logActivity({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    kind: TRAIL_KINDS.EXPENSE,
    summary: `Deleted a ${money(ex.amount)} expense from ${ex.job.title} — ${ex.category}`,
    proposalId: ex.job.proposalId,
    clientId: ex.job.clientId,
    meta: { jobId: ex.jobId, expenseId: id, amount: ex.amount, category: ex.category, deleted: true },
  });
  return { jobId: ex.jobId };
}

/** A job's expenses for this actor: the office reads any job's; a worker
 *  only a job they are on (the job's receipts, as the portal already shows). */
export async function listJobExpensesFor(actor: ExpenseActor, jobId: string) {
  const gate = await expenseJobAccess(actor, jobId);
  if (!gate) return null;
  return db.jobExpense.findMany({ where: { jobId }, orderBy: { createdAt: "desc" } });
}
