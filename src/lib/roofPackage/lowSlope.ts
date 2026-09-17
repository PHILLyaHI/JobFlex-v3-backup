// Flat / low-slope roofs — what goes on the deck besides the membrane.
//
// A flat roof is an ASSEMBLY, not a covering: insulation to the energy code,
// a cover board, the attachment (screws and plates, adhesive, ballast, a torch
// or a kettle), edge metal or coping at the perimeter, base flashing up every
// wall, drains and overflows, curbs and boots, walkway pads to the units, and
// a manufacturer's warranty. The shingle package priced none of that and added
// starter, ridge cap, ice & water and ridge vents that a membrane roof does
// not have (owner, 2026-09-14: "get all the options needed to install the flat
// roof, accordingly to the flat roof type selected").
//
// The rules below were designed and then adversarially reviewed by roofing
// estimators before they were written (2026-09-14). The load-bearing ones:
//   · the system rows in catalog.ts are MEMBRANE ONLY, so every line here adds
//     something the row does not already carry — attachment consumables are
//     material-only (the membrane crew is already in laborPerSq); boards and
//     metal carry their own labor exactly once;
//   · what a line needs is decided by the system's METHOD (mechanically
//     attached, adhered, torch…), so a coating restoration never gets a
//     tear-off, insulation or a nailer, and a ballasted roof never gets plates;
//   · small house roofs are never given commercial minimums — the crane,
//     drains, cores, walkway and warranty only default on for a commercial
//     job (commercial.ts) or when the contractor enters them;
//   · every derived length is clamped at zero, so a roof with no outline
//     prices nothing at the edge rather than a negative run.
//
// Every price is a US 2026 contractor SELL price the contractor edits in the
// builder, same as the rest of the catalog.

import type { Basis, CatalogOption, LineKind, PkgUnit } from "./catalog";

// ── How each system goes down ───────────────────────────────────────────────
export type LowSlopeMethod =
  | "mech" // mechanically attached: screws and seam plates through the insulation
  | "induction" // induction-welded plates under the sheet
  | "adhered" // bonding adhesive (or low-rise foam for fleece-back)
  | "ballasted" // loose-laid under stone
  | "torch" // torch-applied modified bitumen
  | "self_adhered" // peel-and-stick plies
  | "hot" // hot-mopped asphalt from a kettle
  | "cold" // cold-process adhesive
  | "spray" // spray polyurethane foam + coating
  | "coating" // restoration coating over the existing roof
  | "liquid" // liquid-applied reinforced membrane
  | "nailed" // rolled roofing, nailed and lap-cemented
  | "overburden"; // vegetative or paver deck over a membrane

export type Membrane = "tpo" | "pvc" | "kee" | "epdm" | "modbit" | "bur" | "spf" | "coating" | "liquid" | "rolled" | "overburden";

export interface LowSlopeRule {
  method: LowSlopeMethod;
  membrane: Membrane;
  /** Goes over the existing roof: no tear-off by default. */
  recover?: boolean;
  /** Fleece-backed sheet — adhered with low-rise foam, not solvent adhesive. */
  fleece?: boolean;
  /** Coating that wants a primer by default (acrylic, urethane, emulsion over asphalt). */
  primer?: boolean;
}

