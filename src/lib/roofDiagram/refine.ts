// Roof diagram — REFINE: topology and position repair between rectification
// (rectify.ts — edge directions onto the house grid) and figure recomputation
// (calibrate.ts — calibration k applied once, downstream). Seven ordered passes
// from the roof drawing rules spec
// (docs/superpowers/specs/2026-08-24-roof-drawing-rules.md §3):
//
//   1 T-junction weld           dangling ridge/hip/valley ends and perimeter
//                               chain breaks move onto the nearest line (≤ 0.75 ft)
//   2 chamfer removal           a cut corner (< 6 ft perimeter edge between
//                               near-perpendicular neighbours) becomes the
//                               neighbours' intersection; its endpoints weld
//   3 collinear chain collapse  one wall / one crease = one segment; the
//                               printed length is the SUM of the members
//   4 sliver merge              long thin noise wedges (< 25 sq ft AND
//                               < 2.5 ft min oriented width) absorbed by the
//                               neighbour sharing their longest edge
//   5 ridge centering           equal-pitch opposing pair → ridge onto the
//                               mid-line between the two parallel eaves (≤ 2 ft)
//   6 corner anchoring          hip lower end → convex outline corner,
//                               valley lower end → reflex corner (≤ 6 ft)
//   7 micro-line cleanup        sub-0.05 ft stubs dropped; < 1 ft merged or
//                               suppressed; OTHER drawn only when ≥ 3 ft and
//                               part of a penetration ring
//
// Pure and client-safe: no I/O, the input model is never mutated (deep copy),
// and lengths/areas/totals are NOT recomputed here — the caller recomputes
// figures so k is applied exactly once. Every pass is at worst O(n²) in the
// line count (~200), guards NaN geometry, and leaves untouched any face whose
// boundary cannot be fully chained (ringOf truncation).

import type { EvLineType, RoofFace, RoofLine, RoofModel, RoofPoint } from "@/lib/eagleview";
import { buildIndexes, ringOf, type RoofIndexes } from "@/components/estimator/roof/roofGeometry";

export interface RefineOptions {
  /** Aligned Instant outline rings (frame feet) — used ONLY for corner convexity in pass 6. */
  outlines?: Array<Array<{ x: number; y: number }>>;
}

export interface RefineReport {
  weldedTJunctions: number;
  chamfersRemoved: number;
  chainsCollapsed: number;
  sliversMerged: number;
  ridgesCentered: number;
  creasesAnchored: number;
  microLinesDropped: number;
  otherSuppressed: number;
}

type P2 = { x: number; y: number };

/** Module-local extension: a line kept for topology but suppressed in the drawing. */
type RefinedLine = RoofLine & { hidden?: boolean };

interface Corner {
  x: number;
  y: number;
  convex: boolean;
}

/** Pass-1 record of a point welded onto the interior of a host line. */
interface WeldRecord {
  pointId: string;
  hostLineId: string;
}

const WELD_FT = 0.75;
const INTERIOR_TYPES: ReadonlySet<EvLineType> = new Set<EvLineType>(["RIDGE", "HIP", "VALLEY"]);
const BOUNDARY_TYPES: ReadonlySet<EvLineType> = new Set<EvLineType>(["EAVE", "RAKE"]);

// ── small geometry helpers ───────────────────────────────────────────────────

const finiteXY = (p: RoofPoint | undefined): p is RoofPoint =>
  !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

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

/** PROPER (interior) crossing of segments p1p2 and q1q2 — endpoint contact does not count. */
function properSegIntersect(p1: P2, p2: P2, q1: P2, q2: P2): boolean {
  const cross = (o: P2, a: P2, b: P2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const eps = 1e-9;
  const d1 = cross(q1, q2, p1);
  const d2 = cross(q1, q2, p2);
  const d3 = cross(p1, p2, q1);
  const d4 = cross(p1, p2, q2);
  return (
    ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) &&
    ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))
  );
}

