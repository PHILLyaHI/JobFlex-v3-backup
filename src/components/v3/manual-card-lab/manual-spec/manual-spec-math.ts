// SPEC SHEET — the arithmetic, pure and out of the components.
// Route /dashboard/manual-spec. Fixture-only page; nothing here touches a
// store, a server action or the network.
//
// WHY IT IS ALL IN ONE FILE
// The sticky title block, the schedule of work, the estimate ledger, the
// payment-schedule reconciliation and the issued sheet all print money. If any
// two of them did their own arithmetic they would eventually disagree, and on
// a page whose whole argument is "this reads like a completed spec sheet" a
// disagreement is fatal. They all call in here, so there is exactly ONE set of
// numbers.
//
// ORDER OF OPERATIONS (and why)
//   per unit  sell   = material x (1 + matMarkup) + labor x (1 + laborMarkup)
//   base             = SUM(qty x material) + SUM(qty x labor)
//   markups          = base materials x matMarkup + base labor x laborMarkup
//   SUBTOTAL         = base + markups                    <- the ledger's Subtotal
//   + overhead       = subtotal x overheadPct
//   + profit         = (subtotal + overhead) x profitPct
//   GRAND TOTAL      = subtotal + overhead + profit      <- pre-tax price
//   tax              = grand total x taxPct
//   TOTAL            = grand total + tax                 <- what the client owes
//
// Overhead and profit are DISTRIBUTED across the lines by a single uplift
// factor (grandTotal / subtotal) rather than printed as extra rows. Two
// reasons: a client never sees a contractor's overhead line, and it is the
// only way the issued sheet's amount column can add up to its own subtotal —
// which on a spec sheet it must. `perLine.amount` is penny-reconciled against
// the grand total for the same reason.
//
// LABOR-ONLY is a price change, not a display filter. A labor-only proposal is
// one where the homeowner buys the materials, so the material half genuinely
// leaves the price. Zeroing it here rather than in the preview keeps the
// ledger, the title block and the issued sheet on one number.

import type {
  Installment,
  LineFigure,
  Markups,
  SpecDraft,
  SpecLine,
  SpecOptions,
  Totals,
  Unit,
} from "./manual-spec-types";

/* ─────────────────────────────────────────────────────────────
   Number helpers
   ───────────────────────────────────────────────────────────── */

/** Two-decimal round that does not drift on .005 the way toFixed does. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** A half-typed number field reads as NaN. Treat it as zero rather than
 *  poisoning every total above it while the user is mid-keystroke. */
