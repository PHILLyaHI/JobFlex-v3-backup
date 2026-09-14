// Roof package takeoff — the quantity math. Pure functions, client-safe.
//
// Inputs are FACTS the measurement established (squares, pitch families,
// the building outline's perimeter, footprint, chimney, rooftop units, shape)
// and the SPEC the contractor picked in the builder. Output is the estimate's
// two tables plus the assumptions that say where every number came from.
// Nothing here is a measurement the aerial data did not make: edge lengths
// are ESTIMATED from the outline and the roof shape and carry that word.

import { haversineFt } from "@/lib/parcels";
import {
  APRON_LABOR_PER_FT,
  APRON_PER_FT,
  BUILTIN_LISTS,
  CHIMNEY_SIZES,
  CLEANUP_LUMP,
  COUNTER_LABOR_PER_FT,
  COUNTER_PER_FT,
  CURB_EACH,
  CURB_LABOR,
  DISPOSAL_PER_SQ_LAYER,
  DRIP_EDGE_PROFILES,
  DRIP_EDGE_SIZES,
  familyOfMaterial,
  ICE_WATER_EAVE_BAND_FT,
  ICE_WATER_PER_SQFT,
  ICE_WATER_VALLEY_BAND_FT,
  likeForLikeSystem,
  MATERIAL_DELIVERY_LUMP,
  NAILS_PER_SQ,
  NFA_RATIO_BALANCED,
  NFA_RATIO_PLAIN,
  PIPE_BOOT_SIZES,
  pitchLaborFactor,
  PLYWOOD_SHEET_EACH,
  PLYWOOD_SHEET_LABOR,
  SEALANT_PER_SQ,
  STARTER_PER_FT,
  STEEP_PITCH,
  STEEP_SAFETY_LUMP,
  STEP_FLASHING_LABOR_PER_FT,
  STEP_FLASHING_SIZES,
  TEAROFF_LABOR_PER_SQ_LAYER,
  VALLEY_FOR_FAMILY,
  VALLEY_TYPES,
  VENT_TYPES,
  type Basis,
  type CatalogLists,
  type IceWaterCoverage,
  type LineKind,
  type PkgUnit,
  type RoofFamily,
  type RoofSystem,
  type Underlayment,
} from "./catalog";
import { applyCommercial, defaultCommercial, type CommercialSpec, type TaggedLine } from "./commercial";
import { isFlatRoof } from "./flatRule";
import {
  COVER_BOARDS,
  EXISTING_LOW_SLOPE,
  FLAT_RATE_DEFAULTS,
  INSULATION_OPTIONS,
  WARRANTIES,
  existingLowSlopeOf,
  isSurfaceApplied,
  lowSlopeRule,
  lowSlopeSystemForMaterial,
  METHOD_WORDS,
  rate,
  seamWords,
  takesBoards,
  type FlatSpec,
  type LowSlopeRule,
} from "./lowSlope";

export interface RoofFacts {
  squares: number;
  /** Where the squares came from: aerial data or the contractor's own takeoff. */
  squaresBasis: Basis;
  /** Pitch families by share of the roof (shares sum to 1); empty when no pitch was stated. */
  pitchFamilies: Array<{ pitch12: number; share: number }>;
  pitchBasis: Basis | null;
  /** Building outline perimeter, ft — from pack 007's polygon; null without it. */
  perimeterFt: number | null;
  footprintSqft: number | null;
  chimney: boolean | null;
  rooftopAcCount: number | null;
  /** The aerial data's roof shape word (hip / gable / …), verbatim; null when absent. */
  shape: string | null;
  facetCount: number | null;
  /**
   * Lengths from a DELIVERED aerial measurement report (the full report, not
   * the Instant packs): eave, rake, ridge, hip, valley and step-flash feet.
   * Null when no report has been ordered for this address. When present the
   * builder starts from these and marks them measured.
   */
  measured?: MeasuredFootage | null;
  /**
   * The aerial data's word for what is on the roof now ("Tile", "Asphalt
   * shingle"…); null when it did not say. The builder and the smart estimate
   * start like-for-like from it.
   */
  existingMaterial?: string | null;
  /**
   * The aerial provider's own 0..1 score for facetCount, when it scored one.
   * The valley estimate refuses a facet count scored under 0.5.
   */
  facetConfidence?: number | null;
  /**
   * How the contractor said this building is used — the only thing that
   * turns commercial pricing on. Null until they answer; the aerial data has
   * no occupancy field, so the app never decides this by itself.
   */
  buildingUse?: "residential" | "commercial" | null;
}

export interface MeasuredFootage {
  reportId: number;
  eaveFt: number;
  rakeFt: number;
  ridgeFt: number;
  hipFt: number;
  valleyFt: number;
  stepFlashFt: number;
}

export interface PkgLine {
  name: string;
  quantity: number;
  unit: PkgUnit;
  unitPrice: number;
  kind: LineKind;
  basis: Basis;
}

export interface VentPick {
  id: string;
  qty: number;
  each: number;
  labor: number;
}

export interface CustomLine {
  id: string;
  name: string;
  qty: number;
  unit: PkgUnit;
  unitPrice: number;
  kind: LineKind;
}

export interface RoofPackageSpec {
  systemId: string;
  systemName: string;
  /** Carried on the spec so a catalog the contractor edited still prices right. */
  systemFamily: RoofFamily;
  systemMatPerSq: number;
  systemLaborPerSq: number;
  capPerFt: number;
  wastePct: number;
  underlaymentId: string;
  underlaymentName: string;
  underlaymentPerSq: number;
  iceWater: IceWaterCoverage;
  iceWaterPerSqft: number;
  eaveFt: number;
  rakeFt: number;
  ridgeFt: number;
  hipFt: number;
  /** Whether the edge lengths are the builder's estimate, the report's measurement or the contractor's entry. */
  edgesBasis: Basis;
  /** Where the valley and sidewall lengths came from — the report, or typed in. */
  valleyBasis: Basis;
  stepBasis: Basis;
  dripEdgeOn: boolean;
  dripProfileId: string;
  dripSizeId: string;
  dripPerFt: number;
  starterOn: boolean;
  starterPerFt: number;
  valleyTypeId: string;
  valleyCount: number;
  valleyFtEach: number;
  valleyMatPerFt: number;
  valleyLaborPerFt: number;
  stepWallCount: number;
  stepWallFtEach: number;
  stepSizeId: string;
  stepPerPiece: number;
  stepLaborPerFt: number;
  apronFt: number;
  apronPerFt: number;
  apronLaborPerFt: number;
  counterFt: number;
  counterPerFt: number;
  counterLaborPerFt: number;
  /** Pipe boot count by size id. */
  pipeBoots: Record<string, number>;
  pipeBootPrices: Record<string, { each: number; labor: number }>;
  chimneyCount: number;
  chimneySizeId: string;
  chimneyEach: number;
  chimneyLabor: number;
  curbCount: number;
  curbEach: number;
  curbLabor: number;
  vents: VentPick[];
  ventBalanced: boolean;
  tearOffLayers: 0 | 1 | 2 | 3;
  tearOffPerSqLayer: number;
  disposalPerSqLayer: number;
  plywoodSheets: number;
  plywoodEach: number;
  plywoodLabor: number;
  nailsPerSq: number;
  sealantPerSq: number;
  cleanupLump: number;
  safetyLump: number;
  permitLump: number;
  /** Material delivery / rooftop load, one lot; 0 hides the line. */
  deliveryLump: number;
  custom: CustomLine[];
  /** The flat-roof assembly — only priced when the system is low slope. */
  flat: FlatSpec;
  /** Commercial pricing — off unless the contractor says the building is commercial. */
  commercial: CommercialSpec;
  /**
   * True while the system is the one the ROOF chose (like-for-like from the
   * material, the flat rule, the shingle default) rather than one the
   * contractor picked. An automatic pick is never saved as their usual system —
   * a tile house must not make the next plain house open on tile.
   */
  systemAuto: boolean;
}

/** Perimeter of a lat/lng ring in feet; null when there is no ring. A closed ring's repeated last point adds nothing. */
export function ringPerimeterFt(ring: ReadonlyArray<{ lat: number; lng: number }> | null | undefined): number | null {
  if (!ring || ring.length < 3) return null;
  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    total += haversineFt([a.lat, a.lng], [b.lat, b.lng]);
  }
  return total;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Edge lengths from what the aerial data knows. The outline gives the
 * perimeter; the roof SHAPE says how much of it is eave vs rake and how long
 * the ridge and hips run. A footprint is treated as a rectangle of aspect
 * 1.6 — the typical house — so these are estimates and are labelled so.
 */
export function estimateEdges(facts: RoofFacts): { eaveFt: number; rakeFt: number; ridgeFt: number; hipFt: number; valleyFt: number | null } | null {
  // A zero footprint or perimeter is "not known", never a real zero — a 0
  // here once turned the whole estimate into NaN (review, 2026-09-14).
  const A = facts.footprintSqft != null && facts.footprintSqft > 0 ? facts.footprintSqft : null;
  const P = facts.perimeterFt != null && facts.perimeterFt > 0 ? facts.perimeterFt : A != null ? 4 * Math.sqrt(A) * 1.05 : null;
  if (P == null) return null;
  const L = A != null ? Math.sqrt(A * 1.6) : P / 2 / (1 + 1 / 1.6);
  const shape = (facts.shape ?? "").toLowerCase();
  const hip = shape.includes("hip");
  const gable = shape.includes("gable");
  // The one flat verdict (flatRule.ts), not the shape word alone: a 1/12 roof
  // the data calls "Complex" is still flat and has no ridge or hip.
  const flat = isFlatRoof(facts);
  const W = A != null ? A / L : L / 1.6;
  const eave = flat || hip ? P : gable ? Math.min(P, 2 * L) : P * 0.8;
  return {
    eaveFt: r1(eave),
    rakeFt: r1(Math.max(0, P - eave)),
    ridgeFt: r1(flat ? 0 : hip ? Math.max(0, L - W) : gable ? L : 0.7 * L),
    hipFt: r1(flat ? 0 : hip ? 2.83 * W : gable ? 0 : 1.4 * W),
    valleyFt: estimateValleys(facts)?.totalFt ?? null,
  };
}

/** The underlayment a family calls for: high-temp synthetic under metal,
 *  tile and slate; none under a membrane; synthetic otherwise. Null when the
 *  contractor's list has no such row. */
export function underlaymentForFamily(family: RoofFamily, lists: CatalogLists): Underlayment | null {
  const has = (id: string) => lists.underlayments.find((u) => u.id === id) ?? null;
  if (family === "low-slope") return has("none");
  if (family === "metal" || family === "tile" || family === "slate") return has("synthetic_premium");
  return has("synthetic");
}

/**
 * Valley feet from the facets the roof shape does not explain, when no full
 * measurement report exists. A valley forms at every inside corner of the
 * outline; a plain gable or hip has none, and each wing adds facets and
 * valleys together. Designed and adversarially reviewed 2026-09-14:
 *   · base facets by shape — hip 4, gable 2, mansard 8, flat 0 valleys;
 *   · hip-type bodies add valleys in pairs (a wing makes two), others by rate;
 *   · the first two valleys run 0.30 of the narrow dimension (capped at 15 ft)
 *     plus a 1.5 ft overhang, later ones 0.16 (capped at 8 ft) plus 0.5 ft;
 *   · the plan run is capped at half the perimeter, then lengthened by the
 *     hip/valley factor √(2 + (pitch/12)²).
 * Returns null — never a confident 0 — whenever the inputs cannot support a
 * figure: no facet count, a facet count scored under 0.5, a facet count below
 * the shape's own base, no outline, a body too small or too large for the
 * one-rectangle-with-wings model, or 20+ facets.
 */
