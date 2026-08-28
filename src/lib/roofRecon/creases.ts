// Roof lines the DRAWING does not have, found in the 3DEP point cloud.
//
// The skeleton and the wavefront build the interior from the outline. Where the
// real roof folds somewhere the outline cannot predict — a ridge along a mass
// the contour does not betray, a valley between wings — the drawing has a flat
// facet and the DSM cannot fit a plane through it. This finds those folds.
//
// MEASURED, 2026-08-28, on the five ledger addresses with 3DEP coverage: ten
// folds inside facets drawn flat, seven of them typeable, and seven of the ten
// sitting in facets whose DSM plane fit fails (against a 43 % base rate). On
// 9903 the fold IS the main ridge of the house, and drawing it takes the ridge
// footage from 36 to 72 ft.
//
// Everything here is a candidate. Nothing cuts anything; facetCut.ts owns that,
// and rolls back any cut that breaks the model.

import type { EvLineType, RoofModel } from "@/lib/eagleview";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";
import type { CloudPoint } from "@/lib/roofRecon/lidarCloud";
import { areaOf, type FootprintPoint } from "@/lib/roofRecon/footprint";

/** A fold must bend at least this much to be a roof line rather than sag. */
const BEND_MIN_DEG = 10;
/** …and splitting must beat one plane by this much on the median residual. */
const GAIN_MIN = 1.5;
/** Points needed on each side before a split means anything. */
const MIN_SIDE_POINTS = 10;
/** Half-width of the band a candidate is judged in, feet. */
const BAND_FT = 5;
/** The corridor left out of both fits so they cannot meet by construction. */
const GAP_FT = 1.5;
/**
 * The cut position is searched on this lattice. It is also what bounds the
 * FALSE step a real fold can show: sitting up to half a step off the true
 * crease, two planes crossing at `bend` disagree by at most
 * `CUT_SAMPLE_FT * tan(bend/2)`. Anything beyond that is a genuine height
 * discontinuity — canopy over the roof, a solar array, a second storey — and
 * not a fold. No tuned number: the lattice is already in the algorithm and the
 * rest is geometry.
 */
const CUT_SAMPLE_FT = 2;
/** A candidate this close to a line we already draw is that line, not a find. */
const NOT_A_NEW_LINE_FT = 6;
/** A ridge is level; steeper along its own direction and it is a hip. */
const LEVEL_PITCH12 = 0.5;

export interface CreaseCandidate {
  facetId: string;
  facetLabel: string;
  facetSqft: number;
  /** RIDGE / HIP / VALLEY, or OTHER when the surface bends without folding. */
  type: EvLineType;
  /** A point the line passes through, frame feet. */
  through: FootprintPoint;
  /** Unit direction of the line in plan. */
  dir: FootprintPoint;
  bendDeg: number;
  gain: number;
  /** Median height of each half above the survey's own ground, feet. */
  lowHalfFt: number;
  highHalfFt: number;
  /** How far apart the two fitted planes are AT the line, feet. */
  stepFt: number;
  /** The largest step the search lattice could have manufactured here. */
  stepAllowedFt: number;
  pointsLow: number;
  pointsHigh: number;
  /** Set when a guard refused it; the candidate is reported either way. */
  refused?: string;
}

export interface CreaseInput {
  model: RoofModel;
  cloud: CloudPoint[];
  /** Ground level from the survey's class-2 returns, feet. */
  groundFt: number;
}

type P3 = { x: number; y: number; z: number };
type Plane = { a: number; b: number; c: number; p50: number };

const inRing = (p: { x: number; y: number }, r: Array<{ x: number; y: number }>): boolean => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if (r[i].y > p.y !== r[j].y > p.y && p.x < ((r[j].x - r[i].x) * (p.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) inside = !inside;
  }
  return inside;
};
const distToSeg = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number => {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  if (l2 < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};
const median = (v: number[]): number => (v.length ? v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)] : NaN);