export function safe(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/* ─────────────────────────────────────────────────────────────
   Per-line prices
   ───────────────────────────────────────────────────────────── */

/** What one unit of this line COSTS, before any markup. The number the
 *  material / labor ratio readout is taken over. */
export function unitCost(line: SpecLine, options: SpecOptions): number {
  const material = options.laborOnly ? 0 : safe(line.materialCost);
  return material + safe(line.laborCost);
}

/**
 * Sell price for one unit BEFORE overhead and profit are distributed.
 * Equals `unitCost` at 0% / 0% markup, which is what makes a flat
 * "Permit fee $450" line behave the way a contractor expects.
 */
export function sellUnitBase(line: SpecLine, markups: Markups, options: SpecOptions): number {
  const material = options.laborOnly ? 0 : safe(line.materialCost);
  return (
    material * (1 + safe(markups.materialMarkupPct) / 100) +
    safe(line.laborCost) * (1 + safe(markups.laborMarkupPct) / 100)
  );
}

/**
 * The inverse of `sellUnitBase` x uplift: given a client-facing UNIT $ the
 * user typed onto the value track, work back to the material / labor split
 * that produces it, holding the line's current material share constant.
 *
 * This is what makes the row's UNIT $ editable in place, which the spec-sheet
 * grammar requires — every value on the track is typed, never read-only. The
 * result is deliberately NOT rounded to cents: rounding the split would make
 * the derived UNIT $ land a cent away from what was typed and the field would
 * visibly fight the caret.
 */
export function splitFromUnitSell(
  line: SpecLine,
  markups: Markups,
  options: SpecOptions,
  uplift: number,
  nextUnitSell: number,
): { materialCost: number; laborCost: number } {
  const target = Math.max(0, safe(nextUnitSell));
  const cost = safe(line.materialCost) + safe(line.laborCost);
  // A brand-new line has no ratio to hold, so split it evenly — the same
  // fallback the live builder's RatioSlider uses when the cost is zero.
  const share = cost > 0 ? safe(line.materialCost) / cost : 0.5;

  // On a labor-only issue the material half is not in the price at all, so a
  // typed UNIT $ can only be labor. Writing it into `share` instead would
  // silently rewrite the contractor's real cost split.
  if (options.laborOnly) {
    const w = (1 + safe(markups.laborMarkupPct) / 100) * (uplift || 1);
    return { materialCost: safe(line.materialCost), laborCost: w > 0 ? target / w : 0 };
  }

  const weight =
    (share * (1 + safe(markups.materialMarkupPct) / 100) +
      (1 - share) * (1 + safe(markups.laborMarkupPct) / 100)) *
    (uplift || 1);
  if (weight <= 0) return { materialCost: 0, laborCost: 0 };

  const base = target / weight;
  return { materialCost: share * base, laborCost: (1 - share) * base };
}

/* ─────────────────────────────────────────────────────────────
   The one pass
   ───────────────────────────────────────────────────────────── */

/** Every figure the page prints, from the whole draft. */
export function computeTotals(draft: SpecDraft): Totals {
  const { markups, options } = draft;
  const suppressMaterial = options.laborOnly;

  let baseMaterials = 0;
  let baseLabor = 0;
  for (const line of draft.lines) {
    const qty = safe(line.quantity);
    if (!suppressMaterial) baseMaterials += qty * safe(line.materialCost);
    baseLabor += qty * safe(line.laborCost);
  }

  const materialsMarkup = baseMaterials * (safe(markups.materialMarkupPct) / 100);
  const laborMarkup = baseLabor * (safe(markups.laborMarkupPct) / 100);
  const estimateSubtotal = baseMaterials + baseLabor + materialsMarkup + laborMarkup;

  const overhead = estimateSubtotal * (safe(markups.overheadPct) / 100);
  const profitAllowance = (estimateSubtotal + overhead) * (safe(markups.profitPct) / 100);
  const grandTotal = estimateSubtotal + overhead + profitAllowance;

  // One factor carries overhead + profit onto every line, so the issued
  // sheet's amount column and its subtotal are the same arithmetic.
  const uplift = estimateSubtotal > 0 ? grandTotal / estimateSubtotal : 1;

  /* ── Penny reconciliation ────────────────────────────────────
     Rounding each line independently can leave the column a cent or two
     short of the subtotal it is printed under. A spec sheet that does not
     add up is not a spec sheet, so the drift is handed to the LARGEST line
     — a stray cent on a $0.00 row would read as a bug. */
  const cents = draft.lines.map((line) =>
    Math.round(safe(line.quantity) * sellUnitBase(line, markups, options) * uplift * 100),
  );
  const target = Math.round(grandTotal * 100);
  const drift = target - cents.reduce((sum, c) => sum + c, 0);
  if (drift !== 0 && cents.length > 0) {
    let biggest = 0;
    for (let i = 1; i < cents.length; i += 1) if (cents[i] > cents[biggest]) biggest = i;
    cents[biggest] += drift;
  }

  const perLine: LineFigure[] = draft.lines.map((line, i) => {
    const qty = safe(line.quantity);
    const amount = cents[i] / 100;
    const cost = safe(line.materialCost) + safe(line.laborCost);
    return {
      id: line.id,
      // Derive the unit price back OUT of the reconciled amount so the row's
      // "qty x unit = amount" reads true for the number actually printed.
      unitSell: qty > 0 ? amount / qty : sellUnitBase(line, markups, options) * uplift,
      amount,
      unitCost: unitCost(line, options),
      materialSharePct: cost > 0 ? (safe(line.materialCost) / cost) * 100 : 50,
    };
  });

  const tax = round2(grandTotal * (safe(draft.taxPct) / 100));
  const directCost = baseMaterials + baseLabor;

  return {
    perLine,
    baseMaterials: round2(baseMaterials),
    baseLabor: round2(baseLabor),
    materialsMarkup: round2(materialsMarkup),
    laborMarkup: round2(laborMarkup),
    estimateSubtotal: round2(estimateSubtotal),
    overhead: round2(overhead),
    profitAllowance: round2(profitAllowance),
    grandTotal: round2(grandTotal),
    tax,
    total: round2(round2(grandTotal) + tax),
    margin: grandTotal > 0 ? round2(((grandTotal - directCost) / grandTotal) * 100) : 0,
  };
}

/* ─────────────────────────────────────────────────────────────
   Payment schedule
   ───────────────────────────────────────────────────────────── */

/** One installment resolved to dollars. A percent installment means nothing
 *  until a total exists, which is why the row says so rather than printing $0. */
export function installmentValue(inst: Installment, total: number): number {
  return round2(inst.isPercent ? (total * safe(inst.amount)) / 100 : safe(inst.amount));
}

/** How much of the total the schedule accounts for, in dollars. */
export function coveredAmount(installments: Installment[], total: number): number {
  return round2(installments.reduce((sum, i) => sum + installmentValue(i, total), 0));
}

/**
 * Does the schedule reconcile, and which way is it out?
 *
 * SLACK IS PER INSTALLMENT, not a flat cent. Each percentage draw is rounded
 * to cents independently, so an N-draw schedule can legitimately miss the
 * total by up to N half-cents — the seeded 30 / 30 / 40 on an $18,399.71 total
 * lands exactly one cent short. A flat one-cent tolerance would open this page
 * on a false "under", which is precisely the kind of thing that teaches a
 * contractor to ignore the readout.
 *
 * ONE function, called by both the meter and the sheet summary, so the two can
 * never disagree about whether the schedule balances. The live builder does
 * not surface this at all; the brief calls surfacing it an improvement.
 */
export function scheduleState(
  installments: Installment[],
  total: number,
): "none" | "under" | "exact" | "over" {
  if (total <= 0 || installments.length === 0) return "none";
  const covered = coveredAmount(installments, total);
  const slack = 0.005 * installments.length + 0.005;
  if (Math.abs(covered - total) < slack) return "exact";
  return covered > total ? "over" : "under";
}

/* ─────────────────────────────────────────────────────────────
   Formatting — every money figure on the page comes through here,
   and every element that prints one carries tabular numerals.
   ───────────────────────────────────────────────────────────── */

/** `$18,204.10` — cents shown. A spec sheet quotes to the cent. */
export function money(n: number): string {
  return safe(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** `$18,204` — whole dollars, for the title block's headline figure. */
export function moneyRound(n: number): string {
  return `$${Math.round(safe(n)).toLocaleString("en-US")}`;
}

/** `18.0%` — one decimal, matching the live estimate breakdown's labels. */
export function pct1(n: number): string {
  return `${safe(n).toFixed(1)}%`;
}

/** `8.25%` / `12%` — no trailing-zero noise. For tax and inline echoes. */
export function pct(n: number): string {
  const v = safe(n);
  return `${Number.isInteger(v) ? v : round2(v)}%`;
}

/** Human file size for the staged-file rows. */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** A quantity, printed the way a schedule prints one — no forced decimals. */
export function qtyText(n: number): string {
  const v = safe(n);
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/* ─────────────────────────────────────────────────────────────
   Units
   ───────────────────────────────────────────────────────────── */

/** The unit picker's options, in the live builder's order and wording. */
export const UNITS: { value: Unit; label: string }[] = [
  { value: "SQFT", label: "Sq ft" },
  { value: "LINEAR_FT", label: "Linear ft" },
  { value: "CUBIC_FT", label: "Cubic ft" },
  { value: "UNIT", label: "Unit" },
  { value: "HOUR", label: "Hour" },
  { value: "LUMP_SUM", label: "Lump sum" },
];

/** Lower-case wording for the client's copy — "2,600 sq ft", not "SQFT". */
export const UNIT_LABEL: Record<Unit, string> = {
  SQFT: "sq ft",
  LINEAR_FT: "linear ft",
  CUBIC_FT: "cubic ft",
  UNIT: "unit",
  HOUR: "hour",
  LUMP_SUM: "lump sum",
};

/* ─────────────────────────────────────────────────────────────
   Ids and environment
   ───────────────────────────────────────────────────────────── */

// Ids have to survive a delete and an insert, so they cannot be array indices.
// A module-scoped counter is enough: these never leave the client and never
// reach a database. The `mc_` prefix is the lab's contract — it marks every id
// on this page as fixture-only.
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
