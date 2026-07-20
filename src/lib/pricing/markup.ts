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
