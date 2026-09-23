// ROOFING INVENTORY · REDESIGN PREVIEW (2026-09-22) — the desktop build of the
// Claude redesign on real data, beside the live board at
// /dashboard/roof-estimator/board. A parallel Codex session owns that route and
// its page.tsx, so this preview has a route of its own rather than a query
// switch inside it. Same reads, same role rule, same writes as the live board.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RoofInventory } from "@/components/v3/roof-inventory-claude/roof-inventory";
import { loadTradeBoard } from "@/lib/inventoryBoard";
import { loadStockFacts } from "@/lib/inventoryDashboard";
import { isLimitedRole, NoOrgError, requireOrg, UnauthorizedError } from "@/lib/orgContext";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "JobFlex · Roofing inventory" };

export default async function Page() {
  let organizationId: string;
  let role: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
    role = ctx.role;
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard%2Froof-estimator%2Fboard%2Fclaude");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }
  const data = await loadTradeBoard(organizationId, "roof");
  if (!data) redirect("/dashboard/roof-estimator");
  const facts = await loadStockFacts(
    organizationId,
    "roof",
    data.proposals.filter((p) => p.linked && p.status === "ACCEPTED" && !p.loaded).map((p) => p.id),
  );
  return <RoofInventory data={data} facts={facts} canWrite={!isLimitedRole(role)} />;
}