const RULES: Record<string, LowSlopeRule> = {
  tpo: { method: "mech", membrane: "tpo" },
  tpo_45: { method: "mech", membrane: "tpo" },
  tpo_80: { method: "mech", membrane: "tpo" },
  tpo_60_adhered: { method: "adhered", membrane: "tpo" },
  tpo_induction: { method: "induction", membrane: "tpo" },
  tpo_fleece_adhered: { method: "adhered", membrane: "tpo", fleece: true },
  pvc: { method: "mech", membrane: "pvc" },
  pvc_80: { method: "mech", membrane: "pvc" },
  pvc_adhered: { method: "adhered", membrane: "pvc" },
  pvc_fleece_adhered: { method: "adhered", membrane: "pvc", fleece: true },
  kee: { method: "mech", membrane: "kee" },
  epdm: { method: "adhered", membrane: "epdm" },
  epdm_45: { method: "adhered", membrane: "epdm" },
  epdm_90: { method: "adhered", membrane: "epdm" },
  epdm_mech: { method: "mech", membrane: "epdm" },
  epdm_ballast: { method: "ballasted", membrane: "epdm" },
  mod_bit: { method: "torch", membrane: "modbit" },
  mod_bit_sa: { method: "self_adhered", membrane: "modbit" },
  mod_bit_hot: { method: "hot", membrane: "modbit" },
  mod_bit_cold: { method: "cold", membrane: "modbit" },
  mod_bit_cap_recover: { method: "torch", membrane: "modbit", recover: true },
  bur: { method: "hot", membrane: "bur" },
  bur_cap: { method: "hot", membrane: "bur" },
  bur_3ply_smooth: { method: "hot", membrane: "bur" },
  spf_silicone: { method: "spray", membrane: "spf", recover: true },
  spf_acrylic: { method: "spray", membrane: "spf", recover: true },
  coat_silicone: { method: "coating", membrane: "coating", recover: true },
  coat_silicone_20: { method: "coating", membrane: "coating", recover: true },
  coat_silicone_metal: { method: "coating", membrane: "coating", recover: true },
  coat_acrylic: { method: "coating", membrane: "coating", recover: true, primer: true },
  coat_urethane: { method: "coating", membrane: "coating", recover: true, primer: true },
  coat_emulsion: { method: "coating", membrane: "coating", recover: true, primer: true },
  liquid_pu: { method: "liquid", membrane: "liquid" },
  pmma: { method: "liquid", membrane: "liquid" },
  rolled: { method: "nailed", membrane: "rolled" },
  green_roof: { method: "overburden", membrane: "overburden" },
  ballast_paver: { method: "overburden", membrane: "overburden" },
};

/**
 * The rule for a system. A contractor's own low-slope row has no entry, so
 * its NAME decides — "TPO … adhered" behaves like adhered TPO — and anything
 * unrecognisable is treated as mechanically attached single-ply, the most
 * common flat roof in the country.
 */
export function lowSlopeRule(systemId: string, systemName = ""): LowSlopeRule {
  const known = RULES[systemId];
  if (known) return known;
  const n = systemName.toLowerCase();
  const adhered = /adher|glue|bond/.test(n);
  if (/coat|silicone|acrylic|urethane|elastomer|emulsion|restor/.test(n)) return { method: "coating", membrane: "coating", recover: true, primer: !/silicone/.test(n) };
  if (/spray|foam|spf/.test(n)) return { method: "spray", membrane: "spf", recover: true };
  if (/pmma|liquid/.test(n)) return { method: "liquid", membrane: "liquid" };
  if (/green|vegetat|paver|pedestal/.test(n)) return { method: "overburden", membrane: "overburden" };
  if (/roll/.test(n)) return { method: "nailed", membrane: "rolled" };
  if (/built|\bbur\b|\btar\b|gravel/.test(n)) return { method: "hot", membrane: "bur" };
  if (/mod.?bit|modified|bitumen|torch|\bsbs\b|\bapp\b/.test(n)) {
    if (/self|peel|stick/.test(n)) return { method: "self_adhered", membrane: "modbit" };
    if (/hot|mop/.test(n)) return { method: "hot", membrane: "modbit" };
    if (/cold/.test(n)) return { method: "cold", membrane: "modbit" };
    return { method: "torch", membrane: "modbit" };
  }
  const membrane: Membrane = /epdm|rubber/.test(n) ? "epdm" : /pvc/.test(n) ? "pvc" : /kee/.test(n) ? "kee" : "tpo";
  if (/ballast/.test(n)) return { method: "ballasted", membrane };
  if (/induction/.test(n)) return { method: "induction", membrane };
  return { method: adhered ? "adhered" : "mech", membrane };
}

/** A board-and-membrane assembly: insulation, cover board, nailers and taper apply. */
export function takesBoards(rule: LowSlopeRule): boolean {
  return !["spray", "coating", "liquid", "nailed"].includes(rule.method);
}
/** Goes over the existing roof surface: prep instead of a tear-off. */
export function isSurfaceApplied(rule: LowSlopeRule): boolean {
  return rule.method === "coating" || rule.method === "spray";
}

// ── Insulation and cover board ──────────────────────────────────────────────
export interface BoardOption extends CatalogOption {
  matPerSq: number;
  laborPerSq: number;
  /** Total board height, inches — raises the nailers at the edge. */
  thicknessIn: number;
}
/** Polyiso by the R-value the energy code asks for on a tear-off to the deck
 *  (IECC 2021: R-25ci in zones 2–3, R-30ci in 4–8). Two staggered layers from
 *  R-25 up, so the labor steps up with the second layer. */
