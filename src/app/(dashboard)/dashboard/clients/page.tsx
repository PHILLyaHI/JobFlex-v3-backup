import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Plus, Users } from "lucide-react";
import { ClientsTable, type ClientRow } from "./clients-table";

export default async function ClientsListPage() {
  const { organizationId } = await requireOrg();
  const clients = await db.client.findMany({
    where: { organizationId, deletedAt: null },
    include: {
      proposals: { select: { total: true, status: true } },
      tags: { include: { tag: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const rows: ClientRow[] = clients.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    address: [c.city, c.state].filter(Boolean).join(", ") || c.address,
    proposalCount: c.proposals.length,
    pipelineValue: c.proposals
      .filter((p) => !["DECLINED", "EXPIRED", "ARCHIVED"].includes(p.status))
      .reduce((a, p) => a + p.total, 0),
    tags: c.tags.map((t) => ({ label: t.tag.label, color: t.tag.color })),
    updated: c.updatedAt,
  }));

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Clients"
        description="Every homeowner you've worked with — proposals, payments, and the relationship in one place."
        actions={<Button icon={<Plus className="h-3.5 w-3.5" />}>New client</Button>}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No clients yet"
          description="Send your first proposal and a client is created automatically."
        />
      ) : (
        <ClientsTable rows={rows} />
      )}
    </>
  );
}
