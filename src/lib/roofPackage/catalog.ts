// Roof package catalog — what a contractor can put on a roof, with US 2026
// ballpark DEFAULT prices. Every price here is a starting point the contractor
// edits in the builder; nothing is authoritative. Client-safe constants only.
//
// Units are the SIX words the proposal understands (see unitToType in
// actions/roofEstimator.ts): "square" (100 sq ft of roof), "sq ft",
// "linear ft", "each", "hour", "lot". The builder never emits anything else,
// so a converted proposal carries a real measurement on every line — the
// 2026-09-12 complaint was every AI line landing as "Unit".

export type PkgUnit = "square" | "sq ft" | "linear ft" | "each" | "hour" | "lot";
export type LineKind = "material" | "labor";
/** Where a quantity came from. Shown on the line so nobody prices a guess as a measurement. */
export type Basis = "measured" | "estimated" | "entered";

export interface CatalogOption {
  id: string;
  label: string;
}

// ── Roof systems ────────────────────────────────────────────────────────────
export interface RoofSystem extends CatalogOption {
  /** Shingle / panel / tile family — drives cap, starter and low-slope rules. */
  family: "asphalt" | "metal" | "tile" | "shake" | "slate" | "synthetic" | "low-slope";
  matPerSq: number;
  laborPerSq: number;
  /** Typical waste for this system; the builder's waste picker starts here. */
  wastePct: number;
  /** Hip & ridge cap, $ per linear ft of ridge + hip. */
  capPerFt: number;
}

export const ROOF_SYSTEMS: RoofSystem[] = [
  { id: "three_tab", label: "3-tab asphalt shingle", family: "asphalt", matPerSq: 95, laborPerSq: 175, wastePct: 10, capPerFt: 1.9 },
  { id: "architectural", label: "Architectural shingle (30-yr laminated)", family: "asphalt", matPerSq: 125, laborPerSq: 200, wastePct: 12, capPerFt: 2.1 },
  { id: "designer", label: "Luxury / designer shingle (Presidential-style)", family: "asphalt", matPerSq: 265, laborPerSq: 260, wastePct: 12, capPerFt: 3.6 },
  { id: "standing_seam", label: "Standing-seam metal", family: "metal", matPerSq: 550, laborPerSq: 450, wastePct: 8, capPerFt: 12 },
  { id: "metal_panel", label: "Exposed-fastener metal panel", family: "metal", matPerSq: 250, laborPerSq: 300, wastePct: 8, capPerFt: 9 },
  { id: "clay_tile", label: "Clay tile", family: "tile", matPerSq: 700, laborPerSq: 600, wastePct: 12, capPerFt: 9.5 },
  { id: "concrete_tile", label: "Concrete tile", family: "tile", matPerSq: 400, laborPerSq: 500, wastePct: 12, capPerFt: 8 },
  { id: "cedar_shake", label: "Cedar shake", family: "shake", matPerSq: 500, laborPerSq: 450, wastePct: 15, capPerFt: 4.2 },
  { id: "slate", label: "Natural slate", family: "slate", matPerSq: 1100, laborPerSq: 900, wastePct: 12, capPerFt: 8.5 },
  { id: "synthetic_slate", label: "Synthetic slate / shake", family: "synthetic", matPerSq: 450, laborPerSq: 350, wastePct: 10, capPerFt: 4.5 },
  { id: "tpo", label: "TPO membrane (low slope)", family: "low-slope", matPerSq: 250, laborPerSq: 250, wastePct: 5, capPerFt: 0 },
  { id: "mod_bit", label: "Modified bitumen (low slope)", family: "low-slope", matPerSq: 220, laborPerSq: 240, wastePct: 5, capPerFt: 0 },
  { id: "custom", label: "Custom…", family: "asphalt", matPerSq: 0, laborPerSq: 0, wastePct: 10, capPerFt: 0 },
];

/**
 * Install-labor multiplier by pitch. Below 4/12 most shingle work needs
 * low-slope treatment; 8/12 and up is walk-with-care, 10/12 and up is roped,
 * 12/12 and up is staged.
 */
