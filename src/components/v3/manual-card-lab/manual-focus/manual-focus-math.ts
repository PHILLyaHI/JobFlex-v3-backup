// FOCUS CARD — the arithmetic, kept pure and out of the components.
//
// Route: /dashboard/manual-focus.
//
// ONE reason this is its own module: the sticky strip, the estimate ledger, the
// payment-coverage meter, the nine stood-down summary faces and the client's
// copy ALL print money. Nine of those are on screen at once by design — this
// variant's whole bet is that you can read every card without opening it — so
// if any two of them computed a figure themselves they would eventually
// disagree, and the bet would be dead. They all call in here instead.
//
// ORDER OF OPERATIONS (the contractor-standard chain for a client-facing quote)
//   base materials      = SUM qty x material $/unit          (raw cost)
//   base labor          = SUM qty x labor $/unit             (raw cost)
//   + materials markup  = base materials x materialMarkup%
//   + labor markup      = base labor     x laborMarkup%
//   subtotal            = the two marked-up halves           <- ledger "Subtotal"
//   + overhead          = subtotal x overhead%
//   + profit            = (subtotal + overhead) x profit%
//   grand total         = subtotal + overhead + profit       <- pre-tax
//   tax                 = grand total x taxPct%
//   TOTAL               = grand total + tax                  <- the sticky strip
//
// The client is quoted a PRICE, never shown a margin: markup, overhead and
// profit are folded into the per-unit prices on the printed sheet rather than
// itemised. That is the same rule the live builder follows (sellUnitPrice in
// lib/pricing/markup).
//
// THE PRINTED ROW IS THE SOURCE OF TRUTH FOR THE PRINTED TABLE. Every figure on
// the client's copy is derived from the rounded unit price the client can see:
// `amount = quantity x unitPrice`, and `preTax` is the SUM of those amounts. So
// the sheet reconciles by hand, line by line and column to subtotal, at any
// markup / overhead / profit setting — which is the only arithmetic a homeowner
// with a calculator ever checks.
//
// The cost of that: once overhead or profit is non-zero, the ledger's own chain
// (subtotal + overhead + profit) can land a few dollars away from the sum of the
// printed lines, because a unit price is quantised to cents and a 2,400 sq ft
// line moves in $24 steps. The ledger prints `preTax` as its Grand total, so the
// two documents still agree with each other; the drift is between the ledger's
// four visible rows and its own last row, and the note under the ledger says so.
// The alternative — the old behaviour — was a printed row where unit price x
// quantity did not equal the printed line total, in front of the client. That is
// the worse of the two, and it is the one this trade buys off.
//
// UNNAMED LINES ARE EXCLUDED, from the money and from the sheet. An untitled
// row is not work yet; the live builder drops it on save. Excluding it here is
// what lets the row carry an honest "NEEDS A NAME" tag instead of quietly
// contributing to a total nobody can trace.

import type { Draft, Line, PrintedLine, Totals, Unit } from "./manual-focus-types";

/* ============================================================
   NUMERIC HYGIENE
   ============================================================ */

/** Two-decimal round that does not drift on .005 the way toFixed does. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** A half-typed number field reads as NaN. Treat it as zero rather than
 *  poisoning every total above it while the user is mid-keystroke. */
