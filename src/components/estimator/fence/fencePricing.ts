// Pricing matrix for the fence studio. Pure, deterministic, no env/network — the
// live sandbox price runs through here on every toolbelt change (must be instant,
// so OpenAI/`estimateFence` is NOT on this path; it is reused only at export).
//
// Every rate is contractor-editable at runtime via a FencePricingConfig (persisted
// in the studio store). The constants below are only the DEFAULTS that seed a fresh
// rate card; nothing hardcodes them into the math. Labels for CUSTOM materials /
// openings resolve through the optional FenceLabels resolver.
import { baysForRuns, PICKET_PITCH_FT, POST_SPACING_FT, postsForRuns } from "./fenceGeometry";
import { LEVEL_MAX_DEG, RACKED_MAX_DEG } from "./fenceTerrain";
import {
  MATERIAL_LABEL,
  VARIANT_LABEL,
  type FenceMaterial,
  type MaterialId,
  type FenceHeightFt,
  type OpeningKind,
  type OpeningVariant,
} from "./fenceTypes";

// $/linear-ft installed base price per built-in material (before the height mult).
export const MATERIAL_BASE_PRICE: Record<FenceMaterial, number> = {
  cedar: 28,
  vinyl: 40,
  "chain-link": 18,
  aluminum: 55,
  composite: 48,
};

export const GATE_PREMIUM = 350; // single walk gate
export const DEMOLITION_FEE_PER_FT = 6; // teardown + haul, per linear foot

// Installed price per opening, by kind + variant.
export const OPENING_PRICE: Record<OpeningKind, Record<string, number>> = {
  gate: { single: GATE_PREMIUM, double: 850, triple: 1150, arched: 600 },
  door: { solid: 280, slatted: 340 },
};

// The full, editable rate card. Keyed by MATERIAL / VARIANT ID so custom entries
// slot in beside the built-ins.
export interface FencePricingConfig {
  materialPerFt: Record<string, number>; // $ / linear ft (before height multiplier)
  openingPrice: Record<OpeningKind, Record<string, number>>; // $ / each
  demolitionPerFt: number; // $ / linear ft
  /** Labor difficulty multipliers for sloped footage (1.0 = no surcharge).
   *  Optional so rate cards persisted before terrain existed stay valid. */
  slopeMult?: { racked: number; stepped: number };
  /**
   * Permit and inspection, $ fixed, and final cleanup / haul-away, $ per
   * linear ft. Both OPTIONAL and both absent means NOT BILLED — a rate card
   * assembled by hand (the blueprint page builds one per convert) prices
   * exactly what it did before these lines existed.
   */
  permitFee?: number;
  cleanupPerFt?: number;
}

/** Permit and cleanup defaults for a fresh rate card (editable per shop). */
export const PERMIT_FEE = 250;
export const CLEANUP_PER_FT = 0.35;
/** Sloped-install labor defaults: racked panels are slower, stepped slower still. */
export const SLOPE_MULT = { racked: 1.25, stepped: 1.4 };

// A fresh rate card seeded from the defaults (deep-cloned so edits never mutate the
// module constants or leak between store instances).
export function defaultPricing(): FencePricingConfig {
  return {
    materialPerFt: { ...MATERIAL_BASE_PRICE },
    openingPrice: {
      gate: { ...OPENING_PRICE.gate },
      door: { ...OPENING_PRICE.door },
    },
    demolitionPerFt: DEMOLITION_FEE_PER_FT,
    slopeMult: { ...SLOPE_MULT },
    permitFee: PERMIT_FEE,
    cleanupPerFt: CLEANUP_PER_FT,
  };
}

// Resolvers for CUSTOM display labels — callers that know the custom catalog pass
// these so the breakdown reads "Redwood" / "Barn gate" instead of a raw id.
export interface FenceLabels {
  material?: string; // display name for the current material
  opening?: (kind: OpeningKind, variant: OpeningVariant) => string; // per-opening label
}

// Height → per-ft multiplier, anchored at 6 ft = 1.0. Piecewise-linear through the
// reference table so ANY custom height gets a sensible price, extrapolated linearly
// past the ends. A taller fence costs more material + labor per foot.
const HEIGHT_ANCHORS: Array<[number, number]> = [
  [4, 0.78],
  [6, 1.0],
  [7, 1.18],
  [8, 1.4],
];

