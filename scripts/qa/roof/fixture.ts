/** Offline loader for the frozen QA roofs. No network, no Google Solar. */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";

import type { RoofModel } from "../../../src/lib/eagleview";
import type { Raster } from "../../../src/lib/solar";

export const FIXTURE_DIR = resolve("scripts/qa/roof/fixtures");

export interface FixtureMeta {
  slug: string;
  note: string;
  address: { address: string; city: string; state: string; zip: string };
  origin: { lat: number; lng: number };
  raster: { width: number; height: number; pixelSizeM: number };
  googleAreaSqft: number | null;
  multiStructure: boolean;
  excludedSqft: number[];
  pitchPriors12: number[];
  diagnostics: Record<string, unknown>;
  /** Parcel ring (lat/lng), frozen so component selection runs offline. */
  parcelRing?: Array<{ lat: number; lng: number }>;
}

export interface Fixture {
  slug: string;
  meta: FixtureMeta;
  dsm: Raster;
  mask: Raster;
  model: RoofModel;
}

function raster(file: string, meta: FixtureMeta): Raster {
  const buf = gunzipSync(readFileSync(file));
  const data = new Float32Array(meta.raster.width * meta.raster.height);
  Buffer.from(data.buffer).set(buf);
  return { width: meta.raster.width, height: meta.raster.height, pixelSizeM: meta.raster.pixelSizeM, data } as Raster;
}

export function loadFixture(slug: string): Fixture {
  const dir = resolve(FIXTURE_DIR, slug);
  const meta = JSON.parse(readFileSync(resolve(dir, "meta.json"), "utf8")) as FixtureMeta;
  return {
    slug,
    meta,
    dsm: raster(resolve(dir, "dsm.f32.gz"), meta),
    mask: raster(resolve(dir, "mask.f32.gz"), meta),
    model: JSON.parse(readFileSync(resolve(dir, "model.json"), "utf8")) as RoofModel,
  };
}

export function fixtureSlugs(filter?: string): string[] {
  if (!existsSync(FIXTURE_DIR)) return [];
  return readdirSync(FIXTURE_DIR)
    .filter((s) => existsSync(resolve(FIXTURE_DIR, s, "meta.json")))
    .filter((s) => !filter || s.includes(filter));
}
