// Main trade board — Blueprint edition. Pixel-identical port of the canonical
// trade board donor (jobflex-trade-board-blueprint.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// The child route (/[id]) lives under the (dashboard) route group and keeps
// the classic layout.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { TradeContent } from "@/components/v3/trade-blueprint/trade-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Trade Board",
  description: "Trade board — the contractor bulletin and the influencer program on one sheet.",
};

export default async function TradePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Ftrade");
  }

  return <TradeContent />;
}
