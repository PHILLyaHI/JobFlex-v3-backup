// Roof diagram — SYNTHESIS (drawing-rules spec §6): BUILD the ideal drawing
// from the contract-grade Instant outline instead of repairing traced facets.
//
// Per structure outline: simplify (§6.1 — collinear < 8° with a 30° cumulative
// cap, drop segments < 1 ft, 4–64 vertices, CCW), run the straight skeleton
// (one facet per outline edge; ridges/hips/valleys ARE the skeleton by
// construction), lift z per vertex as perpendicular distance to the generating
// edge × dominantPitch/12, then:
//
//   • lines — outline edges typed EAVE (level); skeleton arcs typed by PLANE
//     GEOMETRY: a level arc → RIDGE; for a sloped arc, z is sampled 0.5 ft
//     perpendicular on each side of the arc midpoint from that side's facet
//     plane (z = perp distance to its generating edge × rise) — both sides
//     lower than the arc midpoint → HIP, both higher → VALLEY, mixed →
//     the sign of the larger deviation decides. A shared arc is ONE RoofLine
//     referenced by both faces' lineIds — watertight by construction;
//   • gable conversion (§6.3) — an outline edge ≥ 50 % covered by recon RAKE
//     lines whose skeleton facet is a triangle is a gable end: the triangle
//     is dissolved, the crease SHARED by its two neighbour facets at the apex
//     (the intersection line of their planes, whatever its classified type)
//     is extended to the wall edge with z linear along the crease — M then
//     lies on BOTH neighbour planes, the wall's two halves become RAKEs and
//     the neighbours absorb the triangle (rings spliced). Every splice is
//     verified — both rings must stay simple with a least-squares planarity
//     residual ≤ 0.5 ft — and is reverted (and counted in report.failed) on
//     failure. When the shared crease misses the wall segment the neighbour
//     planes provably cannot absorb the triangle (an unequal-pitch gable end,
//     e.g. beside a wall jog): the gable is kept as TWO triangular half
//     facets — rakes to the wall midpoint, level ridge to the apex, planar by
//     construction — and noted in report.failed;
//   • unequal-pitch crease angles (§2) — after pitch labels, an interior
//     HIP/VALLEY whose two owner facets carry labels ≥ 1 rise/12 apart is
//     rotated in plan about its LOWER endpoint so its angle from the
//     shallower facet's eave becomes arctan(p_steep/p_shallow); the UPPER
//     endpoint slides along its single host line (the ridge or crease it
//     terminates on, whose carrier is unchanged) and its z is recomputed as
//     perpendicular distance to the reference facet's generating edge × the
//     dominant rise. Skipped (and counted) when the upper endpoint joins 3+
//     interior arcs or any non-interior line, the slide exceeds 6 ft, either
//     moved segment would properly cross another line, or a gable half owns
//     the crease;
//   • pitch labels (§6.4) — per facet from the recon facet containing its plan
//     centroid, quantised to `keptPitches` (calibrate's kept set) when given,
//     else to the recon's own kept set; labels within 1.5 of `forcePitch` are
//     pulled onto it, mirroring calibrate's quantisation. Fallback
//     instantPitch ?? dominant. areaSqft = plan area × √(1+(p/12)²).
//
// Ids use parseRoofModel's convention: "s{i}:" prefixes when there is more
// than one structure. Synthesis failing never blocks the pipeline — a
// structure whose outline cannot be simplified or whose skeleton is null is
// recorded in report.failed; all structures failing returns null.
//
// Pure and client-safe: no I/O, no side effects, inputs never mutated.

import type { EvLineType, RoofFace, RoofLine, RoofModel, RoofPoint } from "@/lib/eagleview";
import { EV_LINE_TYPES } from "@/lib/eagleview";
import { straightSkeleton } from "@/lib/roofDiagram/skeleton";

export interface SynthesizeInput {
  /** Structure outline rings in the model frame (feet, x east, y north). */
  outlines: Array<Array<{ x: number; y: number }>>;
  /** Reconstructed model (refined or rectified) — gable evidence + pitch
   *  labels. The caller passes it ALREADY reclassified (EAVE vs RAKE
   *  recomputed from the facet gradients, as calibrate's reclassification
   *  does): the ≥ 50 % RAKE-coverage gable gate trusts `recon.lines` types
   *  as-is and performs no reclassification of its own. */
  recon: RoofModel | null;
  /** EagleView Instant predominant pitch (rise/12), when known. Used only
   *  when finite and > 0. */
  instantPitch: number | null;
  /** Calibrate's kept pitch set — when given (non-empty), facet labels snap
   *  onto it instead of the recon-derived set (mirrors calibrate's
   *  quantisation). */
  keptPitches?: number[];
  /** When given (finite, > 0), facet labels within 1.5 rise/12 of it are
   *  pulled onto it — a winning synthesized model cannot contradict the
   *  printed predominant pitch. */
  forcePitch?: number | null;
  /** Let the skeleton retry a degenerate outline under a deterministic
   *  sub-millimetre perturbation (skeleton.ts SkeletonOptions). Off by
   *  default so the old path is bit-for-bit unchanged; the V2 contour is
   *  regularised to exact right angles and needs it. */
  degenerateRetry?: boolean;
}

export interface SynthesizeReport {
  /** Structures successfully synthesized. */
  structures: number;
  gableEnds: number;
  facets: number;
  /** Unequal-pitch crease rotations applied (spec §2 — plan angle from the
   *  shallower facet's eave set to arctan(p_steep/p_shallow))… */
  creaseAnglesApplied: number;
  /** …and candidates skipped by the safety gates (3+-arc junction or
   *  non-interior line at the upper endpoint, slide > 6 ft, upper endpoint
   *  would land past the host's far end / on its far side or collapse onto
   *  either host endpoint, would properly cross another line, gable-half
   *  owner). */
  creaseAnglesSkipped: number;
  /** Per-structure failure notes ("structure 1: straight skeleton failed"),
   *  including gable conversions reverted by the post-splice verification. */
  failed: string[];
}

type P2 = { x: number; y: number };

// ── tunables (feet / degrees) ────────────────────────────────────────────────

/** Weld tolerance for skeleton vertices shared between facet rings (§2). */
const WELD_FT = 0.05;
/** Wider weld for INTERIOR skeleton nodes (both clearly above the eave, z >
 *  MICRO_WELD_MIN_Z). A regularized outline (the AI-traced roof edge snaps
 *  edges exactly onto the axis grid) makes near-tie skeleton events normal:
 *  measured on Prairie, the west wing's ridge start came out as TWO nodes
 *  0.1 ft apart joined by a stub arc, which turned the gable-end triangle
 *  into a quad and silently skipped the triangle-only gable conversion.
 *  Boundary vertices keep the tight WELD_FT — eave corners must never smear.
 *
 *  ABSOLUTE ON PURPOSE, and the attempt to make it relative is recorded here
 *  so it is not repeated (ROOF-DIAGNOSIS §K). The audit flagged it as an
 *  absolute tolerance on an object of variable length, correctly: welding a
 *  4.11 ft arc's endpoint by 0.238 ft turned it 2.28° and cost R12 on Seattle.
 *  Capping the tolerance at a share of the local arc length fixes exactly that
 *  — worst hip deviation 2.28° → 0.20° — and BREAKS TOPOLOGY: the sample fell
 *  from 32/33 to 30/33 with Euler −1/−2 and R07 on three contours.
 *
 *  Because this tolerance does two jobs. It must not rotate short arcs, and it
 *  must merge the near-tie skeleton nodes that a regularized outline produces
 *  by the dozen — the ones described above. Tightening it serves the first and
 *  defeats the second, and the second is what holds the roof together. The
 *  parameter is not where the fix lives; correcting the arc's DIRECTION after
 *  the weld, from the skeleton rather than from the moved endpoints, is. */
