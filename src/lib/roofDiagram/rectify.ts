// Roof diagram — RECTIFICATION: straighten a reconstructed roof onto the
// house's grid so it reads like a drafted plan.
//
// WHY. The aerial reconstruction gets the shape of the roof right but not its
// lines: eaves and rakes come from a pixel trace, and ridges / hips / valleys
// from the intersection of two noisy fitted planes, so a third of the drawn
// footage sits at arbitrary angles (measured on 419 Prairie Ridge Ln: 36 % of
// edge length more than 3° off both the house axes and the 45° diagonals, vs
// 10 % in the EagleView report of the same roof). A drafted plan has eaves and
// ridges ON the two axes and hips/valleys ON the diagonals; that is what makes
// EagleView's drawings look crisp.
//
// WHAT. Every edge whose direction is within a tolerance of one of the four
// grid directions (axis, axis+90°, and the two diagonals) is given that exact
// direction as a target; edges further off keep their own direction (a real
// off-grid wing must not be forced). Perimeter edges that run along an aligned
// Instant outline edge get a stronger target: collinear with that outline edge.
// Vertex positions are then solved so that every constrained edge is straight
// on its target — a small least-squares problem over the whole topology,
// relaxed iteratively (Jacobi): each edge proposes where its two endpoints
// should be, every vertex averages the proposals of the edges that meet there,
// with a spring back to where it started and a hard cap on how far a vertex
// may travel. Moving VERTICES, not lines, keeps facets watertight: a ridge and
// the hips meeting it move together instead of kinking.
//
// z is untouched (pitch comes from the facet plane, not from the corners).
// Pure and client-safe: no I/O, no side effects, input never mutated.

import type { RoofModel, RoofPoint } from "@/lib/eagleview";

export interface RectifyOptions {
  /** Snap tolerance to an axis, degrees. Default 12. */
  axisTolDeg?: number;
  /** Snap tolerance to a 45° diagonal, degrees. Default 10. */
  diagTolDeg?: number;
  /** How close (feet) a perimeter edge must be to an outline edge to be pinned to it. Default 4.5. */
  outlineTolFt?: number;
  /** Max distance (feet) a vertex may move from its original position. Default 3. */
  maxShiftFt?: number;
  /** Relaxation iterations. Default 80. */
  iterations?: number;
  /** Pull toward the original position per iteration (0..1). Default 0.12.
   *  Held for the bulk of the run, then annealed linearly to 0.01 over the
   *  final 20 iterations so constrained edges land exactly on target. */
  stiffness?: number;
  /** Aligned outline rings (frame feet); optional. */
  outlines?: Array<Array<{ x: number; y: number }>>;
  /** Dominant axis in degrees (0 = +x). Estimated from the edges when omitted. */
  axisDeg?: number;
}

export interface RectifyReport {
  axisDeg: number;
  constrained: number;
  pinnedToOutline: number;
  free: number;
  meanShiftFt: number;
  maxShiftFt: number;
}

type P2 = { x: number; y: number };
const D2R = Math.PI / 180;

/** Length-weighted mode of edge direction folded to [0, 90), smoothed ±2°. */
export function dominantAxisDeg(model: RoofModel): number {
  const pts = new Map(model.points.map((p) => [p.id, p]));
  const hist = new Array<number>(90).fill(0);
  for (const l of model.lines) {
    const a = pts.get(l.aId), b = pts.get(l.bId);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) continue;
    const deg = (((Math.atan2(dy, dx) / D2R) % 90) + 90) % 90;
    hist[Math.round(deg) % 90] += len;
  }
  let best = 0, bestS = -1;
  for (let d = 0; d < 90; d++) {
    let s = 0;
    for (let k = -2; k <= 2; k++) s += hist[(d + k + 90) % 90];
    if (s > bestS) { bestS = s; best = d; }
  }
  return best;
}

/** Signed angle difference folded to (-90, 90]. */
function angleDiffDeg(a: number, b: number): number {
  let d = ((a - b) % 180 + 180) % 180;
  if (d > 90) d -= 180;
  return d;
}

