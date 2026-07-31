// Main proposals — Blueprint edition. Pixel-identical port of the canonical
// proposals donor (jobflex-proposals-blueprint.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// Child routes (/new, /create, /[id], /ai, /templates) live under the
// (dashboard) route group and keep the classic layout.
//
// This page is NOT a fixture. The proposal book is read from the database here
// and the row menu calls the real proposal server actions (see
// proposals-behavior.ts). The query is the one the Pressroom edition already
// uses (src/app/v3/(dashboard)/proposals-c/page.tsx) — same includes, same
// ordering — so both editions describe the same book.
//
// Scoping is `requireProposalStaff`, not `requireOrg`: every action the row
// menu calls is gated that way (managers see the org, SALES/ESTIMATOR see only
// proposals they own), so the LIST has to be scoped identically or the page
// would show rows whose menu items all fail with "Not found".

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireProposalStaff, NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { ProposalsContent } from "@/components/v3/proposals-blueprint/proposals-content";
import type { Installment, ProposalRow } from "@/components/v3/proposals-blueprint/proposals-data";
import { zillowSearchUrl } from "@/lib/zillow";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Proposals",
  description: "Proposals — masthead, pipeline tabs and the full proposal book on one sheet.",
};

/** The donor prints "25m ago" / "3d ago"; anything older gets a coarser unit. */
function agoLabel(d: Date): string {
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  if (s < 86400 * 30) return `${Math.floor(s / (86400 * 7))}w ago`;
  if (s < 86400 * 365) return `${Math.floor(s / (86400 * 30))}mo ago`;
  return `${Math.floor(s / (86400 * 365))}y ago`;
}

/** Accepted / paid / due plates are the donor's short caps form — "JUL 18". */
function plateDate(d: Date | null | undefined): string | undefined {
  if (!d) return undefined;
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" }).toUpperCase();
}

export default async function ProposalsPage() {
  let organizationId: string;
  let proposalScope: { ownerId?: string };
  try {
    const ctx = await requireProposalStaff();
    organizationId = ctx.organizationId;
    proposalScope = ctx.proposalScope;
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard%2Fproposals");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  const proposals = await db.proposal.findMany({
    where: { organizationId, ...proposalScope },
    orderBy: { updatedAt: "desc" },
    include: {
      client: {
        select: { name: true, email: true, address: true, city: true, state: true, zip: true },
      },
      owner: { select: { name: true } },
      installments: { orderBy: { position: "asc" } },
      lineItems: {
        select: {
          id: true,
          name: true,
          description: true,
          measurementType: true,
          quantity: true,
          materialCost: true,
          // Live-pricing metadata — without it the materials sheet can only
          // guess a merchant, so every buy link degrades to a plain search.
          store: true,
          productUrl: true,
          imageUrl: true,
          dimensions: true,
        },
        orderBy: { position: "asc" },
      },
    },
  });

  const rows: ProposalRow[] = proposals.map((p) => {
    const materials = p.lineItems.map((l) => ({
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
    }));
    // Same predicate the classic row menu used for its "N items" hint.
    const shoppable = materials.filter((m) => (m.materialCost ?? 0) > 0 && m.quantity > 0);
    const inst: Installment[] = p.installments.map((i) => ({
      label: i.label,
      due: plateDate(i.dueDate) ?? null,
      amount: i.amount,
      pct: i.isPercent,
    }));
    return {
      id: p.id,
      publicId: p.publicId,
      title: p.title,
      client: p.client?.name ?? "Unassigned",
      clientEmail: p.client?.email ?? null,
      city: p.client?.city ?? "",
      status: p.status,
      total: p.total,
      updated: agoLabel(p.updatedAt),
      views: p.viewCount,
      // The donor prints a single given name in the Owner column.
      owner: p.owner?.name?.trim().split(/\s+/)[0] || "—",
      mat: shoppable.length,
      zillow: zillowSearchUrl({
        address: p.client?.address,
        city: p.client?.city,
        state: p.client?.state,
        zip: p.client?.zip,
      }),
      accepted: plateDate(p.acceptedAt),
      paid: plateDate(p.paidAt),
      inst: inst.length ? inst : undefined,
      materials,
    };
  });

  return <ProposalsContent rows={rows} />;
}
