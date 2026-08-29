// Roof diagram — CONFORM: snap a repair candidate's OUTER EAVE/RAKE contour
// onto the accepted vision roof-edge ring, so the SHIPPED drawing is square
// whichever pipeline wins the selection gate. The synthesized candidate is
// BUILT from the ring (calibrate feeds it to the straight skeleton); the
// refined/rectified candidates keep the recon's traced perimeter, which the
// ring used to merely CLIP (planarize P2) — a clip slides endpoints along
// their own lines, it never straightens a wobbling chain (measured on the
// Kirkland row: 8/20 outer segments on the page grid while the accepted ring
// had all 16 edges exactly on its 88° axis). This pass moves the perimeter
// onto the ring:
//
//   1  OUTER contour = EAVE/RAKE lines whose midpoint, nudged NUDGE_FT
//      perpendicular, exits every chainable facet ring on at least one side —
//      the owner-side probe style planarize P1 uses for split pieces (and the
//      render judge uses for its angle histogram);
//   2  STRUCTURE GUARD: only connected components (faces linked by shared
//      line ids or coincident endpoints) whose facets' plan-sample majority
//      lies inside the ring dilated by GUARD_DILATE_FT are conformed. A
//      structure the ring never covered — Kirkland's garage sits WHOLLY
//      outside the traced main-house ring — is untouched bit-for-bit: its
//      facet areas, footage and position must survive (planarize P2's
//      referenced-line rule protects it from deletion; this guard protects it
//      from being dragged);
//   3  the accepted ring is first re-seated RIGIDLY onto the component's own
//      grid (rotated about the component centroid by the length-weighted mean
//      signed deviation of the outer edges from their nearest ring direction):
//      the recon grid routinely sits a few degrees off the traced ring's, and
//      snapping straight onto the ring would leave the drawing with TWO grids
//      — the conformed perimeter on the ring's, untouched structures (the
//      guard-skipped garage) and interior creases on the recon's — with the
//      layout's axis rotation squaring neither. Each outer vertex then moves
//      at most CONFORM_MAX_FT in plan; its z is RE-SOLVED on the owner
//      facets' pre-conform planes, so the vertex slides ALONG the roof
//      surface — freezing z while xy moves folds the facet out of plane
//      (measured: R03 planarity deviations to 5 ft, fitted pitch drifting to
//      11.4/12). Snapping is EDGE-first: every
//      outer edge adopts the aligned-ring segment it runs beside (within
//      CARRIER_ANG_DEG), its snap line being that carrier shifted to the
//      offset nearest the ring that the cap lets BOTH endpoints reach — o*=0,
//      the ring itself, whenever reachable — so an edge the ring's position
//      cannot claim is still squared, parallel at its honest offset, and
//      edges sharing a carrier segment share one line (the zigzag collapses
//      onto one carrier). A vertex where two non-parallel snap lines meet
//      moves to their intersection (the ring corner); a vertex on one snap
//      line projects onto it; a vertex with only carrier-less edges falls
//      back to the nearest ring boundary point. A carrier-less edge whose
//      endpoints project onto two ADJACENT ring segments — a corner-cut
//      chord — collapses onto the shared ring corner when both ends reach it,
//      and a carrier-less CONNECTOR between two snapped chains is squared by
//      sliding one endpoint along its own snap line onto the nearest ring
//      direction;
//   4  interior lines terminating on a moved vertex follow through the shared
//      point id; duplicate points coincident with a moved vertex move
//      identically; and points T-welded onto a moved edge's INTERIOR follow
//      the edge at their original parameter + perpendicular offset —
//      refine.ts's ridge-follower (WeldRecord) approach — so creases stay
//      attached to the perimeter they abut;
//   5  perimeter edges collapsed below SLIVER_FT weld out with their lengthFt
//      transferred to a surviving neighbour, and same-type perimeter
//      neighbours that now run straight through a free joint merge with their
//      lengths SUMMED — the printed footage stays the sum of the pieces
//      (planarize's proportional-length bookkeeping), though calibrate's
//      finisher re-measures every length downstream regardless. Before any of
//      this, PENDANT SUB-CYCLES are excised from the component's face rings:
//      a ring that revisits a vertex id carries a closed loop hanging off one
//      pinch vertex — a recon noise wedge that survives refine's sliver merge
//      (its duplicated edges hide the neighbour) and planarize P3 (no proper
//      crossing, the walk still chains) yet draws as a zigzag across a
//      coverage gap (measured: Kirkland's 20 ft eave triangle on face F7).
//      The MINOR side (≤ PENDANT_MAX_SHARE of the ring's run and
//      ≤ PENDANT_MAX_SQFT enclosed, single-owner lines only) is removed and
//      its lines drop with the same footage transfer;
//   6  HARD GUARDS, per component: no vertex (followers included) moves more
//      than the cap, and every face ring that chained simple + closed before
//      still does — ANY violation reverts the component wholesale and counts
//      it in report.reverted.
//
// Pure and client-safe: no I/O, the input model is never mutated (deep copy),
// every pass is at worst O(n²) in the line count (~200) and NaN-guarded.
// calibrate gates the RESULT separately (validator score vs the unconformed
// candidate, footage agreement vs the raw refined evidence) before shipping —
// this module only promises geometric sanity.

import type { EvLineType, RoofLine, RoofModel, RoofPoint } from "@/lib/eagleview";
import { buildIndexes, ringOf, type RoofIndexes } from "@/components/estimator/roof/roofGeometry";
import { isSimpleRing } from "@/lib/roofDiagram/refine";

export interface ConformReport {
  /** Components whose conform committed (guards held). */
  componentsConformed: number;
  /** Components the structure guard left untouched (outside the dilated ring). */
  componentsSkipped: number;
  /** Outer-contour vertices moved onto the ring (followers not counted). */
  vertsMoved: number;
  /** Largest single vertex move, feet (followers included), 2 decimals. */
  maxMoveFt: number;
  /** Components rolled back wholesale by a hard-guard violation. */
  reverted: number;
}

export interface ConformOptions {
  /** Hard cap on any vertex move, feet (default CONFORM_MAX_FT). */
  maxMoveFt?: number;
  /** Structure-guard dilation of the ring, feet (default GUARD_DILATE_FT). */
  guardDilateFt?: number;
  /** Harness hook: called with human-readable step/guard diagnostics. */
  onDebug?: (msg: string) => void;
}

type P2 = { x: number; y: number };

/** Hard cap on any vertex move — matches outlineVision's GATE_WALL_VERTEX_FT:
 *  the acceptance gates allow the traced ring to sit up to 4 ft from a wall
 *  vertex, so a perimeter within that band is the same physical edge. */
export const CONFORM_MAX_FT = 4;
/** Structure-guard dilation: a component majority-outside ring + this is a
 *  different structure and is never touched. */
const GUARD_DILATE_FT = 4;
/** An outer edge within this of a ring segment's direction rides that carrier
 *  (rectify's axis window — the same "near-grid" judgment). */
const CARRIER_ANG_DEG = 12;
/** A conformed perimeter edge shorter than this is welded out (planarize's
 *  MIN_PIECE_FT — the same "noise piece" threshold). */