export const INSULATION_OPTIONS: BoardOption[] = [
  { id: "none", label: "None", matPerSq: 0, laborPerSq: 0, thicknessIn: 0 },
  { id: "iso_r10", label: "Polyiso R-10 · 1.7 in", matPerSq: 85, laborPerSq: 38, thicknessIn: 1.7 },
  { id: "iso_r15", label: "Polyiso R-15 · 2.6 in", matPerSq: 120, laborPerSq: 38, thicknessIn: 2.6 },
  { id: "iso_r20", label: "Polyiso R-20 · 3.5 in", matPerSq: 155, laborPerSq: 40, thicknessIn: 3.5 },
  { id: "iso_r25", label: "Polyiso R-25 · 2 layers", matPerSq: 195, laborPerSq: 55, thicknessIn: 4.3 },
  { id: "iso_r30", label: "Polyiso R-30 · 2 layers", matPerSq: 235, laborPerSq: 58, thicknessIn: 5.2 },
  { id: "iso_r35", label: "Polyiso R-35 · 2 layers", matPerSq: 275, laborPerSq: 60, thicknessIn: 6 },
  { id: "eps_r15", label: "EPS R-15 · 4 in", matPerSq: 95, laborPerSq: 36, thicknessIn: 4 },
  { id: "xps_r10", label: "XPS R-10 · 2 in (ballasted)", matPerSq: 130, laborPerSq: 32, thicknessIn: 2 },
];
export const COVER_BOARDS: BoardOption[] = [
  { id: "none", label: "None", matPerSq: 0, laborPerSq: 0, thicknessIn: 0 },
  { id: "hd_iso", label: "HD polyiso · ½ in", matPerSq: 58, laborPerSq: 28, thicknessIn: 0.5 },
  { id: "gypsum_14", label: "Gypsum board · ¼ in", matPerSq: 80, laborPerSq: 32, thicknessIn: 0.25 },
  { id: "gypsum_12", label: "Gypsum board · ½ in", matPerSq: 110, laborPerSq: 35, thicknessIn: 0.5 },
];

// ── Drains, overflow, warranty, existing roof ───────────────────────────────
export type DrainWork = "insert" | "new" | "ring";
export const DRAIN_WORK: Array<CatalogOption & { id: DrainWork }> = [
  { id: "insert", label: "Retrofit drain insert" },
  { id: "new", label: "New drain body & leader" },
  { id: "ring", label: "Reuse drain · new clamp ring" },
];
export type SecondaryDrainage = "none" | "scupper" | "drain";
export const SECONDARY_DRAINAGE: Array<CatalogOption & { id: SecondaryDrainage }> = [
  { id: "none", label: "None" },
  { id: "scupper", label: "Overflow scuppers" },
  { id: "drain", label: "Overflow drains" },
];
export type WarrantyId = "none" | "ndl_15" | "ndl_20" | "ndl_30";
export const WARRANTIES: Array<CatalogOption & { id: WarrantyId; perSq: number }> = [
  { id: "none", label: "Workmanship only", perSq: 0 },
  { id: "ndl_15", label: "Manufacturer NDL · 15-yr", perSq: 18 },
  { id: "ndl_20", label: "Manufacturer NDL · 20-yr", perSq: 28 },
  { id: "ndl_30", label: "Manufacturer NDL · 30-yr", perSq: 45 },
];
/** What is coming off: sets the tear-off and disposal rates, which differ by
 *  a factor of two between a single-ply and a gravel built-up roof. */
export type ExistingLowSlope = "single_ply" | "mod_bit" | "bur_gravel" | "metal" | "shingle";
export const EXISTING_LOW_SLOPE: Array<CatalogOption & { id: ExistingLowSlope; tearOffPerSqLayer: number; disposalPerSqLayer: number }> = [
  { id: "single_ply", label: "Single-ply + insulation", tearOffPerSqLayer: 95, disposalPerSqLayer: 45 },
  { id: "mod_bit", label: "Modified bitumen", tearOffPerSqLayer: 110, disposalPerSqLayer: 55 },
  { id: "bur_gravel", label: "Built-up with gravel", tearOffPerSqLayer: 195, disposalPerSqLayer: 110 },
  { id: "metal", label: "Metal panels", tearOffPerSqLayer: 85, disposalPerSqLayer: 40 },
  { id: "shingle", label: "Shingles / rolled roofing", tearOffPerSqLayer: 60, disposalPerSqLayer: 30 },
];
/** The aerial material word → what is probably coming off. The contractor
 *  confirms it from a core cut; this only picks the starting row. */
