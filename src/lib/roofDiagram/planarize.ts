// Roof diagram — PLANARIZE: the hard drawing invariants of the roof drawing
// rules spec (docs/superpowers/specs/2026-08-24-roof-drawing-rules.md §5),
// enforced mechanically on EVERY model before it is drawn, whatever produced
// it (repaired recon, rectified recon, or the straight-skeleton synthesis):
//
//   P1  no two drawn segments properly cross — the lower-priority line
//       (perimeter > crease > flashing > OTHER) is split at the intersection
//       and only the piece(s) on its owner facets survive (tested by nudging
//       the piece midpoint 0.1 ft perpendicular to both sides — the midpoint
//       itself sits ON the owner ring's edge); equal priority splits BOTH
//       lines at one shared new vertex (true planarization); the sweep runs
//       again after P3/P5, which move points
//   P2  no line endpoint stays outside the Instant outline (plus the eave
//       overhang tolerance — the caller's MEASURED overhang widens it, so a
//       deliberate 3 ft offset is never clipped back as stray geometry; a
//       caller that KNOWS the drawn roof edge — the accepted vision-traced
//       outline — passes it as `clip` and endpoints clip to it tightly) — the
//       endpoint is pulled back to the outline
//       boundary along the line's own direction (interior endpoints never
//       move); a line wholly outside every outline ring is removed ONLY when
//       no facet ring references it — removing a referenced line can never
//       clip, it can only tear the ring and force a P3 exclusion (measured:
//       Kirkland's 300 sqft garage sits wholly outside the single Instant
//       outline ring; dropping its lines lost the whole facet)
//   P3  every facet ring is simple and closed — a self-crossing ring gets its
//       two nearest offending vertices welded (< 1 ft), anything unclosable
//       is EXCLUDED from the drawing and reported; a torn patch is never drawn
//   P4  coverage holes (outline minus the union of facet plans) are measured
//       by a 0.5 ft raster per outline ring and REPORTED — filling them is
//       synthesis's job; a ring too big for the cell budget flags
//       holesUnmeasured instead of reporting 0
//   P5  no dangling RIDGE/HIP/VALLEY end — a free end off every other line by
//       more than 0.75 ft is extended/trimmed along its own direction onto the
//       nearest line within 3 ft; farther than that it is left alone (never
//       invent geometry)
//
// Split pieces carry a PROPORTIONAL share of the original lengthFt, so the
// printed footage totals are preserved exactly (the sum of the pieces equals
// the original figure); calibration k downstream still applies exactly once.
//
// Pure and client-safe: no I/O, the input model is never mutated (deep copy),
// every pass is at worst O(n²) in the line count (~200) and NaN-guarded.

import type { EvLineType, RoofLine, RoofModel, RoofPoint } from "@/lib/eagleview";
import { buildIndexes, ringOf, type RoofIndexes } from "@/components/estimator/roof/roofGeometry";

export interface PlanarizeReport {
  crossingsResolved: number;
  clippedToOutline: number;
  ringsRepaired: number;
  facetsExcluded: number;
  holesSqft: number;
  /** A single outline ring's raster grid exceeded the cell cap — holes for it
   *  could not be measured (holesSqft omits that ring instead of lying 0). */
  holesUnmeasured: boolean;
  danglingFixed: number;
}

type P2 = { x: number; y: number };

/** Endpoint contact within this distance is a junction, not a crossing (§5 P1). */
const TOUCH_FT = 0.05;
/** Split pieces shorter than this are noise and dropped (§5 P1). */
const MIN_PIECE_FT = 0.5;
/** Owner-side probe offset: the piece midpoint lies ON the owner ring's edge,
 *  so it is nudged this far perpendicular (both sides) before pointInRing. */
const NUDGE_FT = 0.1;
/** How far outside the outline an endpoint may sit before P2 pulls it back. */
/** The Instant outline is the WALL footprint; the roof legitimately overhangs
 *  it by an eave overhang (12–24″ typical, IRC). Clipping at 0.5 ft chopped
 *  every real eave (measured on the test house: repaired-candidate eaves fell
 *  179 → 98 ft). 2.5 ft admits any code-plausible overhang while still
 *  catching genuinely stray geometry. When the caller MEASURED this house's
 *  overhang (calibrate clamps it to 3 ft and offsets the synthesis rings by
 *  it), the effective tolerance is max(OUTLINE_TOL_FT, overhang + margin) so
 *  an overhang in (2.5, 3] is not clipped back by the very pass that follows
 *  the deliberate offset. */
const OUTLINE_TOL_FT = 2.5;
/** Headroom added over a measured overhang when widening the P2 tolerance. */
const OVERHANG_MARGIN_FT = 0.5;
/** Offending ring vertices weld only when closer than this (§5 P3). */
const WELD_RING_FT = 1.0;
/** A leg shorter than this can carry a spike (§5 P3 — no zigzags). */
const SPIKE_MAX_LEG_FT = 4;
/** Turn at a vertex that means the boundary doubled back on itself. */
const SPIKE_MIN_TURN_DEG = 150;
/** A free interior end is "attached" when this close to another line (§5 P5). */
const DANGLE_FT = 0.75;
/** Maximum extension/trim P5 may apply along the crease's own direction. */
const EXTEND_FT = 3.0;

const INTERIOR_TYPES: ReadonlySet<EvLineType> = new Set<EvLineType>(["RIDGE", "HIP", "VALLEY"]);

/** Drawing priority (§5 P1): perimeter > crease > flashing > OTHER. */
function priorityOf(t: EvLineType): number {
  switch (t) {
    case "EAVE":
    case "RAKE":
      return 3;
    case "RIDGE":
    case "HIP":
    case "VALLEY":
      return 2;
    case "FLASHING":
    case "STEPFLASH":
      return 1;
    default:
      return 0;
  }
}

// ── small geometry helpers ───────────────────────────────────────────────────

const finiteXY = (p: RoofPoint | undefined): p is RoofPoint =>
  !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

