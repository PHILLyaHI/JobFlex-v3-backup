// /dashboard/proposals/[id] — a proposal's canonical URL. Forty-odd links
// across the app point here: the proposals book, the estimators' "Convert to
// proposal", notifications, global search, client and project pages.
//
// The editor itself is the house blueprint builder at
// /dashboard/manual-blueprint?proposal=<id> (reads and writes the real row
// through saveProposal / sendProposal; see its page header), so this route
// only hands over. The Tailwind editor that used to render here inside the
// classic chrome was removed on 2026-09-12 at the owner's request.
//
// Org scoping and the sales/estimator "own proposals only" rule are enforced
// by the builder's loader, not here — an id from another org opens as
// "not found" there.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProposalRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/manual-blueprint?proposal=${encodeURIComponent(id)}`);
}