export function estimateValleys(facts: RoofFacts): { count: number; ftEach: number; totalFt: number } | null {
  if (isFlatRoof(facts)) return { count: 0, ftEach: 0, totalFt: 0 };
  const fc = facts.facetCount;
  if (fc == null || !Number.isFinite(fc) || fc < 1 || fc >= 20) return null;
  if (facts.facetConfidence != null && facts.facetConfidence < 0.5) return null;
  const A = facts.footprintSqft != null && facts.footprintSqft > 0 ? facts.footprintSqft : null;
  const P = facts.perimeterFt != null && facts.perimeterFt > 0 ? facts.perimeterFt : A != null ? 4 * Math.sqrt(A) * 1.05 : null;
  if (A == null && P == null) return null;
  if ((A ?? 0) > 15000 || (P ?? 0) > 600) return null;
  const L = A != null ? Math.sqrt(A * 1.6) : (P as number) / 2 / (1 + 1 / 1.6);
  const W = A != null ? A / L : L / 1.6;
  if (!(Number.isFinite(W) && W >= 12)) return null;

  const shape = (facts.shape ?? "").toLowerCase();
  const body =
    /shed|skillion|lean|mono/.test(shape) ? { base: 1, pairs: false, rate: 0.5 }
    : /gambrel/.test(shape) ? { base: 4, pairs: false, rate: 0.75 }
    : /mansard/.test(shape) ? { base: 8, pairs: true, rate: 1 }
    : /pyramid|hip|dutch/.test(shape) ? { base: 4, pairs: true, rate: 1 }
    : /gable|a.?frame/.test(shape) ? { base: 2, pairs: false, rate: 0.75 }
    : { base: 3, pairs: false, rate: 0.85 };
  if (fc < body.base) return null;
  const extra = fc - body.base;
  const n = Math.max(0, Math.min(12, body.pairs ? 2 * Math.round(extra / 2.5) : Math.round(extra * body.rate)));
  if (n === 0) return { count: 0, ftEach: 0, totalFt: 0 };

  const main = facts.pitchFamilies.filter((f) => f.share > 0).reduce<{ pitch12: number; share: number } | null>((a, f) => (a == null || f.share > a.share ? f : a), null);
  const t = Math.max(0, Math.min(20, main?.pitch12 ?? 5)) / 12;
  const factor = Math.sqrt(2 + t * t);
  const primaries = Math.min(2, n - (n % 2));
  const secondaries = n - primaries;
  let plan = primaries * (Math.min(0.3 * W, 15) + 1.5) + secondaries * (Math.min(0.16 * W, 8) + 0.5);
  if (P != null) plan = Math.min(plan, 0.5 * P);
  const ftEach = r1((plan * factor) / n);
  const totalFt = r1(n * ftEach);
  if (!Number.isFinite(ftEach) || !Number.isFinite(totalFt)) return null;
  return { count: n, ftEach, totalFt };
}

/**
 * The family a replacement is like-for-like WITH, or null when "like-for-like"
 * would be untrue: the material names a family and the roof calls for that
 * same family — or it is a flat metal building, which stays metal. An
 * unrecognised material ("Unknown", "Other") or a shingle word on a flat roof
 * is never like-for-like. The Details hint, the builder chip, the smart
 * estimate's instruction and its hint all ask here.
 */
export function likeForLikeFamily(facts: RoofFacts): RoofFamily | null {
  const fam = familyOfMaterial(facts.existingMaterial);
  if (!fam) return null;
  if (fam === "metal" && isFlatRoof(facts)) return "metal";
  return resolvedFamily(facts) === fam ? fam : null;
}

/** The family this roof calls for: flat when the flat rule says so, else
 *  like-for-like from the material the aerial data reports; null = no read. */
export function resolvedFamily(facts: RoofFacts): RoofFamily | null {
  return isFlatRoof(facts) ? "low-slope" : familyOfMaterial(facts.existingMaterial);
}

/**
 * The system a roof opens on. A flat roof opens on the flat system its
 * material names (EPDM stays EPDM, gravel built-up stays built-up), else the
 * contractor's usual flat system, else TPO; a steep roof opens like-for-like
 * from its material, else on the shingle default.
 */
export function openingSystem(facts: RoofFacts, lists: CatalogLists = BUILTIN_LISTS, preferredLowSlopeId?: string | null): RoofSystem {
  const steepDefault = lists.systems.find((s) => s.id === "architectural") ?? lists.systems.find((s) => s.family !== "low-slope") ?? lists.systems[0] ?? BUILTIN_LISTS.systems[0];
  const fam = resolvedFamily(facts);
  if (fam === "low-slope") {
    const lowSlope = (id: string | null | undefined) => (id ? lists.systems.find((s) => s.id === id && s.family === "low-slope") ?? null : null);
    // A low-slope metal building stays metal: standing seam made for 1:12.
    if (familyOfMaterial(facts.existingMaterial) === "metal") {
      const seam = lists.systems.find((s) => s.id === "standing_seam_low");
      if (seam) return seam;
    }
    return (
      lowSlope(familyOfMaterial(facts.existingMaterial) === "low-slope" ? lowSlopeSystemForMaterial(facts.existingMaterial) : null) ??
      lowSlope(preferredLowSlopeId) ??
      likeForLikeSystem("low-slope", lists) ??
      steepDefault
    );
  }
  return (fam ? likeForLikeSystem(fam, lists) : null) ?? steepDefault;
}

/** The spec the builder opens with for THIS roof: catalog defaults, facts
 *  filled in, on the system the roof calls for (openingSystem). */
export function defaultSpec(facts: RoofFacts, lists: CatalogLists = BUILTIN_LISTS, preferredLowSlopeId?: string | null): RoofPackageSpec {
  return defaultSpecWith(facts, lists, openingSystem(facts, lists, preferredLowSlopeId));
}

/** The default spec for THIS roof on a GIVEN system. */
export function defaultSpecWith(facts: RoofFacts, lists: CatalogLists, sys: RoofSystem): RoofPackageSpec {
  const und =
    underlaymentForFamily(sys.family, lists) ??
    lists.underlayments.find((u) => u.id === "synthetic") ??
    lists.underlayments[0] ??
    BUILTIN_LISTS.underlayments[0];
  // A delivered report's lengths win over the outline estimate.
  const m = facts.measured ?? null;
  const edges = m ? { eaveFt: r1(m.eaveFt), rakeFt: r1(m.rakeFt), ridgeFt: r1(m.ridgeFt), hipFt: r1(m.hipFt) } : estimateEdges(facts);
  const drip = DRIP_EDGE_PROFILES[0];
  // The valley the family is built with, and its count and length: a
  // delivered report's measurement (a measured ZERO stays zero), else the
  // facet estimate, else nothing entered yet.
  const valley = VALLEY_TYPES.find((v) => v.id === (VALLEY_FOR_FAMILY[sys.family] ?? "open_w24")) ?? VALLEY_TYPES[1];
  const est = m ? null : estimateValleys(facts);
  const step = STEP_FLASHING_SIZES[0];
  const chimneySize = CHIMNEY_SIZES[1];
  const ridgeVent = VENT_TYPES.find((v) => v.id === "ridge")!;
  const soffit = VENT_TYPES.find((v) => v.id === "soffit16x8")!;
  // Intake to balance the ridge: half the attic's requirement, in 16 × 8 vents.
  const attic = facts.footprintSqft ?? facts.squares * 100 * 0.8;
  const intakeNeed = (attic * 144) / NFA_RATIO_BALANCED / 2;
  const ridgeFt = edges?.ridgeFt ?? 0;
  const base: RoofPackageSpec = {
    systemId: sys.id,
    systemName: sys.label,
    systemFamily: sys.family,
    systemMatPerSq: sys.matPerSq,
    systemLaborPerSq: sys.laborPerSq,
    capPerFt: sys.capPerFt,
    wastePct: sys.wastePct,
    underlaymentId: und.id,
    underlaymentName: und.label,
    underlaymentPerSq: und.perSq,
    iceWater: "eaves_valleys",
    iceWaterPerSqft: ICE_WATER_PER_SQFT,
    eaveFt: edges?.eaveFt ?? 0,
    rakeFt: edges?.rakeFt ?? 0,
    ridgeFt,
    hipFt: edges?.hipFt ?? 0,
    edgesBasis: m ? "measured" : edges ? "estimated" : "entered",
    valleyBasis: m ? "measured" : est ? "estimated" : "entered",
    stepBasis: m && m.stepFlashFt > 0 ? "measured" : "entered",
    dripEdgeOn: true,
    dripProfileId: drip.id,
    dripSizeId: DRIP_EDGE_SIZES[1].id,
    dripPerFt: drip.perFt,
    starterOn: true,
    starterPerFt: STARTER_PER_FT,
    valleyTypeId: valley.id,
    valleyCount: m ? (m.valleyFt > 0 ? 1 : 0) : est?.count ?? 0,
    valleyFtEach: m ? (m.valleyFt > 0 ? r1(m.valleyFt) : 12) : est && est.count > 0 ? est.ftEach : 12,
    valleyMatPerFt: valley.matPerFt,
    valleyLaborPerFt: valley.laborPerFt,
    stepWallCount: m && m.stepFlashFt > 0 ? 1 : 0,
    stepWallFtEach: m && m.stepFlashFt > 0 ? r1(m.stepFlashFt) : 10,
    stepSizeId: step.id,
    stepPerPiece: step.perPiece,
    stepLaborPerFt: STEP_FLASHING_LABOR_PER_FT,
    apronFt: 0,
    apronPerFt: APRON_PER_FT,
    apronLaborPerFt: APRON_LABOR_PER_FT,
    counterFt: 0,
    counterPerFt: COUNTER_PER_FT,
    counterLaborPerFt: COUNTER_LABOR_PER_FT,
    pipeBoots: { small: 2, medium: 1, large: 0 },
    pipeBootPrices: Object.fromEntries(PIPE_BOOT_SIZES.map((p) => [p.id, { each: p.each, labor: p.labor }])),
    chimneyCount: facts.chimney ? 1 : 0,
    chimneySizeId: chimneySize.id,
    chimneyEach: chimneySize.each,
    chimneyLabor: chimneySize.labor,
    curbCount: facts.rooftopAcCount ?? 0,
    curbEach: CURB_EACH,
    curbLabor: CURB_LABOR,
    // A flat roof — even under a low-slope metal system — has no attic
    // ventilation to size; a pitched roof gets ridge exhaust and balanced intake.
    vents: isFlatRoof(facts)
      ? []
      : [
          { id: ridgeVent.id, qty: ridgeFt, each: ridgeVent.each, labor: ridgeVent.labor },
          { id: soffit.id, qty: Math.ceil(intakeNeed / soffit.nfaSqIn), each: soffit.each, labor: soffit.labor },
        ],
    ventBalanced: true,
    tearOffLayers: 1,
    tearOffPerSqLayer: TEAROFF_LABOR_PER_SQ_LAYER,
    disposalPerSqLayer: DISPOSAL_PER_SQ_LAYER,
    plywoodSheets: 0,
    plywoodEach: PLYWOOD_SHEET_EACH,
    plywoodLabor: PLYWOOD_SHEET_LABOR,
    nailsPerSq: NAILS_PER_SQ,
    sealantPerSq: SEALANT_PER_SQ,
    cleanupLump: CLEANUP_LUMP,
    safetyLump: STEEP_SAFETY_LUMP,
    permitLump: 0,
    deliveryLump: MATERIAL_DELIVERY_LUMP,
    custom: [],
    flat: seedFlat(facts, sys, facts.buildingUse === "commercial"),
    commercial: defaultCommercial(facts.buildingUse === "commercial"),
    systemAuto: true,
  };
  return sys.family === "low-slope" ? flattenForLowSlope(base) : base;
}