export function heightMultiplier(hRaw: number): number {
  const h = Number.isFinite(hRaw) && hRaw > 0 ? hRaw : 6;
  const A = HEIGHT_ANCHORS;
  if (h <= A[0][0]) {
    const [x0, y0] = A[0];
    const [x1, y1] = A[1];
    return Math.max(0.3, y0 + ((h - x0) * (y1 - y0)) / (x1 - x0));
  }
  for (let i = 0; i < A.length - 1; i++) {
    const [x0, y0] = A[i];
    const [x1, y1] = A[i + 1];
    if (h <= x1) return y0 + ((h - x0) * (y1 - y0)) / (x1 - x0);
  }
  const [x0, y0] = A[A.length - 2];
  const [x1, y1] = A[A.length - 1];
  return y1 + ((h - x1) * (y1 - y0)) / (x1 - x0);
}

export type OpeningLite = { kind: OpeningKind; variant: OpeningVariant };

function openingPrice(o: OpeningLite, pricing: FencePricingConfig): number {
  // Rate card first; then the built-in seed (covers carts persisted before a
  // variant existed, e.g. `triple`); then the generic gate premium.
  return pricing.openingPrice[o.kind]?.[o.variant] ?? OPENING_PRICE[o.kind]?.[o.variant] ?? GATE_PREMIUM;
}

function openingLabel(o: OpeningLite, labels?: FenceLabels): string {
  const name = labels?.opening?.(o.kind, o.variant) ?? VARIANT_LABEL[o.variant] ?? o.variant;
  return `${name} ${o.kind}`;
}

// Group openings by kind+variant → display label, count, unit price, line total.
function aggregateOpenings(openings: OpeningLite[], pricing: FencePricingConfig, labels?: FenceLabels) {
  const m = new Map<string, { label: string; n: number; unit: number; amount: number }>();
  for (const o of openings) {
    const key = `${o.kind}:${o.variant}`;
    const unit = openingPrice(o, pricing);
    const e = m.get(key) ?? { label: openingLabel(o, labels), n: 0, unit, amount: 0 };
    e.n += 1;
    e.amount += unit;
    e.unit = unit; // keep the latest unit price (edits apply live)
    m.set(key, e);
  }
  return [...m.values()];
}

function materialRate(pricing: FencePricingConfig, material: MaterialId): number {
  // Fall back to the built-in default if a persisted card predates a material, so
  // the total stays a real number rather than NaN.
  return pricing.materialPerFt[material] ?? MATERIAL_BASE_PRICE[material as FenceMaterial] ?? 0;
}

function materialName(material: MaterialId, labels?: FenceLabels): string {
  return labels?.material ?? MATERIAL_LABEL[material as FenceMaterial] ?? material;
}