/** Least squares z = ax + by + c, then one robust pass dropping points beyond
 *  twice the median residual — the same rule pitchFromDsm uses. */
function fitPlane(pts: P3[]): Plane | null {
  const solve = (list: P3[]): { a: number; b: number; c: number } | null => {
    const n = list.length;
    if (n < 6) return null;
    let sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
    for (const p of list) {
      sx += p.x; sy += p.y; sz += p.z;
      sxx += p.x * p.x; syy += p.y * p.y; sxy += p.x * p.y;
      sxz += p.x * p.z; syz += p.y * p.z;
    }
    const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
    const rhs = [sxz, syz, sz];
    for (let i = 0; i < 3; i++) {
      let piv = i;
      for (let k = i + 1; k < 3; k++) if (Math.abs(A[k][i]) > Math.abs(A[piv][i])) piv = k;
      if (Math.abs(A[piv][i]) < 1e-12) return null;
      [A[i], A[piv]] = [A[piv], A[i]];
      [rhs[i], rhs[piv]] = [rhs[piv], rhs[i]];
      for (let k = i + 1; k < 3; k++) {
        const f = A[k][i] / A[i][i];
        for (let j = i; j < 3; j++) A[k][j] -= f * A[i][j];
        rhs[k] -= f * rhs[i];
      }
    }
    const s = [0, 0, 0];
    for (let i = 2; i >= 0; i--) {
      let v = rhs[i];
      for (let j = i + 1; j < 3; j++) v -= A[i][j] * s[j];
      s[i] = v / A[i][i];
    }
    return { a: s[0], b: s[1], c: s[2] };
  };
  const f1 = solve(pts);
  if (!f1) return null;
  const res = pts.map((p) => Math.abs(p.z - (f1.a * p.x + f1.b * p.y + f1.c)));
  const med = median(res);
  const kept = pts.filter((_, i) => res[i] <= Math.max(2 * med, 1e-6));
  const f2 = solve(kept) ?? f1;
  const r2 = kept.map((p) => Math.abs(p.z - (f2.a * p.x + f2.b * p.y + f2.c)));
  return { ...f2, p50: r2.length ? median(r2) : Infinity };
}
const bendBetween = (l: Plane, r: Plane): number =>
  (Math.acos(Math.min(1, (l.a * r.a + l.b * r.b + 1) /
    (Math.sqrt(l.a * l.a + l.b * l.b + 1) * Math.sqrt(r.a * r.a + r.b * r.b + 1)))) * 180) / Math.PI;

/**
 * Align the cloud to the drawing. The DSM path registers the contour to the
 * raster before measuring; without the same courtesy any offset in the Instant
 * outline is charged to the lidar. Coarse sweep first so the answer is never
 * pinned to the edge of the search, then a fine pass.
 */
export function alignCloud(model: RoofModel, cloud: CloudPoint[]): { dxFt: number; dyFt: number } {
  const idx = buildIndexes(model);
  const facets = model.faces
    .map((f) => {
      const ring = ringOf(f.lineIds, idx);
      if (!ring || ring.length < 3) return null;
      const plan = ring.map((p) => ({ x: p.x, y: p.y }));
      return { plan, area: Math.abs(areaOf(plan)) };
    })
    .filter((f): f is { plan: FootprintPoint[]; area: number } => !!f);
  const roofish = cloud.filter((p) => p.classification !== 2 && p.classification !== 7 && p.classification !== 9);
  const score = (dx: number, dy: number): number => {
    let s = 0, n = 0;
    for (const f of facets) {
      const ins: P3[] = [];
      for (const p of roofish) if (inRing({ x: p.x - dx, y: p.y - dy }, f.plan)) ins.push({ x: p.x - dx, y: p.y - dy, z: p.z });
      if (ins.length < 8) continue;
      const fit = fitPlane(ins);
      if (fit) { s += fit.p50 * f.area; n += f.area; }
    }
    return n > 0 ? s / n : Infinity;
  };
  let best = { dx: 0, dy: 0, s: score(0, 0) };
  for (let dx = -18; dx <= 18; dx += 3) for (let dy = -18; dy <= 18; dy += 3) {
    const v = score(dx, dy);
    if (v < best.s) best = { dx, dy, s: v };
  }
  const coarse = { ...best };
  for (let dx = coarse.dx - 3; dx <= coarse.dx + 3; dx += 0.75) for (let dy = coarse.dy - 3; dy <= coarse.dy + 3; dy += 0.75) {
    const v = score(dx, dy);
    if (v < best.s) best = { dx, dy, s: v };
  }
  return { dxFt: best.dx, dyFt: best.dy };
}

