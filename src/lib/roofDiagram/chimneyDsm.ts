// Chimney detection from the DSM — the first of the two position methods in
// the roof-diagram spec (the second is the vision pass in chimneyVision.ts).
// EagleView Instant only tells us that a chimney EXISTS; this finds WHERE by
// looking for "posts": pixels that rise well above the plane of the facet they
// sit on. Pure computation, no I/O — the action feeds it the same Google Solar
// rasters the reconstruction already downloaded, so it costs nothing extra.
//
// Frame: the reconstruction's local-feet frame (origin at the queried pin, x
// east, y north, z feet above ground). Pixel → frame is copied verbatim from
// computeGeometry in src/lib/roofRecon.ts so candidates land exactly on the
// model's facets: raster rows run north→south, so y flips.
//
// Why planes from the MODEL rather than from the DSM window: the recon's
// region-growing already decided which pixels belong to which facet, and its
// facets are calibrated to Instant before we get here. Fitting each facet's
// plane through its own 3D ring and measuring every roof pixel against the
// facet that contains it in plan is what makes a chimney stand out as a clean
// +N ft blob instead of being absorbed into a locally-refit surface.
//
// Numbers (DSM is 0.1 m/px ≈ 0.33 ft, 800×800 = 640k pixels):
//   • residual ≥ 1.5 ft  — the Solar DSM smooths a 2–4 ft chimney down to a
//     bump of a couple of feet; 1.5 ft clears roof-plane noise (~0.3–0.5 ft)
//     and ridge vents (≤ 1 ft) while still catching a squat masonry stack.
//   • extent 1–12 ft per axis, ≥ 4 px — under 1 ft is a single-pixel spike
//     (DSM speckle, an antenna); over 12 ft is a dormer, a second storey or a
//     mis-fitted facet, none of which is a penetration.
//   • heightFt = 90th-percentile residual — the top of a post, robust to the
//     blurred skirt of pixels around it that the smoothing adds.
//   • confidence = clamp((heightFt − 1.5) / 3, 0.35, 0.95): 1.5 ft → 0.35,
//     4.5 ft+ → 0.95. −0.15 when the blob sits within 1 ft of a RIDGE/HIP line,
//     because dormer peaks and ridge caps read as posts from above.
//   • kind: "chimney" needs ≥ 2.5 ft of rise AND ≥ 1.5 ft across its narrower
//     side (a masonry stack is a stout block); anything shorter or thinner is
//     a vent pipe / plumbing stack.
//   • at most 6 candidates — a house has one or two chimneys; anything past
//     the first handful is noise the vision pass is better placed to confirm.
//
// Cost: per-face rasterisation over each face's own pixel bounding box (so the
// plane pass scales with roof area, not tile area), one linear component
// sweep, and a per-candidate segment→rectangle test for the ridge penalty.

import type { Raster } from "@/lib/solar";
import type { RoofModel, RoofPoint } from "@/lib/eagleview";
import type { ChimneyCandidate } from "@/lib/roofDiagram/types";

export interface DsmChimneyInput {
  dsm: Raster;
  mask: Raster;
  groundElevFt: number;
  model: RoofModel;
}

const FT_PER_M = 3.28084;

const MIN_RESIDUAL_FT = 1.5;
const MIN_EXTENT_FT = 1;
const MAX_EXTENT_FT = 12;
const MIN_PIXELS = 4;
const CHIMNEY_MIN_HEIGHT_FT = 2.5;
const CHIMNEY_MIN_SIDE_FT = 1.5;
const RIDGE_PROXIMITY_FT = 1;
const RIDGE_PENALTY = 0.15;
const CONFIDENCE_MIN = 0.35;
const CONFIDENCE_MAX = 0.95;
const MAX_CANDIDATES = 6;

/** A facet ready for the pixel pass: fitted plane + plan polygon + bboxes. */
interface FacetPlane {
  a: number; //          z = a·x + b·y + c (feet)
  b: number;
  c: number;
  xs: Float64Array; //   plan ring, closed implicitly
  ys: Float64Array;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  bboxArea: number;
}

interface Segment2 {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export function detectChimneysDsm(input: DsmChimneyInput): ChimneyCandidate[] {
  const { dsm, mask, groundElevFt, model } = input;
  const w = dsm.width;
  const h = dsm.height;
  // Both layers come from the same Solar data-layers call at the same pixel
  // size, so they share a grid. Anything else and pixel indexes would not line
  // up — bail rather than read the wrong mask cell.
  if (mask.width !== w || mask.height !== h || w === 0 || h === 0) return [];

  const facets = fitFacetPlanes(model);
  if (facets.length === 0) return [];

  const stepFt = dsm.pixelSizeM * FT_PER_M;
  if (!(stepFt > 0)) return [];
  const cx = w / 2;
  const cy = h / 2;

