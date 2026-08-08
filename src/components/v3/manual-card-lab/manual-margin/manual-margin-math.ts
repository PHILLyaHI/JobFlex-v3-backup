// PRICE FIRST — the arithmetic, pure and out of the components.
// (route: /dashboard/manual-margin)
//
// One reason above all: this page's whole argument is that there is ONE
// number. The price card, the sticky reconciliation strip, the composition
// bar, five card heads, the payment coverage meter and the client's copy all
// print money. If any two of them computed it themselves they would eventually
// disagree, and the disagreement would read as the design being wrong. They
// all call in here instead.
//
// ORDER OF OPERATIONS (the live builder's, from
// src/components/proposal/EstimateBreakdown.tsx — these pages are visual, but
// showing a different total than the real builder would make them impossible
// to evaluate):
//
//   base materials       = Σ qty × material$/unit
//   base labor           = Σ qty × labor$/unit
//   materials after      = base materials × (1 + materials markup)
//   labor after          = base labor      × (1 + labor markup)
//   SUBTOTAL             = materials after + labor after
//   + overhead           = subtotal × overhead%
//   + profit             = (subtotal + overhead) × profit%
//   GRAND TOTAL          = pre-tax sell price   ← the client's "Subtotal"
//   + tax                = grand total × tax%
//   CONTRACT TOTAL       = what the homeowner signs for
//
// Two things follow from that and are deliberate:
//
// 1. Overhead and profit are LOADS on the whole sheet, not per-line fields, so
//    a line's own sell price is its marked-up cost carrying its proportional
//    share of both. That is what makes Σ(line sells) === grand total, which is
//    what lets the preview table and the ledger print the same figure.
// 2. `laborOnly` zeroes materials for the WHOLE computation rather than hiding
//    rows in the preview. A labor-only proposal is not carrying the material
//    cost, so pretending otherwise in the workspace would leave two totals on
//    the page — the one thing this design cannot have.
//
// Fixture-only module: no Prisma, no server action, no network, no store.

import type {
  Composition,
  Installment,
  Line,
  MarginDraft,
  Markups,
  ProfitSolve,
  Reconciliation,
  Totals,
  Unit,
} from "./manual-margin-types";

/** Two-decimal round that does not drift on .005 the way toFixed does. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Four-decimal round, used ONLY by the unit-price back-solve.
 *
 * Rounding the solved material/labor split to cents leaves the reconstructed
 * unit price up to two cents away from what was typed, and the field would
 * visibly snap on blur — which reads as a bug on a page whose argument is that
 * the numbers agree. Four decimals keeps the round-trip exact to the cent, and
 * a per-unit internal cost is allowed more precision than a printed price.
 */
function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

/** A half-typed number field reads as NaN. Treat it as zero rather than
 *  poisoning every total above it while the contractor is mid-keystroke. */
