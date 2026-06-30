// Live proposals page — promoted to the Pressroom 3-tab build
// (All · Accepted · Completed) on desktop. Mobile keeps the existing
// MobileProposalsList. The desktop view is shared with /v3/proposals-c
// via the same ProposalsCView orchestrator at
// src/components/v3/proposals-c/proposals-c-view.tsx — both routes render
// the identical layout.

import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { ProposalsCView } from "@/components/v3/proposals-c/proposals-c-view";
import {
  MobileProposalsList,
  type MobileProposalRow,
} from "./mobile-proposals-list";
import type {
  InstallmentLine,
  ProposalCRow,
  ProposalCStatus,
} from "@/components/v3/proposals-c/types";
import { parseProposalPhotos } from "@/components/v3/proposals-c/types";

export const dynamic = "force-dynamic";

export default async function ProposalsListPage() {
  const { organizationId } = await requireOrg();

  const proposals = await db.proposal.findMany({
    where: { organizationId },
    orderBy: { updatedAt: "desc" },
    include: {
      client: {
        select: {
          name: true,
          email: true,
          address: true,
          city: true,
          state: true,
          zip: true,
        },
      },
      owner: {
        select: {
          name: true,
        },
      },
      installments: { orderBy: { position: "asc" } },
      lineItems: {
        select: {
          id: true,
          name: true,
          description: true,
          measurementType: true,
          quantity: true,
          materialCost: true,
          store: true,
          productUrl: true,
          imageUrl: true,
          dimensions: true,
        },
        orderBy: { position: "asc" },
      },
    },
  });

  const rows: ProposalCRow[] = proposals.map((p) => ({
    id: p.id,
    publicId: p.publicId,
    title: p.title,
    status: p.status as ProposalCStatus,
    total: p.total,
    subtotal: p.subtotal,
    taxTotal: p.taxTotal,
    clientName: p.client?.name ?? "Unassigned",
    clientEmail: p.client?.email ?? null,
    clientAddress: p.client?.address ?? null,
    clientCity: p.client?.city ?? null,
    clientState: p.client?.state ?? null,
    clientZip: p.client?.zip ?? null,
    createdAtISO: p.createdAt.toISOString(),
    updatedAtISO: p.updatedAt.toISOString(),
    sentAtISO: p.sentAt?.toISOString() ?? null,
    acceptedAtISO: p.acceptedAt?.toISOString() ?? null,
    paidAtISO: p.paidAt?.toISOString() ?? null,
    validUntilISO: p.validUntil?.toISOString() ?? null,
    viewCount: p.viewCount,
    creatorName: p.owner?.name ?? null,
    installments: p.installments.map<InstallmentLine>((i) => ({
      id: i.id,
      label: i.label,
      amount: i.amount,
      isPercent: i.isPercent,
      dueDate: i.dueDate?.toISOString() ?? null,
      position: i.position,
    })),
    materials: p.lineItems.map((l) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      measurementType: l.measurementType,
      quantity: l.quantity,
      materialCost: l.materialCost,
      store: l.store,
      productUrl: l.productUrl,
      imageUrl: l.imageUrl,
      dimensions: l.dimensions,
    })),
    beforePhotos: parseProposalPhotos(p.beforePhotos),
    afterPhotos: parseProposalPhotos(p.afterPhotos),
  }));

  const accepted = rows.filter((r) => r.status === "ACCEPTED");
  const completed = rows.filter((r) => r.status === "PAID");

  const mobileRows: MobileProposalRow[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    total: r.total,
    clientName: r.clientName,
    updatedAt: new Date(r.updatedAtISO),
  }));

  return (
    <>
      <div className="md:hidden">
        <MobileProposalsList rows={mobileRows} />
      </div>
      <div className="hidden md:block">
        <ProposalsCView all={rows} accepted={accepted} completed={completed} />
      </div>
    </>
  );
}