  // ── Pass 1: residual of every roof pixel against its own facet plane ──────
  // NaN = not on any facet (or off the building). Smallest bbox first so a
  // dormer facet nested inside a bigger facet's bbox claims its pixels before
  // the big one gets a look — first assignment wins.
  const residual = new Float32Array(w * h).fill(NaN);
  const dsmData = dsm.data;
  const maskData = mask.data;
  for (const f of facets) {
    const pxMin = Math.max(0, Math.floor(f.minX / stepFt + cx - 0.5));
    const pxMax = Math.min(w - 1, Math.ceil(f.maxX / stepFt + cx - 0.5));
    const pyMin = Math.max(0, Math.floor(cy - 0.5 - f.maxY / stepFt));
    const pyMax = Math.min(h - 1, Math.ceil(cy - 0.5 - f.minY / stepFt));
    for (let py = pyMin; py <= pyMax; py++) {
      const y = (cy - py - 0.5) * stepFt;
      const rowBase = py * w;
      for (let px = pxMin; px <= pxMax; px++) {
        const i = rowBase + px;
        if (!Number.isNaN(residual[i])) continue; // already claimed
        if (!(maskData[i] > 0.5)) continue;
        const x = (px + 0.5 - cx) * stepFt;
        if (!pointInRing(x, y, f.xs, f.ys)) continue;
        const z = dsmData[i] * FT_PER_M - groundElevFt;
        if (!Number.isFinite(z)) continue;
        residual[i] = z - (f.a * x + f.b * y + f.c);
      }
    }
  }

  // ── Pass 2: 4-connected components of residual ≥ 1.5 ft ─────────────────
  const ridgeSegs = ridgeAndHipSegments(model);
  const visited = new Uint8Array(w * h);
  const stack = new Int32Array(w * h); // worst case: every pixel is a candidate
  const members: number[] = [];
  const found: ChimneyCandidate[] = [];

  for (let seed = 0; seed < residual.length; seed++) {
    if (visited[seed] || !(residual[seed] >= MIN_RESIDUAL_FT)) continue;
    // Flood the component, tracking its pixel bbox and centre as we go.
    let top = 0;
    stack[top++] = seed;
    visited[seed] = 1;
    members.length = 0;
    let pxMin = w;
    let pxMax = -1;
    let pyMin = h;
    let pyMax = -1;
    let sumPx = 0;
    let sumPy = 0;
    while (top > 0) {
      const i = stack[--top];
      members.push(i);
      const px = i % w;
      const py = (i - px) / w;
      if (px < pxMin) pxMin = px;
      if (px > pxMax) pxMax = px;
      if (py < pyMin) pyMin = py;
      if (py > pyMax) pyMax = py;
      sumPx += px;
      sumPy += py;
      // 4-neighbourhood: a chimney is a solid block, so diagonal-only contact
      // is speckle we would rather not glue on.
      if (px > 0) top = visit(i - 1, residual, visited, stack, top);
      if (px < w - 1) top = visit(i + 1, residual, visited, stack, top);
      if (py > 0) top = visit(i - w, residual, visited, stack, top);
      if (py < h - 1) top = visit(i + w, residual, visited, stack, top);
    }

    const count = members.length;
    if (count < MIN_PIXELS) continue;
    const wFt = (pxMax - pxMin + 1) * stepFt;
    const hFt = (pyMax - pyMin + 1) * stepFt;
    if (wFt < MIN_EXTENT_FT || wFt > MAX_EXTENT_FT) continue;
    if (hFt < MIN_EXTENT_FT || hFt > MAX_EXTENT_FT) continue;

    // 90th-percentile rise. Components are ≤ 12 ft ≈ 37 px a side, so sorting
    // ≤ ~1.4k values per blob is nothing.
    const rises = new Float32Array(count);
    for (let k = 0; k < count; k++) rises[k] = residual[members[k]];
    rises.sort();
    const heightFt = rises[Math.min(count - 1, Math.floor(count * 0.9))];

    const x = (sumPx / count + 0.5 - cx) * stepFt;
    const y = (cy - sumPy / count - 0.5) * stepFt;

    let confidence = clamp((heightFt - MIN_RESIDUAL_FT) / 3, CONFIDENCE_MIN, CONFIDENCE_MAX);
    // Footprint rectangle in the frame (pixel bbox → feet). Ridge caps and
    // dormer peaks also poke above the surrounding plane; knock them down.
    const rect = {
      minX: (pxMin - cx) * stepFt,
      maxX: (pxMax + 1 - cx) * stepFt,
      minY: (cy - pyMax - 1) * stepFt,
      maxY: (cy - pyMin) * stepFt,
    };
    if (nearAnySegment(rect, ridgeSegs, RIDGE_PROXIMITY_FT)) {
      confidence = Math.max(0, confidence - RIDGE_PENALTY);
    }

    const kind: ChimneyCandidate["kind"] =
      heightFt >= CHIMNEY_MIN_HEIGHT_FT && Math.min(wFt, hFt) >= CHIMNEY_MIN_SIDE_FT
        ? "chimney"
        : "vent";

    found.push({
      x: round2(x),
      y: round2(y),
      wFt: round2(wFt),
      hFt: round2(hFt),
      heightFt: round2(heightFt),
      kind,
      confidence: round2(confidence),
      method: "dsm",
    });
  }