export function existingLowSlopeOf(word: string | null | undefined): ExistingLowSlope {
  const w = (word ?? "").toLowerCase();
  if (/built|bur\b|gravel|tar\b|coal/.test(w)) return "bur_gravel";
  if (/modified|mod.?bit|torch|bitumen/.test(w)) return "mod_bit";
  if (/metal|steel|aluminum|aluminium|standing/.test(w)) return "metal";
  if (/shingle|asphalt|composition|rolled|roll\b/.test(w)) return "shingle";
  return "single_ply";
}
/** The like-for-like flat system for what the aerial data calls the roof, or
 *  null when the word is generic ("Flat", "Membrane") and names no system. */
export function lowSlopeSystemForMaterial(word: string | null | undefined): string | null {
  const w = (word ?? "").toLowerCase();
  if (/epdm|rubber/.test(w)) return "epdm";
  if (/pvc/.test(w)) return "pvc";
  if (/built|bur\b|gravel|tar\b/.test(w)) return "bur";
  if (/modified|mod.?bit|torch|bitumen/.test(w)) return "mod_bit";
  if (/rolled|roll\b/.test(w)) return "rolled";
  if (/coat|silicone|acrylic/.test(w)) return "coat_silicone";
  if (/foam|spf/.test(w)) return "spf_silicone";
  if (/tpo/.test(w)) return "tpo";
  if (/kee/.test(w)) return "kee";
  return null;
}

