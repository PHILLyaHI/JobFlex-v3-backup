// WHAT THE COMPANY KEEPS IN STOCK (2026-09-23) — server module.
//
// Owner: "when they set up their inventory, mark what they keep in stock …
// not every contractor stocks everything … check-box what they stock and
// calculate on that." Every item is either KEPT IN STOCK — counted on the
// shelf, reserved by sold jobs, reordered when low, everything the board did
// before — or BOUGHT PER JOB: nothing on the shelf is expected, so it is
// never low and never restocked; when a job sells, its per-job materials go
// on a shopping list for that job instead (lib/inventory jobBuyList) and the
// crew's pick list says "ordered for this job", not "short".
//
// The choice is an ActivityEvent per company and trade (kind
// INVENTORY_STOCK_POLICY, meta { trade, perJob: [item keys] }), the newest
// one winning — no schema change, for the same reason as INVENTORY_LINK: the
// production build does not push the schema. Keyed by InventoryItem.key (the
// name normalized), which survives a delete and re-seed where an id does
// not. Absent from the list = kept in stock, so a company that never chose
// reads exactly as before.

import { db } from "@/lib/db";
import type { StockItem, TradeId } from "@/lib/inventory";

export const STOCK_POLICY_EVENT = "INVENTORY_STOCK_POLICY";

export type StockPolicy = {
  /** Item keys bought per job. Everything else is kept in stock. */
  perJob: Set<string>;
  /** When the company last saved its choice; null when it never did. */
  decidedAt: string | null;
};

const NONE = (): StockPolicy => ({ perJob: new Set(), decidedAt: null });

/** The newest policy for the trade; never throws — a missing table or a bad row reads as "never chosen". */
export async function stockPolicyOf(organizationId: string, trade: TradeId): Promise<StockPolicy> {
  try {
    const ev = await db.activityEvent.findFirst({
      where: { organizationId, kind: STOCK_POLICY_EVENT, meta: { contains: `"trade":"${trade}"` } },
      orderBy: { createdAt: "desc" },
      select: { meta: true, createdAt: true },
    });
    if (!ev) return NONE();
    const meta = JSON.parse(ev.meta ?? "{}") as { trade?: string; perJob?: unknown };
    if (meta.trade !== trade) return NONE();
    const keys = Array.isArray(meta.perJob) ? meta.perJob.filter((k): k is string => typeof k === "string") : [];
    return { perJob: new Set(keys), decidedAt: ev.createdAt.toISOString() };
  } catch {
    return NONE();
  }
}

/** Append the trade's whole choice; the newest event is the one that counts. The summary reads in the activity feed. */
export async function recordStockPolicy(organizationId: string, trade: TradeId, perJob: Iterable<string>, actorId: string | null | undefined, summary: string): Promise<void> {
  const keys = [...new Set(perJob)].filter((k) => typeof k === "string" && k.length > 0).sort();
  await db.activityEvent.create({
    data: { organizationId, actorId: actorId ?? null, kind: STOCK_POLICY_EVENT, summary, meta: JSON.stringify({ trade, perJob: keys }) },
  });
}

type ItemRow = { id: string; name: string; key: string; unit: string; onHand: number; reorderPoint: number | null; supplierId: string | null; supplierSku?: string | null; supplier?: { name: string } | null };

/** Item rows as the arithmetic reads them, the policy applied. */
export function withPolicy(items: readonly ItemRow[], policy: StockPolicy): StockItem[] {
  return items.map((i) => ({
    id: i.id,
    name: i.name,
    key: i.key,
    unit: i.unit,
    onHand: i.onHand,
    reorderPoint: i.reorderPoint,
    supplierId: i.supplierId,
    supplierName: i.supplier?.name ?? null,
    supplierSku: i.supplierSku ?? null,
    stocked: !policy.perJob.has(i.key),
  }));
}

/**
 * The trade's items with the stock policy applied — the one read every page
 * that counts against the shelf uses: the board, the pick lists, the crew's
 * "loaded", the daily check.
 */
export async function stockItemsOf(organizationId: string, trade: TradeId): Promise<StockItem[]> {
  const [items, policy] = await Promise.all([
    db.inventoryItem.findMany({ where: { organizationId, trade }, orderBy: { name: "asc" }, include: { supplier: { select: { name: true } } } }),
    stockPolicyOf(organizationId, trade),
  ]);
  return withPolicy(items, policy);
}
