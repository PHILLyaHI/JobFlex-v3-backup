import Link from "next/link";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Sparkles, FileText, Plus } from "lucide-react";
import { ProposalsTable, type ProposalRow } from "./proposals-table";

export default async function ProposalsListPage() {
  const { organizationId } = await requireOrg();
  const proposals = await db.proposal.findMany({
    where: { organizationId },
    orderBy: { updatedAt: "desc" },
    include: {
      client: {
        select: { name: true, email: true, address: true, city: true, state: true, zip: true },
      },
      lineItems: {
        select: {
          id: true,
          name: true,
          description: true,
          measurementType: true,
          quantity: true,
          materialCost: true,
        },
        orderBy: { position: "asc" },
      },
    },
  });

  const rows: ProposalRow[] = proposals.map((p) => ({
    id: p.id,
    publicId: p.publicId,
    title: p.title,
    status: p.status,
    total: p.total,
    clientName: p.client?.name ?? "Unassigned",
    clientEmail: p.client?.email ?? null,
    clientAddress: p.client?.address ?? null,
    clientCity: p.client?.city ?? null,
    clientState: p.client?.state ?? null,
    clientZip: p.client?.zip ?? null,
    updatedAt: p.updatedAt,
    viewCount: p.viewCount,
    materials: p.lineItems.map((l) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      measurementType: l.measurementType,
      quantity: l.quantity,
      materialCost: l.materialCost,
    })),
  }));

  return (
    <>
      <PageHeader
        eyebrow="Sales"
        title="Proposals"
        description="Draft, sent, viewed, accepted. Your full pipeline of quotes in one editorial table."
        actions={
          <>
            <Link href={"/dashboard/proposals/ai" as any}>
              <Button icon={<Sparkles className="h-3.5 w-3.5" />}>AI proposal</Button>
            </Link>
            <Link href={"/dashboard/proposals/new" as any}>
              <Button variant="outline" icon={<Plus className="h-3.5 w-3.5" />}>
                Manual
              </Button>
            </Link>
          </>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="No proposals yet"
          description="Draft your first proposal with AI or start from scratch. Both end up in the same place — looking sharp."
          action={
            <div className="flex gap-2">
              <Link href={"/dashboard/proposals/ai" as any}>
                <Button icon={<Sparkles className="h-3.5 w-3.5" />}>AI draft</Button>
              </Link>
              <Link href={"/dashboard/proposals/new" as any}>
                <Button variant="outline">Manual</Button>
              </Link>
            </div>
          }
        />
      ) : (
        <ProposalsTable rows={rows} />
      )}
    </>
  );
}