/**
 * Candidate folds, one per facet at most — the strongest. Every candidate is
 * returned, refused ones included, so the reason reaches provenance.
 */
export function findCreases(input: CreaseInput): CreaseCandidate[] {
  const { model, groundFt } = input;
  const idx = buildIndexes(model);
  const { dxFt, dyFt } = alignCloud(model, input.cloud);
  const pts: P3[] = input.cloud
    .filter((p) => p.classification !== 2 && p.classification !== 7 && p.classification !== 9)
    .map((p) => ({ x: p.x - dxFt, y: p.y - dyFt, z: p.z }));

  const pById = new Map(model.points.map((p) => [p.id, p]));
  const interior = model.lines
    .filter((l) => l.type === "RIDGE" || l.type === "HIP" || l.type === "VALLEY")
    .map((l) => ({ a: pById.get(l.aId), b: pById.get(l.bId) }))
    .filter((l): l is { a: NonNullable<typeof l.a>; b: NonNullable<typeof l.b> } => !!l.a && !!l.b);

  const out: CreaseCandidate[] = [];
  for (const face of model.faces) {
    const ring = ringOf(face.lineIds, idx);
    if (!ring || ring.length < 3) continue;
    const plan = ring.map((p) => ({ x: p.x, y: p.y }));
    const facetSqft = Math.abs(areaOf(plan));
    const ins = pts.filter((p) => inRing(p, plan));
    if (ins.length < 3 * MIN_SIDE_POINTS) continue;
    const cx = plan.reduce((s, p) => s + p.x, 0) / plan.length;
    const cy = plan.reduce((s, p) => s + p.y, 0) / plan.length;

    let best: {
      L: Plane; R: Plane; bend: number; gain: number; d: number; nx: number; ny: number; nL: number; nR: number;
    } | null = null;
    for (let th = 0; th < 180; th += 15) {
      const rad = (th * Math.PI) / 180;
      const nx = Math.cos(rad), ny = Math.sin(rad);
      const proj = ins.map((p) => (p.x - cx) * nx + (p.y - cy) * ny);
      const lo = Math.min(...proj), hi = Math.max(...proj);
      for (let d = lo + BAND_FT; d <= hi - BAND_FT; d += CUT_SAMPLE_FT) {
        const band = ins.filter((_, i) => Math.abs(proj[i] - d) <= BAND_FT);
        const L = band.filter((p) => (p.x - cx) * nx + (p.y - cy) * ny < d);
        const R = band.filter((p) => (p.x - cx) * nx + (p.y - cy) * ny >= d);
        if (L.length < MIN_SIDE_POINTS || R.length < MIN_SIDE_POINTS) continue;
        const fL = fitPlane(L), fR = fitPlane(R), fB = fitPlane(band);
        if (!fL || !fR || !fB) continue;
        const bend = bendBetween(fL, fR);
        const gain = fB.p50 / Math.max(1e-6, (fL.p50 + fR.p50) / 2);
        if (bend < BEND_MIN_DEG || gain < GAIN_MIN) continue;
        const mid = { x: cx + nx * d, y: cy + ny * d };
        let near = Infinity;
        for (const l of interior) near = Math.min(near, distToSeg(mid, l.a, l.b));
        for (let i = 0; i < plan.length; i++) near = Math.min(near, distToSeg(mid, plan[i], plan[(i + 1) % plan.length]));
        if (near < NOT_A_NEW_LINE_FT) continue;
        if (!best || gain > best.gain) best = { L: fL, R: fR, bend, gain, d, nx, ny, nL: L.length, nR: R.length };
      }
    }
    if (!best) continue;

    // ── the line: where the two planes actually intersect ──
    const da = best.L.a - best.R.a, db = best.L.b - best.R.b, dc = best.L.c - best.R.c;
    const nrm = Math.hypot(da, db);
    if (nrm < 1e-9) continue;
    const dir = { x: -db / nrm, y: da / nrm };
    const through = { x: (-dc * da) / (nrm * nrm), y: (-dc * db) / (nrm * nrm) };
    const creaseP12 = Math.abs(best.L.a * dir.x + best.L.b * dir.y) * 12;

    // convex (both fall away) or concave (both drain in)?
    const sgn = Math.sign(da * best.nx + db * best.ny) || 1;
    const ncx = (da / nrm) * sgn, ncy = (db / nrm) * sgn;
    const probe = 6;
    const zc = best.L.a * through.x + best.L.b * through.y + best.L.c;
    const zL = best.L.a * (through.x - ncx * probe) + best.L.b * (through.y - ncy * probe) + best.L.c;
    const zR = best.R.a * (through.x + ncx * probe) + best.R.b * (through.y + ncy * probe) + best.R.c;
    const type: EvLineType = zL > zc && zR > zc ? "VALLEY"
      : zL < zc && zR < zc ? (creaseP12 <= LEVEL_PITCH12 ? "RIDGE" : "HIP")
        : "OTHER";

    // ── the guard: is this a fold, or a surface standing above the roof? ──
    const projAll = ins.map((p) => (p.x - cx) * best.nx + (p.y - cy) * best.ny);
    const band = ins.filter((_, i) => Math.abs(projAll[i] - best.d) <= BAND_FT);
    const bp = band.map((p) => (p.x - cx) * best.nx + (p.y - cy) * best.ny);
    const lowPts = band.filter((_, i) => bp[i] < best.d - GAP_FT);
    const highPts = band.filter((_, i) => bp[i] > best.d + GAP_FT);
    const fLo = fitPlane(lowPts), fHi = fitPlane(highPts);
    const mid = { x: cx + best.nx * best.d, y: cy + best.ny * best.d };
    const stepFt = fLo && fHi
      ? Math.abs((fLo.a * mid.x + fLo.b * mid.y + fLo.c) - (fHi.a * mid.x + fHi.b * mid.y + fHi.c))
      : Infinity;
    const stepAllowedFt = CUT_SAMPLE_FT * Math.tan((best.bend * Math.PI) / 360);

    let refused: string | undefined;
    if (type === "OTHER") refused = "the surface bends without folding — no ridge, hip or valley to call it";
    else if (!Number.isFinite(stepFt)) refused = "too few points either side to test for a step";
    else if (stepFt > stepAllowedFt) {
      refused = `a ${stepFt.toFixed(2)} ft step across the line, more than the ${stepAllowedFt.toFixed(2)} ft the search lattice could invent at ${best.bend.toFixed(0)}° — this is a surface above the roof, not a fold in it`;
    }

    out.push({
      facetId: face.id,
      facetLabel: String(face.designator || face.id),
      facetSqft,
      type,
      through,
      dir,
      bendDeg: best.bend,
      gain: best.gain,
      lowHalfFt: median(lowPts.map((p) => p.z)) - groundFt,
      highHalfFt: median(highPts.map((p) => p.z)) - groundFt,
      stepFt,
      stepAllowedFt,
      pointsLow: lowPts.length,
      pointsHigh: highPts.length,
      ...(refused ? { refused } : {}),
    });
  }
  return out;
}
