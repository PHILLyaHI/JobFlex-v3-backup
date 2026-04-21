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
    include: { client: { select: { name: true } } },
  });

  const rows: ProposalRow[] = proposals.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    total: p.total,
    clientName: p.client?.name ?? "Unassigned",
    updatedAt: p.updatedAt,
    viewCount: p.viewCount,
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
