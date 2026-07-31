// Pure lat/lng ↔ local-feet conversion for the draw map. Equirectangular about
// the property origin: zoom-independent and accurate at property scale (a few
// hundred feet — the small-angle error is negligible for a yard). +x east,
// +y north, matching fenceGeometry's local frame.
import type { BuildingFootprint, PathPoint } from "./fenceTypes";

export interface LatLng {
  lat: number;
  lng: number;
}

const FT_PER_M = 3.28084;
const EARTH_R_M = 6378137; // WGS84 mean radius
const D2R = Math.PI / 180;

export function latLngToLocalFeet(origin: LatLng, p: LatLng): PathPoint {
  const dLat = (p.lat - origin.lat) * D2R;
  const dLng = (p.lng - origin.lng) * D2R;
  const east = dLng * Math.cos(origin.lat * D2R) * EARTH_R_M;
  const north = dLat * EARTH_R_M;
  return { x: east * FT_PER_M, y: north * FT_PER_M };
}

export function localFeetToLatLng(origin: LatLng, p: PathPoint): LatLng {
  const east = p.x / FT_PER_M;
  const north = p.y / FT_PER_M;
  const dLat = north / EARTH_R_M;
  const dLng = east / (EARTH_R_M * Math.cos(origin.lat * D2R));
  return { lat: origin.lat + dLat / D2R, lng: origin.lng + dLng / D2R };
}

export function pathToFeet(origin: LatLng, pts: LatLng[]): PathPoint[] {
  return pts.map((p) => latLngToLocalFeet(origin, p));
}

export function pathToLatLng(origin: LatLng, pts: PathPoint[]): LatLng[] {
  return pts.map((p) => localFeetToLatLng(origin, p));
}

// Ray-casting point-in-polygon in local feet (ring open or closed).
export function pointInRingFt(p: PathPoint, ring: PathPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x;
    const yi = ring[i].y;
    const xj = ring[j].x;
    const yj = ring[j].y;
    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function ringCentroidFt(ring: PathPoint[]): PathPoint {
  let x = 0;
  let y = 0;
  for (const p of ring) {
    x += p.x;
    y += p.y;
  }
  const n = Math.max(1, ring.length);
  return { x: x / n, y: y / n };
}

function perpDistance(p: PathPoint, a: PathPoint, b: PathPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Douglas–Peucker simplification in local feet — trims redundant parcel vertices
// (Regrid polygons can be detailed) so the editable polyline stays manageable,
// without distorting the shape. Endpoints are always kept (preserves a closed ring).
export function simplifyPath(points: PathPoint[], toleranceFt: number): PathPoint[] {
  if (points.length <= 3) return points.slice();
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const seg = stack.pop();
    if (!seg) break;
    const [s, e] = seg;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDistance(points[i], points[s], points[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > toleranceFt && idx > 0) {
      keep[idx] = true;
      stack.push([s, idx]);
      stack.push([idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Buildings keep more corner fidelity than the editable parcel outline. */
export const BUILDING_SIMPLIFY_FT = 0.5;

// Convert fetched building rings (lat/lng) into local-feet footprints, tagging the
// ones on the subject parcel. Without a parcel ring, the building containing the
// address pin (local origin) is the subject.
//
// Typed structurally rather than against `@/actions/fenceBoundary`'s BuildingRing
// so this module keeps no dependency on an action; the action's type satisfies it.
// Lives here, beside the projection helpers it is built from, because BOTH fence
// surfaces need it — the sage studio (FenceStudio) and the blueprint studio's
// 3D island — and it was previously private to the first of them.
export function buildingsToFootprints(
  raw: Array<{ ring: LatLng[]; heightFt: number }>,
  origin: LatLng,
  parcelFt: PathPoint[] | null,
): BuildingFootprint[] {
  const out: BuildingFootprint[] = [];
  for (const b of raw) {
    const ring = simplifyPath(
      b.ring.map((ll) => latLngToLocalFeet(origin, ll)),
      BUILDING_SIMPLIFY_FT,
    );
    if (ring.length < 3) continue;
    const subject = parcelFt
      ? pointInRingFt(ringCentroidFt(ring), parcelFt)
      : pointInRingFt({ x: 0, y: 0 }, ring);
    out.push({ ring, heightFt: b.heightFt, role: subject ? "subject" : "neighbor" });
  }
  return out;
}
