// Lot topography for the fence studio — pure math, no network, no DOM.
//
// One elevation lattice is sampled over the lot (the parcel's bounding box
// plus a margin, or the ground around the address when there is no parcel) and
// sent to the same elevation action the fence profile uses. This module turns
// the answer into what the map draws and what the page says about the ground:
//
//   · CONTOUR LINES — marching squares per level with linear edge interpolation
//     (ported from FenceScan's lib/fence/contours.ts, which carries the unit
//     tests for the case table and the chaining), smoothed for the eye,
//     split at the property line so the lot's own lines read strong and the
//     neighbours' read faint;
//   · LABELS — "+4 ft" along the lines, measured UP FROM THE LOT'S LOW POINT,
//     which is the number a fence crew uses (how much the ground climbs), not
//     the elevation above sea level;
//   · HIGH / LOW marks, the lot's fall, a grade figure and a fall direction;
//   · GRADE ALONG A STRAIGHT LINE — a parcel side before any fence is down,
//     classed with the same level / racked / stepped thresholds the priced
//     fence profile uses.
//
// The PRICE never reads this grid. The traced fence keeps its own profile,
// sampled every ~10 ft along the line itself (fenceTerrain) — a lattice is
// for seeing the land, a profile is for billing the footage.

import type { PathPoint } from "./fenceTypes";
import { localFeetToLatLng, pointInRingFt, type LatLng } from "./mapProjection";
import { LEVEL_MAX_DEG, RACKED_MAX_DEG, type SlopeClass } from "./fenceTerrain";

/** Most lattice points in one request (the elevation action allows more). */
export const TOPO_MAX_POINTS = 900;
/** Finest lattice cell. 3DEP lidar DEMs are 1 m (3.3 ft); an 8 ft cell keeps a
 *  quarter-acre lot at ~500 points and still resolves a swale. */
export const TOPO_MIN_CELL_FT = 8;
/** Readability ceiling for the lines across the lot's own relief. */
export const TOPO_MAX_LINES = 12;
/** Under this much fall across the lot there is nothing to contour. */
export const TOPO_FLAT_FT = 1;

export interface TopoBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Lattice in local feet: node (c, r) sits at (x0 + c·dx, y0 + r·dy). Rows run
 *  south → north (+y), columns west → east (+x). */
export interface TopoGridPlan {
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  cols: number;
  rows: number;
}

type Pt = PathPoint;

// ── boxes ────────────────────────────────────────────────────────────────────

export function boxOf(points: Pt[]): TopoBox | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

export function padBox(b: TopoBox, padFt: number): TopoBox {
  return { x0: b.x0 - padFt, y0: b.y0 - padFt, x1: b.x1 + padFt, y1: b.y1 + padFt };
}

