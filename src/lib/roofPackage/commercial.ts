// Commercial roofing — how the same roof is priced differently when the
// building is a store, a warehouse, a school or an apartment block, and how
// the estimator decides to ASK whether it is one.
//
// THE DATA CANNOT SAY. The aerial response carries no occupancy, use or
// property-class field (checked against the parser and its seen-key
// catalogue, 2026-09-14). So nothing here ever states that a building IS
// commercial. It scores what the roof looks like — size, a flat deck, rooftop
// units, eave height, a big simple shape, a membrane surface, no chimney — and
// when that reads commercial it asks the contractor, whose answer is the only
// thing that prices anything.
//
// COMMERCIAL IS NOT ONLY MORE EXPENSIVE. Field labor per square goes DOWN on a
// big deck (long runs, wide rolls, a bigger crew): 0.92 from 50 squares, 0.85
// from 100, 0.80 from 300 and never lower, applied to the membrane install
// line only — flashing, drains and curbs are hand work that does not scale.
// Materials bought for 150+ squares come in about 7% under the counter price.
// What goes UP is everything around the roofing: mobilization, a safety plan,
// the asbestos survey before a tear-off, a superintendent on a long job,
// prevailing wage or a union scale, off-shift work, a valuation-based permit,
// and the general conditions and insurance a commercial owner requires — the
// last carried as ONE visible line on everything except the fees billed at
// cost, so nobody's membrane rate is silently marked up.

import type { Basis, LineKind, PkgUnit } from "./catalog";
import { familyOfMaterial } from "./catalog";
import { flatBecause } from "./flatRule";
import type { RoofFacts } from "./takeoff";

export type WageRegime = "open" | "union" | "prevailing";
export type Shift = "day" | "evening" | "night";

export const WAGE_REGIMES: Array<{ id: WageRegime; label: string; factor: number }> = [
  { id: "open", label: "Open shop", factor: 1 },
  { id: "union", label: "Union scale", factor: 1.32 },
  { id: "prevailing", label: "Prevailing wage", factor: 1.55 },
];
export const SHIFTS: Array<{ id: Shift; label: string; factor: number }> = [
  { id: "day", label: "Day shift", factor: 1 },
  { id: "evening", label: "Evenings & weekends", factor: 1.45 },
  { id: "night", label: "Night shift", factor: 1.7 },
];
/** Working over a live store or classroom in the daytime. Never stacks with off-shift work. */
export const OCCUPIED_DAY_FACTOR = 1.12;

export const COMMERCIAL_RATE_DEFS = {
  gcPct: { key: "gcPct", label: "General conditions", unit: "%", value: 8 },
  insurancePct: { key: "insurancePct", label: "Commercial insurance", unit: "%", value: 2.5 },
  mobSmall: { key: "mobSmall", label: "Mobilization · under 30 sq", unit: "$", value: 600 },
  mob: { key: "mob", label: "Mobilization", unit: "$", value: 2400 },
  safetyPlan: { key: "safetyPlan", label: "Safety plan", unit: "$", value: 950 },
  asbestos: { key: "asbestos", label: "Asbestos survey", unit: "$", value: 1650 },
  superRate: { key: "superRate", label: "Superintendent", unit: "$/hr", value: 78 },
  interior: { key: "interior", label: "Interior protection", unit: "$/sq ft", value: 0.85 },
  lightTower: { key: "lightTower", label: "Light towers", unit: "$/wk", value: 950 },
  payroll: { key: "payroll", label: "Certified payroll", unit: "$/wk", value: 165 },
  permitBase: { key: "permitBase", label: "Permit base fee", unit: "$", value: 275 },
  permitPct: { key: "permitPct", label: "Permit of job value", unit: "%", value: 1.2 },
  permitMin: { key: "permitMin", label: "Permit minimum", unit: "$", value: 450 },
} as const;
export type CommercialRateKey = keyof typeof COMMERCIAL_RATE_DEFS;
export const COMMERCIAL_RATE_DEFAULTS = Object.fromEntries(
  Object.values(COMMERCIAL_RATE_DEFS).map((d) => [d.key, d.value]),
) as Record<CommercialRateKey, number>;

export interface CommercialSpec {
  on: boolean;
  wage: WageRegime;
  shift: Shift;
  occupied: boolean;
  /** Stories above grade — each above the second adds vertical travel. */
  stories: number;
  /** Payment & performance bond, for public work. */
  bondOn: boolean;
  rates: Record<CommercialRateKey, number>;
}

export function defaultCommercial(on: boolean): CommercialSpec {
  return { on, wage: "open", shift: "day", occupied: false, stories: 1, bondOn: false, rates: { ...COMMERCIAL_RATE_DEFAULTS } };
}

export function cRate(c: CommercialSpec, key: CommercialRateKey): number {
  const v = c.rates?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : COMMERCIAL_RATE_DEFAULTS[key];
}