const dist2d = (a: P2, b: P2): number => Math.hypot(b.x - a.x, b.y - a.y);

const crossZ = (o: P2, a: P2, b: P2): number =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

function unit(a: P2, b: P2): P2 | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < 1e-6) return null;
  return { x: dx / len, y: dy / len };
}

/**
 * PROPER crossing of segments a1a2 / b1b2: interiors intersect (strict sign
 * test) and the intersection point is at least TOUCH_FT away from all four
 * endpoints. Returns the point and its parameter along each segment.
 */
function properCrossing(
  a1: P2,
  a2: P2,
  b1: P2,
  b2: P2,
): { x: number; y: number; t: number; s: number } | null {
  const eps = 1e-9;
  const d1 = crossZ(b1, b2, a1);
  const d2 = crossZ(b1, b2, a2);
  const d3 = crossZ(a1, a2, b1);
  const d4 = crossZ(a1, a2, b2);
  const strict =
    ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) &&
    ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps));
  if (!strict) return null;
  const ux = a2.x - a1.x;
  const uy = a2.y - a1.y;
  const vx = b2.x - b1.x;
  const vy = b2.y - b1.y;
  const denom = ux * vy - uy * vx;
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-12) return null;
  const t = ((b1.x - a1.x) * vy - (b1.y - a1.y) * vx) / denom;
  const s = ((b1.x - a1.x) * uy - (b1.y - a1.y) * ux) / denom;
  const x = a1.x + ux * t;
  const y = a1.y + uy * t;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const X = { x, y };
  for (const e of [a1, a2, b1, b2]) if (dist2d(X, e) <= TOUCH_FT) return null;
  return { x, y, t, s };
}

/** Even-odd point-in-polygon test on a plan ring. */
function pointInRing(p: P2, ring: P2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y) {
      const xInt = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (Number.isFinite(xInt) && p.x < xInt) inside = !inside;
    }
  }
  return inside;
}

function distPointSeg(p: P2, a: P2, b: P2): number {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const len = Math.hypot(ex, ey);
  if (!Number.isFinite(len) || len < 1e-9) return dist2d(p, a);
  const t = Math.max(0, Math.min(len, ((p.x - a.x) * ex + (p.y - a.y) * ey) / len));
  return Math.hypot(p.x - (a.x + (ex / len) * t), p.y - (a.y + (ey / len) * t));
}

function distToRingBoundary(p: P2, ring: P2[]): number {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) {
    d = Math.min(d, distPointSeg(p, ring[i], ring[(i + 1) % ring.length]));
  }
  return d;
}

// ── model bookkeeping helpers ────────────────────────────────────────────────

function pointMap(model: RoofModel): Map<string, RoofPoint> {
  return new Map(model.points.map((p) => [p.id, p]));
}

/** Remove lines from the model and from every face/penetration ring. */
function dropLines(model: RoofModel, ids: ReadonlySet<string>): void {
  if (!ids.size) return;
  model.lines = model.lines.filter((l) => !ids.has(l.id));
  for (const f of model.faces) f.lineIds = f.lineIds.filter((id) => !ids.has(id));
  for (const f of model.penetrations) f.lineIds = f.lineIds.filter((id) => !ids.has(id));
}

/** Replace `from` with `toIds` (possibly empty) in a ring, preserving order. */
function replaceIdInRing(ids: string[], from: string, toIds: string[]): string[] {
  if (!ids.includes(from)) return ids;
  const out: string[] = [];
  for (const id of ids) {
    if (id === from) out.push(...toIds);
    else out.push(id);
  }
  return out;
}

/**
 * ringOf, but strict (mirrors refine.ts): null unless EVERY line id resolves,
 * the chain consumed every line (ringOf silently truncates on a break), the
 * walk closes, and every vertex is finite.
 */
function strictRing(lineIds: string[], idx: RoofIndexes): RoofPoint[] | null {
  if (lineIds.length < 3) return null;
  for (const id of lineIds) if (!idx.linesById.has(id)) return null;
  const ring = ringOf(lineIds, idx);
  if (!ring || ring.length !== lineIds.length) return null;
  const seg = new Set<string>();
  for (const id of lineIds) {
    const l = idx.linesById.get(id);
    if (!l) return null;
    seg.add(l.aId + " " + l.bId);
    seg.add(l.bId + " " + l.aId);
  }
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (!finiteXY(a)) return null;
    if (!seg.has(a.id + " " + b.id)) return null;
  }
  return ring;
}

/** Fresh id minting — unique against everything already in the model. */
function makeMinter(model: RoofModel): { point: () => string; line: () => string } {
  const used = new Set<string>();
  for (const p of model.points) used.add(p.id);
  for (const l of model.lines) used.add(l.id);
  let n = 0;
  const mint = (prefix: string): string => {
    let id = `${prefix}${++n}`;
    while (used.has(id)) id = `${prefix}${++n}`;
    used.add(id);
    return id;
  };
  return { point: () => mint("pz:p"), line: () => mint("pz:l") };
}

// ── P1: no proper crossings ──────────────────────────────────────────────────

interface Crossing {
  a: RoofLine;
  b: RoofLine;
  x: number;
  y: number;
  /** Parameter of the intersection along a (0..1) and along b (0..1). */
  t: number;
  s: number;
}

function findFirstCrossing(model: RoofModel): Crossing | null {
  const pts = pointMap(model);
  const lines = model.lines;
  for (let i = 0; i < lines.length; i++) {
    const A = lines[i];
    const a1 = pts.get(A.aId);
    const a2 = pts.get(A.bId);
    if (!finiteXY(a1) || !finiteXY(a2)) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const B = lines[j];
      if (A.aId === B.aId || A.aId === B.bId || A.bId === B.aId || A.bId === B.bId) continue;
      const b1 = pts.get(B.aId);
      const b2 = pts.get(B.bId);
      if (!finiteXY(b1) || !finiteXY(b2)) continue;
      const hit = properCrossing(a1, a2, b1, b2);
      if (hit) return { a: A, b: B, x: hit.x, y: hit.y, t: hit.t, s: hit.s };
    }
  }
  return null;
}

