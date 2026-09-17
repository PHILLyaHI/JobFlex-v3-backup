// Houses and snapping for the fence studio — pure math in local feet (+x east,
// +y north), no DOM, no Maps.
//
// A fence rarely floats: it starts at a property corner, runs along a lot line
// and ends on the side of the house. The draw surface therefore snaps a new
// dot to what is already on the site — the traced fence's own dots first, then
// property-line and house CORNERS, then anywhere ALONG a house wall, a lot line
// or another run — and a run that ends on a house wall is a wall mount in 3D.
// (FenceScan's canvas snaps the same targets in the same order.)
import type { BuildingFootprint, PathPoint } from "./fenceTypes";
import { pointInRingFt, ringCentroidFt } from "./mapProjection";

export type Seg = [PathPoint, PathPoint];

/** A traced house outline, as the page keeps it. */
export interface DrawnHouse {
  id: string;
  ring: PathPoint[];
  stories: 1 | 2 | 3;
}

/** A run END within this of a house wall is fixed to that wall. Snapping puts
 *  an end exactly on the wall; a looser figure turned an end that merely came
 *  close (traced before the outline existed) into a board hanging in the air. */
export const WALL_MOUNT_TOL_FT = 0.35;

/** Wall height by stories — a flat-topped block, like the detected buildings
 *  (whose default without a record is 13 ft). */
export function storyHeightFt(stories: number): number {
  return stories >= 3 ? 33 : stories === 2 ? 23 : 13;
}

/** Plan area of a ring, sq ft (shoelace; open or closed ring). */
export function ringAreaSqFt(ring: PathPoint[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j].x + ring[i].x) * (ring[j].y - ring[i].y);
  }
  return Math.abs(a) / 2;
}

/** The closed ring's edges (a duplicated closing point adds no edge). */
export function ringEdges(ring: PathPoint[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-6) out.push([a, b]);
  }
  return out;
}

/** Closest point on segment a→b to p. */
export function nearestOnSeg(p: PathPoint, a: PathPoint, b: PathPoint): { pt: PathPoint; d: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  const pt = { x: a.x + dx * t, y: a.y + dy * t };
  return { pt, d: Math.hypot(p.x - pt.x, p.y - pt.y), t };
}

export interface SnapHit {
  pt: PathPoint;
  kind: "corner" | "edge";
  d: number;
}

/**
 * Snap p to the nearest corner within `cornerFt`; failing that, to the nearest
 * point along an edge within `edgeFt`. Corners win whenever one is in reach —
 * a fence that ends "near the corner" means AT the corner.
 */
export function snapToTargets(
  p: PathPoint,
  corners: PathPoint[],
  edges: Seg[],
  cornerFt: number,
  edgeFt: number,
): SnapHit | null {
  let best: SnapHit | null = null;
  for (const c of corners) {
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d <= cornerFt && (!best || d < best.d)) best = { pt: { x: c.x, y: c.y }, kind: "corner", d };
  }
  if (best) return best;
  for (const [a, b] of edges) {
    const h = nearestOnSeg(p, a, b);
    if (h.d <= edgeFt && (!best || h.d < best.d)) best = { pt: h.pt, kind: "edge", d: h.d };
  }
  return best;
}

/** Distance from p to the nearest wall of a ring. */
export function distToRing(p: PathPoint, ring: PathPoint[]): number {
  let d = Infinity;
  for (const [a, b] of ringEdges(ring)) d = Math.min(d, nearestOnSeg(p, a, b).d);
  return d;
}

/** The two END points of every open run in a traced path (runs split on `gap`). */
export function runEnds(points: PathPoint[]): PathPoint[] {
  const out: PathPoint[] = [];
  let start = 0;
  const flush = (end: number) => {
    if (end - start < 1) return;
    const a = points[start];
    const b = points[end];
    const closed = end - start > 1 && Math.hypot(b.x - a.x, b.y - a.y) < 0.5;
    if (!closed) out.push(a, b);
  };
  for (let i = 1; i < points.length; i++) {
    if (points[i].gap) {
      flush(i - 1);
      start = i;
    }
  }
  if (points.length) flush(points.length - 1);
  return out;
}

/** Run ends that sit on a house wall — the wall mounts. */
export function wallMountsFor(points: PathPoint[], houseRings: PathPoint[][], tolFt = WALL_MOUNT_TOL_FT): PathPoint[] {
  const rings = houseRings.filter((r) => r.length >= 3);
  if (!rings.length) return [];
  return runEnds(points).filter((p) => rings.some((r) => distToRing(p, r) <= tolFt));
}

/**
 * The buildings the 3D shows: every traced house (the subject, at its storey
 * height), plus each detected footprint that no traced house replaces — one
 * is replaced when a traced outline covers its centre, or sits inside it while
 * being at least half its size.
 */
export function mergeBuildings(drawn: DrawnHouse[], detected: BuildingFootprint[]): BuildingFootprint[] {
  const mine = drawn.filter((h) => h.ring.length >= 3);
  const out: BuildingFootprint[] = mine.map((h) => ({
    ring: h.ring,
    heightFt: storyHeightFt(h.stories),
    role: "subject",
  }));
  for (const b of detected) {
    if (b.ring.length < 3) continue;
    const bc = ringCentroidFt(b.ring);
    const bArea = ringAreaSqFt(b.ring);
    // The traced outline replaces the footprint when it covers the footprint's
    // centre, or when it sits inside the footprint AND is most of it — tracing
    // just the garage inside a combined house-and-garage footprint must not
    // delete the house.
    const replaced = mine.some(
      (h) => pointInRingFt(bc, h.ring) || (pointInRingFt(ringCentroidFt(h.ring), b.ring) && ringAreaSqFt(h.ring) >= bArea * 0.5),
    );
    if (!replaced) out.push(b);
  }
  return out;
}
