// Roof diagram — WHERE IS THE ROOF? (vision)
//
// The height test in roofRegions.ts settles slabs and low decks for free, but
// not a raised deck, a carport or a pergola: those clear 5 ft and still are not
// roof. Only the imagery settles those, so this asks the vision model to
// outline the ROOF surfaces in the same masked ortho the outline trace uses —
// shingle, tile or metal over a building — and to leave out patios, decks,
// driveways, pools and pavement.
//
// The result is advisory and cheap to disbelieve: the regions are gated against
// the surveyed wall outline (a region set that misses the house is thrown away),
// they are cached per slug so recalibration is free, and with no key, no
// imagery, or a failed gate the caller simply runs without them.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { getOpenAI, getOpenAIModel, isOpenAIEnabled } from "@/lib/sdk/openai";
import {
  frameRingToNormalized,
  normalizedRingToFrame,
  pickImage,
  type OutlineImageCandidate,
  type OutlinePoint,
} from "./outlineVision";

export interface RoofRegionVisionInput {
  imagery: OutlineImageCandidate[];
  origin: { lat: number; lng: number };
  slug?: string;
  /** Surveyed wall rings (frame feet) — the prompt hint and the gate. */
  wallRings: OutlinePoint[][];
}

export interface RoofRegionVisionResult {
  regions: OutlinePoint[][];
  source: "vision" | "vision-cache" | "none";
  /** Share of the wall footprint the regions cover (the acceptance gate). */
  wallCoverage: number;
  reasons: string[];
}

interface RegionCache {
  slug: string;
  createdAt: string;
  model: string;
  origin: { lat: number; lng: number };
  imageIndex: number;
  regions: [number, number][][];
  wallCoverage: number;
  accepted: boolean;
}

/** A region set that covers less of the surveyed footprint than this is wrong
 *  about the house, not about the roof, and is discarded. */
const MIN_WALL_COVERAGE = 0.6;
const MAX_REGIONS = 6;
const MAX_CORNERS = 24;
const CACHE_DIR = () => resolve(process.cwd(), ".cache", "roof-diagram");

function buildPrompt(footprintHint: string): string {
  return [
    "You are looking straight down at one property in an aerial photo.",
    "",
    "Mark every area that is ROOF: a surface that covers a building — shingles,",
    "tile, metal, flat membrane. Include the house, attached garages, porch and",
    "dormer roofs.",
    "",
    "Do NOT mark: concrete patios or slabs, wooden decks, driveways, paths,",
    "pools, lawn, pavement, tree canopy, cars, or the shadow of any of these.",
    "A patio is level with the ground, has no eave line and often shows",
    "furniture or joints; a deck shows plank lines. Both are common right",
    "against the house — be strict there.",
    "",
    `The surveyed footprint of the building sits at roughly ${footprintHint} in`,
    "these coordinates; the roof normally covers it and overhangs it slightly.",
    "",
    "Coordinates: x to the right, y downward, both 0..1000 over the whole image.",
    "",
    'Answer with JSON only: {"regions": [[[x,y], [x,y], ...], ...]} — one closed',
    "polygon per roof area, corners in order, no repeated last point. If the",
    "roof is one connected area, return one polygon.",
  ].join("\n");
}

function parseRegions(text: string): [number, number][][] | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const raw = (parsed as { regions?: unknown }).regions;
  if (!Array.isArray(raw)) return null;
  const out: [number, number][][] = [];
  for (const poly of raw.slice(0, MAX_REGIONS)) {
    if (!Array.isArray(poly)) continue;
    const corners: [number, number][] = [];
    for (const c of poly.slice(0, MAX_CORNERS)) {
      const pair = Array.isArray(c) ? c : [(c as { x?: number })?.x, (c as { y?: number })?.y];
      const x = Number(pair[0]);
      const y = Number(pair[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      corners.push([Math.max(0, Math.min(1000, x)), Math.max(0, Math.min(1000, y))]);
    }
    if (corners.length >= 3) out.push(corners);
  }
  return out.length ? out : null;
}

const areaOf = (ring: OutlinePoint[]): number => {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
};

function pointInRing(p: { x: number; y: number }, ring: OutlinePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y) {
      const xi = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (Number.isFinite(xi) && p.x < xi) inside = !inside;
    }
  }
  return inside;
}

