"use server";
// Ground elevation profile for the fence studio — Google Elevation API.
//
// The studio samples the traced line about every 10 ft and sends the points
// here; the answer is DTM-like ground elevation (not a surface model, so trees
// along the fence line do not poison it — the reason this API was chosen over
// the Solar DSM already in the project). Costs a fraction of a cent per
// profile; cached on disk by the rounded point list, so re-profiling an
// unchanged line is free forever.
//
// Failure is a value, not a throw: the studio prices the fence off the plan
// length either way, and says so in the proposal's assumptions.
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { requireEstimatorOrManager } from "@/lib/orgContext";
import { enforceRateLimit, HOUR } from "@/lib/rateLimit";

const CACHE_DIR = join(process.cwd(), ".cache", "elevation");
/** Matches the client's MAX_PROFILE_SAMPLES with headroom — a request larger
 *  than this is a bug, not a big fence. */
const MAX_POINTS = 800;
/** Elevation API `locations` per request — keeps the GET URL well under limits. */
const CHUNK = 200;
const FT_PER_M = 3.28084;

export type ElevationProfileResult =
  | { ok: true; elevFt: number[]; cached: boolean }
  | { ok: false; error: string };

export async function fetchElevationProfile(
  points: Array<{ lat: number; lng: number }>,
): Promise<ElevationProfileResult> {
  const { organizationId } = await requireEstimatorOrManager();
  if (!Array.isArray(points) || points.length < 2) {
    return { ok: false, error: "A profile needs at least two points" };
  }
  if (points.length > MAX_POINTS) {
    return { ok: false, error: `Too many samples (${points.length} > ${MAX_POINTS})` };
  }
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { ok: false, error: "Google Maps is not configured (GOOGLE_MAPS_API_KEY)" };

  // 6 decimals ≈ 0.1 m — the cache key and the queried coordinates are the
  // same rounded set, so a vertex nudged less than that re-uses the answer.
  const rounded = points.map((p) => ({
    lat: Math.round(Number(p.lat) * 1e6) / 1e6,
    lng: Math.round(Number(p.lng) * 1e6) / 1e6,
  }));
  for (const p of rounded) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) {
      return { ok: false, error: "Malformed coordinate in the profile request" };
    }
  }

  const hash = createHash("sha256").update(JSON.stringify(rounded)).digest("hex").slice(0, 32);
  const file = join(CACHE_DIR, `${hash}.json`);
  try {
    const cached = JSON.parse(await fs.readFile(file, "utf8")) as number[];
    if (Array.isArray(cached) && cached.length === rounded.length) {
      return { ok: true, elevFt: cached, cached: true };
    }
  } catch {
    /* miss — fetch below */
  }

  await enforceRateLimit(`elevation:${organizationId}`, 120, HOUR, "elevation lookups");

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

  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(file, JSON.stringify(elevFt));
  } catch {
    /* cache is an optimisation; a failed write costs one repeat request */
  }
  return { ok: true, elevFt, cached: false };
}
