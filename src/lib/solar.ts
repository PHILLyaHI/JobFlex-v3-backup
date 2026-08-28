// Google Solar API client — building insights + the DSM/mask raster layers used
// to reconstruct a roof without ordering an EagleView report.
//
// SERVER-ONLY: reads GOOGLE_MAPS_API_KEY. Import it only from "use server"
// action files (mirrors how src/lib/maps.ts and src/lib/eagleview.ts are used).
//
// Gotchas, all verified against live responses for 419 Prairie Ridge Ln:
//
//  1. Solar API is a SEPARATELY enabled and separately billed Maps Platform
//     product. A key that geocodes fine still 403s here until "Solar API" is
//     enabled on its Cloud project.
//  2. The dataLayers response returns bare GCS-style URLs with NO credentials.
//     Each one must have `key=` appended before fetching — see fetchRaster().
//  3. The rasters are NOT lat/lng. They come back projected — UTM (EPSG:326xx /
//     327xx), units METRES, 0.1 m/px at HIGH quality. Treating getResolution()
//     as degrees is off by ~83000x. We stay in the raster's own metre grid and
//     never need a UTM→WGS84 inverse, because RoofModel is in local feet
//     relative to the building itself.
//  4. maskUrl covers EVERY building in the tile, not just the subject. At this
//     address the mask is 67k px (~7200 sqft) against a ~3300 sqft plan-view
//     roof — i.e. it includes neighbours. Callers MUST isolate the connected
//     component containing the tile centre (roofRecon.ts does this).
//  5. imageryDate can be years stale (2023-07 here). Surface it to the user;
//     a recent addition or re-roof will not exist in the data.

import { fromArrayBuffer } from "geotiff";

const SOLAR_BASE = "https://solar.googleapis.com/v1";

export function isSolarEnabled(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY);
}

// ── retry ────────────────────────────────────────────────────────────────────
// Measured, 2026-08-28: a single 15 s abort on ONE of these three calls threw
// away a whole reconstruction of 12629 NE 100th Pl — an address that had built
// 16 facets two days earlier and builds them now. There was no retry anywhere,
// the whole measurement gave up after 15.8 s of a 25 s budget, and the user saw
// a drawing captioned "no usable aerial elevation data for this address", which
// was false.
//
// The per-attempt ceiling stays at 15 s: it is the right answer to "this one
// request has hung". What was missing is a second ask.

/** How long ONE attempt may take. Unchanged — this was never the wrong number. */
export const SOLAR_TIMEOUT_MS = 15_000;
/** One try plus two retries. */
export const SOLAR_ATTEMPTS = 3;
/** First pause before retrying; doubles each time (1 s, 2 s). */
const SOLAR_BACKOFF_MS = 1_000;

/**
 * The worst case ONE Solar call can take under this policy. Exported because
 * the reconstruction deadline is derived from it rather than guessed: a caller
 * that allows less than this is cancelling its own retries.
 */
export const SOLAR_CALL_BUDGET_MS =
  SOLAR_ATTEMPTS * SOLAR_TIMEOUT_MS +
  Array.from({ length: SOLAR_ATTEMPTS - 1 }, (_, i) => SOLAR_BACKOFF_MS << i).reduce((a, b) => a + b, 0);

/** Why the Solar side could not answer — kept typed so the UI can tell the user. */
export type SolarFailureKind =
  /** The request hung or the network broke. Trying again is the right move. */
  | "timeout"
  /** Google says it has no high-resolution data here. Trying again changes nothing. */
  | "no-coverage"
  /** The key or its project is misconfigured. Ours to fix, not the user's. */
  | "config"
  /** Anything else Google returned. */
  | "error";

export class SolarUnavailableError extends Error {
  constructor(
    message: string,
    readonly kind: SolarFailureKind,
    readonly op: string,
  ) {
    super(message);
    this.name = "SolarUnavailableError";
  }
}

/**
 * A definitive status is an ANSWER, not a failure to answer: 404 means Google
 * has looked and has nothing here, 403 means the key is wrong. Asking twice
 * cannot change either, and retrying them would turn a 0.2 s "no" into a 48 s
 * one. Only 429 and 5xx — plus aborts and dropped connections — are worth a
 * second ask.
 */
const isWorthRetrying = (status: number): boolean => status === 429 || status >= 500;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * One Solar request, with retries. Returns the successful Response; the caller
 * reads the body. Every throw out of here is a SolarUnavailableError carrying
 * the kind, so callers never have to pattern-match on message text.
 */