/** z of a line interpolated at parameter t (0 at aId, 1 at bId). */
function zAt(l: RoofLine, t: number, pts: Map<string, RoofPoint>): number {
  const a = pts.get(l.aId);
  const b = pts.get(l.bId);
  if (!a || !b || !Number.isFinite(a.z) || !Number.isFinite(b.z)) return 0;
  return a.z + (b.z - a.z) * t;
}

/** Plan rings of every face/penetration owning this line id (chainable only). */
function ownerRings(model: RoofModel, lineId: string, idx: RoofIndexes): P2[][] {
  const rings: P2[][] = [];
  for (const f of [...model.faces, ...model.penetrations]) {
    if (!f.lineIds.includes(lineId)) continue;
    const ring = strictRing(f.lineIds, idx);
    if (ring) rings.push(ring.map((p) => ({ x: p.x, y: p.y })));
  }
  return rings;
}

/**
 * Owner-side test for a split piece a→b. The piece midpoint lies ON the parent
 * line — an edge of the owner ring — so testing it directly (or its distance to
 * the ring boundary) is vacuous. Instead the midpoint is nudged NUDGE_FT
 * perpendicular to BOTH sides; the piece is on its owner when at least one
 * nudged probe lands strictly inside an owner ring.
 */
function pieceInsideOwner(a: P2, b: P2, rings: P2[][]): boolean {
  const u = unit(a, b);
  if (!u) return true; // degenerate piece — untestable, never delete on it
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const probes: P2[] = [
    { x: mid.x - u.y * NUDGE_FT, y: mid.y + u.x * NUDGE_FT },
    { x: mid.x + u.y * NUDGE_FT, y: mid.y - u.x * NUDGE_FT },
  ];
  for (const ring of rings) {
    for (const probe of probes) if (pointInRing(probe, ring)) return true;
  }
  return false;
}

/**
 * Split line L at the (already created) point P. Returns the two pieces
 * (not yet added to the model); each carries a proportional share of
 * L.lengthFt so the printed total is preserved.
 */
function makePieces(
  L: RoofLine,
  P: RoofPoint,
  pts: Map<string, RoofPoint>,
  mintLine: () => string,
): { first: RoofLine; second: RoofLine } | null {
  const a = pts.get(L.aId);
  const b = pts.get(L.bId);
  if (!finiteXY(a) || !finiteXY(b)) return null;
  const lenA = dist2d(a, P);
  const lenB = dist2d(P, b);
  const total = lenA + lenB;
  if (!Number.isFinite(total) || total < 1e-6) return null;
  const share = Number.isFinite(L.lengthFt) ? L.lengthFt : total;
  const first: RoofLine = {
    id: mintLine(),
    type: L.type,
    aId: L.aId,
    bId: P.id,
    lengthFt: (share * lenA) / total,
  };
  const second: RoofLine = {
    id: mintLine(),
    type: L.type,
    aId: P.id,
    bId: L.bId,
    lengthFt: (share * lenB) / total,
  };
  return { first, second };
}

/** Swap L for `pieces` in model.lines (at L's slot) and in every ring. */
function commitSplit(model: RoofModel, L: RoofLine, pieces: RoofLine[]): void {
  const at = model.lines.findIndex((l) => l.id === L.id);
  if (at < 0) return;
  model.lines.splice(at, 1, ...pieces);
  const pieceIds = pieces.map((p) => p.id);
  for (const f of model.faces) f.lineIds = replaceIdInRing(f.lineIds, L.id, pieceIds);
  for (const f of model.penetrations) f.lineIds = replaceIdInRing(f.lineIds, L.id, pieceIds);
}

function resolveCrossing(
  model: RoofModel,
  hit: Crossing,
  minter: { point: () => string; line: () => string },
): void {
  const pts = pointMap(model);
  const pa = priorityOf(hit.a.type);
  const pb = priorityOf(hit.b.type);
  if (pa === pb) {
    // Equal priority: both lines split at ONE shared new vertex; all four
    // pieces are kept (true planarization).
    const z = (zAt(hit.a, hit.t, pts) + zAt(hit.b, hit.s, pts)) / 2;
    const P: RoofPoint = { id: minter.point(), x: hit.x, y: hit.y, z };
    const piecesA = makePieces(hit.a, P, pts, minter.line);
    const piecesB = makePieces(hit.b, P, pts, minter.line);
    if (!piecesA || !piecesB) return;
    model.points.push(P);
    commitSplit(model, hit.a, [piecesA.first, piecesA.second]);
    commitSplit(model, hit.b, [piecesB.first, piecesB.second]);
    return;
  }
  // Unequal priority: split the LOWER-priority line only; keep the piece(s)
  // whose midpoint lies on (or within 0.5 ft of) one of its owner facets, and
  // drop sub-0.5 ft noise pieces.
  const lower = pa < pb ? hit.a : hit.b;
  const tLower = pa < pb ? hit.t : hit.s;
  const idx = buildIndexes(model);
  const rings = ownerRings(model, lower.id, idx);
  const P: RoofPoint = { id: minter.point(), x: hit.x, y: hit.y, z: zAt(lower, tLower, pts) };
  const pieces = makePieces(lower, P, pts, minter.line);
  if (!pieces) return;
  const keep: RoofLine[] = [];
  for (const piece of [pieces.first, pieces.second]) {
    const a = piece.aId === P.id ? P : pts.get(piece.aId);
    const b = piece.bId === P.id ? P : pts.get(piece.bId);
    if (!finiteXY(a) || !finiteXY(b)) continue;
    if (dist2d(a, b) < MIN_PIECE_FT) continue; // noise piece — dropped
    // No chainable owner ring at all → keep (the split alone resolves the
    // crossing; never delete geometry on an untestable condition).
    if (rings.length && !pieceInsideOwner(a, b, rings)) continue;
    keep.push(piece);
  }
  model.points.push(P);
  commitSplit(model, lower, keep);
}

