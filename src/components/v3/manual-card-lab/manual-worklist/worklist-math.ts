// WORKLIST — the arithmetic, kept pure and out of the components.
//
// One reason above all: the sticky ledger, the estimate breakdown, the payment
// reconciliation meter and the client's copy all print money. If any two of
// them computed it themselves they would eventually disagree, and this page's
// whole argument is that the two numbers that matter — how much work is left
// and how much the job is worth — sit one glance apart and are TRUE. They all
// call in here instead, so there is exactly one number.
//
// ORDER OF OPERATIONS (the live builder's, verbatim — see
// src/components/proposal/EstimateBreakdown.tsx and lib/pricing/markup.ts):
//
//   base materials  = Σ qty × materialCost
//   base labor      = Σ qty × laborCost
//   + materials markup (m%)   = base materials × m
//   + labor markup (l%)       = base labor × l
//   subtotal        = base + both markups          ← the ledger's "Subtotal"
//   + overhead (o%) = subtotal × o
//   + profit (p%)   = (subtotal + overhead) × p
//   grand total     = subtotal + overhead + profit ← pre-tax quoted price
//   tax             = grand total × taxPct
//   total           = grand total + tax            ← the sticky ledger figure
//
// Markup is folded INTO the price rather than printed as its own client-facing
// line: the client is quoted a price, not shown the contractor's margin. The
// estimate ledger prints the whole chain because that side of the page is the
// contractor's workspace, not the document.
//
// LABOR-ONLY is a pricing fact, not a print trick. "Suppress material rows so
// the proposal reads as a pure labor quote" means the client is quoted labor,
// so the same chain runs with materials zeroed and the sticky total drops to
// match. Two totals — a real one and a printed one — would be exactly the
// "which number is the number?" confusion this page exists to kill.

import type {
  Draft,
  Installment,
  Line,
  Markups,
  PriceSheet,
  Unit,
} from "./worklist-types";

/** Two-decimal round that does not drift on .005 the way toFixed does. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** A half-typed number field reads as NaN. Treat it as zero rather than
 *  poisoning every total above it while the user is mid-keystroke. */
