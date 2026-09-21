// Warehouse stock against the work that will use it (2026-09-20).
//
// Owner: the fence, roof and HVAC companies keep their own stock; the
// proposals should draw on it, warn before it runs short, and the crew
// should get a list of what to take. Pure arithmetic — no database, no
// server imports — so the trade boards, the job page and the QA agree.
//
//   on hand     what the warehouse holds (the movements, summed).
//   reserved    what SOLD jobs still need and have not loaded yet.
//   available   on hand − reserved: what a new sale could have.
//   forecast    what the OPEN proposals would take if every one sold.
//   short       forecast − available, when positive: order this much before
//               those proposals sell.
//   low         available under the reorder point — the point the office
//               set, else the biggest single job on the books, so the
//               warehouse always covers the next truck.

export type TradeId = "fence" | "roof" | "hvac";

export const TRADES: Array<{ id: TradeId; label: string; noun: string }> = [
  { id: "fence", label: "Fence", noun: "fence" },
  { id: "roof", label: "Roofing", noun: "roof" },
  { id: "hvac", label: "HVAC", noun: "HVAC" },
];

export function isTradeId(x: string | null | undefined): x is TradeId {
  return x === "fence" || x === "roof" || x === "hvac";
}

/** A proposal's material line as the stock reads it. */
export type StockLine = { name: string; quantity: number; unit?: string | null };

export type StockItem = {
  id: string;
  name: string;
  key: string;
  unit: string;
  onHand: number;
  reorderPoint: number | null;
  supplierId: string | null;
  supplierName?: string | null;
  supplierSku?: string | null;
};

/**
 * The name a line or an item is matched by: lower case, the size and
 * marketing noise dropped, spaces collapsed. "Starter strip · eaves + rakes"
 * and "starter strip (eaves & rakes)" are one item.
 */
export function stockKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[·•|/\\()[\]{}"'"”“’]+/g, " ")
    .replace(/\b(?:and|&|plus|with|the|a|an|of|for|per|new|matched|premium|standard|grade)\b/g, " ")
    .replace(/[^a-z0-9. ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type StockRow = StockItem & {
  reserved: number;
  available: number;
  forecast: number;
  short: number;
  /** The reorder point in force: the set one, else the biggest single job. */
  threshold: number;
  low: boolean;
  /** What to order now: enough for the reserved and forecast work plus the threshold. */
  suggestedOrder: number;
};

type Demand = { lines: readonly StockLine[] };

const r2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const ceil = (n: number) => Math.ceil(Math.max(0, n) - 1e-9);

function needByKey(jobs: readonly Demand[]): { total: Map<string, number>; biggest: Map<string, number> } {
  const total = new Map<string, number>();
  const biggest = new Map<string, number>();
  for (const j of jobs) {
    const perJob = new Map<string, number>();
    for (const l of j.lines) {
      const k = stockKey(l.name);
      if (!k || !(l.quantity > 0)) continue;
      perJob.set(k, (perJob.get(k) ?? 0) + l.quantity);
    }
    for (const [k, q] of perJob) {
      total.set(k, (total.get(k) ?? 0) + q);
      biggest.set(k, Math.max(biggest.get(k) ?? 0, q));
    }
  }
  return { total, biggest };
}

/**
 * Every item with the work counted against it.
 *   sold: the proposals accepted whose jobs have not loaded their materials.
 *   open: the proposals still out (draft, sent, viewed).
 */
export function stockRows(items: readonly StockItem[], sold: readonly Demand[], open: readonly Demand[]): StockRow[] {
  const s = needByKey(sold);
  const o = needByKey(open);
  return items.map((it) => {
    const reserved = r2(s.total.get(it.key) ?? 0);
    const forecast = r2(o.total.get(it.key) ?? 0);
    const available = r2(it.onHand - reserved);
    const threshold = it.reorderPoint ?? Math.max(s.biggest.get(it.key) ?? 0, o.biggest.get(it.key) ?? 0);
    const short = r2(Math.max(0, forecast - available));
    const low = available < threshold || available < 0;
    // Only an item that is low or short gets an order suggested: enough to
    // cover the sold and open work and still leave the threshold on the shelf.
    const suggestedOrder = low || short > 0 ? ceil(Math.max(0, reserved + forecast + threshold - it.onHand)) : 0;
    return { ...it, reserved, available, forecast, short, threshold: r2(threshold), low, suggestedOrder };
  });
}

/** The lines of a proposal the warehouse does not know: worth adding as items. */
export function untrackedLines(items: readonly StockItem[], lines: readonly StockLine[]): StockLine[] {
  const known = new Set(items.map((i) => i.key));
  const seen = new Set<string>();
  const out: StockLine[] = [];
  for (const l of lines) {
    const k = stockKey(l.name);
    if (!k || known.has(k) || seen.has(k) || !(l.quantity > 0)) continue;
    seen.add(k);
    out.push(l);
  }
  return out;
}

export type PickRow = { name: string; unit: string; quantity: number; itemId: string | null; onHand: number | null; enough: boolean };

/**
 * What the crew takes from the warehouse for one job: every material line,
 * whole units, and whether the shelf has it. A line the warehouse does not
 * track still goes on the list — the crew still has to bring it.
 */
export function pickList(items: readonly StockItem[], lines: readonly StockLine[]): PickRow[] {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const merged = new Map<string, PickRow>();
  for (const l of lines) {
    const k = stockKey(l.name);
    if (!k || !(l.quantity > 0)) continue;
    const it = byKey.get(k);
    const prev = merged.get(k);
    const quantity = ceil((prev?.quantity ?? 0) + l.quantity);
    merged.set(k, {
      name: it?.name ?? l.name,
      unit: it?.unit ?? l.unit ?? "each",
      quantity,
      itemId: it?.id ?? null,
      onHand: it ? r2(it.onHand) : null,
      enough: it ? it.onHand >= quantity : false,
    });
  }
  return [...merged.values()];
}

export type PoLine = { name: string; sku: string | null; unit: string; quantity: number };

/** The purchase order's text — one supplier, the items short at that supplier. */
export function purchaseOrderText(input: { company: string; supplier: string; trade: string; lines: readonly PoLine[]; note?: string }): { subject: string; html: string } {
  const rows = input.lines
    .map((l) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${esc(l.name)}${l.sku ? ` <span style="color:#666">(${esc(l.sku)})</span>` : ""}</td><td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;text-align:right">${l.quantity} ${esc(l.unit)}</td></tr>`)
    .join("");
  return {
    subject: `Purchase order — ${input.company} — ${input.trade} materials`,
    html: `<p>Hello ${esc(input.supplier)},</p><p>Please supply the following for ${esc(input.company)}:</p><table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">${rows}</table>${input.note ? `<p>${esc(input.note)}</p>` : ""}<p>Please confirm price and delivery by reply.</p><p>Thank you,<br>${esc(input.company)}</p>`,
  };
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}