export function safe(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/** Keeps a control inside its own published range. Applied on commit, not on
 *  keystroke, so typing "1" on the way to "18" is not clamped to the max. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** The published range of each markup control. The two markups run to 100%
 *  (a 2x materials markup is a real thing on small jobs); overhead and profit
 *  are allowances and stop at 60%, which is already past anything honest. */
export const MARKUP_MAX = 100;
export const LOAD_MAX = 60;

/** Cost per unit BEFORE markup, honouring the labor-only decision. */
function unitCost(line: Line, laborOnly: boolean): { material: number; labor: number } {
  return {
    material: laborOnly ? 0 : safe(line.materialCost),
    labor: safe(line.laborCost),
  };
}

/** Cost per unit AFTER each side's own markup — still before overhead/profit. */
function unitAfterMarkup(line: Line, m: Markups, laborOnly: boolean): number {
  const { material, labor } = unitCost(line, laborOnly);
  return (
    material * (1 + safe(m.materialMarkupPct) / 100) + labor * (1 + safe(m.laborMarkupPct) / 100)
  );
}

/** The multiplier overhead and profit apply to the whole sheet. */
function loadFactor(m: Markups): number {
  return (1 + safe(m.overheadPct) / 100) * (1 + safe(m.profitPct) / 100);
}

/**
 * The `$` figure printed on a line row: what one unit of this line sells for,
 * carrying its share of overhead and profit. Derived — never stored — which is
 * why editing it back-solves the cost split (see solveUnitPrice below).
 */
export function sellUnitPrice(line: Line, draft: MarginDraft): number {
  return round2(unitAfterMarkup(line, draft.markups, draft.options.laborOnly) * loadFactor(draft.markups));
}

/**
 * Back-solve: the contractor typed a unit price on a row, so scale that line's
 * material and labor costs until the row sells for exactly that.
 *
 * A line that already has a split keeps its material/labor RATIO — the mix is
 * a fact about the work, the price is a decision about the job.
 *
 * A line with NO split yet (a fresh row, or one that was just cleared to zero)
 * has no ratio to keep, so the money is split the way the rest of the SHEET is
 * split. A new line on a roof is far more likely to look like the rest of the
 * roof than to be pure material, and the alternative — dumping it all on
 * materials — quietly wrecks the margin the moment the two markups differ.
 * With an empty sheet there is nothing to learn from and it goes to materials,
 * which is the right home for the "Permit fee $450" line that case describes.
 *
 * Never divides by zero: every factor below is (1 + a non-negative percentage),
 * and the sheet-mix branch is guarded on a positive base.
 */
export function solveUnitPrice(
  line: Line,
  draft: MarginDraft,
  wantedUnitPrice: number,
): { materialCost: number; laborCost: number } {
  const wanted = Math.max(0, safe(wantedUnitPrice));
  const m = draft.markups;
  const laborOnly = draft.options.laborOnly;
  const load = loadFactor(m);
  const matFactor = 1 + safe(m.materialMarkupPct) / 100;
  const labFactor = 1 + safe(m.laborMarkupPct) / 100;
  const current = unitAfterMarkup(line, m, laborOnly) * load;

  // ── The line has a mix. Keep it, scale it. ──────────────────────────
  if (current > 0) {
    const factor = wanted / current;
    return {
      materialCost: round4(safe(line.materialCost) * factor),
      laborCost: round4(safe(line.laborCost) * factor),
    };
  }

  // ── Labor-only: material is out of the price, so it has to land on labor
  //    or the very next recompute throws it away again. ────────────────
  if (laborOnly) {
    return {
      materialCost: safe(line.materialCost),
      laborCost: round4(wanted / (labFactor * load)),
    };
  }

  // ── Borrow the sheet's own mix. ─────────────────────────────────────
  let sheetMaterial = 0;
  let sheetLabor = 0;
  for (const l of draft.lines) {
    if (l.id === line.id) continue;
    sheetMaterial += safe(l.quantity) * safe(l.materialCost);
    sheetLabor += safe(l.quantity) * safe(l.laborCost);
  }
  const sheetBase = sheetMaterial + sheetLabor;
  if (sheetBase <= 0) {
    return { materialCost: round4(wanted / (matFactor * load)), laborCost: safe(line.laborCost) };
  }

  const matShare = sheetMaterial / sheetBase;
  // wanted = load × (k·matShare·matFactor + k·(1−matShare)·labFactor)
  const k = wanted / (load * (matShare * matFactor + (1 - matShare) * labFactor));
  return {
    materialCost: round4(k * matShare),
    laborCost: round4(k * (1 - matShare)),
  };
}

/** Every figure the page prints, from the whole draft, in one pass. */
export function computeTotals(draft: MarginDraft): Totals {
  const m = draft.markups;
  const laborOnly = draft.options.laborOnly;

  let baseMaterials = 0;
  let baseLabor = 0;
  for (const line of draft.lines) {
    const { material, labor } = unitCost(line, laborOnly);
    baseMaterials += safe(line.quantity) * material;
    baseLabor += safe(line.quantity) * labor;
  }
  baseMaterials = round2(baseMaterials);
  baseLabor = round2(baseLabor);

  const materialsAfter = round2(baseMaterials * (1 + safe(m.materialMarkupPct) / 100));
  const laborAfter = round2(baseLabor * (1 + safe(m.laborMarkupPct) / 100));

  const subtotalCosts = round2(materialsAfter + laborAfter);
  const overheadAmount = round2(subtotalCosts * (safe(m.overheadPct) / 100));
  const subtotalWithOverhead = round2(subtotalCosts + overheadAmount);
  const profitAmount = round2(subtotalWithOverhead * (safe(m.profitPct) / 100));
  const grandTotal = round2(subtotalWithOverhead + profitAmount);

  const tax = round2(grandTotal * (safe(draft.taxPct) / 100));
  const contractTotal = round2(grandTotal + tax);

  const baseCost = round2(baseMaterials + baseLabor);
  const margin = grandTotal > 0 ? round2(((grandTotal - baseCost) / grandTotal) * 100) : 0;

  // ── Per-line sell, penny-reconciled ──────────────────────────────────
  // Rounding each line independently leaves the preview column a cent or two
  // off the grand total it sits under, and on a page whose entire argument is
  // "one number" that reads as a bug. So the last PRICED line absorbs the
  // rounding drift, exactly the way an estimator squares a sheet by hand.
  const load = loadFactor(m);
  const raw = draft.lines.map((line) => ({
    id: line.id,
    sell: round2(safe(line.quantity) * unitAfterMarkup(line, m, laborOnly) * load),
  }));
  const lastPriced = (() => {
    for (let i = raw.length - 1; i >= 0; i -= 1) if (raw[i].sell > 0) return i;
    return -1;
  })();
  if (lastPriced >= 0) {
    const others = raw.reduce((sum, r, i) => (i === lastPriced ? sum : sum + r.sell), 0);
    raw[lastPriced].sell = round2(grandTotal - others);
  }

  const perLine = raw.map((r) => ({
    id: r.id,
    sell: r.sell,
    share: contractTotal > 0 ? round2((r.sell / contractTotal) * 100) : 0,
  }));

  return {
    baseMaterials,
    baseLabor,
    baseCost,
    materialsAfter,
    laborAfter,
    materialMarkupAdded: round2(materialsAfter - baseMaterials),
    laborMarkupAdded: round2(laborAfter - baseLabor),
    subtotalCosts,
    overheadAmount,
    subtotalWithOverhead,
    profitAmount,
    grandTotal,
    tax,
    contractTotal,
    margin,
    perLine,
  };
}

/**
 * The five bands the contract total is made of. Mutually exclusive, and they
 * sum to contractTotal — which is the only reason the composition bar and the
 * per-card contribution percentages are allowed to exist. A decomposition that
 * did not add up would be decoration.
 */
export function composition(t: Totals): Composition {
  return {
    cost: t.baseCost,
    markup: round2(t.materialMarkupAdded + t.laborMarkupAdded),
    overhead: t.overheadAmount,
    profit: t.profitAmount,
    tax: t.tax,
  };
}

/** A band's share of the contract total, 0–100. */
export function share(part: number, whole: number): number {
  return whole > 0 ? round2((part / whole) * 100) : 0;
}

/**
 * How close to the target still counts as landing on it.
 *
 * A DOLLAR, not a cent, and the reason is the solve below. Profit is a
 * percentage the contractor can actually read and retype, so it is rounded to
 * one hundredth of a percent — and on a $19,500 job one hundredth of a percent
 * is about 65 cents. With a one-cent tolerance the flagship interaction would
 * end with the page reporting "over by $0.65" in the danger register, which
 * makes a rounding remainder look like a failure. A dollar on a five-figure
 * contract is 0.005%: below the precision of every input feeding it.
 */
export const TARGET_SLACK = 1;

/** Where the job stands against the number it has to hit. */
export function reconcile(target: number | null, contractTotal: number): Reconciliation {
  if (target === null || !Number.isFinite(target) || target <= 0) return { kind: "none" };
  const gap = round2(target - contractTotal);
  if (Math.abs(gap) < TARGET_SLACK) return { kind: "onTarget", target };
  if (gap > 0) return { kind: "short", target, gap };
  return { kind: "over", target, gap: Math.abs(gap) };
}

/**
 * The honest solve. Given a target contract total, what PROFIT percentage
 * lands on it exactly?
 *
 *   target = (subtotal + overhead) × (1 + p) × (1 + tax)
 *   ⇒  p = target / ((subtotal + overhead) × (1 + tax)) − 1
 *
 * Computed on every render and NEVER applied on its own — the contractor
 * presses Apply, or the number stays where they put it. A suggestion that
 * moved the price silently would be the exact opposite of this page's point.
 */
export function solveProfit(target: number | null, t: Totals, taxPct: number): ProfitSolve {
  if (target === null || !Number.isFinite(target) || target <= 0) {
    return { kind: "unavailable", reason: "Set a target and this works out the profit that reaches it." };
  }
  if (t.subtotalWithOverhead <= 0) {
    return { kind: "unavailable", reason: "Price some line items first — there is no cost base to load profit onto." };
  }
  const withTax = t.subtotalWithOverhead * (1 + safe(taxPct) / 100);
  const pct = round2((target / withTax - 1) * 100);
  if (pct < 0) {
    return {
      kind: "unavailable",
      reason: "The target is below what this job already costs with tax. Profit cannot go negative — cut cost or raise the target.",
    };
  }
  if (pct > LOAD_MAX) return { kind: "outOfRange", profitPct: pct, max: LOAD_MAX };
  return { kind: "ready", profitPct: pct };
}

/** One installment resolved to dollars against the contract total. */
export function installmentValue(inst: Installment, contractTotal: number): number {
  return round2(
    inst.isPercent ? (contractTotal * safe(inst.amount)) / 100 : safe(inst.amount),
  );
}

/** How much of the contract total the schedule accounts for, in dollars. */
export function coveredAmount(installments: Installment[], contractTotal: number): number {
  return round2(
    installments.reduce((sum, i) => sum + installmentValue(i, contractTotal), 0),
  );
}

/**
 * Does the schedule add up, and by how much does it miss?
 *
 * ONE function, because the coverage meter, the card head's tag and the card
 * summary all answer this and three copies would eventually disagree.
 *
 * The slack is a cent PER INSTALLMENT, not a flat cent. Each percentage
 * installment is rounded to the nearest cent independently, so a 30/30/40
 * split of $16,896.85 legitimately lands a cent short of it — and with a flat
 * one-cent tolerance the seeded, deliberately-correct schedule would open in
 * the warning register reading "$0.01 unscheduled", which teaches a contractor
 * to ignore the one meter on the page whose entire job is being believed.
 */
export function coverageState(
  installments: Installment[],
  contractTotal: number,
): { covered: number; gap: number; state: "exact" | "under" | "over" } {
  const covered = coveredAmount(installments, contractTotal);
  const gap = round2(contractTotal - covered);
  const slack = 0.01 * Math.max(1, installments.length);
  if (Math.abs(gap) <= slack) return { covered, gap, state: "exact" };
  return { covered, gap, state: gap > 0 ? "under" : "over" };
}

/** US money for display. Always paired with `font-variant-numeric: tabular-nums`
 *  so the digit columns line up like an estimate sheet. */
export function money(n: number): string {
  return safe(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** `$16,897` — whole dollars, for the places where cents are noise (a target
 *  a contractor says out loud, a band label on the composition bar). */
export function money0(n: number): string {
  return `$${Math.round(safe(n)).toLocaleString("en-US")}`;
}

/** A percentage with no trailing-zero noise — 18%, 10.35%, 0%. */
export function pct(n: number): string {
  const v = safe(n);
  return `${Number.isInteger(v) ? v : round2(v)}%`;
}

/** A percentage always to one decimal — the ledger's markup rows print this
 *  way in the live builder ("+ Materials markup (18.0%)") and the parity is
 *  worth keeping. */
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

/** Lower-case unit wording for the client's copy — "2,850 sq ft", not "SQFT". */
export const UNIT_LABEL: Record<Unit, string> = {
  SQFT: "sq ft",
  LINEAR_FT: "linear ft",
  CUBIC_FT: "cubic ft",
  UNIT: "unit",
  HOUR: "hour",
  LUMP_SUM: "lump sum",
};

/** Quantities read as measurements, not money: thousands separated, and up to
 *  two decimals only when the number actually has them. */
export function qty(n: number): string {
  return safe(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** The material / labor split of one line, as a ratio the row can print. */
export function mixRatio(line: Line): string {
  const material = safe(line.materialCost);
  const labor = safe(line.laborCost);
  const sum = material + labor;
  if (sum <= 0) return "no cost split yet";
  const mp = Math.round((material / sum) * 100);
  return `${mp}% material · ${100 - mp}% labor`;
}

// Ids must survive a reorder, a delete and an insert, so they cannot be array
// indices. A module-scoped counter is enough: these never leave the client and
// never reach a database. The `mc_` prefix matches the fixture's, so a row
// added at runtime is as obviously fake as a seeded one.
let seq = 0;
export function newId(prefix: string): string {
  seq += 1;
  return `mc_${prefix}_${seq}`;
}

/** True when the browser has been asked to keep still. Read at call time, not
 *  cached, so a mid-session preference change is respected. */
export function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