const SLIVER_FT = 0.5;
/** Same-type neighbours merge when they run through the joint this straight. */
const MERGE_ANG_DEG = 0.75;
/** Distinct point objects at the same location move together (the compose
 *  dedupe's coincidence distance). */
const COINCIDE_FT = 0.05;
/** Points this close to a moved edge's interior are its T-welds and follow it
 *  (refine's WELD_FT). */
const FOLLOW_FT = 0.75;
/** Owner-side probe offset for the outer-contour test (the render judge's
 *  value; planarize P1 probes 0.1 ft for the finer split-piece question). */
const NUDGE_FT = 0.3;
/** Faces link into one connected component when endpoints sit this close. */
const COMPONENT_WELD_FT = 0.25;
/** A carrier-less edge collapses onto a shared ring corner only when it really
 *  cuts the corner — off BOTH flanking carriers by at least this. */
const CHORD_OFF_DEG = 10;
/** An edge takes a carrier only while its snap line sits within this of the
 *  ring itself. Beyond it the ring's POSITION does not claim the edge — the
 *  edge keeps its own grid-aligned direction instead of being relocated onto
 *  a parallel line deep inside/outside the roof. */
const O_STAR_MAX_FT = 1.5;
/** A pendant sub-cycle is excised only while it is clearly the minor side of
 *  its ring (share of the ring's total plan run) … */
const PENDANT_MAX_SHARE = 0.4;
/** … and encloses no more than refine's sliver bound (sq ft). */
const PENDANT_MAX_SQFT = 25;

const BOUNDARY_TYPES: ReadonlySet<EvLineType> = new Set<EvLineType>(["EAVE", "RAKE"]);

// ── small geometry helpers (module-local twins of refine/planarize's) ────────

const finiteXY = (p: RoofPoint | undefined): p is RoofPoint =>
  !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

const dist2d = (a: P2, b: P2): number => Math.hypot(b.x - a.x, b.y - a.y);

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

function unit(a: P2, b: P2): P2 | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < 1e-6) return null;
  return { x: dx / len, y: dy / len };
}

/** Undirected angle between two unit directions, folded to [0, 90] degrees. */
function angleBetweenDeg(u: P2, v: P2): number {
  const dot = Math.min(1, Math.abs(u.x * v.x + u.y * v.y));
  return (Math.acos(dot) * 180) / Math.PI;
}

/** Intersection of two infinite lines (point + unit direction); null when near-parallel. */
function lineIntersect(p: P2, u: P2, q: P2, v: P2): P2 | null {
  const denom = u.x * v.y - u.y * v.x;
  if (Math.abs(denom) < 1e-6) return null;
  const t = ((q.x - p.x) * v.y - (q.y - p.y) * v.x) / denom;
  const x = p.x + u.x * t;
  const y = p.y + u.y * t;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/** Least-squares plane z = a·x + b·y + c over 3D ring points (calibrate's
 *  planeGradient with the constant term kept); null when degenerate. */
function fitPlane(pts: RoofPoint[]): { a: number; b: number; c: number } | null {
  if (pts.length < 3) return null;
  let mx = 0;
  let my = 0;
  let mz = 0;
  for (const p of pts) {
    mx += p.x;
    my += p.y;
    mz += p.z;
  }
  mx /= pts.length;
  my /= pts.length;
  mz /= pts.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  let sxz = 0;
  let syz = 0;
  for (const p of pts) {
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
  if (!Number.isFinite(det) || Math.abs(det) < 1e-6) return null;
  const a = (sxz * syy - syz * sxy) / det;
  const b = (syz * sxx - sxz * sxy) / det;
  const c = mz - a * mx - b * my;
  return Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) ? { a, b, c } : null;
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

interface RingHit {
  x: number;
  y: number;
  d: number;
  /** Ring segment index the nearest boundary point lies on (i → i+1). */
  seg: number;
}

/** Nearest point on the closed ring boundary, with the segment it lies on. */
function projectOnRing(p: P2, ring: P2[]): RingHit {
  let best: RingHit = { x: p.x, y: p.y, d: Infinity, seg: 0 };
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len2 = ex * ex + ey * ey;
    const t = len2 < 1e-12 ? 0 : clamp01(((p.x - a.x) * ex + (p.y - a.y) * ey) / len2);
    const x = a.x + ex * t;
    const y = a.y + ey * t;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < best.d) best = { x, y, d, seg: i };
  }
  return best;
}

// ── model bookkeeping helpers ────────────────────────────────────────────────

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

function pointMap(model: RoofModel): Map<string, RoofPoint> {
  return new Map(model.points.map((p) => [p.id, p]));
}

/** Which ROOF faces reference each line id (penetrations excluded). */
function faceOwners(model: RoofModel): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const f of model.faces) {
    for (const id of f.lineIds) {
      const arr = out.get(id) ?? [];
      arr.push(f.id);
      out.set(id, arr);
    }
  }
  return out;
}

/**
 * ringOf, but strict (planarize's twin): null unless EVERY line id resolves,
 * the chain consumed every line, the walk closes, and every vertex is finite.
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

/** Replace `from` with `to` in a ring, collapsing the resulting run to one id
 *  (refine's twin). */
function replaceInRing(ids: string[], from: string, to: string): string[] {
  if (!ids.includes(from)) return ids;
  const mapped = ids.map((id) => (id === from ? to : id));
  const out: string[] = [];
  for (const id of mapped) {
    if (out.length && out[out.length - 1] === id) continue;
    out.push(id);
  }
  while (out.length > 1 && out[0] === out[out.length - 1]) out.pop();
  return out;
}

// ── connected components + structure guard ───────────────────────────────────

/** Union-find the faces into connected components: shared line ids, shared
 *  point ids, or endpoints within COMPONENT_WELD_FT (recon models duplicate a
 *  shared crease per facet with its own endpoints — coincidence is the honest
 *  connectivity test there). Returns groups of face ids. */
function faceComponents(model: RoofModel): string[][] {
  const n = model.faces.length;
  const parent = model.faces.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    parent[i] = r;
    return r;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  const byLine = new Map<string, number[]>();
  model.faces.forEach((f, fi) => {
    for (const id of f.lineIds) {
      const arr = byLine.get(id) ?? [];
      arr.push(fi);
      byLine.set(id, arr);
    }
  });
  for (const arr of byLine.values()) {
    for (let i = 1; i < arr.length; i++) union(arr[0], arr[i]);
  }
  const pts = pointMap(model);
  const linesById = new Map(model.lines.map((l) => [l.id, l]));
  const facePts: P2[][] = model.faces.map((f) => {
    const seen = new Set<string>();
    const out: P2[] = [];
    for (const id of f.lineIds) {
      const l = linesById.get(id);
      if (!l) continue;
      for (const pid of [l.aId, l.bId]) {
        if (seen.has(pid)) continue;
        seen.add(pid);
        const p = pts.get(pid);
        if (finiteXY(p)) out.push({ x: p.x, y: p.y });
      }
    }
    return out;
  });
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (find(i) === find(j)) continue;
      let linked = false;
      for (const a of facePts[i]) {
        for (const b of facePts[j]) {
          if (dist2d(a, b) <= COMPONENT_WELD_FT) {
            linked = true;
            break;
          }
        }
        if (linked) break;
      }
      if (linked) union(i, j);
    }
  }
  const byRoot = new Map<number, string[]>();
  model.faces.forEach((f, fi) => {
    const r = find(fi);
    const g = byRoot.get(r) ?? [];
    g.push(f.id);
    byRoot.set(r, g);
  });
  return [...byRoot.values()];
}

