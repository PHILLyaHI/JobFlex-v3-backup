// PROOF CARD — the arithmetic, kept pure and out of the components
// (route: /dashboard/manual-proof).
//
// One reason above all others: on this page EVERY card prints a money
// statement in its own footer, the derivation bar prints the chain, and the
// client's copy prints the same figures again. If any two of them computed
// their own number they would eventually disagree — and the whole design bet is
// that the footers add up. They all call in here instead, so there is exactly
// one number.
//
// ORDER OF OPERATIONS (the live builder's, so the lab and the product agree)
//   scope       : a labor-only quote drops the pure-material lines first
//   base        = Σ qty × (material + labor)             ← card 02 contributes
//   materials   = base materials × (1 + material markup)
//   labor       = base labor     × (1 + labor markup)
//   subtotal    = materials + labor
//   overhead    = subtotal × overhead%
//   profit      = (subtotal + overhead) × profit%
//   sellSubtotal= subtotal + overhead + profit            ← card 03 contributes
//                                                            (uplift = sell − base)
//   tax         = sellSubtotal × tax%                     ← card 04 contributes
//   total       = sellSubtotal + tax                      ← the last footer
//
// This matches EstimateBreakdown.tsx line for line (baseMaterials → grandTotal)
// and lib/pricing/markup's sellUnitPrice, so a design that reads convincing
// here would still read convincing wired to the real store.
//
// A useful identity, and the reason the printed line totals and the ledger can
// never drift apart: overhead and profit are uniform multipliers over the whole
// subtotal, so spreading them per line —
//     sellUnit = (mat×(1+a) + lab×(1+b)) × (1+oh) × (1+pf)
// — sums back to exactly `sellSubtotal`. The client's copy therefore prints
// line totals that add up to the subtotal it prints underneath them.

import type {
  Installment,
  LineItem,
  Markups,
  ProofDraft,
  Totals,
  Unit,
} from "./manual-proof-types";

/** Two-decimal round that does not drift on .005 the way toFixed does. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** A half-typed number field reads as NaN. Treat it as zero rather than
 *  poisoning every figure above it while the user is mid-keystroke. */