export function pitchLaborFactor(pitch12: number): number {
  if (pitch12 < 4) return 1.1;
  if (pitch12 <= 6) return 1;
  if (pitch12 <= 7) return 1.1;
  if (pitch12 <= 9) return 1.25;
  if (pitch12 <= 11) return 1.45;
  return 1.7;
}
/** From here up the package carries a safety / staging line. */
export const STEEP_PITCH = 8;

// ── Underlayment ────────────────────────────────────────────────────────────
export interface Underlayment extends CatalogOption {
  perSq: number;
}
export const UNDERLAYMENTS: Underlayment[] = [
  { id: "synthetic", label: "Synthetic underlayment", perSq: 32 },
  { id: "synthetic_premium", label: "Premium synthetic (high-temp / slip-resistant)", perSq: 48 },
  { id: "felt15", label: "#15 asphalt felt", perSq: 18 },
  { id: "felt30", label: "#30 asphalt felt", perSq: 26 },
  { id: "paper60", label: "60-minute paper (kraft, asphalt-saturated)", perSq: 30 },
  { id: "custom", label: "Custom…", perSq: 0 },
];

export type IceWaterCoverage = "none" | "eaves" | "eaves_valleys" | "full";
export const ICE_WATER: Array<CatalogOption & { id: IceWaterCoverage }> = [
  { id: "none", label: "None" },
  { id: "eaves", label: "Eaves only (two rows, 6 ft up)" },
  { id: "eaves_valleys", label: "Eaves + valleys (+ 3 ft each side of valley)" },
  { id: "full", label: "Full deck" },
];
export const ICE_WATER_PER_SQFT = 0.6;
/** Two courses of 36 in membrane up from the eave. */
export const ICE_WATER_EAVE_BAND_FT = 6;
/** One 36 in course centred on the valley. */
export const ICE_WATER_VALLEY_BAND_FT = 3;

// ── Edge metal ──────────────────────────────────────────────────────────────
export interface DripEdgeProfile extends CatalogOption {
  perFt: number;
}
export const DRIP_EDGE_PROFILES: DripEdgeProfile[] = [
  { id: "f", label: "F-style (standard)", perFt: 1.5 },
  { id: "t", label: "T-style (extended lip)", perFt: 1.9 },
  { id: "apron", label: "Gutter apron", perFt: 2.2 },
  { id: "custom", label: "Custom…", perFt: 0 },
];
export const DRIP_EDGE_SIZES: CatalogOption[] = [
  { id: "1.5", label: "1½ in face" },
  { id: "2", label: "2 in face" },
  { id: "3", label: "3 in face" },
];
export const STARTER_PER_FT = 0.8;

// ── Flashing ────────────────────────────────────────────────────────────────
export interface ValleyType extends CatalogOption {
  matPerFt: number;
  laborPerFt: number;
}
export const VALLEY_TYPES: ValleyType[] = [
  { id: "closed_cut", label: "Closed-cut (shingles, membrane under)", matPerFt: 0, laborPerFt: 2.5 },
  { id: "open_w24", label: "Open metal · W-valley 24 in", matPerFt: 3.5, laborPerFt: 3 },
  { id: "open_w20", label: "Open metal · W-valley 20 in", matPerFt: 3.1, laborPerFt: 3 },
  { id: "open_copper", label: "Open metal · copper", matPerFt: 18, laborPerFt: 4 },
  { id: "custom", label: "Custom…", matPerFt: 0, laborPerFt: 0 },
];

export interface StepFlashingSize extends CatalogOption {
  perPiece: number;
  /** Exposure the pieces are lapped at, inches — sets pieces per foot. */
  exposureIn: number;
}
export const STEP_FLASHING_SIZES: StepFlashingSize[] = [
  { id: "4x4x8", label: "4 × 4 × 8 in", perPiece: 0.85, exposureIn: 5.625 },
  { id: "5x5x8", label: "5 × 5 × 8 in", perPiece: 1.05, exposureIn: 5.625 },
  { id: "4x4x10", label: "4 × 4 × 10 in", perPiece: 1.1, exposureIn: 7.5 },
  { id: "custom", label: "Custom…", perPiece: 0, exposureIn: 5.625 },
];
export const STEP_FLASHING_LABOR_PER_FT = 4;
export const APRON_PER_FT = 3.2;
export const APRON_LABOR_PER_FT = 3;
export const COUNTER_PER_FT = 4.5;
export const COUNTER_LABOR_PER_FT = 6;

