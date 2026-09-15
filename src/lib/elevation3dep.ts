// USGS 3DEP bare-earth elevation — the ground under the trees and the houses.
//
// Why this and not Google first: Google's elevation model is canopy-
// contaminated. FenceScan measured a flat lot backing onto a wooded preserve at
// 52 ft of "rise" on Google where 3DEP reads ~5 ft, and a fence stepped down a
// hill that is not there. 3DEP rasters are lidar-derived DEMs with vegetation
// and buildings removed, free, keyless, and cover the US.
//
// Two details the service does not make obvious, both verified live
// (2026-09-14):
//   · With the default mosaic the service answers from the 1/3 arc-second
//     (~10 m) seamless layer even where a 1 m lidar project exists. Sorting the
//     mosaic by LowPS ascending puts the finest raster first, so a covered
//     point reads the 1 m project.
//   · Samples come back in raster order, not request order, each tagged with
//     its `locationId` (the index in the request). They are matched by that id;
//     a missing id is a coverage gap.
//
//   · Without `interpolation` the service answers nearest-neighbour: on a 10 m
//     or 30 m raster a 10 ft profile comes back as flat-flat-JUMP, and the
//     along-grade sum bills the jumps (a 30 % slope on 10 m data read 7 % long).
//     Bilinear resampling returns the ground between cell centres.
//
// Never a throw. A miss says WHY — `gap` (no coverage for some point, or the
// point is outside the US) versus `error` (the service failed this time) — so
// the caller can fall back to Google for both but only REMEMBER a fallback
// that was not caused by a passing outage.

const ENDPOINT =
  "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/getSamples";
/** Points per request. The POST body is ~25 bytes a point; 300 keeps a request
 *  small enough to answer inside the timeout on a slow day. */
const CHUNK = 300;
const TIMEOUT_MS = 12_000;
const FT_PER_M = 3.28084;
/** Metres in one degree of latitude — converts a geographic raster's cell size. */
const M_PER_DEG = 111_320;

export type Elevation3depResult =
  | {
      ok: true;
      elevFt: number[];
      /** The coarsest cell size any sample came from, in metres (1 ≈ lidar
       *  DEM, ~10 = 1/3 arc-second seamless layer). */
      resM: number;
    }
  | { ok: false; reason: "gap" | "error" };

type LatLng = { lat: number; lng: number };

/** 3DEP covers the US states and territories; anywhere else skip the round trip. */
export function in3depCoverage(p: LatLng): boolean {
  return p.lat > 17 && p.lat < 72 && ((p.lng > -180 && p.lng < -64) || p.lng > 170);
}

type ChunkResult = { ok: true; elevFt: number[]; resM: number } | { ok: false; reason: "gap" | "error" };

async function sampleChunk(points: LatLng[]): Promise<ChunkResult> {
  const body = new URLSearchParams({
    geometry: JSON.stringify({
      points: points.map((p) => [p.lng, p.lat]),
      spatialReference: { wkid: 4326 },
    }),
    geometryType: "esriGeometryMultipoint",
    returnFirstValueOnly: "true",
    interpolation: "RSP_BilinearInterpolation",
    mosaicRule: JSON.stringify({
      mosaicMethod: "esriMosaicAttribute",
      sortField: "LowPS",
      sortValue: "0",
      ascending: true,
    }),
    f: "json",
  });
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return { ok: false, reason: "error" };
  const data = (await res.json()) as {
    error?: unknown;
    samples?: Array<{ locationId?: number; value?: string | number; resolution?: number }>;
  };
  if (data.error || !Array.isArray(data.samples)) return { ok: false, reason: "error" };
  const elevFt: number[] = new Array(points.length).fill(NaN);
  let resM = 0;
  for (const s of data.samples) {
    const i = s.locationId;
    if (typeof i !== "number" || i < 0 || i >= points.length) continue;
    const v = typeof s.value === "number" ? s.value : Number.parseFloat(String(s.value));
    // NoData comes back as a string the parse turns into NaN; the service's
    // own fill value is a large negative.
    if (!Number.isFinite(v) || v < -1000) continue;
    elevFt[i] = Math.round(v * FT_PER_M * 100) / 100;
    const r = Number(s.resolution);
    if (Number.isFinite(r) && r > 0) {
      // Projected lidar DEMs report metres; the seamless layers report degrees.
      const m = r < 0.01 ? r * M_PER_DEG : r;
      if (m > resM) resM = m;
    }
  }
  if (elevFt.some((v) => !Number.isFinite(v))) return { ok: false, reason: "gap" }; // Google takes the batch
  return { ok: true, elevFt, resM };
}

/** Bare-earth elevation for every point, in request order — or why not. */
export async function sample3depElevations(points: LatLng[]): Promise<Elevation3depResult> {
  if (!points.length || !points.every(in3depCoverage)) return { ok: false, reason: "gap" };
  const chunks: LatLng[][] = [];
  for (let i = 0; i < points.length; i += CHUNK) chunks.push(points.slice(i, i + CHUNK));
  const out: ChunkResult[] = [];
  // A couple at a time: the service is shared public infrastructure.
  for (let i = 0; i < chunks.length; i += 2) {
    const batch = await Promise.all(
      chunks.slice(i, i + 2).map((c) =>
        sampleChunk(c).catch((): ChunkResult => ({ ok: false, reason: "error" })),
      ),
    );
    out.push(...batch);
  }
  const failed = out.find((c) => !c.ok);
  if (failed && !failed.ok) {
    // One chunk that errored makes the whole answer a passing failure.
    return { ok: false, reason: out.some((c) => !c.ok && c.reason === "error") ? "error" : "gap" };
  }
  const elevFt: number[] = [];
  let resM = 0;
  for (const c of out) {
    if (!c.ok) continue;
    elevFt.push(...c.elevFt);
    if (c.resM > resM) resM = c.resM;
  }
  return { ok: true, elevFt, resM: Math.round(resM * 10) / 10 };
}