// ── Rates the contractor edits ──────────────────────────────────────────────
// One flat map, so a saved company default that predates a new rate simply
// falls back to the built-in figure instead of breaking.
export interface RateDef {
  key: string;
  label: string;
  unit: "$/sq" | "$/ft" | "$/ea" | "$/hr" | "$/sq ft" | "$";
  value: number;
}
export const FLAT_RATE_DEFS = {
  taperedMat: { key: "taperedMat", label: "Tapered & crickets", unit: "$/sq ft", value: 3.25 },
  taperedLabor: { key: "taperedLabor", label: "Tapered labor", unit: "$/sq ft", value: 1.25 },
  insFasteners: { key: "insFasteners", label: "Insulation plates", unit: "$/sq", value: 13 },
  mechFasteners: { key: "mechFasteners", label: "Membrane plates", unit: "$/sq", value: 11 },
  inductionPlates: { key: "inductionPlates", label: "Induction plates", unit: "$/sq", value: 17 },
  bondingAdhesive: { key: "bondingAdhesive", label: "Bonding adhesive", unit: "$/sq", value: 75 },
  foamAdhesive: { key: "foamAdhesive", label: "Low-rise foam", unit: "$/sq", value: 60 },
  ballastMat: { key: "ballastMat", label: "Ballast stone", unit: "$/sq", value: 60 },
  ballastLabor: { key: "ballastLabor", label: "Ballast labor", unit: "$/sq", value: 35 },
  primerSa: { key: "primerSa", label: "SA primer", unit: "$/sq", value: 14 },
  primerTorch: { key: "primerTorch", label: "Torch primer", unit: "$/sq", value: 6 },
  capNails: { key: "capNails", label: "Cap nails & cement", unit: "$/sq", value: 8 },
  seamSingle: { key: "seamSingle", label: "Seam cleaner", unit: "$/sq", value: 3 },
  seamEpdm: { key: "seamEpdm", label: "EPDM seam tape", unit: "$/sq", value: 18 },
  edgeMat: { key: "edgeMat", label: "Edge metal", unit: "$/ft", value: 9 },
  edgeLabor: { key: "edgeLabor", label: "Edge labor", unit: "$/ft", value: 6 },
  copingMat: { key: "copingMat", label: "Coping cap", unit: "$/ft", value: 20 },
  copingLabor: { key: "copingLabor", label: "Coping labor", unit: "$/ft", value: 11 },
  baseFlashMat: { key: "baseFlashMat", label: "Base flashing", unit: "$/ft", value: 7.5 },
  baseFlashLabor: { key: "baseFlashLabor", label: "Base flash labor", unit: "$/ft", value: 9.5 },
  termBarMat: { key: "termBarMat", label: "Term bar & sealant", unit: "$/ft", value: 2.4 },
  termBarLabor: { key: "termBarLabor", label: "Term bar labor", unit: "$/ft", value: 3.2 },
  counterMat: { key: "counterMat", label: "Counterflashing", unit: "$/ft", value: 5.2 },
  counterLabor: { key: "counterLabor", label: "Counter labor", unit: "$/ft", value: 5.8 },
  nailerMat: { key: "nailerMat", label: "Wood nailer", unit: "$/ft", value: 2 },
  nailerLabor: { key: "nailerLabor", label: "Nailer labor", unit: "$/ft", value: 4.2 },
  drainInsertMat: { key: "drainInsertMat", label: "Drain insert", unit: "$/ea", value: 235 },
  drainInsertLabor: { key: "drainInsertLabor", label: "Insert labor", unit: "$/ea", value: 280 },
  drainNewMat: { key: "drainNewMat", label: "New drain", unit: "$/ea", value: 385 },
  drainNewLabor: { key: "drainNewLabor", label: "New drain labor", unit: "$/ea", value: 520 },
  drainRingMat: { key: "drainRingMat", label: "Clamp ring", unit: "$/ea", value: 95 },
  drainRingLabor: { key: "drainRingLabor", label: "Ring labor", unit: "$/ea", value: 65 },
  overflowScupperMat: { key: "overflowScupperMat", label: "Overflow scupper", unit: "$/ea", value: 260 },
  overflowScupperLabor: { key: "overflowScupperLabor", label: "Scupper labor", unit: "$/ea", value: 450 },
  overflowDrainMat: { key: "overflowDrainMat", label: "Overflow drain", unit: "$/ea", value: 420 },
  overflowDrainLabor: { key: "overflowDrainLabor", label: "Overflow labor", unit: "$/ea", value: 560 },
  scupperMat: { key: "scupperMat", label: "Scupper & head", unit: "$/ea", value: 455 },
  scupperLabor: { key: "scupperLabor", label: "Scupper labor", unit: "$/ea", value: 425 },
  gutterMat: { key: "gutterMat", label: "Gutter", unit: "$/ft", value: 7 },
  gutterLabor: { key: "gutterLabor", label: "Gutter labor", unit: "$/ft", value: 5 },
  bootMat: { key: "bootMat", label: "Membrane boot", unit: "$/ea", value: 38 },
  bootLabor: { key: "bootLabor", label: "Boot labor", unit: "$/ea", value: 62 },
  pocketMat: { key: "pocketMat", label: "Pitch pocket", unit: "$/ea", value: 58 },
  pocketLabor: { key: "pocketLabor", label: "Pocket labor", unit: "$/ea", value: 85 },
  rtuMat: { key: "rtuMat", label: "RTU curb flashing", unit: "$/ea", value: 235 },
  rtuLabor: { key: "rtuLabor", label: "RTU curb labor", unit: "$/ea", value: 340 },
  rtuReset: { key: "rtuReset", label: "RTU raise & reset", unit: "$/ea", value: 2000 },
  curbMat: { key: "curbMat", label: "Curb flashing", unit: "$/ea", value: 145 },
  curbLabor: { key: "curbLabor", label: "Curb labor", unit: "$/ea", value: 210 },
  walkwayMat: { key: "walkwayMat", label: "Walkway pad", unit: "$/ft", value: 8 },
  walkwayLabor: { key: "walkwayLabor", label: "Walkway labor", unit: "$/ft", value: 5 },
  craneRate: { key: "craneRate", label: "Crane & operator", unit: "$/hr", value: 340 },
  craneMob: { key: "craneMob", label: "Crane mobilization", unit: "$", value: 650 },
  coreEach: { key: "coreEach", label: "Core cut", unit: "$/ea", value: 190 },
  warrantyInspection: { key: "warrantyInspection", label: "Warranty inspection", unit: "$", value: 850 },
  gravelVac: { key: "gravelVac", label: "Gravel vacuum", unit: "$/sq", value: 75 },
  wetIns: { key: "wetIns", label: "Wet insulation", unit: "$/sq ft", value: 5.5 },
  washMat: { key: "washMat", label: "Wash & prep", unit: "$/sq", value: 4 },
  washLabor: { key: "washLabor", label: "Wash labor", unit: "$/sq", value: 20 },
  repairMat: { key: "repairMat", label: "Seam & fabric repair", unit: "$/sq", value: 8 },
  repairLabor: { key: "repairLabor", label: "Repair labor", unit: "$/sq", value: 18 },
  primerCoatMat: { key: "primerCoatMat", label: "Coating primer", unit: "$/sq", value: 22 },
  primerCoatLabor: { key: "primerCoatLabor", label: "Primer labor", unit: "$/sq", value: 12 },
  fireWatch: { key: "fireWatch", label: "Fire watch", unit: "$/hr", value: 65 },
  kettle: { key: "kettle", label: "Kettle & tanker", unit: "$", value: 950 },
  nightSeal: { key: "nightSeal", label: "Night seal", unit: "$/ft", value: 4 },
  warningLine: { key: "warningLine", label: "Warning line", unit: "$/ft", value: 1.5 },
  hoist: { key: "hoist", label: "Ladder hoist / conveyor", unit: "$", value: 350 },
  waterproofMat: { key: "waterproofMat", label: "Waterproofing under overburden", unit: "$/sq", value: 210 },
  waterproofLabor: { key: "waterproofLabor", label: "Waterproofing labor", unit: "$/sq", value: 170 },
} satisfies Record<string, RateDef>;
export type FlatRateKey = keyof typeof FLAT_RATE_DEFS;
export const FLAT_RATE_DEFAULTS: Record<FlatRateKey, number> = Object.fromEntries(
  Object.values(FLAT_RATE_DEFS).map((d) => [d.key, d.value]),
) as Record<FlatRateKey, number>;

