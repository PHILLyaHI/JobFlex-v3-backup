// v3 proposals — Pressroom edition. A frontend-design duplicate of the live
// `/dashboard/proposals` page restructured into a three-tab dossier
// (All · Accepted · Completed). The original page at /dashboard/proposals
// continues to serve traffic untouched. No schema or action changes — this
// page reuses the existing `/actions/proposals.ts` server actions and reads
// Prisma directly with the same shape as the original.
//
// Auth: the project's middleware only matches /dashboard and /admin, so
// every v3 page enforces its own redirect-to-login here. Adding /v3 to the
// matcher would also pull in the public marketing routes.

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { ProposalsCView } from "@/components/v3/proposals-c/proposals-c-view";
import { V3_PORTED_ROUTES } from "@/lib/v3/routes";
import type {
  InstallmentLine,
  ProposalCRow,
  ProposalCStatus,
} from "@/components/v3/proposals-c/types";
import { parseProposalPhotos } from "@/components/v3/proposals-c/types";

export const dynamic = "force-dynamic";

export default async function ProposalsCPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/login?next=${encodeURIComponent(V3_PORTED_ROUTES.proposalsC)}`);
  }

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
      installments: {
        orderBy: { position: "asc" },
        include: { payment: { select: { provider: true } } },
      },
      lineItems: {
        select: {
          id: true,
          name: true,
          description: true,
          measurementType: true,
          quantity: true,
          materialCost: true,
          // The product metadata the AI estimator attached from its live SerpAPI
          // match. Without it the materials sheet can only guess a merchant, so
          // every row loses its thumbnail and its "Buy at …" link.
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
      status: i.status,
      paidAt: i.paidAt?.toISOString() ?? null,
      paidAmount: i.paidAmount,
      paidVia: i.payment?.provider ?? null,
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

  // Split for the three tabs. ACCEPTED → Accepted tab. PAID → Completed tab.
  // Everything else stays in All (which still includes accepted + paid so
  // operators can see the full pipeline from one view).
  const accepted = rows.filter((r) => r.status === "ACCEPTED");
  const completed = rows.filter((r) => r.status === "PAID");

  return <ProposalsCView all={rows} accepted={accepted} completed={completed} />;
}
