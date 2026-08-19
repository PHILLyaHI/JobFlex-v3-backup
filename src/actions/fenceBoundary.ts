"use server";
// Property parcel boundary for the fence studio. Replaces the SAM 2 / aerial-trace
// approach with exact surveyed parcel polygons from Regrid (regrid.com/api): far
// more reliable than visual segmentation for thin/tree-covered fence lines.
// Stateless — requireEstimatorOrManager for auth only, no DB writes.
import { requireEstimatorOrManager } from "@/lib/orgContext";
// Parcel parsing lives in @/lib/parcel so the roof reconstruction and the
// out-of-request eval script can share it (a "use server" file may only export
// async functions, so these could not be exported from here).
import {
  isRegridEnabled,
  outerRing,
  pointInRing,
  extractRing,
  fetchRegridPoint,
  type LatLngPoint,
  type RegridResponse,
} from "@/lib/parcel";
// The street centrelines this action now returns are consumed by the parcel
// geometry lib, which owns the type.
import type { RoadLine } from "@/lib/parcels";

export type { LatLngPoint };

// A nearby building footprint in lat/lng (client converts to local feet with the
// same origin it uses for the parcel ring, so both land in one frame).
export interface BuildingRing {
  ring: LatLngPoint[];
  heightFt: number;
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

// ── Streets ────────────────────────────────────────────────────────────────
// Which side of a lot faces the street is decided by where the ROAD is, and OSM
// already has the road centrelines. They ride along in the SAME Overpass query
// the building footprints use — one round trip, one bbox, no extra service.

/** OSM `highway` values that are not a street a fence would front onto. A
 *  `service` way counts only when it is a driveway: an alley or a parking aisle
 *  behind a lot would otherwise read as its frontage. */
const NON_STREET_HIGHWAYS = new Set([
  "footway",
  "path",
  "cycleway",
  "steps",
  "track",
  "bridleway",
  "corridor",
  "pedestrian",
  "proposed",
  "construction",
  "raceway",
  "platform",
]);

function isStreet(tags: Record<string, unknown> | undefined): boolean {
  const h = tags?.["highway"];
  if (typeof h !== "string" || NON_STREET_HIGHWAYS.has(h)) return false;
  if (h === "service") return String(tags?.["service"] ?? "") === "driveway";
  return true;
}

const MAX_ROADS = 40;

// Best-effort — public Overpass mirrors can be slow or down, so this fails soft
// to empty and never blocks the parcel result for long.
async function fetchOsmContext(
  lat: number,
  lng: number,
): Promise<{ buildings: BuildingRing[]; roads: RoadLine[] }> {
  const empty = { buildings: [] as BuildingRing[], roads: [] as RoadLine[] };
  try {
    // One union query: footprints AND street centrelines in the same bbox.
    const q =
      `[out:json][timeout:10];(` +
      `way["building"](around:${OSM_RADIUS_M},${lat},${lng});` +
      `way["highway"](around:${OSM_RADIUS_M},${lat},${lng});` +
      `);out geom ${(MAX_BUILDINGS + MAX_ROADS) * 2};`;
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // Overpass mirrors 406/429 requests without a meaningful UA — required.
        "User-Agent": "JobFlex/3.0 (fence estimator; contact: support@jobflex.app)",
      },
      body: `data=${encodeURIComponent(q)}`,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return empty;
    const data = (await res.json()) as { elements?: OverpassElement[] };
    const buildings: BuildingRing[] = [];
    const roads: RoadLine[] = [];
    for (const el of data.elements ?? []) {
      if (el.type !== "way" || !Array.isArray(el.geometry)) continue;
      const pts: Array<[number, number]> = [];
      for (const g of el.geometry) {
        if (typeof g?.lat === "number" && typeof g?.lon === "number") pts.push([g.lat, g.lon]);
      }
      if (isStreet(el.tags)) {
        // A centreline needs two points to be a line at all.
        if (pts.length >= 2 && roads.length < MAX_ROADS) {
          const name = el.tags?.["name"];
          roads.push({ name: typeof name === "string" ? name : null, points: pts });
        }
        continue;
      }
      if (el.tags?.["building"] === undefined) continue;
      if (pts.length >= 3) {
        buildings.push({
          ring: pts.map(([la, ln]) => ({ lat: la, lng: ln })),
          heightFt: heightFromTags(el.tags),
        });
      }
    }
    return { buildings, roads };
  } catch {
    return empty;
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

/**
 * Site context for a point: the Regrid parcel ring (when a key is configured),
 * nearby building footprints, and the STREET centrelines around the lot.
 *
 * `roads` is the signal the fence studio uses to decide which side of a parcel
 * faces the street. It is independent of `ok`: a Regrid failure says nothing
 * about OSM, and the front-side decision must not be collateral damage.
 */
export async function fetchPropertyBoundary(
  lat: number,
  lng: number,
): Promise<
  | { ok: true; ring: LatLngPoint[]; buildings: BuildingRing[]; roads: RoadLine[] }
  | { ok: false; error: string; buildings: BuildingRing[]; roads: RoadLine[] }
> {
  await requireEstimatorOrManager();
  // OSM lookup runs concurrently with Regrid — it's independent and fail-soft.
  const osmPromise = fetchOsmContext(lat, lng);
  if (!isRegridEnabled()) {
    const osm = await osmPromise;
    return {
      ok: false,
      error: "Set REGRID_API_KEY in .env.local to load property lines (get a key at regrid.com/api).",
      buildings: osm.buildings,
      roads: osm.roads,
    };
  }
  try {
    const { data, status } = await fetchRegridPoint(lat, lng);
    if (!data) {
      // Regrid tokens are 30-day JWTs, so 401/403 here usually means expired
      // rather than wrong — say so, otherwise this reads as a coverage problem.
      const error =
        status === 401 || status === 403
          ? "Regrid rejected the key (401/403) — the token is likely expired. Regrid issues 30-day tokens; mint a new one and update REGRID_API_KEY."
          : `Regrid request failed (${status || "no key"}).`;
      const osm = await osmPromise;
      return { ok: false, error, buildings: osm.buildings, roads: osm.roads };
    }
    const ring = extractRing(data, lat, lng);
    const osm = await osmPromise;
    const buildings = mergeBuildings(regridBuildings(data), osm.buildings, lat, lng);
    if (ring.length < 3) {
      return {
        ok: false,
        error:
          "No parcel found here — your Regrid plan may not cover this area. Drop the pin inside the lot, or draw the fence manually.",
        buildings,
        roads: osm.roads,
      };
    }
    return { ok: true, ring, buildings, roads: osm.roads };
  } catch (err) {
    const osm = await osmPromise.catch(() => ({ buildings: [], roads: [] }));
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to load property lines.",
      buildings: osm.buildings,
      roads: osm.roads,
    };
  }
}