export function safe(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/** Clamp a percentage control to its declared range. Module-local: the number
 *  fields clamp against their own `min`/`max` props inside `NumIn`, which is a
 *  two-sided bound this one-sided helper cannot express. */
function clampPct(n: number, max: number): number {
  const v = safe(n);
  if (v < 0) return 0;
  return v > max ? max : v;
}

/* ============================================================
   PER-LINE PRICING
   ============================================================ */

type Rates = { materialMarkupPct: number; laborMarkupPct: number };

/** Raw cost of one unit, before any markup. Drives the material/labor ratio. */
export function unitCost(line: Line): number {
  return round2(safe(line.materialCost) + safe(line.laborCost));
}

/**
 * The marked-up price of one unit: each half carries its own markup. Equals
 * `unitCost` at 0% / 0%.
 *
 * Rounded to cents BEFORE it is multiplied by the quantity, deliberately. A
 * unit price is quoted in cents, and rounding here is what makes the printed
 * sheet check out by hand: unit price x quantity equals the line total exactly,
 * every time. Multiplying the unrounded figure would be a few dollars "more
 * accurate" on a 2,400 sq ft line and would leave a homeowner's arithmetic
 * disagreeing with the page.
 */
export function sellUnit(line: Line, rates: Rates): number {
  const material = safe(line.materialCost) * (1 + safe(rates.materialMarkupPct) / 100);
  const labor = safe(line.laborCost) * (1 + safe(rates.laborMarkupPct) / 100);
  return round2(material + labor);
}

/** What this line adds to the ledger's subtotal (pre overhead and profit). */
export function lineSell(line: Line, rates: Rates): number {
  return round2(safe(line.quantity) * sellUnit(line, rates));
}

/**
 * Re-split a line's material/labor pair so it adds up to a typed unit price,
 * keeping the existing ratio. This is what makes "Unit price" a real editable
 * control without storing a third, drift-prone copy of the number.
 *
 * A line with no cost at all has no ratio to preserve, so a first price is
 * split 50/50 — an arbitrary but visible starting point the two $/unit fields
 * behind the row's disclosure can then correct.
 */
export function applyUnitPrice(line: Line, next: number): Pick<Line, "materialCost" | "laborCost"> {
  const target = Math.max(0, safe(next));
  const current = safe(line.materialCost) + safe(line.laborCost);
  if (current <= 0) {
    return { materialCost: round2(target / 2), laborCost: round2(target / 2) };
  }
  const share = safe(line.materialCost) / current;
  const material = round2(target * share);
  // The labor half is the REMAINDER, not its own rounded product: two
  // independently rounded halves can land a cent away from the typed price.
  return { materialCost: material, laborCost: round2(target - material) };
}

/** Material's share of one unit's raw cost, 0-100. A costless line has no real
 *  ratio; 50 is what the slider shows so its handle starts somewhere sane. */
export function materialShare(line: Line): number {
  const total = safe(line.materialCost) + safe(line.laborCost);
  if (total <= 0) return 50;
  return (safe(line.materialCost) / total) * 100;
}

/** Move the ratio without changing the per-unit cost. */
export function applyMaterialShare(line: Line, pct: number): Pick<Line, "materialCost" | "laborCost"> {
  const total = round2(safe(line.materialCost) + safe(line.laborCost));
  const share = clampPct(pct, 100) / 100;
  const material = round2(total * share);
  return { materialCost: material, laborCost: round2(total - material) };
}

/** A line only counts once it has a name. See the module header. */
export function isNamed(line: Line): boolean {
  return line.name.trim().length > 0;
}

/* ============================================================
   THE WHOLE SHEET
   ============================================================ */

/**
 * The printed table. Overhead and profit are spread across the per-unit prices
 * by a single load factor, and the line total is then computed FROM the printed
 * unit price — not from the unrounded one — so `quantity x unit price` equals
 * the printed amount exactly, on every row, at every setting.
 *
 * There is deliberately no residual redistribution here any more. Parking a
 * leftover on the largest line made the column sum to a figure the ledger had
 * arrived at independently, at the price of that one row no longer multiplying
 * out: at 10% overhead the seeded shingle line printed "2,400 sq ft · $3.94 ·
 * $9,451.20" while 2,400 x $3.94 is $9,456.00. The client's copy is the document
 * that gets checked by hand, so the client's copy is what the arithmetic is
 * anchored to; `computeTotals` takes its `preTax` from this column instead.
 */
function printedLines(named: Line[], rates: Rates, load: number): PrintedLine[] {
  return named.map((l) => {
    const unitPrice = round2(sellUnit(l, rates) * load);
    return {
      id: l.id,
      name: l.name.trim(),
      description: l.description,
      unit: l.unit,
      quantity: safe(l.quantity),
      unitPrice,
      amount: round2(safe(l.quantity) * unitPrice),
      materialCost: safe(l.materialCost),
      laborCost: safe(l.laborCost),
    };
  });
}

/** Every figure the page prints, from the whole draft. */
export function computeTotals(draft: Draft): Totals {
  const rates: Rates = {
    materialMarkupPct: draft.materialMarkupPct,
    laborMarkupPct: draft.laborMarkupPct,
  };
  const named = draft.lines.filter(isNamed);

  let baseMaterials = 0;
  let baseLabor = 0;
  for (const l of named) {
    baseMaterials += safe(l.quantity) * safe(l.materialCost);
    baseLabor += safe(l.quantity) * safe(l.laborCost);
  }
  baseMaterials = round2(baseMaterials);
  baseLabor = round2(baseLabor);

  const materialsAfter = round2(baseMaterials * (1 + safe(draft.materialMarkupPct) / 100));
  const laborAfter = round2(baseLabor * (1 + safe(draft.laborMarkupPct) / 100));

  // The ledger's subtotal is the sum of the ROUNDED line prices, not the
  // unrounded halves above — otherwise the line column and the subtotal are
  // computed two different ways and disagree by a cent on long sheets.
  const subtotalCosts = round2(named.reduce((sum, l) => sum + lineSell(l, rates), 0));

  const overheadAmount = round2(subtotalCosts * (safe(draft.overheadPct) / 100));
  const subtotalWithOverhead = round2(subtotalCosts + overheadAmount);
  const profitAmount = round2(subtotalWithOverhead * (safe(draft.profitPct) / 100));

  // The chain figure — what overhead and profit are worth before they are
  // quantised into per-unit prices. It sets the load factor and nothing else.
  const chainPreTax = round2(subtotalWithOverhead + profitAmount);

  // Overhead and profit ride inside the printed unit prices. At the 0% / 0%
  // defaults this factor is exactly 1 and the printed prices equal the ledger's.
  const load = subtotalCosts > 0 ? chainPreTax / subtotalCosts : 1;

  // THE PRINTED COLUMN IS BUILT FIRST, and the pre-tax figure is its sum. That
  // is what makes the client's copy self-consistent: every printed line
  // multiplies out, and the column adds up to the Subtotal printed beneath it.
  // With no named lines there is no column to add up, so the chain stands in —
  // it is 0 at that point anyway unless someone is quoting overhead on nothing.
  const printed = printedLines(named, rates, load);
  const preTax =
    printed.length > 0 ? round2(printed.reduce((sum, r) => sum + r.amount, 0)) : chainPreTax;

  // Discount comes off BEFORE tax, so tax is charged on what the client owes
  // rather than on a figure nobody pays. The other order overstates the tax
  // line, and it is the kind of error a client notices on the printed sheet.
  //
  // TWO MODES. `discountIsPercent` is optional and absent means TRUE, so this
  // is a no-op for every draft and every route that predates the dollar mode.
  // In dollar mode the figure is capped at `preTax`: a discount larger than the
  // job would produce a negative taxable base, a negative tax, and a total that
  // climbs back up as the discount grows — arithmetic that is not wrong so much
  // as meaningless. Capping is also what the UI can explain ("the whole job");
  // clamping to zero silently would just look broken.
  const discountAmount =
    draft.discountIsPercent === false
      ? Math.min(round2(safe(draft.discountFlat ?? 0)), preTax)
      : round2(preTax * (safe(draft.discountPct) / 100));
  const taxable = round2(preTax - discountAmount);

  const tax = round2(taxable * (safe(draft.taxPct) / 100));
  const total = round2(taxable + tax);

  const baseTotal = round2(baseMaterials + baseLabor);
  // Margin is measured against the DISCOUNTED revenue: money given away is not
  // margin. Quoting a headline margin that a discount has already spent is the
  // single most flattering way to get this wrong.
  const margin = taxable > 0 ? ((taxable - baseTotal) / taxable) * 100 : 0;

  return {
    baseMaterials,
    baseLabor,
    baseTotal,
    materialsMarkup: round2(materialsAfter - baseMaterials),
    laborMarkup: round2(laborAfter - baseLabor),
    subtotalCosts,
    overheadAmount,
    subtotalWithOverhead,
    profitAmount,
    preTax,
    discountAmount,
    taxable,
    tax,
    total,
    margin,
    printed,
    unnamedCount: draft.lines.length - named.length,
  };
}

/* ============================================================
   PAYMENT SCHEDULE
   ============================================================ */

/** One installment in dollars. A percentage is meaningless until a total
 *  exists, which is why the row only prints this figure once one does. */
export function installmentValue(
  inst: { amount: number; isPercent: boolean },
  total: number,
): number {
  return round2(inst.isPercent ? (total * safe(inst.amount)) / 100 : safe(inst.amount));
}

/** How much of the total the schedule accounts for, in dollars. */
export function coveredAmount(
  installments: { amount: number; isPercent: boolean }[],
  total: number,
): number {
  return round2(installments.reduce((sum, i) => sum + installmentValue(i, total), 0));
}

/** Under / exact / over. A cent of slack absorbs the rounding a 30/30/40 split
 *  produces on an odd total — the schedule is balanced, and saying otherwise
 *  over one cent is the kind of false alarm that trains people to ignore
 *  warnings. */
export type CoverState = "under" | "exact" | "over" | "none";

export function coverState(
  installments: { amount: number; isPercent: boolean }[],
  total: number,
): CoverState {
  if (installments.length === 0) return "none";
  if (total <= 0) return "none";
  const covered = coveredAmount(installments, total);
  if (Math.abs(covered - total) < 0.01) return "exact";
  return covered > total ? "over" : "under";
}

/* ============================================================
   FORMATTERS — every money string on the page comes from here
   ============================================================ */

/** US money for display. Always paired with `font-variant-numeric: tabular-nums`. */
export function money(n: number): string {
  return safe(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Money with no cents — for the summary faces, where two decimal places on
 *  nine cards at once is noise rather than information. */
export function moneyShort(n: number): string {
  return safe(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/** A percentage with no trailing-zero noise — 8.25% / 12% / 0%. */
export function pct(n: number): string {
  const v = safe(n);
  return `${Number.isInteger(v) ? v : round2(v)}%`;
}

/** The estimate ledger's own register, which prints one decimal place
 *  everywhere — "+ Materials markup (18.0%)" — so the four rows line up. */
export function pct1(n: number): string {
  return `${safe(n).toFixed(1)}%`;
}

/** Quantities: grouped, and only as precise as they need to be. */
export function qty(n: number): string {
  const v = safe(n);
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Human file size for the staged-file rows. */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** First line of a block of prose, trimmed to fit a summary row. Used by the
 *  stood-down faces so a card shows what is IN it, not just that it has
 *  something in it. */
export function firstLine(text: string, max = 64): string {
  const line = text.trim().split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (line.length <= max) return line;
  return `${line.slice(0, max - 1).trimEnd()}…`;
}

/* ============================================================
   UNITS
   ============================================================ */

/** The unit picker's options, in the original Job-FLEX order and wording. */
export const UNITS: { value: Unit; label: string }[] = [
  { value: "SQFT", label: "sqft" },
  { value: "LF", label: "lf" },
  { value: "LINEAR_FT", label: "linear ft" },
  { value: "SQ_BOARDS", label: "sq boards" },
  { value: "CU_YARDS", label: "cu yards" },
  { value: "YARDS", label: "yards" },
  { value: "SQ_YARDS", label: "sq yards" },
  { value: "UNIT", label: "unit" },
  { value: "HOUR", label: "hr" },
  { value: "FIXED", label: "fixed" },
];

/** Lower-case wording for the client's copy — "2,400 sq ft", not "SQFT". */
export const UNIT_LABEL: Record<Unit, string> = {
  SQFT: "sq ft",
  LF: "linear ft",
  LINEAR_FT: "linear ft",
  SQ_BOARDS: "sq boards",
  CU_YARDS: "cu yards",
  YARDS: "yards",
  SQ_YARDS: "sq yards",
  UNIT: "unit",
  HOUR: "hour",
  FIXED: "fixed",
};

/* ── UNIT BEHAVIOUR ─────────────────────────────────────────
   Picking a unit is not only a label change — three of the ten
   change what the row MEANS, and the row has to follow. Kept
   here rather than in a component so every line-item design
   answers the question identically.

   FIXED    a lump sum. "How many?" has no answer, so quantity is
            pinned at 1 and the line total IS the unit price. A
            fixed line showing "× 3" is a bug the user has to
            notice; pinning it is the fix.
   HOUR     time. Labor by default — a fresh hourly line that
            splits its price 50/50 into materials is wrong more
            often than it is right. The user can still move the
            ratio afterwards; this only seeds it.
   the rest measured quantities, no special behaviour.
*/

/** Quantity is meaningless for this unit and must stay at 1. */
export function isFixedUnit(u: Unit): boolean {
  return u === "FIXED";
}

/** Time, so a new line's cost seeds entirely into labor. */
export function isTimeUnit(u: Unit): boolean {
  return u === "HOUR";
}

/**
 * The patch to apply when a row's unit changes.
 *
 * Returns the unit plus whatever else that unit forces, so a caller does one
 * `onPatch` and cannot half-apply the rule. Deliberately does NOT touch the
 * price: switching to FIXED should collapse the quantity into the line total
 * conceptually, not silently re-price the work — so the quantity it folds away
 * is multiplied into the unit price first, keeping the line total unchanged.
 */
export function applyUnitChange(line: Line, next: Unit): Partial<Line> {
  if (!isFixedUnit(next)) return { unit: next };
  if (line.quantity === 1) return { unit: next, quantity: 1 };
  const scale = line.quantity;
  return {
    unit: next,
    quantity: 1,
    materialCost: round2(line.materialCost * scale),
    laborCost: round2(line.laborCost * scale),
  };
}

/* ============================================================
   IDS AND ENVIRONMENT
   ============================================================ */

// Ids have to survive a reorder, a delete and an insert, so they cannot be
// array indices. A module-scoped counter is enough: nothing here ever leaves
// the client or reaches a database. The `mc_` prefix matches the fixtures so a
// row created in-session is as obviously fake as a seeded one.
let seq = 0;
export function newId(kind: string): string {
  seq += 1;
  return `mc_${kind}_${seq}`;
}

/** True when the user has asked the browser to keep still. Read at call time
 *  rather than cached, so a mid-session preference change is respected. */
export function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
