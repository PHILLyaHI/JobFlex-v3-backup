// RAFTER SPANS AS THE CODE PRINTS THEM (Deck Studio M2, 2026-10-10) — pure data.
//
// Owner: "the gazebo with the posts, rafters and type of the roofing… all the
// materials should be calculated when the size changes." A roof over a deck,
// a gazebo or a pavilion is framed from the same tables a house roof is:
// IRC 2021 Table R802.4.1(1) (20 psf roof live load), (3) (30 psf ground
// snow), (5) (50 psf) and (7) (70 psf) — #2 grade, 10 psf dead load, ceiling
// not attached, deflection L/180 — typed here from the printed tables
// (up.codes, 2021 IRC as adopted in Texas), feet-inches to inches, so a slip
// shows up in scripts/qa/deck-roof.check.ts, not in a quote.
//
// Four species rows are printed: Douglas fir-larch, hem-fir, Southern pine
// and spruce-pine-fir. The deck engine's "RW" group (redwood, cedar,
// ponderosa, red pine) has no rafter row: it is read on the Southern pine
// row and shortened (RW_FACTOR), and the check strip says so.
//
// A cell past 26 ft is printed as a note ("> 26'") — kept here as 312 in.

import type { JoistSize } from "./codeTables";

/** The roof's design load, psf: 20 live, or the ground snow load. */
export type RoofLoad = 20 | 30 | 50 | 70;
export const ROOF_LOADS: readonly RoofLoad[] = [20, 30, 50, 70];
export type RafterGroup = "DF" | "HF" | "SP" | "SPF";
export const RAFTER_GROUPS: readonly RafterGroup[] = ["DF", "HF", "SP", "SPF"];
export type RafterSpacing = 12 | 16 | 24;

const fi = (ft: number, inch: number) => ft * 12 + inch;
const OVER = 312;

/** [size][group] → spans at 12, 16, 24 in. on centre, inches. */
type Row = Record<JoistSize, Record<RafterGroup, readonly [number, number, number]>>;

export const RAFTER_ROWS: Record<RoofLoad, Row> = {
  20: {
    "2x6": { DF: [fi(16, 10), fi(14, 7), fi(11, 11)], HF: [fi(15, 11), fi(14, 2), fi(11, 7)], SP: [fi(15, 7), fi(13, 6), fi(11, 0)], SPF: [fi(16, 3), fi(14, 4), fi(11, 9)] },
    "2x8": { DF: [fi(21, 4), fi(18, 5), fi(15, 1)], HF: [fi(20, 8), fi(17, 11), fi(14, 8)], SP: [fi(19, 8), fi(17, 1), fi(13, 11)], SPF: [fi(21, 0), fi(18, 2), fi(14, 10)] },
    "2x10": { DF: [fi(26, 0), fi(22, 6), fi(18, 5)], HF: [fi(25, 3), fi(21, 11), fi(17, 10)], SP: [fi(23, 5), fi(20, 3), fi(16, 6)], SPF: [fi(25, 8), fi(22, 3), fi(18, 2)] },
    "2x12": { DF: [OVER, fi(26, 0), fi(21, 4)], HF: [OVER, fi(25, 5), fi(20, 9)], SP: [OVER, fi(23, 10), fi(19, 6)], SPF: [OVER, fi(25, 9), fi(21, 0)] },
  },
  30: {
    "2x6": { DF: [fi(14, 0), fi(12, 1), fi(9, 10)], HF: [fi(13, 7), fi(11, 9), fi(9, 7)], SP: [fi(12, 11), fi(11, 2), fi(9, 2)], SPF: [fi(13, 9), fi(11, 11), fi(9, 9)] },
    "2x8": { DF: [fi(17, 8), fi(15, 4), fi(12, 6)], HF: [fi(17, 2), fi(14, 11), fi(12, 2)], SP: [fi(16, 4), fi(14, 2), fi(11, 7)], SPF: [fi(17, 5), fi(15, 1), fi(12, 4)] },
    "2x10": { DF: [fi(21, 7), fi(18, 9), fi(15, 3)], HF: [fi(21, 0), fi(18, 2), fi(14, 10)], SP: [fi(19, 5), fi(16, 10), fi(13, 9)], SPF: [fi(21, 4), fi(18, 5), fi(15, 1)] },
    "2x12": { DF: [fi(25, 1), fi(21, 8), fi(17, 9)], HF: [fi(24, 4), fi(21, 1), fi(17, 3)], SP: [fi(22, 10), fi(19, 10), fi(16, 2)], SPF: [fi(24, 8), fi(21, 5), fi(17, 6)] },
  },
  50: {
    "2x6": { DF: [fi(11, 5), fi(9, 10), fi(8, 1)], HF: [fi(11, 1), fi(9, 7), fi(7, 10)], SP: [fi(10, 6), fi(9, 2), fi(7, 5)], SPF: [fi(11, 3), fi(9, 9), fi(7, 11)] },
    "2x8": { DF: [fi(14, 5), fi(12, 6), fi(10, 3)], HF: [fi(14, 0), fi(12, 2), fi(9, 11)], SP: [fi(13, 4), fi(11, 7), fi(9, 5)], SPF: [fi(14, 3), fi(12, 4), fi(10, 1)] },
    "2x10": { DF: [fi(17, 8), fi(15, 3), fi(12, 6)], HF: [fi(17, 2), fi(14, 10), fi(12, 1)], SP: [fi(15, 10), fi(13, 9), fi(11, 3)], SPF: [fi(17, 5), fi(15, 1), fi(12, 4)] },
    "2x12": { DF: [fi(20, 5), fi(17, 9), fi(14, 6)], HF: [fi(19, 11), fi(17, 3), fi(14, 1)], SP: [fi(18, 8), fi(16, 2), fi(13, 2)], SPF: [fi(20, 2), fi(17, 6), fi(14, 3)] },
  },
  70: {
    "2x6": { DF: [fi(9, 10), fi(8, 7), fi(7, 0)], HF: [fi(9, 7), fi(8, 4), fi(6, 9)], SP: [fi(9, 2), fi(7, 11), fi(6, 5)], SPF: [fi(9, 9), fi(8, 5), fi(6, 11)] },
    "2x8": { DF: [fi(12, 6), fi(10, 10), fi(8, 10)], HF: [fi(12, 2), fi(10, 6), fi(8, 7)], SP: [fi(11, 7), fi(10, 0), fi(8, 2)], SPF: [fi(12, 4), fi(10, 8), fi(8, 9)] },
    "2x10": { DF: [fi(15, 3), fi(13, 3), fi(10, 10)], HF: [fi(14, 10), fi(12, 10), fi(10, 6)], SP: [fi(13, 9), fi(11, 11), fi(9, 9)], SPF: [fi(15, 1), fi(13, 1), fi(10, 8)] },
    "2x12": { DF: [fi(17, 9), fi(15, 4), fi(12, 6)], HF: [fi(17, 3), fi(14, 11), fi(12, 2)], SP: [fi(16, 2), fi(14, 0), fi(11, 5)], SPF: [fi(17, 6), fi(15, 2), fi(12, 4)] },
  },
};