/** The outline perimeter this roof's spec starts from, ft; 0 when unknown. */
function perimeterOf(facts: RoofFacts): number {
  const m = facts.measured ?? null;
  if (m) return Math.max(0, m.eaveFt + m.rakeFt);
  const e = estimateEdges(facts);
  return e ? Math.max(0, e.eaveFt + e.rakeFt) : 0;
}

/**
 * The flat-roof assembly a roof starts with. Residential and commercial start
 * differently — a house's flat roof gets no crane, drains, cores, walkway or
 * NDL warranty unless the contractor adds them; a commercial deck gets code
 * insulation, coping on its parapets, drains with overflows and the rest.
 */
export function seedFlat(facts: RoofFacts, sys: RoofSystem, commercial: boolean): FlatSpec {
  const rule = sys.family === "low-slope" ? lowSlopeRule(sys.id, sys.label) : lowSlopeRule("tpo");
  const boards = takesBoards(rule);
  const surface = isSurfaceApplied(rule);
  const sq = Math.max(0, facts.squares);
  const area = facts.footprintSqft != null && facts.footprintSqft > 0 ? facts.footprintSqft : sq * 100;
  const P = r1(perimeterOf(facts));
  const singlePly = rule.membrane === "tpo" || rule.membrane === "pvc" || rule.membrane === "kee" || rule.membrane === "epdm";
  // A recover (a cap sheet over the existing roof) and anything surface-applied
  // gets no new boards, drains, crane or manufacturer NDL by default — those
  // belong to a tear-off to the deck.
  const over = surface || !!rule.recover;
  const newBoards = boards && !over;
  const insId = commercial && newBoards ? "iso_r25" : "none";
  const coverId = !newBoards ? "none" : commercial ? (rule.method === "torch" || rule.method === "hot" ? "gypsum_14" : "hd_iso") : singlePly && rule.method !== "ballasted" ? "hd_iso" : "none";
  const ins = INSULATION_OPTIONS.find((o) => o.id === insId) ?? INSULATION_OPTIONS[0];
  const cover = COVER_BOARDS.find((o) => o.id === coverId) ?? COVER_BOARDS[0];
  const rtu = Math.max(0, facts.rooftopAcCount ?? 0);
  const drains = commercial && !over ? Math.max(2, Math.ceil(area / 5000)) : 0;
  const crane = !over && (commercial || rule.method === "ballasted" || rule.method === "overburden");
  const ndl = commercial && !over && rule.method !== "nailed";
  const warranty = WARRANTIES.find((w) => w.id === (ndl ? "ndl_20" : "none")) ?? WARRANTIES[0];
  return {
    insulationId: ins.id,
    insulationMatPerSq: ins.matPerSq,
    insulationLaborPerSq: ins.laborPerSq,
    insulationThicknessIn: ins.thicknessIn,
    coverBoardId: cover.id,
    coverBoardMatPerSq: cover.matPerSq,
    coverBoardLaborPerSq: cover.laborPerSq,
    coverBoardThicknessIn: cover.thicknessIn,
    taperedSqft: commercial && newBoards ? 50 * rtu + 16 * drains : 0,
    // The perimeter split is a fact about the building, so it holds for a
    // coating too: the coating keeps the existing metal (no edge or coping
    // lines), but the open edges still need fall protection.
    parapetFt: commercial ? P : 0,
    parapetHeightIn: 24,
    edgeMetalFt: commercial ? 0 : P,
    wallFt: facts.measured ? r1(Math.max(0, facts.measured.stepFlashFt)) : 0,
    nailersOn: commercial && newBoards,
    drains,
    drainWork: "insert",
    secondary: drains > 0 ? "scupper" : "none",
    scuppers: 0,
    gutterFt: 0,
    pitchPockets: 0,
    pipeBoots: surface ? 0 : commercial ? Math.max(4, Math.round(sq / 15)) : 3,
    curbs: facts.chimney ? 1 : 0,
    rtuCount: rtu,
    rtuResetCount: 0,
    walkwayFt: commercial && rtu > 0 ? 25 + 12 * rtu : 0,
    craneHours: crane ? Math.max(4, Math.ceil(sq / 22)) : 0,
    hoistOn: !crane,
    coreCuts: over ? Math.max(3, Math.ceil(area / 5000)) : commercial ? 2 : 0,
    warrantyId: warranty.id,
    warrantyPerSq: warranty.perSq,
    existing: existingLowSlopeOf(facts.existingMaterial),
    wetInsulationSqft: 0,
    primerOn: !!rule.primer,
    productionSqPerDay: commercial ? 24 : 15,
    rates: { ...FLAT_RATE_DEFAULTS },
  };
}

/** Groups of flat fields that move together: an option id and the prices copied from it. */
const SEED_GROUPS: ReadonlyArray<ReadonlyArray<keyof FlatSpec>> = [
  ["insulationId", "insulationMatPerSq", "insulationLaborPerSq", "insulationThicknessIn"],
  ["coverBoardId", "coverBoardMatPerSq", "coverBoardLaborPerSq", "coverBoardThicknessIn"],
  ["warrantyId", "warrantyPerSq"],
  ["taperedSqft"], ["parapetFt"], ["edgeMetalFt"], ["nailersOn"], ["drains"], ["secondary"], ["pipeBoots"],
  ["walkwayFt"], ["craneHours"], ["hoistOn"], ["coreCuts"], ["productionSqPerDay"], ["primerOn"], ["curbs"], ["rtuCount"], ["wallFt"],
];

/**
 * Move a flat spec from one seed to another WITHOUT losing the contractor's
 * work: a group of fields that still holds exactly what the old seed put
 * there was never touched, so it takes the new seed; anything they changed
 * stays. This is what keeps a commercial TPO tear-off whole after a detour
 * through a coating, and a typed parapet length intact after answering
 * "commercial" (review, 2026-09-14).
 */
function reseedFlat(flat: FlatSpec, oldSeed: FlatSpec, newSeed: FlatSpec, only?: ReadonlyArray<keyof FlatSpec>): FlatSpec {
  const out: FlatSpec = { ...flat };
  const rec = out as unknown as Record<string, unknown>;
  for (const group of SEED_GROUPS) {
    if (only && !group.some((k) => only.includes(k))) continue;
    // An option group (insulation, cover board, warranty) is judged by its
    // option id alone: the contractor's saved price for that option is laid
    // on after, and must not read as "edited" (re-check, 2026-09-14).
    const judged = group[0].endsWith("Id") ? [group[0]] : group;
    const untouched = judged.every((k) => flat[k] === oldSeed[k]);
    if (untouched) for (const k of group) rec[k] = newSeed[k];
  }
  return out;
}

function systemOf(spec: RoofPackageSpec, lists: CatalogLists): RoofSystem {
  return lists.systems.find((s) => s.id === spec.systemId) ?? { id: spec.systemId, label: spec.systemName, family: spec.systemFamily, matPerSq: spec.systemMatPerSq, laborPerSq: spec.systemLaborPerSq, wastePct: spec.wastePct, capPerFt: spec.capPerFt };
}

/**
 * Turn commercial pricing on or off for this roof. The flat-roof defaults that
 * differ between a house and a commercial deck follow the switch — but only
 * where the contractor has not already changed them; nothing happens when the
 * class is already the one asked for.
 */
export function withJobClass(spec: RoofPackageSpec, facts: RoofFacts, lists: CatalogLists, commercial: boolean): RoofPackageSpec {
  if (spec.commercial.on === commercial) return spec;
  const sys = systemOf(spec, lists);
  const flat = reseedFlat(spec.flat, seedFlat(facts, sys, !commercial), seedFlat(facts, sys, commercial));
  return { ...spec, flat, commercial: { ...spec.commercial, on: commercial } };
}

/**
 * A full measurement report landed for the roof that is open: take its
 * lengths in place (edges, and valleys and sidewalls unless the contractor
 * typed their own), instead of rebuilding the whole spec and wiping custom
 * lines, counts and a deliberate system pick.
 */
export function withMeasured(spec: RoofPackageSpec, facts: RoofFacts, lists: CatalogLists = BUILTIN_LISTS): RoofPackageSpec {
  const m = facts.measured ?? null;
  if (!m) return spec;
  if (spec.systemFamily === "low-slope") {
    const perimeter = r1(Math.max(0, m.eaveFt + m.rakeFt));
    // The parapet / open-edge split and the wall run still holding the
    // estimate's figures move to the measured ones; typed lengths stay.
    const sys = systemOf(spec, lists);
    const before = seedFlat({ ...facts, measured: null }, sys, spec.commercial.on);
    const after = seedFlat(facts, sys, spec.commercial.on);
    const flat = reseedFlat(spec.flat, before, after, ["parapetFt", "edgeMetalFt", "wallFt"]);
    return { ...spec, eaveFt: perimeter, rakeFt: 0, ridgeFt: 0, hipFt: 0, edgesBasis: "measured", flat };
  }
  const next: RoofPackageSpec = { ...spec, eaveFt: r1(m.eaveFt), rakeFt: r1(m.rakeFt), ridgeFt: r1(m.ridgeFt), hipFt: r1(m.hipFt), edgesBasis: "measured" };
  if (!(spec.valleyBasis === "entered" && spec.valleyCount > 0)) {
    next.valleyCount = m.valleyFt > 0 ? 1 : 0;
    next.valleyFtEach = m.valleyFt > 0 ? r1(m.valleyFt) : spec.valleyFtEach;
    next.valleyBasis = "measured";
  }
  if (!(spec.stepBasis === "entered" && spec.stepWallCount > 0)) {
    next.stepWallCount = m.stepFlashFt > 0 ? 1 : 0;
    next.stepWallFtEach = m.stepFlashFt > 0 ? r1(m.stepFlashFt) : spec.stepWallFtEach;
    next.stepBasis = "measured";
  }
  // The ridge vent follows the ridge while it still runs the old ridge length.
  next.vents = spec.vents.map((v) => (v.id === "ridge" && Math.abs(v.qty - spec.ridgeFt) < 0.05 ? { ...v, qty: next.ridgeFt } : v));
  return next;
}

/**
 * A spec on a low-slope system carries none of the shingle package: no
 * underlayment row, ice & water, starter, drip edge, ridge or hip cap,
 * valleys, step or apron flashing, attic vents, nails, steep-slope safety or
 * shingle delivery. The whole outline becomes perimeter, and the tear-off is
 * priced by what is coming off (a gravel built-up roof is twice a single-ply).
 */
