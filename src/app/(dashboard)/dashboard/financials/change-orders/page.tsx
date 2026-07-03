import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { ChangeOrdersTable, type ChangeOrderRow } from "@/components/financials/ChangeOrdersTable";

export default async function ChangeOrdersPage() {
  const { organizationId } = await requireOrg();

  const cos = await db.changeOrder.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { job: { select: { id: true, title: true } } },
  });

  const rows: ChangeOrderRow[] = cos.map((c) => ({
    id: c.id,
    jobId: c.jobId,
    jobTitle: c.job?.title ?? "—",
    title: c.title,
    amount: c.amount,
    status: c.status,
    createdAt: c.createdAt,
  }));

  return <ChangeOrdersTable rows={rows} />;
}