/** Redwood, cedar, ponderosa and red pine have no rafter row: Southern pine's, shortened. An ESTIMATE. */
export const RW_FACTOR = 0.85;
/** A ceiling under the rafters adds dead load; the 20 psf dead-load tables run about this much shorter. An ESTIMATE until those tables are typed in. */
export const CEILING_FACTOR = 0.93;

export const RULE_RAFTER: Record<RoofLoad, string> = {
  20: "IRC Table R802.4.1(1)",
  30: "IRC Table R802.4.1(3)",
  50: "IRC Table R802.4.1(5)",
  70: "IRC Table R802.4.1(7)",
};
export const RULE_HIP = "IRC R802.3";
export const RULE_RIDGE = "IRC R802.3 · R802.4.5";
export const RULE_TIES = "IRC R802.5.2";
export const RULE_ROOF_LOAD = "IRC R301.6 · Table R301.2";

/** The horizontal span a rafter may make, inches; 0 when the size has no cell. `untabulated` says the species row was estimated. */
export function rafterMaxSpanIn(load: RoofLoad, group: RafterGroup | "RW", size: JoistSize, spacing: RafterSpacing, ceiling = false): number {
  const row = RAFTER_ROWS[load][size][group === "RW" ? "SP" : group];
  const col = spacing === 12 ? 0 : spacing === 16 ? 1 : 2;
  const base = row[col];
  const factor = (group === "RW" ? RW_FACTOR : 1) * (ceiling ? CEILING_FACTOR : 1);
  return Math.floor(base * factor);
}

/** The code's roof design load for a deck design load: 40 psf live → a 20 psf roof; a ground snow load reads its own table (60 psf has none and is read at 70). */
export function roofLoadFor(deckLoadPsf: number): RoofLoad {
  if (deckLoadPsf <= 40) return 20;
  if (deckLoadPsf <= 50) return 50;
  return 70;
}

/** Dead load on the frame, psf: what the roof is covered with. Estimating values. */
export const ROOF_DEAD_PSF = { shingle: 12, metal: 8, shake: 10, open: 4, ceiling: 4, sheathing: 0 } as const;