export function unionBox(a: TopoBox | null, b: TopoBox | null): TopoBox | null {
  if (!a) return b;
  if (!b) return a;
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

/** True when `inner` sits inside `outer` shrunk by `marginFt` on every side. */
export function boxContains(outer: TopoBox, inner: TopoBox, marginFt = 0): boolean {
  return (
    inner.x0 >= outer.x0 + marginFt &&
    inner.y0 >= outer.y0 + marginFt &&
    inner.x1 <= outer.x1 - marginFt &&
    inner.y1 <= outer.y1 - marginFt
  );
}

export function planBox(plan: TopoGridPlan): TopoBox {
  return {
    x0: plan.x0,
    y0: plan.y0,
    x1: plan.x0 + (plan.cols - 1) * plan.dx,
    y1: plan.y0 + (plan.rows - 1) * plan.dy,
  };
}

// ── lattice ──────────────────────────────────────────────────────────────────

/**
 * The finest square lattice covering `box` within `maxPoints`, never finer
 * than `minCellFt`, centred on the box so the leftover splits evenly.
 */
export function planTopoGrid(
  box: TopoBox,
  maxPoints = TOPO_MAX_POINTS,
  minCellFt = TOPO_MIN_CELL_FT,
): TopoGridPlan {
  const w = Math.max(1, Number.isFinite(box.x1 - box.x0) ? box.x1 - box.x0 : 1);
  const h = Math.max(1, Number.isFinite(box.y1 - box.y0) ? box.y1 - box.y0 : 1);
  const cap = Math.max(4, Math.floor(maxPoints));
  let cell = Math.max(minCellFt, Math.sqrt((w * h) / cap));
  for (let guard = 0; guard < 200; guard++) {
    const cols = Math.ceil(w / cell) + 1;
    const rows = Math.ceil(h / cell) + 1;
    if (cols * rows <= cap) {
      const gw = (cols - 1) * cell;
      const gh = (rows - 1) * cell;
      return {
        x0: (box.x0 + box.x1) / 2 - gw / 2,
        y0: (box.y0 + box.y1) / 2 - gh / 2,
        dx: cell,
        dy: cell,
        cols,
        rows,
      };
    }
    cell *= 1.04;
  }
  // Unreachable for a finite box; a 2×2 lattice over it is still honest.
  return { x0: box.x0, y0: box.y0, dx: w, dy: h, cols: 2, rows: 2 };
}

/** Lattice nodes as lat/lng, row-major (row 0 = south edge), for the action. */
export function topoSamplePoints(plan: TopoGridPlan, origin: LatLng): LatLng[] {
  const out: LatLng[] = [];
  for (let r = 0; r < plan.rows; r++) {
    for (let c = 0; c < plan.cols; c++) {
      out.push(localFeetToLatLng(origin, { x: plan.x0 + c * plan.dx, y: plan.y0 + r * plan.dy }));
    }
  }
  return out;
}

/** The action's flat answer → grid[row][col], or null when it does not fit. */
export function gridFromSamples(plan: TopoGridPlan, elevFt: number[]): number[][] | null {
  if (!Array.isArray(elevFt) || elevFt.length !== plan.cols * plan.rows) return null;
  const grid: number[][] = [];
  for (let r = 0; r < plan.rows; r++) {
    const row = elevFt.slice(r * plan.cols, (r + 1) * plan.cols);
    if (row.some((v) => !Number.isFinite(v))) return null;
    grid.push(row);
  }
  return grid;
}

/** Bilinear ground elevation at a local-feet point; null off the lattice. */
export function elevationAt(grid: number[][], plan: TopoGridPlan, p: Pt): number | null {
  const fx = (p.x - plan.x0) / plan.dx;
  const fy = (p.y - plan.y0) / plan.dy;
  const eps = 1e-6;
  if (!(fx >= -eps && fy >= -eps && fx <= plan.cols - 1 + eps && fy <= plan.rows - 1 + eps)) return null;
  const c0 = Math.max(0, Math.min(plan.cols - 2, Math.floor(fx)));
  const r0 = Math.max(0, Math.min(plan.rows - 2, Math.floor(fy)));
  const sx = Math.max(0, Math.min(1, fx - c0));
  const sy = Math.max(0, Math.min(1, fy - r0));
  const a = grid[r0][c0];
  const b = grid[r0][c0 + 1];
  const c = grid[r0 + 1][c0];
  const d = grid[r0 + 1][c0 + 1];
  return a * (1 - sx) * (1 - sy) + b * sx * (1 - sy) + c * (1 - sx) * sy + d * sx * sy;
}

// ── contour interval ─────────────────────────────────────────────────────────

/**
 * A "nice" interval that draws at most TOPO_MAX_LINES lines across the lot's
 * relief; 0 when the lot falls less than TOPO_FLAT_FT. Half-foot lines only
 * for a fine source (a lidar DEM) — on a coarse model they would be drawing
 * the interpolation, not the ground.
 */
export function pickTopoInterval(reliefFt: number, fine: boolean): number {
  if (!Number.isFinite(reliefFt) || reliefFt < TOPO_FLAT_FT) return 0;
  const steps = fine ? [0.5, 1, 2, 5, 10, 20, 50, 100] : [1, 2, 5, 10, 20, 50, 100];
  for (const s of steps) if (reliefFt / s <= TOPO_MAX_LINES) return s;
  return 200;
}

// ── marching squares (grid index space) ──────────────────────────────────────

type Edge = "T" | "R" | "B" | "L";

/** Segments per case (bit set = corner ≥ level; tl=8, tr=4, br=2, bl=1, where
 *  "top" is row r and "bottom" row r+1). Saddles 5 and 10 resolve on the cell
 *  centre. The table is FenceScan's, unchanged. */
function caseSegments(mask: number, centerHigh: boolean): Array<[Edge, Edge]> {
  switch (mask) {
    case 1: return [["L", "B"]];
    case 2: return [["B", "R"]];
    case 3: return [["L", "R"]];
    case 4: return [["T", "R"]];
    case 5: return centerHigh ? [["T", "L"], ["B", "R"]] : [["T", "R"], ["B", "L"]];
    case 6: return [["T", "B"]];
    case 7: return [["T", "L"]];
    case 8: return [["T", "L"]];
    case 9: return [["T", "B"]];
    case 10: return centerHigh ? [["T", "R"], ["B", "L"]] : [["T", "L"], ["B", "R"]];
    case 11: return [["T", "R"]];
    case 12: return [["L", "R"]];
    case 13: return [["B", "R"]];
    case 14: return [["L", "B"]];
    default: return [];
  }
}

/** Shared edges are computed from the same two corners in the same order by
 *  both neighbouring cells, so their endpoints agree to the bit — the key can
 *  be exact-ish without a tolerance that would weld distinct points. */
const keyOf = (p: Pt) => `${Math.round(p.x * 1e6)}_${Math.round(p.y * 1e6)}`;

function chainSegments(segs: Array<[Pt, Pt]>): Pt[][] {
  const bucket = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const p of s) {
      const k = keyOf(p);
      const arr = bucket.get(k);
      if (arr) arr.push(i);
      else bucket.set(k, [i]);
    }
  });
  const used = new Array<boolean>(segs.length).fill(false);
  const chains: Pt[][] = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const chain: Pt[] = [segs[i][0], segs[i][1]];
    for (const dir of [1, -1] as const) {
      for (;;) {
        const tip = dir === 1 ? chain[chain.length - 1] : chain[0];
        const tk = keyOf(tip);
        const next = (bucket.get(tk) ?? []).find((c) => !used[c]);
        if (next === undefined) break;
        used[next] = true;
        const [a, b] = segs[next];
        const far = keyOf(a) === tk ? b : a;
        if (dir === 1) chain.push(far);
        else chain.unshift(far);
      }
    }
    chains.push(chain);
  }
  return chains;
}

