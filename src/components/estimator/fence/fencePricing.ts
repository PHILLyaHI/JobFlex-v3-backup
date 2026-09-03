// Pricing matrix for the fence studio. Pure, deterministic, no env/network — the
// live sandbox price runs through here on every toolbelt change (must be instant,
// so OpenAI/`estimateFence` is NOT on this path; it is reused only at export).
//
// Every rate is contractor-editable at runtime via a FencePricingConfig (persisted
// in the studio store). The constants below are only the DEFAULTS that seed a fresh
// rate card; nothing hardcodes them into the math. Labels for CUSTOM materials /
// openings resolve through the optional FenceLabels resolver.
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
}

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
    slopeMult: { racked: 1.0, stepped: 1.0 },
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
   *  `gradeLenFt` supersedes `lengthFt`; racked/stepped are grade footage. */
  terrain?: { gradeLenFt: number; rackedFt: number; steppedFt: number } | null;
}

export interface FencePriceLine {
  label: string;
  amount: number;
}

export interface FencePriceResult {
  total: number;
  base: number;
  gatesCost: number;
  demoCost: number;
  perFoot: number;
  breakdown: FencePriceLine[];
}

// Total = (Length × MaterialPerFt × HeightMultiplier)
//       + Σ openingPrice(opening)
//       + DemolitionFee
export function priceFence(
  i: FencePriceInput,
  pricing: FencePricingConfig = defaultPricing(),
  labels?: FenceLabels,
): FencePriceResult {
  const len = Math.max(0, i.lengthFt);
  const agg = aggregateOpenings(i.openings ?? [], pricing, labels);
  const perFt = materialRate(pricing, i.material) * heightMultiplier(i.height);
  const base = len * perFt;
  const gatesCost = agg.reduce((s, e) => s + e.amount, 0);
  const demoCost = i.demolition ? len * pricing.demolitionPerFt : 0;
  const total = base + gatesCost + demoCost;
  const perFoot = len > 0 ? total / len : 0;

  const breakdown: FencePriceLine[] = [
    { label: `${materialName(i.material, labels)} · ${fmtHeight(i.height)} ft · ${Math.round(len)} lf`, amount: base },
  ];
  for (const e of agg) breakdown.push({ label: `${e.label} × ${e.n}`, amount: e.amount });
  if (demoCost > 0) breakdown.push({ label: "Demolition & haul-away", amount: demoCost });

  return { total, base, gatesCost, demoCost, perFoot, breakdown };
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

const round2 = (n: number) => Math.round(n * 100) / 100;

// Turn a price input into proposal-ready line items. Shape matches
// convertFenceEstimateToProposal's schema ({name, quantity, unitPrice, unit?}).
// Installed base is split material/labor ~55/45; each opening type and demolition
// become their own lines so the proposal reads clearly. "ln ft" maps to LINEAR_FT.
export function buildFenceLineItems(
  i: FencePriceInput,
  pricing: FencePricingConfig = defaultPricing(),
  labels?: FenceLabels,
): FenceLineItems {
  // Measured terrain bills the along-grade footage; a flat (or unmeasured)
  // fence keeps the plan length — the two are the same number on level ground.
  const t = i.terrain;
  const len = Math.max(0, Math.round((t ? t.gradeLenFt : i.lengthFt) * 10) / 10);
  const perFt = materialRate(pricing, i.material) * heightMultiplier(i.height);

  const materials: FenceExportLine[] = [
    {
      name: `${materialName(i.material, labels)} fence material · ${fmtHeight(i.height)} ft`,
      quantity: len,
      unitPrice: round2(perFt * 0.55),
      unit: "ln ft",
    },
  ];
  const labor: FenceExportLine[] = [];
  const rackedFt = t ? Math.round(Math.max(0, t.rackedFt) * 10) / 10 : 0;
  const steppedFt = t ? Math.round(Math.max(0, t.steppedFt) * 10) / 10 : 0;
  if (rackedFt >= 0.1 || steppedFt >= 0.1) {
    // Sloped footage installs differently and says so on its own line; the
    // multipliers live on the rate card (default 1.0 — a callout, not a fee).
    const rMult = pricing.slopeMult?.racked ?? 1;
    const sMult = pricing.slopeMult?.stepped ?? 1;
    const levelFt = Math.round(Math.max(0, len - rackedFt - steppedFt) * 10) / 10;
    if (levelFt >= 0.1) {
      labor.push({
        name: "Install labor · layout, post-setting, panels",
        quantity: levelFt,
        unitPrice: round2(perFt * 0.45),
        unit: "ln ft",
      });
    }
    if (rackedFt >= 0.1) {
      labor.push({
        name: "Install labor · racked sections (panels follow the grade)",
        quantity: rackedFt,
        unitPrice: round2(perFt * 0.45 * rMult),
        unit: "ln ft",
      });
    }
    if (steppedFt >= 0.1) {
      labor.push({
        name: "Install labor · stepped sections (stair-stepped panels)",
        quantity: steppedFt,
        unitPrice: round2(perFt * 0.45 * sMult),
        unit: "ln ft",
      });
    }
  } else {
    labor.push({
      name: "Install labor · layout, post-setting, panels",
      quantity: len,
      unitPrice: round2(perFt * 0.45),
      unit: "ln ft",
    });
  }
  for (const e of aggregateOpenings(i.openings ?? [], pricing, labels)) {
    materials.push({ name: `${e.label} + hardware`, quantity: e.n, unitPrice: e.unit, unit: "ea" });
  }
  if (i.demolition) {
    labor.push({
      name: "Remove & haul existing fence",
      quantity: len,
      unitPrice: pricing.demolitionPerFt,
      unit: "ln ft",
    });
  }
  return { materials, labor };
}
