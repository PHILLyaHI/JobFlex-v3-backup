// Roof diagram — FLATTEN: make every facet an actual plane.
//
// A roof plane is flat. The reconstruction's facets are not: they are traced
// from a noisy DSM, so their rings wander off their own best-fit plane by feet
// (measured on 12629 NE 100th Pl: up to 2.4 ft, one facet bending 167° across
// its own surface). Nothing downstream repairs that — refine straightens lines
// in PLAN, rectify snaps their directions, planarize enforces the drawing
// invariants — so the warp survives into the drawing, where it shows as creases
// running through a facet that no line marks, and into every figure computed
// from the geometry.
//
// The fix is a global solve, not a per-facet one: facets share vertices, so
// flattening one by projecting its own ring would tear it from its neighbours.
// Instead each facet contributes a PLANE and each vertex is moved to the point
// that best satisfies every plane meeting there, anchored to where it started:
//
//     minimise  Σ_k (n_k · p − d_k)²  +  λ |p − p₀|²
//
// which is a 3×3 normal-equation solve per vertex (one plane → projection onto
// it; two → the nearest point on their crease; three or more → the corner they
// imply). λ keeps the system well-conditioned and stops a vertex with a single
// weak plane from drifting. Planes are refitted between iterations, so the
// solve converges onto a consistent polyhedron instead of chasing one facet.
//
// Pure and client-safe: no I/O, the input model is never mutated (deep copy),
// every vertex move is capped and NaN-guarded, and z is treated exactly like x
// and y — the facet is flattened in space, not squashed vertically.
import type { RoofModel, RoofPoint } from "@/lib/eagleview";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";

export interface FlattenReport {
  /** Facets that contributed a plane to the solve. */
  facets: number;
  pointsMoved: number;
  maxMoveFt: number;
  /** Worst facet deviation from its own plane, before and after. */
  devBeforeFt: number;
  devAfterFt: number;
  iterations: number;
}

export interface FlattenOptions {
  /** Hard cap on how far a vertex may travel in total (feet). */
  maxMoveFt?: number;
  /** Solve/refit rounds. Three is enough for roofs of this size. */
  iterations?: number;
  /** Anchor weight toward the original position, IN PLAN. Kept stiff: moving a
   *  vertex sideways re-arranges the roof's layout (measured: a free solve grew
   *  facet overlaps from 3 to 26 sq ft), while moving it vertically only makes
   *  the facet flat. */
  lambdaXY?: number;
  /** Anchor weight in height — loose, so z carries the flattening. */
  lambdaZ?: number;
  /** Solve HEIGHT ONLY, leaving the plan untouched (default). Moving a vertex
   *  sideways undoes work the rest of the chain has already done — rectify's
   *  grid directions and conform's snapped perimeter — and measurably knocked
   *  12629 NE 100th Pl's outer contour from 13/13 on-grid to 11/17. Height
   *  alone still flattens a facet; where vertices are shared the solve settles
   *  on the best compromise. */
  zOnly?: boolean;
  /** Замороженный градиент грани (a, b в ft/ft): направление плоскости —
   *  ИЗМЕРЕНИЕ (§J), свободная подгонка кольца вращала его на градусы ради
   *  сварных вершин. С градиентом рефитится только высота (c). */
  frozenGradFor?: (faceId: string) => [number, number] | null | undefined;
}

// Measured on 12629 NE 100th Pl (the worst warp in the fixtures): at 2.5 ft ×
// 3 rounds the worst facet still sat 0.79 ft off its plane; 3.5 ft × 12 brings
// the whole model to 0.01 ft — flat to the eye and to the validator. The cap is
// generous because the reconstruction's own vertices carry a foot or two of DSM
// noise; the λ anchor keeps the typical move far below it.
const DEFAULT_MAX_MOVE_FT = 3.5;
const DEFAULT_ITERATIONS = 24;
const DEFAULT_LAMBDA_XY = 4;
const DEFAULT_LAMBDA_Z = 0.005;

interface Plane {
  nx: number;
  ny: number;
  nz: number;
  d: number;
}

/** Least-squares plane through a ring, as a unit normal and offset (n·p = d).
 *  Falls back to a vertical-axis fit when the ring is degenerate in plan. */