const INTERIOR_WELD_FT = 0.25;
const MICRO_WELD_MIN_Z = 0.5;
/** Interior arc whose endpoints agree in z within this is level → RIDGE. */
const LEVEL_EPS_FT = 0.1;
/**
 * …or whose slope (Δz / plan run) stays under this — a ridge between the
 * not-quite-parallel eaves of a simplified real outline (see classifier).
 *
 * Was 0.3, which is a 16.7° climb: we were calling a visibly sloped arc a
 * ridge. The validator's own levelness test uses 0.02 (INV_LEVEL_SLOPE), so
 * we were fifteen times more liberal than the rule we are judged by, and R11
 * — "the ridge is the top edge of both facets" — was being asked about lines
 * that are not ridges. Matched to the validator.
 */
const RIDGE_MAX_SLOPE = 0.02;
/** Outline segments shorter than this are dropped during simplification. */
const MIN_EDGE_FT = 1;
const COLLINEAR_DEG = 8;
const COLLINEAR_CUM_DEG = 30;
const MIN_VERTICES = 4;
/**
 * How many sides a contour may have and still be drawn. MEASURED, after 14
 * turned out to be a number nobody had checked: the spec asserted "inputs are
 * 4–14-gons" as a given, and the skeleton claimed "n ≤ 14 keeps every loop
 * small" with nothing behind it.
 *
 * The skeleton itself is correct to 383 vertices and fast to 255
 * (scripts/qa/roof/skeleton-limits.ts) — 25 contours from 7 to 127 sides, zero
 * failures, tiling exact to four decimals on every one, 18.6 ms at 127. So 14
 * was never protecting the algorithm from anything.
 *
 * 64 is set from the contours instead: the most complex real footprint in the
 * six-metro sample regularises to 52 sides, the next to 46, and 64 costs under
 * 2.5 ms. Past that a "contour" is a curved wall traced point by point, not a
 * building with corners, and the right answer is to refuse it.
 */
const MAX_VERTICES = 64;
/** Recon RAKE endpoints within this of an outline edge count toward gable coverage. */
const RAKE_GATE_FT = 5;
/** Share of an outline edge the recon RAKEs must cover to call it a gable end. */
const GABLE_COVERAGE = 0.5;
/** Pitch when neither Instant nor the recon offers one. */
const DEFAULT_PITCH = 6;
/** Recon pitches covering less than this share of the roof are noise (as calibrate). */
const PITCH_MIN_SHARE = 0.05;
const PITCH_MAX_KEPT = 3;
/** Labels within this (rise/12) of forcePitch are pulled onto it (as calibrate). */
const PITCH_FORCE_WINDOW = 1.5;
/** Plane-sampling step for hip/valley classification, feet. */
const SIDE_STEP_FT = 0.5;
/** Max least-squares planarity residual of a spliced gable neighbour ring. */
/** Steepest plane the synthesis may invent (rise/12). A residential roof at
 *  18/12 is already 56°; past that the "facet" is a wall, not a roof, so the
 *  gable conversion reverts to the hip it started from. */
const MAX_SYNTH_PITCH = 18;
const GABLE_PLANARITY_FT = 0.5;
/** Max plan slide of a crease's upper endpoint in the unequal-pitch pass. */
const CREASE_MAX_SLIDE_FT = 6;
/** Owner pitch labels closer than this (rise/12) keep the 45° convention. */
const CREASE_PITCH_DIFF_MIN = 1;

// ── small helpers ────────────────────────────────────────────────────────────

const pitchFactor = (pitch: number): number => Math.sqrt(1 + (pitch / 12) ** 2);
const dist2 = (a: P2, b: P2): number => Math.hypot(a.x - b.x, a.y - b.y);
const dist3 = (a: RoofPoint, b: RoofPoint): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function signedArea(ring: P2[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

const planArea = (ring: P2[]): number => Math.abs(signedArea(ring));

/** Area centroid of a simple polygon (vertex mean when degenerate). */
function ringCentroid(ring: P2[]): P2 {
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    const w = p.x * q.y - q.x * p.y;
    a2 += w;
    cx += (p.x + q.x) * w;
    cy += (p.y + q.y) * w;
  }
  if (Math.abs(a2) < 1e-9) {
    let mx = 0;
    let my = 0;
    for (const p of ring) {
      mx += p.x / ring.length;
      my += p.y / ring.length;
    }
    return { x: mx, y: my };
  }
  return { x: cx / (3 * a2), y: cy / (3 * a2) };
}

function pointInRing(p: P2, ring: P2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function distToSegment(p: P2, a: P2, b: P2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function emptyFootage(): Record<EvLineType, number> {
  return Object.fromEntries(EV_LINE_TYPES.map((t) => [t, 0])) as Record<EvLineType, number>;
}

const orient2 = (p: P2, q: P2, r: P2): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);

/** True when segments ab and cd properly cross (intersection interior to both). */
function properCross(a: P2, b: P2, c: P2, d: P2): boolean {
  const o1 = orient2(a, b, c);
  const o2 = orient2(a, b, d);
  const o3 = orient2(c, d, a);
  const o4 = orient2(c, d, b);
  return ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0));
}

/** No two non-adjacent ring edges properly cross (spec §5 P3). */
function ringIsSimple(ring: P2[]): boolean {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (properCross(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) return false;
    }
  }
  return true;
}

/** Max |residual| of the least-squares plane z = ax + by + c over the points.
 *  Infinity when the plan positions are degenerate (no unique fit). */
function planarityResidual(pts: RoofPoint[]): number {
  const m = pts.length;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  let sxz = 0;
  let syz = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
    sz += p.z;
    sxx += p.x * p.x;
    sxy += p.x * p.y;
    syy += p.y * p.y;
    sxz += p.x * p.z;
    syz += p.y * p.z;
  }
  // Normal equations [sxx sxy sx; sxy syy sy; sx sy m]·[a b c]ᵀ = [sxz syz sz]ᵀ.
  const det =
    sxx * (syy * m - sy * sy) - sxy * (sxy * m - sy * sx) + sx * (sxy * sy - syy * sx);
  if (Math.abs(det) < 1e-9) return Infinity;
  const a =
    (sxz * (syy * m - sy * sy) - sxy * (syz * m - sy * sz) + sx * (syz * sy - syy * sz)) / det;
  const b =
    (sxx * (syz * m - sy * sz) - sxz * (sxy * m - sy * sx) + sx * (sxy * sz - syz * sx)) / det;
  const c =
    (sxx * (syy * sz - syz * sy) - sxy * (sxy * sz - syz * sx) + sxz * (sxy * sy - syy * sx)) / det;
  let worst = 0;
  for (const p of pts) worst = Math.max(worst, Math.abs(a * p.x + b * p.y + c - p.z));
  return worst;
}