function resolveCrossings(
  model: RoofModel,
  report: PlanarizeReport,
  minter: { point: () => string; line: () => string },
): void {
  for (let sweep = 0; sweep < 3; sweep++) {
    let fixed = 0;
    let guard = 400; // n≈200 lines — far beyond any real crossing count
    while (guard-- > 0) {
      const hit = findFirstCrossing(model);
      if (!hit) break;
      resolveCrossing(model, hit, minter);
      report.crossingsResolved++;
      fixed++;
    }
    if (!fixed) break;
  }
}

// ── P2: clip to the outline ──────────────────────────────────────────────────

/** Intersection parameter of segment a→b with segment c→d, or null. */
function segSegParam(a: P2, b: P2, c: P2, d: P2): { t: number; s: number } | null {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const vx = d.x - c.x;
  const vy = d.y - c.y;
  const denom = ux * vy - uy * vx;
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-12) return null;
  const t = ((c.x - a.x) * vy - (c.y - a.y) * vx) / denom;
  const s = ((c.x - a.x) * uy - (c.y - a.y) * ux) / denom;
  if (!Number.isFinite(t) || !Number.isFinite(s)) return null;
  return { t, s };
}

function clipToOutline(
  model: RoofModel,
  outlines: P2[][],
  report: PlanarizeReport,
  tolFt: number,
): void {
  const rings = outlines
    .map((r) => r.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)))
    .filter((r) => r.length >= 3);
  if (!rings.length) return;
  const pts = pointMap(model);
  const moved = new Set<string>();
  const isOutside = (p: P2): boolean => {
    for (const ring of rings) {
      if (pointInRing(p, ring)) return false;
      if (distToRingBoundary(p, ring) <= tolFt) return false;
    }
    return true;
  };
  // A line wholly outside every outline ring (both endpoints AND midpoint
  // beyond the overhang tolerance) is stray only when NO facet ring needs it —
  // those are deleted. A REFERENCED line is KEPT even wholly outside: the
  // Instant outline is the wall footprint of the structures it reaches, and a
  // coherent facet beyond it means the outline is incomplete there, not that
  // the facet is noise (measured on the Kirkland model: the garage's facets
  // lie wholly outside the single Instant outline ring — removing their lines
  // tore both rings, P3 excluded them, and the drawing lost 338 sqft of real
  // roof). Removing a ring's line can only tear the ring; P2 clips, it never
  // tears.
  const referenced = new Set<string>();
  for (const f of [...model.faces, ...model.penetrations]) {
    for (const id of f.lineIds) referenced.add(id);
  }
  const wholelyOutside = new Set<string>();
  for (const l of model.lines) {
    if (referenced.has(l.id)) continue;
    const a = pts.get(l.aId);
    const b = pts.get(l.bId);
    if (!finiteXY(a) || !finiteXY(b)) continue;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (isOutside(a) && isOutside(b) && isOutside(mid)) wholelyOutside.add(l.id);
  }
  dropLines(model, wholelyOutside);
  // Endpoint pull-back skips lines that are wholly outside AND referenced by a
  // face: their whole structure is off-outline (incomplete outline), and there
  // is no boundary crossing to clip against anyway.
  const keptOutside = new Set<string>();
  for (const l of model.lines) {
    if (!referenced.has(l.id)) continue;
    const a = pts.get(l.aId);
    const b = pts.get(l.bId);
    if (!finiteXY(a) || !finiteXY(b)) continue;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (isOutside(a) && isOutside(b) && isOutside(mid)) keptOutside.add(l.id);
  }
  for (const l of model.lines) {
    if (keptOutside.has(l.id)) continue;
    for (const [endId, otherId] of [
      [l.aId, l.bId],
      [l.bId, l.aId],
    ] as const) {
      if (moved.has(endId)) continue;
      const p = pts.get(endId);
      const o = pts.get(otherId);
      if (!finiteXY(p) || !finiteXY(o)) continue;
      if (!isOutside(p)) continue; // interior endpoints never move
      // Pull p back along the line's OWN direction: the boundary crossing of
      // segment o→p nearest to p (max t). t ≥ −1e-9 is accepted and clamped so
      // an inner endpoint sitting exactly ON the boundary still clips the
      // outer part. No crossing at all → leave the line (P2 clips, it does
      // not relocate).
      let bestT = -Infinity;
      for (const ring of rings) {
        for (let i = 0; i < ring.length; i++) {
          const hit = segSegParam(o, p, ring[i], ring[(i + 1) % ring.length]);
          if (!hit) continue;
          if (hit.s < -1e-9 || hit.s > 1 + 1e-9) continue;
          if (hit.t < -1e-9 || hit.t > 1 + 1e-9) continue;
          if (hit.t > bestT) bestT = hit.t;
        }
      }
      if (bestT < -1e-9) continue;
      const t = Math.min(1, Math.max(0, bestT));
      p.x = o.x + (p.x - o.x) * t;
      p.y = o.y + (p.y - o.y) * t;
      if (Number.isFinite(p.z) && Number.isFinite(o.z)) p.z = o.z + (p.z - o.z) * t;
      moved.add(endId);
      report.clippedToOutline++;
    }
  }
}

// ── P3: every facet ring simple and closed ───────────────────────────────────

/**
 * First pair of non-adjacent ring edges that properly cross, or null. Uses
 * properCrossing, so it shares its TOUCH_FT dead zone: an intersection within
 * TOUCH_FT of any of the four edge endpoints is a junction, not a crossing.
 */
function firstSelfCrossing(ring: RoofPoint[]): { i: number; j: number } | null {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a1 = ring[i];
    const a2 = ring[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent around the seam
      if (properCrossing(a1, a2, ring[j], ring[(j + 1) % n])) return { i, j };
    }
  }
  return null;
}

