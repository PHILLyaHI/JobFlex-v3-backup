// Roof diagram — READ THE ROOF (top-model vision).
//
// One call to the strongest vision model on the account (gpt-5.4 by default;
// `ROOF_VISION_MODEL` overrides) that reads the roof the way a takeoff
// estimator does, and returns all three things at once:
//
//   • the OUTER edge of the roof,
//   • the INTERIOR lines between facets — ridge, hip, valley,
//   • the PENETRATIONS (chimney / vent / skylight) with their real size.
//
// Why one call and not three: the three answers constrain each other (a hip
// runs from an outer corner to a ridge end; a chimney sits on a facet, not on a
// crease), and a model that has to make them agree makes fewer of the mistakes
// each separate pass made on its own — the penetration pass used to hand back
// three "vents" of identical 6.2 × 8.5 ft, one of them off the roof entirely.
//
// Everything here is ADVISORY. The geometry pipeline never takes a line from
// this read on trust: the outline is gated against the surveyed footprint, the
// penetrations must land on a drawn facet at a plausible size, and the interior
// lines are used to CHECK what the reconstruction built (agreement is reported,
// not silently applied). With no key, no imagery or a failed gate, everything
// downstream behaves exactly as before.
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

export type InteriorLineType = "RIDGE" | "HIP" | "VALLEY";
export type PenetrationKind = "chimney" | "vent" | "skylight";

export interface StructureInteriorLine {
  a: OutlinePoint;
  b: OutlinePoint;
  type: InteriorLineType;
}

export interface StructurePenetration {
  /** Centre in frame feet. */
  x: number;
  y: number;
  wFt: number;
  hFt: number;
  kind: PenetrationKind;
  confidence: number;
}

export interface RoofStructureRead {
  outline: OutlinePoint[] | null;
  interior: StructureInteriorLine[];
  penetrations: StructurePenetration[];
  model: string;
  source: "vision" | "vision-cache" | "none";
  reasons: string[];
}

export interface RoofStructureInput {
  imagery: OutlineImageCandidate[];
  origin: { lat: number; lng: number };
  slug?: string;
  /** Surveyed wall rings (frame feet) — prompt hint and outline gate. */
  wallRings: OutlinePoint[][];
}

/** Plausible extents per kind, feet — a vent is not eight feet across. */
const SIZE_LIMITS: Record<PenetrationKind, { min: number; max: number }> = {
  vent: { min: 0.4, max: 3 },
  chimney: { min: 1, max: 8 },
  skylight: { min: 1.5, max: 10 },
};

const DEFAULT_MODEL = "gpt-5.4";
const MAX_INTERIOR = 60;
const MAX_PENETRATIONS = 24;
const CACHE_DIR = () => resolve(process.cwd(), ".cache", "roof-diagram");
const cachePath = (slug: string) => resolve(CACHE_DIR(), `roof-structure-${slug}.json`);

const structureModel = (): string => process.env.ROOF_VISION_MODEL || DEFAULT_MODEL;

interface RawRead {
  outline?: [number, number][];
  interior?: Array<{ a: [number, number]; b: [number, number]; type: string }>;
  penetrations?: Array<{ box: [number, number, number, number]; kind: string; confidence?: number }>;
}

interface StructureCache {
  slug: string;
  createdAt: string;
  model: string;
  origin: { lat: number; lng: number };
  imageIndex: number;
  raw: RawRead;
}

function buildPrompt(footprintHint: string): string {
  return [
    "You are a roof takeoff estimator reading a north-up aerial photo of ONE house.",
    "Read the roof the way you would to draw a measurement diagram.",
    "",
    "Return three things:",
    "",
    "1. outline — the OUTER edge of the roof (the eave and rake line all the way",
    "   round, including overhangs). Corners only, in order, no repeated last",
    "   point. Follow the real steps and bump-outs; do not smooth them away, and",
    "   do not include patios, decks, driveways or ground.",
    "",
    "2. interior — the lines WHERE TWO ROOF SLOPES MEET, each with its type:",
    '   "RIDGE" (horizontal, both slopes fall away from it),',
    '   "HIP" (runs down from a ridge end to an outer corner, slopes fall away),',
    '   "VALLEY" (runs down an inside corner, both slopes fall INTO it).',
    "   Give the two endpoints of each line. Do not include eaves or rakes here.",
    "",
    "3. penetrations — chimneys, roof vents and skylights, as tight boxes around",
    "   the object itself, NOT its shadow. Be exact about size: a plumbing vent",
    "   is under a foot across, a ridge vent is a long thin strip, a chimney is",
    "   two to five feet, a skylight two to six. If you are unsure whether",
    "   something is a penetration, leave it out.",
    "",
    `The surveyed footprint of the building sits at roughly ${footprintHint}.`,
    "",
    "Coordinates: x to the right, y downward, both 0..1000 over the whole image.",
    "",
    "Answer with JSON only:",
    '{"outline": [[x,y], ...],',
    ' "interior": [{"a":[x,y], "b":[x,y], "type":"RIDGE"}, ...],',
    ' "penetrations": [{"box":[x0,y0,x1,y1], "kind":"chimney", "confidence":0.9}, ...]}',
  ].join("\n");
}

function parseRead(text: string): RawRead | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as RawRead;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1000, n)) : NaN;
};