// ── The flat-roof part of a package spec ────────────────────────────────────
export interface FlatSpec {
  insulationId: string;
  insulationMatPerSq: number;
  insulationLaborPerSq: number;
  insulationThicknessIn: number;
  coverBoardId: string;
  coverBoardMatPerSq: number;
  coverBoardLaborPerSq: number;
  coverBoardThicknessIn: number;
  taperedSqft: number;
  /** Perimeter split: coping on the parapets, edge metal on the open edges. */
  parapetFt: number;
  parapetHeightIn: number;
  edgeMetalFt: number;
  /** Where the roof meets a taller wall: base flashing, bar and counterflashing. */
  wallFt: number;
  nailersOn: boolean;
  drains: number;
  drainWork: DrainWork;
  secondary: SecondaryDrainage;
  scuppers: number;
  gutterFt: number;
  pitchPockets: number;
  /** Pipe boots on the membrane — one pre-moulded part covers 1–6 in pipe. */
  pipeBoots: number;
  /** Skylight, hatch, exhaust-fan and chimney curbs (rooftop units are rtuCount). */
  curbs: number;
  rtuCount: number;
  rtuResetCount: number;
  walkwayFt: number;
  craneHours: number;
  hoistOn: boolean;
  coreCuts: number;
  warrantyId: WarrantyId;
  warrantyPerSq: number;
  existing: ExistingLowSlope;
  wetInsulationSqft: number;
  primerOn: boolean;
  /** Squares a crew finishes in a day — drives night seal and fire watch. */
  productionSqPerDay: number;
  rates: Record<FlatRateKey, number>;
}

/** Where each line's basis comes from, for the Basis column. */
export interface FlatBasis {
  perimeter: Basis;
  rtu: Basis;
}

export function rate(spec: FlatSpec, key: FlatRateKey): number {
  const v = spec.rates?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : FLAT_RATE_DEFAULTS[key];
}

/** A line as the low-slope builder emits it; `wageable` marks crew hours for the commercial factors. */
export interface FlatLine {
  name: string;
  quantity: number;
  unit: PkgUnit;
  unitPrice: number;
  kind: LineKind;
  basis: Basis;
  wageable?: boolean;
}

/** How a method goes down, in a contractor's words — the first assumption line. */
export const METHOD_WORDS: Record<LowSlopeMethod, string> = {
  mech: "mechanically attached",
  induction: "induction-welded plates, no fasteners through the sheet",
  adhered: "fully adhered",
  ballasted: "loose-laid under ballast stone",
  torch: "torch-applied plies",
  self_adhered: "self-adhered plies, no flame",
  hot: "hot-mopped asphalt from a kettle",
  cold: "cold-process adhesive",
  spray: "spray-applied foam with a protective coating",
  coating: "restoration coating over the existing roof",
  liquid: "liquid-applied reinforced membrane",
  nailed: "nailed and lap-cemented",
  overburden: "vegetative or paver layers over the waterproofing",
};

/** How the seams are made, by membrane — EPDM is taped, thermoplastics are welded. */
export function seamWords(rule: LowSlopeRule): string | null {
  if (rule.membrane === "tpo" || rule.membrane === "pvc" || rule.membrane === "kee") return "seams hot-air welded";
  if (rule.membrane === "epdm") return "seams taped";
  return null;
}
