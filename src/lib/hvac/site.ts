// Site geometry for the HVAC estimator — pure, so the server action stays a
// thin lookup and the arithmetic is checked in scripts/qa/hvac-site.check.ts.
// A building ring (lat/lng, from the parcel/footprint lookup) becomes the
// numbers the load needs: floor area, perimeter and the bearing of each wall
// for the solar gain table.

import type { FootprintEdge } from "./types";

export interface LatLng { lat: number; lng: number }
/** A footprint ring; `heightTagged` says the height came from a real tag, not a one-storey default. */
export interface BuildingRing { ring: LatLng[]; heightFt?: number | null; heightTagged?: boolean }

const FT_PER_DEG_LAT = 364_000;

/** Area (sq ft), perimeter (ft) and wall edges of a ring. Local flat
 *  projection — fine at house scale. */
export function ringGeometry(ring: LatLng[]): { areaSqft: number; perimeterFt: number; edges: FootprintEdge[] } {
  if (ring.length < 3) return { areaSqft: 0, perimeterFt: 0, edges: [] };
  const lat0 = ring.reduce((a, p) => a + p.lat, 0) / ring.length;
  const kx = FT_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  const pts = ring.map((p) => ({ x: p.lng * kx, y: p.lat * FT_PER_DEG_LAT }));
  let area = 0;
  let perim = 0;
  const walls: Array<{ dirDeg: number; lengthFt: number }> = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    area += a.x * b.y - b.x * a.y;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    perim += len;
    walls.push({ dirDeg: (((Math.atan2(dx, dy) * 180) / Math.PI) + 360) % 360, lengthFt: Math.round(len * 10) / 10 });
  }
  // The solar table wants the direction each wall FACES, not the direction it
  // runs: an east–west wall faces north or south. The shoelace sign says
  // which way the ring is traced (positive = counter-clockwise in this
  // x-east / y-north frame), so the outward normal is the wall's direction
  // turned 90° to the right of travel on a counter-clockwise ring and to the
  // left on a clockwise one (review, 2026-09-17: the old code scored an
  // east–west wall as east or west glass).
  const ccw = area > 0;
  const edges: FootprintEdge[] = walls.map((w) => ({ bearingDeg: Math.round((w.dirDeg + (ccw ? 90 : 270)) % 360), lengthFt: w.lengthFt }));
  return { areaSqft: Math.round(Math.abs(area) / 2), perimeterFt: Math.round(perim), edges };
}

export function pointInRing(lat: number, lng: number, ring: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.lng > lng !== b.lng > lng && lat < ((b.lat - a.lat) * (lng - a.lng)) / (b.lng - a.lng) + a.lat) inside = !inside;
  }
  return inside;
}

/** The building the pin is in, else the nearest one by centroid; `inside`
 *  says which, so the page can ask for confirmation on a near miss. */
export function pickBuilding(buildings: BuildingRing[], lat: number, lng: number): { building: BuildingRing; inside: boolean } | null {
  if (!buildings.length) return null;
  const inside = buildings.find((b) => pointInRing(lat, lng, b.ring));
  if (inside) return { building: inside, inside: true };
  const dist = (b: BuildingRing) => {
    const c = b.ring.reduce((s, p) => ({ lat: s.lat + p.lat / b.ring.length, lng: s.lng + p.lng / b.ring.length }), { lat: 0, lng: 0 });
    return Math.hypot(c.lat - lat, (c.lng - lng) * Math.cos((lat * Math.PI) / 180));
  };
  const nearest = [...buildings].sort((a, b) => dist(a) - dist(b))[0];
  return { building: nearest, inside: false };
}

/** Storeys from a footprint record's height, 1–3. A tagged height is the
 *  ridge, not the eave: a ranch runs 16–20 ft, two storeys 26–30, so about
 *  10 ft a floor after the roof's 6 ft (building:levels arrives as
 *  levels × 10 + 3, which lands on the same ladder). */
export function storeysFromHeight(heightFt: number | null | undefined): number | undefined {
  if (!heightFt || heightFt <= 0) return undefined;
  return Math.max(1, Math.min(3, Math.round((heightFt - 6) / 10)));
}