function fitPlane(pts: RoofPoint[]): Plane | null {
  const n = pts.length;
  if (n < 3) return null;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
    cz += p.z;
  }
  cx /= n;
  cy /= n;
  cz /= n;
  // Covariance of the centred points; its smallest eigenvector is the normal.
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const p of pts) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dz = p.z - cz;
    xx += dx * dx; xy += dx * dy; xz += dx * dz;
    yy += dy * dy; yz += dy * dz; zz += dz * dz;
  }
  // Cross-product form (Newell-style), robust without an eigen solver.
  const detX = yy * zz - yz * yz;
  const detY = xx * zz - xz * xz;
  const detZ = xx * yy - xy * xy;
  const detMax = Math.max(detX, detY, detZ);
  if (!(detMax > 1e-12)) return null;
  let nx: number;
  let ny: number;
  let nz: number;
  if (detMax === detX) {
    nx = detX;
    ny = xz * yz - xy * zz;
    nz = xy * yz - xz * yy;
  } else if (detMax === detY) {
    nx = xz * yz - xy * zz;
    ny = detY;
    nz = xy * xz - yz * xx;
  } else {
    nx = xy * yz - xz * yy;
    ny = xy * xz - yz * xx;
    nz = detZ;
  }
  const len = Math.hypot(nx, ny, nz);
  if (!(len > 1e-12) || !Number.isFinite(len)) return null;
  nx /= len;
  ny /= len;
  nz /= len;
  return { nx, ny, nz, d: nx * cx + ny * cy + nz * cz };
}

/** Height-only solve: keep (x, y), move z to satisfy the planes meeting here.
 *  minimise Σ (nz_k·z − (d_k − nx_k·x − ny_k·y))² + λ (z − z₀)². */
function solveHeight(planes: Plane[], p0: RoofPoint, lambda: number): { x: number; y: number; z: number } | null {
  let a = lambda;
  let b = lambda * p0.z;
  for (const pl of planes) {
    const rhs = pl.d - pl.nx * p0.x - pl.ny * p0.y;
    a += pl.nz * pl.nz;
    b += pl.nz * rhs;
  }
  if (!(Math.abs(a) > 1e-12)) return null;
  const z = b / a;
  return Number.isFinite(z) ? { x: p0.x, y: p0.y, z } : null;
}

/** Solve (Σ nₖnₖᵀ + λI) p = Σ dₖnₖ + λp₀ by Gaussian elimination. */
function solvePoint(
  planes: Plane[],
  p0: RoofPoint,
  lambdaXY: number,
  lambdaZ: number,
): { x: number; y: number; z: number } | null {
  const A = [
    [lambdaXY, 0, 0],
    [0, lambdaXY, 0],
    [0, 0, lambdaZ],
  ];
  const b = [lambdaXY * p0.x, lambdaXY * p0.y, lambdaZ * p0.z];
  for (const pl of planes) {
    const n = [pl.nx, pl.ny, pl.nz];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) A[i][j] += n[i] * n[j];
      b[i] += pl.d * n[i];
    }
  }
  for (let i = 0; i < 3; i++) {
    let piv = i;
    for (let r = i + 1; r < 3; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
    if (Math.abs(A[piv][i]) < 1e-12) return null;
    [A[i], A[piv]] = [A[piv], A[i]];
    [b[i], b[piv]] = [b[piv], b[i]];
    for (let r = 0; r < 3; r++) {
      if (r === i) continue;
      const k = A[r][i] / A[i][i];
      for (let c = i; c < 3; c++) A[r][c] -= k * A[i][c];
      b[r] -= k * b[i];
    }
  }
  const out = { x: b[0] / A[0][0], y: b[1] / A[1][1], z: b[2] / A[2][2] };
  return Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z) ? out : null;
}

/** Worst distance from a facet ring to its own best-fit plane, over the model. */
function worstDeviation(model: RoofModel): number {
  const idx = buildIndexes(model);
  let worst = 0;
  for (const f of model.faces) {
    const ring = ringOf(f.lineIds, idx);
    if (!ring || ring.length < 3) continue;
    const pl = fitPlane(ring);
    if (!pl) continue;
    for (const p of ring) {
      worst = Math.max(worst, Math.abs(pl.nx * p.x + pl.ny * p.y + pl.nz * p.z - pl.d));
    }
  }
  return worst;
}

