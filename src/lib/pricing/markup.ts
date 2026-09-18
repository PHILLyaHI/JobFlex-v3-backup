// Hidden profit markup. Turns a line's RAW cost (material + labor) into a
// client-facing SELL price by applying separate material/labor markup %s. The
// markup is never shown to the client as its own line — only the resulting sell
// price. At 0% the sell price equals the cost EXACTLY, so existing proposals are
// unaffected (backward-compatible).
//
// Pure functions — no DB, no side effects.
//
// Examples:
//   applyMarkup({ materialCost: 100, laborCost: 50, materialMarkupPct: 20, laborMarkupPct: 10 })
//     // → { materialSell: 120, laborSell: 55, subtotalSell: 175 }
//   applyMarkup({ materialCost: 100, laborCost: 50, materialMarkupPct: 0, laborMarkupPct: 0 })
//     // → { materialSell: 100, laborSell: 50, subtotalSell: 150 }   (0% = unchanged)

export interface MarkupRates {
  materialMarkupPct: number;
  laborMarkupPct: number;
}

export interface MarkupResult {
  materialSell: number;
  laborSell: number;
  subtotalSell: number;
}

/** Cost → sell price. materialSell = material×(1+m%), laborSell = labor×(1+l%). */
export function applyMarkup(input: {
  materialCost: number;
  laborCost: number;
  materialMarkupPct: number;
  laborMarkupPct: number;
}): MarkupResult {
  const materialSell = input.materialCost * (1 + input.materialMarkupPct / 100);
  const laborSell = input.laborCost * (1 + input.laborMarkupPct / 100);
  return { materialSell, laborSell, subtotalSell: materialSell + laborSell };
}

/**
 * The client-facing SELL unit price for one line = its cost (material + labor)
 * marked up. If the line has NO material/labor split (both 0) we keep its raw
 * unitPrice untouched — we can't attribute markup, and this keeps unsplit lines
 * (and every line at 0% markup) byte-for-byte identical to today.
 */
export function sellUnitPrice(
  line: { unitPrice: number; materialCost?: number | null; laborCost?: number | null },
  rates: MarkupRates,
): number {
  const materialCost = line.materialCost ?? 0;
  const laborCost = line.laborCost ?? 0;
  if (materialCost + laborCost <= 0) return line.unitPrice;
  return applyMarkup({ materialCost, laborCost, ...rates }).subtotalSell;
}

/**
 * "Per-proposal override, else org default, else 0" — resolved in ONE place so
 * every caller agrees. Used both at seed time (pass proposal=null → get the org
 * default) and at apply time (the proposal carries the effective seeded rate).
 */
export function resolveMarkupRates(
  proposal:
    | { materialMarkupPct?: number | null; laborMarkupPct?: number | null }
    | null
    | undefined,
  organization:
    | { materialMarkupPct?: number | null; laborMarkupPct?: number | null }
    | null
    | undefined,
): MarkupRates {
  return {
    materialMarkupPct: proposal?.materialMarkupPct ?? organization?.materialMarkupPct ?? 0,
    laborMarkupPct: proposal?.laborMarkupPct ?? organization?.laborMarkupPct ?? 0,
  };
}

/** Two-decimal round that does not drift on .005 the way toFixed does. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Overhead and profit as ONE multiplier on every sell price. Overhead is a
 * share of the subtotal, profit a share of subtotal + overhead; the two
 * amounts are rounded to cents the way a ledger prints them, so the factor
 * reproduces the ledger's chain exactly and the printed column sums to the
 * ledger's pre-tax figure. The client is quoted a price, never shown a margin:
 * the manual builder's sheet, the saved line items, the portal and the PDF all
 * carry this inside the unit price (owner, 2026-09-17: what the client sees
 * must be the same number everywhere).
 */
export function overheadProfitLoad(subtotal: number, overheadPct: number, profitPct: number): number {
  const sub = Number.isFinite(subtotal) ? subtotal : 0;
  if (sub <= 0) return 1;
  const oh = Number.isFinite(overheadPct) ? overheadPct : 0;
  const pr = Number.isFinite(profitPct) ? profitPct : 0;
  const overhead = round2(sub * (oh / 100));
  const withOverhead = round2(sub + overhead);
  const profit = round2(withOverhead * (pr / 100));
  return round2(withOverhead + profit) / sub;
}

export interface ClientPricing {
  materialMarkupPct?: number | null;
  laborMarkupPct?: number | null;
  overheadPct?: number | null;
  profitPct?: number | null;
}

/**
 * The lines as they are stored and shown to the client: `unitPrice` is the
 * sell price per unit with markup, overhead and profit inside it, quoted in
 * cents; `total` is quantity × that price, so the client's own arithmetic
 * checks out row by row and the column adds up to the subtotal. The same
 * chain the manual builder's sheet prints, so the builder, the portal and the
 * PDF quote one number. At 0% everywhere a line keeps its raw unit price.
 */
export function priceLinesForClient<T extends { quantity: number; unitPrice: number; materialCost?: number | null; laborCost?: number | null }>(
  lines: T[],
  pricing: ClientPricing,
): (T & { unitPrice: number; total: number })[] {
  const rates = { materialMarkupPct: pricing.materialMarkupPct ?? 0, laborMarkupPct: pricing.laborMarkupPct ?? 0 };
  const marked = lines.map((l) => round2(sellUnitPrice(l, rates)));
  const subtotalCosts = round2(lines.reduce((a, l, i) => a + round2(l.quantity * marked[i]), 0));
  const load = overheadProfitLoad(subtotalCosts, pricing.overheadPct ?? 0, pricing.profitPct ?? 0);
  return lines.map((l, i) => {
    const unitPrice = round2(marked[i] * load);
    return { ...l, unitPrice, total: round2(l.quantity * unitPrice) };
  });
}

/**
 * The client-facing material and labor halves of a STORED line — what "Labor +
 * material breakdown" prints on the portal and the PDF. `total` already carries
 * the markup and the overhead/profit load; the halves take the raw split's
 * marked-up ratio of it, labor as the remainder, so they add up to the total to
 * the cent. A line with no split (both raw costs zero) has no halves.
 */
export function clientSplit(
  line: { total: number; quantity?: number | null; materialCost?: number | null; laborCost?: number | null },
  rates: MarkupRates,
  /** `marginOnLabor`: overhead and profit sit in the labor half; the material half reads at its marked-up cost. */
  where: { marginOnLabor?: boolean | null } = {},
): { materialAmount: number; laborAmount: number } | null {
  const material = (line.materialCost ?? 0) * (1 + rates.materialMarkupPct / 100);
  const labor = (line.laborCost ?? 0) * (1 + rates.laborMarkupPct / 100);
  const both = material + labor;
  if (both <= 0 || !Number.isFinite(both)) return null;
  const total = Number.isFinite(line.total) ? line.total : 0;
  const qty = line.quantity ?? 0;
  const materialAmount =
    where.marginOnLabor && labor > 0 && qty > 0
      ? Math.min(total, round2(qty * material))
      : Math.min(total, round2(total * (material / both)));
  return { materialAmount, laborAmount: round2(total - materialAmount) };
}

/** "Materials $472.00 · Labor $472.00" — or the one side a line has. */
export function splitCaption(split: { materialAmount: number; laborAmount: number } | null, fmt: (n: number) => string): string | null {
  if (!split) return null;
  const parts = [split.materialAmount > 0 ? `Materials ${fmt(split.materialAmount)}` : "", split.laborAmount > 0 ? `Labor ${fmt(split.laborAmount)}` : ""].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
