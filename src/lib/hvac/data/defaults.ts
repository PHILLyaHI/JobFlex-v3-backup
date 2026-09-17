// Era and climate defaults for the block load — every one of them is a
// DEFAULT, written into the assumptions with the table named, and replaced the
// moment the contractor states or measures the real value.
//
// The figures are typical construction for the period, in the spirit of the
// vintage assumptions the DOE Building America programme and the residential
// energy-code baselines use. They are estimating defaults, not code minimums,
// and they err toward the leakier, less insulated house, which is the safer
// side to size on.

import type {
  CeilingInsulation,
  Foundation,
  HumidityClass,
  Tightness,
  WallInsulation,
  WindowType,
} from "../types";

export const DEFAULTS_VERIFIED_ON = "2026-09-15";
export const DEFAULTS_SOURCE = "JobFlex era defaults (vintage construction, IECC baselines)";

export interface EraDefaults {
  era: string;
  windowType: WindowType;
  wallInsulation: WallInsulation;
  ceilingInsulation: CeilingInsulation;
  tightness: Tightness;
  windowToFloor: number;
}

/** Typical construction by year built. */
export function eraDefaults(yearBuilt: number | undefined): EraDefaults {
  const y = yearBuilt ?? 1985;
  if (y < 1950) return { era: "pre-1950", windowType: "single", wallInsulation: "none", ceilingInsulation: "r11", tightness: "leaky", windowToFloor: 0.12 };
  if (y < 1980) return { era: "1950–1979", windowType: "single", wallInsulation: "r11", ceilingInsulation: "r19", tightness: "leaky", windowToFloor: 0.13 };
  if (y < 2000) return { era: "1980–1999", windowType: "double", wallInsulation: "r13", ceilingInsulation: "r30", tightness: "average", windowToFloor: 0.14 };
  if (y < 2012) return { era: "2000–2011", windowType: "double-lowe", wallInsulation: "r13", ceilingInsulation: "r38", tightness: "average", windowToFloor: 0.15 };
  return { era: "2012 and newer", windowType: "double-lowe", wallInsulation: "r19", ceilingInsulation: "r38", tightness: "tight", windowToFloor: 0.15 };
}

/** Window U-factor and SHGC by glazing type. */
export const WINDOW: Record<WindowType, { u: number; shgc: number; label: string }> = {
  single: { u: 1.1, shgc: 0.75, label: "single pane" },
  double: { u: 0.55, shgc: 0.6, label: "double pane, clear" },
  "double-lowe": { u: 0.32, shgc: 0.35, label: "double pane, low-e" },
  triple: { u: 0.25, shgc: 0.28, label: "triple pane, low-e" },
};

/** Wood-frame wall U-factor by cavity insulation (framing included). */
export const WALL_U: Record<WallInsulation, number> = { none: 0.27, r11: 0.09, r13: 0.08, r19: 0.06, r21: 0.055 };

/** Ceiling U-factor under a vented attic by insulation. */
export const CEILING_U: Record<CeilingInsulation, number> = { none: 0.28, r11: 0.083, r19: 0.05, r30: 0.033, r38: 0.026, r49: 0.02 };

/** Blower-door air changes at 50 Pa the tightness class stands for. */
export const ACH50: Record<Tightness, number> = { leaky: 15, average: 8, tight: 4, "very-tight": 2.5 };

/** Floor loss per square foot of floor (crawl, basement) or per foot of
 *  perimeter (slab), Btu/h·°F — heating; cooling gain factors are small. */
export const FLOOR: Record<Foundation, { heatingUA: number; perPerimeter: boolean; coolingShare: number; label: string }> = {
  slab: { heatingUA: 0.73, perPerimeter: true, coolingShare: 0, label: "slab on grade, uninsulated edge" },
  "crawl-vented": { heatingUA: 0.06, perPerimeter: false, coolingShare: 0.3, label: "vented crawlspace, insulated floor" },
  "crawl-sealed": { heatingUA: 0.035, perPerimeter: false, coolingShare: 0.15, label: "sealed crawlspace" },
  "basement-unconditioned": { heatingUA: 0.05, perPerimeter: false, coolingShare: 0.1, label: "unconditioned basement" },
  "basement-conditioned": { heatingUA: 0.025, perPerimeter: false, coolingShare: 0.05, label: "conditioned basement (below-grade walls)" },
};

/** Duct loss (heating) and gain (cooling) as a share of the load, by location. */
export const DUCT: Record<string, { heating: number; cooling: number }> = {
  conditioned: { heating: 0, cooling: 0 },
  attic: { heating: 0.15, cooling: 0.2 },
  crawl: { heating: 0.1, cooling: 0.12 },
  basement: { heating: 0.08, cooling: 0.06 },
  none: { heating: 0, cooling: 0 },
};

/** Extra roof/attic temperature above the design ΔT at the cooling design, °F. */
export const ROOF_COLOR_ADD = { dark: 30, medium: 22, light: 15 } as const;

/** Window solar heat gain at the cooling design by orientation of the wall
 *  the window sits in, Btu/h per sq ft for a reference SHGC of 0.87. */
export const SOLAR_BY_BEARING: Array<{ from: number; to: number; gain: number; label: string }> = [
  { from: 337.5, to: 22.5, gain: 25, label: "N" },
  { from: 22.5, to: 67.5, gain: 70, label: "NE" },
  { from: 67.5, to: 112.5, gain: 110, label: "E" },
  { from: 112.5, to: 157.5, gain: 90, label: "SE" },
  { from: 157.5, to: 202.5, gain: 50, label: "S" },
  { from: 202.5, to: 247.5, gain: 90, label: "SW" },
  { from: 247.5, to: 292.5, gain: 110, label: "W" },
  { from: 292.5, to: 337.5, gain: 70, label: "NW" },
];

export const SHADING_FACTOR = { none: 1, some: 0.75, heavy: 0.5 } as const;

/** Moisture at the cooling design, by state: grains per lb above the 75 °F /
 *  50% indoor condition. A classification, not a station reading. */
const HUMID = new Set(["FL", "LA", "MS", "AL", "GA", "SC", "NC", "TX", "AR", "TN", "VA", "MD", "DE", "NJ", "HI", "PR", "GU", "VI", "MP", "DC"]);
const DRY = new Set(["AZ", "NV", "UT", "NM", "CO", "WY", "ID", "MT", "CA", "OR", "WA", "AK"]);

export function humidityClass(state: string): HumidityClass {
  const st = state.toUpperCase();
  if (HUMID.has(st)) return "humid";
  if (DRY.has(st)) return "dry";
  return "moderate";
}

export const GRAINS: Record<HumidityClass, number> = { humid: 45, moderate: 28, dry: 0 };

/** Airflow per nominal ton the climate wants: dry air moves more, wet air less. */
export const CFM_PER_TON: Record<HumidityClass, number> = { humid: 350, moderate: 400, dry: 450 };
