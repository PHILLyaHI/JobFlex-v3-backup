// One trade's inventory page — the server half, shared by the three routes
// under the estimators (/dashboard/<trade>-estimator/inventory, 2026-10-10).
// The trade comes from the address, never from a switch: a roofer's page
// shows the roof book and the roof stock and nothing else.

import { redirect } from "next/navigation";
import { isLimitedRole, NoOrgError, requireOrg, UnauthorizedError } from "@/lib/orgContext";
import { loadInventoryPage, parseTab } from "@/lib/inventoryPage";
import { canEditBook } from "@/lib/priceBook";
import { INVENTORY_PATH, type TradeId } from "@/lib/inventory";
import { InventoryContent } from "./inventory-content";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function TradeInventoryPage({ trade, searchParams }: { trade: TradeId; searchParams: Promise<Search> }) {
  const sp = await searchParams;
  let organizationId: string;
  let role: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
    role = ctx.role;
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect(`/auth/login?next=${encodeURIComponent(INVENTORY_PATH[trade])}`);
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }
  const tab = parseTab(one(sp.tab), trade);
  const data = await loadInventoryPage(organizationId, trade, tab);
  return <InventoryContent key={`${trade}-${tab}`} data={data} canEditBook={canEditBook(role)} canWriteStock={!isLimitedRole(role)} />;
}
