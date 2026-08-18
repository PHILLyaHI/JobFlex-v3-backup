// THE SMART PROPOSAL CONSOLE MODEL
//
// One line-item shape, one set of totals, one materials-request derivation —
// shared by the desktop console (components/v3/advanced-ai-blueprint) and the
// handheld studio (app/(mobile)/mobile-advanced-ai-v2).
//
// WHY IT EXISTS
//
// Both surfaces were ported from a static blueprint and each invented its own
// row type: desktop `{id, n, q, u}`, mobile `{id, name, qty, unit, price, link}`.
// Neither could carry the product metadata the AI estimator actually returns
// (store / productUrl / imageUrl / dimensions), which is why the Materials
// request was a hardcoded fixture on one surface and absent on the other. Two
// shapes also meant two totals implementations, and they had already drifted —
// desktop subtracted a constant $150 "discount" that no input controlled.
//
// This module is pure and client-safe: no DB, no server-only imports, no React.
// It is the contract between the AI actions in `actions/advancedEstimator` and
// whatever renders them.

import type { EstimateDiscount, GeneratedEstimate } from "@/lib/estimatorSchema";

export type LineGroup = "materials" | "labor";

// ── The intake gate's answers ───────────────────────────────────────────────

/** One clarifying question and what the contractor typed or picked for it. */
export type ClarifyAnswer = { question: string; answer: string };

/**
 * Fold the clarifying answers back into the brief.
 *
 * `analyzeEstimatePrompt` asks the questions but has nowhere to put the
 * answers — `generateAdvancedEstimate` takes a single `description` string and
 * nothing else. So the answers become more brief, appended as a labelled block
 * the planner reads as part of the job description. Both surfaces must compose
 * it identically or the same job, answered the same way, prices differently on
 * a phone than on a desk.
 *
 * The appended text is also what gets stored as the brief the refine card works
 * against, so a later "change the estimate" sees the answers too.
 */
export function briefWithAnswers(brief: string, answers: ClarifyAnswer[]): string {
  const pairs = answers
    .map((a) => ({ q: a.question.trim(), a: a.answer.trim() }))
    .filter((p) => p.q && p.a);
  if (pairs.length === 0) return brief;
  return `${brief.trim()}\n\nAdditional detail:\n${pairs
    .map((p) => `- ${p.q} → ${p.a}`)
    .join("\n")}`;
}

/**
 * One editable row in either ledger.
 *
 * `price` is what the client is billed per unit and is always the source of
 * truth for money. `retailPrice` is what the live product search actually
 * returned and never changes when the contractor edits `price` — that is the
 * whole point: the Materials request keeps showing the real shelf price with
 * the override beside it, instead of silently claiming Home Depot sells it for
 * whatever was typed.
 */
export type ConsoleLine = {
  id: string;
  group: LineGroup;
  name: string;
  qty: number;
  /** Labor unit or purchase package — see UNIT_OPTIONS. Free text is allowed. */
  unit: string;
  /** Billed unit price. Edited freely. */
  price: number;
  /** The price the live search returned, or null when the line was never shopped. */
  retailPrice: number | null;
  store?: string;
  productUrl?: string;
  imageUrl?: string;
  dimensions?: string;
  notes?: string;
  /** "Updated" / "Added" after a refine, cleared by Undo. */
  badge?: string;
};

/**
 * The unit choices offered in the ledger's unit field.
 *
 * Labor is billed per hour / per day / per job as often as it is billed by
 * area, and the old "Qty" column forced everything into a bare number with no
 * stated unit, so "8" could mean eight hours or eight square feet. Materials
 * keep package units because that is how they are actually bought.
 */
export const LABOR_UNITS = ["hour", "day", "job", "crew day", "sqft", "ln ft", "each"] as const;
export const MATERIAL_UNITS = ["each", "box", "sheet", "roll", "bag", "gal", "sqft", "ln ft"] as const;

export function unitOptionsFor(group: LineGroup): readonly string[] {
  return group === "labor" ? LABOR_UNITS : MATERIAL_UNITS;
}

// ── Identity ────────────────────────────────────────────────────────────────
// Ids survive the refine round-trip (lineSchema.id) so the AI can edit a line
// by identity instead of by name — renaming a line must not re-shop it.

