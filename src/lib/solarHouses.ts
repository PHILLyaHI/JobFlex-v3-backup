// HOUSE OUTLINES FROM GOOGLE'S AERIAL (2026-09-24) — server module.
//
// Owner: "when detecting the house perimeter it's not accurate — make it
// better and fix it." The outlines came from OpenStreetMap, traced off another
// aerial than the one on the map, and sat 2–5 ft off the roof in a different
// direction at every address (fence-estimator-behavior, 2026-09-20), which
// left the contractor dragging them into place. Google's Solar data layers
// carry a building MASK — 0.1 m pixels, every building in the tile, from
// Google's own aerial survey — which the roof estimator already turns into a
// regularised outline (roofRecon/footprint). This reads the same mask for the
// fence map: every structure in the tile, brought back from the raster's UTM
// grid to lat/lng properly (lib/utm — grid north sits up to ~3° off true
// north, a few feet at the tile edge), so it lands on the roof the map shows.
// OpenStreetMap stays the fallback where Google has no coverage, and lends its
// building heights either way.
//
// One Google call per address and radius, remembered in SyncState the way the
// OSM answer is (lib/overpassStore) — a real "no coverage here" too, since
// asking again changes nothing.

import { db } from "@/lib/db";
import { buildStructureFootprints } from "@/lib/roofRecon/footprint";
import { fetchRaster, getDataLayers, isSolarEnabled, quantiseRadiusM, SOLAR_DEFAULT_RADIUS_M, SolarUnavailableError, type Raster, type SolarDate } from "@/lib/solar";
import { parseUtmEpsg, utmToLatLng, utmZoneFor } from "@/lib/utm";

export type LatLng = { lat: number; lng: number };

export type SolarHouse = {
  ring: LatLng[];
  /** Plan area of the outline, sq ft. */
  areaSqft: number;
  /** The address pin falls inside this one. */
  underPin: boolean;
};

export type SolarHousesAnswer =
  | { ok: true; buildings: SolarHouse[]; imageryDate: string | null; imageryQuality: string; radiusM: number; cached: boolean }
  | { ok: false; reason: "off" | "no-coverage" | "failed"; error?: string };

const FT_PER_M = 3.28084;
const MAX_HOUSES = 60;
const KEY_PREFIX = "solar:houses:";
const VERSION = 1;

function pointInRing(p: LatLng, ring: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) inside = !inside;
  }
  return inside;
}

function centroid(ring: LatLng[]): LatLng {
  let lat = 0;
  let lng = 0;
  for (const p of ring) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / ring.length, lng: lng / ring.length };
}

const D2R = Math.PI / 180;
function metresBetween(a: LatLng, b: LatLng): number {
  const dx = (b.lng - a.lng) * D2R * Math.cos(((a.lat + b.lat) / 2) * D2R) * 6378137;
  const dy = (b.lat - a.lat) * D2R * 6378137;
  return Math.hypot(dx, dy);
}

/**
 * Every structure in a Solar mask as a lat/lng ring. Pure — the QA feeds it a
 * drawn raster. The footprint builder works in feet about the tile centre with
 * y north; a corner goes back to the raster's pixel grid, then to UTM through
 * the raster's own origin, then to lat/lng through the zone's inverse.
 */
export function maskToHouses(mask: Raster, pin: LatLng): SolarHouse[] {
  const zone = parseUtmEpsg(mask.epsg) ?? utmZoneFor(pin.lat, pin.lng);
  const stepFt = mask.pixelSizeM * FT_PER_M;
  const { width: w, height: h } = mask;
  const toLatLng = (p: { x: number; y: number }): LatLng => {
    const col = p.x / stepFt + w / 2; // pixel-corner columns from the left edge
    const row = h / 2 - p.y / stepFt; // rows from the top edge
    return utmToLatLng(mask.originX + col * mask.pixelSizeM, mask.originY - row * mask.pixelSizeM, zone);
  };
  const { structures } = buildStructureFootprints(mask, { keepAll: true, rawFallback: true });
  const out: SolarHouse[] = [];
  for (const s of structures) {
    if (!s.ring || s.ring.length < 3) continue;
    const ring = s.ring.map(toLatLng);
    out.push({ ring, areaSqft: Math.round(s.report.areaSqft || s.maskAreaSqft), underPin: pointInRing(pin, ring) });
  }
  const far = (x: SolarHouse) => metresBetween(pin, centroid(x.ring));
  return out.sort((a, b) => Number(b.underPin) - Number(a.underPin) || far(a) - far(b)).slice(0, MAX_HOUSES);
}