/** Plan area of a ring (shoelace, absolute). */
function ringArea(ring: RoofPoint[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** A ring that visits the same vertex twice is a FIGURE EIGHT: two loops
 *  pinched at one point. `firstSelfCrossing` cannot see it — the loops only
 *  TOUCH there, and a strict-sign crossing test excludes touching — so such a
 *  ring passed P3 and reached the drawing, where the renderer had to fold a
 *  surface back on itself to cover it (measured on 12629 NE 100th Pl, facet
 *  B2). Returns the two positions of the repeated vertex when both loops are
 *  big enough to stand on their own. */
function firstPinch(ring: RoofPoint[]): { i: number; j: number } | null {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const same = ring[i].id === ring[j].id || dist2d(ring[i], ring[j]) <= TOUCH_FT;
      if (!same) continue;
      const inner = j - i;
      const outer = n - inner;
      if (inner >= 3 && outer >= 3) return { i, j };
    }
  }
  return null;
}

/** Cut a pinched facet into the two facets it actually is. Returns the new
 *  face's id, or null when the split would not leave two simple rings (then
 *  the caller falls through to the weld / exclude path). */
function splitPinchedFace(
  model: RoofModel,
  face: RoofModel["faces"][number],
  ring: RoofPoint[],
  pinch: { i: number; j: number },
  idx: RoofIndexes,
): { newFaceId: string } | { keepIds: string[] } | null {
  const n = ring.length;
  const lineBetween = new Map<string, string>();
  for (const id of face.lineIds) {
    const l = idx.linesById.get(id);
    if (!l) return null;
    lineBetween.set(`${l.aId}|${l.bId}`, id);
    lineBetween.set(`${l.bId}|${l.aId}`, id);
  }
  const idAt = (k: number): string | null =>
    lineBetween.get(`${ring[k % n].id}|${ring[(k + 1) % n].id}`) ?? null;

  const innerIds: string[] = [];
  for (let k = pinch.i; k < pinch.j; k++) {
    const id = idAt(k);
    if (!id) return null;
    innerIds.push(id);
  }
  const outerIds: string[] = [];
  for (let k = pinch.j; k < pinch.i + n; k++) {
    const id = idAt(k);
    if (!id) return null;
    outerIds.push(id);
  }
  if (innerIds.length < 3 || outerIds.length < 3) return null;
  if (new Set([...innerIds, ...outerIds]).size !== innerIds.length + outerIds.length) return null;

  // Both halves must stand as simple closed rings, or the split is no repair.
  const probe = (ids: string[]): RoofPoint[] | null => {
    const r = strictRing(ids, idx);
    return r && !firstSelfCrossing(r) && !firstPinch(r) ? r : null;
  };
  const innerRing = probe(innerIds);
  const outerRing = probe(outerIds);
  if (!innerRing || !outerRing) return null;

  // …and they must not COVER each other. A tangle whose loops overlap in plan
  // is not a figure eight; splitting it would just draw the same roof twice
  // (measured on 12629 NE 100th Pl: an early version of this split produced two
  // facets sharing 8 sq ft). Leave those to the weld / exclude path.
  const overlaps = (a: RoofPoint[], b: RoofPoint[]): boolean => {
    for (const p of a) if (pointInRing(p, b)) return true;
    for (const p of b) if (pointInRing(p, a)) return true;
    for (let i = 0; i < a.length; i++) {
      for (let j = 0; j < b.length; j++) {
        if (properCrossing(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
      }
    }
    return false;
  };
  if (overlaps(innerRing, outerRing)) return { keepIds: ringArea(innerRing) >= ringArea(outerRing) ? innerIds : outerIds };

  const used = new Set(model.faces.map((f) => f.id));
  let newId = `${face.id}:b`;
  let n2 = 1;
  while (used.has(newId)) newId = `${face.id}:b${++n2}`;
  // The parent's printed figure is already calibrated, so DIVIDE it between the
  // halves by their plan share rather than recomputing (which would drop the
  // calibration k). Leaving the new face at 0 sq ft printed "0 sq ft" on the
  // drawing and vanished from the totals.
  const innerArea = ringArea(innerRing);
  const outerArea = ringArea(outerRing);
  const total = innerArea + outerArea;
  const parentArea = Number.isFinite(face.areaSqft) ? face.areaSqft : 0;
  const innerShare = total > 0 ? (parentArea * innerArea) / total : parentArea / 2;
  face.lineIds = innerIds;
  face.areaSqft = innerShare;
  model.faces.push({
    ...face,
    id: newId,
    lineIds: outerIds,
    areaSqft: parentArea - innerShare,
    // The letter is re-ranked by area after planarize (calibrate); keeping the
    // parent's would print the same designator on two facets, so this one is
    // deliberately blank until then.
    designator: "",
  });
  return { newFaceId: newId };
}

/** Merge point `drop` into `keep` (midpoint), retarget lines, purge degenerates. */
function weldPoints(model: RoofModel, keep: RoofPoint, drop: RoofPoint): void {
  keep.x = (keep.x + drop.x) / 2;
  keep.y = (keep.y + drop.y) / 2;
  if (Number.isFinite(keep.z) && Number.isFinite(drop.z)) keep.z = (keep.z + drop.z) / 2;
  for (const l of model.lines) {
    if (l.aId === drop.id) l.aId = keep.id;
    if (l.bId === drop.id) l.bId = keep.id;
  }
  model.points = model.points.filter((p) => p.id !== drop.id);
  const dead = new Set<string>();
  for (const l of model.lines) if (l.aId === l.bId) dead.add(l.id);
  dropLines(model, dead);
}

/**
 * Cheap chain repair before exclusion (§5 P3: exclusion is the LAST resort).
 * ringOf already re-walks lineIds by point adjacency (order damage from a
 * splice never fails it), so the failures that reach this are broken CLOSURE:
 * loose ends left where an earlier pass moved or removed a shared point. When
 * the face's own lines leave exactly one pair of degree-1 endpoints within the
 * weld distance, welding that pair closes the chain. Welds one pair per call
 * (the repairRings worklist re-checks and calls again — up to the per-face
 * budget); returns the kept point id, or null when no weldable gap exists.
 */
function weldChainGap(model: RoofModel, lineIds: string[], idx: RoofIndexes): string | null {
  const deg = new Map<string, number>();
  for (const id of new Set(lineIds)) {
    const l = idx.linesById.get(id);
    if (!l || l.aId === l.bId) continue;
    deg.set(l.aId, (deg.get(l.aId) ?? 0) + 1);
    deg.set(l.bId, (deg.get(l.bId) ?? 0) + 1);
  }
  const loose: RoofPoint[] = [];
  for (const [pid, d] of deg) {
    if (d !== 1) continue;
    const p = idx.pointsById.get(pid);
    if (finiteXY(p)) loose.push(p);
  }
  if (loose.length < 2 || loose.length % 2 !== 0) return null;
  let keep: RoofPoint | null = null;
  let drop: RoofPoint | null = null;
  let bestD = Infinity;
  for (let i = 0; i < loose.length; i++) {
    for (let j = i + 1; j < loose.length; j++) {
      const d = dist2d(loose[i], loose[j]);
      if (d < bestD) {
        bestD = d;
        keep = loose[i];
        drop = loose[j];
      }
    }
  }
  if (!keep || !drop || bestD >= WELD_RING_FT) return null;
  weldPoints(model, keep, drop);
  return keep.id;
}

/** Remove the face; drop only the lines no surviving ring still references. */
function excludeFace(model: RoofModel, faceId: string, report: PlanarizeReport): void {
  const face = model.faces.find((f) => f.id === faceId);
  if (!face) return;
  model.faces = model.faces.filter((f) => f.id !== faceId);
  const stillReferenced = new Set<string>();
  for (const f of [...model.faces, ...model.penetrations]) {
    for (const id of f.lineIds) stillReferenced.add(id);
  }
  const orphaned = new Set(face.lineIds.filter((id) => !stillReferenced.has(id)));
  if (orphaned.size) model.lines = model.lines.filter((l) => !orphaned.has(l.id));
  report.facetsExcluded++;
}

/** Keep only `keepIds` on a face and retire the lines nothing else references.
 *  Used when a pinched ring's two loops overlap: the smaller loop is a tangle,
 *  not a facet, so the bigger loop stays and the rest is retired — the drawing
 *  loses the tangle instead of the whole facet. */
function trimFaceTo(model: RoofModel, faceId: string, keepIds: string[], report: PlanarizeReport): void {
  const face = model.faces.find((f) => f.id === faceId);
  if (!face) return;
  const dropped = face.lineIds.filter((id) => !keepIds.includes(id));
  const idx = buildIndexes(model);
  const before = strictRing(face.lineIds, idx);
  const after = strictRing(keepIds, idx);
  if (before && after && Number.isFinite(face.areaSqft)) {
    const wasArea = ringArea(before);
    if (wasArea > 0) face.areaSqft = (face.areaSqft * ringArea(after)) / wasArea;
  }
  face.lineIds = keepIds;
  const stillReferenced = new Set<string>();
  for (const f of [...model.faces, ...model.penetrations]) {
    for (const id of f.lineIds) stillReferenced.add(id);
  }
  const orphaned = new Set(dropped.filter((id) => !stillReferenced.has(id)));
  if (orphaned.size) model.lines = model.lines.filter((l) => !orphaned.has(l.id));
  report.ringsRepaired++;
}

/** A SPIKE is a ring vertex the boundary walks out to and straight back from:
 *  the turn at it is close to 180° over a short leg. It is not a corner of any
 *  roof — it is what is left when a weld or a split leaves a stub — and it reads
 *  on the drawing as the zigzag the owner reported. Returns the index to drop. */
function firstSpike(ring: RoofPoint[]): number | null {
  const n = ring.length;
  if (n < 4) return null;
  for (let i = 0; i < n; i++) {
    const a = ring[(i - 1 + n) % n];
    const b = ring[i];
    const c = ring[(i + 1) % n];
    const l1 = dist2d(a, b);
    const l2 = dist2d(b, c);
    if (Math.min(l1, l2) > SPIKE_MAX_LEG_FT) continue;
    const t1 = Math.atan2(b.y - a.y, b.x - a.x);
    const t2 = Math.atan2(c.y - b.y, c.x - b.x);
    let turn = ((t2 - t1) * 180) / Math.PI;
    while (turn > 180) turn -= 360;
    while (turn < -180) turn += 360;
    if (Math.abs(turn) >= SPIKE_MIN_TURN_DEG) return i;
  }
  return null;
}

/** Drop a spike vertex by welding it onto whichever neighbour is closer. */
function removeSpike(model: RoofModel, ring: RoofPoint[], at: number): boolean {
  const n = ring.length;
  const b = ring[at];
  const a = ring[(at - 1 + n) % n];
  const c = ring[(at + 1) % n];
  const keep = dist2d(a, b) <= dist2d(b, c) ? a : c;
  if (keep.id === b.id) return false;
  weldPoints(model, keep, b);
  return true;
}

/** Re-enqueue every OTHER face whose ring touches the point a weld just moved. */
function enqueueTouching(model: RoofModel, queue: string[], fid: string, keepId: string): void {
  const touchedLines = new Set<string>();
  for (const l of model.lines) {
    if (l.aId === keepId || l.bId === keepId) touchedLines.add(l.id);
  }
  for (const f of model.faces) {
    if (f.id === fid) continue;
    if (!f.lineIds.some((id) => touchedLines.has(id))) continue;
    if (!queue.includes(f.id)) queue.push(f.id);
  }
}

function repairRings(model: RoofModel, report: PlanarizeReport): void {
  // Worklist: a weld moves a point that other rings may share, so every face
  // whose ring contains the moved point is re-enqueued and re-checked.
  const queue: string[] = model.faces.map((f) => f.id);
  const rounds = new Map<string, number>();
  while (queue.length) {
    const fid = queue.shift();
    if (fid === undefined) break;
    const round = rounds.get(fid) ?? 0;
    if (round >= 8) continue; // per-face repair budget — termination guard
    rounds.set(fid, round + 1);
    const face = model.faces.find((f) => f.id === fid);
    if (!face) continue; // already excluded
    // A splice can leave the same piece id twice in a ring; strictRing's
    // length check would then fail forever. Dedupe preserving order.
    face.lineIds = [...new Set(face.lineIds)];
    const idx = buildIndexes(model);
    const ring = strictRing(face.lineIds, idx);
    if (!ring) {
      // Not closable as it stands — try the loose-end weld before excluding.
      const keptId = round < 8 ? weldChainGap(model, face.lineIds, idx) : null;
      if (keptId !== null) {
        report.ringsRepaired++;
        enqueueTouching(model, queue, fid, keptId);
        queue.unshift(fid);
        continue;
      }
      // Unclosable chain — a torn patch must never reach the drawing.
      excludeFace(model, fid, report);
      continue;
    }
    // A pinched ring (one vertex visited twice) is two facets in one; cut it
    // apart before anything else — welding or excluding would lose real roof.
    const pinch = firstPinch(ring);
    if (pinch) {
      const outcome = splitPinchedFace(model, face, ring, pinch, idx);
      if (outcome && "newFaceId" in outcome) {
        report.ringsRepaired++;
        queue.unshift(outcome.newFaceId, fid);
        continue;
      }
      if (outcome && "keepIds" in outcome) {
        trimFaceTo(model, fid, outcome.keepIds, report);
        queue.unshift(fid);
        continue;
      }
      // Pinched beyond repair — a folded patch must never reach the drawing.
      excludeFace(model, fid, report);
      continue;
    }
    // A spike (the ring walks out and straight back) is the zigzag on the
    // drawing; weld it away before looking for crossings.
    const spike = firstSpike(ring);
    if (spike !== null && removeSpike(model, ring, spike)) {
      report.ringsRepaired++;
      queue.unshift(fid);
      continue;
    }
    const bad = firstSelfCrossing(ring);
    if (!bad) continue; // simple and closed — done
    // Weld the two nearest offending vertices (one from each crossing edge)
    // when they are < 1 ft apart; otherwise the ring is beyond local repair.
    const n = ring.length;
    const edgeA = [ring[bad.i], ring[(bad.i + 1) % n]];
    const edgeB = [ring[bad.j], ring[(bad.j + 1) % n]];
    let keep: RoofPoint | null = null;
    let drop: RoofPoint | null = null;
    let bestD = Infinity;
    for (const pa of edgeA) {
      for (const pb of edgeB) {
        if (pa.id === pb.id) continue;
        const d = dist2d(pa, pb);
        if (d < bestD) {
          bestD = d;
          keep = pa;
          drop = pb;
        }
      }
    }
    if (keep && drop && bestD < WELD_RING_FT) {
      weldPoints(model, keep, drop);
      report.ringsRepaired++;
      // Re-enqueue every OTHER face whose ring touches the moved point (drop
      // was retargeted onto keep, and keep itself moved to the midpoint) …
      enqueueTouching(model, queue, fid, keep.id);
      // … and re-check this ring first.
      queue.unshift(fid);
      continue;
    }
    excludeFace(model, fid, report);
  }
}

// ── P4: coverage holes (report only — filling them is synthesis's job) ───────

const HOLE_CELL_FT = 0.5;
const HOLE_MAX_CELLS = 1_000_000;

/**
 * Coverage per outline ring: each ring rasterises over its OWN bbox, so one
 * far-flung structure cannot blow the cell budget for everyone. A single ring
 * whose grid would exceed HOLE_MAX_CELLS sets report.holesUnmeasured instead
 * of silently contributing 0.
 */
function measureHoles(model: RoofModel, outlines: P2[][], report: PlanarizeReport): void {
  const rings = outlines
    .map((r) => r.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)))
    .filter((r) => r.length >= 3);
  if (!rings.length) return;
  const idx = buildIndexes(model);
  const facetRings: P2[][] = [];
  for (const f of model.faces) {
    const ring = strictRing(f.lineIds, idx);
    if (ring) facetRings.push(ring.map((p) => ({ x: p.x, y: p.y })));
  }
  let sqft = 0;
  for (const ring of rings) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of ring) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxY)) continue;
    const nx = Math.ceil((maxX - minX) / HOLE_CELL_FT);
    const ny = Math.ceil((maxY - minY) / HOLE_CELL_FT);
    if (nx <= 0 || ny <= 0) continue;
    if (nx * ny > HOLE_MAX_CELLS) {
      report.holesUnmeasured = true;
      continue;
    }
    let uncovered = 0;
    for (let gy = 0; gy < ny; gy++) {
      const cy = minY + (gy + 0.5) * HOLE_CELL_FT;
      for (let gx = 0; gx < nx; gx++) {
        const c = { x: minX + (gx + 0.5) * HOLE_CELL_FT, y: cy };
        if (!pointInRing(c, ring)) continue;
        let covered = false;
        for (const fr of facetRings) {
          if (pointInRing(c, fr)) {
            covered = true;
            break;
          }
        }
        if (!covered) uncovered++;
      }
    }
    sqft += uncovered * HOLE_CELL_FT * HOLE_CELL_FT;
  }
  report.holesSqft = sqft;
}

