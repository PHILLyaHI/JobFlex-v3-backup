// Roof recon V2 — ONE building outline for the whole roof.
//
// The old path never had a building polygon at all: each plane cluster traced
// its own ring out of the raster and simplified it on its own
// (src/lib/roofRecon.ts:1038, :1080), so neighbouring facets ended up with
// different approximations of the same physical line — Euler −2/−5, gaps and
// overlaps at once, 4–6 ft zigzags, split hips (ROOF-DIAGNOSIS.md §E, H1).
//
// Here the building is polygonised ONCE and regularised ONCE. Everything the
// skeleton later grows is derived from this single ring, so a corner that moves
// moves for every facet that meets there, by construction.
//
// Order matters and follows the phase spec:
//   1. binarise → components → keep what belongs to this property
//   2. close 1 px so a wing joined by a hairline gap stays one building
//   3. trace the outer boundary (pixel staircase)
//   4. Douglas–Peucker, 1.5 ft
//   5. dominant axis = the angle that maximises edge length within ±12°
//   6. snap edges to 0/90/45° of that axis, corner moving at most 3 ft
//   7. merge collinear neighbours (< 5°)
//   8. drop edges under 2.5 ft, contracting their neighbours
//   9. re-close, assert simple + CCW
//
// Pure and client-safe: rasters in, polygon out, no I/O.
import type { Raster } from "@/lib/solar";

const FT_PER_M = 3.28084;

export interface FootprintPoint {
  x: number;
  y: number;
}

export interface FootprintOptions {
  /** Parcel ring in frame feet — decides which mask components are ours. */
  parcel?: FootprintPoint[] | null;
  /** Google's own roof area for the sanity assert (sq ft). */
  googleAreaSqft?: number | null;
  simplifyFt?: number;
  snapTolDeg?: number;
  maxCornerShiftFt?: number;
  collinearMergeDeg?: number;
  minEdgeFt?: number;
  maxVertices?: number;
  areaTolerance?: number;
  /** Minimum share of perimeter length that must sit on the family. */
  minFamilyShare?: number;
  /** Slope factor for the area warning (plan × factor vs Google's sloped area). */
  slopeFactor?: number;
}

export interface FootprintComponent {
  pixels: number;
  areaSqft: number;
  kept: boolean;
  reason: string;
}

export interface FootprintReport {
  components: FootprintComponent[];
  keptComponents: number;
  /** Vertices of the raw staircase, after collapsing pixel-collinear runs. */
  rawVertices: number;
  rawEdgesUnder3Ft: number;
  vertices: number;
  edgesUnder3Ft: number;
  perimeterFt: number;
  areaSqft: number;
  axisDeg: number;
  /** Worst deviation of an edge bearing from a multiple of 45° of the axis. */
  worstAngleDeviationDeg: number;
  /** Share of PERIMETER LENGTH lying within 3° of the 0/90/45 family. */
  familyShare: number;
  /** What is left off the family, for the log. */
  offFamily: Array<{ lengthFt: number; offDeg: number }>;
  /** Edges removed because extending their neighbours changed nothing. */
  staircaseEdgesRemoved: Array<{ lengthFt: number; offDeg: number; shiftFt: number; areaShare: number }>;
  /** Worst distance a corner travelled during snapping. */
  maxCornerShiftFt: number;
  /** area is a WARNING band, not an assert — pitches are not trustworthy until
   *  phase 3, so the plan × slope-factor comparison carries double uncertainty. */
  asserts: { vertices: boolean; angles: boolean };
  areaWarning: boolean;
  reasons: string[];
}

export interface FootprintResult {
  ring: FootprintPoint[] | null;
  report: FootprintReport;
}

const DEFAULTS = {
  simplifyFt: 1.5,
  snapTolDeg: 12,
  maxCornerShiftFt: 3,
  collinearMergeDeg: 5,
  minEdgeFt: 2.5,
  maxVertices: 16,
  areaTolerance: 0.10,
  minFamilyShare: 0.85,
  slopeFactor: 1,
};

// ── polygon helpers ──────────────────────────────────────────────────────────

export function signedArea(ring: FootprintPoint[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export const areaOf = (ring: FootprintPoint[]): number => Math.abs(signedArea(ring));

export function perimeterOf(ring: FootprintPoint[]): number {
  let p = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    p += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return p;
}

function pointInRing(p: FootprintPoint, ring: FootprintPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y) {
      const xi = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (Number.isFinite(xi) && p.x < xi) inside = !inside;
    }
  }
  return inside;
}

function segmentsCross(a: FootprintPoint, b: FootprintPoint, c: FootprintPoint, d: FootprintPoint): boolean {
  const cross = (o: FootprintPoint, p: FootprintPoint, q: FootprintPoint) =>
    (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function isSimpleRing(ring: FootprintPoint[]): boolean {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) return false;
    }
  }
  return true;
}

const ensureCCW = (ring: FootprintPoint[]): FootprintPoint[] => (signedArea(ring) < 0 ? [...ring].reverse() : ring);

// ── raster stage ─────────────────────────────────────────────────────────────

function binarise(mask: Raster): Uint8Array {
  const out = new Uint8Array(mask.width * mask.height);
  for (let i = 0; i < out.length; i++) out[i] = mask.data[i] > 0.5 ? 1 : 0;
  return out;
}