/** Signed shoelace area of a plan ring (positive = CCW). */
function shoelace(ring: P2[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Min oriented width: rotating extent over the ring's own edge directions. */
function minOrientedWidth(ring: P2[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const u = unit(ring[i], ring[(i + 1) % ring.length]);
    if (!u) continue;
    const nx = -u.y;
    const ny = u.x;
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of ring) {
      const d = p.x * nx + p.y * ny;
      if (d < lo) lo = d;
      if (d > hi) hi = d;
    }
    if (hi - lo < best) best = hi - lo;
  }
  return best;
}

// ── model bookkeeping helpers ────────────────────────────────────────────────

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

function planLength(l: RoofLine, pts: Map<string, RoofPoint>): number {
  const a = pts.get(l.aId);
  const b = pts.get(l.bId);
  if (!finiteXY(a) || !finiteXY(b)) return NaN;
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Remove lines from the model and from every face/penetration ring. */
function dropLines(model: RoofModel, ids: ReadonlySet<string>): void {
  if (!ids.size) return;
  model.lines = model.lines.filter((l) => !ids.has(l.id));
  for (const f of model.faces) f.lineIds = f.lineIds.filter((id) => !ids.has(id));
  for (const f of model.penetrations) f.lineIds = f.lineIds.filter((id) => !ids.has(id));
}

/** Replace `from` with `to` in a ring, collapsing the resulting run to one id. */
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

/**
 * ringOf, but strict: null unless EVERY line id resolves, the chain consumed
 * every line (ringOf silently truncates on a chain break), the ring closes,
 * and every vertex is finite. Faces failing this are left untouched by 4–6.
 */
function completeRing(lineIds: string[], idx: RoofIndexes): RoofPoint[] | null {
  if (lineIds.length < 3) return null;
  for (const id of lineIds) if (!idx.linesById.has(id)) return null;
  const ring = ringOf(lineIds, idx);
  if (!ring || ring.length !== lineIds.length) return null;
  const seg = new Set<string>();
  for (const id of lineIds) {
    const l = idx.linesById.get(id);
    if (!l) return null;
    seg.add(l.aId + " " + l.bId);
    seg.add(l.bId + " " + l.aId);
  }
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (!finiteXY(a)) return null;
    if (!seg.has(a.id + " " + b.id)) return null;
  }
  return ring;
}

function truncatedFaceIds(model: RoofModel, idx: RoofIndexes): Set<string> {
  const out = new Set<string>();
  for (const f of model.faces) if (!completeRing(f.lineIds, idx)) out.add(f.id);
  return out;
}

// ── pass 1: T-junction weld ──────────────────────────────────────────────────

function weldTJunctions(model: RoofModel, report: RefineReport, welds?: WeldRecord[]): void {
  const pts = pointMap(model);
  const owners = faceOwners(model);
  const usage = new Map<string, RoofLine[]>();
  for (const l of model.lines) {
    for (const id of [l.aId, l.bId]) {
      const arr = usage.get(id) ?? [];
      arr.push(l);
      usage.set(id, arr);
    }
  }
  for (const p of model.points) {
    if (!finiteXY(p)) continue;
    const used = usage.get(p.id) ?? [];
    if (!used.length) continue;
    const interior = used.filter((l) => INTERIOR_TYPES.has(l.type)).length;
    const boundary = used.filter((l) => BOUNDARY_TYPES.has(l.type)).length;
    const singleOwner = used.filter((l) => (owners.get(l.id)?.length ?? 0) === 1).length;
    const freeInteriorEnd = interior === 1 && boundary === 0;
    const perimeterBreak = singleOwner === 1;
    if (!freeInteriorEnd && !perimeterBreak) continue;
    // Nearest point on any segment that does not use this point.
    let best: { d: number; x: number; y: number; z: number; lineId: string } | null = null;
    for (const l of model.lines) {
      if (l.aId === p.id || l.bId === p.id) continue;
      const a = pts.get(l.aId);
      const b = pts.get(l.bId);
      if (!finiteXY(a) || !finiteXY(b)) continue;
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const len = Math.hypot(ex, ey);
      if (len < 1e-6) continue;
      const t = Math.max(0, Math.min(len, ((p.x - a.x) * ex + (p.y - a.y) * ey) / len));
      const fx = a.x + (ex / len) * t;
      const fy = a.y + (ey / len) * t;
      const d = Math.hypot(p.x - fx, p.y - fy);
      if (d <= WELD_FT && (!best || d < best.d)) {
        const fz =
          Number.isFinite(a.z) && Number.isFinite(b.z) ? a.z + ((b.z - a.z) * t) / len : p.z;
        best = { d, x: fx, y: fy, z: fz, lineId: l.id };
      }
    }
    if (best && best.d > 1e-6) {
      p.x = best.x;
      p.y = best.y;
      p.z = best.z;
      report.weldedTJunctions++;
      welds?.push({ pointId: p.id, hostLineId: best.lineId });
    }
  }
}

// ── pass 2: chamfer removal ──────────────────────────────────────────────────

function removeChamferOnce(model: RoofModel, report: RefineReport): boolean {
  const pts = pointMap(model);
  const owners = faceOwners(model);
  const perimeter = model.lines.filter((l) => (owners.get(l.id)?.length ?? 0) === 1);
  const perAt = new Map<string, RoofLine[]>();
  for (const l of perimeter) {
    for (const id of [l.aId, l.bId]) {
      const arr = perAt.get(id) ?? [];
      arr.push(l);
      perAt.set(id, arr);
    }
  }
  for (const l of perimeter) {
    if (!BOUNDARY_TYPES.has(l.type)) continue; // chamfer edge must be EAVE/RAKE
    const len = planLength(l, pts);
    if (!Number.isFinite(len) || len < 1e-6 || len >= 6) continue;
    const na = (perAt.get(l.aId) ?? []).filter((k) => k.id !== l.id);
    const nb = (perAt.get(l.bId) ?? []).filter((k) => k.id !== l.id);
    if (na.length !== 1 || nb.length !== 1 || na[0].id === nb[0].id) continue;
    const A = na[0];
    const B = nb[0];
    // Both neighbours must be boundary edges too (FLASHING/STEPFLASH etc. excluded).
    if (!BOUNDARY_TYPES.has(A.type) || !BOUNDARY_TYPES.has(B.type)) continue;
    const pa = pts.get(A.aId);
    const pab = pts.get(A.bId);
    const pb = pts.get(B.aId);
    const pbb = pts.get(B.bId);
    if (!finiteXY(pa) || !finiteXY(pab) || !finiteXY(pb) || !finiteXY(pbb)) continue;
    const ua = unit(pa, pab);
    const ub = unit(pb, pbb);
    if (!ua || !ub) continue;
    if (Math.abs(angleBetweenDeg(ua, ub) - 90) > 10) continue;
    const X = lineIntersect(pa, ua, pb, ub);
    if (!X) continue;
    const a = pts.get(l.aId);
    const b = pts.get(l.bId);
    if (!finiteXY(a) || !finiteXY(b)) continue;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (Math.hypot(X.x - mid.x, X.y - mid.y) >= 4) continue;
    // Weld: keep point a, retarget every reference of b to a, move a to the corner.
    a.x = X.x;
    a.y = X.y;
    if (Number.isFinite(a.z) && Number.isFinite(b.z)) a.z = (a.z + b.z) / 2;
    const dropPointId = b.id;
    for (const k of model.lines) {
      if (k.aId === dropPointId) k.aId = a.id;
      if (k.bId === dropPointId) k.bId = a.id;
    }
    model.points = model.points.filter((p) => p.id !== dropPointId);
    const dead = new Set<string>([l.id]);
    for (const k of model.lines) if (k.id !== l.id && k.aId === k.bId) dead.add(k.id);
    dropLines(model, dead);
    report.chamfersRemoved++;
    return true;
  }
  return false;
}

function removeChamfers(model: RoofModel, report: RefineReport): void {
  for (let sweep = 0; sweep < 32; sweep++) {
    if (!removeChamferOnce(model, report)) break;
  }
}

// ── pass 3: collinear chain collapse ─────────────────────────────────────────

function chainTols(t: EvLineType): { ang: number; perp: number; gap: number } {
  return t === "FLASHING" || t === "STEPFLASH"
    ? { ang: 10, perp: 1.0, gap: 1.0 }
    : { ang: 5, perp: 0.75, gap: 0.75 };
}

/** Try to merge B into A (A keeps its id; printed length = sum). */
function tryMergePair(model: RoofModel, A: RoofLine, B: RoofLine, pts: Map<string, RoofPoint>): boolean {
  const tol = chainTols(A.type);
  const a1 = pts.get(A.aId);
  const a2 = pts.get(A.bId);
  const b1 = pts.get(B.aId);
  const b2 = pts.get(B.bId);
  if (!finiteXY(a1) || !finiteXY(a2) || !finiteXY(b1) || !finiteXY(b2)) return false;
  const ua = unit(a1, a2);
  const ub = unit(b1, b2);
  if (!ua || !ub) return false;
  if (angleBetweenDeg(ua, ub) >= tol.ang) return false;
  const off = (p: P2) => Math.abs((p.x - a1.x) * -ua.y + (p.y - a1.y) * ua.x);
  if (off(b1) >= tol.perp || off(b2) >= tol.perp) return false;
  // Closest endpoint pairing = the joint; the two far ends become the extremes.
  const pairs: Array<[RoofPoint, RoofPoint, RoofPoint, RoofPoint]> = [
    [a1, b1, a2, b2],
    [a1, b2, a2, b1],
    [a2, b1, a1, b2],
    [a2, b2, a1, b1],
  ];
  let best: { d: number; nearA: RoofPoint; nearB: RoofPoint; farA: RoofPoint; farB: RoofPoint } | null =
    null;
  for (const [nA, nB, fA, fB] of pairs) {
    const d = Math.hypot(nA.x - nB.x, nA.y - nB.y);
    if (!best || d < best.d) best = { d, nearA: nA, nearB: nB, farA: fA, farB: fB };
  }
  if (!best || best.d >= tol.gap) return false;
  // Duplicate / fully-overlapping segments must not collapse to a point.
  if (Math.hypot(best.farA.x - best.farB.x, best.farA.y - best.farB.y) < tol.gap) return false;
  // Two-storey flush walls must not merge: a z break at the joint is a real edge.
  if (
    Number.isFinite(best.nearA.z) &&
    Number.isFinite(best.nearB.z) &&
    Math.abs(best.nearA.z - best.nearB.z) > 1.0
  ) {
    return false;
  }
  // The pieces must belong together: a shared joint point, or the same owner-face set.
  if (best.nearA.id !== best.nearB.id) {
    const owners = faceOwners(model);
    const keyOf = (id: string) => [...(owners.get(id) ?? [])].sort().join("|");
    if (keyOf(A.id) !== keyOf(B.id)) return false;
  }
  // Never merge across a joint where a DIFFERENT-type line terminates.
  for (const k of model.lines) {
    if (k.id === A.id || k.id === B.id || k.type === A.type) continue;
    for (const pid of [k.aId, k.bId]) {
      const kp = pts.get(pid);
      if (!finiteXY(kp)) continue;
      if (Math.hypot(kp.x - best.nearA.x, kp.y - best.nearA.y) < tol.gap) return false;
      if (Math.hypot(kp.x - best.nearB.x, kp.y - best.nearB.y) < tol.gap) return false;
    }
  }
  A.aId = best.farA.id;
  A.bId = best.farB.id;
  A.lengthFt = A.lengthFt + B.lengthFt; // the printed figure must not change
  model.lines = model.lines.filter((k) => k.id !== B.id);
  for (const f of model.faces) f.lineIds = replaceInRing(f.lineIds, B.id, A.id);
  for (const f of model.penetrations) f.lineIds = replaceInRing(f.lineIds, B.id, A.id);
  return true;
}

function collapseChains(model: RoofModel, report: RefineReport, shortOnly: boolean): void {
  for (let sweep = 0; sweep < 300; sweep++) {
    const pts = pointMap(model);
    let merged = false;
    outer: for (let i = 0; i < model.lines.length; i++) {
      for (let j = i + 1; j < model.lines.length; j++) {
        const A = model.lines[i];
        const B = model.lines[j];
        if (A.type !== B.type) continue;
        if (shortOnly) {
          const la = planLength(A, pts);
          const lb = planLength(B, pts);
          const aShort = Number.isFinite(la) && la < 1;
          const bShort = Number.isFinite(lb) && lb < 1;
          if (!aShort && !bShort) continue;
        }
        if (tryMergePair(model, A, B, pts)) {
          report.chainsCollapsed++;
          merged = true;
          break outer;
        }
      }
    }
    if (!merged) break;
  }
}

// ── pass 4: sliver merge ─────────────────────────────────────────────────────

function rotateIds(ids: string[], start: number): string[] {
  return [...ids.slice(start), ...ids.slice(0, start)];
}

/** The single contiguous cyclic run of `inSet` members in `ids`, or null. */
function cyclicRun(ids: string[], inSet: ReadonlySet<string>): { start: number; len: number } | null {
  const n = ids.length;
  const flags = ids.map((id) => inSet.has(id));
  const count = flags.filter(Boolean).length;
  if (count === 0 || count === n) return null;
  let starts = 0;
  let start = -1;
  for (let i = 0; i < n; i++) {
    if (flags[i] && !flags[(i - 1 + n) % n]) {
      starts++;
      start = i;
    }
  }
  return starts === 1 ? { start, len: count } : null;
}

/** Order a set of line ids into one closed ring by walking point adjacency; null on failure. */
function walkRingOrder(ids: string[], idx: RoofIndexes): string[] | null {
  if (ids.length < 3) return null;
  const lines: RoofLine[] = [];
  for (const id of ids) {
    const l = idx.linesById.get(id);
    if (!l || l.aId === l.bId) return null;
    lines.push(l);
  }
  const at = new Map<string, RoofLine[]>();
  for (const l of lines) {
    for (const pid of [l.aId, l.bId]) {
      const arr = at.get(pid) ?? [];
      arr.push(l);
      at.set(pid, arr);
    }
  }
  for (const arr of at.values()) if (arr.length !== 2) return null;
  const first = lines[0];
  const ordered = [first.id];
  const visited = new Set([first.id]);
  const startId = first.aId;
  let cur = first.bId;
  let guard = ids.length + 1;
  while (cur !== startId && guard-- > 0) {
    const nexts = (at.get(cur) ?? []).filter((l) => !visited.has(l.id));
    if (nexts.length !== 1) return null;
    const l = nexts[0];
    visited.add(l.id);
    ordered.push(l.id);
    cur = l.aId === cur ? l.bId : l.aId;
  }
  return cur === startId && ordered.length === ids.length ? ordered : null;
}

/** Simplicity: no duplicate vertex (id or coordinates) and no proper edge crossing.
 *  Exported: conformOutline.ts's hard guard shares this exact test. */
export function isSimpleRing(ring: RoofPoint[]): boolean {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (ring[i].id === ring[j].id) return false;
      if (Math.hypot(ring[i].x - ring[j].x, ring[i].y - ring[j].y) < 1e-6) return false;
    }
  }
  for (let i = 0; i < n; i++) {
    const a1 = ring[i];
    const a2 = ring[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // adjacent edges share a vertex
      const b1 = ring[j];
      const b2 = ring[(j + 1) % n];
      if (properSegIntersect(a1, a2, b1, b2)) return false;
    }
  }
  return true;
}