// ── P5: no dangling interior ends ────────────────────────────────────────────

function fixDanglingEnds(model: RoofModel, report: PlanarizeReport): void {
  const pts = pointMap(model);
  for (const l of model.lines) {
    if (!INTERIOR_TYPES.has(l.type)) continue;
    for (const [endId, otherId] of [
      [l.aId, l.bId],
      [l.bId, l.aId],
    ] as const) {
      const p = pts.get(endId);
      const o = pts.get(otherId);
      if (!finiteXY(p) || !finiteXY(o)) continue;
      // Attached by a shared point id?
      const shared = model.lines.some(
        (k) => k.id !== l.id && (k.aId === endId || k.bId === endId),
      );
      if (shared) continue;
      // Or resting on another line's interior within 0.75 ft?
      let minD = Infinity;
      for (const k of model.lines) {
        if (k.id === l.id) continue;
        const a = pts.get(k.aId);
        const b = pts.get(k.bId);
        if (!finiteXY(a) || !finiteXY(b)) continue;
        minD = Math.min(minD, distPointSeg(p, a, b));
      }
      if (minD <= DANGLE_FT) continue;
      // Dangling: extend/trim ALONG THE LINE'S OWN DIRECTION to the nearest
      // line within 3 ft; no candidate → leave it (never invent geometry).
      const u = unit(o, p);
      if (!u) continue;
      const lineLen = dist2d(o, p);
      let best: { t: number; x: number; y: number; z: number } | null = null;
      for (const k of model.lines) {
        if (k.id === l.id) continue;
        const a = pts.get(k.aId);
        const b = pts.get(k.bId);
        if (!finiteXY(a) || !finiteXY(b)) continue;
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const denom = u.x * vy - u.y * vx;
        if (!Number.isFinite(denom) || Math.abs(denom) < 1e-9) continue;
        // Solve p + t·u = a + s·v.
        const t = ((a.x - p.x) * vy - (a.y - p.y) * vx) / denom;
        const s = ((a.x - p.x) * u.y - (a.y - p.y) * u.x) / denom;
        if (!Number.isFinite(t) || !Number.isFinite(s)) continue;
        if (s < -1e-6 || s > 1 + 1e-6) continue; // foot must land on the segment
        if (Math.abs(t) > EXTEND_FT) continue; //  extend or trim, ≤ 3 ft
        if (t < -(lineLen - MIN_PIECE_FT)) continue; // never trim the line away
        if (!best || Math.abs(t) < Math.abs(best.t)) {
          const sc = Math.max(0, Math.min(1, s));
          const z =
            Number.isFinite(a.z) && Number.isFinite(b.z) ? a.z + (b.z - a.z) * sc : p.z;
          best = { t, x: p.x + u.x * t, y: p.y + u.y * t, z };
        }
      }
      if (!best) continue; // unfixable within 3 ft — left as-is by design
      p.x = best.x;
      p.y = best.y;
      p.z = best.z;
      report.danglingFixed++;
    }
  }
}

