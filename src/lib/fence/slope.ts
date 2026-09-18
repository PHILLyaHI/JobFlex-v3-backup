// Slope rules for fence runs — ported 2026-09-18 from FenceScan
// (lib/fence/slope.ts) and joined to JobFlex's own terrain report
// (components/estimator/fence/fenceTerrain.ts), which already classifies
// every traced segment as level / racked / stepped from the Elevation
// profile. This module turns that report into what the takeoff and the
// pricing need: how many code-sized steps the crew builds, how much extra
// fabric racked bays take, the post lengths, and the ground difficulty.
//
// Field rules encoded here:
//  - Panels / pickets can RACK (follow the grade) up to ~1' of rise per 8'
//    section for stick-built wood, ~6" for prefab panels, ~18" for chain
//    link; steeper than that the section must STEP — the panel stays level
//    and the next one drops, which needs a LONGER post at every step.
//  - A single step is capped at 1': codes measure fence height from the
//    grade directly below, and one big step would push the face over the
//    permitted height at the downhill post.
//  - Post length = fence height + burial (a third of the height, never
//    less than 2', never above the local frost line) + the step drop.
//  - Terrain difficulty (labor multiplier) follows the average absolute
//    grade: <5% flat · 5–12% sloped · 12–20% steep · >20% rocky-grade dig.

import type { Terrain } from "./catalog";

/** One-section rise (ft) that reads as a sheer drop — a retaining wall or
 *  cut bank, not walkable grade. */
export const WALL_RISE_FT = 2.5;

/** Max drop a SINGLE step may take (ft). */
export const MAX_STEP_DROP_FT = 1.0;

/** How much rise one section can absorb by racking, by build kind. */
export function rackingLimitFt(build: "stick" | "panel" | "mesh" | "rail"): number {
  if (build === "panel") return 0.5; // prefab panels barely rack
  if (build === "mesh") return 1.5; // chain link follows grade well
  return 1.0; // stick-built & rail
}

/**
 * Burial depth: a third of the height, never less than 2' — and never
 * above the local frost line. A post footed above frost heaves out of
 * plumb by the second spring, so in Minneapolis (48" frost) a 6' fence
 * digs 4' holes where Dallas digs 2'. `frostIn` comes from the job's
 * market; 0 means height only.
 */
export function burialFt(heightFt: number, frostIn = 0): number {
  return Math.max(2, heightFt / 3, frostIn / 12);
}

/** Posts come in even-foot lengths — round up. */
export function roundPostFt(ft: number): number {
  return Math.ceil(ft / 2) * 2;
}

/** Suggested labor terrain from the measured grade. */
export function terrainFromGrade(avgGradePct: number, maxGradePct: number): Terrain {
  if (avgGradePct < 5 && maxGradePct < 10) return "flat";
  if (avgGradePct < 12) return "sloped";
  if (avgGradePct <= 20) return "steep";
  return "rocky";
}

/** One traced segment as JobFlex's terrain report describes it. */
export interface SlopeSegment {
  /** Plan (map) length, ft. */
  planFt: number;
  /** Length along the ground, ft. */
  gradeFt: number;
  /** End-to-end rise, ft (signed). */
  riseFt: number;
  /** Slope angle from the plan, degrees. */
  thetaDeg: number;
  cls: "level" | "racked" | "stepped";
  /** Steps the report already sized for a stepped segment (one per bay). */
  steps?: number;
  /** Drop per step, ft. */
  stepDropFt?: number;
}

export interface SlopeSummary {
  /** Code-sized steps the crew builds across the whole fence. */
  steppedSections: number;
  /** Segments whose rise reads as a wall or cut bank — a "mounting on a
   *  wall?" question for the contractor, never auto-priced. */
  wallSegments: number;
  /** LF of fence over those drops. */
  wallLikeLf: number;
  /** Largest per-step drop after splitting, ft. */
  maxStepFt: number;
  /** Extra FABRIC on racked bays, ft — a bay that follows the grade is the
   *  hypotenuse, not its map length. Stepped bays add nothing (level panels). */
  rackedExtraLf: number;
  avgGradePct: number;
  maxGradePct: number;
  suggestedTerrain: Terrain;
  /** Standard post length for this fence, ft (height + burial). */
  basePostLengthFt: number;
  /** Post length at stepped sections, ft. */
  stepPostLengthFt: number;
  burialFt: number;
}

/**
 * Summarize JobFlex's per-segment terrain for the takeoff. Steps: the
 * report's own count on stepped segments, re-split so no step drops more
 * than MAX_STEP_DROP_FT (a 3' drop over one 8' bay is three 1' steps with
 * two extra posts, not one 3' cliff). Segments a fence could rack are the
 * report's "racked" class; their extra fabric is gradeFt − planFt.
 */
export function summarizeSlope(
  segs: readonly SlopeSegment[],
  heightFt: number,
  sectionLenFt: number,
  frostIn = 0,
): SlopeSummary {
  let steps = 0;
  let wallSegments = 0;
  let wallLikeLf = 0;
  let maxStep = 0;
  let rackedExtra = 0;
  let gradeWeighted = 0;
  let planTotal = 0;
  let maxGrade = 0;
  for (const s of segs) {
    if (!(s.planFt > 0)) continue;
    const gradePct = Math.tan((s.thetaDeg * Math.PI) / 180) * 100;
    gradeWeighted += gradePct * s.planFt;
    planTotal += s.planFt;
    maxGrade = Math.max(maxGrade, gradePct);
    if (s.cls === "racked") {
      rackedExtra += Math.max(0, s.gradeFt - s.planFt);
    } else if (s.cls === "stepped") {
      const rise = Math.abs(s.riseFt);
      const bays = Math.max(1, s.steps ?? Math.ceil(s.planFt / Math.max(1, sectionLenFt)));
      // Every bay drops rise/bays; a bay dropping more than a code step
      // splits into shorter panels with extra posts.
      const perBay = rise / bays;
      const splits = Math.max(1, Math.ceil(perBay / MAX_STEP_DROP_FT));
      steps += bays * splits;
      maxStep = Math.max(maxStep, perBay / splits);
      // A wall-like drop: more than WALL_RISE_FT in a single bay.
      if (perBay >= WALL_RISE_FT) {
        wallSegments += 1;
        wallLikeLf += s.planFt;
      }
    }
  }
  const avg = planTotal > 0 ? gradeWeighted / planTotal : 0;
  const burial = burialFt(heightFt, frostIn);
  const base = heightFt + burial;
  return {
    steppedSections: steps,
    wallSegments,
    wallLikeLf: round1(wallLikeLf),
    maxStepFt: round2(maxStep),
    rackedExtraLf: round1(rackedExtra),
    avgGradePct: round1(avg),
    maxGradePct: round1(maxGrade),
    suggestedTerrain: terrainFromGrade(avg, maxGrade),
    basePostLengthFt: roundPostFt(base),
    stepPostLengthFt: roundPostFt(base + Math.min(2, maxStep)),
    burialFt: round2(burial),
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
