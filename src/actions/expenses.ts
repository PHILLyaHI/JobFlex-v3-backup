"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { safeHref } from "@/lib/safeHref";
import { logActivity, TRAIL_KINDS } from "@/lib/activityLog";

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

const expenseInput = z.object({
  jobId: z.string(),
  category: z.string().min(1),
  amount: z.number().min(0),
  note: z.string().optional().nullable(),
  // Rendered as <a href> / <img src> for every manager: only https URLs and
  // inline images may be stored (no javascript:, no external http pages).
  receiptUrl: z
    .string()
    .max(2_000_000)
    .refine((v) => safeHref(v) !== null && !v.startsWith("/"), "Receipt must be an https URL or image")
    .optional()
    .nullable(),
  ocrJson: z.string().optional().nullable(),
});

export async function addJobExpense(raw: unknown) {
  const { organizationId, user } = await requireManager();
  const data = expenseInput.parse(raw);
  const job = await db.job.findUnique({ where: { id: data.jobId } });
  if (!job || job.organizationId !== organizationId) throw new Error("Not found");
  const exp = await db.jobExpense.create({
    data: {
      jobId: data.jobId,
      category: data.category,
      amount: data.amount,
      note: data.note ?? null,
      receiptUrl: data.receiptUrl ?? null,
      ocrJson: data.ocrJson ?? null,
    },
  });
  revalidatePath("/dashboard/financials/expenses");
  revalidatePath("/dashboard/financials");
  revalidatePath(`/dashboard/jobs/${data.jobId}`);
  await logActivity({
    organizationId,
    actorId: user.id,
    kind: TRAIL_KINDS.EXPENSE,
    summary: `Added a ${money(data.amount)} expense to ${job.title} — ${data.category}${data.receiptUrl ? " (receipt attached)" : ""}`,
    proposalId: job.proposalId,
    clientId: job.clientId,
    meta: { jobId: data.jobId, expenseId: exp.id, amount: data.amount, category: data.category },
  });
  return { id: exp.id };
}

export async function deleteJobExpense(id: string) {
  const { organizationId, user } = await requireManager();
  const exp = await db.jobExpense.findUnique({
    where: { id },
    include: { job: { select: { organizationId: true, title: true, proposalId: true, clientId: true } } },
  });
  if (!exp || exp.job.organizationId !== organizationId) throw new Error("Not found");
  await db.jobExpense.delete({ where: { id } });
  revalidatePath("/dashboard/financials/expenses");
  revalidatePath("/dashboard/financials");
  await logActivity({
    organizationId,
    actorId: user.id,
    kind: TRAIL_KINDS.EXPENSE,
    summary: `Deleted a ${money(exp.amount)} expense from ${exp.job.title} — ${exp.category}`,
    proposalId: exp.job.proposalId,
    clientId: exp.job.clientId,
    meta: { jobId: exp.jobId, expenseId: id, amount: exp.amount, category: exp.category, deleted: true },
  });
}