function dilate(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = 0;
      for (let dy = -1; dy <= 1 && !on; dy++) {
        for (let dx = -1; dx <= 1 && !on; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && src[ny * w + nx]) on = 1;
        }
      }
      out[y * w + x] = on;
    }
  }
  return out;
}

function erode(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let all = 1;
      for (let dy = -1; dy <= 1 && all; dy++) {
        for (let dx = -1; dx <= 1 && all; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || !src[ny * w + nx]) all = 0;
        }
      }
      out[y * w + x] = all;
    }
  }
  return out;
}

/** 8-connected labelling. Returns the label image and each label's pixel count. */
function label(bin: Uint8Array, w: number, h: number): { label: Int32Array; sizes: number[] } {
  const lab = new Int32Array(bin.length).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let s = 0; s < bin.length; s++) {
    if (!bin[s] || lab[s] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    stack.push(s);
    lab[s] = id;
    while (stack.length) {
      const i = stack.pop() as number;
      size++;
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (bin[j] && lab[j] < 0) {
            lab[j] = id;
            stack.push(j);
          }
        }
      }
    }
    sizes.push(size);
  }
  return { label: lab, sizes };
}

function fillHoles(bin: Uint8Array, w: number, h: number): Uint8Array {
  const outside = new Uint8Array(bin.length);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!bin[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin[i] || !outside[i] ? 1 : 0;
  return out;
}

/** Outer boundary as a closed staircase of pixel-corner points. */
function traceBoundary(bin: Uint8Array, w: number, h: number): Array<{ x: number; y: number }> | null {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : bin[y * w + x]);
  const next = new Map<string, Array<[number, number]>>();
  const add = (ax: number, ay: number, bx: number, by: number) => {
    const k = `${ax},${ay}`;
    next.set(k, [...(next.get(k) ?? []), [bx, by]]);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!at(x, y)) continue;
      if (!at(x, y - 1)) add(x, y, x + 1, y);
      if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!at(x - 1, y)) add(x, y + 1, x, y);
    }
  }
  if (!next.size) return null;
  let best: Array<{ x: number; y: number }> | null = null;
  const used = new Set<string>();
  for (const startKey of next.keys()) {
    const first = (next.get(startKey) as Array<[number, number]>)[0];
    const edgeId = `${startKey}>${first[0]},${first[1]}`;
    if (used.has(edgeId)) continue;
    const loop: Array<{ x: number; y: number }> = [];
    let cur = startKey;
    for (let guard = 0; guard < bin.length * 4; guard++) {
      const outs = next.get(cur);
      if (!outs) break;
      const step = outs.find((o) => !used.has(`${cur}>${o[0]},${o[1]}`));
      if (!step) break;
      used.add(`${cur}>${step[0]},${step[1]}`);
      const [cx, cy] = cur.split(",").map(Number);
      loop.push({ x: cx, y: cy });
      cur = `${step[0]},${step[1]}`;
      if (cur === startKey) break;
    }
    if (loop.length >= 4 && (!best || loop.length > best.length)) best = loop;
  }
  return best;
}

// ── polyline stage ───────────────────────────────────────────────────────────

function dropCollinear(ring: FootprintPoint[], epsCross = 1e-9): FootprintPoint[] {
  const out: FootprintPoint[] = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[(i - 1 + n) % n];
    const b = ring[i];
    const c = ring[(i + 1) % n];
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(cross) > epsCross) out.push(b);
  }
  return out.length >= 3 ? out : ring;
}

