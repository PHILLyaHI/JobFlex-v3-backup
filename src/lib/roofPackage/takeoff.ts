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
  CHIMNEY_SIZES,
  CLEANUP_LUMP,
  COUNTER_LABOR_PER_FT,
  COUNTER_PER_FT,
  CURB_EACH,
  CURB_LABOR,
  DISPOSAL_PER_SQ_LAYER,
  DRIP_EDGE_PROFILES,
  DRIP_EDGE_SIZES,
  ICE_WATER_EAVE_BAND_FT,
  ICE_WATER_PER_SQFT,
  ICE_WATER_VALLEY_BAND_FT,
  NAILS_PER_SQ,
  NFA_RATIO_BALANCED,
  NFA_RATIO_PLAIN,
  PIPE_BOOT_SIZES,
  PLYWOOD_SHEET_EACH,
  PLYWOOD_SHEET_LABOR,
  BUILTIN_LISTS,
  SEALANT_PER_SQ,
  STARTER_PER_FT,
  STEEP_PITCH,
  STEEP_SAFETY_LUMP,
  STEP_FLASHING_LABOR_PER_FT,
  STEP_FLASHING_SIZES,
  TEAROFF_LABOR_PER_SQ_LAYER,
  VALLEY_TYPES,
  VENT_TYPES,
  pitchLaborFactor,
  type Basis,
  type CatalogLists,
  type IceWaterCoverage,
  type LineKind,
  type PkgUnit,
  type RoofFamily,
} from "./catalog";

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
  /** Whether the edge lengths are the builder's estimate or the contractor's entry. */
  edgesBasis: Basis;
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
  custom: CustomLine[];
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
export function estimateEdges(facts: RoofFacts): { eaveFt: number; rakeFt: number; ridgeFt: number; hipFt: number } | null {
  const A = facts.footprintSqft ?? null;
  const P = facts.perimeterFt ?? (A != null ? 4 * Math.sqrt(A) * 1.05 : null);
  if (P == null) return null;
  const L = A != null ? Math.sqrt(A * 1.6) : P / 2 / (1 + 1 / 1.6);
  const W = A != null ? A / L : L / 1.6;
  const shape = (facts.shape ?? "").toLowerCase();
  const hip = shape.includes("hip");
  const gable = shape.includes("gable");
  const flat = shape.includes("flat");
  const eave = flat || hip ? P : gable ? Math.min(P, 2 * L) : P * 0.8;
  return {
    eaveFt: r1(eave),
    rakeFt: r1(Math.max(0, P - eave)),
    ridgeFt: r1(flat ? 0 : hip ? Math.max(0, L - W) : gable ? L : 0.7 * L),
    hipFt: r1(flat ? 0 : hip ? 2.83 * W : gable ? 0 : 1.4 * W),
  };
}

