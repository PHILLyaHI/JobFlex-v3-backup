// Terrain math for the traced fence line — pure, no network, no DOM. The
// behavior module samples the trace, ships the samples to the Elevation
// action, and hands the answer back here to be turned into per-segment slope
// facts the price, the map overlay and the assumptions all read.
//
// CLASSIFICATION THRESHOLDS — fixed from fence-trade practice, not invented:
//   · LEVEL_MAX_DEG = 5°. Rackable vinyl privacy panels only follow ~7°
//     (Fencetown, "Aluminum fence panel racking"; WamBam, "How do I handle
//     sloping ground" — rails need angle-cutting past ~10°). Below 5° every
//     panel system installs as level ground: no adjustment, no callout.
//   · RACKED_MAX_DEG = 25°. Rackable RESIDENTIAL aluminum follows ~28°
//     (Fencetown), and installers' own ceiling for racking is ~30–35°
//     (Medallion Fence, "Racking vs. Stepping"; FenceTrac, "What are rackable
//     fence panels"). 25° keeps a working margin under the weakest figure.
//   Steeper than RACKED_MAX_DEG the panels must stair-step: each panel stays
//   level and the run drops in uniform steps between posts.
//
// A segment's angle is its NET grade — rise between its two posts over its
// plan length. The grade LENGTH, by contrast, integrates every sample step
// (√(ds² + dz²)), so a dip inside a segment still buys its true footage even
// when the net angle reads flat.
import type { PathPoint } from "./fenceTypes";
import { localFeetToLatLng, type LatLng } from "./mapProjection";
import { POST_SPACING_FT } from "./fenceGeometry";

/** Sample the ground about every 10 ft — one Elevation API location each. */
export const SAMPLE_FT = 10;
/** Hard cap on one profile; past it the spacing widens instead of failing. */
export const MAX_PROFILE_SAMPLES = 750;
export const LEVEL_MAX_DEG = 5;
export const RACKED_MAX_DEG = 25;

/** Ignore segments shorter than this — a half-foot sliver has no slope story. */
const MIN_SEG_FT = 0.5;

export type SlopeClass = "level" | "racked" | "stepped";

export interface SegSampling {
  /** Index into the traced `points` array (segment = points[seg]→points[seg+1]). */
  seg: number;
  /** First sample of this segment in the flat sample list. */
  start: number;
  /** Sample count (≥ 2; endpoints included, so neighbours duplicate corners). */
  count: number;
  planFt: number;
}

export interface FencePathSampling {
  samples: LatLng[];
  segs: SegSampling[];
}

/**
 * Sample points along every non-gap traced segment, endpoints included, in
 * lat/lng ready for the Elevation API. Spacing is SAMPLE_FT, widened only if
 * the whole path would otherwise exceed MAX_PROFILE_SAMPLES.
 */
export function sampleFencePath(points: PathPoint[], origin: LatLng): FencePathSampling {
  const raw: Array<{ seg: number; a: PathPoint; b: PathPoint; planFt: number }> = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (b.gap) continue;
    const planFt = Math.hypot(b.x - a.x, b.y - a.y);
    if (planFt < MIN_SEG_FT) continue;
    raw.push({ seg: i, a, b, planFt });
  }
  const totalFt = raw.reduce((s, r) => s + r.planFt, 0);
  const budget = Math.max(2, MAX_PROFILE_SAMPLES - raw.length); // endpoints cost one extra per segment
  const spacing = Math.max(SAMPLE_FT, totalFt / budget);

  const samples: LatLng[] = [];
  const segs: SegSampling[] = [];
  for (const r of raw) {
    const n = Math.max(2, Math.ceil(r.planFt / spacing) + 1);
    const start = samples.length;
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      samples.push(
        localFeetToLatLng(origin, {
          x: r.a.x + (r.b.x - r.a.x) * t,
          y: r.a.y + (r.b.y - r.a.y) * t,
        }),
      );
    }
    segs.push({ seg: r.seg, start, count: n, planFt: r.planFt });
  }
  return { samples, segs };
}