function douglasPeucker(pts: FootprintPoint[], tol: number): FootprintPoint[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop() as [number, number];
    const a = pts[s];
    const b = pts[e];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1e-9;
    let far = -1;
    let farD = tol;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs((pts[i].x - a.x) * dy - (pts[i].y - a.y) * dx) / len;
      if (d > farD) {
        farD = d;
        far = i;
      }
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([s, far], [far, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * The 0/45/90 family that best explains the ring, as an angle in [0, 45).
 *
 * Two stages, and the second one is the point.
 *
 * A plain scan for "the angle whose ±tol band holds the most edge length" is
 * DEGENERATE on the commonest building there is. Give it a rectangle and every
 * angle in a 2·tol-wide window captures all four edges, so they all tie — and
 * a first-wins scan then returns the LOWEST of them, roughly tol below the
 * truth. Measured on an OSM footprint in Phoenix: edges at 132.3° / 42.6° /
 * 132.4° / 42.1°, true axis 42.34°, and the scan returned 31.00°. The family
 * share, which is measured at 3°, then read 0.0% on a perfect rectangle, and
 * the snap released every edge because squaring onto that wrong axis would have
 * moved the corners more than 3 ft. The geometry survived only because the
 * release valve fired. Kirkland squared correctly for the opposite reason: its
 * ±15° tracing noise let the scan discriminate. Noise was doing the work.
 *
 * So: the wide band still SELECTS which edges belong to the family, because a
 * traced contour needs that tolerance to find its axis at all — but the angle
 * itself is then FITTED to those edges, by the length-weighted circular mean of
 * their deviations. A rectangle fits exactly; a wobbly contour gets the
 * best-fit axis instead of the low edge of a plateau.
 */
export function dominantAxisDeg(ring: FootprintPoint[], tolDeg = 12): number {
  const edges: Array<{ bearing: number; len: number }> = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    edges.push({ bearing: (((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI) % 45 + 45) % 45, len });
  }
  if (!edges.length) return 0;

  // 1. Which edges are on the family — the widest plateau, scanned coarsely.
  let seed = 0;
  let seedLen = -1;
  for (let deg = 0; deg < 45; deg += 0.5) {
    let len = 0;
    for (const e of edges) {
      const rel = ((e.bearing - deg) % 45 + 45) % 45;
      if (Math.min(rel, 45 - rel) <= tolDeg) len += e.len;
    }
    if (len > seedLen + 1e-9) {
      seedLen = len;
      seed = deg;
    }
  }

  // 2. Fit the angle to those edges. Deviations live on a 45° circle, so they
  //    are averaged as unit vectors at 8× the angle — no wrap-around bias.
  let sx = 0;
  let sy = 0;
  for (const e of edges) {
    const rel = ((e.bearing - seed) % 45 + 45) % 45;
    const dev = rel > 22.5 ? rel - 45 : rel;
    if (Math.abs(dev) > tolDeg) continue;
    const t = (dev * 8 * Math.PI) / 180;
    sx += e.len * Math.cos(t);
    sy += e.len * Math.sin(t);
  }
  if (sx === 0 && sy === 0) return seed;
  const fitted = seed + (Math.atan2(sy, sx) * 180) / Math.PI / 8;
  return ((fitted % 45) + 45) % 45;
}

interface EdgeLine {
  /** Unit direction. */
  dx: number;
  dy: number;
  /** A point on the line. */
  px: number;
  py: number;
}

const lineThrough = (p: FootprintPoint, dirDeg: number): EdgeLine => ({
  dx: Math.cos((dirDeg * Math.PI) / 180),
  dy: Math.sin((dirDeg * Math.PI) / 180),
  px: p.x,
  py: p.y,
});

function intersect(a: EdgeLine, b: EdgeLine): FootprintPoint | null {
  const den = a.dx * b.dy - a.dy * b.dx;
  if (!Number.isFinite(den) || Math.abs(den) < 1e-9) return null;
  const t = ((b.px - a.px) * b.dy - (b.py - a.py) * b.dx) / den;
  const x = a.px + a.dx * t;
  const y = a.py + a.dy * t;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/** Snap every edge onto the 0/45/90° family of `axisDeg` when it is within
 *  `tolDeg`, then re-solve the corners as intersections of the snapped lines.
 *
 *  When a corner would travel further than `maxShiftFt`, the SHORTER of the two
 *  edges meeting there gives up its snap and the corners are solved again — the
 *  cap is a statement about the edges we are allowed to rotate, not about which
 *  corners we may keep. (Keeping the corner while the lines stayed snapped left
 *  edges that were neither original nor on the family: measured on Redmond,
 *  four edges came out 4.5–19.6° off.) */
function snapToAxis(
  ring: FootprintPoint[],
  axisDeg: number,
  tolDeg: number,
  maxShiftFt: number,
): { ring: FootprintPoint[]; maxShift: number } {
  const n = ring.length;
  const bearingOf = (i: number): number => {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  };
  const lenOf = (i: number): number => {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    return Math.hypot(b.x - a.x, b.y - a.y);
  };
  const midOf = (i: number): FootprintPoint => {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  /** Nearest member of the 45° family, and how far the edge sits from it. */
  const family = (bearing: number): { deg: number; diff: number } => {
    let bestDeg = bearing;
    let bestDiff = Infinity;
    for (let k = 0; k < 8; k++) {
      const cand = axisDeg + k * 45;
      let d = Math.abs((((bearing - cand) % 360) + 540) % 360 - 180);
      if (d > 90) d = 180 - d;
      if (d < bestDiff) {
        bestDiff = d;
        bestDeg = cand;
      }
    }
    return { deg: bestDeg, diff: bestDiff };
  };

  const snapped: boolean[] = [];
  for (let i = 0; i < n; i++) snapped.push(lenOf(i) > 1e-6 && family(bearingOf(i)).diff <= tolDeg);

  const solve = (): { pts: FootprintPoint[]; shifts: number[] } => {
    const lines: EdgeLine[] = [];
    for (let i = 0; i < n; i++) {
      const mid = midOf(i);
      lines.push(lineThrough(mid, snapped[i] ? family(bearingOf(i)).deg : bearingOf(i)));
    }
    const pts: FootprintPoint[] = [];
    const shifts: number[] = [];
    for (let i = 0; i < n; i++) {
      const p = intersect(lines[(i - 1 + n) % n], lines[i]);
      const orig = ring[i];
      if (!p) {
        pts.push(orig);
        shifts.push(0);
        continue;
      }
      pts.push(p);
      shifts.push(Math.hypot(p.x - orig.x, p.y - orig.y));
    }
    return { pts, shifts };
  };

  let solved = solve();
  for (let pass = 0; pass < n; pass++) {
    let worst = -1;
    let worstShift = maxShiftFt;
    for (let i = 0; i < n; i++) {
      if (solved.shifts[i] > worstShift) {
        worstShift = solved.shifts[i];
        worst = i;
      }
    }
    if (worst < 0) break;
    // Corner i is the meeting of edges (i-1) and i — release the shorter one.
    const prev = (worst - 1 + n) % n;
    const give = snapped[prev] && snapped[worst] ? (lenOf(prev) <= lenOf(worst) ? prev : worst) : snapped[prev] ? prev : worst;
    if (!snapped[give]) break; // nothing left to release — leave it and report
    snapped[give] = false;
    solved = solve();
  }

  return { ring: solved.pts, maxShift: Math.max(0, ...solved.shifts) };
}

/** Merge neighbours whose bearings differ by less than `deg`. */
function mergeCollinear(ring: FootprintPoint[], deg: number): FootprintPoint[] {
  let cur = ring;
  for (let pass = 0; pass < 4; pass++) {
    const n = cur.length;
    if (n <= 4) break;
    const out: FootprintPoint[] = [];
    let changed = false;
    for (let i = 0; i < n; i++) {
      const a = cur[(i - 1 + n) % n];
      const b = cur[i];
      const c = cur[(i + 1) % n];
      const t1 = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      const t2 = (Math.atan2(c.y - b.y, c.x - b.x) * 180) / Math.PI;
      let turn = ((t2 - t1) % 360 + 540) % 360 - 180;
      turn = Math.abs(turn);
      if (turn < deg && out.length + (n - i - 1) >= 3) {
        changed = true;
        continue; // b lies on the line a→c
      }
      out.push(b);
    }
    cur = out.length >= 3 ? out : cur;
    if (!changed) break;
  }
  return cur;
}

/** Remove an edge by EXTENDING its two neighbours until they meet.
 *  Returns the resulting ring, or null when the neighbours are parallel. */
function removeEdgeByExtension(ring: FootprintPoint[], at: number): FootprintPoint[] | null {
  const n = ring.length;
  if (n <= 4) return null;
  const prevA = ring[(at - 1 + n) % n];
  const a = ring[at];
  const b = ring[(at + 1) % n];
  const nextB = ring[(at + 2) % n];
  const l1: EdgeLine = {
    dx: a.x - prevA.x,
    dy: a.y - prevA.y,
    px: prevA.x,
    py: prevA.y,
  };
  const l2: EdgeLine = {
    dx: nextB.x - b.x,
    dy: nextB.y - b.y,
    px: b.x,
    py: b.y,
  };
  if (Math.hypot(l1.dx, l1.dy) < 1e-9 || Math.hypot(l2.dx, l2.dy) < 1e-9) return null;
  const meet = intersect(l1, l2);
  if (!meet) return collapseStep(ring, at);
  const out = ring.filter((_, i) => i !== at && i !== (at + 1) % n);
  out.splice(Math.min(at, out.length), 0, meet);
  return out.length >= 3 ? out : null;
}

/**
 * The other half of the removal test: a STEP, where the two walls either side
 * of the edge are parallel and never meet, so "extend the neighbours" has
 * nothing to extend to.
 *
 * On a contour regularised to right angles this is the common case, not the
 * exception — every short edge on 12629 NE 100th Pl is a step (2.6, 3.5, 4.1
 * and 4.9 ft), and with only the intersection move available not one of them
 * could even be judged.
 *
 * The move: slide the SHORTER of the two walls sideways onto the other's line,
 * which is the smaller disturbance of the two. The wall keeps its direction and
 * length; only the edge feeding into it changes length, and only when the slide
 * runs along that edge — otherwise the move would tilt a wall that is not under
 * test, and it is refused. The caller applies the same effect thresholds it
 * applies to an intersection removal, so a 2 ft tracing step goes and a 5 ft bay
 * stays.
 */
function collapseStep(ring: FootprintPoint[], at: number): FootprintPoint[] | null {
  const n = ring.length;
  if (n <= 5) return null;
  const iPrevPrev = (at - 2 + n) % n;
  const iPrev = (at - 1 + n) % n;
  const iA = at;
  const iB = (at + 1) % n;
  const iNext = (at + 2) % n;
  const iNextNext = (at + 3) % n;
  const a = ring[iA];
  const b = ring[iB];
  const step = { x: b.x - a.x, y: b.y - a.y };
  const stepLen = Math.hypot(step.x, step.y);
  if (stepLen < 1e-9) return null;

  const wallLen = (p: FootprintPoint, q: FootprintPoint) => Math.hypot(q.x - p.x, q.y - p.y);
  const prevWall = wallLen(ring[iPrev], a);
  const nextWall = wallLen(b, ring[iNext]);
  // Sliding a wall is only clean when the step runs ALONG the edge that feeds
  // it; otherwise that edge would tilt.
  const alongEdge = (p: FootprintPoint, q: FootprintPoint): boolean => {
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (len < 1e-9) return false;
    const cos = Math.abs(((q.x - p.x) * step.x + (q.y - p.y) * step.y) / (len * stepLen));
    return cos > 0.996; // within ~5°
  };

  const movePrev = alongEdge(ring[iPrevPrev], ring[iPrev]);
  const moveNext = alongEdge(ring[iNext], ring[iNextNext]);
  const preferPrev = movePrev && (!moveNext || prevWall <= nextWall);
  if (!preferPrev && !moveNext) return null;

  const out = ring.map((p) => ({ ...p }));
  if (preferPrev) {
    // The prev wall slides forward onto the next wall's line; `a` lands on `b`.
    out[iPrev] = { x: ring[iPrev].x + step.x, y: ring[iPrev].y + step.y };
    return out.filter((_, i) => i !== iA);
  }
  // …or the next wall slides back onto the prev wall's line; `b` lands on `a`.
  out[iNext] = { x: ring[iNext].x - step.x, y: ring[iNext].y - step.y };
  return out.filter((_, i) => i !== iB);
}


/** Distance from a point to a closed outline. */
function distToRing(p: FootprintPoint, ring: FootprintPoint[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 1e-12 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

/**
 * How far the candidate strays from the ring it came from — the SYMMETRIC
 * Hausdorff distance between the two outlines, sampled at their vertices.
 *
 * Symmetric on purpose. One direction alone is blind to a step collapse: the
 * wall slides onto the line of its neighbour, and that line is part of the
 * original outline, so every candidate vertex reads zero. It is the ORIGINAL
 * wall, now abandoned, that is far from the candidate — and that distance is
 * the step depth, which is exactly the disturbance being judged.
 */
function maxVertexDeviation(candidate: FootprintPoint[], original: FootprintPoint[]): number {
  let worst = 0;
  for (const p of candidate) worst = Math.max(worst, distToRing(p, original));
  for (const p of original) worst = Math.max(worst, distToRing(p, candidate));
  return worst;
}

/**
 * An edge that is off the 45° family is judged by the EFFECT of removing it,
 * not by its length: extend its neighbours until they meet, and if the corner
 * they make sits within `maxShiftFt` of the original and the plan area moves by
 * less than `maxAreaShare`, the edge was the mask's staircase and goes. A real
 * wall — a bay, a cut corner — fails one of those and stays.
 *
 * Measured on 12629 NE 100th Pl: the 9.0 ft edge at 21.3° off is the chord DP
 * cut across a genuine right-angle jog in the east wall (verified against the
 * ortho); extending its neighbours restores that corner, which is exactly what
 * this does, while a length rule would have deleted the jog outright.
 */
function dropOffFamilyEdges(
  ring: FootprintPoint[],
  axisDeg: number,
  maxShiftFt: number,
  maxAreaShare: number,
): { ring: FootprintPoint[]; removed: Array<{ lengthFt: number; offDeg: number; shiftFt: number; areaShare: number }> } {
  const removed: Array<{ lengthFt: number; offDeg: number; shiftFt: number; areaShare: number }> = [];
  let cur = ring;
  for (let guard = 0; guard < ring.length * 2; guard++) {
    const n = cur.length;
    if (n <= 4) break;
    let target = -1;
    let targetOff = 3;
    for (let i = 0; i < n; i++) {
      const a = cur[i];
      const b = cur[(i + 1) % n];
      const bearing = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      let off = Infinity;
      for (let k = 0; k < 8; k++) {
        let d = Math.abs((((bearing - (axisDeg + k * 45)) % 360) + 540) % 360 - 180);
        if (d > 90) d = 180 - d;
        off = Math.min(off, d);
      }
      if (off > targetOff) {
        targetOff = off;
        target = i;
      }
    }
    if (target < 0) break;
    const a = cur[target];
    const b = cur[(target + 1) % n];
    const lengthFt = Math.hypot(b.x - a.x, b.y - a.y);
    const candidate = removeEdgeByExtension(cur, target);
    if (!candidate) break;
    const shift = maxVertexDeviation(candidate, cur);
    const before = areaOf(cur);
    const share = before > 0 ? Math.abs(areaOf(candidate) - before) / before : 1;
    if (shift < maxShiftFt && share < maxAreaShare) {
      removed.push({ lengthFt, offDeg: targetOff, shiftFt: shift, areaShare: share });
      cur = candidate;
      continue;
    }
    break; // the worst edge is load-bearing; the ones behind it are no worse
  }
  return { ring: cur, removed };
}

/**
 * Vertex budget, judged by the SAME effect test.
 *
 * `dropOffFamilyEdges` only ever looks at edges that failed to snap. A contour
 * traced by EagleView arrives with EVERY corner already near-square (measured
 * on 12629 NE 100th Pl: 16 corners, every turn 75–90°, nothing collinear to
 * merge), so nothing there is off the family and nothing is removed — yet the
 * ring still carries small jogs no contractor would draw, and the skeleton
 * refuses a ring over its vertex cap.
 *
 * So while the ring is over budget the edge whose removal disturbs the outline
 * LEAST goes, under the identical thresholds. Nothing is ever removed merely to
 * reach the budget: when the cheapest remaining removal is still load-bearing —
 * or the accumulated area drift would pass `maxTotalAreaShare` — the pass stops
 * and the ring stays over budget, so the assert fails honestly instead of the
 * geometry being bent to fit.
 */
function dropToVertexBudget(
  ring: FootprintPoint[],
  maxVertices: number,
  maxShiftFt: number,
  maxAreaShare: number,
  maxTotalAreaShare: number,
): { ring: FootprintPoint[]; removed: Array<{ lengthFt: number; offDeg: number; shiftFt: number; areaShare: number }> } {
  const removed: Array<{ lengthFt: number; offDeg: number; shiftFt: number; areaShare: number }> = [];
  const original = areaOf(ring);
  let cur = ring;
  for (let guard = 0; guard < ring.length * 2; guard++) {
    const n = cur.length;
    if (n <= maxVertices || n <= 4) break;
    const before = areaOf(cur);
    let best: { ring: FootprintPoint[]; cost: number; lengthFt: number; shiftFt: number; areaShare: number } | null = null;
    for (let i = 0; i < n; i++) {
      const candidate = removeEdgeByExtension(cur, i);
      if (!candidate) continue;
      const a = cur[i];
      const b = cur[(i + 1) % n];
      const shiftFt = maxVertexDeviation(candidate, cur);
      const areaShare = before > 0 ? Math.abs(areaOf(candidate) - before) / before : 1;
      if (shiftFt >= maxShiftFt || areaShare >= maxAreaShare) continue;
      if (original > 0 && Math.abs(areaOf(candidate) - original) / original >= maxTotalAreaShare) continue;
      // Normalised disturbance, so a long thin sliver and a short deep jog are
      // compared on the same scale rather than by whichever number is smaller.
      const cost = areaShare / maxAreaShare + shiftFt / maxShiftFt;
      if (!best || cost < best.cost) {
        best = { ring: candidate, cost, lengthFt: Math.hypot(b.x - a.x, b.y - a.y), shiftFt, areaShare };
      }
    }
    if (!best) break;
    removed.push({ lengthFt: best.lengthFt, offDeg: 0, shiftFt: best.shiftFt, areaShare: best.areaShare });
    cur = best.ring;
  }
  return { ring: cur, removed };
}

/** Drop edges shorter than `minFt`, pulling their two neighbours together. */
function dropShortEdges(ring: FootprintPoint[], minFt: number): FootprintPoint[] {
  let cur = [...ring];
  for (let guard = 0; guard < ring.length * 2; guard++) {
    const n = cur.length;
    if (n <= 4) break;
    let worst = -1;
    let worstLen = minFt;
    for (let i = 0; i < n; i++) {
      const a = cur[i];
      const b = cur[(i + 1) % n];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < worstLen) {
        worstLen = len;
        worst = i;
      }
    }
    if (worst < 0) break;
    const a = cur[worst];
    const b = cur[(worst + 1) % n];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    cur = cur.filter((_, i) => i !== worst && i !== (worst + 1) % n);
    cur.splice(Math.min(worst, cur.length), 0, mid);
  }
  return cur;
}

// ── entry point ──────────────────────────────────────────────────────────────

/** Steps 2–9 for ONE already-selected building blob. */
export interface RegularizeReport {
  vertices: number;
  edgesUnder3Ft: number;
  perimeterFt: number;
  areaSqft: number;
  /** Plan area of the ring as it arrived, before any of this. */
  rawAreaSqft: number;
  axisDeg: number;
  worstAngleDeviationDeg: number;
  familyShare: number;
  offFamily: Array<{ lengthFt: number; offDeg: number }>;
  staircaseEdgesRemoved: Array<{ lengthFt: number; offDeg: number; shiftFt: number; areaShare: number }>;
  budgetEdgesRemoved: Array<{ lengthFt: number; offDeg: number; shiftFt: number; areaShare: number }>;
  maxCornerShiftFt: number;
  simple: boolean;
  asserts: { vertices: boolean; angles: boolean };
  reasons: string[];
}

/**
 * The one regularisation pass, from ANY closed ring in frame feet: Douglas–
 * Peucker → dominant axis → snap to the 45° family → merge collinear → drop
 * short edges → the effect test (off-family, then the vertex budget) → CCW.
 *
 * Both inputs go through this identical pass — the pixel staircase traced off
 * Google's mask, and the polygon EagleView Instant returns. They arrive broken
 * in different ways (the staircase has hundreds of 0.3 ft steps on the family;
 * the traced polygon has a dozen real corners a few degrees off it), and the
 * point of one pass is that the SAME contour comes out either way.
 */
export function regularizeRing(
  raw: FootprintPoint[],
  opts: FootprintOptions = {},
  /**
   * Debug tap: called with the ring AFTER each named sub-operation, in order.
   * Exists for the filmstrip tool, which films the REAL intermediates of the
   * real function rather than re-implementing the sequence (§K7). Never
   * changes behaviour; the ring handed out is a copy.
   */
  onStep?: (name: string, ring: FootprintPoint[]) => void,
): { ring: FootprintPoint[]; report: RegularizeReport } {
  const o = { ...DEFAULTS, ...opts };
  const reasons: string[] = [];
  const rawAreaSqft = areaOf(raw);
  const tap = (name: string, r: FootprintPoint[]) => onStep?.(name, r.map((p) => ({ ...p })));

  let ring = dropCollinear(douglasPeucker(raw, o.simplifyFt));
  tap("Дуглас–Пекер + сброс коллинеарных", ring);
  const axisDeg = dominantAxisDeg(ring, o.snapTolDeg);
  const snapped = snapToAxis(ring, axisDeg, o.snapTolDeg, o.maxCornerShiftFt);
  ring = snapped.ring;
  tap("снап к доминирующим осям", ring);
  ring = mergeCollinear(ring, o.collinearMergeDeg);
  tap("слияние коллинеарных", ring);
  ring = dropShortEdges(ring, o.minEdgeFt);
  tap("сброс коротких рёбер", ring);
  const cleaned = dropOffFamilyEdges(ring, axisDeg, o.maxCornerShiftFt, 0.01);
  ring = mergeCollinear(cleaned.ring, o.collinearMergeDeg);
  tap("сброс рёбер вне семейства осей", ring);
  const budget = dropToVertexBudget(ring, o.maxVertices, o.maxCornerShiftFt, 0.01, 0.02);
  ring = mergeCollinear(budget.ring, o.collinearMergeDeg);
  tap("бюджет вершин", ring);
  ring = ensureCCW(dropCollinear(ring));
  tap("итог регуляризации (CCW)", ring);

  const area = areaOf(ring);
  const simple = isSimpleRing(ring);
  if (!simple) reasons.push("regularised ring is not simple");

  const offFamily: Array<{ lengthFt: number; offDeg: number }> = [];
  let worstAngle = 0;
  let onFamilyLen = 0;
  let totalLen = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const bearing = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    let diff = Infinity;
    for (let k = 0; k < 8; k++) {
      let d = Math.abs((((bearing - (axisDeg + k * 45)) % 360) + 540) % 360 - 180);
      if (d > 90) d = 180 - d;
      diff = Math.min(diff, d);
    }
    totalLen += len;
    if (diff <= 3) onFamilyLen += len;
    else offFamily.push({ lengthFt: len, offDeg: diff });
    worstAngle = Math.max(worstAngle, diff);
  }
  const familyShare = totalLen > 0 ? onFamilyLen / totalLen : 0;
  const anglesOk = familyShare >= o.minFamilyShare;
  if (!anglesOk) {
    reasons.push(`only ${(familyShare * 100).toFixed(1)}% of the perimeter is on the family (min ${(o.minFamilyShare * 100).toFixed(0)}%)`);
  }
  for (const e of offFamily) {
    reasons.push(`off family: ${e.lengthFt.toFixed(1)} ft at ${e.offDeg.toFixed(1)}°`);
  }
  const vertsOk = ring.length <= o.maxVertices;
  if (!vertsOk) reasons.push(`${ring.length} vertices, over the ${o.maxVertices} cap`);

  return {
    ring,
    report: {
      vertices: ring.length,
      edgesUnder3Ft: ring.filter((p, i) => {
        const q = ring[(i + 1) % ring.length];
        return Math.hypot(q.x - p.x, q.y - p.y) < 3;
      }).length,
      perimeterFt: perimeterOf(ring),
      areaSqft: area,
      rawAreaSqft,
      axisDeg,
      worstAngleDeviationDeg: worstAngle,
      familyShare,
      offFamily,
      staircaseEdgesRemoved: cleaned.removed,
      budgetEdgesRemoved: budget.removed,
      maxCornerShiftFt: snapped.maxShift,
      simple,
      asserts: { vertices: vertsOk, angles: anglesOk },
      reasons,
    },
  };
}

function outlineFromBinary(
  binIn: Uint8Array,
  w: number,
  h: number,
  stepFt: number,
  opts: FootprintOptions,
  components: FootprintComponent[],
): FootprintResult {
  const o = { ...DEFAULTS, ...opts };
  const reasons: string[] = [];

  const emptyReport = (): FootprintReport => ({
    components,
    keptComponents: components.filter((c) => c.kept).length,
    rawVertices: 0,
    rawEdgesUnder3Ft: 0,
    vertices: 0,
    edgesUnder3Ft: 0,
    perimeterFt: 0,
    areaSqft: 0,
    axisDeg: 0,
    worstAngleDeviationDeg: 0,
    maxCornerShiftFt: 0,
    familyShare: 0,
    offFamily: [],
    staircaseEdgesRemoved: [],
    asserts: { vertices: false, angles: false },
    areaWarning: false,
    reasons,
  });

  let bin = binIn;

  // 2. close hairline gaps, fill interior holes
  bin = erode(dilate(bin, w, h), w, h);
  bin = fillHoles(bin, w, h);

  // 3. trace
  const loop = traceBoundary(bin, w, h);
  if (!loop || loop.length < 8) {
    reasons.push("boundary walk found no usable loop");
    return { ring: null, report: { ...emptyReport(), components, keptComponents: components.filter((c) => c.kept).length } };
  }
  const cornerFt = (c: { x: number; y: number }): FootprintPoint => ({
    x: (c.x - w / 2) * stepFt,
    y: (h / 2 - c.y) * stepFt,
  });
  const staircase = dropCollinear(loop.map(cornerFt));
  const rawEdgesUnder3 = staircase.filter((p, i) => {
    const q = staircase[(i + 1) % staircase.length];
    return Math.hypot(q.x - p.x, q.y - p.y) < 3;
  }).length;

  // 4–9. regularise ONCE — the same pass the Instant contour goes through
  const reg = regularizeRing(staircase, opts);
  const ring = reg.ring;
  const { axisDeg, familyShare, offFamily, simple } = reg.report;
  const worstAngle = reg.report.worstAngleDeviationDeg;
  const anglesOk = reg.report.asserts.angles;
  const area = reg.report.areaSqft;
  reasons.push(...reg.report.reasons.filter((r) => !r.includes("over the")));

  // The area comparison is a WARNING: Google reports the SLOPED roof area, so
  // the plan has to be lifted by a slope factor the caller supplies, and until
  // phase 3 that factor comes from pitches the validator does not trust (R04).
  const google = opts.googleAreaSqft ?? null;
  const lifted = area * (o.slopeFactor || 1);
  const areaWarning = google != null && Math.abs(lifted - google) / google > o.areaTolerance;
  if (areaWarning && google != null) {
    reasons.push(
      `plan ${area.toFixed(0)} × slope ${(o.slopeFactor || 1).toFixed(3)} = ${lifted.toFixed(0)} sq ft is ${(((lifted - google) / google) * 100).toFixed(1)}% off Google's ${google.toFixed(0)} (warning band ±${(o.areaTolerance * 100).toFixed(0)}%)`,
    );
  }
  const vertsOk = ring.length <= o.maxVertices;
  if (!vertsOk) reasons.push(`${ring.length} vertices, over the ${o.maxVertices} cap`);

  return {
    ring: simple ? ring : null,
    report: {
      components,
      keptComponents: components.filter((c) => c.kept).length,
      rawVertices: staircase.length,
      rawEdgesUnder3Ft: rawEdgesUnder3,
      vertices: ring.length,
      edgesUnder3Ft: ring.filter((p, i) => {
        const q = ring[(i + 1) % ring.length];
        return Math.hypot(q.x - p.x, q.y - p.y) < 3;
      }).length,
      perimeterFt: perimeterOf(ring),
      areaSqft: area,
      axisDeg,
      worstAngleDeviationDeg: worstAngle,
      familyShare,
      offFamily,
      staircaseEdgesRemoved: [...reg.report.staircaseEdgesRemoved, ...reg.report.budgetEdgesRemoved],
      maxCornerShiftFt: reg.report.maxCornerShiftFt,
      asserts: { vertices: vertsOk, angles: anglesOk },
      areaWarning,
      reasons,
    },
  };
}

// ── entry point: one outline PER STRUCTURE ───────────────────────────────────

export interface StructureFootprint {
  /** A/B/C… — the EagleView facet-lettering prefix this structure owns. */
  prefix: string;
  ring: FootprintPoint[] | null;
  report: FootprintReport;
  /** Plan area of the mask blob this came from, before regularisation. */
  maskAreaSqft: number;
}

export interface StructuresResult {
  structures: StructureFootprint[];
  components: FootprintComponent[];
  reasons: string[];
}

/** Smallest blob that can be a roof rather than a shed's shadow (sq ft). */
const MIN_STRUCTURE_SQFT = 100;

/**
 * Every building on the parcel, each as its own outline.
 *
 * Connectivity in the mask decides what a structure IS — no distance threshold:
 * separate islands are separate roofs, with their own skeleton, ridges and
 * pitches later. Selection is centroid-inside-the-parcel plus a floor on area;
 * without a parcel ring only the blob under the pin qualifies.
 *
 * This is where the old path lost roof: it kept exactly one component
 * (roofRecon.ts isolateBuilding) and dropped the rest. On 17028 NE 100th St the
 * discarded 680 sq ft blob sits 3.6 ft from the house and 100 % inside the
 * parcel — a 30 % undercount of that roof (ROOF-DIAGNOSIS.md).
 */
export function buildStructureFootprints(mask: Raster, opts: FootprintOptions = {}): StructuresResult {
  const { width: w, height: h } = mask;
  const stepFt = mask.pixelSizeM * FT_PER_M;
  const pxArea = stepFt * stepFt;
  const reasons: string[] = [];

  const bin0 = binarise(mask);
  const { label: lab, sizes } = label(bin0, w, h);
  const px2ft = (px: number, py: number): FootprintPoint => ({
    x: (px + 0.5 - w / 2) * stepFt,
    y: (h / 2 - py - 0.5) * stepFt,
  });

  // centroid per component
  const sumX = new Float64Array(sizes.length);
  const sumY = new Float64Array(sizes.length);
  for (let i = 0; i < lab.length; i++) {
    const id = lab[i];
    if (id < 0) continue;
    const x = i % w;
    const y = (i - x) / w;
    const p = px2ft(x, y);
    sumX[id] += p.x;
    sumY[id] += p.y;
  }

  const centreLabel = lab[Math.floor(h / 2) * w + Math.floor(w / 2)];
  const parcel = opts.parcel && opts.parcel.length >= 3 ? opts.parcel : null;
  const components: FootprintComponent[] = sizes.map((n, id) => {
    const areaSqft = n * pxArea;
    const centroid = { x: sumX[id] / n, y: sumY[id] / n };
    const onParcel = parcel ? pointInRing(centroid, parcel) : id === centreLabel;
    const bigEnough = areaSqft >= MIN_STRUCTURE_SQFT;
    const kept = onParcel && bigEnough;
    return {
      pixels: n,
      areaSqft,
      kept,
      reason: !onParcel
        ? parcel
          ? "centroid outside the parcel"
          : "not the blob under the pin (no parcel ring)"
        : bigEnough
          ? id === centreLabel
            ? "under the pin, on the parcel"
            : "centroid on the parcel"
          : `${areaSqft.toFixed(0)} sq ft — under the ${MIN_STRUCTURE_SQFT} sq ft floor`,
    };
  });
  if (!parcel) reasons.push("no parcel ring — only the structure under the pin is measured");

  const order = components
    .map((c, id) => ({ c, id }))
    .filter((e) => e.c.kept)
    .sort((a, b) => b.c.areaSqft - a.c.areaSqft);

  const structures: StructureFootprint[] = order.map((e, i) => {
    const bin = new Uint8Array(bin0.length);
    for (let k = 0; k < bin.length; k++) bin[k] = lab[k] === e.id ? 1 : 0;
    const res = outlineFromBinary(bin, w, h, stepFt, opts, components);
    return {
      prefix: String.fromCharCode(65 + i),
      ring: res.ring,
      report: res.report,
      maskAreaSqft: e.c.areaSqft,
    };
  });

  return { structures, components, reasons };
}

