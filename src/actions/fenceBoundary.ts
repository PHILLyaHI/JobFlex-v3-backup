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
  properties?: Record<string, unknown>;
}
interface RegridResponse {
  parcels?: { features?: RegridFeature[] };
  features?: RegridFeature[];
  buildings?: { features?: RegridFeature[] };
}

// A nearby building footprint in lat/lng (client converts to local feet with the
// same origin it uses for the parcel ring, so both land in one frame).
export interface BuildingRing {
  ring: LatLngPoint[];
  heightFt: number;
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

// ── Building footprints ────────────────────────────────────────────────────
// Two sources, merged: Regrid's `buildings` collection (returned in the SAME
// point response as the parcels — survey-matched footprints, no extra request)
// and OSM Overpass as a free fill-in for neighbours Regrid misses. OSM often
// carries height / building:levels tags; everything else gets a one-story default.

const DEFAULT_BUILDING_FT = 13; // single-story walls + eave, in feet
const FT_PER_M = 3.28084;
const OSM_RADIUS_M = 130; // ≈ 425 ft — the subject lot + immediate neighbours
const MAX_BUILDINGS = 40;

function heightFromTags(tags: Record<string, unknown> | undefined): number {
  if (tags) {
    // OSM `height` is metres by default; honour an explicit ft/' suffix.
    const h = tags["height"];
    if (typeof h === "string" || typeof h === "number") {
      const s = String(h);
      const n = parseFloat(s);
      if (Number.isFinite(n) && n > 0) return /'|ft/i.test(s) ? n : n * FT_PER_M;
    }
    const levels = parseFloat(String(tags["building:levels"] ?? ""));
    if (Number.isFinite(levels) && levels > 0) return levels * 10 + 3; // 10 ft/story + roof structure
  }
  return DEFAULT_BUILDING_FT;
}

function regridBuildings(data: RegridResponse): BuildingRing[] {
  const feats = data.buildings?.features ?? [];
  const out: BuildingRing[] = [];
  for (const f of feats) {
    const ring = outerRing(f?.geometry);
    if (ring.length >= 3) out.push({ ring, heightFt: heightFromTags(f?.properties) });
  }
  return out;
}

interface OverpassElement {
  type?: string;
  geometry?: Array<{ lat?: number; lon?: number }>;
  tags?: Record<string, unknown>;
}

// Best-effort — public Overpass mirrors can be slow or down, so this fails soft
// to [] and never blocks the parcel result for long.
async function fetchOsmBuildings(lat: number, lng: number): Promise<BuildingRing[]> {
  try {
    const q = `[out:json][timeout:8];way["building"](around:${OSM_RADIUS_M},${lat},${lng});out geom ${MAX_BUILDINGS * 2};`;
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // Overpass mirrors 406/429 requests without a meaningful UA — required.
        "User-Agent": "JobFlex/3.0 (fence estimator; contact: support@jobflex.app)",
      },
      body: `data=${encodeURIComponent(q)}`,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { elements?: OverpassElement[] };
    const out: BuildingRing[] = [];
    for (const el of data.elements ?? []) {
      if (el.type !== "way" || !Array.isArray(el.geometry)) continue;
      const ring: LatLngPoint[] = [];
      for (const g of el.geometry) {
        if (typeof g?.lat === "number" && typeof g?.lon === "number") ring.push({ lat: g.lat, lng: g.lon });
      }
      if (ring.length >= 3) out.push({ ring, heightFt: heightFromTags(el.tags) });
    }
    return out;
  } catch {
    return [];
  }
}

function centroid(ring: LatLngPoint[]): LatLngPoint {
  let lat = 0;
  let lng = 0;
  for (const p of ring) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / ring.length, lng: lng / ring.length };
}

// Regrid footprints win; OSM ones are kept only where no Regrid footprint
// already covers that spot (centroid-in-ring test — cheap and good enough at
// house scale). Result is capped to the nearest MAX_BUILDINGS.
function mergeBuildings(primary: BuildingRing[], fill: BuildingRing[], lat: number, lng: number): BuildingRing[] {
  const merged = [...primary];
  for (const b of fill) {
    const c = centroid(b.ring);
    if (!primary.some((p) => pointInRing(c.lat, c.lng, p.ring))) merged.push(b);
  }
  const dist = (b: BuildingRing) => {
    const c = centroid(b.ring);
    return (c.lat - lat) ** 2 + (c.lng - lng) ** 2;
  };
  return merged.sort((a, b) => dist(a) - dist(b)).slice(0, MAX_BUILDINGS);
}

export async function fetchPropertyBoundary(
  lat: number,
  lng: number,
): Promise<
  | { ok: true; ring: LatLngPoint[]; buildings: BuildingRing[] }
  | { ok: false; error: string; buildings: BuildingRing[] }
> {
  await requireEstimatorOrManager();
  // OSM lookup runs concurrently with Regrid — it's independent and fail-soft.
  const osmPromise = fetchOsmBuildings(lat, lng);
  if (!isRegridEnabled()) {
    return {
      ok: false,
      error: "Set REGRID_API_KEY in .env.local to load property lines (get a key at regrid.com/api).",
      buildings: await osmPromise,
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
      return {
        ok: false,
        error: "Regrid rejected the key (401/403). Check REGRID_API_KEY.",
        buildings: await osmPromise,
      };
    }
    if (!res.ok) {
      return { ok: false, error: `Regrid request failed (${res.status}).`, buildings: await osmPromise };
    }
    const data = (await res.json()) as RegridResponse;
    const ring = extractRing(data, lat, lng);
    const buildings = mergeBuildings(regridBuildings(data), await osmPromise, lat, lng);
    if (ring.length < 3) {
      return {
        ok: false,
        error:
          "No parcel found here — your Regrid plan may not cover this area. Drop the pin inside the lot, or draw the fence manually.",
        buildings,
      };
    }
    return { ok: true, ring, buildings };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to load property lines.",
      buildings: await osmPromise.catch(() => []),
    };
  }
}