/** Order a face's lines head-to-tail into a closed ring of points — strict
 *  connectivity walk, null on any break (same contract as calibrate's local
 *  ringOf; duplicated so this module stays dependency-light). */
function chainRing(
  lineIds: string[],
  linesById: Map<string, RoofLine>,
  pointsById: Map<string, RoofPoint>,
): RoofPoint[] | null {
  if (lineIds.length < 3) return null;
  const segs: RoofLine[] = [];
  for (const id of lineIds) {
    const l = linesById.get(id);
    if (!l) return null;
    segs.push(l);
  }
  const used = new Set<number>([0]);
  const ids: string[] = [segs[0].aId];
  let next = segs[0].bId;
  for (let i = 1; i < segs.length; i++) {
    ids.push(next);
    let found = -1;
    for (let j = 0; j < segs.length; j++) {
      if (used.has(j)) continue;
      if (segs[j].aId === next) {
        found = j;
        next = segs[j].bId;
      } else if (segs[j].bId === next) {
        found = j;
        next = segs[j].aId;
      } else {
        continue;
      }
      break;
    }
    if (found < 0) return null;
    used.add(found);
  }
  if (next !== segs[0].aId) return null;
  const pts: RoofPoint[] = [];
  for (const id of ids) {
    const p = pointsById.get(id);
    if (!p) return null;
    pts.push(p);
  }
  return pts;
}

// ── outline simplification (§6.1) ────────────────────────────────────────────

/** Absolute bend at v between the incoming and outgoing directions, degrees. */
function turnDeg(prev: P2, v: P2, next: P2): number {
  const a1 = Math.atan2(v.y - prev.y, v.x - prev.x);
  const a2 = Math.atan2(next.y - v.y, next.x - v.x);
  let d = ((a2 - a1) * 180) / Math.PI;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return Math.abs(d);
}

/** Merge collinear runs (< 8°, cumulative cap 30°), grouping from the sharpest
 *  corner so a wall digitised from its middle does not tear at the seam. */
function mergeCollinear(ring: P2[]): P2[] {
  const n = ring.length;
  let start = 0;
  let sharpest = -1;
  for (let i = 0; i < n; i++) {
    const t = turnDeg(ring[(i + n - 1) % n], ring[i], ring[(i + 1) % n]);
    if (t > sharpest) {
      sharpest = t;
      start = i;
    }
  }
  const kept: P2[] = [ring[start]];
  let cum = 0;
  for (let k = 1; k < n; k++) {
    const v = ring[(start + k) % n];
    const next = ring[(start + k + 1) % n];
    const t = turnDeg(kept[kept.length - 1], v, next);
    cum += t;
    if (t >= COLLINEAR_DEG || cum >= COLLINEAR_CUM_DEG) {
      kept.push(v);
      cum = 0;
    }
  }
  return kept.length >= 3 ? kept : ring;
}

/** Weld away edges shorter than 1 ft, replacing both endpoints with their
 *  midpoint, shortest edge first, never below the vertex floor. */
function dropShortEdges(ring: P2[]): P2[] {
  let out = ring;
  for (let guard = 0; guard < ring.length; guard++) {
    const n = out.length;
    if (n <= MIN_VERTICES) break;
    let idx = -1;
    let shortest = MIN_EDGE_FT;
    for (let i = 0; i < n; i++) {
      const len = dist2(out[i], out[(i + 1) % n]);
      if (len < shortest) {
        shortest = len;
        idx = i;
      }
    }
    if (idx < 0) break;
    const j = (idx + 1) % n;
    const mid = { x: (out[idx].x + out[j].x) / 2, y: (out[idx].y + out[j].y) / 2 };
    const next: P2[] = [];
    for (let i = 0; i < n; i++) {
      if (i === j) continue;
      next.push(i === idx ? mid : out[i]);
    }
    out = next;
  }
  return out;
}

/** §6.1: dedupe → CCW → collinear merge → short-edge weld → 4–64 vertices. */
function simplifyRing(raw: P2[]): P2[] | null {
  const ring: P2[] = [];
  for (const p of raw) {
    if (ring.length === 0 || dist2(ring[ring.length - 1], p) > 0.01) ring.push({ x: p.x, y: p.y });
  }
  while (ring.length > 1 && dist2(ring[0], ring[ring.length - 1]) <= 0.01) ring.pop();
  if (ring.length < 3) return null;
  if (signedArea(ring) < 0) ring.reverse();
  const simplified = dropShortEdges(mergeCollinear(ring));
  if (simplified.length < MIN_VERTICES || simplified.length > MAX_VERTICES) return null;
  if (signedArea(simplified) <= 0) return null;
  return simplified;
}

// ── recon-derived context (gable evidence + pitch labels) ────────────────────

interface ReconFaceRing {
  pitch: number;
  ring: P2[];
  area: number;
}

/** The recon's kept pitch set — same rule calibrate quantises with. */
function keptPitchesOf(recon: RoofModel): number[] {
  const areaByPitch = new Map<number, number>();
  let total = 0;
  for (const f of recon.faces) {
    const key = Math.round(f.pitch);
    areaByPitch.set(key, (areaByPitch.get(key) ?? 0) + f.areaSqft);
    total += f.areaSqft;
  }
  const ranked = [...areaByPitch.entries()].sort((a, b) => b[1] - a[1]);
  return ranked
    .filter(([, a], i) => i === 0 || a >= PITCH_MIN_SHARE * (total || 1))
    .slice(0, PITCH_MAX_KEPT)
    .map(([p]) => p);
}

function reconFaceRings(recon: RoofModel): ReconFaceRing[] {
  const linesById = new Map(recon.lines.map((l) => [l.id, l]));
  const pointsById = new Map(recon.points.map((p) => [p.id, p]));
  const out: ReconFaceRing[] = [];
  for (const f of recon.faces) {
    const ring = chainRing(f.lineIds, linesById, pointsById);
    if (!ring) continue;
    const plan = ring.map((p) => ({ x: p.x, y: p.y }));
    out.push({ pitch: f.pitch, ring: plan, area: planArea(plan) });
  }
  return out;
}

/** RAKE segments of the recon — the gable-evidence source. The model handed
 *  in is expected to be ALREADY reclassified (EAVE vs RAKE recomputed from
 *  the facet gradients by the caller — the wiring passes a reclassified
 *  clone); line types are trusted as-is, and the ≥ 50 % coverage gate in
 *  synthesizeStructure stays the only threshold. */