export function flattenForLowSlope(spec: RoofPackageSpec): RoofPackageSpec {
  const rule = lowSlopeRule(spec.systemId, spec.systemName);
  const ex = EXISTING_LOW_SLOPE.find((e) => e.id === spec.flat.existing) ?? EXISTING_LOW_SLOPE[0];
  const overExisting = isSurfaceApplied(rule) || !!rule.recover;
  return {
    ...spec,
    capPerFt: 0,
    underlaymentId: "none",
    underlaymentName: "None · membrane system",
    underlaymentPerSq: 0,
    iceWater: "none",
    eaveFt: r1(Math.max(0, spec.eaveFt + spec.rakeFt)),
    rakeFt: 0,
    ridgeFt: 0,
    hipFt: 0,
    dripEdgeOn: false,
    starterOn: false,
    valleyCount: 0,
    valleyBasis: "entered",
    stepWallCount: 0,
    apronFt: 0,
    counterFt: 0,
    chimneyCount: 0,
    curbCount: 0,
    vents: [],
    nailsPerSq: 0,
    sealantPerSq: 0,
    safetyLump: 0,
    deliveryLump: 0,
    tearOffLayers: overExisting ? 0 : spec.tearOffLayers > 0 ? spec.tearOffLayers : 1,
    tearOffPerSqLayer: ex.tearOffPerSqLayer,
    disposalPerSqLayer: ex.disposalPerSqLayer,
  };
}

/**
 * Put a different system on the spec. Crossing between steep and flat
 * rebuilds the roof-shaped part from this roof's defaults (a shingle package
 * and a membrane assembly share almost nothing) and keeps what is the
 * contractor's: custom lines, commercial settings, the flat rates. Within
 * steep roofs the underlayment and valley follow the family; within flat
 * roofs the choices that depend on HOW the system goes down follow it (a
 * torch needs a gypsum cover board; a coating goes over the existing roof).
 */
export function withSystem(spec: RoofPackageSpec, sys: RoofSystem, facts: RoofFacts, lists: CatalogLists): RoofPackageSpec {
  const wasLow = spec.systemFamily === "low-slope";
  const toLow = sys.family === "low-slope";
  if (wasLow !== toLow) {
    const fresh = defaultSpecWith({ ...facts, buildingUse: spec.commercial.on ? "commercial" : "residential" }, lists, sys);
    return {
      ...fresh,
      custom: spec.custom,
      commercial: spec.commercial,
      flat: { ...fresh.flat, rates: spec.flat.rates, drainWork: spec.flat.drainWork, productionSqPerDay: spec.flat.productionSqPerDay },
      plywoodSheets: spec.plywoodSheets,
      cleanupLump: spec.cleanupLump,
      permitLump: spec.permitLump,
    };
  }
  const prevRule = wasLow ? lowSlopeRule(spec.systemId, spec.systemName) : null;
  let next: RoofPackageSpec = {
    ...spec,
    systemId: sys.id,
    systemName: sys.label,
    systemFamily: sys.family,
    systemMatPerSq: sys.matPerSq,
    systemLaborPerSq: sys.laborPerSq,
    capPerFt: toLow ? 0 : sys.capPerFt,
    wastePct: sys.wastePct,
  };
  if (toLow) {
    const rule = lowSlopeRule(sys.id, sys.label);
    const overExisting = isSurfaceApplied(rule) || !!rule.recover;
    const wasOver = prevRule ? isSurfaceApplied(prevRule) || !!prevRule.recover : false;
    const facts2 = { ...facts, buildingUse: spec.commercial.on ? ("commercial" as const) : ("residential" as const) };
    let flat = reseedFlat(next.flat, seedFlat(facts2, systemOf(spec, lists), spec.commercial.on), seedFlat(facts2, sys, spec.commercial.on));
    // A torch or a kettle never goes on bare polyiso, whatever was typed.
    const hot = rule.method === "torch" || rule.method === "hot";
    if (hot && flat.insulationId !== "none" && (flat.coverBoardId === "none" || flat.coverBoardId === "hd_iso")) {
      const g = COVER_BOARDS.find((c) => c.id === "gypsum_14")!;
      flat = { ...flat, coverBoardId: g.id, coverBoardMatPerSq: g.matPerSq, coverBoardLaborPerSq: g.laborPerSq, coverBoardThicknessIn: g.thicknessIn };
    }
    next = { ...next, flat, tearOffLayers: overExisting ? 0 : wasOver && next.tearOffLayers === 0 ? 1 : next.tearOffLayers };
    return next;
  }
  // Steep to steep: an underlayment of the wrong kind for the family, and the
  // family's own valley while the valley is still the old family's default.
  const has = (id: string) => lists.underlayments.find((u) => u.id === id) ?? null;
  const cur = next.underlaymentId;
  const oldDefault = underlaymentForFamily(spec.systemFamily, lists);
  const newDefault = underlaymentForFamily(sys.family, lists);
  const und =
    // Still the old family's own default (tile's high-temp synthetic on the
    // way to shingles): take the new family's default, so a detour never
    // becomes the shingle default (re-check, 2026-09-14).
    oldDefault && newDefault && cur === oldDefault.id && oldDefault.id !== newDefault.id
      ? newDefault
      : sys.family === "metal" || sys.family === "tile" || sys.family === "slate"
        ? ["synthetic", "felt15", "felt30", "paper60", "none"].includes(cur) ? has("synthetic_premium") : null
        : cur === "none" ? has("synthetic") : null;
  if (und) next = { ...next, underlaymentId: und.id, underlaymentName: und.label, underlaymentPerSq: und.perSq };
  const oldValley = VALLEY_FOR_FAMILY[spec.systemFamily];
  const newValley = VALLEY_FOR_FAMILY[sys.family];
  if (newValley && next.valleyTypeId === oldValley && oldValley !== newValley) {
    const v = VALLEY_TYPES.find((x) => x.id === newValley);
    if (v) next = { ...next, valleyTypeId: v.id, valleyMatPerFt: v.matPerFt, valleyLaborPerFt: v.laborPerFt };
  }
  return next;
}

export interface VentCheck {
  requiredSqIn: number;
  exhaustSqIn: number;
  intakeSqIn: number;
  ratio: number;
  ok: boolean;
  poweredExhaust: number;
}

/** Net-free-area check against the attic floor (the footprint stands in for it). */
export function checkVentilation(spec: RoofPackageSpec, facts: RoofFacts): VentCheck | null {
  if (spec.systemFamily === "low-slope" || isFlatRoof(facts)) return null;
  const attic = facts.footprintSqft;
  if (attic == null || attic <= 0) return null;
  const ratio = spec.ventBalanced ? NFA_RATIO_BALANCED : NFA_RATIO_PLAIN;
  const requiredSqIn = (attic * 144) / ratio;
  let exhaustSqIn = 0;
  let intakeSqIn = 0;
  let poweredExhaust = 0;
  for (const v of spec.vents) {
    const t = VENT_TYPES.find((x) => x.id === v.id);
    if (!t || v.qty <= 0) continue;
    if (t.nfaSqIn === 0) poweredExhaust += v.qty;
    else if (t.role === "intake") intakeSqIn += v.qty * t.nfaSqIn;
    else exhaustSqIn += v.qty * t.nfaSqIn;
  }
  // Balanced: at least half the requirement as intake, the rest exhaust (a
  // powered unit counts as exhaust covered, but still wants intake to feed it).
  const half = requiredSqIn / 2;
  const ok = intakeSqIn >= half * 0.95 && (poweredExhaust > 0 || exhaustSqIn >= half * 0.95);
  return { requiredSqIn, exhaustSqIn, intakeSqIn, ratio, ok, poweredExhaust };
}