interface Constraint {
  aId: string;
  bId: string;
  /** unit direction the edge must follow */
  dir: P2;
  /** when pinned to an outline edge: a point on that edge's line */
  through: P2 | null;
  weight: number;
}

function nearestOutlineEdge(
  mid: P2,
  dir: P2,
  outlines: Array<P2[]>,
  tolFt: number,
  tolDeg: number,
): { dir: P2; through: P2 } | null {
  let best: { d: number; dir: P2; through: P2 } | null = null;
  const edgeDeg = Math.atan2(dir.y, dir.x) / D2R;
  for (const ring of outlines) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const ex = b.x - a.x, ey = b.y - a.y;
      const len = Math.hypot(ex, ey);
      if (len < 0.5) continue;
      const ux = ex / len, uy = ey / len;
      if (Math.abs(angleDiffDeg(Math.atan2(uy, ux) / D2R, edgeDeg)) > tolDeg) continue;
      // distance from mid to the segment
      const t = Math.max(0, Math.min(len, (mid.x - a.x) * ux + (mid.y - a.y) * uy));
      const px = a.x + ux * t, py = a.y + uy * t;
      const d = Math.hypot(mid.x - px, mid.y - py);
      if (d <= tolFt && (!best || d < best.d)) best = { d, dir: { x: ux, y: uy }, through: { x: px, y: py } };
    }
  }
  return best ? { dir: best.dir, through: best.through } : null;
}

/**
 * Straighten the model's lines onto the house grid. Returns a new model (deep
 * copy of points; lines/faces shared by reference are also copied) and a
 * report. Line lengths, areas and totals are NOT recomputed here — callers do
 * that with their own figure pipeline (calibrate.ts) so k is applied once.
 */