async function solarFetch(url: string, op: string): Promise<Response> {
  let last: SolarUnavailableError | null = null;
  for (let attempt = 1; attempt <= SOLAR_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(SOLAR_TIMEOUT_MS) });
      if (res.ok) return res;
      if (!isWorthRetrying(res.status)) throw await solarError(res, op);
      last = new SolarUnavailableError(`Solar ${op} returned ${res.status}`, "error", op);
    } catch (err) {
      // A definitive status already came back as a SolarUnavailableError from
      // solarError(); it must not be swallowed into another attempt.
      if (err instanceof SolarUnavailableError && err.kind !== "timeout") throw err;
      last =
        err instanceof SolarUnavailableError
          ? err
          : new SolarUnavailableError(
              `Google Solar did not answer in ${SOLAR_TIMEOUT_MS / 1000}s (${op})`,
              "timeout",
              op,
            );
    }
    if (attempt < SOLAR_ATTEMPTS) {
      console.warn(`[solar] ${op} attempt ${attempt}/${SOLAR_ATTEMPTS} failed (${last?.message}) — retrying`);
      await sleep(SOLAR_BACKOFF_MS << (attempt - 1));
    }
  }
  throw last ?? new SolarUnavailableError(`Solar ${op} failed`, "error", op);
}

// ── Building insights ────────────────────────────────────────────────────────
// Google's own per-segment roof stats. We use these as a CROSS-CHECK and as a
// prior for plane clustering — not as geometry. Each segment carries only an
// axis-aligned boundingBox, which cannot draw a roof (the facets would be
// overlapping rectangles with no shared ridges).

export interface SolarDate {
  year?: number;
  month?: number;
  day?: number;
}

export interface SolarRoofSegment {
  pitchDegrees: number;
  azimuthDegrees: number;
  areaMeters2: number;
  centerLat: number;
  centerLng: number;
  planeHeightAtCenterMeters: number;
}

export interface BuildingInsights {
  imageryQuality: "HIGH" | "MEDIUM" | "LOW" | string;
  imageryDate: SolarDate | null;
  center: { lat: number; lng: number } | null;
  segments: SolarRoofSegment[];
  wholeRoofAreaM2: number | null;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};

// Defensive read of an unknown JSON tree — the Solar schema is stable but we
// never want a shape change to throw inside a server action.
type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export async function getBuildingInsights(
  lat: number,
  lng: number,
): Promise<BuildingInsights> {
  if (!isSolarEnabled()) throw new Error("Google Maps key is not configured");
  const url =
    `${SOLAR_BASE}/buildingInsights:findClosest` +
    `?location.latitude=${lat}&location.longitude=${lng}` +
    `&requiredQuality=HIGH&key=${process.env.GOOGLE_MAPS_API_KEY}`;
  const res = await solarFetch(url, "buildingInsights");
  const b = obj(await res.json());
  const sp = obj(b.solarPotential);
  const segments: SolarRoofSegment[] = arr(sp.roofSegmentStats)
    .map((raw) => {
      const s = obj(raw);
      const centre = obj(s.center);
      return {
        pitchDegrees: num(s.pitchDegrees),
        azimuthDegrees: num(s.azimuthDegrees),
        areaMeters2: num(obj(s.stats).areaMeters2),
        centerLat: num(centre.latitude),
        centerLng: num(centre.longitude),
        planeHeightAtCenterMeters: num(s.planeHeightAtCenterMeters),
      };
    })
    .filter((s) => s.areaMeters2 > 0);

  const centre = obj(b.center);
  const wholeRoof = obj(sp.wholeRoofStats);
  return {
    imageryQuality: String(b.imageryQuality ?? "UNKNOWN"),
    imageryDate: (b.imageryDate as SolarDate | undefined) ?? null,
    center: centre.latitude != null ? { lat: num(centre.latitude), lng: num(centre.longitude) } : null,
    segments,
    wholeRoofAreaM2: wholeRoof.areaMeters2 != null ? num(wholeRoof.areaMeters2) : null,
  };
}

// ── Data layers ──────────────────────────────────────────────────────────────

export interface DataLayerUrls {
  imageryQuality: string;
  imageryDate: SolarDate | null;
  dsmUrl: string | null;
  maskUrl: string | null;
  rgbUrl: string | null;
}

/**
 * The largest tile Google will serve. MEASURED, not from the docs: 95 and 100
 * return HIGH imagery with layer URLs, 105 and everything above return
 * `400 Request contains an invalid argument`. A property that needs more than
 * this cannot be covered by one Solar tile at all.
 */
export const SOLAR_MAX_RADIUS_M = 100;
/**
 * Radii are quantised to this. Two reasons, and the second is the interesting
 * one: (a) a house's contour does not need metre precision in its tile, and
 * (b) every distinct (lat, lng, radius, quality) is a distinct request to
 * Google, and the failure measurement of 2026-08-28 found that REPEATING one
 * tuple never failed (0 of 30) while walking many failed a third of the time.
 * Snapping the radius makes repeat measurements of an address land on the same
 * tuple instead of a near-miss, which is a reliability argument, not a tidiness
 * one.
 */
