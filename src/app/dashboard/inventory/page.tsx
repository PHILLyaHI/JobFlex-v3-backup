// /dashboard/inventory — forwards to a trade's own inventory (2026-10-10).
//
// The three trades shared this page from 2026-09-29 to 2026-10-10; the owner
// then moved each under its estimator so a roofer sees the roof book only
// (lib/inventory INVENTORY_PATH). Every old link — the bell's notices, the
// estimators' "edit the price book", saved bookmarks — still lands: the
// ?trade= it names, else the trade this company works, on the ?tab= asked.

import type { Route } from "next";
import { redirect } from "next/navigation";
import { NoOrgError, requireOrg, UnauthorizedError } from "@/lib/orgContext";
import { parseTab, resolveInventoryTrade } from "@/lib/inventoryPage";
import { inventoryHref } from "@/lib/inventory";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function InventoryForward({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  let organizationId: string;
  try {
    ({ organizationId } = await requireOrg());
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard%2Finventory");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }
  const trade = await resolveInventoryTrade(organizationId, one(sp.trade));
  redirect(inventoryHref(trade, parseTab(one(sp.tab), trade)) as Route);
}
