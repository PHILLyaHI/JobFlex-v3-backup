// Main trade board — Blueprint edition. Ported from the canonical trade board
// donor (jobflex-trade-board-blueprint.html), minus the donor's Influencers
// tab: the influencer program is its own logged-in surface at /influencer, so
// this page is the jobs board and nothing else.
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// The child route (/[id]) lives under the (dashboard) route group and keeps
// the classic layout — it is where a post card's title links to.
//
// The board is NOT a fixture any more: the posts are read in ./load-trade and
// handed to BOTH editions through ./trade-responsive — the desktop board above
// 768px, the handheld build at or below — and the dialog and row menu call
// the real trade-post server actions on both.

import type { Metadata } from "next";
import { MarkNavSeen } from "@/components/layout/MarkNavSeen";
import { loadTradeProps } from "./load-trade";
import { TradeResponsive } from "./trade-responsive";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Trade Board",
  description: "Trade board — the contractor bulletin: gear, subs, job shares and questions.",
};

export default async function TradePage() {
  const props = await loadTradeProps("/dashboard/trade");

  return (
    <>
      {/* Clears the trade nav badge (work sent to you + interest on your
          posts) on open. Both editions: the page owns the viewport switch, so
          this mounts on a phone too (the shell's HANDHELD_SEEN stamp for this
          route is gone). */}
      <MarkNavSeen surface="trade" />
      <TradeResponsive {...props} />
    </>
  );
}
