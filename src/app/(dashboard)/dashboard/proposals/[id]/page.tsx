import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOrg, isSalesRole, isEstimatorRole } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ProposalEditor } from "@/components/v3/proposal-builder-a/ProposalEditor";
import { HydrateDraft } from "./hydrate-draft";
import { ProposalActions } from "./proposal-actions";
import { SnapshotHistory } from "@/components/proposal/SnapshotHistory";
import { MaterialPurchasingList } from "@/components/materials/MaterialPurchasingList";
import { money, longDate } from "@/lib/format";
import { ExternalLink } from "lucide-react";

export default async function ProposalEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId, role, user } = await requireOrg();
  const proposal = await db.proposal.findUnique({
    where: { id },
    include: {
      lineItems: { orderBy: { position: "asc" } },
      installments: { orderBy: { position: "asc" } },
      client: true,
      snapshots: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!proposal || proposal.organizationId !== organizationId) return notFound();
  // Sales reps and estimators can only open proposals they own.
  if ((isSalesRole(role) || isEstimatorRole(role)) && proposal.ownerId !== user.id) {
    return notFound();
  }

  const [clients, projects, org] = await Promise.all([
    db.client.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        zip: true,
      },
    }),
    db.project.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={<span className="inline-flex items-center gap-2">Edit · <Badge tone={tone(proposal.status)}>{proposal.status}</Badge></span>}
        title={proposal.title}
        description={
          proposal.viewedAt
            ? `Last viewed by client ${longDate(proposal.viewedAt)} · ${proposal.viewCount} view${proposal.viewCount === 1 ? "" : "s"}`
            : proposal.sentAt
              ? `Sent ${longDate(proposal.sentAt)} — awaiting client view`
              : `Draft · total ${money(proposal.total)}`
        }
        actions={
          <>
            <Link href={`/portal/q/${proposal.publicId}` as never} target="_blank">
              <Button variant="outline" size="sm" icon={<ExternalLink className="h-3 w-3" />}>
                Public portal
              </Button>
            </Link>
            <ProposalActions
              id={proposal.id}
              status={proposal.status}
              defaultTemplateName={proposal.title}
            />
          </>
        }
      />
      <HydrateDraft
        value={{
          id: proposal.id,
          title: proposal.title,
          clientId: proposal.clientId ?? undefined,
          description: proposal.description ?? "",
          scopeOfWork: proposal.scopeOfWork ?? "",
          notes: proposal.notes ?? "",
          taxRate: proposal.taxRate,
          lineItems: proposal.lineItems.map((l) => ({
            id: l.id,
            name: l.name,
            description: l.description ?? undefined,
            measurementType:
              l.measurementType as "SQFT" | "LINEAR_FT" | "CUBIC_FT" | "UNIT" | "HOUR" | "LUMP_SUM",
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            materialCost: l.materialCost,
            laborCost: l.laborCost,
            store: l.store,
            productUrl: l.productUrl,
            imageUrl: l.imageUrl,
            dimensions: l.dimensions,
          })),
          installments: proposal.installments.map((i) => ({
            id: i.id,
            label: i.label,
            amount: i.amount,
            isPercent: i.isPercent,
          })),
          materialMarkupPct: proposal.materialMarkupPct ?? 0,
          laborMarkupPct: proposal.laborMarkupPct ?? 0,
          overheadPct: proposal.overheadPct ?? 0,
          profitPct: proposal.profitPct ?? 0,
        }}
      />
      <ProposalEditor
        clients={clients}
        projects={projects}
        existingId={proposal.id}
        orgName={org?.name ?? undefined}
        initialStatus={proposal.status}
      />
      <div className="mt-6">
        <MaterialPurchasingList proposalId={proposal.id} />
      </div>
      <div className="mt-6">
        <SnapshotHistory
          proposalId={proposal.id}
          snapshots={proposal.snapshots.map((s) => ({
            id: s.id,
            reason: s.reason,
            total: s.total,
            subtotal: s.subtotal,
            taxTotal: s.taxTotal,
            createdAt: s.createdAt,
          }))}
        />
      </div>
    </>
  );
}

function tone(s: string): "neutral" | "accent" | "success" | "danger" | "warn" {
  if (s === "ACCEPTED" || s === "PAID") return "success";
  if (s === "SENT" || s === "VIEWED") return "accent";
  if (s === "DECLINED" || s === "EXPIRED") return "danger";
  return "neutral";
}