/** One level's polylines, in LOCAL FEET. A closed ring repeats its first point. */
export function contourChains(grid: number[][], plan: TopoGridPlan, level: number): Pt[][] {
  const segs: Array<[Pt, Pt]> = [];
  for (let r = 0; r + 1 < grid.length; r++) {
    const rowA = grid[r];
    const rowB = grid[r + 1];
    const cols = Math.min(rowA.length, rowB.length);
    for (let c = 0; c + 1 < cols; c++) {
      const tl = rowA[c];
      const tr = rowA[c + 1];
      const br = rowB[c + 1];
      const bl = rowB[c];
      const mask = (tl >= level ? 8 : 0) | (tr >= level ? 4 : 0) | (br >= level ? 2 : 0) | (bl >= level ? 1 : 0);
      if (mask === 0 || mask === 15) continue;
      const lerp = (v0: number, v1: number) =>
        v1 === v0 ? 0.5 : Math.max(0, Math.min(1, (level - v0) / (v1 - v0)));
      const onEdge = (e: Edge): Pt =>
        e === "T"
          ? { x: c + lerp(tl, tr), y: r }
          : e === "B"
            ? { x: c + lerp(bl, br), y: r + 1 }
            : e === "L"
              ? { x: c, y: r + lerp(tl, bl) }
              : { x: c + 1, y: r + lerp(tr, br) };
      const centerHigh = (tl + tr + br + bl) / 4 >= level;
      for (const [e1, e2] of caseSegments(mask, centerHigh)) segs.push([onEdge(e1), onEdge(e2)]);
    }
  }
  return chainSegments(segs).map((chain) =>
    chain.map((p) => ({ x: plan.x0 + p.x * plan.dx, y: plan.y0 + p.y * plan.dy })),
  );
}