export const SOLAR_RADIUS_STEP_M = 5;
/**
 * What to ask for when nothing is known about the building — the recon-only
 * path, where no Instant contour exists to size the tile from. Unchanged from
 * when it was the only behaviour.
 */
export const SOLAR_DEFAULT_RADIUS_M = 40;

/** Snap up to a servable radius. */
export function quantiseRadiusM(metres: number): number {
  const stepped = Math.ceil(metres / SOLAR_RADIUS_STEP_M) * SOLAR_RADIUS_STEP_M;
  return Math.min(SOLAR_MAX_RADIUS_M, Math.max(SOLAR_RADIUS_STEP_M, stepped));
}

// radiusMeters was a fixed 40 — "comfortably larger than any residential roof".
// Measured on the six field addresses, that was 6-7x too many PIXELS for a
// suburban house (they need 15-20 m, and pixels go as the square of the radius)
// and too SMALL for a 20-building farm, which needs 105 m and so cannot be
// fully covered at all. Callers now size it from the contour; the default is
// kept for callers that have none.
export async function getDataLayers(
  lat: number,
  lng: number,
  radiusMeters: number = SOLAR_DEFAULT_RADIUS_M,
): Promise<DataLayerUrls> {
  if (!isSolarEnabled()) throw new Error("Google Maps key is not configured");
  const url =
    `${SOLAR_BASE}/dataLayers:get` +
    `?location.latitude=${lat}&location.longitude=${lng}` +
    `&radiusMeters=${radiusMeters}&view=FULL_LAYERS&requiredQuality=HIGH` +
    `&pixelSizeMeters=0.1&key=${process.env.GOOGLE_MAPS_API_KEY}`;
  const res = await solarFetch(url, "dataLayers");
  const d = obj(await res.json());
  const asUrl = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    imageryQuality: String(d.imageryQuality ?? "UNKNOWN"),
    imageryDate: (d.imageryDate as SolarDate | undefined) ?? null,
    dsmUrl: asUrl(d.dsmUrl),
    maskUrl: asUrl(d.maskUrl),
    rgbUrl: asUrl(d.rgbUrl),
  };
}

// ── Raster fetch + decode ────────────────────────────────────────────────────

export interface Raster {
  width: number;
  height: number;
  data: Float32Array; //   row-major, length = width * height
  pixelSizeM: number; //   metres per pixel (square pixels in practice)
  originX: number; //      projected easting of the top-left pixel corner
  originY: number; //      projected northing of the top-left pixel corner
  epsg: number | null; //  projected CRS code (e.g. 32616 = UTM 16N)
}

export async function fetchRaster(url: string): Promise<Raster> {
  if (!isSolarEnabled()) throw new Error("Google Maps key is not configured");
  // The layer URLs carry no credentials of their own (gotcha 2).
  const sep = url.includes("?") ? "&" : "?";
  const res = await solarFetch(`${url}${sep}key=${process.env.GOOGLE_MAPS_API_KEY}`, "raster");
  const buf = await res.arrayBuffer();
  const tiff = await fromArrayBuffer(buf);
  const img = await tiff.getImage();
  const [resX] = img.getResolution();
  const [originX, originY] = img.getOrigin();
  const bands = await img.readRasters();
  const first = (Array.isArray(bands) ? bands[0] : bands) as ArrayLike<number>;
  const geoKeys = (img.getGeoKeys?.() ?? {}) as Record<string, number>;

  // Copy into a Float32Array so downstream maths is uniform regardless of the
  // source sample format (DSM is float32, mask is uint8).
  const data = new Float32Array(first.length);
  for (let i = 0; i < first.length; i++) data[i] = first[i];

  return {
    width: img.getWidth(),
    height: img.getHeight(),
    data,
    pixelSizeM: Math.abs(resX),
    originX,
    originY,
    epsg: geoKeys.ProjectedCSTypeGeoKey ?? null,
  };
}

// Surface Google's own error text — a 403 here almost always means the Solar API
// is not enabled on the key's project, which is invisible from the UI otherwise.
async function solarError(res: Response, op: string): Promise<SolarUnavailableError> {
  let detail = "";
  try {
    const message = obj(obj(await res.json()).error).message;
    detail = typeof message === "string" ? message : "";
  } catch {
    /* non-JSON body */
  }
  if (res.status === 403) {
    return new SolarUnavailableError(
      `Google Solar API rejected this key (403). Enable "Solar API" for this key's Cloud project.${detail ? ` — ${detail}` : ""}`,
      "config",
      op,
    );
  }
  if (res.status === 404) {
    return new SolarUnavailableError(
      "Google has no high-resolution solar/roof data for this address. Order an EagleView report to measure it.",
      "no-coverage",
      op,
    );
  }
  return new SolarUnavailableError(
    `Solar ${op} failed (${res.status})${detail ? `: ${detail.slice(0, 160)}` : ""}`,
    "error",
    op,
  );
}