// ── entry point ──────────────────────────────────────────────────────────────

function deepCopy(input: RoofModel): RoofModel {
  return {
    ...input,
    points: input.points.map((p) => ({ ...p })),
    lines: input.lines.map((l) => ({ ...l })),
    faces: input.faces.map((f) => ({ ...f, lineIds: [...f.lineIds] })),
    penetrations: input.penetrations.map((f) => ({ ...f, lineIds: [...f.lineIds] })),
    totals: {
      ...input.totals,
      footageByType: { ...input.totals.footageByType },
      bounds: { ...input.totals.bounds },
    },
  };
}

/**
 * Enforce the hard drawing invariants (spec §5 P1–P5) on a deep copy of the
 * model. Totals are NOT recomputed here: split pieces carry proportional
 * shares of the original lengthFt, so printed figures are preserved and
 * calibration k still applies exactly once downstream.
 */
export function planarizeModel(
  input: RoofModel,
  opts?: {
    outlines?: Array<Array<{ x: number; y: number }>>;
    /** The eave overhang the caller MEASURED on this house (feet). Widens P2's
     *  clip tolerance to max(OUTLINE_TOL_FT, overhangFt + 0.5) so a deliberate
     *  overhang offset beyond 2.5 ft is not undone here. Optional, additive. */
    overhangFt?: number;
    /** Override P2's clip TARGET and tolerance (optional, additive): when set,
     *  endpoints clip to THESE rings at `toleranceFt` instead of `outlines` at
     *  the overhang-widened tolerance — for a caller that knows the drawn roof
     *  edge itself (the accepted vision-traced outline), where a tight band
     *  applies. `outlines` still drives P4 hole measurement unchanged. */
    clip?: { outlines: Array<Array<{ x: number; y: number }>>; toleranceFt: number };
  },
): { model: RoofModel; report: PlanarizeReport } {
  const model = deepCopy(input);
  const report: PlanarizeReport = {
    crossingsResolved: 0,
    clippedToOutline: 0,
    ringsRepaired: 0,
    facetsExcluded: 0,
    holesSqft: 0,
    holesUnmeasured: false,
    danglingFixed: 0,
  };
  const minter = makeMinter(model);
  const overhang = opts?.overhangFt;
  const clipTolFt =
    typeof overhang === "number" && Number.isFinite(overhang)
      ? Math.max(OUTLINE_TOL_FT, overhang + OVERHANG_MARGIN_FT)
      : OUTLINE_TOL_FT;
  const clipRings = opts?.clip?.outlines?.length ? opts.clip.outlines : opts?.outlines;
  const clipTol = opts?.clip?.outlines?.length ? opts.clip.toleranceFt : clipTolFt;
  resolveCrossings(model, report, minter); //                        P1
  if (clipRings?.length) clipToOutline(model, clipRings, report, clipTol); // P2
  repairRings(model, report); //                                     P3
  if (opts?.outlines?.length) measureHoles(model, opts.outlines, report); // P4
  fixDanglingEnds(model, report); //                                 P5
  // P3 welds and P5 end-moves shift points — one more P1 sweep so no
  // crossing introduced by those mutations survives into the drawing.
  resolveCrossings(model, report, minter);
  // …and the sweep itself splits lines, which can leave a ring pinched or
  // crossed that P3 had already cleared (measured on 12629 NE 100th Pl: facet
  // B2 came out of the last sweep with edges 1 and 3 crossing). P3 is cheap on
  // an already-clean model, so run it once more and let the invariants hold
  // for what is actually drawn, not for an intermediate state.
  repairRings(model, report);
  return { model, report };
}