/** Plan samples of a face: strict-ring vertices + edge midpoints + a coarse
 *  interior grid (area must outvote perimeter), else its line endpoints. */
function facePlanSamples(f: { lineIds: string[] }, idx: RoofIndexes): P2[] {
  const ring = strictRing(f.lineIds, idx);
  if (!ring) {
    const seen = new Set<string>();
    const out: P2[] = [];
    for (const id of f.lineIds) {
      const l = idx.linesById.get(id);
      if (!l) continue;
      for (const pid of [l.aId, l.bId]) {
        if (seen.has(pid)) continue;
        seen.add(pid);
        const p = idx.pointsById.get(pid);
        if (finiteXY(p)) out.push({ x: p.x, y: p.y });
      }
    }
    return out;
  }
  const plan: P2[] = ring.map((p) => ({ x: p.x, y: p.y }));
  const out: P2[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < plan.length; i++) {
    const a = plan[i];
    const b = plan[(i + 1) % plan.length];
    out.push({ x: a.x, y: a.y }, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    minX = Math.min(minX, a.x);
    maxX = Math.max(maxX, a.x);
    minY = Math.min(minY, a.y);
    maxY = Math.max(maxY, a.y);
  }
  const step = Math.max(2, Math.max(maxX - minX, maxY - minY) / 8);
  for (let x = minX + step / 2; x < maxX; x += step) {
    for (let y = minY + step / 2; y < maxY; y += step) {
      if (pointInRing({ x, y }, plan)) out.push({ x, y });
    }
  }
  return out;
}

/** STRUCTURE GUARD: does the component's plan-sample majority lie inside the
 *  ring dilated by `dilateFt`? */
function componentInsideRing(
  model: RoofModel,
  faceIds: ReadonlySet<string>,
  ring: P2[],
  dilateFt: number,
  idx: RoofIndexes,
): boolean {
  let inside = 0;
  let total = 0;
  for (const f of model.faces) {
    if (!faceIds.has(f.id)) continue;
    for (const s of facePlanSamples(f, idx)) {
      total++;
      if (pointInRing(s, ring) || projectOnRing(s, ring).d <= dilateFt) inside++;
    }
  }
  return total > 0 && inside / total > 0.5;
}

// ── sliver weld + straight-through merge (step 5) ────────────────────────────

/** Drop `dead` lines, transferring each one's printed lengthFt to a surviving
 *  neighbour at its endpoints (same type first, else the longest) — planarize's
 *  the-total-is-the-sum-of-the-pieces bookkeeping, inverted for a removal. */
function dropLinesWithTransfer(work: RoofModel, dead: ReadonlySet<string>): void {
  if (!dead.size) return;
  const byLen = (p: RoofLine, q: RoofLine): number => q.lengthFt - p.lengthFt;
  for (const id of dead) {
    const l = work.lines.find((k) => k.id === id);
    if (!l || !Number.isFinite(l.lengthFt) || l.lengthFt <= 0) continue;
    const cands = work.lines.filter(
      (k) =>
        !dead.has(k.id) &&
        (k.aId === l.aId || k.bId === l.aId || k.aId === l.bId || k.bId === l.bId),
    );
    if (!cands.length) continue;
    const receiver = [...cands].filter((k) => k.type === l.type).sort(byLen)[0] ?? [...cands].sort(byLen)[0];
    receiver.lengthFt += l.lengthFt;
  }
  work.lines = work.lines.filter((k) => !dead.has(k.id));
  for (const list of [work.faces, work.penetrations]) {
    for (const f of list) f.lineIds = f.lineIds.filter((id) => !dead.has(id));
  }
}

/** Before welding a 0.1–0.5 ft perimeter step out, park BOTH its endpoints on
 *  the intersection of its two perimeter neighbours' directions (refine's
 *  chamfer-corner math), so the weld cannot tilt either neighbour off its
 *  snap line. Near-parallel neighbours, a runaway corner (> 1 ft from either
 *  endpoint) or an out-of-cap move keep the step — it is sub-foot and the
 *  drawing suppresses it anyway. */
function prepareCornerWeld(
  work: RoofModel,
  l: RoofLine,
  perimIds: ReadonlySet<string>,
  orig: Map<string, P2>,
  maxMove: number,
): boolean {
  const pm = pointMap(work);
  const a = pm.get(l.aId);
  const b = pm.get(l.bId);
  if (!finiteXY(a) || !finiteXY(b)) return false;
  const neighbourAt = (pid: string): RoofLine | null => {
    let best: RoofLine | null = null;
    let bestLen = -1;
    for (const k of work.lines) {
      if (k.id === l.id || !perimIds.has(k.id)) continue;
      if (k.aId !== pid && k.bId !== pid) continue;
      const p = pm.get(k.aId);
      const q = pm.get(k.bId);
      if (!finiteXY(p) || !finiteXY(q)) continue;
      const len = dist2d(p, q);
      if (len > bestLen) {
        bestLen = len;
        best = k;
      }
    }
    return best;
  };
  const nA = neighbourAt(l.aId);
  const nB = neighbourAt(l.bId);
  if (!nA || !nB || nA.id === nB.id) return false;
  const farA = pm.get(nA.aId === l.aId ? nA.bId : nA.aId);
  const farB = pm.get(nB.aId === l.bId ? nB.bId : nB.aId);
  if (!finiteXY(farA) || !finiteXY(farB)) return false;
  const uA = unit(farA, a);
  const uB = unit(farB, b);
  if (!uA || !uB) return false;
  const X = lineIntersect(farA, uA, farB, uB);
  if (!X) return false;
  if (dist2d(a, X) > 1 || dist2d(b, X) > 1) return false;
  for (const pid of [l.aId, l.bId]) {
    const o = orig.get(pid);
    if (o && dist2d(o, X) > maxMove + 1e-9) return false;
  }
  a.x = X.x;
  a.y = X.y;
  b.x = X.x;
  b.y = X.y;
  if (Number.isFinite(a.z) && Number.isFinite(b.z)) {
    const z = (a.z + b.z) / 2;
    a.z = z;
    b.z = z;
  }
  return true;
}

/** Weld out a perimeter edge that collapsed below SLIVER_FT: its endpoints
 *  merge (every reference retargets onto aId), the edge and anything the weld
 *  collapses drop with their lengthFt transferred. False = the weld would find
 *  no surviving neighbour to receive the footage; the sliver is left alone. */
function weldOutSliver(work: RoofModel, l: RoofLine): boolean {
  const degenerate = l.aId === l.bId;
  const dead = new Set<string>([l.id]);
  if (!degenerate) {
    // A twin spanning the same two points collapses with the weld too.
    for (const k of work.lines) {
      if (k.id === l.id) continue;
      if ((k.aId === l.aId && k.bId === l.bId) || (k.aId === l.bId && k.bId === l.aId)) dead.add(k.id);
    }
  }
  const hasReceiver = work.lines.some(
    (k) =>
      !dead.has(k.id) && (k.aId === l.aId || k.bId === l.aId || k.aId === l.bId || k.bId === l.bId),
  );
  if (!hasReceiver) return false;
  if (!degenerate) {
    const dropId = l.bId;
    for (const k of work.lines) {
      if (k.aId === dropId) k.aId = l.aId;
      if (k.bId === dropId) k.bId = l.aId;
    }
    work.points = work.points.filter((p) => p.id !== dropId);
    for (const k of work.lines) {
      if (!dead.has(k.id) && k.aId === k.bId) dead.add(k.id); // collapsed by the weld
    }
  }
  dropLinesWithTransfer(work, dead);
  return true;
}

/** Merge B into A when the two same-type perimeter edges share a free joint
 *  (no third line terminates there), belong to the same owner faces, and run
 *  straight through it (≤ MERGE_ANG_DEG). Printed length = sum (refine pass-3
 *  contract). */
function tryMergeStraightPair(
  work: RoofModel,
  A: RoofLine,
  B: RoofLine,
  owners: Map<string, string[]>,
): boolean {
  const shared = [A.aId, A.bId].filter((id) => id === B.aId || id === B.bId);
  if (shared.length !== 1) return false;
  const J = shared[0];
  const farA = A.aId === J ? A.bId : A.aId;
  const farB = B.aId === J ? B.bId : B.aId;
  if (farA === farB || farA === J || farB === J) return false;
  for (const k of work.lines) {
    if (k.id !== A.id && k.id !== B.id && (k.aId === J || k.bId === J)) return false;
  }
  const keyOf = (id: string): string => [...(owners.get(id) ?? [])].sort().join("|");
  if (keyOf(A.id) !== keyOf(B.id)) return false;
  const pm = pointMap(work);
  const pJ = pm.get(J);
  const pA = pm.get(farA);
  const pB = pm.get(farB);
  if (!finiteXY(pJ) || !finiteXY(pA) || !finiteXY(pB)) return false;
  const u = unit(pA, pJ);
  const v = unit(pJ, pB);
  if (!u || !v) return false;
  if (angleBetweenDeg(u, v) > MERGE_ANG_DEG) return false;
  A.aId = farA;
  A.bId = farB;
  A.lengthFt += B.lengthFt;
  work.lines = work.lines.filter((k) => k.id !== B.id);
  for (const list of [work.faces, work.penetrations]) {
    for (const f of list) f.lineIds = replaceInRing(f.lineIds, B.id, A.id);
  }
  const stillUsed = work.lines.some((k) => k.aId === J || k.bId === J);
  if (!stillUsed) work.points = work.points.filter((p) => p.id !== J);
  return true;
}

/** Excise pendant sub-cycles (header step 5) from the component's face rings.
 *  Returns how many loops were removed. Never touches multi-owner lines — a
 *  shared line's other ring must not tear. */
function excisePendantLoops(
  work: RoofModel,
  compFaces: ReadonlySet<string>,
  dbg?: (msg: string) => void,
): number {
  let excised = 0;
  for (const f of work.faces) {
    if (!compFaces.has(f.id)) continue;
    for (let sweep = 0; sweep < 4; sweep++) {
      const idx = buildIndexes(work);
      const ring = strictRing(f.lineIds, idx);
      if (!ring) break;
      const n = ring.length;
      let i0 = -1;
      let j0 = -1;
      const seen = new Map<string, number>();
      for (let i = 0; i < n; i++) {
        const prev = seen.get(ring[i].id);
        if (prev !== undefined) {
          i0 = prev;
          j0 = i;
          break;
        }
        seen.set(ring[i].id, i);
      }
      if (i0 < 0) break; // no revisit — the ring is pendant-free
      // Both sides of the pinch are cyclically contiguous closed loops; the
      // pendant is the MINOR one by plan run.
      const segLen = (k: number): number => dist2d(ring[k], ring[(k + 1) % n]);
      const sliceA: number[] = [];
      for (let k = i0; k < j0; k++) sliceA.push(k);
      const sliceB: number[] = [];
      for (let k = j0; k !== i0; k = (k + 1) % n) sliceB.push(k);
      const lenA = sliceA.reduce((s, k) => s + segLen(k), 0);
      const lenB = sliceB.reduce((s, k) => s + segLen(k), 0);
      const minor = lenA <= lenB ? sliceA : sliceB;
      const minorLen = Math.min(lenA, lenB);
      if (minorLen > PENDANT_MAX_SHARE * (lenA + lenB)) break;
      let area = 0;
      for (let m = 0; m < minor.length; m++) {
        const a = ring[minor[m]];
        const b = ring[minor[(m + 1) % minor.length]];
        area += a.x * b.y - b.x * a.y;
      }
      if (Math.abs(area) / 2 > PENDANT_MAX_SQFT) break;
      const cycleLines = new Set<string>();
      let ok = true;
      for (const k of minor) {
        const aId = ring[k].id;
        const bId = ring[(k + 1) % n].id;
        const l = f.lineIds
          .map((id) => idx.linesById.get(id))
          .find((c) => c && ((c.aId === aId && c.bId === bId) || (c.aId === bId && c.bId === aId)));
        if (!l) {
          ok = false;
          break;
        }
        cycleLines.add(l.id);
      }
      if (!ok || !cycleLines.size || cycleLines.size >= f.lineIds.length - 2) break;
      const owners = faceOwners(work);
      if ([...cycleLines].some((id) => (owners.get(id) ?? []).length > 1)) break;
      f.lineIds = f.lineIds.filter((id) => !cycleLines.has(id));
      dbg?.(
        `pendant loop excised from ${f.id}: ${[...cycleLines].join(",")} (${minorLen.toFixed(1)} ft, ${(Math.abs(area) / 2).toFixed(1)} sqft)`,
      );
      dropLinesWithTransfer(work, cycleLines);
      const usedPts = new Set<string>();
      for (const l of work.lines) {
        usedPts.add(l.aId);
        usedPts.add(l.bId);
      }
      work.points = work.points.filter((p) => usedPts.has(p.id));
      excised++;
    }
  }
  return excised;
}

// ── the per-component conform ────────────────────────────────────────────────

interface ComponentResult {
  vertsMoved: number;
  maxMoveFt: number;
  changed: boolean;
}

function conformComponent(
  work: RoofModel,
  compFaces: ReadonlySet<string>,
  ring: P2[],
  maxMove: number,
  dbg?: (msg: string) => void,
): ComponentResult | null {
  // Pendant excision first (header step 5), so every baseline below — the
  // simple-ring guard set, the facet plans behind the outer test — sees the
  // cleaned rings.
  const excised = excisePendantLoops(work, compFaces, dbg);
  const idx0 = buildIndexes(work);
  // Guard baseline: which face rings chain simple + closed BEFORE the pass.
  const preSimple = new Set<string>();
  const facetPlans: P2[][] = [];
  /** Pre-conform plane fit per face + point→face membership: the z re-solve
   *  below keeps every moved vertex ON the roof surface it belonged to. */
  const facePlane = new Map<string, { a: number; b: number; c: number }>();
  const facesAtPoint = new Map<string, string[]>();
  for (const f of work.faces) {
    const r = strictRing(f.lineIds, idx0);
    if (!r) continue;
    if (isSimpleRing(r)) preSimple.add(f.id);
    facetPlans.push(r.map((p) => ({ x: p.x, y: p.y })));
    const plane = fitPlane(r);
    if (plane) facePlane.set(f.id, plane);
    for (const p of r) {
      const arr = facesAtPoint.get(p.id) ?? [];
      arr.push(f.id);
      facesAtPoint.set(p.id, arr);
    }
  }
  const owners = faceOwners(work);
  const pts = pointMap(work);
  const isOuter = (a: P2, b: P2): boolean => {
    const u = unit(a, b);
    if (!u) return false;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const probes: P2[] = [
      { x: mid.x - u.y * NUDGE_FT, y: mid.y + u.x * NUDGE_FT },
      { x: mid.x + u.y * NUDGE_FT, y: mid.y - u.x * NUDGE_FT },
    ];
    return probes.some((pr) => !facetPlans.some((fr) => pointInRing(pr, fr)));
  };
  const perim: RoofLine[] = [];
  for (const l of work.lines) {
    if (!BOUNDARY_TYPES.has(l.type)) continue;
    const os = owners.get(l.id) ?? [];
    if (!os.length || !os.some((fid) => compFaces.has(fid))) continue;
    const a = pts.get(l.aId);
    const b = pts.get(l.bId);
    if (!finiteXY(a) || !finiteXY(b) || dist2d(a, b) < 1e-6) continue;
    if (isOuter(a, b)) perim.push(l);
  }
  if (!perim.length) return { vertsMoved: 0, maxMoveFt: 0, changed: excised > 0 };
  // Pre-snap positions — the frame every cap and follower parametrization
  // measures from.
  const orig = new Map<string, P2>();
  for (const p of work.points) if (finiteXY(p)) orig.set(p.id, { x: p.x, y: p.y });
  const compPointIds = new Set<string>();
  for (const l of work.lines) {
    const os = owners.get(l.id) ?? [];
    if (os.some((fid) => compFaces.has(fid))) {
      compPointIds.add(l.aId);
      compPointIds.add(l.bId);
    }
  }

  // ── grid alignment (header step 3): re-seat a WORKING COPY of the ring onto
  // the component's own grid about the component centroid. The component's
  // grid — the one grid of the whole drawing, shared with structures the
  // guard skips — never rotates; the perimeter straightens onto the re-seated
  // ring's carriers instead (a rigid ≤ ~2 ft re-seat, well inside the trace's
  // own 4 ft acceptance tolerance). ──
  let ringA = ring;
  {
    const ringDirs: P2[] = [];
    for (let i = 0; i < ring.length; i++) {
      const v = unit(ring[i], ring[(i + 1) % ring.length]);
      if (v) ringDirs.push(v);
    }
    let wSum = 0;
    let dSum = 0;
    for (const l of perim) {
      const a = pts.get(l.aId);
      const b = pts.get(l.bId);
      if (!finiteXY(a) || !finiteXY(b)) continue;
      const len = dist2d(a, b);
      if (len < 1) continue;
      const eDeg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      let best = Infinity;
      for (const v of ringDirs) {
        const rDeg = (Math.atan2(v.y, v.x) * 180) / Math.PI;
        const d = ((((eDeg - rDeg) % 180) + 270) % 180) - 90; // signed fold, (-90, 90]
        if (Math.abs(d) < Math.abs(best)) best = d;
      }
      if (Math.abs(best) <= CARRIER_ANG_DEG) {
        wSum += len;
        dSum += best * len;
      }
    }
    const meanDeg = wSum > 0 ? dSum / wSum : 0;
    if (Math.abs(meanDeg) >= 0.25) {
      let cx = 0;
      let cy = 0;
      let n = 0;
      for (const pid of compPointIds) {
        const p = orig.get(pid);
        if (!p) continue;
        cx += p.x;
        cy += p.y;
        n++;
      }
      if (n > 0) {
        cx /= n;
        cy /= n;
        const th = (meanDeg * Math.PI) / 180; // the ring turns TO the component grid
        const c = Math.cos(th);
        const s = Math.sin(th);
        ringA = ring.map((p) => ({
          x: cx + c * (p.x - cx) - s * (p.y - cy),
          y: cy + s * (p.x - cx) + c * (p.y - cy),
        }));
        dbg?.(`grid-align: ring re-seated ${meanDeg.toFixed(2)}° onto the component grid`);
      }
    }
  }

  // ── carriers (header step 3): each outer edge adopts the aligned-ring
  // segment it runs beside; its SNAP LINE is that carrier shifted to the
  // offset nearest the ring that the cap lets BOTH endpoints reach. ──
  const nRing = ringA.length;
  const segDirOf = (i: number): P2 | null => unit(ringA[i], ringA[(i + 1) % nRing]);
  const segLenOf = (i: number): number => dist2d(ringA[i], ringA[(i + 1) % nRing]);
  const segNormOf = (i: number): P2 | null => {
    const v = segDirOf(i);
    return v ? { x: -v.y, y: v.x } : null;
  };
  const offsetFrom = (p: P2, i: number): number => {
    const nrm = segNormOf(i);
    if (!nrm) return Infinity;
    return (p.x - ringA[i].x) * nrm.x + (p.y - ringA[i].y) * nrm.y;
  };
  const spanOverlap = (a: P2, b: P2, i: number): number => {
    const v = segDirOf(i);
    if (!v) return 0;
    const s0 = ringA[i];
    const L = segLenOf(i);
    const ta = (a.x - s0.x) * v.x + (a.y - s0.y) * v.y;
    const tb = (b.x - s0.x) * v.x + (b.y - s0.y) * v.y;
    return Math.min(Math.max(ta, tb), L) - Math.max(Math.min(ta, tb), 0);
  };
  interface CarrierPick {
    seg: number;
    /** Snap-line offset from the carrier segment (0 = the ring itself). */
    oStar: number;
  }
  const carrierOf = new Map<string, CarrierPick>();
  for (const l of perim) {
    const a = orig.get(l.aId);
    const b = orig.get(l.bId);
    if (!a || !b) continue;
    const u = unit(a, b);
    if (!u) continue;
    const edgeLen = dist2d(a, b);
    let best: CarrierPick | null = null;
    let bestScore = Infinity;
    for (let i = 0; i < nRing; i++) {
      const v = segDirOf(i);
      if (!v || angleBetweenDeg(u, v) > CARRIER_ANG_DEG) continue;
      const offA = offsetFrom(a, i);
      const offB = offsetFrom(b, i);
      // The edge must actually RUN BESIDE the segment it claims — without a
      // real span overlap a long eave can adopt a barely-related parallel
      // notch line 4 ft away and relocate wholesale (measured: Kirkland's
      // 28 ft east eave onto the 6 ft notch vertical), dragging every
      // neighbour with it. The bar scales with the EDGE's own length — but a
      // line already running within O_STAR_MAX_FT is beside the edge whatever
      // the span says (segment ENDS shift under the grid re-seat; measured:
      // the top wall's span slid ~1.2 ft and lost its own eave to a farther
      // notch line).
      const ov = spanOverlap(a, b, i);
      const meanOff = (Math.abs(offA) + Math.abs(offB)) / 2;
      if (meanOff > O_STAR_MAX_FT && ov < Math.max(0.5, 0.3 * edgeLen)) continue;
      const lo = Math.max(offA - maxMove, offB - maxMove);
      const hi = Math.min(offA + maxMove, offB + maxMove);
      if (!(lo <= hi)) continue; // no offset BOTH endpoints can reach
      const o = Math.min(hi, Math.max(lo, 0));
      if (Math.abs(o) > O_STAR_MAX_FT) continue; // the ring's position cannot claim this edge
      // Prefer landing ON the ring, then the smaller move.
      const score = Math.abs(o) + 0.01 * (Math.abs(offA - o) + Math.abs(offB - o));
      if (score < bestScore) {
        bestScore = score;
        best = { seg: i, oStar: o };
      }
    }
    if (best) carrierOf.set(l.id, best);
  }
  // One o* per carrier segment when a common offset is feasible for every
  // member edge — the zigzag pieces then land collinear on ONE line.
  {
    const bySeg = new Map<number, RoofLine[]>();
    for (const l of perim) {
      const cp = carrierOf.get(l.id);
      if (!cp) continue;
      const arr = bySeg.get(cp.seg) ?? [];
      arr.push(l);
      bySeg.set(cp.seg, arr);
    }
    for (const [seg, members] of bySeg) {
      if (members.length < 2) continue;
      let lo = -Infinity;
      let hi = Infinity;
      for (const l of members) {
        for (const pid of [l.aId, l.bId]) {
          const p = orig.get(pid);
          if (!p) continue;
          const off = offsetFrom(p, seg);
          lo = Math.max(lo, off - maxMove);
          hi = Math.min(hi, off + maxMove);
        }
      }
      if (!(lo <= hi)) continue;
      const o = Math.min(hi, Math.max(lo, 0));
      if (Math.abs(o) > O_STAR_MAX_FT) continue; // keep the per-edge picks
      for (const l of members) carrierOf.set(l.id, { seg, oStar: o });
    }
  }
  if (dbg) {
    for (const l of perim) {
      const cp = carrierOf.get(l.id);
      dbg(`  carrier ${l.id}: ${cp ? `seg${cp.seg} o*=${cp.oStar.toFixed(2)}` : "none"}`);
    }
  }
  const carrierLine = (cp: CarrierPick): { p0: P2; v: P2 } | null => {
    const v = segDirOf(cp.seg);
    const nrm = segNormOf(cp.seg);
    if (!v || !nrm) return null;
    return {
      p0: { x: ringA[cp.seg].x + nrm.x * cp.oStar, y: ringA[cp.seg].y + nrm.y * cp.oStar },
      v,
    };
  };
  const projectOnLine = (p: P2, ln: { p0: P2; v: P2 }): P2 => {
    const t = (p.x - ln.p0.x) * ln.v.x + (p.y - ln.p0.y) * ln.v.y;
    return { x: ln.p0.x + ln.v.x * t, y: ln.p0.y + ln.v.y * t };
  };

  // ── vertex targets: intersection of the incident snap lines (the corner)
  // when two non-parallel carriers meet; the longest edge's snap line
  // otherwise; nearest aligned-ring boundary only for vertices ALL of whose
  // edges are carrier-less (noise) — a vertex on a snap line is never dragged
  // off it by a raw boundary point. ──
  const linesAt = new Map<string, RoofLine[]>();
  for (const l of perim) {
    for (const pid of [l.aId, l.bId]) {
      const arr = linesAt.get(pid) ?? [];
      arr.push(l);
      linesAt.set(pid, arr);
    }
  }
  const targets = new Map<string, P2>();
  /** Accept a snap target only while the move stays under the cap. */
  const within = (pid: string, to: P2 | null): P2 | null => {
    if (!to) return null;
    const base = orig.get(pid);
    return base && dist2d(base, to) <= maxMove + 1e-9 ? to : null;
  };
  for (const [pid, ls] of linesAt) {
    const p = orig.get(pid);
    if (!p) continue;
    const withCarrier = ls
      .filter((l) => carrierOf.has(l.id))
      .sort((x, y) => {
        const lx = dist2d(orig.get(x.aId) ?? p, orig.get(x.bId) ?? p);
        const ly = dist2d(orig.get(y.aId) ?? p, orig.get(y.bId) ?? p);
        return ly - lx;
      });
    let target: P2 | null = null;
    if (withCarrier.length >= 1) {
      const cp1 = carrierOf.get(withCarrier[0].id) as CarrierPick;
      const ln1 = carrierLine(cp1);
      const other = withCarrier.find((l) => {
        const c = carrierOf.get(l.id) as CarrierPick;
        const u1 = segDirOf(cp1.seg);
        const u2 = segDirOf(c.seg);
        return c.seg !== cp1.seg && !!u1 && !!u2 && angleBetweenDeg(u1, u2) > 1;
      });
      if (other !== undefined && ln1) {
        const ln2 = carrierLine(carrierOf.get(other.id) as CarrierPick);
        if (ln2) target = within(pid, lineIntersect(ln1.p0, ln1.v, ln2.p0, ln2.v));
      }
      if (!target && ln1) target = within(pid, projectOnLine(p, ln1));
      if (!target) dbg?.(`  vertex ${pid}: carried ${withCarrier.map((k) => k.id).join("/")} but NO reachable target`);
    } else {
      const hit = projectOnRing(p, ringA);
      target = within(pid, { x: hit.x, y: hit.y });
    }
    if (target) targets.set(pid, target);
  }
  // Corner-cut chords: a carrier-less edge whose endpoints project onto two
  // ADJACENT ring segments collapses onto their shared corner when reachable.
  for (const l of perim) {
    if (carrierOf.has(l.id)) continue;
    const a = orig.get(l.aId);
    const b = orig.get(l.bId);
    if (!a || !b) continue;
    const ha = projectOnRing(a, ringA);
    const hb = projectOnRing(b, ringA);
    if (ha.seg === hb.seg) continue; // same carrier — snapping collinearizes it
    let corner = -1;
    if ((ha.seg + 1) % nRing === hb.seg) corner = hb.seg;
    else if ((hb.seg + 1) % nRing === ha.seg) corner = ha.seg;
    if (corner < 0) continue;
    const u = unit(a, b);
    const va = segDirOf(ha.seg);
    const vb = segDirOf(hb.seg);
    if (!u || !va || !vb) continue;
    if (angleBetweenDeg(u, va) < CHORD_OFF_DEG || angleBetweenDeg(u, vb) < CHORD_OFF_DEG) continue;
    const C = ringA[corner];
    if (!within(l.aId, C) || !within(l.bId, C)) continue;
    targets.set(l.aId, { x: C.x, y: C.y });
    targets.set(l.bId, { x: C.x, y: C.y });
  }
  // Connector squaring: a carrier-less edge joining two snapped chains often
  // ends up a hair off the grid because its endpoints ride two PARALLEL snap
  // lines at independent along-positions. Slide one endpoint ALONG its own
  // snap line — that edge stays collinear — until the connector runs exactly
  // on a ring direction.
  for (const l of perim) {
    if (carrierOf.has(l.id)) continue;
    const posOf = (pid: string): P2 | null => targets.get(pid) ?? orig.get(pid) ?? null;
    const a = posOf(l.aId);
    const b = posOf(l.bId);
    if (!a || !b) continue;
    const u = unit(a, b);
    if (!u) continue;
    let bestDir: P2 | null = null;
    let bestAng = Infinity;
    for (let i = 0; i < nRing; i++) {
      const v = segDirOf(i);
      if (!v) continue;
      const ang = angleBetweenDeg(u, v);
      if (ang < bestAng) {
        bestAng = ang;
        bestDir = v;
      }
    }
    if (!bestDir || bestAng > CARRIER_ANG_DEG || bestAng < 0.05) continue;
    let bestSlide: { pid: string; to: P2; slide: number } | null = null;
    for (const [pid, otherId] of [
      [l.aId, l.bId],
      [l.bId, l.aId],
    ] as const) {
      const anchor = posOf(otherId);
      const pos = posOf(pid);
      if (!anchor || !pos) continue;
      const carried = (linesAt.get(pid) ?? [])
        .filter((k) => k.id !== l.id && carrierOf.has(k.id))
        .sort((x, y) => {
          const lx = dist2d(orig.get(x.aId) ?? pos, orig.get(x.bId) ?? pos);
          const ly = dist2d(orig.get(y.aId) ?? pos, orig.get(y.bId) ?? pos);
          return ly - lx;
        })[0];
      if (!carried) continue;
      const ln = carrierLine(carrierOf.get(carried.id) as CarrierPick);
      if (!ln) continue;
      const X = lineIntersect(anchor, bestDir, ln.p0, ln.v);
      if (!X || !within(pid, X)) continue;
      const slide = dist2d(pos, X);
      if (slide > 2 || (bestSlide && slide >= bestSlide.slide)) continue;
      bestSlide = { pid, to: X, slide };
    }
    if (bestSlide) {
      dbg?.(`connector ${l.id}: slid ${bestSlide.pid} by ${bestSlide.slide.toFixed(2)} ft onto the grid`);
      targets.set(bestSlide.pid, bestSlide.to);
    }
  }

  dbg?.(`perimeter ${perim.length} outer EAVE/RAKE · carriers ${carrierOf.size} · targets ${targets.size}`);
  if (dbg) {
    for (const [pid, t] of targets) {
      const p = orig.get(pid);
      if (!p) continue;
      dbg(
        `  target ${pid} (${p.x.toFixed(1)},${p.y.toFixed(1)}) → (${t.x.toFixed(1)},${t.y.toFixed(1)}) · ${dist2d(p, t).toFixed(2)} ft`,
      );
    }
  }

  // ── apply (z preserved; the cap is a HARD guard) ──
  let vertsMoved = 0;
  let maxMoved = 0;
  const movedIds = new Set<string>();
  for (const [pid, t] of targets) {
    const p = pts.get(pid);
    if (!p) continue;
    const d = dist2d(p, t);
    if (d < 1e-9) continue;
    if (d > maxMove + 1e-9) {
      dbg?.(`REVERT: target for ${pid} is ${d.toFixed(2)} ft > cap`);
      return null;
    }
    p.x = t.x;
    p.y = t.y;
    movedIds.add(pid);
    vertsMoved++;
    maxMoved = Math.max(maxMoved, d);
  }
  if (!movedIds.size) return { vertsMoved: 0, maxMoveFt: 0, changed: false };

  // ── followers (step 4): coincident duplicates + T-welds on moved edges ──
  const primaryMoved = [...movedIds];
  for (const pid of compPointIds) {
    if (movedIds.has(pid)) continue;
    const q = pts.get(pid);
    const q0 = orig.get(pid);
    if (!q || !q0) continue;
    for (const mid of primaryMoved) {
      const m0 = orig.get(mid);
      const m = pts.get(mid);
      if (!m0 || !m) continue;
      if (dist2d(q0, m0) <= COINCIDE_FT) {
        q.x = m.x + (q0.x - m0.x);
        q.y = m.y + (q0.y - m0.y);
        movedIds.add(pid);
        break;
      }
    }
  }
  const followerTarget = new Map<string, { d: number; x: number; y: number }>();
  for (const l of perim) {
    if (!movedIds.has(l.aId) && !movedIds.has(l.bId)) continue;
    const A0 = orig.get(l.aId);
    const B0 = orig.get(l.bId);
    const A1 = pts.get(l.aId);
    const B1 = pts.get(l.bId);
    if (!A0 || !B0 || !finiteXY(A1) || !finiteXY(B1)) continue;
    const len0 = dist2d(A0, B0);
    if (len0 < 1e-6) continue;
    const u0 = unit(A0, B0);
    if (!u0) continue;
    const len1 = dist2d(A1, B1);
    const u1 = len1 > 1e-6 ? unit(A1, B1) ?? u0 : u0;
    for (const pid of compPointIds) {
      if (movedIds.has(pid) || pid === l.aId || pid === l.bId) continue;
      const q0 = orig.get(pid);
      if (!q0) continue;
      const t = clamp01(((q0.x - A0.x) * u0.x + (q0.y - A0.y) * u0.y) / len0);
      const fx = A0.x + u0.x * len0 * t;
      const fy = A0.y + u0.y * len0 * t;
      const d = Math.hypot(q0.x - fx, q0.y - fy);
      if (d > FOLLOW_FT) continue;
      const off = (q0.x - A0.x) * -u0.y + (q0.y - A0.y) * u0.x;
      const x = A1.x + u1.x * len1 * t + -u1.y * off;
      const y = A1.y + u1.y * len1 * t + u1.x * off;
      const prev = followerTarget.get(pid);
      if (!prev || d < prev.d) followerTarget.set(pid, { d, x, y });
    }
  }
  for (const [pid, ft] of followerTarget) {
    const q = pts.get(pid);
    const q0 = orig.get(pid);
    if (!q || !q0) continue;
    const move = dist2d(q0, { x: ft.x, y: ft.y });
    if (move > maxMove + 1e-9) {
      dbg?.(`REVERT: follower ${pid} would move ${move.toFixed(2)} ft > cap`);
      return null; // hard guard — revert the component
    }
    if (move < 1e-9) continue;
    q.x = ft.x;
    q.y = ft.y;
    movedIds.add(pid);
    maxMoved = Math.max(maxMoved, move);
  }

  // ── z re-solve (header step 3): every moved vertex slides ALONG its owner
  // facets' pre-conform planes — freezing z while xy moves folds the facet
  // out of plane and tanks validator planarity/pitch agreement. ──
  for (const pid of movedIds) {
    const p = pts.get(pid);
    if (!p || !finiteXY(p)) continue;
    const planes = (facesAtPoint.get(pid) ?? [])
      .map((fid) => facePlane.get(fid))
      .filter((pl): pl is { a: number; b: number; c: number } => !!pl);
    if (!planes.length) continue;
    let z = 0;
    for (const pl of planes) z += pl.a * p.x + pl.b * p.y + pl.c;
    z /= planes.length;
    if (Number.isFinite(z)) p.z = z;
  }

  // ── post-move id weld: distinct points driven onto the SAME location (chord
  // endpoints, corner-consensus targets) merge into one id, so no ring is left
  // holding duplicate-coordinate vertices; lines the weld collapses drop with
  // their lengthFt transferred. ──
  {
    const WELD_EPS = 1e-6;
    const moved = [...movedIds];
    const aliasTo = new Map<string, string>();
    const rootOf = (id: string): string => {
      let cur = id;
      while (aliasTo.has(cur)) cur = aliasTo.get(cur) as string;
      return cur;
    };
    for (let i = 0; i < moved.length; i++) {
      for (let j = i + 1; j < moved.length; j++) {
        const ra = rootOf(moved[i]);
        const rb = rootOf(moved[j]);
        if (ra === rb) continue;
        const pa = pts.get(ra);
        const pb = pts.get(rb);
        if (!finiteXY(pa) || !finiteXY(pb)) continue;
        if (dist2d(pa, pb) <= WELD_EPS) aliasTo.set(rb, ra);
      }
    }
    if (aliasTo.size) {
      for (const k of work.lines) {
        k.aId = rootOf(k.aId);
        k.bId = rootOf(k.bId);
      }
      work.points = work.points.filter((p) => !aliasTo.has(p.id));
      const dead = new Set<string>();
      for (const k of work.lines) if (k.aId === k.bId) dead.add(k.id);
      dropLinesWithTransfer(work, dead);
      dbg?.(`id-weld: ${aliasTo.size} coincident pairs merged · ${dead.size} collapsed lines dropped`);
    }
  }

  // ── step 5: weld out collapsed slivers, merge straight-through neighbours ──
  const perimIds = new Set(perim.map((l) => l.id));
  let cleaned = excised;
  for (let sweep = 0; sweep < 60; sweep++) {
    const pm = pointMap(work);
    let did = false;
    for (const l of work.lines) {
      if (!perimIds.has(l.id)) continue;
      const a = pm.get(l.aId);
      const b = pm.get(l.bId);
      const degenerate = l.aId === l.bId;
      if (!degenerate && (!finiteXY(a) || !finiteXY(b))) continue;
      const len = degenerate ? 0 : dist2d(a as P2, b as P2);
      if (len >= SLIVER_FT) continue;
      // A visible step (> 0.1 ft) must first be parked on its neighbours'
      // corner intersection — welding endpoints 0.1–0.5 ft apart directly
      // would drag a neighbour endpoint sideways and tilt it off its line.
      if (len > 0.1) {
        if (!prepareCornerWeld(work, l, perimIds, orig, maxMove)) continue;
        dbg?.(`corner-parked ${l.id} (${len.toFixed(2)} ft step) before its weld`);
      }
      if (weldOutSliver(work, l)) {
        dbg?.(`sliver-weld ${l.id} (${len.toFixed(2)} ft)`);
        did = true;
        cleaned++;
        break; // maps are stale — resweep
      }
    }
    if (did) continue;
    const owners2 = faceOwners(work);
    outer: for (const A of work.lines) {
      if (!perimIds.has(A.id)) continue;
      for (const B of work.lines) {
        if (B.id === A.id || !perimIds.has(B.id) || B.type !== A.type) continue;
        if (tryMergeStraightPair(work, A, B, owners2)) {
          dbg?.(`merged ${B.id} into ${A.id}`);
          did = true;
          cleaned++;
          break outer;
        }
      }
    }
    if (!did) break;
  }

  // ── hard guards: total displacement ≤ cap for EVERY vertex, and every ring
  // that chained simple + closed still does ──
  for (const p of work.points) {
    const pre = orig.get(p.id);
    if (!pre || !finiteXY(p)) continue;
    const d = dist2d(pre, p);
    if (d > maxMove + 1e-6) {
      dbg?.(`REVERT: vertex ${p.id} total displacement ${d.toFixed(2)} ft > cap`);
      return null;
    }
    maxMoved = Math.max(maxMoved, d);
  }
  const idx1 = buildIndexes(work);
  const simpleWhy = (r: RoofPoint[]): string => {
    for (let i = 0; i < r.length; i++) {
      for (let j = i + 1; j < r.length; j++) {
        if (r[i].id === r[j].id) return `duplicate vertex id ${r[i].id}`;
        if (Math.hypot(r[i].x - r[j].x, r[i].y - r[j].y) < 1e-6) {
          return `coincident verts ${r[i].id}/${r[j].id}`;
        }
      }
    }
    return "self-crossing";
  };
  for (const f of work.faces) {
    if (!preSimple.has(f.id)) continue;
    const r = strictRing(f.lineIds, idx1);
    if (!r || !isSimpleRing(r)) {
      dbg?.(
        `REVERT: face ${f.id} ring ${r ? `no longer simple (${simpleWhy(r)})` : "no longer chains closed"} · lines ${f.lineIds.join(",")}`,
      );
      return null;
    }
  }
  dbg?.(`committed: ${vertsMoved} verts moved (max ${maxMoved.toFixed(2)} ft) · ${cleaned} welds/merges`);
  return { vertsMoved, maxMoveFt: maxMoved, changed: vertsMoved > 0 || cleaned > 0 };
}

// ── entry point ──────────────────────────────────────────────────────────────

/**
 * Conform the model's outer EAVE/RAKE contour onto the accepted vision
 * roof-edge ring (drawing-frame feet — calibrate lands the raw trace with its
 * outline transform before calling). Components failing the structure guard
 * are untouched; components violating a hard guard are reverted wholesale.
 * Never mutates the input; `changed` says whether anything actually moved.
 */
export function conformPerimeterToRing(
  input: RoofModel,
  ringFt: Array<{ x: number; y: number }>,
  opts?: ConformOptions,
): { model: RoofModel; report: ConformReport; changed: boolean } {
  const report: ConformReport = {
    componentsConformed: 0,
    componentsSkipped: 0,
    vertsMoved: 0,
    maxMoveFt: 0,
    reverted: 0,
  };
  let model = deepCopy(input);
  const ring = (ringFt ?? [])
    .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p) => ({ x: p.x, y: p.y }));
  if (ring.length < 3 || model.faces.length === 0) return { model, report, changed: false };
  const maxMove = opts?.maxMoveFt ?? CONFORM_MAX_FT;
  const dilate = opts?.guardDilateFt ?? GUARD_DILATE_FT;
  let changed = false;
  for (const comp of faceComponents(model)) {
    const compSet = new Set(comp);
    const idx = buildIndexes(model);
    if (!componentInsideRing(model, compSet, ring, dilate, idx)) {
      opts?.onDebug?.(`component [${comp.join(",")}] outside the dilated ring — skipped`);
      report.componentsSkipped++;
      continue;
    }
    opts?.onDebug?.(`component [${comp.join(",")}] conforming…`);
    const attempt = deepCopy(model);
    const res = conformComponent(attempt, compSet, ring, maxMove, opts?.onDebug);
    if (!res) {
      report.reverted++;
      continue;
    }
    model = attempt;
    report.componentsConformed++;
    report.vertsMoved += res.vertsMoved;
    report.maxMoveFt = Math.max(report.maxMoveFt, res.maxMoveFt);
    if (res.changed) changed = true;
  }
  report.maxMoveFt = Math.round(report.maxMoveFt * 100) / 100;
  return { model, report, changed };
}
