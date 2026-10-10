"use server";
// THE INVENTORY PAGE'S OWN WRITES (2026-09-29). The books themselves are
// written through the estimators' actions (fenceCatalog, roofCatalog,
// hvacEstimator) so the page cannot drift from what they read; what lives
// here is the little the page needs on top: the trade the visitor last chose,
// and the one write the HVAC catalog never had — removing a row.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { INVENTORY_PATH, isTradeId } from "@/lib/inventory";
import { requireEstimatorOrManager } from "@/lib/orgContext";
import { TRADE_COOKIE } from "@/lib/inventoryPage";

/** The segmented control's choice, kept for a year on this browser. */
export async function rememberInventoryTrade(trade: string): Promise<void> {
  if (!isTradeId(trade)) return;
  (await cookies()).set(TRADE_COOKIE, trade, { path: "/", maxAge: 365 * 24 * 60 * 60, sameSite: "lax" });
}

export async function deleteHvacCatalogItem(itemId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { organizationId } = await requireEstimatorOrManager();
  const id = String(itemId ?? "").trim();
  if (!id) return { ok: false, error: "Which row?" };
  try {
    await db.hvacCatalogItem.deleteMany({ where: { organizationId, itemId: id } });
  } catch {
    return { ok: false, error: "Couldn't remove the row." };
  }
  revalidatePath(INVENTORY_PATH.hvac);
  revalidatePath("/dashboard/hvac-estimator");
  return { ok: true };
}