let idSeq = 0;
export function newLineId(prefix = "l"): string {
  idSeq += 1;
  return `${prefix}${idSeq}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Conversion to and from the AI estimate shape ────────────────────────────

function toLine(
  raw: GeneratedEstimate["materials"][number],
  group: LineGroup,
  index: number,
): ConsoleLine {
  const price = Number.isFinite(raw.unitPrice) ? raw.unitPrice : 0;
  return {
    id: raw.id || `${group === "labor" ? "l" : "m"}${index + 1}-${newLineId("x")}`,
    group,
    name: raw.name,
    qty: Number.isFinite(raw.quantity) ? raw.quantity : 0,
    unit: raw.unit ?? (group === "labor" ? "job" : "each"),
    price,
    // A material that came back with a real store match was priced from that
    // listing, so its arriving unitPrice IS the retail price. Labor never has
    // one, and neither does a material the search could not resolve.
    retailPrice: group === "materials" && raw.store ? price : null,
    store: raw.store,
    productUrl: raw.productUrl,
    imageUrl: raw.imageUrl,
    dimensions: raw.dimensions,
    notes: raw.notes,
  };
}

/** Flatten a generated estimate into the single ordered ledger both UIs render. */
export function linesFromEstimate(est: GeneratedEstimate): ConsoleLine[] {
  return [
    ...est.materials.map((m, i) => toLine(m, "materials", i)),
    ...est.labor.map((l, i) => toLine(l, "labor", i)),
  ];
}

/**
 * Rebuild the AI shape from the edited ledger — the input to `refineAdvancedEstimate`,
 * `saveEstimate` and `convertEstimateToProposal`.
 *
 * The contractor's edited `price` is what goes out, not `retailPrice`: the
 * proposal must bill what the console showed. `retailPrice` is a console-only
 * concept and deliberately has nowhere to go in the schema.
 */
export function estimateFromLines(
  lines: ConsoleLine[],
  base: Pick<GeneratedEstimate, "title" | "scope" | "assumptions"> & {
    estimatedTimelineDays?: number;
    discount?: EstimateDiscount | null;
  },
): GeneratedEstimate {
  const pack = (l: ConsoleLine) => ({
    id: l.id,
    name: l.name,
    quantity: l.qty,
    unitPrice: l.price,
    unit: l.unit || undefined,
    store: l.store,
    productUrl: l.productUrl,
    imageUrl: l.imageUrl,
    dimensions: l.dimensions,
    notes: l.notes,
  });
  return {
    title: base.title,
    scope: base.scope,
    assumptions: base.assumptions,
    estimatedTimelineDays: base.estimatedTimelineDays,
    discount: base.discount ?? null,
    materials: lines.filter((l) => l.group === "materials").map(pack),
    labor: lines.filter((l) => l.group === "labor").map(pack),
  };
}

/**
 * Merge a refined estimate back into the ledger.
 *
 * Matching is by id so a line the AI renamed keeps its identity — and keeps the
 * `retailPrice` it was shopped at, unless the refine actually re-shopped it
 * (the server nulls and re-attaches store/link/image on any changed line, so a
 * new `store` value means a new match and a new retail price).
 */
export function mergeRefined(previous: ConsoleLine[], refined: GeneratedEstimate): ConsoleLine[] {
  const before = new Map(previous.map((l) => [l.id, l]));
  return linesFromEstimate(refined).map((next) => {
    const old = before.get(next.id);
    if (!old) return { ...next, badge: "Added" };
    const reshopped = next.store != null && next.store !== old.store;
    const changed = next.qty !== old.qty || next.price !== old.price || next.name !== old.name;
    return {
      ...next,
      retailPrice: reshopped ? next.retailPrice : (old.retailPrice ?? next.retailPrice),
      badge: reshopped || changed ? "Updated" : undefined,
    };
  });
}

// ── Money ───────────────────────────────────────────────────────────────────

export function lineTotal(l: ConsoleLine): number {
  return (Number(l.qty) || 0) * (Number(l.price) || 0);
}

export function sumGroup(lines: ConsoleLine[], group: LineGroup): number {
  return lines.reduce((n, l) => (l.group === group ? n + lineTotal(l) : n), 0);
}

/** Order-level discount as the console holds it. Mirrors `EstimateDiscount`. */
export type DiscountState = { mode: "pct" | "amt"; value: number };

export const NO_DISCOUNT: DiscountState = { mode: "pct", value: 0 };

export function discountToSchema(d: DiscountState): EstimateDiscount | null {
  if (!d.value || d.value <= 0) return null;
  return { label: "Discount", amount: d.value, isPercent: d.mode === "pct" };
}

export function discountFromSchema(d: EstimateDiscount | null | undefined): DiscountState {
  if (!d) return NO_DISCOUNT;
  return { mode: d.isPercent ? "pct" : "amt", value: d.amount };
}

export type TotalsInput = {
  lines: ConsoleLine[];
  discount?: DiscountState;
  /** Percent, e.g. 6.5. Seeded from the state, overridable. */
  taxPct?: number;
  /** Percent uplift on cost, handheld only. Omit on desktop. */
  marginPct?: number;
};

export type Totals = {
  materials: number;
  labor: number;
  /** materials + labor, before margin. */
  subtotal: number;
  marginCash: number;
  /** subtotal + margin — what the client is quoted before discount and tax. */
  clientPrice: number;
  discountCash: number;
  /** clientPrice − discount. The figure tax is charged on. */
  taxable: number;
  taxCash: number;
  total: number;
};

/**
 * The one place the money chain is defined: cost → margin → discount → tax.
 *
 * Tax lands on the discounted price because that is what the customer actually
 * pays for, and margin lands before the discount because a discount is given
 * off the quoted price, not off cost.
 */
export function computeTotals({ lines, discount, taxPct, marginPct }: TotalsInput): Totals {
  const materials = sumGroup(lines, "materials");
  const labor = sumGroup(lines, "labor");
  const subtotal = materials + labor;
  const marginCash = subtotal * ((Number(marginPct) || 0) / 100);
  const clientPrice = subtotal + marginCash;
  const d = discount ?? NO_DISCOUNT;
  const rawDiscount = d.mode === "pct" ? clientPrice * ((Number(d.value) || 0) / 100) : Number(d.value) || 0;
  // A discount can be typed larger than the job; it may zero the price, never invert it.
  const discountCash = Math.min(Math.max(rawDiscount, 0), clientPrice);
  const taxable = clientPrice - discountCash;
  const taxCash = taxable * ((Number(taxPct) || 0) / 100);
  return {
    materials,
    labor,
    subtotal,
    marginCash,
    clientPrice,
    discountCash,
    taxable,
    taxCash,
    total: taxable + taxCash,
  };
}

// ── Materials request ───────────────────────────────────────────────────────

/**
 * One shoppable row, derived from the ledger rather than stored beside it.
 *
 * Deriving is what makes the request card reactive: deleting a line removes its
 * row, changing a quantity moves its buy quantity and its total, and adding a
 * line shows up immediately as unshopped. There is nothing to keep in sync
 * because there is no second copy.
 */
export type MaterialRequestRow = {
  id: string;
  name: string;
  qty: number;
  unit: string;
  /** The billed unit price — what the contractor typed, if they typed one. */
  unitPrice: number;
  /** The live retail price this line was matched at, when it was shopped. */
  retailUnitPrice: number | null;
  /** True when the billed price no longer equals the retail price. */
  overridden: boolean;
  /** qty × billed unit price. */
  total: number;
  store?: string;
  productUrl?: string;
  imageUrl?: string;
  dimensions?: string;
  /** False for a hand-added line the search has never seen. */
  shopped: boolean;
};

/**
 * Build the Materials request from the live ledger.
 *
 * Labor never appears — it carries no product and nothing to buy. Zero-quantity
 * lines are kept: a contractor zeroing a quantity is deciding not to buy it
 * *yet*, and dropping the row would lose the retail match they would need to
 * put it back.
 */
export function materialsRequest(lines: ConsoleLine[]): MaterialRequestRow[] {
  return lines
    .filter((l) => l.group === "materials")
    .map((l) => {
      const price = Number(l.price) || 0;
      const retail = l.retailPrice;
      return {
        id: l.id,
        name: l.name,
        qty: Number(l.qty) || 0,
        unit: l.unit,
        unitPrice: price,
        retailUnitPrice: retail,
        // Float noise from a percentage refine must not read as a manual override.
        overridden: retail != null && Math.abs(retail - price) > 0.005,
        total: lineTotal(l),
        store: l.store,
        productUrl: l.productUrl,
        imageUrl: l.imageUrl,
        dimensions: l.dimensions,
        shopped: Boolean(l.store || l.productUrl),
      };
    });
}

/** What the Materials request card totals: the buy-side cost, not the client price. */
export function materialsRequestTotal(rows: MaterialRequestRow[]): number {
  return rows.reduce((n, r) => n + r.total, 0);
}
