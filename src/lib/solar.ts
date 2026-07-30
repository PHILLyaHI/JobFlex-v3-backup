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
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw await solarError(res, "buildingInsights");
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

// radiusMeters 40 gives an 80 m tile — comfortably larger than any residential
// roof while keeping the raster at 800x800 (≈740 KB for the DSM).
export async function getDataLayers(
  lat: number,
  lng: number,
  radiusMeters = 40,
): Promise<DataLayerUrls> {
  if (!isSolarEnabled()) throw new Error("Google Maps key is not configured");
  const url =
    `${SOLAR_BASE}/dataLayers:get` +
    `?location.latitude=${lat}&location.longitude=${lng}` +
    `&radiusMeters=${radiusMeters}&view=FULL_LAYERS&requiredQuality=HIGH` +
    `&pixelSizeMeters=0.1&key=${process.env.GOOGLE_MAPS_API_KEY}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw await solarError(res, "dataLayers");
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
  const res = await fetch(`${url}${sep}key=${process.env.GOOGLE_MAPS_API_KEY}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Solar raster fetch failed (${res.status})`);
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
async function solarError(res: Response, op: string): Promise<Error> {
  let detail = "";
  try {
    const message = obj(obj(await res.json()).error).message;
    detail = typeof message === "string" ? message : "";
  } catch {
    /* non-JSON body */
  }
  if (res.status === 403) {
    return new Error(
      `Google Solar API rejected this key (403). Enable "Solar API" for this key's Cloud project.${detail ? ` — ${detail}` : ""}`,
    );
  }
  if (res.status === 404) {
    return new Error(
      "Google has no high-resolution solar/roof data for this address. Order an EagleView report to measure it.",
    );
  }
  return new Error(`Solar ${op} failed (${res.status})${detail ? `: ${detail.slice(0, 160)}` : ""}`);
}