function mergeSlivers(model: RoofModel, report: RefineReport): void {
  const targetIds = model.faces.map((f) => f.id);
  for (const fid of targetIds) {
    const sliver = model.faces.find((f) => f.id === fid);
    if (!sliver) continue; // already absorbed
    const idx = buildIndexes(model);
    const ring = completeRing(sliver.lineIds, idx);
    if (!ring) continue; // truncated — leave untouched
    const plan: P2[] = ring.map((p) => ({ x: p.x, y: p.y }));
    const area = Math.abs(shoelace(plan));
    if (!Number.isFinite(area) || area >= 25) continue;
    const width = minOrientedWidth(plan);
    if (!Number.isFinite(width) || width >= 2.5) continue;
    // Neighbour sharing the longest edge (by total shared plan length).
    const owners = faceOwners(model);
    const byNeighbour = new Map<string, { len: number; ids: string[] }>();
    for (const id of sliver.lineIds) {
      const os = owners.get(id) ?? [];
      if (os.length !== 2) continue;
      const other = os[0] === sliver.id ? os[1] : os[0];
      if (other === sliver.id) continue;
      const l = idx.linesById.get(id);
      if (!l) continue;
      const len = planLength(l, idx.pointsById);
      if (!Number.isFinite(len)) continue;
      const acc = byNeighbour.get(other) ?? { len: 0, ids: [] };
      acc.len += len;
      acc.ids.push(id);
      byNeighbour.set(other, acc);
    }
    let neighbourId: string | null = null;
    let bestLen = -1;
    for (const [id, acc] of byNeighbour) {
      if (acc.len > bestLen) {
        bestLen = acc.len;
        neighbourId = id;
      }
    }
    if (neighbourId == null) continue;
    const neighbour = model.faces.find((f) => f.id === neighbourId);
    if (!neighbour || !completeRing(neighbour.lineIds, idx)) continue;
    const shared = new Set(byNeighbour.get(neighbourId)?.ids ?? []);
    if (!shared.size) continue;
    const runN = cyclicRun(neighbour.lineIds, shared);
    const runS = cyclicRun(sliver.lineIds, shared);
    if (!runN || !runS) continue; // shared edges not one contiguous run
    const complement = rotateIds(sliver.lineIds, runS.start).slice(runS.len);
    if (!complement.length) continue;
    const tail = rotateIds(neighbour.lineIds, runN.start).slice(runN.len);
    // Rebuild the merged boundary in TRUE ring order by walking the edge set
    // once by point adjacency, then require a simple ring with no duplicate
    // vertices — otherwise the merge is not committed.
    const ordered = walkRingOrder([...complement, ...tail], idx);
    if (!ordered) continue;
    const mergedRing = completeRing(ordered, idx);
    if (!mergedRing || !isSimpleRing(mergedRing)) continue;
    neighbour.lineIds = ordered; // sliver's pitch is left out; neighbour keeps its own
    model.faces = model.faces.filter((f) => f.id !== sliver.id);
    dropLines(model, shared);
    report.sliversMerged++;
  }
}

