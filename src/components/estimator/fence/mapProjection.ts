// Pure lat/lng ↔ local-feet conversion for the draw map. Equirectangular about
// the property origin: zoom-independent and accurate at property scale (a few
// hundred feet — the small-angle error is negligible for a yard). +x east,
// +y north, matching fenceGeometry's local frame.
import type { PathPoint } from "./fenceTypes";

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