export interface PipeBootSize extends CatalogOption {
  each: number;
  labor: number;
}
export const PIPE_BOOT_SIZES: PipeBootSize[] = [
  { id: "small", label: "1½–3 in", each: 14, labor: 25 },
  { id: "medium", label: "3–4 in", each: 18, labor: 25 },
  { id: "large", label: "4–6 in", each: 28, labor: 30 },
];

export interface ChimneySize extends CatalogOption {
  each: number;
  labor: number;
}
export const CHIMNEY_SIZES: ChimneySize[] = [
  { id: "small", label: "Small (to 24 in)", each: 180, labor: 250 },
  { id: "medium", label: "Medium (to 36 in)", each: 260, labor: 350 },
  { id: "large", label: "Large (over 36 in) / cricket", each: 380, labor: 450 },
];
export const CURB_EACH = 120;
export const CURB_LABOR = 150;

// ── Ventilation ─────────────────────────────────────────────────────────────
export interface VentType extends CatalogOption {
  unit: "linear ft" | "each";
  each: number;
  labor: number;
  /** Net free area per unit, sq in — 0 for powered units (they move air, not NFA). */
  nfaSqIn: number;
  role: "exhaust" | "intake";
}
export const VENT_TYPES: VentType[] = [
  { id: "ridge", label: "Ridge vent", unit: "linear ft", each: 4.5, labor: 3, nfaSqIn: 18, role: "exhaust" },
  { id: "box50", label: "Box / static vent · 50 sq in", unit: "each", each: 22, labor: 35, nfaSqIn: 50, role: "exhaust" },
  { id: "box60", label: "Box / static vent · 60 sq in", unit: "each", each: 28, labor: 35, nfaSqIn: 60, role: "exhaust" },
  { id: "turbine12", label: "Turbine · 12 in", unit: "each", each: 65, labor: 60, nfaSqIn: 113, role: "exhaust" },
  { id: "turbine14", label: "Turbine · 14 in", unit: "each", each: 80, labor: 60, nfaSqIn: 154, role: "exhaust" },
  { id: "power_fan", label: "Power attic fan", unit: "each", each: 180, labor: 150, nfaSqIn: 0, role: "exhaust" },
  { id: "solar_fan", label: "Solar attic fan", unit: "each", each: 420, labor: 150, nfaSqIn: 0, role: "exhaust" },
  { id: "gable", label: "Gable vent", unit: "each", each: 45, labor: 60, nfaSqIn: 90, role: "exhaust" },
  { id: "soffit16x8", label: "Soffit / intake vent · 16 × 8 in", unit: "each", each: 8, labor: 15, nfaSqIn: 56, role: "intake" },
  { id: "soffit_strip", label: "Continuous soffit strip", unit: "linear ft", each: 2.2, labor: 2, nfaSqIn: 9, role: "intake" },
  { id: "edge_intake", label: "Edge / eave intake vent", unit: "linear ft", each: 3.8, labor: 2.5, nfaSqIn: 9, role: "intake" },
];
/** Attic sq in of net free area per sq ft of attic floor: 1/150 plain, 1/300 balanced with a vapor retarder. */
export const NFA_RATIO_PLAIN = 150;
export const NFA_RATIO_BALANCED = 300;

// ── Tear-off & extras ───────────────────────────────────────────────────────
export const TEAROFF_LABOR_PER_SQ_LAYER = 55;
export const DISPOSAL_PER_SQ_LAYER = 28;
export const PLYWOOD_SHEET_EACH = 42;
export const PLYWOOD_SHEET_LABOR = 35;
export const NAILS_PER_SQ = 4.5;
export const SEALANT_PER_SQ = 1.2;
export const CLEANUP_LUMP = 250;
export const STEEP_SAFETY_LUMP = 250;

/** The waste picker's options; the chosen roof system pre-selects one. */
export const WASTE_OPTIONS = [5, 8, 10, 12, 15, 18, 20];

/** The proposal's measurement vocabulary, as the units the builder emits. */
export const PKG_UNITS: PkgUnit[] = ["square", "sq ft", "linear ft", "each", "hour", "lot"];
