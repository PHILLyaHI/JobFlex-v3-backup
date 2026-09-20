"use server";

// WHAT THE CREW IS PAID for a job (2026-09-20).
//
// Owner: the installer dashboard in the other product hands a worker a job
// with a pay figure on it, and every job's financials read from it. JobFlex
// assigns workers but has never said what the work pays, so a job's cost was
// whatever receipts happened to be booked.
//
// The pay sits on the assignment (JobAssignment.pay) — one worker, one job,
// one figure — and the office marks it paid when the money changes hands.
// Both writes are manager-or-owner only (`requireManager` rejects the field
// worker, the sales rep and the estimator), and both are scoped through the
// job's organization so an id from another company cannot be touched.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireManager, NoOrgError, UnauthorizedError } from "@/lib/orgContext";

type Fail = { ok: false; error: string };

async function assignmentInOrg(assignmentId: string) {
  const { organizationId } = await requireManager();
  const row = await db.jobAssignment.findFirst({
    where: { id: assignmentId, job: { organizationId } },
    select: { id: true, jobId: true, pay: true, paidAt: true },
  });
  return row;
}

function failure(err: unknown): Fail {
  if (err instanceof UnauthorizedError) return { ok: false, error: "Manager access required" };
  if (err instanceof NoOrgError) return { ok: false, error: "No organization" };
  return { ok: false, error: err instanceof Error ? err.message : "Could not save the pay" };
}

/** Set (or clear, with 0) what this worker is paid for this job. */
export async function setAssignmentPay(
  assignmentId: string,
  pay: number,
): Promise<{ ok: true; pay: number } | Fail> {
  try {
    const amount = Math.max(0, Math.round((Number(pay) || 0) * 100) / 100);
    if (!Number.isFinite(amount) || amount > 1_000_000) return { ok: false, error: "Enter a pay between 0 and 1,000,000" };
    const row = await assignmentInOrg(assignmentId);
    if (!row) return { ok: false, error: "That assignment is not on this company's jobs" };
    await db.jobAssignment.update({ where: { id: row.id }, data: { pay: amount } });
    revalidatePath(`/dashboard/jobs/${row.jobId}`);
    revalidatePath("/dashboard/financials");
    return { ok: true, pay: amount };
  } catch (err) {
    return failure(err);
  }
}

/** Mark the pay handed over, or take the mark back. */
export async function setAssignmentPaid(
  assignmentId: string,
  paid: boolean,
): Promise<{ ok: true; paidAt: string | null } | Fail> {
  try {
    const row = await assignmentInOrg(assignmentId);
    if (!row) return { ok: false, error: "That assignment is not on this company's jobs" };
    const paidAt = paid ? new Date() : null;
    await db.jobAssignment.update({ where: { id: row.id }, data: { paidAt } });
    revalidatePath(`/dashboard/jobs/${row.jobId}`);
    revalidatePath("/dashboard/financials");
    return { ok: true, paidAt: paidAt ? paidAt.toISOString() : null };
  } catch (err) {
    return failure(err);
  }
}