// ── pass 5: ridge centering ──────────────────────────────────────────────────

function centerRidges(
  model: RoofModel,
  report: RefineReport,
  welds: ReadonlyArray<WeldRecord> = [],
): void {
  const idx = buildIndexes(model);
  const pts = idx.pointsById;
  const owners = faceOwners(model);
  const truncated = truncatedFaceIds(model, idx);
  for (const ridge of model.lines) {
    if (ridge.type !== "RIDGE") continue;
    const os = owners.get(ridge.id) ?? [];
    if (os.length !== 2) continue;
    const fa = model.faces.find((f) => f.id === os[0]);
    const fb = model.faces.find((f) => f.id === os[1]);
    if (!fa || !fb) continue;
    if (truncated.has(fa.id) || truncated.has(fb.id)) continue;
    if (Math.round(fa.pitch) !== Math.round(fb.pitch)) continue; // equal pitch after rounding
    const ra = pts.get(ridge.aId);
    const rb = pts.get(ridge.bId);
    if (!finiteXY(ra) || !finiteXY(rb)) continue;
    const u = unit(ra, rb);
    if (!u) continue;
    const nrm = { x: -u.y, y: u.x };
    const offOf = (p: P2) => (p.x - ra.x) * nrm.x + (p.y - ra.y) * nrm.y;
    // Per face: perpendicular offset of its longest eave parallel to the ridge.
    const eaveOffset = (f: RoofFace): number | null => {
      let longest = -1;
      let offset: number | null = null;
      for (const id of f.lineIds) {
        const l = idx.linesById.get(id);
        if (!l || l.type !== "EAVE") continue;
        const a = pts.get(l.aId);
        const b = pts.get(l.bId);
        if (!finiteXY(a) || !finiteXY(b)) continue;
        const v = unit(a, b);
        if (!v || angleBetweenDeg(u, v) >= 5) continue;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len > longest) {
          longest = len;
          offset = offOf({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        }
      }
      return offset != null && Number.isFinite(offset) ? offset : null;
    };
    const oa = eaveOffset(fa);
    const ob = eaveOffset(fb);
    if (oa == null || ob == null) continue;
    const mid = (oa + ob) / 2;
    const da = mid - offOf(ra); // = mid (ra is the origin)
    const db = mid - offOf(rb);
    if (!Number.isFinite(da) || !Number.isFinite(db)) continue;
    if (Math.abs(da) > 2 || Math.abs(db) > 2) continue; // both endpoints must move ≤ 2 ft
    if (Math.abs(da) < 1e-6 && Math.abs(db) < 1e-6) continue;
    // T-abutments must follow the ridge: collect every point recorded as welded
    // onto THIS ridge in pass 1, plus any point lying on the old ridge segment
    // within the weld tolerance, keyed by its parameter t along the old segment.
    const followers = new Map<string, number>();
    {
      const oldA = { x: ra.x, y: ra.y };
      const oldLen = Math.hypot(rb.x - ra.x, rb.y - ra.y);
      if (oldLen > 1e-6) {
        const tOf = (p: RoofPoint) =>
          Math.max(0, Math.min(1, ((p.x - oldA.x) * u.x + (p.y - oldA.y) * u.y) / oldLen));
        const recorded = new Set(
          welds.filter((w) => w.hostLineId === ridge.id).map((w) => w.pointId),
        );
        for (const p of model.points) {
          if (p.id === ridge.aId || p.id === ridge.bId || !finiteXY(p)) continue;
          if (recorded.has(p.id)) {
            followers.set(p.id, tOf(p));
            continue;
          }
          const t = tOf(p);
          const fx = oldA.x + u.x * oldLen * t;
          const fy = oldA.y + u.y * oldLen * t;
          if (Math.hypot(p.x - fx, p.y - fy) <= WELD_FT) followers.set(p.id, t);
        }
      }
    }
    ra.x += nrm.x * da;
    ra.y += nrm.y * da;
    rb.x += nrm.x * db;
    rb.y += nrm.y * db;
    // Translate the followers by the interpolated perpendicular offset so
    // T-welds onto this ridge (hip ends, interior abutments) stay welded.
    for (const [pid, t] of followers) {
      const p = pts.get(pid);
      if (!p || !finiteXY(p)) continue;
      const off = da + (db - da) * t;
      p.x += nrm.x * off;
      p.y += nrm.y * off;
    }
    report.ridgesCentered++; // welded ends follow via shared point ids or the follower map
  }
}

// ── pass 6: corner anchoring ─────────────────────────────────────────────────

/** Chain single-owner perimeter lines into plan rings by shared point ids. */
function chainPerimeterRings(model: RoofModel, idx: RoofIndexes): P2[][] {
  const owners = faceOwners(model);
  const per = model.lines.filter((l) => (owners.get(l.id)?.length ?? 0) === 1);
  const at = new Map<string, RoofLine[]>();
  for (const l of per) {
    for (const id of [l.aId, l.bId]) {
      const arr = at.get(id) ?? [];
      arr.push(l);
      at.set(id, arr);
    }
  }
  const visited = new Set<string>();
  const rings: P2[][] = [];
  for (const start of per) {
    if (visited.has(start.id)) continue;
    visited.add(start.id);
    const firstId = start.aId;
    const startPt = idx.pointsById.get(firstId);
    if (!finiteXY(startPt)) continue;
    const ringPts: P2[] = [{ x: startPt.x, y: startPt.y }];
    let cur = start;
    let nextId = start.bId;
    let closed = false;
    let guard = per.length + 2;
    while (guard-- > 0) {
      if (nextId === firstId) {
        closed = true;
        break;
      }
      const p = idx.pointsById.get(nextId);
      if (!finiteXY(p)) break;
      ringPts.push({ x: p.x, y: p.y });
      const cands = (at.get(nextId) ?? []).filter((l) => l.id !== cur.id);
      if (cands.length !== 1 || visited.has(cands[0].id)) break; // break or fork — skip component
      cur = cands[0];
      visited.add(cur.id);
      nextId = cur.aId === nextId ? cur.bId : cur.aId;
    }
    if (closed && ringPts.length >= 3) rings.push(ringPts);
  }
  return rings;
}

function collectCorners(rings: P2[][]): Corner[] {
  const out: Corner[] = [];
  for (const raw of rings) {
    const ring = raw.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (
      ring.length > 1 &&
      Math.hypot(ring[0].x - ring[ring.length - 1].x, ring[0].y - ring[ring.length - 1].y) < 1e-6
    ) {
      ring.pop(); // drop a duplicated closing vertex
    }
    if (ring.length < 3) continue;
    const ccw = shoelace(ring) >= 0 ? ring : [...ring].reverse();
    const n = ccw.length;
    for (let i = 0; i < n; i++) {
      const u = unit(ccw[(i - 1 + n) % n], ccw[i]);
      const v = unit(ccw[i], ccw[(i + 1) % n]);
      if (!u || !v) continue;
      const crossZ = u.x * v.y - u.y * v.x;
      const dot = u.x * v.x + u.y * v.y;
      const turnDeg = (Math.atan2(crossZ, dot) * 180) / Math.PI;
      if (Math.abs(turnDeg) < 15) continue; // near-collinear — not a corner
      out.push({ x: ccw[i].x, y: ccw[i].y, convex: turnDeg > 0 });
    }
  }
  return out;
}

function anchorCreases(model: RoofModel, report: RefineReport, outlines?: Array<Array<P2>>): void {
  const idx = buildIndexes(model);
  const rings: P2[][] =
    outlines && outlines.length
      ? outlines.map((r) => r.map((p) => ({ x: p.x, y: p.y })))
      : chainPerimeterRings(model, idx);
  const corners = collectCorners(rings);
  if (!corners.length) return;
  const truncated = truncatedFaceIds(model, idx);
  const owners = faceOwners(model);
  for (const l of model.lines) {
    if (l.type !== "HIP" && l.type !== "VALLEY") continue;
    if ((owners.get(l.id) ?? []).some((fid) => truncated.has(fid))) continue;
    const a = idx.pointsById.get(l.aId);
    const b = idx.pointsById.get(l.bId);
    if (!finiteXY(a) || !finiteXY(b)) continue;
    if (!Number.isFinite(a.z) || !Number.isFinite(b.z)) continue;
    const wantConvex = l.type === "HIP"; // hip ⇢ convex corner, valley ⇢ reflex
    const cs = corners.filter((c) => c.convex === wantConvex);
    if (!cs.length) continue;
    const nearestD = (p: P2) => {
      let d = Infinity;
      for (const c of cs) d = Math.min(d, Math.hypot(c.x - p.x, c.y - p.y));
      return d;
    };
    let lower: RoofPoint;
    let upper: RoofPoint;
    if (Math.abs(a.z - b.z) > 0.5) {
      [lower, upper] = a.z < b.z ? [a, b] : [b, a];
    } else {
      // z-tie: the endpoint nearer a matching corner is the ground end.
      [lower, upper] = nearestD(a) <= nearestD(b) ? [a, b] : [b, a];
    }
    if (nearestD(lower) <= 1.5) continue; // already anchored
    const u = unit(upper, lower);
    if (!u) continue;
    let best: Corner | null = null;
    let bestD = Infinity;
    for (const c of cs) {
      const dx = c.x - lower.x;
      const dy = c.y - lower.y;
      const along = dx * u.x + dy * u.y;
      const perp = Math.abs(dy * u.x - dx * u.y);
      const d = Math.hypot(dx, dy);
      if (along <= 0 || d > 6 || perp > 1.5) continue; // extension only, ≤ 6 ft
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (!best) continue;
    // The move must not make the crease cross other lines: proper-intersection
    // test of the moved crease (upper → corner) against every line not sharing
    // the moved point.
    const target = { x: best.x, y: best.y };
    let rejectMove = false;
    for (const k of model.lines) {
      if (k.id === l.id || k.aId === lower.id || k.bId === lower.id) continue;
      const q1 = idx.pointsById.get(k.aId);
      const q2 = idx.pointsById.get(k.bId);
      if (!finiteXY(q1) || !finiteXY(q2)) continue;
      if (properSegIntersect(upper, target, q1, q2)) {
        rejectMove = true;
        break;
      }
    }
    // Nor may it crush any line incident to the moved point below 0.5 ft.
    if (!rejectMove) {
      for (const k of model.lines) {
        if (k.aId !== lower.id && k.bId !== lower.id) continue;
        const otherId = k.aId === lower.id ? k.bId : k.aId;
        const q = idx.pointsById.get(otherId);
        if (!finiteXY(q)) continue;
        if (Math.hypot(q.x - target.x, q.y - target.y) < 0.5) {
          rejectMove = true;
          break;
        }
      }
    }
    if (rejectMove) continue;
    lower.x = target.x; // shared point — eaves meeting the corner follow
    lower.y = target.y;
    report.creasesAnchored++;
  }
}

// ── pass 7: micro-line cleanup ───────────────────────────────────────────────

function cleanupMicroLines(model: RoofModel, report: RefineReport): void {
  // 7a — drop true dust (< 0.05 ft) outright, faces included.
  {
    const pts = pointMap(model);
    const dust = new Set<string>();
    for (const l of model.lines) {
      const len = planLength(l, pts);
      if (Number.isFinite(len) && len < 0.05) dust.add(l.id);
    }
    if (dust.size) {
      dropLines(model, dust);
      report.microLinesDropped += dust.size;
    }
  }
  // 7b — < 1 ft: try merging into a collinear same-type neighbour (pass-3 test).
  collapseChains(model, report, true);
  // 7c — leftovers: delete when face-free, otherwise keep for topology but
  // mark hidden; the drawing suppresses them via suppressedLineIds().
  const pts = pointMap(model);
  const faceRef = new Set<string>();
  for (const f of model.faces) for (const id of f.lineIds) faceRef.add(id);
  for (const f of model.penetrations) for (const id of f.lineIds) faceRef.add(id);
  const penRef = new Set<string>();
  for (const f of model.penetrations) for (const id of f.lineIds) penRef.add(id);
  const removed = new Set<string>();
  for (const l of model.lines as RefinedLine[]) {
    const len = planLength(l, pts);
    if (Number.isFinite(len) && len < 1) {
      if (faceRef.has(l.id)) l.hidden = true;
      else removed.add(l.id);
      report.microLinesDropped++;
      continue;
    }
    if (l.type === "OTHER") {
      const keep = Number.isFinite(len) && len >= 3 && penRef.has(l.id);
      if (keep) continue;
      if (faceRef.has(l.id)) l.hidden = true;
      else removed.add(l.id);
      report.otherSuppressed++;
    }
  }
  dropLines(model, removed);
}

// ── suppression contract for the drawing ─────────────────────────────────────

/**
 * Line ids the layout must not draw, recomputed from the model (the RoofModel
 * type is unchanged): sub-foot lines that survived because a face's topology
 * needs them, and OTHER lines that are not a ≥ 3 ft member of a penetration
 * ring. Footage stays in the data — this is a visual filter only.
 */
export function suppressedLineIds(model: RoofModel): Set<string> {
  const pts = pointMap(model);
  const penRef = new Set<string>();
  for (const f of model.penetrations) for (const id of f.lineIds) penRef.add(id);
  const out = new Set<string>();
  for (const l of model.lines) {
    const len = planLength(l, pts);
    if (Number.isFinite(len) && len < 1) {
      out.add(l.id);
      continue;
    }
    if (l.type === "OTHER" && !(Number.isFinite(len) && len >= 3 && penRef.has(l.id))) {
      out.add(l.id);
    }
  }
  return out;
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
 * Run the seven refine passes in spec order on a deep copy of the model.
 * Lengths, areas and totals are NOT recomputed here (pass 3 sums member
 * lengths so the printed figure is preserved) — callers recompute figures
 * downstream so calibration k applies exactly once.
 */
export function refineModel(
  input: RoofModel,
  opts?: RefineOptions,
): { model: RoofModel; report: RefineReport } {
  const model = deepCopy(input);
  const report: RefineReport = {
    weldedTJunctions: 0,
    chamfersRemoved: 0,
    chainsCollapsed: 0,
    sliversMerged: 0,
    ridgesCentered: 0,
    creasesAnchored: 0,
    microLinesDropped: 0,
    otherSuppressed: 0,
  };
  const welds: WeldRecord[] = [];
  weldTJunctions(model, report, welds); //   1 — V5 dangling ends
  removeChamfers(model, report); //          2 — V1 cut corners
  collapseChains(model, report, false); //   3 — V4/V6 split runs
  mergeSlivers(model, report); //            4 — V2 noise wedges
  centerRidges(model, report, welds); //     5 — V3 off-centre ridges
  anchorCreases(model, report, opts?.outlines); // 6 — V5 unanchored creases
  cleanupMicroLines(model, report); //       7 — V6/V7 stubs & stray OTHER
  return { model, report };
}
