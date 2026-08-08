// Manual Card Lab (route: /dashboard/manual-cards) — the hub of the design lab
// for the NEXT manual proposal builder, single-column-cards edition. Five
// complete builds of the same feature set live at five sibling routes; this
// page is the index that presents them as blueprint spec-cards and links out.
// It owns no builder logic and no fixtures — it is just links.
//
// Sibling of /dashboard/manual-lab, which indexes an EARLIER four-variant set
// (drafting / ticket / ledger / stack) built around mixed layout paradigms.
// This lab holds one paradigm — a single column of cards — and five competing
// bets about what those cards should be organised around.
//
// Top-level route directly under /dashboard on purpose: blueprint-shell's
// pageKey() reads the first path segment, and a child of an existing route
// would inherit that route's page key and stylesheet. The key "manual-cards"
// is deliberately NOT registered in PAGE_STYLES — the hub authors its own
// markup, so its module CSS ships with the content component and uses hashed
// local classes instead of the ported pages' `.bp :global(.content …)`
// contract.
//
// The five variant routes are being polished by parallel agents, so this page
// must not import from their folders — they are linked by URL string only
// (cast to Route, same as the donor pages' router.push casts).

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { ManualCardsHubContent } from "@/components/v3/manual-cards-hub/hub-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Manual Card Lab",
  description:
    "Five single-column card designs of the manual proposal builder, side by side — open each one and pick the grammar.",
};

export default async function ManualCardsLabPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fmanual-cards");
  }

  return <ManualCardsHubContent />;
}