// A round number that stays readable for custom (non-integer) heights.
function fmtHeight(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

export interface FencePriceInput {
  lengthFt: number;
  height: FenceHeightFt;
  material: MaterialId;
  openings: OpeningLite[];
  demolition: boolean;
  /** Measured ground (fenceTerrain): when present, every footage-priced line
   *  bills the ALONG-GRADE length and the labor splits by install method.
   *  `gradeLenFt` supersedes `lengthFt`; racked/stepped are grade footage.
   *  `rackedAvgDeg` and `steps` sharpen the slope multiplier when known. */
  terrain?: { gradeLenFt: number; rackedFt: number; steppedFt: number; rackedAvgDeg?: number; steps?: number } | null;
  /** Plan feet per run — what the bill of materials counts posts and bays from.
   *  Absent: the whole length is treated as one run. */
  runsFt?: readonly number[];
  /** Counts straight from the drawn layout (computeFenceLayout). These WIN over
   *  runsFt, so the estimate's posts are the posts standing in the 3D view. */
  layout?: { postCount: number; bayCount: number } | null;
}

export interface FencePriceLine {
  label: string;
  amount: number;
}

/** One estimate line, with the quantity a buyer can order against. */
export interface FenceEstimateLine {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  kind: "material" | "labor";
}

export interface FencePriceResult {
  total: number;
  /** The fence itself - material plus install labor, before extras. */
  base: number;
  gatesCost: number;
  demoCost: number;
  perFoot: number;
  breakdown: FencePriceLine[];
}

export interface FenceExportLine {
  name: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
}

export interface FenceLineItems {
  materials: FenceExportLine[];
  labor: FenceExportLine[];
}

/** The whole estimate: the spec, its two subtotals, and the total they sum to. */
export interface FenceEstimate extends FencePriceResult {
  lines: FenceEstimateLine[];
  materials: FenceExportLine[];
  labor: FenceExportLine[];
  materialSubtotal: number;
  laborSubtotal: number;
  /** The footage every footage-priced line bills: along-grade when measured. */
  billedFt: number;
  planFt: number;
  posts: number;
  gatePosts: number;
  bays: number;
  concreteBags: number;
  /** What a reader needs to know about the quantities above. */
  notes: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Two 60 lb bags per post hole - the trade rule of thumb for a 4x4. */
export const CONCRETE_BAGS_PER_POST = 2;
/** How the installed per-ft rate splits before it is spread over the lines. */
const MATERIAL_SHARE_OF_RATE = 0.55;

/** How a fence of this material is actually built, which decides its bill. */
type FenceBuild = "boards" | "panels" | "chainlink";
const BUILD_BY_MATERIAL: Record<string, FenceBuild> = {
  cedar: "boards",
  composite: "boards",
  vinyl: "panels",
  aluminum: "panels",
  "chain-link": "chainlink",
};
/** A custom material is quoted as a board fence - the most common build. */
function buildOf(material: MaterialId): FenceBuild {
  return BUILD_BY_MATERIAL[material] ?? "boards";
}

/** Rails per bay on a board fence: top, middle and bottom. */
const RAILS_PER_BAY = 3;

/**
 * How the MATERIAL half of the installed rate spreads across the bill of
 * materials. Shares per build, summing to 1 - so the spec's material lines
 * always add up to the rate the contractor set, and a shop that edits its
 * $/ft sees every component follow. The quantities are real; the split is the
 * assumption, and the estimate says so in its notes.
 */
const MATERIAL_SPLIT: Record<FenceBuild, Record<string, number>> = {
  boards: { posts: 0.3, concrete: 0.08, rails: 0.22, infill: 0.4 },
  panels: { posts: 0.34, concrete: 0.09, infill: 0.57 },
  chainlink: { posts: 0.32, concrete: 0.1, rails: 0.2, infill: 0.38 },
};

/**
 * The labor multiplier for sloped footage. Racked panels follow the grade and
 * scale with the angle between LEVEL_MAX_DEG and RACKED_MAX_DEG (fenceTerrain);
 * with no angle reported the card's own figure applies. Stepped runs take the
 * card's stepped figure. A card with no slopeMult bills slope at the level
 * rate, exactly as it did before the multipliers existed.
 */
export function slopeMultiplier(cls: "level" | "racked" | "stepped", pricing: FencePricingConfig, angleDeg?: number): number {
  if (cls === "level") return 1;
  const card = pricing.slopeMult;
  if (!card) return 1;
  if (cls === "stepped") return Math.max(1, card.stepped ?? 1);
  const top = Math.max(1, card.racked ?? 1);
  if (angleDeg == null || !Number.isFinite(angleDeg)) return top;
  const t = Math.max(0, Math.min(1, (angleDeg - LEVEL_MAX_DEG) / (RACKED_MAX_DEG - LEVEL_MAX_DEG)));
  return round2(1 + (top - 1) * t);
}

/** Spread `total` over the given quantities by share, to the cent, exactly. */
function allocate(total: number, parts: Array<{ id: string; share: number; qty: number }>): Record<string, number> {
  const live = parts.filter((p) => p.qty > 0 && p.share > 0);
  const weight = live.reduce((a, p) => a + p.share, 0) || 1;
  const out: Record<string, number> = {};
  let spent = 0;
  live.forEach((p, k) => {
    const amount = k === live.length - 1 ? round2(total - spent) : round2((total * p.share) / weight);
    spent = round2(spent + amount);
    out[p.id] = round2(amount / p.qty);
  });
  return out;
}

/**
 * THE fence estimate - one function behind every surface (audit 2026-09-17).
 *
 * Before this, a fence quote was two lines: "$/ft of fence material" and
 * "$/ft of install labor". Nobody could order from it - no posts, no concrete,
 * no rails, no pickets - and the two entry points disagreed about the footage:
 * the live ticket billed PLAN feet while the proposal billed ALONG-GRADE feet,
 * up to 7% apart on a hillside.
 *
 * Now: one path, one footage (along-grade when the ground was measured), and a
 * real bill of materials whose quantities come from the same geometry the 3D
 * view is built from (POST_SPACING_FT bays, PICKET_PITCH_FT pickets). The
 * total is the sum of the lines, and material and labor carry their own
 * subtotals. Per-unit prices are the contractor's own installed rate spread
 * across the components (MATERIAL_SPLIT), so switching this on re-prices
 * nothing: the rate card stays the single source of price truth. Permit and
 * cleanup bill only when the rate card carries them.
 */
export function buildFenceEstimate(
  i: FencePriceInput,
  pricing: FencePricingConfig = defaultPricing(),
  labels?: FenceLabels,
): FenceEstimate {
  const t = i.terrain ?? null;
  const planFt = Math.max(0, Math.round(Math.max(0, i.lengthFt) * 10) / 10);
  const billedFt = Math.max(0, Math.round(Math.max(0, t ? t.gradeLenFt : i.lengthFt) * 10) / 10);
  const perFt = materialRate(pricing, i.material) * heightMultiplier(i.height);
  const openings = i.openings ?? [];
  const agg = aggregateOpenings(openings, pricing, labels);
  const build = buildOf(i.material);
  const name = materialName(i.material, labels);
  const h = fmtHeight(i.height);

  // The counts, from the geometry the fence is drawn with.
  const runs = i.runsFt && i.runsFt.length ? i.runsFt.filter((r) => r > 0) : planFt > 0 ? [planFt] : [];
  const bays = i.layout?.bayCount ?? baysForRuns(runs);
  const linePosts = i.layout?.postCount ?? postsForRuns(runs);
  const gatePosts = openings.length * 2;
  const posts = linePosts + gatePosts;
  const concreteBags = posts * CONCRETE_BAGS_PER_POST;
  const rails = build === "boards" ? bays * RAILS_PER_BAY : 0;
  const pickets = build === "boards" ? Math.ceil(billedFt / PICKET_PITCH_FT) : 0;

  // The money: the material half of the rate, spread over the bill.
  const matEnvelope = round2(billedFt * perFt * MATERIAL_SHARE_OF_RATE);
  const split = MATERIAL_SPLIT[build];
  const unitOf = allocate(matEnvelope, [
    { id: "posts", share: split.posts, qty: posts },
    { id: "concrete", share: split.concrete, qty: concreteBags },
    { id: "rails", share: split.rails ?? 0, qty: build === "chainlink" ? billedFt : rails },
    { id: "infill", share: split.infill, qty: build === "boards" ? pickets : build === "panels" ? bays : billedFt },
  ]);

  const lines: FenceEstimateLine[] = [];
  const push = (kind: "material" | "labor", lineName: string, quantity: number, lineUnit: string, unitPrice: number) => {
    const q = round2(quantity);
    const p = round2(unitPrice);
    if (!(q > 0) || !(p > 0)) return;
    lines.push({ kind, name: lineName, quantity: q, unit: lineUnit, unitPrice: p, amount: round2(q * p) });
  };

  const postLen = Math.round(Math.max(6, i.height + 2));
  push("material", `Line posts - 4 x 4 x ${postLen} ft, ${POST_SPACING_FT} ft centres`, linePosts, "ea", unitOf.posts ?? 0);
  push("material", "Gate posts - 2 per opening", gatePosts, "ea", unitOf.posts ?? 0);
  push("material", `Concrete - ${CONCRETE_BAGS_PER_POST} bags per post hole`, concreteBags, "ea", unitOf.concrete ?? 0);
  if (build === "boards") {
    push("material", `Rails - ${RAILS_PER_BAY} per bay`, rails, "ea", unitOf.rails ?? 0);
    push("material", `${name} pickets - ${h} ft`, pickets, "ea", unitOf.infill ?? 0);
  } else if (build === "panels") {
    push("material", `${name} panels - ${h} ft x ${POST_SPACING_FT} ft`, bays, "ea", unitOf.infill ?? 0);
  } else {
    push("material", "Top rail", billedFt, "ln ft", unitOf.rails ?? 0);
    push("material", `${name} fabric - ${h} ft`, billedFt, "ln ft", unitOf.infill ?? 0);
  }
  for (const e of agg) push("material", `${e.label} + hardware`, e.n, "ea", e.unit);

  // Labor: the other half of the rate, by how each stretch installs.
  const laborPerFt = perFt * (1 - MATERIAL_SHARE_OF_RATE);
  const rackedFt = t ? Math.max(0, Math.round(t.rackedFt * 10) / 10) : 0;
  const steppedFt = t ? Math.max(0, Math.round(t.steppedFt * 10) / 10) : 0;
  const levelFt = round2(Math.max(0, billedFt - rackedFt - steppedFt));
  const rackedMult = slopeMultiplier("racked", pricing, t?.rackedAvgDeg);
  const steppedMult = slopeMultiplier("stepped", pricing);
  if (rackedFt >= 0.1 || steppedFt >= 0.1) {
    push("labor", "Install labor - layout, post-setting, panels", levelFt, "ln ft", laborPerFt);
    push("labor", `Install labor - racked sections (panels follow the grade)${rackedMult > 1 ? ` x${rackedMult}` : ""}`, rackedFt, "ln ft", laborPerFt * rackedMult);
    push(
      "labor",
      `Install labor - stepped sections (${t?.steps ? `${t.steps} steps, ` : ""}stair-stepped panels)${steppedMult > 1 ? ` x${steppedMult}` : ""}`,
      steppedFt,
      "ln ft",
      laborPerFt * steppedMult,
    );
  } else {
    push("labor", "Install labor - layout, post-setting, panels", billedFt, "ln ft", laborPerFt);
  }
  if (i.demolition) push("labor", "Remove & haul existing fence", billedFt, "ln ft", pricing.demolitionPerFt);
  const cleanupPerFt = pricing.cleanupPerFt ?? 0;
  if (cleanupPerFt > 0) push("labor", "Site cleanup & spoil haul-away", billedFt, "ln ft", cleanupPerFt);
  const permitFee = pricing.permitFee ?? 0;
  if (permitFee > 0) push("labor", "Permit & inspection", 1, "ea", permitFee);

  const materialSubtotal = round2(lines.filter((l) => l.kind === "material").reduce((a, l) => a + l.amount, 0));
  const laborSubtotal = round2(lines.filter((l) => l.kind === "labor").reduce((a, l) => a + l.amount, 0));
  const total = round2(materialSubtotal + laborSubtotal);
  const gatesCost = round2(agg.reduce((a, e) => a + e.amount, 0));
  const demoCost = i.demolition ? round2(billedFt * pricing.demolitionPerFt) : 0;
  const cleanupCost = cleanupPerFt > 0 ? round2(billedFt * cleanupPerFt) : 0;

  const notes: string[] = [];
  if (billedFt > 0) {
    notes.push(
      `${name} fence, ${h} ft tall, ${Math.round(billedFt)} linear ft${t && Math.round(billedFt) !== Math.round(planFt) ? ` along the ground (${Math.round(planFt)} ft on the plan)` : ""}.`,
      `${linePosts} line posts at ${POST_SPACING_FT} ft centres over ${bays} bays${gatePosts ? `, plus ${gatePosts} gate posts` : ""}; ${concreteBags} bags of concrete at ${CONCRETE_BAGS_PER_POST} per hole.`,
      "Component prices are the shop rate spread across the bill of materials; edit any line.",
    );
    if (rackedFt >= 0.1 && rackedMult > 1) notes.push(`${Math.round(rackedFt)} ft racked at x${rackedMult} install labor.`);
    if (steppedFt >= 0.1 && steppedMult > 1) notes.push(`${Math.round(steppedFt)} ft stepped at x${steppedMult} install labor.`);
    if (permitFee <= 0) notes.push("No permit line - set a permit fee on the rate card if the jurisdiction charges one.");
  }

  const breakdown: FencePriceLine[] = lines.map((l) => ({ label: `${l.name} - ${l.quantity} ${l.unit}`, amount: l.amount }));
  const toExport = (l: FenceEstimateLine): FenceExportLine => ({ name: l.name, quantity: l.quantity, unitPrice: l.unitPrice, unit: l.unit });

  return {
    lines,
    materials: lines.filter((l) => l.kind === "material").map(toExport),
    labor: lines.filter((l) => l.kind === "labor").map(toExport),
    materialSubtotal,
    laborSubtotal,
    total,
    base: round2(total - gatesCost - demoCost - cleanupCost - permitFee),
    gatesCost,
    demoCost,
    perFoot: billedFt > 0 ? round2(total / billedFt) : 0,
    breakdown,
    billedFt,
    planFt,
    posts,
    gatePosts,
    bays,
    concreteBags,
    notes,
  };
}

/**
 * The live ticket. The same estimate as the proposal, so the number on screen
 * is the number the client is sent (it used to ignore `terrain` entirely and
 * bill plan footage while the proposal billed along-grade).
 */
export function priceFence(
  i: FencePriceInput,
  pricing: FencePricingConfig = defaultPricing(),
  labels?: FenceLabels,
): FencePriceResult {
  const e = buildFenceEstimate(i, pricing, labels);
  return { total: e.total, base: e.base, gatesCost: e.gatesCost, demoCost: e.demoCost, perFoot: e.perFoot, breakdown: e.breakdown };
}

/**
 * Proposal-ready line items - the same lines, in the conversion's shape
 * ({name, quantity, unitPrice, unit}); "ln ft" maps to LINEAR_FT.
 */
export function buildFenceLineItems(
  i: FencePriceInput,
  pricing: FencePricingConfig = defaultPricing(),
  labels?: FenceLabels,
): FenceLineItems {
  const e = buildFenceEstimate(i, pricing, labels);
  return { materials: e.materials, labor: e.labor };
}
