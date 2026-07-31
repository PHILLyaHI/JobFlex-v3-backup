// Estimate arithmetic, kept pure and out of the component so the order of
// operations is auditable in one screen — and so the handheld builder computes
// the identical number from the identical code rather than a second copy that
// drifts.
//
// The order matters and is the contractor-standard one:
//   subtotal -> + markup -> + contingency -> tax applied to that running total.
// Tax sits on top of markup, not under it: markup is revenue, and revenue is
// taxable. Putting tax under markup understates the price on every sheet.

import type { Row, Section, Rates, Totals } from "./manual-builder-types";

/** Two-decimal round that does not drift on .005 the way toFixed does. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function rowTotal(row: Row): number {
  // A half-typed number field reads as NaN; treat it as zero rather than
  // poisoning every total above it while the user is mid-keystroke.
  const qty = Number.isFinite(row.qty) ? row.qty : 0;
  const cost = Number.isFinite(row.cost) ? row.cost : 0;
  return round2(qty * cost);
}

export function computeTotals(sections: Section[], rates: Rates): Totals {
  const perSection = sections.map((s) => ({
    id: s.id,
    name: s.name,
    subtotal: round2(s.rows.reduce((sum, r) => sum + rowTotal(r), 0)),
  }));

  const subtotal = round2(perSection.reduce((sum, s) => sum + s.subtotal, 0));
  const markup = round2(subtotal * (pct(rates.markupPct) / 100));
  const contingency = round2(subtotal * (pct(rates.contingencyPct) / 100));
  const taxable = round2(subtotal + markup + contingency);
  const tax = round2(taxable * (pct(rates.taxPct) / 100));
  const grand = round2(taxable + tax);

  return { perSection, subtotal, markup, contingency, tax, grand };
}

/** Same NaN guard as rowTotal, for the three rate fields. */
function pct(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/** US-format money for display. Pairs with `font-variant-numeric: tabular-nums`. */
export function money(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Row and section keys have to survive a reorder and an insert-the-same-
// template-twice, so they cannot be array indices. A module-scoped counter is
// enough: these ids never leave the client and never reach a database.
let seq = 0;
export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}