// ── shaping ──────────────────────────────────────────────────────────────────

function isClosed(chain: Pt[]): boolean {
  if (chain.length < 4) return false;
  const a = chain[0];
  const b = chain[chain.length - 1];
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
}

/** Chaikin corner cutting — a lattice line zig-zags cell to cell; two passes
 *  read as a drawn contour. Open chains keep their endpoints (they sit on the
 *  lattice edge); closed rings stay closed. Display only. */
export function smoothChain(chain: Pt[], passes = 2): Pt[] {
  let pts = chain;
  const closed = isClosed(chain);
  for (let k = 0; k < passes && pts.length >= 3; k++) {
    const out: Pt[] = [];
    const n = closed ? pts.length - 1 : pts.length;
    if (!closed) out.push(pts[0]);
    for (let i = 0; i < n - (closed ? 0 : 1); i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      out.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
      out.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
    }
    if (closed) out.push(out[0]);
    else out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

function pathLength(pts: Pt[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
}

export interface ChainPiece {
  inside: boolean;
  pts: Pt[];
}

/**
 * Cut a polyline where it crosses the region edge. Each crossing is found by
 * bisection on the segment, so a piece ends ON the property line rather than
 * at the nearest vertex. A closed ring whose two ends fall on the same side
 * joins back into one piece.
 */
export function splitByRegion(chain: Pt[], inside: (p: Pt) => boolean): ChainPiece[] {
  if (chain.length < 2) return [];
  const pieces: ChainPiece[] = [];
  let state = inside(chain[0]);
  let cur: Pt[] = [chain[0]];
  for (let i = 1; i < chain.length; i++) {
    const b = chain[i];
    const sb = inside(b);
    if (sb !== state) {
      let lo = chain[i - 1];
      let hi = b;
      for (let k = 0; k < 14; k++) {
        const mid = { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2 };
        if (inside(mid) === state) lo = mid;
        else hi = mid;
      }
      const cross = { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2 };
      cur.push(cross);
      pieces.push({ inside: state, pts: cur });
      cur = [cross];
      state = sb;
    }
    cur.push(b);
  }
  pieces.push({ inside: state, pts: cur });
  if (pieces.length > 1 && isClosed(chain) && pieces[0].inside === pieces[pieces.length - 1].inside) {
    const last = pieces.pop() as ChainPiece;
    pieces[0] = { inside: last.inside, pts: last.pts.concat(pieces[0].pts.slice(1)) };
  }
  return pieces.filter((p) => p.pts.length >= 2);
}

// ── grade along a straight line ──────────────────────────────────────────────

export interface LineGrade {
  planFt: number;
  /** Net change, start → end (signed, + = uphill). */
  riseFt: number;
  thetaDeg: number;
  /** Net grade, |rise| / plan, as a percentage. */
  pct: number;
  /** Steepest ~10 ft stretch along the line, percent. */
  maxPct: number;
  /** Length along the ground. */
  gradeFt: number;
  cls: SlopeClass;
}

/** Grade of the straight line a → b over the lattice (null if it leaves it). */
export function lineGradeOnGrid(grid: number[][], plan: TopoGridPlan, a: Pt, b: Pt): LineGrade | null {
  const planFt = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(planFt > 0.5)) return null;
  const n = Math.max(2, Math.ceil(planFt / Math.min(5, plan.dx / 2)) + 1);
  const z: number[] = [];
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    const v = elevationAt(grid, plan, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    if (v === null) return null;
    z.push(v);
  }
  const ds = planFt / (n - 1);
  let gradeFt = 0;
  for (let k = 1; k < n; k++) gradeFt += Math.hypot(ds, z[k] - z[k - 1]);
  const win = Math.max(1, Math.round(10 / ds));
  let maxPct = 0;
  for (let k = win; k < n; k++) {
    const pct = (Math.abs(z[k] - z[k - win]) / (win * ds)) * 100;
    if (pct > maxPct) maxPct = pct;
  }
  const riseFt = z[n - 1] - z[0];
  const thetaDeg = (Math.atan2(Math.abs(riseFt), planFt) * 180) / Math.PI;
  const cls: SlopeClass = thetaDeg < LEVEL_MAX_DEG ? "level" : thetaDeg <= RACKED_MAX_DEG ? "racked" : "stepped";
  return {
    planFt,
    riseFt,
    thetaDeg,
    pct: (Math.abs(riseFt) / planFt) * 100,
    maxPct: Math.max(maxPct, (Math.abs(riseFt) / planFt) * 100),
    gradeFt,
    cls,
  };
}

// ── the lot ──────────────────────────────────────────────────────────────────

export interface TopoLabel {
  at: LatLng;
  text: string;
  /** Screen rotation, degrees clockwise: within ±90 so text reads upright, or
   *  up to ±110 on a near-vertical line, where the top of the text faces
   *  uphill. */
  angleDeg: number;
  major: boolean;
}

export interface TopoOverlay {
  intervalFt: number;
  lines: Array<{ major: boolean; inside: LatLng[][]; outside: LatLng[][] }>;
  labels: TopoLabel[];
  marks: Array<{ at: LatLng; kind: "high" | "low"; text: string }>;
}

export interface LotTopo {
  /** Null when the lot is too flat to contour. */
  overlay: TopoOverlay | null;
  /** Fall across the lot (or the sampled ground when there is no lot), ft. */
  reliefFt: number;
  intervalFt: number;
  /** Average grade across the lot's cells, percent. An average, not a peak:
   *  one cut bank beside a house would otherwise make a gentle yard read as a
   *  cliff (a 90×140 ft test lot with 21 ft of fall read "78%" at the 95th
   *  percentile). The steep stretch of each side is in its own tooltip. */
  gradePct: number;
  /** Compass direction the ground falls toward, when it falls one way. */
  fallsToward: string | null;
}

/** Minimum spacing between two labels on the ground; the map also hides
 *  labels that collide on screen at the current zoom. */
const LABEL_GAP_FT = 26;

/** The point `dist` feet along a polyline, the upright screen angle there, and
 *  the local direction of travel (for deciding which side is uphill). */
function pointAlong(pts: Pt[], dist: number): { at: Pt; angleDeg: number; dir: Pt } | null {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d > 0 && acc + d >= dist) {
      const t = (dist - acc) / d;
      // Local frame is +y north; the screen's y runs down, hence the sign.
      let angleDeg = (-Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      if (angleDeg > 90) angleDeg -= 180;
      if (angleDeg < -90) angleDeg += 180;
      return { at: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, angleDeg, dir: { x: (b.x - a.x) / d, y: (b.y - a.y) / d } };
    }
    acc += d;
  }
  return null;
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function fmtFt(v: number, half: boolean): string {
  const r = half ? Math.round(v * 2) / 2 : Math.round(v);
  const s = half && r % 1 !== 0 ? r.toFixed(1) : String(Math.round(r));
  return r > 0 ? `+${s} ft` : r < 0 ? `−${s.replace("-", "")} ft` : "0 ft";
}

/**
 * Everything the map and the legend show about the land, from one lattice.
 * `rings` are the lot's boundary rings in local feet (empty = no parcel: the
 * whole lattice is treated as the site). `fine` marks a lidar-grade source.
 */
export function buildLotTopo(input: {
  grid: number[][];
  plan: TopoGridPlan;
  origin: LatLng;
  rings: Pt[][];
  fine: boolean;
}): LotTopo {
  const { grid, plan, origin, fine } = input;
  const rings = input.rings.filter((r) => r.length >= 3);
  const inside = rings.length ? (p: Pt) => rings.some((r) => pointInRingFt(p, r)) : () => true;
  const node = (c: number, r: number): Pt => ({ x: plan.x0 + c * plan.dx, y: plan.y0 + r * plan.dy });

  // The lot's own ground: lattice nodes inside it, plus the boundary sampled
  // densely along every edge. Corners alone are not enough: the lines are cut
  // from the bilinear surface, which can crest or dip MID-edge (a knoll just
  // past the line, a swale crossing it), and then a strong in-lot contour ran
  // above the HIGH mark while the lot's real top got no line at all.
  const ext = { lo: Infinity, hi: -Infinity, loAt: null as Pt | null, hiAt: null as Pt | null };
  const consider = (p: Pt, v: number | null) => {
    if (v === null || !Number.isFinite(v)) return;
    if (v < ext.lo - 1e-9) { ext.lo = v; ext.loAt = p; }
    if (v > ext.hi + 1e-9) { ext.hi = v; ext.hiAt = p; }
  };
  for (let r = 0; r < plan.rows; r++) {
    for (let c = 0; c < plan.cols; c++) {
      const p = node(c, r);
      if (inside(p)) consider(p, grid[r][c]);
    }
  }
  const edgeStep = Math.min(plan.dx, plan.dy) / 4;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / edgeStep));
      for (let k = 0; k <= n; k++) {
        const p = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
        consider(p, elevationAt(grid, plan, p));
      }
    }
  }
  const { lo, hi, loAt, hiAt } = ext;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    return { overlay: null, reliefFt: 0, intervalFt: 0, gradePct: 0, fallsToward: null };
  }
  const reliefFt = hi - lo;

  // Grade per cell whose centre is on the lot: magnitude for the figure, the
  // mean vector for the direction.
  const grades: number[] = [];
  let gxSum = 0;
  let gySum = 0;
  let magSum = 0;
  for (let r = 0; r + 1 < plan.rows; r++) {
    for (let c = 0; c + 1 < plan.cols; c++) {
      if (!inside({ x: plan.x0 + (c + 0.5) * plan.dx, y: plan.y0 + (r + 0.5) * plan.dy })) continue;
      const gx = (grid[r][c + 1] - grid[r][c] + grid[r + 1][c + 1] - grid[r + 1][c]) / (2 * plan.dx);
      const gy = (grid[r + 1][c] - grid[r][c] + grid[r + 1][c + 1] - grid[r][c + 1]) / (2 * plan.dy);
      const mag = Math.hypot(gx, gy);
      grades.push(mag * 100);
      gxSum += gx;
      gySum += gy;
      magSum += mag;
    }
  }
  const gradePct = grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : 0;
  let fallsToward: string | null = null;
  if (grades.length && magSum > 0 && Math.hypot(gxSum, gySum) >= 0.35 * magSum && reliefFt >= TOPO_FLAT_FT) {
    // Downhill is against the gradient; bearing clockwise from north (+y).
    const bearing = ((Math.atan2(-gxSum, -gySum) * 180) / Math.PI + 360) % 360;
    fallsToward = COMPASS[Math.round(bearing / 45) % 8];
  }

  const intervalFt = pickTopoInterval(reliefFt, fine);
  if (intervalFt <= 0) return { overlay: null, reliefFt, intervalFt: 0, gradePct, fallsToward };

  let gmin = Infinity;
  let gmax = -Infinity;
  for (const row of grid) for (const v of row) { if (v < gmin) gmin = v; if (v > gmax) gmax = v; }
  // Levels count up from the LOT's low point. Past the lot, two intervals of
  // context either way — a lot at the foot of a hill must not paint forty
  // lines of somebody else's slope over the photo.
  const kMin = Math.ceil((Math.max(gmin, lo - 2 * intervalFt) - lo) / intervalFt);
  const kMax = Math.floor((Math.min(gmax, hi + 2 * intervalFt) - lo) / intervalFt);
  const lineCount = Math.max(0, Math.floor(reliefFt / intervalFt));
  const labelEvery = lineCount <= 8 ? 1 : 2;
  const half = intervalFt < 1;

  const toLL = (pts: Pt[]) => pts.map((p) => localFeetToLatLng(origin, p));
  const lines: TopoOverlay["lines"] = [];
  const labelsFt: Array<{ at: Pt; text: string; angleDeg: number; major: boolean }> = [];
  for (let k = kMin; k <= kMax; k++) {
    // A hair off the exact value so a level never lands ON a sample, which
    // would draw degenerate slivers around that node.
    const level = lo + k * intervalFt + 1e-6;
    if (level <= gmin || level >= gmax) continue;
    const major = k !== 0 && k % 5 === 0;
    const ins: Pt[][] = [];
    const outs: Pt[][] = [];
    for (const raw of contourChains(grid, plan, level)) {
      for (const piece of splitByRegion(smoothChain(raw), inside)) {
        (piece.inside ? ins : outs).push(piece.pts);
      }
    }
    if (!ins.length && !outs.length) continue;
    lines.push({ major, inside: ins.map(toLL), outside: outs.map(toLL) });

    // The zero line runs through the low point, which has its own mark.
    if (k <= 0 || !(major || k % labelEvery === 0)) continue;
    const text = fmtFt(k * intervalFt, half);
    const byLength = ins
      .map((pts) => ({ pts, L: pathLength(pts) }))
      .filter((x) => x.L >= 35)
      .sort((a, b) => b.L - a.L)
      .slice(0, 2);
    for (const { pts, L } of byLength) {
      // Parallel lines on an even slope all have their middles side by side,
      // so a label that would crowd a neighbour's slides along its own line
      // instead of being dropped.
      const wanted = L >= 220 ? 2 : 1;
      let placed = 0;
      for (const f of [0.5, 0.3, 0.7, 0.18, 0.82, 0.4, 0.6]) {
        if (placed >= wanted) break;
        const hit = pointAlong(pts, L * f);
        if (!hit) continue;
        // A near-vertical line folds to ±90° on the whim of which way its
        // chain happened to run, so neighbouring lines on one slope read in
        // opposite directions. There the ground decides: the top of the text
        // faces uphill (the cartographic convention), which every parallel
        // line on the slope shares.
        if (Math.abs(hit.angleDeg) > 70) {
          const h = plan.dx / 2;
          const nx = -hit.dir.y;
          const ny = hit.dir.x;
          const zp = elevationAt(grid, plan, { x: hit.at.x + nx * h, y: hit.at.y + ny * h });
          const zm = elevationAt(grid, plan, { x: hit.at.x - nx * h, y: hit.at.y - ny * h });
          if (zp !== null && zm !== null && zp !== zm) {
            const upX = zp > zm ? nx : -nx; // local east component of "uphill"
            const upY = zp > zm ? ny : -ny; // local north component
            const r = (hit.angleDeg * Math.PI) / 180;
            // Text "up" on screen for rotate(r) is (sin r, −cos r); uphill on
            // screen is (upX, −upY) since the screen's y runs south.
            if (Math.sin(r) * upX + Math.cos(r) * upY < 0) {
              hit.angleDeg = hit.angleDeg > 0 ? hit.angleDeg - 180 : hit.angleDeg + 180;
            }
          }
        }
        const crowded = labelsFt.some((l) => Math.hypot(l.at.x - hit.at.x, l.at.y - hit.at.y) < LABEL_GAP_FT);
        if (crowded) continue;
        labelsFt.push({ at: hit.at, text, angleDeg: hit.angleDeg, major });
        placed++;
      }
    }
  }

  const marks: TopoOverlay["marks"] = [];
  if (loAt && hiAt) {
    marks.push({ at: localFeetToLatLng(origin, loAt), kind: "low", text: "Low · 0 ft" });
    marks.push({ at: localFeetToLatLng(origin, hiAt), kind: "high", text: `High · ${fmtFt(reliefFt, half)}` });
  }

  return {
    overlay: {
      intervalFt,
      lines,
      labels: labelsFt.slice(0, 40).map((l) => ({ ...l, at: localFeetToLatLng(origin, l.at) })),
      marks,
    },
    reliefFt,
    intervalFt,
    gradePct,
    fallsToward,
  };
}