export function rectifyModel(input: RoofModel, opts: RectifyOptions = {}): { model: RoofModel; report: RectifyReport } {
  const axisTol = opts.axisTolDeg ?? 12;
  const diagTol = opts.diagTolDeg ?? 10;
  const outlineTol = opts.outlineTolFt ?? 4.5;
  const maxShift = opts.maxShiftFt ?? 3;
  const iterations = opts.iterations ?? 80;
  const stiffness = opts.stiffness ?? 0.12;

  const model: RoofModel = {
    ...input,
    points: input.points.map((p) => ({ ...p })),
    lines: input.lines.map((l) => ({ ...l })),
    faces: input.faces.map((f) => ({ ...f, lineIds: [...f.lineIds] })),
    penetrations: input.penetrations.map((f) => ({ ...f, lineIds: [...f.lineIds] })),
    totals: { ...input.totals, footageByType: { ...input.totals.footageByType }, bounds: { ...input.totals.bounds } },
  };
  const axisDeg = opts.axisDeg ?? dominantAxisDeg(model);
  const grid = [0, 45, 90, 135].map((d) => axisDeg + d);

  const pts = new Map<string, RoofPoint>(model.points.map((p) => [p.id, p]));
  const orig = new Map<string, P2>(model.points.map((p) => [p.id, { x: p.x, y: p.y }]));

  // Which lines are perimeter (owned by exactly one ROOF face)?
  const owners = new Map<string, number>();
  for (const f of model.faces) for (const id of f.lineIds) owners.set(id, (owners.get(id) ?? 0) + 1);

  const constraints: Constraint[] = [];
  let pinned = 0, free = 0;
  for (const l of model.lines) {
    const a = pts.get(l.aId), b = pts.get(l.bId);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) continue;
    const deg = Math.atan2(dy, dx) / D2R;
    const ux = dx / len, uy = dy / len;

    // Outline pin first: a perimeter edge running along an aligned outline edge.
    if (opts.outlines?.length && owners.get(l.id) === 1 && l.type !== "FLASHING" && l.type !== "STEPFLASH") {
      const hit = nearestOutlineEdge({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, { x: ux, y: uy }, opts.outlines, outlineTol, axisTol);
      if (hit) {
        constraints.push({ aId: l.aId, bId: l.bId, dir: hit.dir, through: hit.through, weight: 2 });
        pinned++;
        continue;
      }
    }
    // Grid direction: axes within axisTol, diagonals within diagTol.
    let target: number | null = null, bestOff = Infinity;
    grid.forEach((g, i) => {
      const off = Math.abs(angleDiffDeg(deg, g));
      const tol = i % 2 === 0 ? axisTol : diagTol;
      if (off <= tol && off < bestOff) { bestOff = off; target = g; }
    });
    if (target == null) { free++; continue; }
    // Keep the edge's own sense so `dir` points a→b.
    const t = target as number;
    let tx = Math.cos(t * D2R), ty = Math.sin(t * D2R);
    if (tx * ux + ty * uy < 0) { tx = -tx; ty = -ty; }
    constraints.push({ aId: l.aId, bId: l.bId, dir: { x: tx, y: ty }, through: null, weight: 1 });
  }

  // Jacobi relaxation with an ANNEALED spring (audit #12). A constant spring
  // makes every vertex settle at a fixed blend of the constraint proposals and
  // its noisy original position, so a constrained edge converges NEAR its grid
  // direction but never onto it — measured as a 1–2° residual that reads as
  // "almost straight", worse than either honest state. The spring is only
  // needed while the constraint system is still contradicting itself (early
  // iterations, where it stops vertices sliding far along their edges); once
  // the directions have settled it is pure error. So: hold the configured
  // stiffness for the bulk of the run, then decay it linearly toward
  // ANNEAL_FLOOR over the FINAL ANNEAL_ITERS iterations, letting constrained
  // edges land exactly on target while maxShift still caps total travel.
  const ANNEAL_ITERS = 20;
  const ANNEAL_FLOOR = 0.01;
  const acc = new Map<string, { x: number; y: number; w: number }>();
  for (let it = 0; it < iterations; it++) {
    const remaining = iterations - it; // iterations left, this one included
    const spring =
      remaining > ANNEAL_ITERS
        ? stiffness
        : ANNEAL_FLOOR + (Math.min(stiffness, 1) - ANNEAL_FLOOR) * ((remaining - 1) / Math.max(1, ANNEAL_ITERS - 1));
    acc.clear();
    const push = (id: string, x: number, y: number, w: number) => {
      const s = acc.get(id) ?? { x: 0, y: 0, w: 0 };
      s.x += x * w; s.y += y * w; s.w += w;
      acc.set(id, s);
    };
    for (const c of constraints) {
      const a = pts.get(c.aId)!, b = pts.get(c.bId)!;
      // Line to project onto: through `through` (outline) or the edge's own midpoint.
      const ox = c.through ? c.through.x : (a.x + b.x) / 2;
      const oy = c.through ? c.through.y : (a.y + b.y) / 2;
      const nx = -c.dir.y, ny = c.dir.x; // unit normal
      const da = (a.x - ox) * nx + (a.y - oy) * ny;
      const db = (b.x - ox) * nx + (b.y - oy) * ny;
      push(c.aId, a.x - da * nx, a.y - da * ny, c.weight);
      push(c.bId, b.x - db * nx, b.y - db * ny, c.weight);
    }
    for (const p of model.points) {
      const s = acc.get(p.id);
      if (!s) continue;
      const o = orig.get(p.id)!;
      // Weighted proposal, blended with the (annealed) spring to the original spot.
      let nx = (s.x / s.w) * (1 - spring) + o.x * spring;
      let ny = (s.y / s.w) * (1 - spring) + o.y * spring;
      const sx = nx - o.x, sy = ny - o.y;
      const shift = Math.hypot(sx, sy);
      if (shift > maxShift) { nx = o.x + (sx / shift) * maxShift; ny = o.y + (sy / shift) * maxShift; }
      p.x = nx; p.y = ny;
    }
  }

  let sum = 0, max = 0, n = 0;
  for (const p of model.points) {
    const o = orig.get(p.id)!;
    const d = Math.hypot(p.x - o.x, p.y - o.y);
    if (d > 1e-9) { sum += d; n++; }
    if (d > max) max = d;
  }
  return {
    model,
    report: { axisDeg, constrained: constraints.length, pinnedToOutline: pinned, free, meanShiftFt: n ? sum / n : 0, maxShiftFt: max },
  };
}