function rakeSegments(recon: RoofModel): Array<{ a: P2; b: P2 }> {
  const pointsById = new Map(recon.points.map((p) => [p.id, p]));
  const out: Array<{ a: P2; b: P2 }> = [];
  for (const l of recon.lines) {
    if (l.type !== "RAKE") continue;
    const a = pointsById.get(l.aId);
    const b = pointsById.get(l.bId);
    if (a && b) out.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } });
  }
  return out;
}

function snapTo(pitch: number, kept: number[]): number {
  if (kept.length === 0) return pitch;
  let best = kept[0];
  let bestD = Infinity;
  for (const k of kept) {
    const d = Math.abs(pitch - k);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

// ── per-structure synthesis ──────────────────────────────────────────────────

interface StructureFace {
  id: string;
  pitch: number;
  areaSqft: number;
  orientation: number;
  lineIds: string[];
}

interface StructureResult {
  points: RoofPoint[];
  lines: RoofLine[];
  faces: StructureFace[];
  gableEnds: number;
  /** Unequal-pitch crease rotations applied / skipped by the safety gates. */
  creaseApplied: number;
  creaseSkipped: number;
  /** Non-fatal per-structure notes (e.g. reverted gable conversions). */
  notes: string[];
}

function synthesizeStructure(
  outline: P2[],
  pfx: string,
  reconRings: ReconFaceRing[],
  reconKept: number[],
  reconRakes: Array<{ a: P2; b: P2 }>,
  dominantPitch: number,
  forcePitch: number | null,
  degenerateRetry: boolean,
): StructureResult | string {
  const poly = simplifyRing(outline);
  if (!poly) return `outline not simplifiable to ${MIN_VERTICES}–${MAX_VERTICES} CCW vertices`;
  const skel = straightSkeleton(poly, { degenerateRetry });
  if (!skel) return "straight skeleton failed";
  const n = poly.length;
  const rise = dominantPitch / 12;

  // Shared points, welded by plan position (< WELD_FT). z is set at creation:
  // perpendicular distance to the generating edge × rise — equidistance makes
  // the value identical whichever owner facet claims the point first.
  const points: RoofPoint[] = [];
  let pSeq = 0;
  const getPoint = (x: number, y: number, z: number): RoofPoint => {
    for (const p of points) {
      // Interior-vs-interior pairs weld at the wider tolerance (see
      // INTERIOR_WELD_FT): near-tie skeleton events on a regularized outline
      // leave sub-¼-ft stub arcs that break the triangle-only gable gate.
      const tol = z > MICRO_WELD_MIN_Z && p.z > MICRO_WELD_MIN_Z ? INTERIOR_WELD_FT : WELD_FT;
      if (Math.hypot(p.x - x, p.y - y) <= tol) return p;
    }
    const p: RoofPoint = { id: `${pfx}P${++pSeq}`, x, y, z };
    points.push(p);
    return p;
  };

  const perpToEdge = (p: P2, i: number): number => {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return 0;
    return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
  };

  interface Facet {
    edgeIndex: number;
    pts: RoofPoint[];
  }
  const facets: Facet[] = [];
  for (const f of skel.facets) {
    const pts: RoofPoint[] = [];
    for (const v of f.ring) {
      const z = perpToEdge(v, f.edgeIndex) * rise;
      const p = getPoint(v.x, v.y, z);
      if (pts.length === 0 || pts[pts.length - 1].id !== p.id) pts.push(p);
    }
    while (pts.length > 1 && pts[0].id === pts[pts.length - 1].id) pts.pop();
    if (pts.length < 3) return `skeleton facet for edge ${f.edgeIndex} is degenerate`;
    facets.push({ edgeIndex: f.edgeIndex, pts });
  }
  if (facets.length === 0) return "skeleton produced no facets";

  // One RoofLine per undirected point pair — shared arcs are shared lines, so
  // the model is watertight by construction.
  let lSeq = 0;
  const lineByKey = new Map<string, RoofLine>();
  const ownersByKey = new Map<string, number[]>();
  const facetLineKeys: string[][] = facets.map(() => []);
  const keyOf = (a: RoofPoint, b: RoofPoint): string => (a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`);
  facets.forEach((f, fi) => {
    for (let i = 0; i < f.pts.length; i++) {
      const a = f.pts[i];
      const b = f.pts[(i + 1) % f.pts.length];
      const key = keyOf(a, b);
      if (!lineByKey.has(key)) {
        lineByKey.set(key, { id: `${pfx}L${++lSeq}`, type: "OTHER", aId: a.id, bId: b.id, lengthFt: dist3(a, b) });
        ownersByKey.set(key, []);
      }
      const owners = ownersByKey.get(key);
      if (owners) owners.push(fi);
      facetLineKeys[fi].push(key);
    }
  });

  // Classification (§6.2): boundary → EAVE (level, z = 0 both ends);
  // interior level arc → RIDGE. A sloped interior arc is classified by PLANE
  // GEOMETRY, not edge adjacency: sample z a small step perpendicular on each
  // side of the arc midpoint from that side's facet plane (z = perp distance
  // to its generating edge × rise). Both sides lower than the arc midpoint →
  // HIP, both higher → VALLEY; mixed/ambiguous → the sign of the larger
  // deviation decides (the arc is sloped, so RIDGE is off the table).
  const pointById = new Map(points.map((p) => [p.id, p]));
  const facetPlans: P2[][] = facets.map((f) => f.pts.map((p) => ({ x: p.x, y: p.y })));
  for (const [key, line] of lineByKey) {
    const owners = ownersByKey.get(key) ?? [];
    const a = pointById.get(line.aId);
    const b = pointById.get(line.bId);
    if (!a || !b) continue;
    if (owners.length <= 1) {
      line.type = "EAVE";
      continue;
    }
    // Level = RELATIVE slope, not absolute Δz: a simplified real outline is
    // never perfectly parallel, so a genuine ridge between two almost-parallel
    // eaves carries Δz of 0.2–1.0 ft over its run (measured on the test house:
    // 0.23–0.99 ft — every ridge was mistyped HIP under a 0.1 ft absolute
    // test, R 0 in the shipped drawing). A hip/valley climbs at roughly the
    // roof pitch (≥ 0.5 rise/run at 10/12); 0.30 splits the two populations.
    {
      const planLen = Math.hypot(b.x - a.x, b.y - a.y);
      const dz = Math.abs(a.z - b.z);
      if (dz <= LEVEL_EPS_FT || (planLen > 1e-6 && dz / planLen <= RIDGE_MAX_SLOPE)) {
        line.type = "RIDGE";
        continue;
      }
    }
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const midZ = (a.z + b.z) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    const px = -dy / len;
    const py = dx / len;
    /** z of the owner's plane a step into that owner, minus the arc mid z. */
    const deviationOf = (fi: number): number => {
      const ring = facetPlans[fi];
      const plus = { x: mid.x + SIDE_STEP_FT * px, y: mid.y + SIDE_STEP_FT * py };
      const minus = { x: mid.x - SIDE_STEP_FT * px, y: mid.y - SIDE_STEP_FT * py };
      let sample: P2;
      if (pointInRing(plus, ring)) sample = plus;
      else if (pointInRing(minus, ring)) sample = minus;
      else {
        // Facet thinner than the step: sample toward its centroid instead.
        const c = ringCentroid(ring);
        const vlen = Math.hypot(c.x - mid.x, c.y - mid.y);
        sample =
          vlen < 1e-9
            ? c
            : {
                x: mid.x + (SIDE_STEP_FT * (c.x - mid.x)) / vlen,
                y: mid.y + (SIDE_STEP_FT * (c.y - mid.y)) / vlen,
              };
      }
      return perpToEdge(sample, facets[fi].edgeIndex) * rise - midZ;
    };
    const d1 = deviationOf(owners[0]);
    const d2 = deviationOf(owners[1]);
    if (d1 < 0 && d2 < 0) line.type = "HIP";
    else if (d1 > 0 && d2 > 0) line.type = "VALLEY";
    else line.type = (Math.abs(d1) >= Math.abs(d2) ? d1 : d2) < 0 ? "HIP" : "VALLEY";
  }

  // ── gable conversion (§6.3) ──
  const coverageOf = (i: number): number => {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return 0;
    const ux = dx / len;
    const uy = dy / len;
    const intervals: Array<[number, number]> = [];
    for (const s of reconRakes) {
      if (distToSegment(s.a, a, b) > RAKE_GATE_FT || distToSegment(s.b, a, b) > RAKE_GATE_FT) continue;
      const t0 = (s.a.x - a.x) * ux + (s.a.y - a.y) * uy;
      const t1 = (s.b.x - a.x) * ux + (s.b.y - a.y) * uy;
      const lo = Math.max(0, Math.min(t0, t1));
      const hi = Math.min(len, Math.max(t0, t1));
      if (hi > lo) intervals.push([lo, hi]);
    }
    intervals.sort((p, q) => p[0] - q[0]);
    let covered = 0;
    let end = -Infinity;
    for (const [lo, hi] of intervals) {
      if (hi <= end) continue;
      covered += hi - Math.max(lo, end);
      end = Math.max(end, hi);
    }
    return covered / len;
  };

  let gableEnds = 0;
  const notes: string[] = [];
  const deadLineKeys = new Set<string>();
  const deadFacets = new Set<number>();
  /** Gable halves added by the split-halves fallback — they carry no true
   *  eave, so the crease-angle pass must not take a reference from them. */
  const syntheticFacets = new Set<number>();
  for (let fi = 0; fi < facets.length; fi++) {
    const f = facets[fi];
    if (deadFacets.has(fi) || f.pts.length !== 3) continue;
    if (reconRakes.length === 0 || coverageOf(f.edgeIndex) < GABLE_COVERAGE) continue;
    const keys = facetLineKeys[fi];
    if (keys.length !== 3 || keys.some((k) => deadLineKeys.has(k))) continue;
    const boundaryKey = keys.find((k) => (ownersByKey.get(k) ?? []).length === 1);
    if (!boundaryKey) continue;
    const sideKeys = keys.filter((k) => k !== boundaryKey);
    if (sideKeys.length !== 2) continue;
    const eave = lineByKey.get(boundaryKey);
    // Only a true boundary EAVE is a gable candidate — the split-halves
    // fallback leaves single-owner RAKEs that must never re-trigger here.
    if (!eave || eave.type !== "EAVE") continue;
    const A = pointById.get(eave.aId);
    const B = pointById.get(eave.bId);
    if (!A || !B) continue;
    const apex = f.pts.find((p) => p.id !== A.id && p.id !== B.id);
    if (!apex) continue;
    const neighbourOf = (k: string): number => {
      const owners = (ownersByKey.get(k) ?? []).filter((o) => o !== fi);
      return owners.length === 1 ? owners[0] : -1;
    };
    const touchesA = (k: string): boolean => {
      const l = lineByKey.get(k);
      return !!l && (l.aId === A.id || l.bId === A.id);
    };
    const sideA = sideKeys.find((k) => touchesA(k));
    const sideB = sideKeys.find((k) => !touchesA(k));
    if (!sideA || !sideB) continue;
    const nA = neighbourOf(sideA);
    const nB = neighbourOf(sideB);
    if (nA < 0 || nB < 0 || deadFacets.has(nA) || deadFacets.has(nB)) continue;

    // Ridge end M (§6.3): the crease SHARED by the two neighbour facets at
    // the apex is the intersection line of their planes — extending IT to
    // the wall, with z linear along the crease, puts M on BOTH neighbour
    // planes, so the spliced rings stay planar BY CONSTRUCTION. (Accepting
    // only RIDGE-typed arrivals was the root cause of the Prairie edge-0
    // revert: a gable beside a wall jog has a SLOPED arrival crease, typed
    // HIP, and the old wall-midpoint fallback with M.z = apex z sat ~6 ft
    // off both neighbour planes — the planarity check rightly bounced it.)
    const wx = B.x - A.x;
    const wy = B.y - A.y;
    const wallLen = Math.hypot(wx, wy);
    if (wallLen < 1e-9) continue;
    let sharedCrease: RoofLine | null = null;
    for (const k of facetLineKeys[nA]) {
      if (keys.includes(k) || deadLineKeys.has(k)) continue;
      const l = lineByKey.get(k);
      if (!l || (l.aId !== apex.id && l.bId !== apex.id)) continue;
      if ((ownersByKey.get(k) ?? []).includes(nB)) {
        sharedCrease = l;
        break;
      }
    }
    let M: RoofPoint | null = null;
    if (sharedCrease) {
      const other = pointById.get(sharedCrease.aId === apex.id ? sharedCrease.bId : sharedCrease.aId);
      if (other) {
        // apex + u·r = A + t·w, solved for t along the wall (Cramer).
        const rx = apex.x - other.x;
        const ry = apex.y - other.y;
        const det = rx * wy - ry * wx;
        if (Math.abs(det) > 1e-9) {
          const t = (rx * (apex.y - A.y) - ry * (apex.x - A.x)) / det;
          // Keep M strictly inside the wall so it cannot weld onto A or B.
          if (t * wallLen > 2 * WELD_FT && (1 - t) * wallLen > 2 * WELD_FT) {
            const mx = A.x + t * wx;
            const my = A.y + t * wy;
            const r2 = rx * rx + ry * ry;
            const u = r2 < 1e-12 ? 0 : ((mx - apex.x) * rx + (my - apex.y) * ry) / r2;
            const cand = getPoint(mx, my, apex.z + u * (apex.z - other.z));
            if (cand.id !== A.id && cand.id !== B.id && cand.id !== apex.id) {
              pointById.set(cand.id, cand);
              M = cand;
            }
          }
        }
      }
    }
    const createdKeys: string[] = [];
    const mkLine = (aP: RoofPoint, bP: RoofPoint, type: EvLineType): string => {
      const key = keyOf(aP, bP);
      if (!lineByKey.has(key)) {
        lineByKey.set(key, { id: `${pfx}L${++lSeq}`, type, aId: aP.id, bId: bP.id, lengthFt: dist3(aP, bP) });
        ownersByKey.set(key, []);
        createdKeys.push(key);
      }
      return key;
    };
    if (!M) {
      // The neighbours' planes provably cannot absorb this triangle: their
      // shared crease meets the wall's carrier line outside the segment (or
      // no shared crease exists at the apex). Measured case — Prairie's west
      // gable spans the wall plus a 4 ft jog and its south half is a steeper
      // plane (report facet I, 12/12): an unequal-pitch gable end the
      // equal-pitch splice cannot express, while the recon rakes still
      // demand the gable. KEEP the two halves as their own triangular facets
      // (planar by construction): the wall becomes two RAKEs meeting at its
      // midpoint (V3's mid-span convention), a level RIDGE runs M → apex,
      // and the triangle's hip/valley sides survive as the halves' borders.
      // The halves are only a roof when they READ as one. Placing M over the
      // wall midpoint at ridge height makes each half span the full rise over
      // half the wall's width, so on a short wall the "facet" comes out nearly
      // vertical — the gable's END WALL drawn as a roof plane (measured on 419
      // Prairie Ridge Ln: both halves fitted 41.5/12 ≈ 74° and stood up in the
      // 3D view as blades). A hip we can defend beats a plane no roof has, so
      // an implausible half reverts the conversion.
      const mx = (A.x + B.x) / 2;
      const my = (A.y + B.y) / 2;
      type XYZ = { x: number; y: number; z: number };
      const halfPitch = (p1: XYZ, p2: XYZ, p3: XYZ): number => {
        const ux = p2.x - p1.x, uy = p2.y - p1.y, uz = p2.z - p1.z;
        const vx = p3.x - p1.x, vy = p3.y - p1.y, vz = p3.z - p1.z;
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        if (!Number.isFinite(nz) || Math.abs(nz) < 1e-9) return Infinity;
        return (Math.hypot(nx, ny) / Math.abs(nz)) * 12;
      };
      const mPt = { x: mx, y: my, z: apex.z };
      const pitchA = halfPitch(A, mPt, apex);
      const pitchB = halfPitch(mPt, B, apex);
      if (!(pitchA <= MAX_SYNTH_PITCH) || !(pitchB <= MAX_SYNTH_PITCH)) {
        notes.push(
          `gable at outline edge ${f.edgeIndex} left as a hip (split halves would fit ${Math.min(pitchA, 99).toFixed(0)}/12 and ${Math.min(pitchB, 99).toFixed(0)}/12, over the ${MAX_SYNTH_PITCH}/12 ceiling)`,
        );
        continue;
      }
      const Mh = getPoint(mx, my, apex.z);
      if (Mh.id === A.id || Mh.id === B.id || Mh.id === apex.id) continue;
      pointById.set(Mh.id, Mh);
      const rakeAh = mkLine(A, Mh, "RAKE");
      const rakeBh = mkLine(Mh, B, "RAKE");
      const ridgeH = mkLine(apex, Mh, "RIDGE");
      const swapOwner = (key: string, from: number, to: number): void => {
        const owners = ownersByKey.get(key);
        const at = owners ? owners.indexOf(from) : -1;
        if (owners && at >= 0) owners[at] = to;
      };
      const idxA = facets.length;
      facets.push({ edgeIndex: f.edgeIndex, pts: [A, Mh, apex] });
      facetLineKeys.push([rakeAh, ridgeH, sideA]);
      syntheticFacets.add(idxA);
      const idxB = facets.length;
      facets.push({ edgeIndex: f.edgeIndex, pts: [Mh, B, apex] });
      facetLineKeys.push([rakeBh, sideB, ridgeH]);
      syntheticFacets.add(idxB);
      ownersByKey.get(rakeAh)?.push(idxA);
      ownersByKey.get(rakeBh)?.push(idxB);
      ownersByKey.get(ridgeH)?.push(idxA, idxB);
      swapOwner(sideA, fi, idxA);
      swapOwner(sideB, fi, idxB);
      deadFacets.add(fi);
      deadLineKeys.add(boundaryKey);
      notes.push(
        `gable at outline edge ${f.edgeIndex} kept as split halves (the neighbour planes' crease misses the wall — unequal-pitch gable end)`,
      );
      gableEnds++;
      continue;
    }
    const rakeA = mkLine(A, M, "RAKE");
    const rakeB = mkLine(M, B, "RAKE");
    const ridgeX = mkLine(apex, M, "RIDGE");
    const savedA = [...facetLineKeys[nA]];
    const savedB = [...facetLineKeys[nB]];
    const splice = (neigh: number, oldKey: string, repl: string[]): boolean => {
      const list = facetLineKeys[neigh];
      const at = list.indexOf(oldKey);
      if (at < 0) return false;
      list.splice(at, 1, ...repl);
      return true;
    };
    const spliced = splice(nA, sideA, [rakeA, ridgeX]) && splice(nB, sideB, [ridgeX, rakeB]);
    ownersByKey.get(rakeA)?.push(nA);
    ownersByKey.get(rakeB)?.push(nB);
    ownersByKey.get(ridgeX)?.push(nA, nB);
    const revert = (): void => {
      facetLineKeys[nA] = savedA;
      facetLineKeys[nB] = savedB;
      for (const [key, owner] of [
        [rakeA, nA],
        [rakeB, nB],
        [ridgeX, nA],
        [ridgeX, nB],
      ] as Array<[string, number]>) {
        const owners = ownersByKey.get(key);
        if (!owners) continue;
        const at = owners.indexOf(owner);
        if (at >= 0) owners.splice(at, 1);
      }
      for (const key of createdKeys) {
        lineByKey.delete(key);
        ownersByKey.delete(key);
      }
    };
    // Post-conversion verification: both spliced neighbour rings must stay
    // simple and within the least-squares planarity budget, else revert.
    const verifyNeighbour = (neigh: number): boolean => {
      const byId = new Map<string, RoofLine>();
      for (const l of lineByKey.values()) byId.set(l.id, l);
      const ids: string[] = [];
      for (const k of facetLineKeys[neigh]) {
        const l = lineByKey.get(k);
        if (!l) return false;
        ids.push(l.id);
      }
      const ring = chainRing(ids, byId, pointById);
      if (!ring) return false;
      if (!ringIsSimple(ring.map((p) => ({ x: p.x, y: p.y })))) return false;
      return planarityResidual(ring) <= GABLE_PLANARITY_FT;
    };
    if (!spliced || !verifyNeighbour(nA) || !verifyNeighbour(nB)) {
      revert();
      notes.push(`gable conversion at outline edge ${f.edgeIndex} reverted (spliced ring not simple/planar)`);
      continue;
    }
    deadFacets.add(fi);
    deadLineKeys.add(boundaryKey);
    deadLineKeys.add(sideA);
    deadLineKeys.add(sideB);
    gableEnds++;
  }

  // ── faces: pitch labels (§6.4), unequal-pitch creases (§2), areas ──
  const liveLines = [...lineByKey.entries()].filter(([k]) => !deadLineKeys.has(k)).map(([, l]) => l);
  const linesById = new Map(liveLines.map((l) => [l.id, l]));
  const orientationOf = (i: number): number => {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return 0;
    // Outward normal of a CCW ring edge is (dy, -dx); bearing from north.
    const deg = (Math.atan2(dy / len, -dx / len) * 180) / Math.PI;
    return (deg + 360) % 360;
  };
  interface FaceDraft {
    facetIdx: number;
    pitch: number;
    /** Live point references — the crease-angle pass moves points in place,
     *  so plan areas are computed only after it has run. */
    ring: RoofPoint[];
    lineIds: string[];
  }
  const drafts: FaceDraft[] = [];
  for (let fi = 0; fi < facets.length; fi++) {
    if (deadFacets.has(fi)) continue;
    const lineIds: string[] = [];
    for (const k of facetLineKeys[fi]) {
      const l = lineByKey.get(k);
      if (l && !deadLineKeys.has(k)) lineIds.push(l.id);
    }
    const ring = chainRing(lineIds, linesById, pointById);
    if (!ring) return `facet ring for edge ${facets[fi].edgeIndex} does not close`;
    const plan = ring.map((p) => ({ x: p.x, y: p.y }));
    const c = ringCentroid(plan);
    // Pitch from the recon facet containing the plan centroid (smallest
    // containing facet wins), quantised to the kept set; measured labels
    // within the force window of forcePitch are pulled onto it (#11, as
    // calibrate's quantisation).
    let measured = dominantPitch;
    let bestArea = Infinity;
    for (const rf of reconRings) {
      if (rf.area < bestArea && pointInRing(c, rf.ring)) {
        bestArea = rf.area;
        measured = rf.pitch;
      }
    }
    let pitch = bestArea < Infinity ? snapTo(measured, reconKept) : measured;
    if (forcePitch != null && Math.abs(measured - forcePitch) <= PITCH_FORCE_WINDOW) {
      pitch = forcePitch;
    }
    drafts.push({ facetIdx: fi, pitch, ring, lineIds });
  }
  if (drafts.length === 0) return "no facets survived";

  // ── unequal-pitch crease angles (spec §2) ── the unweighted skeleton draws
  // every crease on the 45° family; when the two owner facets carry label
  // pitches ≥ 1 rise/12 apart, the crease's true plan angle from the
  // SHALLOWER facet's eave is arctan(p_steep/p_shallow) — skewed toward the
  // shallower facet, which claims more plan width. The crease rotates about
  // its LOWER endpoint onto that angle; the UPPER endpoint slides along its
  // single host line (the host's carrier is unchanged; its endpoint just
  // moves along it, and must stay on the host's far endpoint's near side so
  // the host segment never reverses) and its z is recomputed as
  // perpendicular distance to the reference facet's generating edge × the
  // dominant rise — consistent only while the endpoint stays on that
  // segment, which the gates below guarantee.
  let creaseApplied = 0;
  let creaseSkipped = 0;
  {
    const isInterior = (t: EvLineType): boolean => t === "RIDGE" || t === "HIP" || t === "VALLEY";
    const ownersOfLine = new Map<string, number[]>();
    drafts.forEach((d, di) => {
      for (const id of d.lineIds) {
        const arr = ownersOfLine.get(id);
        if (arr) arr.push(di);
        else ownersOfLine.set(id, [di]);
      }
    });
    for (const crease of liveLines) {
      if (crease.type !== "HIP" && crease.type !== "VALLEY") continue;
      const owners = ownersOfLine.get(crease.id) ?? [];
      if (owners.length !== 2) continue;
      const d0 = drafts[owners[0]];
      const d1 = drafts[owners[1]];
      if (Math.abs(d0.pitch - d1.pitch) < CREASE_PITCH_DIFF_MIN) continue;
      if (syntheticFacets.has(d0.facetIdx) || syntheticFacets.has(d1.facetIdx)) {
        creaseSkipped++;
        continue;
      }
      // A = the shallower label: the crease's plan angle from A's eave is
      // arctan(pB/pA) ∈ [45°, 90°).
      const [dA, dB] = d0.pitch <= d1.pitch ? [d0, d1] : [d1, d0];
      const pa = pointById.get(crease.aId);
      const pb = pointById.get(crease.bId);
      if (!pa || !pb) continue;
      const lower = pa.z <= pb.z ? pa : pb;
      const upper = lower === pa ? pb : pa;
      const touching = liveLines.filter((l) => l.aId === upper.id || l.bId === upper.id);
      // The upper endpoint may slide only when it joins exactly this crease
      // plus ONE interior host (a ridge or another crease) and nothing else.
      if (touching.length !== 2 || touching.some((l) => !isInterior(l.type))) {
        creaseSkipped++;
        continue;
      }
      const host = touching[0].id === crease.id ? touching[1] : touching[0];
      const hostOther = pointById.get(host.aId === upper.id ? host.bId : host.aId);
      if (!hostOther) continue;
      const ea = poly[facets[dA.facetIdx].edgeIndex];
      const eb = poly[(facets[dA.facetIdx].edgeIndex + 1) % n];
      let ex = eb.x - ea.x;
      let ey = eb.y - ea.y;
      const eLen = Math.hypot(ex, ey);
      const dx = upper.x - lower.x;
      const dy = upper.y - lower.y;
      if (eLen < 1e-9 || Math.hypot(dx, dy) < 1e-9) continue;
      ex /= eLen;
      ey /= eLen;
      // Fold the eave direction into the crease's half-plane, then rotate by
      // the target angle on the crease's own side of the eave.
      if (ex * dx + ey * dy < 0) {
        ex = -ex;
        ey = -ey;
      }
      const theta = Math.atan2(ex * dy - ey * dx, ex * dx + ey * dy);
      const target = (theta < 0 ? -1 : 1) * Math.atan2(dB.pitch, dA.pitch);
      const nx = ex * Math.cos(target) - ey * Math.sin(target);
      const ny = ex * Math.sin(target) + ey * Math.cos(target);
      // lower + t·(nx,ny) meets the host's carrier line.
      const hx = upper.x - hostOther.x;
      const hy = upper.y - hostOther.y;
      const denom = nx * hy - ny * hx;
      if (Math.abs(denom) < 1e-9) {
        creaseSkipped++;
        continue;
      }
      const t = ((hostOther.x - lower.x) * hy - (hostOther.y - lower.y) * hx) / denom;
      const q = { x: lower.x + t * nx, y: lower.y + t * ny };
      // q must stay strictly on hostOther's upper side and within the host
      // segment (+ the allowed slide): past the far end — or reflected onto
      // hostOther's other side — the host segment reverses and both owner
      // rings fold into a collinear bowtie the strict-sign properCross sweep
      // below cannot see, with upper.z then extrapolated off both owner
      // planes. (hx,hy) is still upper₀−hostOther here — upper moves only
      // after every gate passes.
      const qFromHost = Math.hypot(q.x - hostOther.x, q.y - hostOther.y);
      const hostLen = Math.hypot(hx, hy);
      if (
        t <= 2 * WELD_FT ||
        Math.hypot(q.x - upper.x, q.y - upper.y) > CREASE_MAX_SLIDE_FT ||
        qFromHost <= 2 * WELD_FT ||
        (q.x - hostOther.x) * hx + (q.y - hostOther.y) * hy <= 0 ||
        qFromHost > hostLen + CREASE_MAX_SLIDE_FT
      ) {
        creaseSkipped++;
        continue;
      }
      // No new proper crossings from either moved segment (properCross is
      // interior-only, so segments meeting at shared endpoints stay legal).
      const lo = { x: lower.x, y: lower.y };
      const ho = { x: hostOther.x, y: hostOther.y };
      let crosses = false;
      for (const l of liveLines) {
        if (l.id === crease.id || l.id === host.id) continue;
        const la = pointById.get(l.aId);
        const lb = pointById.get(l.bId);
        if (!la || !lb) continue;
        if (properCross(lo, q, la, lb) || properCross(ho, q, la, lb)) {
          crosses = true;
          break;
        }
      }
      if (crosses) {
        creaseSkipped++;
        continue;
      }
      upper.x = q.x;
      upper.y = q.y;
      upper.z = perpToEdge(q, facets[dA.facetIdx].edgeIndex) * rise;
      crease.lengthFt = dist3(lower, upper);
      host.lengthFt = dist3(hostOther, upper);
      creaseApplied++;
    }
  }

  let fSeq = 0;
  const faces: StructureFace[] = drafts.map((d) => {
    const plan = d.ring.map((p) => ({ x: p.x, y: p.y }));
    return {
      id: `${pfx}F${++fSeq}`,
      pitch: d.pitch,
      areaSqft: planArea(plan) * pitchFactor(d.pitch),
      orientation: orientationOf(facets[d.facetIdx].edgeIndex),
      lineIds: d.lineIds,
    };
  });

  const usedPt = new Set<string>();
  for (const l of liveLines) {
    usedPt.add(l.aId);
    usedPt.add(l.bId);
  }
  return {
    points: points.filter((p) => usedPt.has(p.id)),
    lines: liveLines,
    faces,
    gableEnds,
    creaseApplied,
    creaseSkipped,
    notes,
  };
}

// ── public API ───────────────────────────────────────────────────────────────

/**
 * Synthesize a RoofModel from the Instant outlines (spec §6). Returns null
 * when every structure fails — synthesis never blocks the repair pipeline.
 */
export function synthesizeRoofModel(
  input: SynthesizeInput,
): { model: RoofModel; report: SynthesizeReport } | null {
  const { outlines, recon, instantPitch } = input;
  const failed: string[] = [];
  const reconPredominant =
    recon && Number.isFinite(recon.totals.predominantPitch) && recon.totals.predominantPitch > 0
      ? recon.totals.predominantPitch
      : null;
  // instantPitch is trusted only when finite and positive (#6).
  const instantOk =
    instantPitch != null && Number.isFinite(instantPitch) && instantPitch > 0 ? instantPitch : null;
  const dominantPitch = instantOk ?? reconPredominant ?? DEFAULT_PITCH;
  const forcePitch =
    input.forcePitch != null && Number.isFinite(input.forcePitch) && input.forcePitch > 0
      ? input.forcePitch
      : null;
  // Calibrate's kept set wins when given; forcePitch always belongs to the
  // snap set (calibrate prepends instantPitch the same way).
  const reconKept =
    input.keptPitches && input.keptPitches.length > 0
      ? [...input.keptPitches]
      : recon
        ? keptPitchesOf(recon)
        : [];
  if (forcePitch != null && !reconKept.includes(forcePitch)) reconKept.unshift(forcePitch);
  const reconRings = recon ? reconFaceRings(recon) : [];
  const reconRakes = recon ? rakeSegments(recon) : [];
  const multi = outlines.length > 1;

  const points: RoofPoint[] = [];
  const lines: RoofLine[] = [];
  const rawFaces: StructureFace[] = [];
  let structures = 0;
  let gableEnds = 0;
  let creaseAnglesApplied = 0;
  let creaseAnglesSkipped = 0;
  outlines.forEach((outline, si) => {
    const pfx = multi ? `s${si}:` : "";
    const res = synthesizeStructure(outline, pfx, reconRings, reconKept, reconRakes, dominantPitch, forcePitch, input.degenerateRetry === true);
    if (typeof res === "string") {
      failed.push(`structure ${si}: ${res}`);
      return;
    }
    structures++;
    gableEnds += res.gableEnds;
    creaseAnglesApplied += res.creaseApplied;
    creaseAnglesSkipped += res.creaseSkipped;
    for (const note of res.notes) failed.push(`structure ${si}: ${note}`);
    points.push(...res.points);
    lines.push(...res.lines);
    rawFaces.push(...res.faces);
  });
  if (structures === 0) return null;

  // Designators: recon-style letters, area ascending in groups of 9 (A1..A9,
  // B1..B9, ...) — EagleView's small→large lettering convention is not
  // required here.
  const order = rawFaces
    .map((_, i) => i)
    .sort((a, b) => rawFaces[a].areaSqft - rawFaces[b].areaSqft);
  const designators = new Array<string>(rawFaces.length);
  order.forEach((faceIdx, rank) => {
    designators[faceIdx] = `${String.fromCharCode(65 + Math.floor(rank / 9))}${(rank % 9) + 1}`;
  });
  const faces: RoofFace[] = rawFaces.map((f, i) => ({
    id: f.id,
    designator: designators[i],
    pitch: f.pitch,
    areaSqft: f.areaSqft,
    orientation: f.orientation,
    lineIds: f.lineIds,
  }));

  // Totals like calibrate: footage from the lines (each physical edge is ONE
  // line here, so a plain sum is already dedup'd), predominant pitch by area,
  // bounds always including the origin.
  const footage = emptyFootage();
  for (const l of lines) footage[l.type] += l.lengthFt;
  const areaSqft = faces.reduce((s, f) => s + f.areaSqft, 0);
  const areaByPitch = new Map<number, number>();
  for (const f of faces) areaByPitch.set(f.pitch, (areaByPitch.get(f.pitch) ?? 0) + f.areaSqft);
  let predominantPitch = dominantPitch;
  let best = -1;
  for (const [p, a] of areaByPitch) {
    if (a > best) {
      best = a;
      predominantPitch = p;
    }
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const zs = points.map((p) => p.z);

  const model: RoofModel = {
    source: "instant",
    location: {},
    northOrientation: 0,
    points,
    lines,
    faces,
    penetrations: [],
    totals: {
      areaSqft,
      squares: areaSqft / 100,
      facetCount: faces.length,
      predominantPitch,
      footageByType: footage,
      bounds: {
        minX: Math.min(...xs, 0),
        maxX: Math.max(...xs, 0),
        minY: Math.min(...ys, 0),
        maxY: Math.max(...ys, 0),
        minZ: Math.min(...zs, 0),
        maxZ: Math.max(...zs, 0),
      },
    },
  };
  return {
    model,
    report: { structures, gableEnds, facets: faces.length, creaseAnglesApplied, creaseAnglesSkipped, failed },
  };
}
