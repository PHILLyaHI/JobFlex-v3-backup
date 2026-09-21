// THE TRADE BOARD'S READ (2026-09-20) — server only, one query set per trade.
//
// The fence, roof and HVAC boards show the same three things for their own
// trade: the proposals that belong to it, the warehouse stock with the work
// counted against it (lib/inventory), and the suppliers. Nothing here is a
// "use server" action: the pages call it with a trusted organizationId.

import { db } from "@/lib/db";
import { isTradeId, stockRows, untrackedLines, type StockItem, type StockLine, type StockRow, type TradeId } from "@/lib/inventory";

export type BoardProposal = {
  id: string;
  title: string;
  client: string | null;
  status: string;
  total: number;
  createdAt: string;
  /** The job made from it, when one exists, and whether its truck is loaded. */
  jobId: string | null;
  loaded: boolean;
  lines: StockLine[];
};

export type BoardSupplier = { id: string; name: string; email: string | null; phone: string | null; website: string | null; itemCount: number };

export type BoardOrder = { id: string; supplier: string; sentAt: string; lines: Array<{ name: string; quantity: number }> };

export type TradeBoardData = {
  trade: TradeId;
  /** Purchase orders emailed and not yet received. */
  orders: BoardOrder[];
  proposals: BoardProposal[];
  rows: StockRow[];
  suppliers: BoardSupplier[];
  /** Material lines on this trade's proposals the warehouse does not track yet. */
  untracked: StockLine[];
  pipeline: { open: number; openTotal: number; sold: number; soldTotal: number; low: number; short: number };
};

const OPEN = ["DRAFT", "SENT", "VIEWED"];

export async function loadTradeBoard(organizationId: string, trade: string): Promise<TradeBoardData | null> {
  if (!isTradeId(trade)) return null;
  const [proposals, items, suppliers, sent] = await Promise.all([
    db.proposal.findMany({
      where: { organizationId, trade, status: { in: [...OPEN, "ACCEPTED"] } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        title: true,
        status: true,
        total: true,
        createdAt: true,
        client: { select: { name: true } },
        jobs: { select: { id: true, materialsLoadedAt: true, status: true }, take: 1, orderBy: { createdAt: "desc" } },
        lineItems: { where: { materialCost: { gt: 0 } }, select: { name: true, quantity: true, measurementType: true } },
      },
    }),
    db.inventoryItem.findMany({ where: { organizationId, trade }, orderBy: { name: "asc" }, include: { supplier: { select: { name: true } } } }),
    db.supplier.findMany({ where: { organizationId }, orderBy: { name: "asc" }, include: { _count: { select: { items: true } } } }),
    db.activityEvent.findMany({ where: { organizationId, kind: "PURCHASE_ORDER_SENT", meta: { contains: `"trade":"${trade}"` } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, createdAt: true, meta: true } }),
  ]);
  const orders: BoardOrder[] = sent
    .map((e) => {
      const meta = JSON.parse(e.meta ?? "{}") as { supplierId?: string; receivedAt?: string; lines?: Array<{ name: string; quantity: number }> };
      if (meta.receivedAt) return null;
      return { id: e.id, supplier: suppliers.find((s) => s.id === meta.supplierId)?.name ?? "Supplier", sentAt: e.createdAt.toISOString(), lines: meta.lines ?? [] };
    })
    .filter((o): o is BoardOrder => !!o);
  const list: BoardProposal[] = proposals.map((p) => ({
    id: p.id,
    title: p.title,
    client: p.client?.name ?? null,
    status: p.status,
    total: p.total,
    createdAt: p.createdAt.toISOString(),
    jobId: p.jobs[0]?.id ?? null,
    loaded: !!p.jobs[0]?.materialsLoadedAt,
    lines: p.lineItems.map((l) => ({ name: l.name, quantity: l.quantity, unit: l.measurementType })),
  }));
  const stock: StockItem[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    key: i.key,
    unit: i.unit,
    onHand: i.onHand,
    reorderPoint: i.reorderPoint,
    supplierId: i.supplierId,
    supplierName: i.supplier?.name ?? null,
    supplierSku: i.supplierSku,
  }));
  // Sold work still to load reserves the shelf; open work is the forecast.
  const sold = list.filter((p) => p.status === "ACCEPTED" && !p.loaded);
  const open = list.filter((p) => OPEN.includes(p.status));
  const rows = stockRows(stock, sold, open);
  const untracked = untrackedLines(stock, [...sold, ...open].flatMap((p) => p.lines));
  return {
    trade,
    orders,
    proposals: list,
    rows,
    suppliers: suppliers.map((s) => ({ id: s.id, name: s.name, email: s.email, phone: s.phone, website: s.website, itemCount: s._count.items })),
    untracked,
    pipeline: {
      open: open.length,
      openTotal: open.reduce((a, p) => a + p.total, 0),
      sold: sold.length,
      soldTotal: sold.reduce((a, p) => a + p.total, 0),
      low: rows.filter((r) => r.low).length,
      short: rows.filter((r) => r.short > 0).length,
    },
  };
}

/** How many items are low per trade — the sidebar's badge on each board. */
export async function lowStockCounts(organizationId: string): Promise<Record<TradeId, number>> {
  const out: Record<TradeId, number> = { fence: 0, roof: 0, hvac: 0 };
  const items = await db.inventoryItem.findMany({ where: { organizationId }, select: { id: true, trade: true, key: true, name: true, unit: true, onHand: true, reorderPoint: true, supplierId: true } });
  if (!items.length) return out;
  const proposals = await db.proposal.findMany({
    where: { organizationId, trade: { in: ["fence", "roof", "hvac"] }, status: { in: [...OPEN, "ACCEPTED"] } },
    select: { trade: true, status: true, jobs: { select: { materialsLoadedAt: true }, take: 1, orderBy: { createdAt: "desc" } }, lineItems: { where: { materialCost: { gt: 0 } }, select: { name: true, quantity: true } } },
  });
  for (const trade of ["fence", "roof", "hvac"] as const) {
    const stock = items.filter((i) => i.trade === trade);
    if (!stock.length) continue;
    const ofTrade = proposals.filter((p) => p.trade === trade);
    const sold = ofTrade.filter((p) => p.status === "ACCEPTED" && !p.jobs[0]?.materialsLoadedAt).map((p) => ({ lines: p.lineItems }));
    const open = ofTrade.filter((p) => OPEN.includes(p.status)).map((p) => ({ lines: p.lineItems }));
    out[trade] = stockRows(stock, sold, open).filter((r) => r.low).length;
  }
  return out;
}