  found.sort((p, q) => q.confidence - p.confidence || (q.heightFt ?? 0) - (p.heightFt ?? 0));
  return found.slice(0, MAX_CANDIDATES);
}

/** Push a neighbour onto the flood stack when it qualifies; returns the new top. */
function visit(
  j: number,
  residual: Float32Array,
  visited: Uint8Array,
  stack: Int32Array,
  top: number,
): number {
  if (visited[j] || !(residual[j] >= MIN_RESIDUAL_FT)) return top;
  visited[j] = 1;
  stack[top] = j;
  return top + 1;
}

// ── Facet planes ─────────────────────────────────────────────────────────────

/**
 * One plane per facet from a least-squares fit through its 3D ring, ordered by
 * plan bbox area ascending. Faces whose ring cannot be chained (< 3 resolvable
 * points) or whose plan points are collinear are skipped — no plane, no test.
 */
function fitFacetPlanes(model: RoofModel): FacetPlane[] {
  const pointsById = new Map<string, RoofPoint>();
  for (const p of model.points) pointsById.set(p.id, p);
  const linesById = new Map<string, { aId: string; bId: string }>();
  for (const l of model.lines) linesById.set(l.id, l);

  const out: FacetPlane[] = [];
  for (const face of model.faces) {
    const ring = chainRing(face.lineIds, linesById, pointsById);
    if (!ring) continue;
    const n = ring.length;
    // Centre the fit on the ring mean: with Sx = Sy = 0 the 3×3 normal
    // equations collapse to a 2×2 for the gradient, and c falls out of the
    // means. Also keeps the sums well-conditioned at tile-edge coordinates.
    let mx = 0;
    let my = 0;
    let mz = 0;
    for (const p of ring) {
      mx += p.x;
      my += p.y;
      mz += p.z;
    }
    mx /= n;
    my /= n;
    mz /= n;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    let sxz = 0;
    let syz = 0;
    for (const p of ring) {
      const dx = p.x - mx;
      const dy = p.y - my;
      const dz = p.z - mz;
      sxx += dx * dx;
      sxy += dx * dy;
      syy += dy * dy;
      sxz += dx * dz;
      syz += dy * dz;
    }
    const det = sxx * syy - sxy * sxy;
    if (!(det > 1e-6)) continue; // plan points collinear — no facet to test
    const a = (syy * sxz - sxy * syz) / det;
    const b = (sxx * syz - sxy * sxz) / det;
    const c = mz - a * mx - b * my;
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) continue;

    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const p = ring[i];
      xs[i] = p.x;
      ys[i] = p.y;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    out.push({
      a,
      b,
      c,
      xs,
      ys,
      minX,
      maxX,
      minY,
      maxY,
      bboxArea: (maxX - minX) * (maxY - minY),
    });
  }
  out.sort((p, q) => p.bboxArea - q.bboxArea);
  return out;
}

/**
 * Chain a facet's boundary lines head-to-tail into an ordered ring of points.
 * Same walk as ringOf in roofGeometry.ts, kept local so this module depends
 * on nothing under src/components. null when fewer than 3 points resolve.
 */
function chainRing(
  lineIds: string[],
  linesById: Map<string, { aId: string; bId: string }>,
  pointsById: Map<string, RoofPoint>,
): RoofPoint[] | null {
  const segs: Array<{ aId: string; bId: string }> = [];
  for (const id of lineIds) {
    const l = linesById.get(id);
    if (l) segs.push(l);
  }
  if (segs.length < 3) return null;
  const used = new Uint8Array(segs.length);
  used[0] = 1;
  const ids: string[] = [segs[0].aId];
  let next = segs[0].bId;
  for (let i = 1; i < segs.length; i++) {
    ids.push(next);
    let found = -1;
    for (let j = 0; j < segs.length; j++) {
      if (used[j]) continue;
      if (segs[j].aId === next) {
        found = j;
        next = segs[j].bId;
        break;
      }
      if (segs[j].bId === next) {
        found = j;
        next = segs[j].aId;
        break;
      }
    }
    if (found < 0) break;
    used[found] = 1;
  }
  const ring: RoofPoint[] = [];
  for (const id of ids) {
    const p = pointsById.get(id);
    if (p) ring.push(p);
  }
  return ring.length >= 3 ? ring : null;
}

