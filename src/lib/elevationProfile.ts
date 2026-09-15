// Ground elevation for the fence studio — ONE implementation behind two doors:
// the `fetchElevationProfile` server action (the traced fence's profile, which
// the price reads) and POST /api/fence/elevation (the lot's contour lattice,
// display only).
//
// Why two doors: Next runs a client's server actions one at a time. A 900-point
// contour lattice sent as an action queued AHEAD of the fence profile — and of
// "Convert to proposal" — so the ticket billed flat plan footage for seconds
// while the ground under the fence was waiting behind a picture of the lot. A
// plain fetch to a route handler runs alongside instead.
//
// Source order: USGS 3DEP bare-earth first (lib/elevation3dep — lidar DEM
// where a project covers the lot, free, keyless, trees and houses removed),
// Google Elevation API second, for the whole batch, when 3DEP has a gap, the
// point is outside the US, or the service fails. Google's model is canopy-
// contaminated over woods — a wooded back line can read tens of feet of rise
// that is not there — which is why it is the fallback and not the default.
//
// Cached on disk by the rounded point list AND a cache version, so a profile
// first answered by Google before 3DEP existed here is never served back as
// if it were ground truth — and a Google answer caused by a passing 3DEP
// outage is not cached at all, so the next visit asks 3DEP again.
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { enforceRateLimit, HOUR } from "@/lib/rateLimit";
import { sample3depElevations } from "@/lib/elevation3dep";

const CACHE_DIR = join(process.cwd(), ".cache", "elevation");
/** Bumped whenever the meaning of a cached answer changes (v2: 3DEP first). */
const CACHE_VERSION = "v2";
/** Headroom over the client's two callers: a fence profile (≤ 2 samples per
 *  traced segment past MAX_PROFILE_SAMPLES) and the lot's topo lattice
 *  (≤ TOPO_MAX_POINTS = 900). A request larger than this is a bug. */
export const MAX_ELEVATION_POINTS = 1600;
/** Elevation API `locations` per request — keeps the GET URL well under limits. */
const CHUNK = 200;
const FT_PER_M = 3.28084;

export type ElevationSource = "usgs-3dep" | "google";

export type ElevationProfileResult =
  | {
      ok: true;
      elevFt: number[];
      cached: boolean;
      source: ElevationSource;
      /** 3DEP only: the coarsest cell size behind the answer, metres. */
      resM?: number;
    }
  | { ok: false; error: string };

interface CacheEntry {
  source: ElevationSource;
  resM?: number;
  elevFt: number[];
}

/** Elevation for every point, in order. Throws only `RateLimitError`. */
export async function elevationForPoints(
  points: Array<{ lat: number; lng: number }>,
  organizationId: string,
): Promise<ElevationProfileResult> {
  if (!Array.isArray(points) || points.length < 2) {
    return { ok: false, error: "A profile needs at least two points" };
  }
  if (points.length > MAX_ELEVATION_POINTS) {
    return { ok: false, error: `Too many samples (${points.length} > ${MAX_ELEVATION_POINTS})` };
  }

  // 6 decimals ≈ 0.1 m — the cache key and the queried coordinates are the
  // same rounded set, so a vertex nudged less than that re-uses the answer.
  const rounded = points.map((p) => ({
    lat: Math.round(Number(p?.lat) * 1e6) / 1e6,
    lng: Math.round(Number(p?.lng) * 1e6) / 1e6,
  }));
  for (const p of rounded) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) {
      return { ok: false, error: "Malformed coordinate in the profile request" };
    }
  }

  const hash = createHash("sha256")
    .update(CACHE_VERSION + JSON.stringify(rounded))
    .digest("hex")
    .slice(0, 32);
  const file = join(CACHE_DIR, `${hash}.json`);
  try {
    const cached = JSON.parse(await fs.readFile(file, "utf8")) as CacheEntry;
    if (
      cached &&
      Array.isArray(cached.elevFt) &&
      cached.elevFt.length === rounded.length &&
      (cached.source === "usgs-3dep" || cached.source === "google")
    ) {
      return { ok: true, elevFt: cached.elevFt, cached: true, source: cached.source, resM: cached.resM };
    }
  } catch {
    /* miss — fetch below */
  }

  await enforceRateLimit(`elevation:${organizationId}`, 120, HOUR, "elevation lookups");

  let entry: CacheEntry;
  let cacheable = true;
  const usgs = await sample3depElevations(rounded);
  if (usgs.ok && usgs.elevFt.length === rounded.length) {
    entry = { source: "usgs-3dep", resM: usgs.resM, elevFt: usgs.elevFt };
  } else {
    const google = await googleElevations(rounded);
    if (!google.ok) return google;
    entry = { source: "google", elevFt: google.elevFt };
    // A fallback forced by 3DEP failing THIS time is served, never remembered.
    cacheable = !(!usgs.ok && usgs.reason === "error");
  }

  if (cacheable) {
    try {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await fs.writeFile(file, JSON.stringify(entry));
    } catch {
      /* cache is an optimisation; a failed write costs one repeat request */
    }
  }
  return { ok: true, elevFt: entry.elevFt, cached: false, source: entry.source, resM: entry.resM };
}

async function googleElevations(
  rounded: Array<{ lat: number; lng: number }>,
): Promise<{ ok: true; elevFt: number[] } | { ok: false; error: string }> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return {
      ok: false,
      error: "Ground data unavailable (USGS had no answer and GOOGLE_MAPS_API_KEY is not set)",
    };
  }
  const elevFt: number[] = [];
  try {
    for (let i = 0; i < rounded.length; i += CHUNK) {
      const chunk = rounded.slice(i, i + CHUNK);
      const locations = chunk.map((p) => `${p.lat},${p.lng}`).join("|");
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/elevation/json?locations=${encodeURIComponent(locations)}&key=${key}`,
        { cache: "no-store", signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) return { ok: false, error: `Elevation API refused (${res.status})` };
      const data = (await res.json()) as {
        status?: string;
        error_message?: string;
        results?: Array<{ elevation?: number }>;
      };
      if (data.status !== "OK" || !data.results || data.results.length !== chunk.length) {
        return {
          ok: false,
          error:
            `Elevation API: ${data.status ?? "no answer"}` +
            (data.error_message ? ` — ${data.error_message.slice(0, 120)}` : ""),
        };
      }
      for (const r of data.results) {
        if (typeof r.elevation !== "number" || !Number.isFinite(r.elevation)) {
          return { ok: false, error: "Elevation API returned a gap in the profile" };
        }
        elevFt.push(Math.round(r.elevation * FT_PER_M * 100) / 100);
      }
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Elevation lookup failed",
    };
  }
  return { ok: true, elevFt };
}
