// THE TRADE BOARD'S READ (2026-09-20) — server only, one query set per trade.
//
// The fence, roof and HVAC boards show the same three things for their own
// trade: the proposals that belong to it, the warehouse stock with the work
// counted against it (lib/inventory), and the suppliers. Nothing here is a
// "use server" action: the pages call it with a trusted organizationId.

// Every proposal that belongs to the trade (2026-09-20, later that day): the
// owner wants each estimator's proposals on its board whether or not they
// were made after Proposal.trade existed. An unstamped proposal is read by
// lib/inventoryTrade — its estimator record, its materials, its title — and
// every status but ARCHIVED is listed; only sold-and-not-loaded work reserves
// the shelf and only open work forecasts it, as before.

import { db } from "@/lib/db";
import { isTradeId, stockKey, stockRows, untrackedLines, type StockItem, type StockLine, type StockRow, type TradeId } from "@/lib/inventory";
import { presetItems } from "@/lib/inventoryPresets";
import { explodeLines } from "@/lib/inventoryBom";
import { proposalTrade } from "@/lib/inventoryTrade";
import { inventoryLinkOf } from "@/lib/inventoryPick";

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
  jobStartsAt: string | null;
  /** Recognized by its estimator record, its materials or its title — it carries no trade stamp. */
  inferred: boolean;
  /** Draws on the warehouse. False = an estimate only: listed, never reserved or forecast. */
  linked: boolean;
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
  /** The estimator's standard items not on the shelf list yet, and how many there are in all. */
  presets: { missing: number; total: number };
  pipeline: { open: number; openTotal: number; sold: number; soldTotal: number; low: number; short: number };
};

const OPEN = ["DRAFT", "SENT", "VIEWED"];
const ALL_TRADES: readonly TradeId[] = ["fence", "roof", "hvac"];

/**
 * The organization's proposals that belong to the wanted trades, each with
 * the trade it belongs to. Stamped proposals are taken as stamped; unstamped
 * ones are read by lib/inventoryTrade, with the HVAC estimates and roof
 * measurement photos that point at them fetched as evidence.
 */
async function tradeProposals(organizationId: string, wanted: readonly TradeId[]) {
  const rows = await db.proposal.findMany({
    where: { organizationId, status: { not: "ARCHIVED" }, OR: [{ trade: { in: [...wanted] } }, { trade: null }] },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      title: true,
      description: true,
      trade: true,
      status: true,
      total: true,
      createdAt: true,
      client: { select: { name: true } },
      jobs: { select: { id: true, materialsLoadedAt: true, status: true, startsAt: true }, take: 1, orderBy: { createdAt: "desc" } },
      lineItems: { where: { materialCost: { gt: 0 } }, select: { name: true, quantity: true, measurementType: true } },
    },
  });
  const unstamped = rows.filter((r) => !r.trade).map((r) => r.id);
  const none: Array<{ proposalId: string | null }> = [];
  const [hvacLinks, roofLinks] = unstamped.length
    ? await Promise.all([
        wanted.includes("hvac") ? db.hvacEstimate.findMany({ where: { organizationId, proposalId: { in: unstamped } }, select: { proposalId: true } }) : Promise.resolve(none),
        wanted.includes("roof") ? db.proposalSitePhoto.findMany({ where: { proposalId: { in: unstamped } }, select: { proposalId: true } }) : Promise.resolve(none),
      ])
    : [none, none];
  const hvac = new Set(hvacLinks.map((h) => h.proposalId));
  const roof = new Set(roofLinks.map((r) => r.proposalId));
  // The connect-or-not choice, an event per proposal; absent = connected.
  const links = await inventoryLinkOf(organizationId, rows.map((r) => r.id));
  const out: Array<{ row: (typeof rows)[number]; trade: TradeId; inferred: boolean; linked: boolean }> = [];
  for (const r of rows) {
    const t = proposalTrade({
      trade: r.trade,
      title: r.title,
      description: r.description,
      lines: r.lineItems.map((l) => ({ name: l.name, quantity: l.quantity, unit: l.measurementType })),
      hvacEstimate: hvac.has(r.id),
      roofMeasurement: roof.has(r.id),
    });
    if (t && wanted.includes(t)) out.push({ row: r, trade: t, inferred: !r.trade, linked: links.get(r.id) !== false });
  }
  return out;
}

export async function loadTradeBoard(organizationId: string, trade: string): Promise<TradeBoardData | null> {
  if (!isTradeId(trade)) return null;
  const [proposals, items, suppliers, sent] = await Promise.all([
    tradeProposals(organizationId, [trade]),
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
  const list: BoardProposal[] = proposals.map(({ row: p, inferred, linked }) => ({
    id: p.id,
    title: p.title,
    client: p.client?.name ?? null,
    status: p.status,
    total: p.total,
    createdAt: p.createdAt.toISOString(),
    jobId: p.jobs[0]?.id ?? null,
    loaded: !!p.jobs[0]?.materialsLoadedAt,
    jobStartsAt: p.jobs[0]?.startsAt ? p.jobs[0].startsAt.toISOString() : null,
    inferred,
    linked,
    // A fence package line becomes the posts, rails and pickets it was priced from.
    lines: explodeLines(trade, p.lineItems.map((l) => ({ name: l.name, quantity: l.quantity, unit: l.measurementType }))),
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
  // Only work that draws on the warehouse reserves or forecasts the shelf.
  const sold = list.filter((p) => p.linked && p.status === "ACCEPTED" && !p.loaded);
  const open = list.filter((p) => p.linked && OPEN.includes(p.status));
  const rows = stockRows(stock, sold, open);
  const untracked = untrackedLines(stock, [...sold, ...open].flatMap((p) => p.lines));
  const have = new Set(stock.map((i) => i.key));
  const standard = presetItems(trade);
  const presets = { missing: standard.filter((p) => !have.has(stockKey(p.name))).length, total: standard.length };
  return {
    trade,
    orders,
    proposals: list,
    rows,
    suppliers: suppliers.map((s) => ({ id: s.id, name: s.name, email: s.email, phone: s.phone, website: s.website, itemCount: s._count.items })),
    untracked,
    presets,
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
  const proposals = await tradeProposals(organizationId, ALL_TRADES);
  for (const trade of ALL_TRADES) {
    const stock = items.filter((i) => i.trade === trade);
    if (!stock.length) continue;
    const ofTrade = proposals.filter((p) => p.trade === trade && p.linked).map((p) => p.row);
    const sold = ofTrade.filter((p) => p.status === "ACCEPTED" && !p.jobs[0]?.materialsLoadedAt).map((p) => ({ lines: explodeLines(trade, p.lineItems) }));
    const open = ofTrade.filter((p) => OPEN.includes(p.status)).map((p) => ({ lines: explodeLines(trade, p.lineItems) }));
    out[trade] = stockRows(stock, sold, open).filter((r) => r.low).length;
  }
  return out;
}