export interface RoofPackage {
  materials: PkgLine[];
  labor: PkgLine[];
  /** For the contractor: where every number came from, what to confirm. Never sent to the client. */
  assumptions: string[];
  /** For the client: the work, in plain sentences — the proposal's scope of work. No estimates, confirmations or markups. */
  scope: string[];
  vent: VentCheck | null;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const fmt = (n: number) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

export function buildRoofPackage(spec: RoofPackageSpec, facts: RoofFacts): RoofPackage {
  const lowSlope = spec.systemFamily === "low-slope";
  const built = lowSlope ? buildLowSlope(spec, facts) : buildSteep(spec, facts);
  const c = spec.commercial ?? defaultCommercial(false);
  const surface = lowSlope && isSurfaceApplied(lowSlopeRule(spec.systemId, spec.systemName));
  applyCommercial(built.materials, built.labor, built.assumptions, {
    c,
    squares: facts.squares,
    footprintSqft: facts.footprintSqft,
    tearOffLayers: surface ? 0 : spec.tearOffLayers,
  });
  built.assumptions.push("Unit prices are the contractor's defaults, edited per estimate; every quantity is labelled measured, estimated or entered.");
  if (c.on) {
    built.scope.push(`Commercial project requirements: mobilization and staging, a site safety plan, permits and inspections${!surface && spec.tearOffLayers > 0 ? ", and an asbestos survey before tear-off" : ""}.`);
  }
  const plain = (l: TaggedLine): PkgLine => ({ name: l.name, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice, kind: l.kind, basis: l.basis });
  return { materials: built.materials.map(plain), labor: built.labor.map(plain), assumptions: built.assumptions, scope: built.scope, vent: built.vent };
}

interface BuiltPackage {
  materials: TaggedLine[];
  labor: TaggedLine[];
  assumptions: string[];
  /** Client-facing sentences about the work — see RoofPackage.scope. */
  scope: string[];
  vent: VentCheck | null;
}

const BASIS_RANK: Record<Basis, number> = { entered: 0, estimated: 1, measured: 2 };
const weaker = (a: Basis, b: Basis): Basis => (BASIS_RANK[a] <= BASIS_RANK[b] ? a : b);

function buildSteep(spec: RoofPackageSpec, facts: RoofFacts): BuiltPackage {
  const materials: PkgLine[] = [];
  const labor: PkgLine[] = [];
  const assumptions: string[] = [];
  const sq = Math.max(0, facts.squares);
  const sqWaste = r1(sq * (1 + spec.wastePct / 100));
  const sysName = spec.systemName.trim() || "Roofing";
  const family: RoofFamily = spec.systemFamily ?? "asphalt";
  const edgeB = spec.edgesBasis;
  const perimeter = spec.eaveFt + spec.rakeFt;

  // ── Materials ──
  materials.push({ name: sysName, quantity: sqWaste, unit: "square", unitPrice: spec.systemMatPerSq, kind: "material", basis: facts.squaresBasis });
  if (spec.underlaymentPerSq > 0 && spec.underlaymentId !== "none") {
    materials.push({ name: spec.underlaymentName.trim() || "Underlayment", quantity: sqWaste, unit: "square", unitPrice: spec.underlaymentPerSq, kind: "material", basis: facts.squaresBasis });
  }
  // A full-deck peel & stick underlayment already IS the ice & water barrier.
  if (spec.iceWater !== "none" && spec.underlaymentId !== "peel_stick") {
    const valleyFt = spec.valleyCount * spec.valleyFtEach;
    const valleyPart = spec.iceWater === "eaves_valleys" ? valleyFt * ICE_WATER_VALLEY_BAND_FT : 0;
    const sqft = spec.iceWater === "full" ? sqWaste * 100 : spec.eaveFt * ICE_WATER_EAVE_BAND_FT + valleyPart;
    const where = spec.iceWater === "full" ? "full deck" : spec.iceWater === "eaves" ? "eaves" : "eaves + valleys";
    const basis = spec.iceWater === "full" ? facts.squaresBasis : valleyPart > 0 ? weaker(edgeB, spec.valleyBasis ?? "entered") : edgeB;
    if (sqft > 0) materials.push({ name: `Ice & water shield · ${where}`, quantity: Math.ceil(sqft), unit: "sq ft", unitPrice: spec.iceWaterPerSqft, kind: "material", basis });
  }
  if (spec.dripEdgeOn && perimeter > 0) {
    const profile = DRIP_EDGE_PROFILES.find((p) => p.id === spec.dripProfileId)?.label ?? "Custom";
    const size = DRIP_EDGE_SIZES.find((s) => s.id === spec.dripSizeId)?.label ?? "";
    materials.push({ name: `Drip edge · ${profile}${size ? ` · ${size}` : ""}`, quantity: r1(perimeter), unit: "linear ft", unitPrice: spec.dripPerFt, kind: "material", basis: edgeB });
  }
  if (spec.starterOn && perimeter > 0 && family !== "low-slope" && family !== "metal") {
    materials.push({ name: "Starter strip · eaves + rakes", quantity: r1(perimeter), unit: "linear ft", unitPrice: spec.starterPerFt, kind: "material", basis: edgeB });
  }
  const capFt = spec.ridgeFt + spec.hipFt;
  if (capFt > 0 && spec.capPerFt > 0) {
    materials.push({ name: family === "metal" ? "Ridge / hip cap · metal" : "Hip & ridge cap", quantity: r1(capFt), unit: "linear ft", unitPrice: spec.capPerFt, kind: "material", basis: edgeB });
  }
  const valleyFtTotal = spec.valleyCount * spec.valleyFtEach;
  const valleyType = VALLEY_TYPES.find((v) => v.id === spec.valleyTypeId);
  if (valleyFtTotal > 0 && spec.valleyMatPerFt > 0) {
    materials.push({ name: `Valley metal · ${valleyType?.label ?? "custom"}`, quantity: r1(valleyFtTotal), unit: "linear ft", unitPrice: spec.valleyMatPerFt, kind: "material", basis: spec.valleyBasis ?? "entered" });
  }
  const stepFt = spec.stepWallCount * spec.stepWallFtEach;
  if (stepFt > 0) {
    const size = STEP_FLASHING_SIZES.find((s) => s.id === spec.stepSizeId);
    const pieces = Math.ceil((stepFt * 12) / (size?.exposureIn ?? 5.625));
    materials.push({ name: `Step flashing · ${size?.label ?? "custom"} · ${spec.stepWallCount} wall${spec.stepWallCount === 1 ? "" : "s"}`, quantity: pieces, unit: "each", unitPrice: spec.stepPerPiece, kind: "material", basis: spec.stepBasis ?? "entered" });
  }
  if (spec.apronFt > 0) materials.push({ name: "Apron / headwall flashing", quantity: r1(spec.apronFt), unit: "linear ft", unitPrice: spec.apronPerFt, kind: "material", basis: "entered" });
  if (spec.counterFt > 0) materials.push({ name: "Counter flashing", quantity: r1(spec.counterFt), unit: "linear ft", unitPrice: spec.counterPerFt, kind: "material", basis: "entered" });
  for (const size of PIPE_BOOT_SIZES) {
    const n = spec.pipeBoots[size.id] ?? 0;
    if (n > 0) materials.push({ name: `Pipe boot · ${size.label}`, quantity: n, unit: "each", unitPrice: spec.pipeBootPrices[size.id]?.each ?? size.each, kind: "material", basis: "entered" });
  }
  if (spec.chimneyCount > 0) {
    const size = CHIMNEY_SIZES.find((c) => c.id === spec.chimneySizeId)?.label ?? "";
    materials.push({ name: `Chimney flashing kit${size ? ` · ${size}` : ""}`, quantity: spec.chimneyCount, unit: "each", unitPrice: spec.chimneyEach, kind: "material", basis: facts.chimney != null ? "measured" : "entered" });
  }
  if (spec.curbCount > 0) {
    materials.push({ name: "Curb flashing · rooftop unit / skylight", quantity: spec.curbCount, unit: "each", unitPrice: spec.curbEach, kind: "material", basis: facts.rooftopAcCount != null ? "measured" : "entered" });
  }
  for (const v of spec.vents) {
    const t = VENT_TYPES.find((x) => x.id === v.id);
    if (!t || v.qty <= 0) continue;
    materials.push({ name: t.label, quantity: t.unit === "each" ? Math.ceil(v.qty) : r1(v.qty), unit: t.unit, unitPrice: v.each, kind: "material", basis: t.id === "ridge" ? edgeB : "entered" });
  }
  if (spec.plywoodSheets > 0) materials.push({ name: "Roof deck replacement · ½ in plywood, 4 × 8 sheets", quantity: spec.plywoodSheets, unit: "each", unitPrice: spec.plywoodEach, kind: "material", basis: "entered" });
  if (spec.nailsPerSq > 0) materials.push({ name: "Roofing nails & fasteners", quantity: sqWaste, unit: "square", unitPrice: spec.nailsPerSq, kind: "material", basis: facts.squaresBasis });
  if (spec.sealantPerSq > 0) materials.push({ name: "Sealant, caulk & pipe collars", quantity: sqWaste, unit: "square", unitPrice: spec.sealantPerSq, kind: "material", basis: facts.squaresBasis });
  for (const c of spec.custom) {
    if (c.kind === "material" && c.name.trim()) materials.push({ name: c.name.trim(), quantity: c.qty, unit: c.unit, unitPrice: c.unitPrice, kind: "material", basis: "entered" });
  }

  // ── Labor ──
  const families = facts.pitchFamilies.filter((f) => f.share > 0);
  if (families.length) {
    for (const f of families) {
      const factor = pitchLaborFactor(f.pitch12, family);
      const share = families.length > 1 ? ` · ${pct(f.share)} of roof` : "";
      labor.push({
        name: `Install · ${sysName} · ${Math.round(f.pitch12)}/12${share}${factor > 1 ? " · steep-slope rate" : ""}`,
        quantity: r1(sq * f.share),
        unit: "square",
        unitPrice: Math.round(spec.systemLaborPerSq * factor),
        kind: "labor",
        basis: facts.pitchBasis ?? "entered",
      });
    }
  } else {
    labor.push({ name: `Install · ${sysName}`, quantity: r1(sq), unit: "square", unitPrice: spec.systemLaborPerSq, kind: "labor", basis: facts.squaresBasis });
    assumptions.push("No pitch stated — install labor priced at the standard-slope rate.");
  }
  if (spec.tearOffLayers > 0) {
    const L = spec.tearOffLayers;
    labor.push({ name: `Tear-off · ${L} layer${L === 1 ? "" : "s"}`, quantity: r1(sq), unit: "square", unitPrice: spec.tearOffPerSqLayer * L, kind: "labor", basis: facts.squaresBasis });
    labor.push({ name: "Disposal · dumpster & haul-off", quantity: r1(sq), unit: "square", unitPrice: spec.disposalPerSqLayer * L, kind: "labor", basis: facts.squaresBasis });
  } else {
    assumptions.push("No tear-off — the new roof goes over the existing layer (check local code allows it).");
  }
  if (valleyFtTotal > 0 && spec.valleyLaborPerFt > 0) labor.push({ name: `Valleys · ${valleyType?.label ?? "custom"}`, quantity: r1(valleyFtTotal), unit: "linear ft", unitPrice: spec.valleyLaborPerFt, kind: "labor", basis: spec.valleyBasis ?? "entered" });
  if (stepFt > 0 && spec.stepLaborPerFt > 0) labor.push({ name: "Step flashing · sidewalls", quantity: r1(stepFt), unit: "linear ft", unitPrice: spec.stepLaborPerFt, kind: "labor", basis: spec.stepBasis ?? "entered" });
  if (spec.apronFt > 0 && spec.apronLaborPerFt > 0) labor.push({ name: "Apron / headwall flashing", quantity: r1(spec.apronFt), unit: "linear ft", unitPrice: spec.apronLaborPerFt, kind: "labor", basis: "entered" });
  if (spec.counterFt > 0 && spec.counterLaborPerFt > 0) labor.push({ name: "Counter flashing · cut & seal", quantity: r1(spec.counterFt), unit: "linear ft", unitPrice: spec.counterLaborPerFt, kind: "labor", basis: "entered" });
  const boots = PIPE_BOOT_SIZES.reduce((a, s) => a + (spec.pipeBoots[s.id] ?? 0), 0);
  if (boots > 0) {
    const perBoot = PIPE_BOOT_SIZES.reduce((a, s) => a + (spec.pipeBoots[s.id] ?? 0) * (spec.pipeBootPrices[s.id]?.labor ?? s.labor), 0) / boots;
    labor.push({ name: "Pipe boots · set & seal", quantity: boots, unit: "each", unitPrice: Math.round(perBoot), kind: "labor", basis: "entered" });
  }
  if (spec.chimneyCount > 0) labor.push({ name: "Chimney flashing · install", quantity: spec.chimneyCount, unit: "each", unitPrice: spec.chimneyLabor, kind: "labor", basis: "entered" });
  if (spec.curbCount > 0) labor.push({ name: "Curb flashing · install", quantity: spec.curbCount, unit: "each", unitPrice: spec.curbLabor, kind: "labor", basis: "entered" });
  for (const v of spec.vents) {
    const t = VENT_TYPES.find((x) => x.id === v.id);
    if (!t || v.qty <= 0 || v.labor <= 0) continue;
    labor.push({ name: `${t.label} · install`, quantity: t.unit === "each" ? Math.ceil(v.qty) : r1(v.qty), unit: t.unit, unitPrice: v.labor, kind: "labor", basis: t.id === "ridge" ? edgeB : "entered" });
  }
  if (spec.plywoodSheets > 0) labor.push({ name: "Roof deck replacement · install", quantity: spec.plywoodSheets, unit: "each", unitPrice: spec.plywoodLabor, kind: "labor", basis: "entered" });
  const steep = families.some((f) => f.pitch12 >= STEEP_PITCH);
  if (steep && spec.safetyLump > 0) labor.push({ name: "Steep-slope safety · harnesses, anchors & staging", quantity: 1, unit: "lot", unitPrice: spec.safetyLump, kind: "labor", basis: facts.pitchBasis ?? "entered" });
  if (spec.cleanupLump > 0) labor.push({ name: "Cleanup & magnetic nail sweep", quantity: 1, unit: "lot", unitPrice: spec.cleanupLump, kind: "labor", basis: "entered" });
  if (spec.permitLump > 0) labor.push({ name: "Permit & inspection", quantity: 1, unit: "lot", unitPrice: spec.permitLump, kind: "labor", basis: "entered" });
  if ((spec.deliveryLump ?? 0) > 0) labor.push({ name: "Material delivery & rooftop load", quantity: 1, unit: "lot", unitPrice: spec.deliveryLump, kind: "labor", basis: "entered" });
  for (const c of spec.custom) {
    if (c.kind === "labor" && c.name.trim()) labor.push({ name: c.name.trim(), quantity: c.qty, unit: c.unit, unitPrice: c.unitPrice, kind: "labor", basis: "entered" });
  }

  // ── Assumptions: where every number came from ──
  assumptions.unshift(
    `Roof system: ${sysName}; underlayment: ${spec.underlaymentName.trim() || "none"}; waste ${spec.wastePct}%.`,
    `Roof size: ${sq.toFixed(1)} squares (${fmt(sq * 100)} sq ft) — ${facts.squaresBasis === "measured" ? "aerial data, calibrated" : "contractor's takeoff"}.`,
  );
  if (families.length) {
    assumptions.push(
      families.length > 1
        ? `Pitch: ${families.map((f) => `${Math.round(f.pitch12)}/12 on ${pct(f.share)}`).join(" + ")} — ${facts.pitchBasis ?? "entered"}; labor priced per family.`
        : `Pitch: ${Math.round(families[0].pitch12)}/12 — ${facts.pitchBasis ?? "entered"}.`,
    );
  }
  if (perimeter > 0 || capFt > 0) {
    const edgeList = `${fmt(spec.eaveFt)} ft eave, ${fmt(spec.rakeFt)} ft rake, ${fmt(spec.ridgeFt)} ft ridge, ${fmt(spec.hipFt)} ft hip`;
    assumptions.push(
      edgeB === "measured"
        ? `Edges: ${edgeList} — measured by the aerial measurement report${facts.measured ? ` #${facts.measured.reportId}` : ""}.`
        : edgeB === "estimated"
          ? `Edges: ${edgeList} — estimated from the ${facts.perimeterFt != null ? "building outline" : "footprint"}${facts.shape ? ` and the ${facts.shape.toLowerCase()} shape` : ""}; confirm on the photo.`
          : `Edges: ${edgeList} — entered by the contractor.`,
    );
  }
  if (spec.valleyCount > 0) {
    assumptions.push(
      `${spec.valleyCount} valley${spec.valleyCount === 1 ? "" : "s"} at ${fmt(spec.valleyFtEach)} ft — ${
        spec.valleyBasis === "measured"
          ? "measured by the aerial report"
          : spec.valleyBasis === "estimated"
            ? `estimated from ${facts.facetCount ?? "the"} roof facets${facts.shape ? ` on a ${facts.shape.toLowerCase()} roof` : ""}; confirm on the photo`
            : "entered"
      }.`,
    );
  }
  if (spec.stepWallCount > 0) assumptions.push(`${spec.stepWallCount} sidewall${spec.stepWallCount === 1 ? "" : "s"} at ${fmt(spec.stepWallFtEach)} ft of step flashing — ${spec.stepBasis === "measured" ? "measured by the aerial report" : "entered"}.`);
  const vent = checkVentilation(spec, facts);
  if (vent) {
    assumptions.push(
      `Ventilation: attic ${fmt(facts.footprintSqft ?? 0)} sq ft needs ${fmt(vent.requiredSqIn)} sq in net free area (1/${vent.ratio}); package provides ${fmt(vent.exhaustSqIn)} sq in exhaust${vent.poweredExhaust ? ` + ${vent.poweredExhaust} powered` : ""} and ${fmt(vent.intakeSqIn)} sq in intake — ${vent.ok ? "balanced" : "SHORT, add vents"}.`,
    );
  }
  // Tag the lines for the commercial re-pricing: the roofing material and
  // underlayment take job-lot pricing; the install lines take the crew
  // productivity band; crew-hour lines take wage and shift factors; disposal,
  // delivery and the safety lot are not crew hours; the permit is a fee.
  const taggedMaterials: TaggedLine[] = materials.map((l, i) => ({
    ...l,
    system: i === 0 || (l.name === (spec.underlaymentName.trim() || "Underlayment") && spec.underlaymentPerSq > 0),
  }));
  const customNames = new Set(spec.custom.filter((c) => c.kind === "labor").map((c) => c.name.trim()));
  const taggedLabor: TaggedLine[] = labor.map((l) => {
    const permit = l.name === "Permit & inspection";
    const notCrew = permit || customNames.has(l.name) || l.name.startsWith("Disposal") || l.name.startsWith("Material delivery") || l.name.startsWith("Steep-slope safety");
    return { ...l, install: l.name.startsWith("Install · "), wageable: !notCrew, residentialPermit: permit, passThrough: permit };
  });

  // What the client reads: the work, in sentences, with no estimate words.
  const scope: string[] = [];
  if (spec.tearOffLayers > 0) scope.push(`Remove the existing roof${spec.tearOffLayers > 1 ? ` (${spec.tearOffLayers} layers)` : ""} down to the deck and haul away the debris.`);
  else scope.push("Install the new roof over the existing layer.");
  if (spec.plywoodSheets > 0) scope.push("Replace damaged roof decking with ½ in plywood.");
  const und = spec.underlaymentId !== "none" && spec.underlaymentName.trim() ? spec.underlaymentName.trim().toLowerCase() : null;
  scope.push(`Install ${sysName}${und ? ` over ${und}` : ""}${spec.iceWater !== "none" && spec.underlaymentId !== "peel_stick" ? `, with ice & water shield at the ${spec.iceWater === "full" ? "full deck" : spec.iceWater === "eaves" ? "eaves" : "eaves and valleys"}` : ""}.`);
  const edgeWork = [spec.dripEdgeOn && perimeter > 0 ? "drip edge" : null, spec.starterOn && family !== "low-slope" && family !== "metal" && perimeter > 0 ? "starter" : null, capFt > 0 && spec.capPerFt > 0 ? (family === "metal" ? "ridge and hip trim" : "hip and ridge cap") : null].filter(Boolean);
  if (edgeWork.length) scope.push(`Install new ${edgeWork.join(", ")}.`);
  const flashWork = [valleyFtTotal > 0 ? "valleys" : null, stepFt > 0 ? "sidewalls" : null, spec.apronFt > 0 || spec.counterFt > 0 ? "headwalls" : null, PIPE_BOOT_SIZES.some((z) => (spec.pipeBoots[z.id] ?? 0) > 0) ? "pipes" : null, spec.chimneyCount > 0 ? "the chimney" : null, spec.curbCount > 0 ? "curbs and skylights" : null].filter(Boolean);
  if (flashWork.length) scope.push(`Flash the ${flashWork.join(", ").replace(/, ([^,]*)$/, " and $1")}.`);
  if (spec.vents.some((v) => v.qty > 0)) scope.push("Install roof ventilation.");
  if (spec.cleanupLump > 0) scope.push("Clean up the site and sweep for nails.");
  return { materials: taggedMaterials, labor: taggedLabor, assumptions, scope, vent };
}

/**
 * A flat / low-slope package: the membrane and HOW it goes down, the boards
 * under it, the metal and flashing at every edge and wall, the drains, the
 * curbs and boots, the rooftop logistics and the warranty. Which lines appear
 * is decided by the system's method (lowSlope.ts), never by guesswork about
 * the roof; every count and length is the spec's, which the contractor sees
 * and edits.
 */
function buildLowSlope(spec: RoofPackageSpec, facts: RoofFacts): BuiltPackage {
  const materials: TaggedLine[] = [];
  const labor: TaggedLine[] = [];
  const assumptions: string[] = [];
  const f = spec.flat;
  const rule: LowSlopeRule = lowSlopeRule(spec.systemId, spec.systemName);
  const boards = takesBoards(rule);
  const surface = isSurfaceApplied(rule);
  const sq = Math.max(0, facts.squares);
  const sqR = r1(sq);
  const sqWaste = r1(sq * (1 + spec.wastePct / 100));
  const sysName = spec.systemName.trim() || "Flat roof system";
  const SQ = facts.squaresBasis;
  const edgeB = spec.edgesBasis;
  const R = (k: Parameters<typeof rate>[1]) => rate(f, k);
  const n0 = (v: number) => (Number.isFinite(v) ? Math.max(0, v) : 0);
  const perimeter = n0(spec.eaveFt + spec.rakeFt);
  const parapet = n0(f.parapetFt);
  const edge = n0(f.edgeMetalFt);
  const wall = n0(f.wallFt);
  const tearing = spec.tearOffLayers > 0 && !surface;
  const area = facts.footprintSqft != null && facts.footprintSqft > 0 ? facts.footprintSqft : sq * 100;
  const days = Math.max(1, Math.ceil(sq / Math.max(1, f.productionSqPerDay || 15)));
  const mat = (l: Omit<TaggedLine, "kind">) => {
    if (l.quantity > 0) materials.push({ kind: "material", ...l });
  };
  const lab = (l: Omit<TaggedLine, "kind">) => {
    if (l.quantity > 0) labor.push({ kind: "labor", ...l });
  };

  // ── The membrane and how it goes down ──
  mat({ name: sysName, quantity: sqWaste, unit: "square", unitPrice: spec.systemMatPerSq, basis: SQ, system: true });
  switch (rule.method) {
    case "mech":
      mat({ name: "Membrane fasteners & seam plates", quantity: sqWaste, unit: "square", unitPrice: R("mechFasteners"), basis: SQ });
      break;
    case "induction":
      mat({ name: "Induction-weld plates & fasteners", quantity: sqWaste, unit: "square", unitPrice: R("inductionPlates"), basis: SQ });
      break;
    case "adhered":
      mat({ name: rule.fleece ? "Low-rise foam adhesive · fleece-back" : "Bonding adhesive · membrane", quantity: sqWaste, unit: "square", unitPrice: R(rule.fleece ? "foamAdhesive" : "bondingAdhesive"), basis: SQ });
      break;
    case "ballasted":
      mat({ name: "Ballast stone · #4 washed, 10 psf", quantity: sqR, unit: "square", unitPrice: R("ballastMat"), basis: SQ });
      lab({ name: "Ballast · place & spread", quantity: sqR, unit: "square", unitPrice: R("ballastLabor"), basis: SQ, wageable: true });
      break;
    case "torch":
      mat({ name: "Primer · deck & flashings", quantity: sqWaste, unit: "square", unitPrice: R("primerTorch"), basis: SQ });
      break;
    case "self_adhered":
      mat({ name: "Primer · self-adhered plies", quantity: sqWaste, unit: "square", unitPrice: R("primerSa"), basis: SQ });
      break;
    case "nailed":
      mat({ name: "Cap nails & lap cement", quantity: sqWaste, unit: "square", unitPrice: R("capNails"), basis: SQ });
      break;
    case "overburden":
      // The pavers or the planting sit on a waterproofing membrane and a root
      // barrier / protection course, which the overburden price does not include.
      mat({ name: "Waterproofing membrane, root barrier & protection course", quantity: sqWaste, unit: "square", unitPrice: R("waterproofMat"), basis: SQ });
      lab({ name: "Waterproofing under the overburden · install", quantity: sqR, unit: "square", unitPrice: R("waterproofLabor"), basis: SQ, wageable: true });
      break;
    default:
      break;
  }
  if (rule.membrane === "tpo" || rule.membrane === "pvc" || rule.membrane === "kee") {
    mat({ name: "Seam cleaner & cut-edge sealant", quantity: sqWaste, unit: "square", unitPrice: R("seamSingle"), basis: SQ });
  }
  if (rule.membrane === "epdm") {
    mat({ name: "Seam tape & splice primer · EPDM", quantity: sqWaste, unit: "square", unitPrice: R("seamEpdm"), basis: SQ });
  }

  // ── Boards: insulation, cover board, taper ──
  const insLabel = INSULATION_OPTIONS.find((o) => o.id === f.insulationId)?.label ?? "Insulation";
  const coverLabel = COVER_BOARDS.find((o) => o.id === f.coverBoardId)?.label ?? "Cover board";
  const insOn = boards && f.insulationId !== "none" && (f.insulationMatPerSq > 0 || f.insulationLaborPerSq > 0);
  const coverOn = boards && f.coverBoardId !== "none" && (f.coverBoardMatPerSq > 0 || f.coverBoardLaborPerSq > 0);
  if (insOn) {
    mat({ name: `Insulation · ${insLabel}`, quantity: sqWaste, unit: "square", unitPrice: f.insulationMatPerSq, basis: SQ });
    lab({ name: "Insulation · lay & fasten", quantity: sqR, unit: "square", unitPrice: f.insulationLaborPerSq, basis: SQ, wageable: true });
  }
  // Boards are fastened unless they are loose-laid under ballast or overburden,
  // or held by the induction plates that already secure the sheet.
  if ((insOn || (boards && f.coverBoardId !== "none")) && rule.method !== "ballasted" && rule.method !== "overburden" && rule.method !== "induction") {
    mat({ name: insOn ? "Insulation plates & fasteners" : "Cover board plates & fasteners", quantity: sqWaste, unit: "square", unitPrice: R("insFasteners"), basis: SQ });
  }
  if (coverOn) {
    mat({ name: `Cover board · ${coverLabel}`, quantity: sqWaste, unit: "square", unitPrice: f.coverBoardMatPerSq, basis: SQ });
    lab({ name: "Cover board · lay & fasten", quantity: sqR, unit: "square", unitPrice: f.coverBoardLaborPerSq, basis: SQ, wageable: true });
  }
  if (boards && f.taperedSqft > 0) {
    const t = Math.ceil(n0(f.taperedSqft));
    mat({ name: "Tapered insulation & crickets · to drains", quantity: t, unit: "sq ft", unitPrice: R("taperedMat"), basis: "entered" });
    lab({ name: "Tapered insulation & crickets · lay", quantity: t, unit: "sq ft", unitPrice: R("taperedLabor"), basis: "entered", wageable: true });
  }
  if (f.wetInsulationSqft > 0) {
    lab({ name: "Wet insulation · cut out & replace", quantity: Math.ceil(n0(f.wetInsulationSqft)), unit: "sq ft", unitPrice: R("wetIns"), basis: "entered", wageable: true });
  }

  // ── Surface prep for a coating or foam over the existing roof ──
  if (surface) {
    mat({ name: "Power wash & surface prep", quantity: sqR, unit: "square", unitPrice: R("washMat"), basis: SQ });
    lab({ name: "Power wash & surface prep", quantity: sqR, unit: "square", unitPrice: R("washLabor"), basis: SQ, wageable: true });
    mat({ name: "Seam, fastener & fabric reinforcement", quantity: sqR, unit: "square", unitPrice: R("repairMat"), basis: SQ });
    lab({ name: "Seam, fastener & fabric reinforcement", quantity: sqR, unit: "square", unitPrice: R("repairLabor"), basis: SQ, wageable: true });
    if (f.primerOn) {
      mat({ name: "Coating primer", quantity: sqR, unit: "square", unitPrice: R("primerCoatMat"), basis: SQ });
      lab({ name: "Coating primer · apply", quantity: sqR, unit: "square", unitPrice: R("primerCoatLabor"), basis: SQ, wageable: true });
    }
  }

  // ── Edges and walls ──
  if (!surface && edge > 0) {
    const nm = rule.method === "nailed" ? "Drip edge · gravel stop" : "Edge metal · ES-1 gravel stop / fascia";
    mat({ name: nm, quantity: r1(edge), unit: "linear ft", unitPrice: R("edgeMat"), basis: edgeB });
    lab({ name: `${nm} · install`, quantity: r1(edge), unit: "linear ft", unitPrice: R("edgeLabor"), basis: edgeB, wageable: true });
  }
  if (!surface && parapet > 0) {
    mat({ name: "Coping cap · parapet, ES-1", quantity: r1(parapet), unit: "linear ft", unitPrice: R("copingMat"), basis: edgeB });
    lab({ name: "Coping cap · cleat, set & seal", quantity: r1(parapet), unit: "linear ft", unitPrice: R("copingLabor"), basis: edgeB, wageable: true });
  }
  const courses = Math.max(1, Math.ceil(n0(f.parapetHeightIn) / 24));
  const baseFt = parapet * courses + wall;
  if (!surface && rule.method !== "nailed" && baseFt > 0) {
    const b: Basis = parapet > 0 ? edgeB : "entered";
    mat({ name: `Base flashing · parapets & walls${courses > 1 ? ` · ${courses} courses` : ""}`, quantity: r1(baseFt), unit: "linear ft", unitPrice: R("baseFlashMat"), basis: b });
    lab({ name: "Base flashing · adhere & terminate", quantity: r1(baseFt), unit: "linear ft", unitPrice: R("baseFlashLabor"), basis: b, wageable: true });
  }
  if (!surface && wall > 0) {
    mat({ name: "Termination bar & sealant · walls", quantity: r1(wall), unit: "linear ft", unitPrice: R("termBarMat"), basis: "entered" });
    lab({ name: "Termination bar · fasten & seal", quantity: r1(wall), unit: "linear ft", unitPrice: R("termBarLabor"), basis: "entered", wageable: true });
    mat({ name: "Counterflashing · surface-mount", quantity: r1(wall), unit: "linear ft", unitPrice: R("counterMat"), basis: "entered" });
    lab({ name: "Counterflashing · install", quantity: r1(wall), unit: "linear ft", unitPrice: R("counterLabor"), basis: "entered", wageable: true });
  }
  const riseIn = (insOn ? n0(f.insulationThicknessIn) : 0) + (coverOn ? n0(f.coverBoardThicknessIn) : 0);
  if (boards && tearing && f.nailersOn && edge > 0 && riseIn > 0) {
    const nc = Math.max(1, Math.ceil(riseIn / 1.5));
    mat({ name: `Wood nailers · 2× treated, ${nc} course${nc === 1 ? "" : "s"}`, quantity: r1(edge * nc), unit: "linear ft", unitPrice: R("nailerMat"), basis: edgeB });
    lab({ name: "Wood nailers · set & anchor", quantity: r1(edge * nc), unit: "linear ft", unitPrice: R("nailerLabor"), basis: edgeB, wageable: true });
  }

  // ── Drainage ──
  const drains = Math.round(n0(f.drains));
  if (!surface && drains > 0) {
    const kind = f.drainWork === "new" ? { name: "Roof drain · new body & leader", m: "drainNewMat", l: "drainNewLabor" } : f.drainWork === "ring" ? { name: "Roof drain · clamp ring & strainer", m: "drainRingMat", l: "drainRingLabor" } : { name: "Roof drain · retrofit insert", m: "drainInsertMat", l: "drainInsertLabor" };
    mat({ name: kind.name, quantity: drains, unit: "each", unitPrice: R(kind.m as "drainNewMat"), basis: "entered" });
    lab({ name: `${kind.name} · set & flash`, quantity: drains, unit: "each", unitPrice: R(kind.l as "drainNewLabor"), basis: "entered", wageable: true });
    if (f.secondary !== "none") {
      const sc = f.secondary === "scupper";
      const nm = sc ? "Overflow scupper · 2 in above the deck" : "Overflow drain · with water dam";
      mat({ name: nm, quantity: drains, unit: "each", unitPrice: R(sc ? "overflowScupperMat" : "overflowDrainMat"), basis: "entered" });
      lab({ name: `${nm} · install`, quantity: drains, unit: "each", unitPrice: R(sc ? "overflowScupperLabor" : "overflowDrainLabor"), basis: "entered", wageable: true });
    }
  }
  const scuppers = Math.round(n0(f.scuppers));
  if (scuppers > 0) {
    mat({ name: "Thru-wall scupper & collector head", quantity: scuppers, unit: "each", unitPrice: R("scupperMat"), basis: "entered" });
    lab({ name: "Thru-wall scupper · install & flash", quantity: scuppers, unit: "each", unitPrice: R("scupperLabor"), basis: "entered", wageable: true });
  }
  if (f.gutterFt > 0) {
    mat({ name: "Gutter · 6 in seamless", quantity: r1(n0(f.gutterFt)), unit: "linear ft", unitPrice: R("gutterMat"), basis: "entered" });
    lab({ name: "Gutter · hang", quantity: r1(n0(f.gutterFt)), unit: "linear ft", unitPrice: R("gutterLabor"), basis: "entered", wageable: true });
  }

  // ── Penetrations and curbs ──
  const boots = Math.round(n0(f.pipeBoots));
  if (boots > 0) {
    mat({ name: "Pipe boot · pre-moulded membrane", quantity: boots, unit: "each", unitPrice: R("bootMat"), basis: "entered" });
    lab({ name: "Pipe boots · flash & seal", quantity: boots, unit: "each", unitPrice: R("bootLabor"), basis: "entered", wageable: true });
  }
  const pockets = Math.round(n0(f.pitchPockets));
  if (pockets > 0) {
    mat({ name: "Pitch pocket · pourable sealer", quantity: pockets, unit: "each", unitPrice: R("pocketMat"), basis: "entered" });
    lab({ name: "Pitch pockets · form & fill", quantity: pockets, unit: "each", unitPrice: R("pocketLabor"), basis: "entered", wageable: true });
  }
  const rtu = Math.round(n0(f.rtuCount));
  if (!surface && rtu > 0) {
    const b: Basis = facts.rooftopAcCount != null && facts.rooftopAcCount === rtu ? "estimated" : "entered";
    mat({ name: "Rooftop unit curb · flashing & counterflashing", quantity: rtu, unit: "each", unitPrice: R("rtuMat"), basis: b });
    lab({ name: "Rooftop unit curb · flash", quantity: rtu, unit: "each", unitPrice: R("rtuLabor"), basis: b, wageable: true });
  }
  if (f.rtuResetCount > 0) {
    lab({ name: "Rooftop unit · disconnect, raise & reset (mechanical)", quantity: Math.round(n0(f.rtuResetCount)), unit: "each", unitPrice: R("rtuReset"), basis: "entered" });
  }
  const curbs = Math.round(n0(f.curbs));
  if (!surface && curbs > 0) {
    mat({ name: "Curb flashing · skylight, hatch, fan, chimney", quantity: curbs, unit: "each", unitPrice: R("curbMat"), basis: facts.chimney ? "measured" : "entered" });
    lab({ name: "Curb flashing · install", quantity: curbs, unit: "each", unitPrice: R("curbLabor"), basis: "entered", wageable: true });
  }

  // ── Rooftop: pads, hoisting, investigation ──
  if (f.walkwayFt > 0) {
    mat({ name: "Walkway pads · access & around units", quantity: r1(n0(f.walkwayFt)), unit: "linear ft", unitPrice: R("walkwayMat"), basis: "entered" });
    lab({ name: "Walkway pads · weld or adhere", quantity: r1(n0(f.walkwayFt)), unit: "linear ft", unitPrice: R("walkwayLabor"), basis: "entered", wageable: true });
  }
  if (f.craneHours > 0) {
    lab({ name: "Crane & operator · material up, debris down", quantity: r1(n0(f.craneHours)), unit: "hour", unitPrice: R("craneRate"), basis: "estimated" });
    lab({ name: "Crane mobilization", quantity: 1, unit: "lot", unitPrice: R("craneMob"), basis: "entered" });
  } else if (f.hoistOn) {
    lab({ name: "Ladder hoist / conveyor · material to the roof", quantity: 1, unit: "lot", unitPrice: R("hoist"), basis: "entered" });
  }
  if (f.coreCuts > 0) {
    lab({ name: "Core cuts · layers & moisture check", quantity: Math.round(n0(f.coreCuts)), unit: "each", unitPrice: R("coreEach"), basis: "entered" });
  }

  // ── Install ──
  lab({ name: `${surface ? "Apply" : "Install"} · ${sysName}`, quantity: sqR, unit: "square", unitPrice: spec.systemLaborPerSq, basis: SQ, install: true, wageable: true });
  if (rule.method === "hot") lab({ name: "Kettle, tanker & hot-asphalt setup", quantity: 1, unit: "lot", unitPrice: R("kettle"), basis: "entered" });
  if (rule.method === "torch") lab({ name: `Fire watch · after torch work, ${days} day${days === 1 ? "" : "s"}`, quantity: 2 * days, unit: "hour", unitPrice: R("fireWatch"), basis: "estimated", wageable: true });

  // ── Tear-off ──
  if (tearing) {
    const L = spec.tearOffLayers;
    const ex = EXISTING_LOW_SLOPE.find((e) => e.id === f.existing);
    lab({ name: `Tear-off · ${ex?.label.toLowerCase() ?? "existing roof"} · ${L} layer${L === 1 ? "" : "s"}`, quantity: sqR, unit: "square", unitPrice: spec.tearOffPerSqLayer * L, basis: SQ, wageable: true });
    lab({ name: "Disposal · roll-offs & dump fees", quantity: sqR, unit: "square", unitPrice: spec.disposalPerSqLayer * L, basis: SQ });
    if (f.existing === "bur_gravel") lab({ name: "Gravel vacuum & haul-off", quantity: sqR, unit: "square", unitPrice: R("gravelVac"), basis: SQ });
    if (days > 1) {
      lab({ name: `Night seal · daily tie-ins over ${days} days`, quantity: Math.round(Math.min(120, Math.sqrt(area)) * (days - 1)), unit: "linear ft", unitPrice: R("nightSeal"), basis: "estimated" });
    }
  }

  // ── Fall protection at every open edge (a 39 in parapet is its own guardrail) ──
  const lowParapet = n0(f.parapetHeightIn) < 39;
  const openFt = perimeter > 0 ? (lowParapet ? perimeter : Math.max(0, perimeter - parapet)) : edge + (lowParapet ? parapet : 0);
  if (openFt > 0) {
    lab({ name: "Fall protection · warning line & monitor", quantity: r1(openFt), unit: "linear ft", unitPrice: R("warningLine"), basis: edgeB });
  }

  // ── Warranty ──
  const w = WARRANTIES.find((x) => x.id === f.warrantyId);
  if (w && w.id !== "none" && f.warrantyPerSq > 0) {
    lab({ name: w.label, quantity: sqR, unit: "square", unitPrice: f.warrantyPerSq, basis: SQ, passThrough: true });
    lab({ name: "Manufacturer inspection & registration", quantity: 1, unit: "lot", unitPrice: R("warrantyInspection"), basis: "entered", passThrough: true });
  }

  // ── Shared extras ──
  if (spec.plywoodSheets > 0) {
    mat({ name: "Roof deck replacement · ½ in plywood, 4 × 8 sheets", quantity: spec.plywoodSheets, unit: "each", unitPrice: spec.plywoodEach, basis: "entered" });
    lab({ name: "Roof deck replacement · install", quantity: spec.plywoodSheets, unit: "each", unitPrice: spec.plywoodLabor, basis: "entered", wageable: true });
  }
  if (spec.cleanupLump > 0) lab({ name: "Cleanup & site restoration", quantity: 1, unit: "lot", unitPrice: spec.cleanupLump, basis: "entered", wageable: true });
  if (spec.permitLump > 0) lab({ name: "Permit & inspection", quantity: 1, unit: "lot", unitPrice: spec.permitLump, basis: "entered", residentialPermit: true, passThrough: true });
  if ((spec.deliveryLump ?? 0) > 0) lab({ name: "Material delivery & rooftop load", quantity: 1, unit: "lot", unitPrice: spec.deliveryLump, basis: "entered" });
  for (const c of spec.custom) {
    if (!c.name.trim()) continue;
    const line = { name: c.name.trim(), quantity: c.qty, unit: c.unit, unitPrice: c.unitPrice, basis: "entered" as Basis };
    if (c.kind === "material") mat(line);
    else lab(line);
  }

  // ── Where every number came from ──
  const seams = seamWords(rule);
  assumptions.push(
    `Roof system: ${sysName} — ${METHOD_WORDS[rule.method]}${seams ? `, ${seams}` : ""}; waste ${spec.wastePct}%.`,
    `Roof size: ${sq.toFixed(1)} squares (${fmt(sq * 100)} sq ft) — ${SQ === "measured" ? "aerial data, calibrated" : "contractor's takeoff"}. Flat roof: no ridge, hip, valley, starter or attic vents.`,
  );
  if (surface) {
    assumptions.push("Restoration over the existing roof: no tear-off, insulation or cover board. Wet areas the core cuts find are cut out and replaced before the coating goes on.");
  } else if (boards) {
    assumptions.push(
      insOn
        ? `Insulation: ${insLabel}${coverOn ? `, under a ${coverLabel.toLowerCase()} cover board` : ""}.`
        : `No above-deck insulation${coverOn ? ` — ${coverLabel.toLowerCase()} cover board only` : ""}.${spec.commercial?.on && tearing ? " A tear-off to the deck on a commercial building usually has to meet the energy code (about R-25 to R-30)." : ""}`,
    );
  }
  if (perimeter > 0 || parapet > 0 || edge > 0) {
    assumptions.push(
      `Perimeter ${fmt(perimeter)} ft (${edgeB === "measured" ? "measured by the aerial report" : edgeB === "estimated" ? "from the building outline" : "entered"}): ${fmt(parapet)} ft of parapet${surface ? " (existing coping kept)" : " with coping"}, ${fmt(edge)} ft of open edge${surface ? " (existing metal kept)" : ""}${wall > 0 ? `, plus ${fmt(wall)} ft where the roof meets a wall` : ""}.`,
    );
    if (perimeter > 0 && Math.abs(parapet + edge - perimeter) > 0.1 * perimeter) {
      assumptions.push(`Parapet plus open edge is ${fmt(parapet + edge)} ft against a ${fmt(perimeter)} ft perimeter — check the split before sending.`);
    }
  } else {
    assumptions.push("Roof perimeter unknown — enter the parapet and open-edge lengths to price coping, edge metal and fall protection.");
  }
  if (drains > 0) assumptions.push(`${drains} roof drain${drains === 1 ? "" : "s"}${f.secondary !== "none" ? ` with ${f.secondary === "scupper" ? "overflow scuppers" : "overflow drains"}` : ""} — about one per 5,000 sq ft; match the existing drain count on the photo.`);
  if (tearing) {
    const ex = EXISTING_LOW_SLOPE.find((e) => e.id === f.existing);
    assumptions.push(`Existing roof: ${ex?.label.toLowerCase() ?? "unknown"}, ${spec.tearOffLayers} layer${spec.tearOffLayers === 1 ? "" : "s"} — confirm with a core cut; a gravel built-up roof costs about twice a single-ply to remove.`);
  } else if (!surface && !rule.recover) {
    assumptions.push("No tear-off — the new roof goes over the existing one. Code allows one recover over a single dry covering; confirm with a core cut.");
  }
  if (w && w.id !== "none") assumptions.push(`${w.label}: the manufacturer's fee and inspection are billed at cost; a certified installer is required.`);

  // What the client reads: the work, in sentences, with no estimate words.
  const scope: string[] = [];
  if (surface) {
    scope.push(`Clean and prepare the existing roof, repair seams and fasteners with fabric reinforcement${f.primerOn ? ", prime" : ""}, and apply ${sysName}.`);
    if (f.wetInsulationSqft > 0) scope.push("Cut out and replace wet insulation found under the roof surface.");
  } else {
    if (tearing) scope.push(`Remove the existing roof down to the deck and haul away the debris.`);
    else if (rule.recover) scope.push("Prepare the existing roof to be covered.");
    if (spec.plywoodSheets > 0) scope.push("Replace damaged roof decking.");
    if (f.wetInsulationSqft > 0) scope.push("Cut out and replace wet insulation.");
    const boardsWork = [insOn ? `${insLabel.split(" · ")[0].toLowerCase()} insulation` : null, coverOn ? `a ${coverLabel.split(" · ")[0].toLowerCase()} cover board` : null, boards && f.taperedSqft > 0 ? "tapered insulation and crickets to drain" : null].filter(Boolean);
    if (boardsWork.length) scope.push(`Install ${boardsWork.join(", ").replace(/, ([^,]*)$/, " and $1")}.`);
    scope.push(`Install ${sysName} — ${METHOD_WORDS[rule.method]}${seams ? `, ${seams}` : ""}.`);
    const perimeterWork = [edge > 0 ? "new edge metal at the roof edges" : null, parapet > 0 ? "coping caps on the parapets" : null, baseFt > 0 && rule.method !== "nailed" ? "base flashing up the parapets and walls" : null].filter(Boolean);
    if (perimeterWork.length) scope.push(`Install ${perimeterWork.join(", ").replace(/, ([^,]*)$/, " and $1")}.`);
    const drainWork = [drains > 0 ? `roof drains${f.secondary !== "none" ? ` with ${f.secondary === "scupper" ? "overflow scuppers" : "overflow drains"}` : ""}` : null, scuppers > 0 ? "scuppers and collector heads" : null, f.gutterFt > 0 ? "gutters" : null].filter(Boolean);
    if (drainWork.length) scope.push(`Install ${drainWork.join(", ").replace(/, ([^,]*)$/, " and $1")}.`);
  }
  const detailWork = [boots > 0 ? "pipes" : null, pockets > 0 ? "irregular penetrations" : null, !surface && rtu > 0 ? "rooftop unit curbs" : null, !surface && curbs > 0 ? "skylights, hatches and curbs" : null].filter(Boolean);
  if (detailWork.length) scope.push(`Flash all ${detailWork.join(", ").replace(/, ([^,]*)$/, " and $1")}.`);
  if (f.rtuResetCount > 0) scope.push("Disconnect, raise and reset the rooftop units.");
  if (f.walkwayFt > 0) scope.push("Install walkway pads to the rooftop equipment.");
  if (w && w.id !== "none") scope.push(`${w.label.replace("Manufacturer NDL · ", "Manufacturer's no-dollar-limit warranty, ")}.`);
  if (spec.cleanupLump > 0) scope.push("Clean up the site on completion.");
  return { materials, labor, assumptions, scope, vent: null };
}
