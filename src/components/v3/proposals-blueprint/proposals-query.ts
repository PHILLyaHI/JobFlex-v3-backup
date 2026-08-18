// The proposal book — ONE read, shared by every surface of /dashboard/proposals.
//
// Both entry points of this route render from this function:
//   · src/app/dashboard/proposals/page.tsx        — the desktop blueprint sheet
//   · src/app/(mobile)/mobile-proposals-v2/       — the handheld rebuild, which
//     serves both /mobile-proposals-v2 and /dashboard/proposals at ≤768px
//
// Keeping the query here rather than copied into each page is what stops the
// two designs describing different books. It is the query the Pressroom edition
// already used (src/app/v3/(dashboard)/proposals-c/page.tsx) — same includes,
// same ordering.
//
// Scoping is `requireProposalStaff`, not `requireOrg`: every action the row
// menus call is gated that way (managers see the org, SALES/ESTIMATOR see only
// proposals they own), so the LIST has to be scoped identically or the page
// would show rows whose menu items all fail with "Not found". This function
// never widens that scope and never takes an org id from its caller.

import { requireProposalStaff } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { parseProposalPhotos } from "@/components/v3/proposals-c/types";
import { describeAddress, zillowSearchUrl } from "@/lib/zillow";
import type { Installment, ProposalRow } from "./proposals-data";

/** The donor prints "25m ago" / "3d ago"; anything older gets a coarser unit. */
export function agoLabel(d: Date): string {
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
export function plateDate(d: Date | null | undefined): string | undefined {
  if (!d) return undefined;
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" }).toUpperCase();
}

/** Directions for the handheld menu. Null when the client carries no address,
 *  which is what disables that row rather than opening a search for nothing. */
function mapsUrl(c: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string | null {
  const q = describeAddress(c);
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/**
 * Every proposal the signed-in caller is allowed to see, newest edit first.
 * Throws UnauthorizedError / NoOrgError from requireProposalStaff — the callers
 * turn those into their own redirects.
 */
export async function readProposalBook(): Promise<ProposalRow[]> {
  const { organizationId, proposalScope } = await requireProposalStaff();

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

  return proposals.map((p) => {
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
      // The Remind button mails THIS instalment — notifyPaymentReminder looks
      // it up by id, so the id has to travel with the row.
      id: i.id,
      label: i.label,
      due: plateDate(i.dueDate) ?? null,
      amount: i.amount,
      pct: i.isPercent,
    }));
    const addr = {
      address: p.client?.address,
      city: p.client?.city,
      state: p.client?.state,
      zip: p.client?.zip,
    };
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
      zillow: zillowSearchUrl(addr),
      maps: mapsUrl(addr),
      accepted: plateDate(p.acceptedAt),
      paid: plateDate(p.paidAt),
      inst: inst.length ? inst : undefined,
      materials,
      // Completion photos — the tear-sheet's Before / After boxes render these
      // and upload into them through uploadProposalPhoto().
      before: parseProposalPhotos(p.beforePhotos),
      after: parseProposalPhotos(p.afterPhotos),
    } satisfies ProposalRow;
  });
}