export function flattenFacets(
  input: RoofModel,
  opts: FlattenOptions = {},
): { model: RoofModel; report: FlattenReport } {
  const maxMove = opts.maxMoveFt ?? DEFAULT_MAX_MOVE_FT;
  const iterations = Math.max(1, opts.iterations ?? DEFAULT_ITERATIONS);
  const zOnly = opts.zOnly ?? true;
  const lambdaXY = opts.lambdaXY ?? DEFAULT_LAMBDA_XY;
  const lambdaZ = opts.lambdaZ ?? DEFAULT_LAMBDA_Z;

  const model: RoofModel = {
    ...input,
    points: input.points.map((p) => ({ ...p })),
    lines: input.lines.map((l) => ({ ...l })),
    faces: input.faces.map((f) => ({ ...f, lineIds: [...f.lineIds] })),
    penetrations: input.penetrations?.map((p) => ({ ...p, lineIds: [...p.lineIds] })) ?? input.penetrations,
  };

  const devBefore = worstDeviation(model);
  const origin = new Map(model.points.map((p) => [p.id, { x: p.x, y: p.y, z: p.z }]));
  let facetsUsed = 0;

  for (let round = 0; round < iterations; round++) {
    const idx = buildIndexes(model);
    // 1. a plane per facet, and the facets each vertex belongs to
    const planeByFace = new Map<string, Plane>();
    const planesByPoint = new Map<string, Plane[]>();
    for (const f of model.faces) {
      const ring = ringOf(f.lineIds, idx);
      if (!ring || ring.length < 3) continue;
      let pl = fitPlane(ring);
      const fg = opts.frozenGradFor?.(f.id);
      if (fg) {
        // плоскость с измеренным направлением: n из (a,b), d — среднее по кольцу
        const nn = Math.hypot(fg[0], fg[1], 1);
        const nx = -fg[0] / nn;
        const ny = -fg[1] / nn;
        const nzv = 1 / nn;
        let dm = 0;
        for (const q of ring) dm += nx * q.x + ny * q.y + nzv * q.z;
        pl = { nx, ny, nz: nzv, d: dm / ring.length };
      }
      if (!pl) continue;
      planeByFace.set(f.id, pl);
      for (const p of ring) {
        const list = planesByPoint.get(p.id) ?? [];
        list.push(pl);
        planesByPoint.set(p.id, list);
      }
    }
    if (round === 0) facetsUsed = planeByFace.size;
    if (!planeByFace.size) break;

    // 2. move each vertex onto the planes that meet there
    for (const p of model.points) {
      const planes = planesByPoint.get(p.id);
      if (!planes || !planes.length) continue;
      const solved = zOnly
        ? solveHeight(planes, p, lambdaZ)
        : solvePoint(planes, p, lambdaXY, lambdaZ);
      if (!solved) continue;
      const from = origin.get(p.id) ?? p;
      let dx = solved.x - from.x;
      let dy = solved.y - from.y;
      let dz = solved.z - from.z;
      const travel = Math.hypot(dx, dy, dz);
      if (travel > maxMove) {
        const s = maxMove / travel;
        dx *= s;
        dy *= s;
        dz *= s;
      }
      p.x = from.x + dx;
      p.y = from.y + dy;
      p.z = from.z + dz;
    }
  }

  let moved = 0;
  let maxMoveSeen = 0;
  for (const p of model.points) {
    const from = origin.get(p.id);
    if (!from) continue;
    const d = Math.hypot(p.x - from.x, p.y - from.y, p.z - from.z);
    if (d > 1e-6) moved++;
    maxMoveSeen = Math.max(maxMoveSeen, d);
  }

  // Line figures follow the geometry that just moved; areas and totals are
  // recomputed by the finisher downstream.
  const pts = new Map(model.points.map((p) => [p.id, p]));
  for (const l of model.lines) {
    const a = pts.get(l.aId);
    const b = pts.get(l.bId);
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (Number.isFinite(len)) l.lengthFt = len;
  }

  return {
    model,
    report: {
      facets: facetsUsed,
      pointsMoved: moved,
      maxMoveFt: +maxMoveSeen.toFixed(3),
      devBeforeFt: +devBefore.toFixed(3),
      devAfterFt: +worstDeviation(model).toFixed(3),
      iterations,
    },
  };
}
