// THE HVAC BOARD (2026-09-20): this trade's proposals, its warehouse stock
// with the work counted against it, and its suppliers — under the estimator
// in the sidebar. The read is lib/inventoryBoard; the writes are
// actions/inventory (manager or owner). Sales and estimator roles read it.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TradeBoard } from "@/components/v3/trade-board/trade-board";
import { loadTradeBoard } from "@/lib/inventoryBoard";
import { loadStockFacts } from "@/lib/inventoryDashboard";
import { isLimitedRole, NoOrgError, requireOrg, UnauthorizedError } from "@/lib/orgContext";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "JobFlex · HVAC board" };

export default async function Page() {
  let organizationId: string;
  let role: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
    role = ctx.role;
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard%2Fhvac-estimator%2Fboard");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }
  const data = await loadTradeBoard(organizationId, "hvac");
  if (!data) redirect("/dashboard/hvac-estimator");
  // The dashboard's extra facts — value, pace, history, the next loads (2026-09-20).
  const facts = await loadStockFacts(organizationId, "hvac");
  return <TradeBoard data={data} facts={facts} canWrite={!isLimitedRole(role)} />;
}
