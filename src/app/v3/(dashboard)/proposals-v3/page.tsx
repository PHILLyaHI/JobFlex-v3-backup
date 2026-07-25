// Proposals v3 — Blueprint edition of the live proposals page's structure.
// jobflex-page-styler build: the reference dashboard's app shell around the
// live page's own composition (dateline head → revenue masthead →
// All / Accepted / Completed tabs → ledger / dossiers / tear-sheets),
// restyled in the blueprint system. Live org data, read-only; the classic
// page at /dashboard/proposals stays untouched.
//
// Auth: middleware only matches /dashboard and /admin, so this page
// enforces its own redirect-to-login (same pattern as the other /v3
// experiments). Reads are org-wide — no role scoping here.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { requireOrg, NoOrgError } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { V3_PORTED_ROUTES } from "@/lib/v3/routes";
import { parseProposalPhotos } from "@/components/v3/proposals-c/types";
import { ProposalsV3, type V3Row, type V3Status } from "./proposals-v3-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Proposals v3 — JobFlex",
  description:
    "Blueprint-edition proposals: the pipeline masthead, the open ledger, signed work in motion, and filed tear-sheets — on one sheet.",
};

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

const label = (d: Date | null | undefined) => (d ? dateFmt.format(d).toUpperCase() : null);

export default async function ProposalsV3Page() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/login?next=${encodeURIComponent(V3_PORTED_ROUTES.proposalsV3)}`);
  }

  let organizationId: string;
  let userName: string;
  let roleLabel: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
    userName = ctx.user.name ?? ctx.user.email ?? "Operator";
    roleLabel = ctx.role
      ? ctx.role.charAt(0).toUpperCase() + ctx.role.slice(1).toLowerCase()
      : "Owner";
  } catch (err) {
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  const proposals = await db.proposal.findMany({
    where: { organizationId, status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      total: true,
      viewCount: true,
      updatedAt: true,
      sentAt: true,
      acceptedAt: true,
      paidAt: true,
      beforePhotos: true,
      afterPhotos: true,
      client: { select: { name: true, email: true, city: true, state: true } },
      owner: { select: { name: true } },
      installments: { orderBy: { position: "asc" } },
      _count: { select: { lineItems: true } },
    },
  });

  // Date labels and percent-installment math happen once, server-side, so
  // SSR and hydration agree.
  const rows: V3Row[] = proposals.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status as V3Status,
    total: p.total,
    viewCount: p.viewCount,
    clientName: p.client?.name ?? "Unassigned",
    clientPlace: p.client?.city
      ? `${p.client.city}${p.client.state ? `, ${p.client.state}` : ""}`
      : null,
    clientEmail: p.client?.email ?? null,
    ownerName: p.owner?.name ?? null,
    materialCount: p._count.lineItems,
    updatedAtMs: p.updatedAt.getTime(),
    updatedLabel: label(p.updatedAt) ?? "",
    sentLabel: label(p.sentAt),
    acceptedLabel: label(p.acceptedAt),
    paidLabel: label(p.paidAt),
    installments: p.installments.map((i) => ({
      id: i.id,
      label: i.label,
      amount: i.isPercent ? (p.total * i.amount) / 100 : i.amount,
      dueLabel: label(i.dueDate),
    })),
    beforeUrl: parseProposalPhotos(p.beforePhotos)[0]?.url ?? null,
    afterUrl: parseProposalPhotos(p.afterPhotos)[0]?.url ?? null,
  }));

  const now = new Date();

  return (
    <ProposalsV3
      rows={rows}
      userName={userName}
      roleLabel={roleLabel}
      dateLabel={dateFmt.format(now)}
    />
  );
}