export type HeightedRing = { ring: LatLng[]; heightFt: number; heightTagged?: boolean };

/** What a building is when nobody says: single-storey walls plus an eave, in feet (as actions/fenceBoundary). */
export const DEFAULT_BUILDING_FT = 13;

/**
 * OpenStreetMap's heights on Google's outlines: the OSM building whose ring
 * holds the outline's centroid, else the nearest OSM centroid within 10 m,
 * else the one-storey default.
 */
export function withOsmHeights(houses: readonly SolarHouse[], osm: readonly HeightedRing[]): HeightedRing[] {
  return houses.map((h) => {
    const c = centroid(h.ring);
    let best: HeightedRing | null = null;
    let bestM = 10;
    for (const o of osm) {
      if (o.ring.length >= 3 && pointInRing(c, o.ring)) {
        best = o;
        break;
      }
      const m = o.ring.length ? metresBetween(c, centroid(o.ring)) : Infinity;
      if (m < bestM) {
        bestM = m;
        best = o;
      }
    }
    return { ring: h.ring, heightFt: best ? best.heightFt : DEFAULT_BUILDING_FT, heightTagged: best ? Boolean(best.heightTagged) : false };
  });
}

// ── the remembered answer ────────────────────────────────────────────────────

const keyFor = (pin: LatLng, radiusM: number) => `${KEY_PREFIX}${pin.lat.toFixed(5)},${pin.lng.toFixed(5)}#r${radiusM}`;

async function readStored(key: string): Promise<SolarHousesAnswer | null> {
  try {
    const row = await db.syncState.findUnique({ where: { key } });
    if (!row) return null;
    const parsed = JSON.parse(row.cursor) as { v?: number; answer?: SolarHousesAnswer };
    return parsed.v === VERSION && parsed.answer ? parsed.answer : null;
  } catch {
    return null;
  }
}

async function writeStored(key: string, answer: SolarHousesAnswer): Promise<void> {
  const cursor = JSON.stringify({ v: VERSION, at: new Date().toISOString(), answer });
  await db.syncState.upsert({ where: { key }, update: { cursor }, create: { key, cursor } }).catch(() => {});
}

const dateOf = (d: SolarDate | null): string | null =>
  d && typeof d.year === "number" && d.year > 0 ? `${d.year}-${String(d.month || 1).padStart(2, "0")}-${String(d.day || 1).padStart(2, "0")}` : null;

/**
 * The structures around a pin from Google's aerial building mask. Never
 * throws: no key, no coverage or a failed call is an `ok: false` the caller
 * keeps its OSM outlines over.
 */
export async function solarHousesAt(pin: LatLng, opts: { radiusM?: number; refresh?: boolean } = {}): Promise<SolarHousesAnswer> {
  if (!isSolarEnabled()) return { ok: false, reason: "off" };
  const radiusM = quantiseRadiusM(opts.radiusM ?? SOLAR_DEFAULT_RADIUS_M);
  const key = keyFor(pin, radiusM);
  if (!opts.refresh) {
    const kept = await readStored(key);
    if (kept) return kept.ok ? { ...kept, cached: true } : kept;
  }
  try {
    const layers = await getDataLayers(pin.lat, pin.lng, radiusM);
    if (!layers.maskUrl) {
      const none: SolarHousesAnswer = { ok: false, reason: "no-coverage" };
      await writeStored(key, none);
      return none;
    }
    const mask = await fetchRaster(layers.maskUrl);
    const answer: SolarHousesAnswer = {
      ok: true,
      buildings: maskToHouses(mask, pin),
      imageryDate: dateOf(layers.imageryDate),
      imageryQuality: layers.imageryQuality,
      radiusM,
      cached: false,
    };
    await writeStored(key, answer);
    return answer;
  } catch (err) {
    if (err instanceof SolarUnavailableError && err.kind === "no-coverage") {
      const none: SolarHousesAnswer = { ok: false, reason: "no-coverage" };
      await writeStored(key, none);
      return none;
    }
    return { ok: false, reason: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}