/** Share of the largest wall ring that the regions cover (0.5 ft raster). */
function wallCoverage(regions: OutlinePoint[][], wallRings: OutlinePoint[][]): number {
  const wall = wallRings.filter((r) => r.length >= 3).sort((a, b) => areaOf(b) - areaOf(a))[0];
  if (!wall || !regions.length) return 0;
  const xs = wall.map((p) => p.x);
  const ys = wall.map((p) => p.y);
  const step = 0.5;
  let inside = 0;
  let covered = 0;
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += step) {
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += step) {
      const p = { x, y };
      if (!pointInRing(p, wall)) continue;
      inside++;
      if (regions.some((r) => pointInRing(p, r))) covered++;
    }
  }
  return inside > 0 ? covered / inside : 0;
}

const cachePath = (slug: string) => resolve(CACHE_DIR(), `roof-regions-${slug}.json`);

export async function traceRoofRegions(
  input: RoofRegionVisionInput,
  opts: { force?: boolean } = {},
): Promise<RoofRegionVisionResult> {
  const reasons: string[] = [];
  const { slug, origin, wallRings } = input;

  if (slug && !opts.force && existsSync(cachePath(slug))) {
    try {
      const cached = JSON.parse(readFileSync(cachePath(slug), "utf8")) as RegionCache;
      if (cached.accepted && Array.isArray(cached.regions)) {
        const picked = await pickImage(input.imagery, origin, slug, reasons);
        if (picked) {
          const regions = cached.regions.map((r) => normalizedRingToFrame(r, picked.bbox, origin));
          return { regions, source: "vision-cache", wallCoverage: cached.wallCoverage, reasons };
        }
      }
    } catch {
      reasons.push("cached regions unreadable");
    }
  }

  if (!isOpenAIEnabled()) {
    reasons.push("openai disabled (no OPENAI_API_KEY)");
    return { regions: [], source: "none", wallCoverage: 0, reasons };
  }
  const picked = await pickImage(input.imagery, origin, slug, reasons);
  if (!picked) {
    reasons.push("no usable ortho");
    return { regions: [], source: "none", wallCoverage: 0, reasons };
  }

  const wall = wallRings.filter((r) => r.length >= 3).sort((a, b) => areaOf(b) - areaOf(a))[0];
  const hint = wall
    ? frameRingToNormalized(wall, picked.bbox, origin)
        .map(([x, y]) => `[${Math.round(x)},${Math.round(y)}]`)
        .join(" ")
    : "the centre of the image";

  const dataUrl = `data:${picked.contentType};base64,${Buffer.from(picked.bytes).toString("base64")}`;
  let text = "";
  try {
    const res = await getOpenAI().chat.completions.create({
      model: getOpenAIModel(),
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildPrompt(hint) },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
    });
    text = res.choices[0]?.message?.content ?? "";
  } catch (e) {
    reasons.push(`vision call failed: ${e instanceof Error ? e.message : String(e)}`);
    return { regions: [], source: "none", wallCoverage: 0, reasons };
  }

  const raw = parseRegions(text);
  if (!raw) {
    reasons.push("no parsable regions in the reply");
    return { regions: [], source: "none", wallCoverage: 0, reasons };
  }
  const regions = raw.map((r) => normalizedRingToFrame(r, picked.bbox, origin)).filter((r) => r.length >= 3);
  const coverage = wallCoverage(regions, wallRings);
  const accepted = coverage >= MIN_WALL_COVERAGE;
  if (!accepted) {
    reasons.push(`regions cover only ${(coverage * 100).toFixed(0)}% of the surveyed footprint (min ${MIN_WALL_COVERAGE * 100}%)`);
  }

  if (slug) {
    try {
      mkdirSync(CACHE_DIR(), { recursive: true });
      const payload: RegionCache = {
        slug,
        createdAt: new Date().toISOString(),
        model: getOpenAIModel(),
        origin,
        imageIndex: picked.index,
        regions: raw,
        wallCoverage: coverage,
        accepted,
      };
      writeFileSync(cachePath(slug), JSON.stringify(payload, null, 1));
    } catch {
      /* cache is best-effort */
    }
  }

  return accepted
    ? { regions, source: "vision", wallCoverage: coverage, reasons }
    : { regions: [], source: "none", wallCoverage: coverage, reasons };
}