/** Crew productivity on a large deck, applied to field install labor only. */
export function productivityFactor(squares: number): number {
  if (squares >= 300) return 0.8;
  if (squares >= 100) return 0.85;
  if (squares >= 50) return 0.92;
  return 1;
}
/** Job-lot buying, on the roofing material itself only (not already-wholesale accessories). */
export function jobLotFactor(squares: number): number {
  return squares >= 150 ? 0.93 : 1;
}

// ── The line shape the post-processor works on ──────────────────────────────
export interface TaggedLine {
  name: string;
  quantity: number;
  unit: PkgUnit;
  unitPrice: number;
  kind: LineKind;
  basis: Basis;
  /** Crew hours: wage, shift and story factors apply. */
  wageable?: boolean;
  /** The field install line — the productivity band applies. */
  install?: boolean;
  /** The roofing material itself — the job-lot factor applies. */
  system?: boolean;
  /** A fee billed at cost — no general conditions on it. */
  passThrough?: boolean;
  /** The residential permit lump, replaced by the valuation-based permit. */
  residentialPermit?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const lineTotal = (l: TaggedLine) => l.quantity * l.unitPrice;

/**
 * Re-price a built package as a commercial job, in place. Order matters and
 * is the reviewed order: part factors first, then the added lines, then the
 * general-conditions line on everything that is not a pass-through fee.
 */
export function applyCommercial(
  materials: TaggedLine[],
  labor: TaggedLine[],
  assumptions: string[],
  input: { c: CommercialSpec; squares: number; footprintSqft: number | null; tearOffLayers: number },
): void {
  const { c, squares } = input;
  if (!c.on) return;
  const sq = Math.max(0, squares);
  const prod = productivityFactor(sq);
  const wage = WAGE_REGIMES.find((w) => w.id === c.wage)?.factor ?? 1;
  const shift = c.shift === "day" ? (c.occupied ? OCCUPIED_DAY_FACTOR : 1) : SHIFTS.find((s) => s.id === c.shift)?.factor ?? 1;
  const stories = 1 + 0.03 * Math.max(0, Math.round(c.stories) - 2);
  const crew = wage * shift * stories;
  const lot = jobLotFactor(sq);

  for (const l of labor) {
    if (l.install && prod !== 1) l.unitPrice = round2(l.unitPrice * prod);
    if (l.wageable && crew !== 1) l.unitPrice = round2(l.unitPrice * crew);
  }
  if (lot !== 1) for (const m of materials) if (m.system) m.unitPrice = round2(m.unitPrice * lot);

  // The residential permit lump gives way to the valuation-based one.
  for (let i = labor.length - 1; i >= 0; i--) if (labor[i].residentialPermit) labor.splice(i, 1);

  const days = Math.max(1, Math.ceil(sq / 24));
  const weeks = Math.max(1, Math.ceil(days / 5));
  const area = input.footprintSqft && input.footprintSqft > 0 ? input.footprintSqft : sq * 100;
  const add = (l: Omit<TaggedLine, "kind" | "basis"> & { kind?: LineKind; basis?: Basis }) =>
    labor.push({ kind: "labor", basis: "entered", ...l });

  add({ name: "Mobilization · setup, staging & site access", quantity: 1, unit: "lot", unitPrice: cRate(c, sq < 30 ? "mobSmall" : "mob") });
  add({ name: "Site-specific safety plan & fall-protection program", quantity: 1, unit: "lot", unitPrice: cRate(c, "safetyPlan") });
  if (input.tearOffLayers > 0) {
    add({ name: "Asbestos survey before tear-off (NESHAP)", quantity: 1, unit: "lot", unitPrice: cRate(c, "asbestos"), passThrough: true });
  }
  if (sq >= 50) {
    add({ name: `Superintendent on site · ${days} day${days === 1 ? "" : "s"}`, quantity: days * 9, unit: "hour", unitPrice: cRate(c, "superRate") });
  }
  if (c.occupied) {
    add({ name: "Interior protection · poly & containment under the work", quantity: Math.ceil(area * 0.25), unit: "sq ft", unitPrice: cRate(c, "interior"), basis: "estimated" });
  }
  if (c.shift === "night") {
    add({ name: "Light towers · per week of night work", quantity: weeks, unit: "each", unitPrice: cRate(c, "lightTower") });
  }
  if (c.wage === "prevailing") {
    add({ name: "Certified payroll · per week", quantity: weeks + 1, unit: "each", unitPrice: cRate(c, "payroll") });
  }

  // The permit is valued on the construction work so far; general conditions
  // go on everything that is not an at-cost fee; the bond is written on the
  // whole contract, so it comes last, on everything including the permit and GC.
  const value = [...materials, ...labor].reduce((a, l) => a + lineTotal(l), 0);
  const permit = Math.max(cRate(c, "permitMin"), cRate(c, "permitBase") + (cRate(c, "permitPct") / 100) * value);
  add({ name: "Permit, plan review & inspections · valuation-based", quantity: 1, unit: "lot", unitPrice: Math.round(permit), passThrough: true });

  const gcPct = cRate(c, "gcPct") + cRate(c, "insurancePct");
  if (gcPct > 0) {
    const base = [...materials, ...labor].filter((l) => !l.passThrough).reduce((a, l) => a + lineTotal(l), 0);
    add({
      name: `General conditions & commercial insurance · ${Math.round(gcPct * 10) / 10}%`,
      quantity: 1,
      unit: "lot",
      unitPrice: Math.round((base * gcPct) / 100),
    });
  }
  if (c.bondOn) {
    const v = [...materials, ...labor].reduce((a, l) => a + lineTotal(l), 0);
    const bond = Math.max(600, 0.025 * Math.min(v, 100000) + 0.015 * Math.max(0, Math.min(v, 500000) - 100000) + 0.01 * Math.max(0, v - 500000));
    add({ name: "Payment & performance bond", quantity: 1, unit: "lot", unitPrice: Math.round(bond), passThrough: true });
  }

  const regime = WAGE_REGIMES.find((w) => w.id === c.wage)?.label.toLowerCase() ?? "open shop";
  const shiftLabel = SHIFTS.find((s) => s.id === c.shift)?.label.toLowerCase() ?? "day shift";
  assumptions.push(
    `Priced as a commercial job: ${prod < 1 ? `field install labor ×${prod} for a ${Math.round(sq)}-square deck (crew productivity)` : "no productivity discount under 50 squares"}; ${regime}, ${shiftLabel}${c.occupied && c.shift === "day" ? ", occupied building" : ""}${stories > 1 ? `, ${Math.round(c.stories)} stories` : ""}${lot < 1 ? "; job-lot pricing on the roofing material" : ""}; general conditions and insurance ${Math.round(gcPct * 10) / 10}% on everything except the permit, bond, warranty and survey fees, which are billed at cost.`,
  );
}

// ── The commercial read ─────────────────────────────────────────────────────
export interface BuildingReadInput {
  facts: RoofFacts;
  /** The main structure's own squares — never the parcel total. */
  mainSquares: number | null;
  /** The LOWEST facade eave of the main structure, ft. */
  minEaveFt: number | null;
  confidence: Record<string, number> | null;
  occlusion: string | null;
  /** False when no main structure was picked — then there is no read. */
  hasStructure: boolean;
}
export interface BuildingRead {
  flat: boolean;
  score: number;
  /** "confirm" asks plainly; "soft" says it could be; null says nothing. */
  level: "confirm" | "soft" | null;
  /** The facts behind the read, in words, strongest first after the size. */
  clauses: string[];
}

/**
 * A weighted read of the roof, never a verdict about the building. No single
 * signal can reach the asking threshold on its own, the material is not
 * counted twice when it is also what made the roof read flat, a missing
 * confidence is never treated as full trust, and a small structure or one
 * with no counter-signal available never gets a read at all.
 */
export function readBuilding(input: BuildingReadInput): BuildingRead {
  const { facts } = input;
  const because = flatBecause(facts);
  const flat = because !== null;
  const none: BuildingRead = { flat, score: 0, level: null, clauses: [] };
  if (!input.hasStructure) return none;
  const sq = input.mainSquares != null && input.mainSquares > 0 ? input.mainSquares : facts.squares;
  if (!(sq >= 20)) return none;
  if (facts.shape == null && facts.existingMaterial == null && facts.chimney == null) return none;

  const occluded = /major/i.test(input.occlusion ?? "");
  const terms: Array<{ pts: number; clause: string }> = [];
  const sizePts = sq >= 100 ? 25 : sq >= 50 ? 15 : sq >= 30 ? 8 : 0;
  if (flat) terms.push({ pts: 25, clause: "a flat roof" });
  const ac = facts.rooftopAcCount ?? 0;
  if (!occluded && ac >= 1) terms.push({ pts: ac >= 3 ? 15 : 8, clause: `${ac} rooftop unit${ac === 1 ? "" : "s"}` });
  const eave = input.minEaveFt;
  if (eave != null && eave >= 18) terms.push({ pts: eave >= 24 ? 15 : 8, clause: `an eave about ${Math.round(eave)} ft up` });
  const facetConf = input.confidence?.facetCount;
  if (!occluded && facts.facetCount != null && sq >= 30 && facetConf != null && facetConf >= 0.4 && facts.facetCount / (sq / 10) <= 1.5) {
    terms.push({ pts: 10, clause: "a big, simple roof shape" });
  }
  const fam = familyOfMaterial(facts.existingMaterial ?? null);
  if (fam === "low-slope" && because !== "material") terms.push({ pts: 10, clause: "a membrane surface" });
  else if (fam === "metal" && flat) terms.push({ pts: 5, clause: "a metal deck" });

  const score = sizePts + terms.reduce((a, t) => a + t.pts, 0) - (facts.chimney === true ? 10 : 0);
  const level = score >= 60 ? "confirm" : score >= 45 ? "soft" : null;
  const clauses = [`${Math.round(sq)} squares`, ...terms.sort((a, b) => b.pts - a.pts).map((t) => t.clause)];
  return { flat, score, level, clauses };
}

/** "a, b and c" */
export function joinClauses(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
