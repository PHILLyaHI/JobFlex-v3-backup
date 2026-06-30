// Shared, pure geometry/math for the roof views. Deliberately THREE-free and
// client-safe: imports only TYPES from the server module, and returns plain
// {x,y,z} vectors — so the 2D SVG path never bundles three.js, and the 3D path
// converts these to THREE.Vector3 itself. Single source for the facet-ring
// chaining that used to be duplicated in RoofWireframe + RoofModel3D.
import type { RoofModel, RoofPoint, RoofLine } from "@/lib/eagleview";

export type Vec2 = { x: number; y: number };
export type Vec3 = { x: number; y: number; z: number };

export interface RoofIndexes {
  pointsById: Map<string, RoofPoint>;
  linesById: Map<string, RoofLine>;
}

export function buildIndexes(model: RoofModel): RoofIndexes {
  const pointsById = new Map<string, RoofPoint>();
  for (const p of model.points) pointsById.set(p.id, p);
  const linesById = new Map<string, RoofLine>();
  for (const l of model.lines) linesById.set(l.id, l);
  return { pointsById, linesById };
}

// Order a facet's boundary lines head-to-tail into a closed ring of points.
// Returns null when the ring can't be assembled (guard every per-facet layer).
export function ringOf(lineIds: string[], idx: RoofIndexes): RoofPoint[] | null {
  const { linesById, pointsById } = idx;
  const segs = lineIds.map((id) => linesById.get(id)).filter(Boolean) as RoofLine[];
  if (segs.length < 3) return null;
  const used = new Set<number>([0]);
  const ring: string[] = [segs[0].aId];
  let next = segs[0].bId;
  for (let i = 1; i < segs.length; i++) {
    ring.push(next);
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
    if (found < 0) break;
    used.add(found);
  }
  const pts = ring.map((id) => pointsById.get(id)).filter(Boolean) as RoofPoint[];
  return pts.length >= 3 ? pts : null;
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

// Average of the ring vertices. Never NaN (unlike a shoelace centroid on a
// degenerate winding) and good enough for label placement on near-convex facets.
export function centroid(ring: RoofPoint[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of ring) {
    x += p.x;
    y += p.y;
    z += p.z;
  }
  const n = ring.length || 1;
  return { x: x / n, y: y / n, z: z / n };
}

// Unit normal (z-up) from the first 3 non-collinear ring points; null if the
// facet is degenerate (skip normal-dependent features rather than emit NaN).
export function faceNormal(ring: RoofPoint[]): Vec3 | null {
  if (ring.length < 3) return null;
  const p0 = ring[0];
  for (let i = 1; i < ring.length - 1; i++) {
    const n = cross(sub(ring[i], p0), sub(ring[i + 1], p0));
    const len = Math.hypot(n.x, n.y, n.z);
    if (len > 1e-6) {
      const u = { x: n.x / len, y: n.y / len, z: n.z / len };
      return u.z < 0 ? { x: -u.x, y: -u.y, z: -u.z } : u;
    }
  }
  return null;
}

// Down-slope (water-flow) screen unit vector, derived from the facet's 3D
// geometry rather than its azimuth: steepest descent in the plane is the
// horizontal part of the up-normal, ∝ (nx, ny). This lives in the SAME (x,-y)
// frame the wireframe draws in, so the arrow always aligns with the rendered
// facet regardless of how northOrientation is defined. null = flat/degenerate.
export function downSlopeScreen(ring: RoofPoint[]): Vec2 | null {
  const n = faceNormal(ring);
  if (!n) return null;
  const hlen = Math.hypot(n.x, n.y);
  if (hlen < 1e-4) return null; // flat facet — no meaningful slope
  return { x: n.x / hlen, y: -(n.y / hlen) };
}

// Ground height = lowest eave; fallback to the model's z-floor.
export function groundZ(model: RoofModel): number {
  const idx = buildIndexes(model);
  let min = Infinity;
  for (const l of model.lines) {
    if (l.type !== "EAVE") continue;
    const a = idx.pointsById.get(l.aId);
    const b = idx.pointsById.get(l.bId);
    if (a) min = Math.min(min, a.z);
    if (b) min = Math.min(min, b.z);
  }
  return Number.isFinite(min) ? min : model.totals.bounds.minZ;
}

// World (x, y, z=height) → three.js (x, z, -y) so height is +Y, centered on the
// model. Returns plain Vec3; the 3D component wraps each in THREE.Vector3.
export function worldToThree(cx: number, cy: number, cz: number) {
  return (p: Vec3): Vec3 => ({ x: p.x - cx, y: p.z - cz, z: -(p.y - cy) });
}

// Fan-triangulate a ring → flat list of triangle vertices (world coords).
export function triangulateRing(ring: RoofPoint[]): Vec3[] {
  const tris: Vec3[] = [];
  for (let i = 1; i < ring.length - 1; i++) tris.push(ring[0], ring[i], ring[i + 1]);
  return tris;
}

// Extrude a ring along an offset → triangles for a raised cap (top fan + sides).
// Shared by penetration caps. World coords.
export function extrudeRing(ring: RoofPoint[], offset: Vec3): Vec3[] {
  const top: RoofPoint[] = ring.map((p) => ({
    id: p.id,
    x: p.x + offset.x,
    y: p.y + offset.y,
    z: p.z + offset.z,
  }));
  const tris: Vec3[] = triangulateRing(top);
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    tris.push(ring[i], ring[j], top[j]);
    tris.push(ring[i], top[j], top[i]);
  }
  return tris;
}

// ── Replaceable boundary (SANDBOX-ONLY) ──────────────────────────────────────
// The EagleView sandbox returns roof-only geometry, so we fake walls by dropping
// each eave/rake edge straight down to the ground plane. When a PRODUCTION
// account supplies real structure geometry, swap this for that data upstream —
// the 3D builder consumes the returned triangles either way.
export function synthesizeWalls(model: RoofModel, gz: number): Vec3[] {
  const idx = buildIndexes(model);
  const span = model.totals.bounds.maxZ - model.totals.bounds.minZ;
  const eps = (span || 1) * 0.001;
  const tris: Vec3[] = [];
  for (const l of model.lines) {
    if (l.type !== "EAVE" && l.type !== "RAKE") continue;
    const A = idx.pointsById.get(l.aId);
    const B = idx.pointsById.get(l.bId);
    if (!A || !B) continue;
    if (A.z - gz < eps && B.z - gz < eps) continue; // already at ground
    const topA = { x: A.x, y: A.y, z: A.z };
    const topB = { x: B.x, y: B.y, z: B.z };
    const botA = { x: A.x, y: A.y, z: gz };
    const botB = { x: B.x, y: B.y, z: gz };
    tris.push(topA, botA, botB);
    tris.push(topA, botB, topB);
  }
  return tris;
}