function safe(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/** The uniform multiplier overhead and profit apply to the whole sell side. */
function allowanceFactor(m: Markups): number {
  return (1 + safe(m.overheadPct) / 100) * (1 + safe(m.profitPct) / 100);
}

/** Base cost of one unit — the `$` figure the row shows. */
export function baseUnit(line: LineItem): number {
  return round2(safe(line.materialCost) + safe(line.laborCost));
}

/** What this line costs you, before any markup. Card 02's per-row figure. */
export function lineBase(line: LineItem): number {
  return round2(safe(line.quantity) * (safe(line.materialCost) + safe(line.laborCost)));
}

/** The client-facing price of one unit: both markups on their own halves, then
 *  the overhead + profit allowance. Equals the base unit at 0/0/0/0. */
export function sellUnit(line: LineItem, m: Markups): number {
  const material = safe(line.materialCost) * (1 + safe(m.materialMarkupPct) / 100);
  const labor = safe(line.laborCost) * (1 + safe(m.laborMarkupPct) / 100);
  return (material + labor) * allowanceFactor(m);
}

/** What this line adds to the client's subtotal. */
export function lineSell(line: LineItem, m: Markups): number {
  return round2(safe(line.quantity) * sellUnit(line, m));
}

/**
 * The SELL-side split of one unit — material and labor with their markups and
 * the overhead/profit allowance already folded in.
 *
 * This, and never the raw split, is what may be printed on the client's copy.
 * The raw figures are what the job COSTS the contractor; putting them in front
 * of a homeowner hands over the margin, which is the exact thing "keep the
 * material / labor split internal" exists to prevent. The two halves sum to
 * `sellUnit`, so the annotation still reconciles with the row it sits under.
 */
export function sellSplit(line: LineItem, m: Markups): { material: number; labor: number } {
  const factor = allowanceFactor(m);
  return {
    material: round2(safe(line.materialCost) * (1 + safe(m.materialMarkupPct) / 100) * factor),
    labor: round2(safe(line.laborCost) * (1 + safe(m.laborMarkupPct) / 100) * factor),
  };
}

/**
 * A pure-material line: it buys something and nobody swings a hammer for it
 * (a dumpster, a permit, delivered stock). These are the rows a labor-only
 * quote drops — see the note on ProposalOptions.
 */
export function isMaterialOnly(line: LineItem): boolean {
  return safe(line.laborCost) <= 0 && safe(line.materialCost) > 0;
}

/** A row the contractor started and has not filled in. Card 02's footer counts
 *  these out loud so an unnamed line is a visible state, not a silent one. */
export function isUnnamed(line: LineItem): boolean {
  return line.name.trim().length === 0;
}

/** A row that carries neither a name nor money. It never prints. */
export function isBlank(line: LineItem): boolean {
  return isUnnamed(line) && lineBase(line) === 0;
}

/** Every figure the page prints, from the whole draft, in one pass. */
export function computeTotals(draft: ProofDraft): Totals {
  const m = draft.markups;

  // SCOPE FIRST. Labor-only is not a print filter — it takes the material-only
  // rows out of the quote, so it has to run before a single dollar is added up.
  const laborOnly = draft.options.laborOnly;
  const pricedLines = draft.lines.filter((l) => !(laborOnly && isMaterialOnly(l)));
  const suppressedLines = laborOnly ? draft.lines.filter(isMaterialOnly) : [];

  // ROUNDED AT EVERY STEP, AND THE NEXT STEP READS THE ROUNDED FIGURE.
  //
  // This is not fussiness — it is the page's whole contract. Every one of these
  // numbers is PRINTED, in a proof footer, in the ledger and on the client's
  // copy, and the reader is invited to add them up. Carrying full precision
  // internally and rounding only for display would put a page on screen whose
  // own footers are a cent out of each other: base 12,400.20 + uplift 1,802.44
  // + tax 1,171.72 showing a total of 15,374.35. Rounding forward, the way a
  // human doing this on paper would, makes every printed line literally add up.
  let rawMaterials = 0;
  let rawLabor = 0;
  for (const line of pricedLines) {
    rawMaterials += safe(line.quantity) * safe(line.materialCost);
    rawLabor += safe(line.quantity) * safe(line.laborCost);
  }

  const baseMaterials = round2(rawMaterials);
  const baseLabor = round2(rawLabor);
  const base = round2(baseMaterials + baseLabor);

  const materialsAfter = round2(baseMaterials * (1 + safe(m.materialMarkupPct) / 100));
  const laborAfter = round2(baseLabor * (1 + safe(m.laborMarkupPct) / 100));
  const materialsMarkup = round2(materialsAfter - baseMaterials);
  const laborMarkup = round2(laborAfter - baseLabor);

  const subtotalCosts = round2(materialsAfter + laborAfter);
  const overhead = round2(subtotalCosts * (safe(m.overheadPct) / 100));
  const profit = round2((subtotalCosts + overhead) * (safe(m.profitPct) / 100));
  const sellSubtotal = round2(subtotalCosts + overhead + profit);

  // Tax on the STATED subtotal, which is what an invoice charges and what the
  // client can check with the number printed above it.
  const tax = round2(sellSubtotal * (safe(draft.taxPct) / 100));
  const total = round2(sellSubtotal + tax);

  const suppressedBase = round2(suppressedLines.reduce((sum, l) => sum + lineBase(l), 0));

  return {
    pricedLines,
    suppressedLines,
    suppressedBase,

    baseMaterials,
    baseLabor,
    base,

    materialsAfter,
    laborAfter,
    materialsMarkup,
    laborMarkup,
    subtotalCosts,
    overhead,
    profit,
    sellSubtotal,
    uplift: round2(sellSubtotal - base),
    margin: sellSubtotal > 0 ? round2(((sellSubtotal - base) / sellSubtotal) * 100) : 0,

    tax,
    total,
  };
}

/**
 * The amounts actually PRINTED against each line on the client's copy, keyed by
 * line id — guaranteed to sum to `sellSubtotal` exactly.
 *
 * Rounding each line to the cent independently leaves a residual of a cent or
 * two against the subtotal whenever overhead or profit is on, and on the
 * client's copy that residual is visible: a homeowner adding four line totals
 * gets a different number from the Subtotal printed directly beneath them. On a
 * page whose entire argument is that the figures add up, that is the one defect
 * that cannot ship.
 *
 * So the residual is allocated, the way an invoicing system allocates it: onto
 * the LARGEST line, where a cent is invisible, rather than onto the smallest,
 * where it would be conspicuous. The horizontal check (qty × unit = total) is
 * still approximate for fractional unit rates — that is inherent to printing a
 * $4.2497 rate as $4.25, and every real invoice has it. The vertical check is
 * the one people actually run, and it is exact.
 */
export function printedTotals(
  lines: LineItem[],
  m: Markups,
  sellSubtotal: number,
): Map<string, number> {
  const rounded = lines.map((l) => ({ id: l.id, value: lineSell(l, m) }));
  const out = new Map(rounded.map((r) => [r.id, r.value]));
  if (rounded.length === 0) return out;

  const sum = round2(rounded.reduce((s, r) => s + r.value, 0));
  const residual = round2(sellSubtotal - sum);
  if (residual === 0) return out;

  const biggest = rounded.reduce((a, b) => (b.value > a.value ? b : a));
  out.set(biggest.id, round2(biggest.value + residual));
  return out;
}

/**
 * Editing the row's `$` figure directly. The split is what the estimate card
 * marks up, so a new unit price is spread across material and labor in the
 * SAME ratio the line already had — the contractor's intent ("this line costs
 * $4, not $3.12") is honoured without silently destroying the split. A line
 * with no split yet is treated as all material, which is what an unpriced row
 * on a supply-heavy job usually turns out to be.
 */
export function rescaleUnitPrice(line: LineItem, nextUnit: number): LineItem {
  const target = Math.max(0, safe(nextUnit));
  const current = safe(line.materialCost) + safe(line.laborCost);
  if (current <= 0) {
    return { ...line, unitPrice: target, materialCost: target, laborCost: 0 };
  }
  const share = target / current;
  return {
    ...line,
    unitPrice: target,
    materialCost: round2(safe(line.materialCost) * share),
    laborCost: round2(safe(line.laborCost) * share),
  };
}

/** Editing either half. The `$` figure follows, so the row's two ways in can
 *  never show different money. */
export function withSplit(
  line: LineItem,
  patch: { materialCost?: number; laborCost?: number },
): LineItem {
  const materialCost = round2(Math.max(0, safe(patch.materialCost ?? line.materialCost)));
  const laborCost = round2(Math.max(0, safe(patch.laborCost ?? line.laborCost)));
  return { ...line, materialCost, laborCost, unitPrice: round2(materialCost + laborCost) };
}

/** The material half of a line's base cost, 0–100. The per-row ratio readout.
 *  An unpriced line has no ratio; the readout says so rather than printing a
 *  made-up 50/50. */
export function materialShare(line: LineItem): number | null {
  const total = safe(line.materialCost) + safe(line.laborCost);
  if (total <= 0) return null;
  return round2((safe(line.materialCost) / total) * 100);
}

/** An installment in dollars. A percent installment means nothing until a
 *  total exists, which is why the row only prints this once one does. */
export function installmentValue(inst: Installment, total: number): number {
  return round2(inst.isPercent ? (total * safe(inst.amount)) / 100 : safe(inst.amount));
}

/** How much of the total the schedule accounts for, in dollars. */
export function coveredAmount(installments: Installment[], total: number): number {
  return round2(installments.reduce((sum, i) => sum + installmentValue(i, total), 0));
}

/**
 * How far a schedule may miss the total and still count as landing on it.
 *
 * Each installment is rounded to the cent, so a schedule of n of them can drift
 * by up to half a cent each purely from rounding. Anything tighter reports a
 * "shortfall" of $0.01 on a perfectly good 30/30/40 split — a false alarm on
 * the one readout whose job is to be believed. Anything a contractor would call
 * a real mismatch is orders of magnitude larger than this.
 */
function reconcileSlack(count: number): number {
  return Math.max(0.01, count * 0.005 + 0.001);
}

/** "under" / "exact" / "over" — the schedule's status, which is what earns the
 *  status colour tokens. `"exact"` is the reconciliation answer; there is no
 *  second boolean helper, because two ways to ask the same question is how the
 *  two ways eventually disagree. */
export function coverState(
  installments: Installment[],
  total: number,
): "under" | "exact" | "over" {
  if (total <= 0 || installments.length === 0) return "under";
  const covered = coveredAmount(installments, total);
  if (Math.abs(covered - total) < reconcileSlack(installments.length)) return "exact";
  return covered > total ? "over" : "under";
}

/** US money to the cent. Pairs with `font-variant-numeric: tabular-nums`, and
 *  it is the ONLY money formatter on the page: a chain of footers that mixed
 *  rounded and exact figures would stop adding up in front of the reader. */
export function money(n: number): string {
  return safe(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** A signed money figure, for the footers that state an ADDITION to the
 *  running figure rather than a fresh one. */
export function moneyDelta(n: number): string {
  const v = round2(safe(n));
  if (v < 0) return `−${money(Math.abs(v))}`;
  return `+${money(v)}`;
}

/** A rate with no trailing-zero noise — 8.25% / 12% / 0%. Used for tax, where
 *  the exact rate matters. */
export function pct(n: number): string {
  const v = round2(safe(n));
  return `${v}%`;
}

/** A markup with one decimal — 18.0% / 0.0%. The estimate ledger's own
 *  convention, kept because "+ Materials markup (18%)" and "(18.0%)" next to
 *  each other in the same ledger reads as two different systems. */
export function pct1(n: number): string {
  return `${safe(n).toFixed(1)}%`;
}

/** Human file size for the staged-file rows. */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** A count with its noun, pluralised. Footers are sentences; "1 lines" would
 *  break the voice on every one of them. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The unit picker's options, in the live builder's order and wording. */
export const UNITS: { value: Unit; label: string }[] = [
  { value: "SQFT", label: "Sq ft" },
  { value: "LINEAR_FT", label: "Linear ft" },
  { value: "CUBIC_FT", label: "Cubic ft" },
  { value: "UNIT", label: "Unit" },
  { value: "HOUR", label: "Hour" },
  { value: "LUMP_SUM", label: "Lump sum" },
];

/** Lower-case unit wording for the client's copy — "2,850 sq ft", not "SQFT". */
export const UNIT_LABEL: Record<Unit, string> = {
  SQFT: "sq ft",
  LINEAR_FT: "linear ft",
  CUBIC_FT: "cubic ft",
  UNIT: "unit",
  HOUR: "hour",
  LUMP_SUM: "lump sum",
};

/** A quantity with its unit, for the client's copy: "2,850 sq ft". */
export function qtyLabel(line: LineItem): string {
  const q = safe(line.quantity);
  return `${q.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${UNIT_LABEL[line.unit]}`;
}

/** Rough word count, for the coverage footers on the prose cards. Splitting on
 *  whitespace is enough — nothing downstream depends on it being exact. */
export function words(text: string): number {
  const t = text.trim();
  return t.length === 0 ? 0 : t.split(/\s+/).length;
}

// Ids have to survive a reorder, a delete and an insert, so they cannot be
// array indices. A module-scoped counter is enough: nothing here ever leaves
// the client. The `mc_` prefix matches the fixture's, so a row added at runtime
// is as obviously fake as a seeded one.
let seq = 0;
export function newId(prefix: string): string {
  seq += 1;
  return `mc_${prefix}_${seq}`;
}

/** True when the user has asked the browser to keep still. Read at call time,
 *  not cached, so a mid-session preference change is respected. */
export function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