// ── Plan geometry ────────────────────────────────────────────────────────────

/** Even-odd ray cast against a closed ring given as parallel coordinate arrays. */
function pointInRing(x: number, y: number, xs: Float64Array, ys: Float64Array): boolean {
  let inside = false;
  const n = xs.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = ys[i];
    const yj = ys[j];
    if (yi > y !== yj > y) {
      const xi = xs[i];
      const xj = xs[j];
      const xCross = xi + ((y - yi) * (xj - xi)) / (yj - yi);
      if (x < xCross) inside = !inside;
    }
  }
  return inside;
}

function ridgeAndHipSegments(model: RoofModel): Segment2[] {
  const pointsById = new Map<string, RoofPoint>();
  for (const p of model.points) pointsById.set(p.id, p);
  const segs: Segment2[] = [];
  for (const l of model.lines) {
    if (l.type !== "RIDGE" && l.type !== "HIP") continue;
    const a = pointsById.get(l.aId);
    const b = pointsById.get(l.bId);
    if (!a || !b) continue;
    segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
  }
  return segs;
}

interface Rect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Does any segment come within `limit` feet of the rectangle? Both shapes are
 * convex, so the closest pair is either a vertex of one against the other
 * (endpoint→rect, corner→segment) or the shapes overlap (segment crosses an
 * edge or starts inside). Exact, and a handful of ops per segment.
 */
function nearAnySegment(rect: Rect, segs: Segment2[], limit: number): boolean {
  const grown: Rect = {
    minX: rect.minX - limit,
    maxX: rect.maxX + limit,
    minY: rect.minY - limit,
    maxY: rect.maxY + limit,
  };
  const limit2 = limit * limit;
  for (const s of segs) {
    // Cheap reject: the segment's own bbox misses the grown rectangle.
    if (Math.max(s.ax, s.bx) < grown.minX || Math.min(s.ax, s.bx) > grown.maxX) continue;
    if (Math.max(s.ay, s.by) < grown.minY || Math.min(s.ay, s.by) > grown.maxY) continue;
    if (pointToRectDist2(s.ax, s.ay, rect) <= limit2) return true;
    if (pointToRectDist2(s.bx, s.by, rect) <= limit2) return true;
    if (pointToSegDist2(rect.minX, rect.minY, s) <= limit2) return true;
    if (pointToSegDist2(rect.maxX, rect.minY, s) <= limit2) return true;
    if (pointToSegDist2(rect.maxX, rect.maxY, s) <= limit2) return true;
    if (pointToSegDist2(rect.minX, rect.maxY, s) <= limit2) return true;
    // Neither endpoint inside and no corner close: the only remaining way to
    // be near is to pass straight through — i.e. cross one of the four edges.
    if (segCrossesRect(s, rect)) return true;
  }
  return false;
}

function pointToRectDist2(x: number, y: number, r: Rect): number {
  const dx = x < r.minX ? r.minX - x : x > r.maxX ? x - r.maxX : 0;
  const dy = y < r.minY ? r.minY - y : y > r.maxY ? y - r.maxY : 0;
  return dx * dx + dy * dy;
}

function pointToSegDist2(x: number, y: number, s: Segment2): number {
  const vx = s.bx - s.ax;
  const vy = s.by - s.ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 > 0 ? ((x - s.ax) * vx + (y - s.ay) * vy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = x - (s.ax + t * vx);
  const dy = y - (s.ay + t * vy);
  return dx * dx + dy * dy;
}

function segCrossesRect(s: Segment2, r: Rect): boolean {
  return (
    segsIntersect(s, { ax: r.minX, ay: r.minY, bx: r.maxX, by: r.minY }) ||
    segsIntersect(s, { ax: r.maxX, ay: r.minY, bx: r.maxX, by: r.maxY }) ||
    segsIntersect(s, { ax: r.maxX, ay: r.maxY, bx: r.minX, by: r.maxY }) ||
    segsIntersect(s, { ax: r.minX, ay: r.maxY, bx: r.minX, by: r.minY })
  );
}

/** Proper or touching intersection of two segments via orientation signs. */
function segsIntersect(p: Segment2, q: Segment2): boolean {
  const o1 = orient(p.ax, p.ay, p.bx, p.by, q.ax, q.ay);
  const o2 = orient(p.ax, p.ay, p.bx, p.by, q.bx, q.by);
  const o3 = orient(q.ax, q.ay, q.bx, q.by, p.ax, p.ay);
  const o4 = orient(q.ax, q.ay, q.bx, q.by, p.bx, p.by);
  return o1 * o2 <= 0 && o3 * o4 <= 0;
}

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  return v > 1e-9 ? 1 : v < -1e-9 ? -1 : 0;
}

// ── Small helpers ────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
