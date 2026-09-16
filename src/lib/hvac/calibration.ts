// The twenty-real-jobs gate, as arithmetic: what the engine sized and priced
// against what the shop actually quoted or installed, over the saved
// estimates that carry an actual. No global accuracy claim — a count, the
// tonnage hit rate and the price error, dated by the rows behind them.

export interface CalibrationRow {
  sizedTons?: number | null;
  subtotal: number;
  actualTons?: number | null;
  actualPrice?: number | null;
}

export interface CalibrationStats {
  /** Rows with at least one actual. */
  n: number;
  tonsN: number;
  /** Share of rows where the engine's size is within half a ton of the actual. */
  tonsWithinHalf: number;
  /** Mean absolute tonnage error. */
  tonsMae: number;
  priceN: number;
  /** Mean absolute percentage error of the ledger subtotal vs the actual price. */
  priceMape: number;
  /** Signed mean error: positive = the ledger runs high. */
  priceBiasPct: number;
}

export function calibrationStats(rows: CalibrationRow[]): CalibrationStats {
  const withActual = rows.filter((r) => (r.actualTons ?? null) !== null || (r.actualPrice ?? null) !== null);
  const tons = withActual.filter((r) => r.sizedTons && r.actualTons);
  const price = withActual.filter((r) => r.subtotal > 0 && r.actualPrice && r.actualPrice > 0);
  const tonsErr = tons.map((r) => Math.abs((r.sizedTons as number) - (r.actualTons as number)));
  const pricePct = price.map((r) => ((r.subtotal - (r.actualPrice as number)) / (r.actualPrice as number)) * 100);
  const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  return {
    n: withActual.length,
    tonsN: tons.length,
    tonsWithinHalf: tons.length ? tonsErr.filter((e) => e <= 0.5).length / tons.length : 0,
    tonsMae: Math.round(mean(tonsErr) * 100) / 100,
    priceN: price.length,
    priceMape: Math.round(mean(pricePct.map(Math.abs)) * 10) / 10,
    priceBiasPct: Math.round(mean(pricePct) * 10) / 10,
  };
}

/** One line for the Recent card's head. */
export function calibrationLine(s: CalibrationStats): string {
  if (!s.n) return "No actuals recorded yet — record what you quoted on a few jobs and the fit shows here.";
  const parts = [`${s.n} job${s.n === 1 ? "" : "s"} with actuals`];
  if (s.tonsN) parts.push(`size within ½ ton on ${Math.round(s.tonsWithinHalf * 100)}% (${s.tonsN})`);
  if (s.priceN) parts.push(`price off by ${s.priceMape}% on average, running ${s.priceBiasPct >= 0 ? "high" : "low"} ${Math.abs(s.priceBiasPct)}% (${s.priceN})`);
  return parts.join(" · ") + (s.n < 20 ? ` · ${20 - s.n} more to the twenty-job gate` : " · twenty-job gate met");
}