export function safe(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/** Raw cost of one unit of this line, before markup. */
export function costPerUnit(line: Line): number {
  return round2(safe(line.materialCost) + safe(line.laborCost));
}

/**
 * Rewrite a line's split so its cost/unit lands on `target`, keeping the
 * material/labor RATIO the contractor already set. A line with no split yet
 * splits 50/50, which is the only neutral answer available.
 *
 * This is what makes the row's `$ cost / unit` field editable without storing
 * a third number that could contradict the two it is made of.
 */
export function scaleToCost(line: Line, target: number): Line {
  const goal = Math.max(0, safe(target));
  const current = safe(line.materialCost) + safe(line.laborCost);
  const matShare = current > 0 ? safe(line.materialCost) / current : 0.5;
  return {
    ...line,
    materialCost: round2(goal * matShare),
    laborCost: round2(goal * (1 - matShare)),
  };
}

/** Share of this line's raw cost that is material, 0–100. 50 when empty —
 *  the ratio bar has to draw something, and half is the honest default. */
export function materialShare(line: Line): number {
  const total = safe(line.materialCost) + safe(line.laborCost);
  if (total <= 0) return 50;
  return round2((safe(line.materialCost) / total) * 100);
}

/** The client-facing price of one unit. `laborOnly` zeroes the material half,
 *  which is what turns the document into a pure labor quote. */
export function sellUnitPrice(line: Line, markups: Markups, laborOnly: boolean): number {
  const material = laborOnly ? 0 : safe(line.materialCost);
  const labor = safe(line.laborCost);
  return round2(
    material * (1 + safe(markups.materialMarkupPct) / 100) +
      labor * (1 + safe(markups.laborMarkupPct) / 100),
  );
}

/**
 * Every figure the page prints, in one pass.
 *
 * `laborOnly` is read off the draft's own options rather than passed in, so a
 * caller cannot accidentally price one part of the page differently from
 * another. There is one price sheet per render and everything reads it.
 */
export function computePriceSheet(draft: Draft): PriceSheet {
  const { markups } = draft;
  const laborOnly = draft.options.laborOnly;

  let baseMaterials = 0;
  let baseLabor = 0;

  const perLine = draft.lines.map((line) => {
    const qty = safe(line.quantity);
    const material = laborOnly ? 0 : safe(line.materialCost);
    const labor = safe(line.laborCost);
    baseMaterials += qty * material;
    baseLabor += qty * labor;

    const sellUnit = sellUnitPrice(line, markups, laborOnly);
    return {
      id: line.id,
      sellUnit,
      total: round2(qty * sellUnit),
      // A line with nothing left to charge for once materials are suppressed
      // does not print at all — an $0.00 row on a client's copy is a question,
      // not information.
      suppressed: laborOnly && labor <= 0,
    };
  });

  baseMaterials = round2(baseMaterials);
  baseLabor = round2(baseLabor);
  const baseTotal = round2(baseMaterials + baseLabor);

  const materialMarkup = round2(baseMaterials * (safe(markups.materialMarkupPct) / 100));
  const laborMarkup = round2(baseLabor * (safe(markups.laborMarkupPct) / 100));
  const subtotal = round2(baseTotal + materialMarkup + laborMarkup);

  const overhead = round2(subtotal * (safe(markups.overheadPct) / 100));
  const profit = round2((subtotal + overhead) * (safe(markups.profitPct) / 100));
  const grandTotal = round2(subtotal + overhead + profit);

  const tax = round2(grandTotal * (safe(draft.taxPct) / 100));
  const total = round2(grandTotal + tax);

  const margin = grandTotal > 0 ? round2(((grandTotal - baseTotal) / grandTotal) * 100) : 0;

  return {
    perLine,
    baseMaterials,
    baseLabor,
    baseTotal,
    materialMarkup,
    laborMarkup,
    subtotal,
    overhead,
    profit,
    grandTotal,
    tax,
    total,
    margin,
  };
}

/** One installment resolved to dollars against the quoted total. */
export function installmentValue(inst: Installment, total: number): number {
  return round2(inst.isPercent ? (total * safe(inst.amount)) / 100 : safe(inst.amount));
}

/** How much of the total the schedule accounts for, in dollars. */
export function coveredAmount(installments: Installment[], total: number): number {
  return round2(installments.reduce((sum, i) => sum + installmentValue(i, total), 0));
}

/**
 * The payment card's done-condition. A cent of slack absorbs the rounding a
 * 30/30/40 percent split produces on an odd total.
 *
 * With no total yet, percent installments are meaningless — but a schedule
 * that is 30 + 30 + 40 is still a finished schedule, so percent-only schedules
 * reconcile on their percentages instead of waiting for a price to exist.
 */
export function reconciles(installments: Installment[], total: number): boolean {
  if (installments.length === 0) return false;
  if (total <= 0) {
    if (!installments.every((i) => i.isPercent)) return false;
    const pctSum = installments.reduce((sum, i) => sum + safe(i.amount), 0);
    return Math.abs(pctSum - 100) < 0.01;
  }
  return Math.abs(coveredAmount(installments, total) - total) < 0.01;
}

/** US money for display. Pairs with `font-variant-numeric: tabular-nums`. */
export function money(n: number): string {
  return safe(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Whole dollars — for the ledger headline, where cents are noise. */
export function moneyShort(n: number): string {
  return `$${Math.round(safe(n)).toLocaleString("en-US")}`;
}

/** A percentage with no trailing-zero noise — 8.25% / 12% / 0%. */
export function pct(n: number): string {
  const v = safe(n);
  return `${Number.isInteger(v) ? v : round2(v)}%`;
}

/** One decimal, always — the markup controls and the margin readout, where a
 *  jumping decimal place is worse than a redundant zero. */
export function pct1(n: number): string {
  return `${safe(n).toFixed(1)}%`;
}

/** Human file size for the staged-file chips. */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

/** Lower-case wording for the client's copy — "2,400 sq ft", not "SQFT". */
export const UNIT_LABEL: Record<Unit, string> = {
  SQFT: "sq ft",
  LINEAR_FT: "linear ft",
  CUBIC_FT: "cubic ft",
  UNIT: "unit",
  HOUR: "hour",
  LUMP_SUM: "lump sum",
};

/** A line counts as work only once it has a name. An untitled placeholder row
 *  is not work, and the live builder drops it on save. */
export function isNamed(line: Line): boolean {
  return line.name.trim().length > 0;
}

/** Ids have to survive a reorder, a delete and an insert, so they cannot be
 *  array indices. A module counter is enough — these never leave the client.
 *  The `mc_` prefix is the lab's contract: no fixture id can ever be mistaken
 *  for a real record. */
let seq = 0;
export function newId(kind: string): string {
  seq += 1;
  return `mc_${kind}_${seq}`;
}

/** True when the user has asked the browser to keep still. Read at call time,
 *  not cached, so a mid-session preference change is respected. */
export function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Trim a long body of text down to a receipt-sized line without cutting a
 *  word in half. Used by the settled receipts, which must summarise CONTENT. */
export function excerpt(text: string, max = 74): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
