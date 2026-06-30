"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";

const expenseInput = z.object({
  jobId: z.string(),
  category: z.string().min(1),
  amount: z.number().min(0),
  note: z.string().optional().nullable(),
  receiptUrl: z.string().optional().nullable(),
  ocrJson: z.string().optional().nullable(),
});

export async function addJobExpense(raw: unknown) {
  const { organizationId } = await requireManager();
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
  return { id: exp.id };
}

export async function deleteJobExpense(id: string) {
  const { organizationId } = await requireManager();
  const exp = await db.jobExpense.findUnique({
    where: { id },
    include: { job: { select: { organizationId: true } } },
  });
  if (!exp || exp.job.organizationId !== organizationId) throw new Error("Not found");
  await db.jobExpense.delete({ where: { id } });
  revalidatePath("/dashboard/financials/expenses");
  revalidatePath("/dashboard/financials");
}
