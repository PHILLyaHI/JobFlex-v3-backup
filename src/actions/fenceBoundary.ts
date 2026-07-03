"use server";
// Property parcel boundary for the fence studio. Replaces the SAM 2 / aerial-trace
// approach with exact surveyed parcel polygons from Regrid (regrid.com/api): far
// more reliable than visual segmentation for thin/tree-covered fence lines.
// Stateless — requireEstimatorOrManager for auth only, no DB writes.
import { requireEstimatorOrManager } from "@/lib/orgContext";

// Private (not exported): a "use server" file may only export async functions.
function isRegridEnabled(): boolean {
  return Boolean(process.env.REGRID_API_KEY);
}

export interface LatLngPoint {
  lat: number;
  lng: number;
}

// Minimal, defensive GeoJSON shapes — Regrid wraps the FeatureCollection under
// `parcels` on the v1 API, but we also accept a bare FeatureCollection.
interface RegridGeometry {
  type?: string;
  coordinates?: unknown;
}
interface RegridFeature {
  geometry?: RegridGeometry;
}
interface RegridResponse {
  parcels?: { features?: RegridFeature[] };
  features?: RegridFeature[];
}

function asPair(c: unknown): [number, number] | null {
  return Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number" ? [c[0], c[1]] : null;
}

// A GeoJSON ring is [[lng,lat], ...] → our {lat,lng}[].
function ringToLatLng(ring: unknown): LatLngPoint[] {
  if (!Array.isArray(ring)) return [];
  const out: LatLngPoint[] = [];
  for (const c of ring) {
    const p = asPair(c);
    if (p) out.push({ lng: p[0], lat: p[1] });
  }
  return out;
}

// Outer ring of a Polygon, or the largest polygon's outer ring of a MultiPolygon.
function outerRing(geom: RegridGeometry | undefined): LatLngPoint[] {
  if (!geom || !Array.isArray(geom.coordinates)) return [];
  if (geom.type === "Polygon") {
    return ringToLatLng(geom.coordinates[0]);
  }
  if (geom.type === "MultiPolygon") {
    let best: LatLngPoint[] = [];
    for (const poly of geom.coordinates) {
      if (Array.isArray(poly)) {
        const ring = ringToLatLng(poly[0]);
        if (ring.length > best.length) best = ring;
      }
    }
    return best;
  }
  return [];
}

// Ray-casting point-in-polygon (ring in {lat,lng}).
function pointInRing(lat: number, lng: number, ring: LatLngPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng;
    const yi = ring[i].lat;
    const xj = ring[j].lng;
    const yj = ring[j].lat;
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function extractRing(data: RegridResponse, lat: number, lng: number): LatLngPoint[] {
  const features = data.parcels?.features ?? data.features ?? [];
  const rings = features.map((f) => outerRing(f?.geometry)).filter((r) => r.length >= 3);
  if (rings.length === 0) return [];
  // The point endpoint can return neighbouring parcels within its default radius,
  // so prefer the parcel that actually CONTAINS the queried point.
  return rings.find((r) => pointInRing(lat, lng, r)) ?? rings[0];
}

export async function fetchPropertyBoundary(
  lat: number,
  lng: number,
): Promise<{ ok: true; ring: LatLngPoint[] } | { ok: false; error: string }> {
  await requireEstimatorOrManager();
  if (!isRegridEnabled()) {
    return {
      ok: false,
      error: "Set REGRID_API_KEY in .env.local to load property lines (get a key at regrid.com/api).",
    };
  }
  try {
    // v2 point endpoint (v1 is gone → 404). Returns { parcels: FeatureCollection,
    // buildings, zoning }; requires lat + lon (NOT lng). Note: results are limited
    // to the area your Regrid plan covers — out-of-coverage points return 200 with
    // empty features.
    const url = `https://app.regrid.com/api/v2/parcels/point.json?lat=${lat}&lon=${lng}&token=${encodeURIComponent(
      process.env.REGRID_API_KEY as string,
    )}`;
    const res = await fetch(url);
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Regrid rejected the key (401/403). Check REGRID_API_KEY." };
    }
    if (!res.ok) return { ok: false, error: `Regrid request failed (${res.status}).` };
    const data = (await res.json()) as RegridResponse;
    const ring = extractRing(data, lat, lng);
    if (ring.length < 3) {
      return {
        ok: false,
        error:
          "No parcel found here — your Regrid plan may not cover this area. Drop the pin inside the lot, or draw the fence manually.",
      };
    }
    return { ok: true, ring };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to load property lines." };
  }
}