export interface SegTerrain {
  seg: number;
  planFt: number;
  /** True length along the ground: Σ √(ds² + dz²) over the sample steps. */
  gradeFt: number;
  /** Net elevation change, first post to last (signed, + = uphill). */
  riseFt: number;
  /** Net grade angle: atan(|rise| / plan). */
  thetaDeg: number;
  cls: SlopeClass;
  /** Stepped only: one step per bay (posts at POST_SPACING_FT centres). */
  steps?: number;
  /** Stepped only: the drop each step takes, |rise| / steps. */
  stepDropFt?: number;
}

export interface FenceTerrainReport {
  segs: SegTerrain[];
  planFt: number;
  gradeFt: number;
  rackedFt: number; // grade footage of racked segments
  steppedFt: number; // grade footage of stepped segments
  minElevFt: number;
  maxElevFt: number;
}

/** Turn the profile the Elevation API answered into per-segment slope facts. */
export function terrainFromProfile(segs: SegSampling[], elevFt: number[]): FenceTerrainReport {
  const out: SegTerrain[] = [];
  let planFt = 0;
  let gradeFt = 0;
  let rackedFt = 0;
  let steppedFt = 0;
  let minElevFt = Infinity;
  let maxElevFt = -Infinity;

  for (const s of segs) {
    const ds = s.planFt / (s.count - 1);
    let grade = 0;
    for (let k = 1; k < s.count; k++) {
      const dz = elevFt[s.start + k] - elevFt[s.start + k - 1];
      grade += Math.hypot(ds, dz);
    }
    for (let k = 0; k < s.count; k++) {
      const z = elevFt[s.start + k];
      if (z < minElevFt) minElevFt = z;
      if (z > maxElevFt) maxElevFt = z;
    }
    const riseFt = elevFt[s.start + s.count - 1] - elevFt[s.start];
    const thetaDeg = (Math.atan2(Math.abs(riseFt), s.planFt) * 180) / Math.PI;
    const cls: SlopeClass =
      thetaDeg < LEVEL_MAX_DEG ? "level" : thetaDeg <= RACKED_MAX_DEG ? "racked" : "stepped";
    const t: SegTerrain = {
      seg: s.seg,
      planFt: s.planFt,
      gradeFt: grade,
      riseFt,
      thetaDeg,
      cls,
    };
    if (cls === "stepped") {
      // One level panel per bay; the run drops between posts.
      const steps = Math.max(1, Math.ceil(s.planFt / POST_SPACING_FT));
      t.steps = steps;
      t.stepDropFt = Math.abs(riseFt) / steps;
    }
    out.push(t);
    planFt += s.planFt;
    gradeFt += grade;
    if (cls === "racked") rackedFt += grade;
    else if (cls === "stepped") steppedFt += grade;
  }
  if (!out.length) {
    minElevFt = 0;
    maxElevFt = 0;
  }
  return { segs: out, planFt, gradeFt, rackedFt, steppedFt, minElevFt, maxElevFt };
}

const r0 = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * The one honest sentence the proposal's assumptions carry about the ground.
 * `status` is the fetch outcome; `manualOnly` marks a ledger typed by hand
 * (nothing traced, so there was no line to profile).
 */
export function terrainAssumption(
  report: FenceTerrainReport | null,
  status: "ok" | "failed" | "idle",
  opts?: { billedPlanFt?: number; billedGradeFt?: number; billedRackedFt?: number; billedSteppedFt?: number },
): string {
  if (status === "failed") return "Terrain unavailable — plan length used";
  if (status !== "ok" || !report) return "Terrain not measured — run lengths entered by hand";
  const plan = opts?.billedPlanFt ?? report.planFt;
  const grade = opts?.billedGradeFt ?? report.gradeFt;
  const racked = opts?.billedRackedFt ?? report.rackedFt;
  const stepped = opts?.billedSteppedFt ?? report.steppedFt;
  if (Math.round(grade) <= Math.round(plan) && racked < 1 && stepped < 1) {
    return "Level ground (measured)";
  }
  const parts: string[] = [];
  if (racked >= 1) parts.push(`${r0(racked)} ft racked`);
  if (stepped >= 1) parts.push(`${r0(stepped)} ft stepped`);
  return (
    `Terrain measured: ${r0(plan)} ft plan → ${r0(grade)} ft along grade` +
    (parts.length ? `; ${parts.join(", ")}` : "")
  );
}
