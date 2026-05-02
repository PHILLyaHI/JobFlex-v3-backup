import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { InvoicesTable, type InvoiceRow } from "@/components/financials/InvoicesTable";

export default async function InvoicesPage() {
  const { organizationId } = await requireOrg();

  const invoices = await db.invoice.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const clientIds = Array.from(new Set(invoices.map((i) => i.clientId).filter(Boolean) as string[]));
  const clients = clientIds.length
    ? await db.client.findMany({
        where: { id: { in: clientIds } },
        select: { id: true, name: true },
      })
    : [];
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  const rows: InvoiceRow[] = invoices.map((i) => ({
    id: i.id,
    number: i.number,
    proposalId: i.proposalId,
    clientName: i.clientId ? (clientName.get(i.clientId) ?? "—") : "—",
    amount: i.amount,
    status: i.status,
    provider: i.provider,
    dueDate: i.dueDate,
    paidAt: i.paidAt,
  }));

  return <InvoicesTable rows={rows} />;
}
