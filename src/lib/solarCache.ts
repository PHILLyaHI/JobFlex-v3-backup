// Google Solar answers, frozen per place.
//
// Why this exists: before it, EVERY measurement re-fetched all three Solar
// calls live, including a second measurement of an address measured a minute
// earlier. On 2026-08-28 one of those fetches hung, the reconstruction was
// dropped, and 12629 NE 100th Pl — a house that had built 16 facets two days
// before — came out as a bare outline stamped "no usable aerial elevation data
// for this address". Retries (solar.ts) make that unlikely; this makes it
// impossible to repeat for an address we have already seen.
//
// Not organization-scoped, unlike the Instant ledger. An Instant lookup is
// billed to an org and its row is that org's receipt; Solar imagery is a
// property of the PLACE, and two orgs measuring the same house should share it.
import { gunzipSync, gzipSync } from "node:zlib";
import { db } from "@/lib/db";
import type { BuildingInsights, DataLayerUrls, Raster } from "@/lib/solar";

/**
 * Same normalisation as the Instant ledger's `instantAddressKey`, so the two
 * caches agree on what "the same address" means. Falls back to the pin when
 * there is no address text — rounded to five decimals, about 1 m, which is far
 * below the 40 m tile radius and so cannot straddle two different tiles.
 */
export function solarCacheKey(input: {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lng?: number;
}): string | null {
  const addr = [input.address, input.city, input.state, input.zip]
    .map((part) => (part ?? "").toUpperCase().replace(/\s+/g, " ").trim())
    .join("|");
  if (addr.replace(/\|/g, "")) return addr;
  if (input.lat != null && input.lng != null) return `@${input.lat.toFixed(5)},${input.lng.toFixed(5)}`;
  return null;
}

export interface CachedSolar {
  lat: number;
  lng: number;
  layers: DataLayerUrls;
  insights: BuildingInsights | null;
  dsm: Raster;
  mask: Raster;
}

/** Raster minus its pixels — the part that travels as JSON. */
type RasterMeta = Omit<Raster, "data">;

const packRaster = (r: Raster): { meta: string; data: Buffer } => {
  const { data, ...meta } = r;
  // Copy through a fresh view: a Float32Array can be a window onto a larger
  // buffer, and Buffer.from(view.buffer) would then store the whole thing.
  const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return { meta: JSON.stringify(meta as RasterMeta), data: gzipSync(bytes) };
};

const unpackRaster = (meta: string, data: Uint8Array): Raster => {
  const m = JSON.parse(meta) as RasterMeta;
  const raw = gunzipSync(Buffer.from(data));
  const out = new Float32Array(m.width * m.height);
  Buffer.from(out.buffer).set(raw.subarray(0, out.byteLength));
  return { ...m, data: out };
};

/**
 * The frozen answer for this place, or null. Never throws: a cache that fails
 * to read must cost a live fetch, not a measurement.
 */
export async function readSolarCache(key: string | null): Promise<CachedSolar | null> {
  if (!key) return null;
  try {
    const row = await db.solarCache.findUnique({ where: { addressKey: key } });
    if (!row) return null;
    return {
      lat: row.lat,
      lng: row.lng,
      layers: JSON.parse(row.layersJson) as DataLayerUrls,
      insights: row.insightsJson ? (JSON.parse(row.insightsJson) as BuildingInsights) : null,
      dsm: unpackRaster(row.dsmMetaJson, row.dsmData),
      mask: unpackRaster(row.maskMetaJson, row.maskData),
    };
  } catch (err) {
    console.warn("[solarCache] read failed, falling back to a live fetch:", err);
    return null;
  }
}

/** Freeze this place's answer. Never throws — a write failure is not the user's problem. */
export async function writeSolarCache(key: string | null, v: CachedSolar): Promise<void> {
  if (!key) return;
  try {
    const dsm = packRaster(v.dsm);
    const mask = packRaster(v.mask);
    const imageryDate = v.layers.imageryDate?.year
      ? `${v.layers.imageryDate.year}-${String(v.layers.imageryDate.month ?? 1).padStart(2, "0")}-${String(v.layers.imageryDate.day ?? 1).padStart(2, "0")}`
      : null;
    const data = {
      lat: v.lat,
      lng: v.lng,
      layersJson: JSON.stringify(v.layers),
      insightsJson: v.insights ? JSON.stringify(v.insights) : null,
      dsmMetaJson: dsm.meta,
      maskMetaJson: mask.meta,
      dsmData: dsm.data,
      maskData: mask.data,
      imageryDate,
    };
    await db.solarCache.upsert({ where: { addressKey: key }, create: { addressKey: key, ...data }, update: data });
  } catch (err) {
    console.warn("[solarCache] write failed, the measurement is unaffected:", err);
  }
}

/** Drop one place's frozen answer — the escape hatch behind a forced re-measure. */
export async function clearSolarCache(key: string | null): Promise<void> {
  if (!key) return;
  try {
    await db.solarCache.deleteMany({ where: { addressKey: key } });
  } catch (err) {
    console.warn("[solarCache] clear failed:", err);
  }
}