const areaOf = (ring: OutlinePoint[]): number => {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
};

export async function readRoofStructure(
  input: RoofStructureInput,
  opts: { force?: boolean } = {},
): Promise<RoofStructureRead> {
  const reasons: string[] = [];
  const { slug, origin, wallRings } = input;
  const empty = (source: RoofStructureRead["source"]): RoofStructureRead => ({
    outline: null,
    interior: [],
    penetrations: [],
    model: structureModel(),
    source,
    reasons,
  });

  let raw: RawRead | null = null;
  const picked = await pickImage(input.imagery, origin, slug, reasons);
  let cached = false;

  if (slug && !opts.force && existsSync(cachePath(slug))) {
    try {
      const c = JSON.parse(readFileSync(cachePath(slug), "utf8")) as StructureCache;
      if (c.raw) {
        raw = c.raw;
        cached = true;
      }
    } catch {
      reasons.push("cached structure read unreadable");
    }
  }

  if (!raw) {
    if (!isOpenAIEnabled()) {
      reasons.push("openai disabled (no OPENAI_API_KEY)");
      return empty("none");
    }
    if (!picked) {
      reasons.push("no usable ortho");
      return empty("none");
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
        model: structureModel(),
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
      const msg = e instanceof Error ? e.message : String(e);
      reasons.push(`${structureModel()} call failed: ${msg}`);
      // A model the account cannot reach is not a reason to lose the read.
      if (structureModel() !== getOpenAIModel()) {
        try {
          const res = await getOpenAI().chat.completions.create({
            model: getOpenAIModel(),
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
          reasons.push(`fell back to ${getOpenAIModel()}`);
        } catch (e2) {
          reasons.push(`fallback failed: ${e2 instanceof Error ? e2.message : String(e2)}`);
          return empty("none");
        }
      } else {
        return empty("none");
      }
    }
    raw = parseRead(text);
    if (!raw) {
      reasons.push("no parsable structure in the reply");
      return empty("none");
    }
    if (slug && picked) {
      try {
        mkdirSync(CACHE_DIR(), { recursive: true });
        const payload: StructureCache = {
          slug,
          createdAt: new Date().toISOString(),
          model: structureModel(),
          origin,
          imageIndex: picked.index,
          raw,
        };
        writeFileSync(cachePath(slug), JSON.stringify(payload, null, 1));
      } catch {
        /* cache is best-effort */
      }
    }
  }

  if (!picked) {
    reasons.push("no usable ortho to map the read into feet");
    return empty("none");
  }

  // ── map into the model frame ──
  const outlineRaw = (raw.outline ?? [])
    .map((c) => [num(c?.[0]), num(c?.[1])] as [number, number])
    .filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]));
  const outline = outlineRaw.length >= 4 ? normalizedRingToFrame(outlineRaw, picked.bbox, origin) : null;

  const interior: StructureInteriorLine[] = [];
  for (const seg of (raw.interior ?? []).slice(0, MAX_INTERIOR)) {
    const t = String(seg?.type ?? "").toUpperCase();
    if (t !== "RIDGE" && t !== "HIP" && t !== "VALLEY") continue;
    const ax = num(seg?.a?.[0]);
    const ay = num(seg?.a?.[1]);
    const bx = num(seg?.b?.[0]);
    const by = num(seg?.b?.[1]);
    if (![ax, ay, bx, by].every(Number.isFinite)) continue;
    const [a, b] = normalizedRingToFrame(
      [
        [ax, ay],
        [bx, by],
      ],
      picked.bbox,
      origin,
    );
    if (!a || !b) continue;
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1) continue;
    interior.push({ a, b, type: t });
  }

  const penetrations: StructurePenetration[] = [];
  for (const p of (raw.penetrations ?? []).slice(0, MAX_PENETRATIONS)) {
    const kind = String(p?.kind ?? "").toLowerCase() as PenetrationKind;
    if (!SIZE_LIMITS[kind]) continue;
    const box = (p?.box ?? []).map(num);
    if (box.length !== 4 || !box.every(Number.isFinite)) continue;
    const [x0, y0, x1, y1] = [Math.min(box[0], box[2]), Math.min(box[1], box[3]), Math.max(box[0], box[2]), Math.max(box[1], box[3])];
    const corners = normalizedRingToFrame(
      [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ],
      picked.bbox,
      origin,
    );
    if (corners.length !== 4) continue;
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    const wFt = Math.max(...xs) - Math.min(...xs);
    const hFt = Math.max(...ys) - Math.min(...ys);
    const extent = Math.max(wFt, hFt);
    const limit = SIZE_LIMITS[kind];
    if (!(extent >= limit.min && extent <= limit.max)) {
      reasons.push(`${kind} at ${extent.toFixed(1)} ft is outside ${limit.min}–${limit.max} ft — dropped`);
      continue;
    }
    penetrations.push({
      x: (Math.max(...xs) + Math.min(...xs)) / 2,
      y: (Math.max(...ys) + Math.min(...ys)) / 2,
      wFt,
      hFt,
      kind,
      confidence: Number.isFinite(Number(p?.confidence)) ? Math.max(0, Math.min(1, Number(p.confidence))) : 0.6,
    });
  }

  return {
    outline,
    interior,
    penetrations,
    model: structureModel(),
    source: cached ? "vision-cache" : "vision",
    reasons,
  };
}
