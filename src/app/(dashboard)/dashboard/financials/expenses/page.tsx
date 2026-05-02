import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { ReceiptDropzone } from "@/components/financials/ReceiptDropzone";
import { ExpensesTable, type ExpenseRow } from "@/components/financials/ExpensesTable";

export default async function ExpensesPage() {
  const { organizationId } = await requireOrg();

  const [expenses, jobs] = await Promise.all([
    db.jobExpense.findMany({
      where: { job: { organizationId } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { job: { select: { id: true, title: true, organizationId: true } } },
    }),
    db.job.findMany({
      where: { organizationId, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      select: { id: true, title: true },
      orderBy: { startsAt: "asc" },
      take: 50,
    }),
  ]);

  const rows: ExpenseRow[] = expenses.map((e) => ({
    id: e.id,
    jobId: e.jobId,
    jobTitle: e.job.title,
    category: e.category,
    amount: e.amount,
    note: e.note,
    receiptUrl: e.receiptUrl,
    createdAt: e.createdAt,
  }));

  return (
    <div className="space-y-5">
      <ReceiptDropzone jobs={jobs} />
      <ExpensesTable rows={rows} />
    </div>
  );
}