/** The spec the builder opens with for THIS roof: catalog defaults, facts filled in. */
export function defaultSpec(facts: RoofFacts, lists: CatalogLists = BUILTIN_LISTS): RoofPackageSpec {
  const sys = lists.systems.find((s) => s.id === "architectural") ?? lists.systems[0] ?? BUILTIN_LISTS.systems[1];
  const und = lists.underlayments.find((u) => u.id === "synthetic") ?? lists.underlayments[0] ?? BUILTIN_LISTS.underlayments[0];
  const edges = estimateEdges(facts);
  const drip = DRIP_EDGE_PROFILES[0];
  const valley = VALLEY_TYPES.find((v) => v.id === "open_w24")!;
  const step = STEP_FLASHING_SIZES[0];
  const chimneySize = CHIMNEY_SIZES[1];
  const ridgeVent = VENT_TYPES.find((v) => v.id === "ridge")!;
  const soffit = VENT_TYPES.find((v) => v.id === "soffit16x8")!;
  // Intake to balance the ridge: half the attic's requirement, in 16 × 8 vents.
  const attic = facts.footprintSqft ?? facts.squares * 100 * 0.8;
  const intakeNeed = (attic * 144) / NFA_RATIO_BALANCED / 2;
  const ridgeFt = edges?.ridgeFt ?? 0;
  return {
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
    edgesBasis: edges ? "estimated" : "entered",
    dripEdgeOn: true,
    dripProfileId: drip.id,
    dripSizeId: DRIP_EDGE_SIZES[1].id,
    dripPerFt: drip.perFt,
    starterOn: true,
    starterPerFt: STARTER_PER_FT,
    valleyTypeId: valley.id,
    valleyCount: 0,
    valleyFtEach: 12,
    valleyMatPerFt: valley.matPerFt,
    valleyLaborPerFt: valley.laborPerFt,
    stepWallCount: 0,
    stepWallFtEach: 10,
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
    vents: [
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
    custom: [],
  };
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
  assumptions: string[];
  vent: VentCheck | null;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const fmt = (n: number) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

export function buildRoofPackage(spec: RoofPackageSpec, facts: RoofFacts): RoofPackage {
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
  if (spec.underlaymentPerSq > 0 || spec.underlaymentName.trim()) {
    materials.push({ name: spec.underlaymentName.trim() || "Underlayment", quantity: sqWaste, unit: "square", unitPrice: spec.underlaymentPerSq, kind: "material", basis: facts.squaresBasis });
  }
  if (spec.iceWater !== "none") {
    const valleyFt = spec.valleyCount * spec.valleyFtEach;
    const sqft =
      spec.iceWater === "full"
        ? sqWaste * 100
        : spec.eaveFt * ICE_WATER_EAVE_BAND_FT + (spec.iceWater === "eaves_valleys" ? valleyFt * ICE_WATER_VALLEY_BAND_FT : 0);
    const where = spec.iceWater === "full" ? "full deck" : spec.iceWater === "eaves" ? "eaves" : "eaves + valleys";
    materials.push({ name: `Ice & water shield · ${where}`, quantity: Math.ceil(sqft), unit: "sq ft", unitPrice: spec.iceWaterPerSqft, kind: "material", basis: spec.iceWater === "full" ? facts.squaresBasis : edgeB });
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
    materials.push({ name: `Valley metal · ${valleyType?.label ?? "custom"}`, quantity: r1(valleyFtTotal), unit: "linear ft", unitPrice: spec.valleyMatPerFt, kind: "material", basis: "entered" });
  }
  const stepFt = spec.stepWallCount * spec.stepWallFtEach;
  if (stepFt > 0) {
    const size = STEP_FLASHING_SIZES.find((s) => s.id === spec.stepSizeId);
    const pieces = Math.ceil((stepFt * 12) / (size?.exposureIn ?? 5.625));
    materials.push({ name: `Step flashing · ${size?.label ?? "custom"} · ${spec.stepWallCount} wall${spec.stepWallCount === 1 ? "" : "s"}`, quantity: pieces, unit: "each", unitPrice: spec.stepPerPiece, kind: "material", basis: "entered" });
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
      const factor = pitchLaborFactor(f.pitch12);
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
  if (valleyFtTotal > 0 && spec.valleyLaborPerFt > 0) labor.push({ name: `Valleys · ${valleyType?.label ?? "custom"}`, quantity: r1(valleyFtTotal), unit: "linear ft", unitPrice: spec.valleyLaborPerFt, kind: "labor", basis: "entered" });
  if (stepFt > 0 && spec.stepLaborPerFt > 0) labor.push({ name: "Step flashing · sidewalls", quantity: r1(stepFt), unit: "linear ft", unitPrice: spec.stepLaborPerFt, kind: "labor", basis: "entered" });
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
    assumptions.push(
      edgeB === "estimated"
        ? `Edges: ${fmt(spec.eaveFt)} ft eave, ${fmt(spec.rakeFt)} ft rake, ${fmt(spec.ridgeFt)} ft ridge, ${fmt(spec.hipFt)} ft hip — estimated from the ${facts.perimeterFt != null ? "building outline" : "footprint"}${facts.shape ? ` and the ${facts.shape.toLowerCase()} shape` : ""}; confirm on the photo.`
        : `Edges: ${fmt(spec.eaveFt)} ft eave, ${fmt(spec.rakeFt)} ft rake, ${fmt(spec.ridgeFt)} ft ridge, ${fmt(spec.hipFt)} ft hip — entered by the contractor.`,
    );
  }
  if (spec.valleyCount > 0) assumptions.push(`${spec.valleyCount} valley${spec.valleyCount === 1 ? "" : "s"} at ${fmt(spec.valleyFtEach)} ft — entered.`);
  if (spec.stepWallCount > 0) assumptions.push(`${spec.stepWallCount} sidewall${spec.stepWallCount === 1 ? "" : "s"} at ${fmt(spec.stepWallFtEach)} ft of step flashing — entered.`);
  const vent = checkVentilation(spec, facts);
  if (vent) {
    assumptions.push(
      `Ventilation: attic ${fmt(facts.footprintSqft ?? 0)} sq ft needs ${fmt(vent.requiredSqIn)} sq in net free area (1/${vent.ratio}); package provides ${fmt(vent.exhaustSqIn)} sq in exhaust${vent.poweredExhaust ? ` + ${vent.poweredExhaust} powered` : ""} and ${fmt(vent.intakeSqIn)} sq in intake — ${vent.ok ? "balanced" : "SHORT, add vents"}.`,
    );
  }
  assumptions.push("Unit prices are the contractor's defaults, edited per estimate; every quantity is labelled measured, estimated or entered.");

  return { materials, labor, assumptions, vent };
}
