// INVENTORY — one page for the three trades (owner, 2026-09-29).
//
// /dashboard/inventory?trade=roof|fence|hvac&tab=book|stock|services&inv=1|2
//
// What the estimators price from (the price book) and what the warehouse
// holds (the stock), for the trade the segmented control picks. The old
// per-trade boards (/dashboard/<trade>-estimator/board), the HVAC service menu
// page and the handheld HVAC preview answer 308 to this route (middleware).
// The stock tab is the maintained RoofingInventory workspace, embedded; the
// service menu (HVAC) is the HvacServicesContent page, embedded.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isLimitedRole, NoOrgError, requireOrg, UnauthorizedError } from "@/lib/orgContext";
import { loadInventoryPage, parseTab, parseVariant, resolveInventoryTrade } from "@/lib/inventoryPage";
import { canEditBook } from "@/lib/priceBook";
import { InventoryContent } from "@/components/v3/inventory-blueprint/inventory-content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "JobFlex · Inventory", description: "Your price book and your stock, per trade." };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  let organizationId: string;
  let role: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
    role = ctx.role;
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard%2Finventory");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }
  const trade = await resolveInventoryTrade(organizationId, one(sp.trade));
  const tab = parseTab(one(sp.tab), trade);
  const variant = parseVariant(one(sp.inv));
  const data = await loadInventoryPage(organizationId, trade, tab, variant);
  return <InventoryContent key={`${trade}-${tab}`} data={data} canEditBook={canEditBook(role)} canWriteStock={!isLimitedRole(role)} />;
}
