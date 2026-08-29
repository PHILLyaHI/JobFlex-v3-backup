// READ THE LAYOUT — five questions, in order, each seeing the last answer.
//
// This replaces asking one model, once, "find the ridges" over a masked Google
// ortho. What that produced, measured: 50% correct drain directions against 38%
// for random choice, one facet returned rotated 178 degrees, and self-reported
// blindness worse than chance on three houses of five. A source that weak is
// not merely unhelpful — without a geometric check it cannot even be filtered,
// because its own confidence does not track its correctness.
//
// FOUR CHANGES, each aimed at a measured failure:
//
//  1. Better pictures. EagleView's CLEAR ortho (0.164 ft/px on Kirkland, 0.091
//     on Prairie, shot 2026) instead of Google's masked one (0.328 ft/px, shot
//     2024), plus a contrast map that makes same-colour creases visible at all.
//  2. The survey, in the prompt. Areas, pitch, facet count, eave heights per
//     side, and our own measured plane bearings — each with its source and, for
//     EagleView's fields, EagleView's own confidence. A reader that knows the
//     roof is 7/12 and that its largest plane drains north-east cannot answer
//     "178 degrees off" without contradicting something it was told.
//  3. The right to refuse. An empty answer is a valid answer, and saying which
//     areas could not be read is a required field, not an apology. A variant of
//     this was run earlier on this branch — half as many lines, each with a
//     visual reason — and was never shipped.
//  4. Five DIFFERENT questions rather than one asked five times. Masses, then
//     gable-versus-hip, then main ridges, then valleys, then the facets and
//     which way each drains. Different questions make different mistakes; the
//     same question repeated makes the same one.
//
// The last pass exists for MEASURABILITY. Lines are what a drawing needs, but a
// line can only be scored where two different trusted planes sit on its two
// sides, and this data yields 2-7 such lines per house — too few to conclude
// anything from. A facet with a named downhill direction is one judgeable case
// each, which is how the earlier read produced 22 cases from five houses. Same
// output shape, same metric, comparable number.
//
// EVERYTHING HERE IS A PROPOSAL. Nothing from this read reaches a drawing until
// the geometric gate has passed it.
import { getOpenAI, isOpenAIEnabled } from "@/lib/sdk/openai";
import { buildRoofBrief, type OurMeasurements } from "./roofLayoutBrief";
import type { InstantRoofData, InstantStructure } from "@/lib/eagleview";

export type LayoutLineType = "RIDGE" | "HIP" | "VALLEY" | "RAKE" | "EAVE" | "STEPFLASH";

export interface LayoutLine {
  a: { x: number; y: number };
  b: { x: number; y: number };
  type: LayoutLineType;
  /** WHY, in words — what in the picture says this line is here. */
  cue: string;
  /** The reader's own confidence, 0-1. Recorded, never trusted on its own. */
  confidence: number;
  /** Which pass proposed it. */
  pass: string;
}

export interface UnreadableArea {
  /** Where, in the same frame feet. */
  where: { x: number; y: number };
  radiusFt: number;
  why: string;
}

/**
 * A facet with a named downhill direction — the SAME shape the earlier read
 * produced, on purpose. It is the only output of a vision pass that can be
 * scored densely: every facet is one judgeable case, whereas a line needs two
 * different trusted planes on its two sides and this data yields only 2-7 such
 * lines per house. Keeping the shape means the proven downhill-check metric
 * applies unchanged and the new number is commensurable with the old 50%.
 */
export interface LayoutFacet {
  /** Plan polygon, frame feet. */
  polygon: Array<{ x: number; y: number }>;
  /** One of the eight compass points, the way water runs off it. */
  downhill: string;
  cue: string;
  confidence: number;
}

export interface LayoutRead {
  masses: Array<{ label: string; note: string }>;
  lines: LayoutLine[];
  /** Facets with named drainage — for measurement, not for drawing. */
  facets: LayoutFacet[];
  unreadable: UnreadableArea[];
  /** Passes the reader declined to answer. A refusal is a result, not an error. */
  refusedPasses: string[];
  model: string;
  passes: Array<{ name: string; ms: number; lines: number; refused: boolean }>;
  reasons: string[];
}

export interface LayoutVisionInput {
  /** The clear ortho as served, and its contrast map. */
  photo: Uint8Array;
  contrast: Uint8Array;
  /**
   * The photo's georeference: [minLon, minLat, maxLon, maxLat] and the pin the
   * frame coordinates are anchored to. When given, TWO anchoring gaps close:
   * the prompt states the picture's true ground size (without it the reader
   * has no scale at all — measured: an empty-brief run answered in a small
   * central cluster), and the reader's picture-centre coordinates are
   * translated to the pin frame on the way out, with the brief's contour
   * translated the other way on the way in. Without this the prompt said
   * "origin at the centre of the picture" while the contour it embedded was
   * pin-framed, and the answers were drawn as if pin-framed — two frames ~8 ft
   * apart on the tight crop, silently mixed.
   */
  bbox?: [number, number, number, number];
  origin?: { lat: number; lng: number };
  instant: InstantRoofData;
  structure: InstantStructure;
  contour: Array<{ x: number; y: number }>;
  ours: OurMeasurements;
  confidences?: Record<string, number>;
}

const DEFAULT_MODEL = "gpt-5.4";
const layoutModel = (): string => process.env.ROOF_VISION_MODEL || DEFAULT_MODEL;

/** Named in the prompt because each one has produced a wrong line on this sample. */
const CONFOUNDERS = [
  "THINGS THAT LOOK LIKE ROOF LINES AND ARE NOT:",
  "- Tree shadow. On one house in this sample a single tree shades roughly a third of the west slope; under shadow the contrast map shows the TREE's texture, not the roof's. Lines there are guesses — mark the area unreadable instead.",
  "- Solar panels. Their frames are long, straight, high-contrast and parallel. They are the strongest straight edges on a panelled roof and not one of them is a roof line.",
  "- Shingle courses and seams. Regular parallel banding across a slope is the covering, not a crease. A real ridge or hip is a single line where the SHADING CHANGES on either side, not one of a repeating set.",
  "- The edge of the picture, and any smooth curve enclosing the property.",
].join("\n");

const COMMON = [
  "You are reading a residential roof from above, the way a takeoff estimator does before ordering material.",
  "",
  "You get TWO pictures of the SAME roof — same framing, same pixels:",
  "  1. the aerial photograph;",
  "  2. a contrast map of it: bilateral filter, local histogram equalisation, then gradient magnitude. Creases between two planes of the same colour shingle are nearly invisible in the photograph and visible here. Bright means the surface changes there.",
  "",
  "COORDINATES. Answer in the SAME feet the outline below uses: x east, y north, origin at the centre of the picture. Never answer in pixels.",
  "",
  CONFOUNDERS,
  "",
  "YOU MAY REFUSE. If the evidence does not support an answer, return an empty list. An empty answer is correct and useful; an invented one is worse than nothing, because the geometry check downstream can discard a wrong line but cannot discard a wrong CERTAINTY. Every area you could not read must be listed, with the reason.",
  "",
  "Return ONLY JSON. No prose outside it.",
].join("\n");

interface PassSpec {
  name: string;
  question: string;
  schema: string;
}

/**
 * Five different questions. The order is the order a person uses: what are the
 * big pieces, how does each one end, where is its spine, then the details, and
 * finally the facets themselves — the one answer that can be scored densely.
 */
const PASSES: PassSpec[] = [
  {
    name: "masses",
    question: [
      "QUESTION 1 of 5 — HOW MANY SEPARATE MASSES.",
      'A "mass" is one block of the building with its own roof: a main house, a garage wing, an ell, a porch. Two masses meet at a valley, or one abuts the other as a wall.',
      "Clues: a step in eave height between sides; a change of ridge height; an outline that turns a corner and keeps going; a shadow line across the roof that is not a crease.",
      "Do NOT list facets. List masses.",
    ].join("\n"),
    schema:
      '{"masses":[{"label":"A","note":"where it is and what makes it separate","approxCentre":[x_ft,y_ft]}],"boundaries":[{"a":[x_ft,y_ft],"b":[x_ft,y_ft],"cue":"what you see","confidence":0.0}],"unreadable":[{"where":[x_ft,y_ft],"radiusFt":0,"why":""}]}',
  },
  {
    name: "ends",
    question: [
      "QUESTION 2 of 5 — HOW EACH MASS ENDS.",
      "For every mass from question 1, decide how its short ends are framed:",
      "  GABLE — the end is a vertical triangle of wall; the roof edge runs UP the slope (a rake). You see a straight sloping edge with wall below it and no roof surface beyond.",
      "  HIP — the end is a sloping triangle of roof; you see roof surface running down to a horizontal eave on that side.",
      "State it per end, and give the rake lines for the gables.",
    ].join("\n"),
    schema:
      '{"ends":[{"mass":"A","side":"north|east|south|west","kind":"GABLE|HIP","cue":"","confidence":0.0}],"lines":[{"a":[x_ft,y_ft],"b":[x_ft,y_ft],"type":"RAKE","cue":"","confidence":0.0}],"unreadable":[{"where":[x_ft,y_ft],"radiusFt":0,"why":""}]}',
  },
  {
    name: "ridges",
    question: [
      "QUESTION 3 of 5 — THE MAIN RIDGE OF EACH MASS.",
      "One line per mass, along its long axis, level end to end. A ridge separates two planes that drain in OPPOSITE directions — check that against the measured plane bearings you were given. If a mass is a shed (one plane, one direction), say so and give no ridge for it.",
      "The ridge of a mass runs BETWEEN the ends you classified in question 2: on a hipped end it stops short of the wall, on a gabled end it reaches it.",
    ].join("\n"),
    schema:
      '{"lines":[{"a":[x_ft,y_ft],"b":[x_ft,y_ft],"type":"RIDGE","mass":"A","cue":"","confidence":0.0}],"sheds":[{"mass":"A","why":""}],"unreadable":[{"where":[x_ft,y_ft],"radiusFt":0,"why":""}]}',
  },
  {
    name: "details",
    question: [
      "QUESTION 4 of 5 — VALLEYS AND THE REMAINING LINES.",
      "Now the lines that connect what you have already placed:",
      "  VALLEY — an inward crease where two slopes meet and water collects. Runs from an inside corner of the outline up toward a ridge end. Often darker in the photograph, because it holds debris and stays wet.",
      "  HIP — an outward crease from an outside corner of the outline up to a ridge end.",
      "Only lines you can point at in the pictures. Do not complete a pattern because it would be symmetrical.",
    ].join("\n"),
    schema:
      '{"lines":[{"a":[x_ft,y_ft],"b":[x_ft,y_ft],"type":"VALLEY|HIP","cue":"","confidence":0.0}],"unreadable":[{"where":[x_ft,y_ft],"radiusFt":0,"why":""}]}',
  },
  {
    name: "facets",
    question: [
      "QUESTION 5 of 5 — THE FACETS THEMSELVES, AND WHICH WAY EACH ONE DRAINS.",
      "Divide the roof into its flat pieces — the surfaces bounded by the lines you have just placed — and for each one say which way water runs DOWN it.",
      "The direction must be one of exactly these eight: N, NE, E, SE, S, SW, W, NW. North is up in both pictures.",
      "This is the single most checkable thing you can tell us, so answer it carefully and leave out any facet you are not sure of. A facet you omit costs nothing; a facet pointed the wrong way is a wrongly-ordered roof.",
      "Sanity check against what you were told: the measured plane bearings in the brief are this same quantity, measured independently. Where your reading of a facet disagrees with every measured bearing near it, prefer to omit the facet and say so.",
    ].join("\n"),
    schema:
      '{"facets":[{"polygon":[[x_ft,y_ft],[x_ft,y_ft],[x_ft,y_ft]],"downhill":"N|NE|E|SE|S|SW|W|NW","cue":"","confidence":0.0}],"unreadable":[{"where":[x_ft,y_ft],"radiusFt":0,"why":""}]}',
  },
];

const dataUrl = (bytes: Uint8Array, mime = "image/png"): string =>
  `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;

function parseJson(text: string): Record<string, unknown> | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fence ? fence[1] : text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const LINE_TYPES: LayoutLineType[] = ["RIDGE", "HIP", "VALLEY", "RAKE", "EAVE", "STEPFLASH"];

function readLines(o: Record<string, unknown>, pass: string): LayoutLine[] {
  const raw = Array.isArray(o.lines) ? o.lines : Array.isArray(o.boundaries) ? o.boundaries : [];
  const out: LayoutLine[] = [];
  for (const item of raw as Array<Record<string, unknown>>) {
    const a = Array.isArray(item.a) ? item.a : null;
    const b = Array.isArray(item.b) ? item.b : null;
    const ax = a ? num(a[0]) : null;
    const ay = a ? num(a[1]) : null;
    const bx = b ? num(b[0]) : null;
    const by = b ? num(b[1]) : null;
    if (ax == null || ay == null || bx == null || by == null) continue;
    // A mass BOUNDARY is a valley or a wall; the pass that produces it has no
    // `type` field, so name it here rather than letting it default to RIDGE.
    const fallback: LayoutLineType = pass === "masses" ? "VALLEY" : "RIDGE";
    const t = String(item.type ?? fallback).toUpperCase();
    const type = LINE_TYPES.includes(t as LayoutLineType) ? (t as LayoutLineType) : fallback;
    out.push({
      a: { x: ax, y: ay },
      b: { x: bx, y: by },
      type,
      cue: typeof item.cue === "string" ? item.cue : "",
      confidence: num(item.confidence) ?? 0,
      pass,
    });
  }
  return out;
}

const COMPASS = new Set(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);

function readFacets(o: Record<string, unknown>): LayoutFacet[] {
  const raw = Array.isArray(o.facets) ? o.facets : [];
  const out: LayoutFacet[] = [];
  for (const item of raw as Array<Record<string, unknown>>) {
    const poly = Array.isArray(item.polygon) ? item.polygon : [];
    const pts: Array<{ x: number; y: number }> = [];
    for (const c of poly as unknown[]) {
      if (!Array.isArray(c) || c.length < 2) continue;
      const x = num(c[0]);
      const y = num(c[1]);
      if (x != null && y != null) pts.push({ x, y });
    }
    const dir = String(item.downhill ?? "").toUpperCase().trim();
    // A direction that is not a compass point cannot be scored, and a facet
    // that cannot be scored is not kept — the whole purpose of this pass.
    if (pts.length < 3 || !COMPASS.has(dir)) continue;
    out.push({
      polygon: pts,
      downhill: dir,
      cue: typeof item.cue === "string" ? item.cue : "",
      confidence: num(item.confidence) ?? 0,
    });
  }
  return out;
}

function readUnreadable(o: Record<string, unknown>): UnreadableArea[] {
  const raw = Array.isArray(o.unreadable) ? o.unreadable : [];
  const out: UnreadableArea[] = [];
  for (const item of raw as Array<Record<string, unknown>>) {
    const w = Array.isArray(item.where) ? item.where : null;
    const x = w ? num(w[0]) : null;
    const y = w ? num(w[1]) : null;
    if (x == null || y == null) continue;
    out.push({
      where: { x, y },
      radiusFt: num(item.radiusFt) ?? 0,
      why: typeof item.why === "string" ? item.why : "",
    });
  }
  return out;
}

/** Run the chain. Never throws: a failed pass is recorded and the rest continue. */
export async function readRoofLayout(input: LayoutVisionInput): Promise<LayoutRead> {
  const base: LayoutRead = {
    masses: [],
    lines: [],
    facets: [],
    unreadable: [],
    refusedPasses: [],
    model: layoutModel(),
    passes: [],
    reasons: [],
  };
  if (!isOpenAIEnabled()) return { ...base, reasons: ["OPENAI_API_KEY is not set"] };

  // Picture-centre against the pin, in frame feet. Zero when no georeference
  // was supplied — the transform then degrades to the old behaviour.
  const FT_PER_M = 3.28084;
  const EARTH_R_M = 6378137;
  const D2R = Math.PI / 180;
  let offX = 0;
  let offY = 0;
  let groundW = 0;
  let groundH = 0;
  if (input.bbox && input.origin) {
    const [minLon, minLat, maxLon, maxLat] = input.bbox;
    const midLat = (minLat + maxLat) / 2;
    const midLon = (minLon + maxLon) / 2;
    offX = (midLon - input.origin.lng) * D2R * Math.cos(input.origin.lat * D2R) * EARTH_R_M * FT_PER_M;
    offY = (midLat - input.origin.lat) * D2R * EARTH_R_M * FT_PER_M;
    groundW = (maxLon - minLon) * D2R * Math.cos(midLat * D2R) * EARTH_R_M * FT_PER_M;
    groundH = (maxLat - minLat) * D2R * EARTH_R_M * FT_PER_M;
  }
  const toCentre = (p: { x: number; y: number }) => ({ x: p.x - offX, y: p.y - offY });
  const toPin = (p: { x: number; y: number }) => ({ x: p.x + offX, y: p.y + offY });

  const brief = buildRoofBrief(input.instant, input.structure, input.contour.map(toCentre), input.ours, input.confidences);
  const client = getOpenAI();
  const model = layoutModel();
  let carried = "";

  for (const spec of PASSES) {
    const t0 = Date.now();
    const prompt = [
      COMMON,
      groundW > 0 ? `
THE PICTURE'S GROUND SIZE: ${groundW.toFixed(0)} ft east-west by ${groundH.toFixed(0)} ft north-south. Use it to keep your feet honest.` : "",
      "",
      brief,
      "",
      carried
        ? `WHAT YOU ESTABLISHED IN THE EARLIER QUESTIONS:\n${carried}\nBuild on it. If you now believe an earlier answer was wrong, say so in "revision" and give the corrected version.`
        : "",
      "",
      spec.question,
      "",
      `Answer with exactly this shape:\n${spec.schema}`,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const res = await client.chat.completions.create({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataUrl(input.photo) } },
              { type: "image_url", image_url: { url: dataUrl(input.contrast) } },
            ] as never,
          },
        ],
      });
      const raw = res.choices[0]?.message?.content;
      const parsed = parseJson(typeof raw === "string" ? raw : "");
      if (!parsed) {
        base.refusedPasses.push(spec.name);
        base.passes.push({ name: spec.name, ms: Date.now() - t0, lines: 0, refused: true });
        base.reasons.push(`pass "${spec.name}" returned nothing parseable`);
        continue;
      }
      const got = readLines(parsed, spec.name).map((l) => ({ ...l, a: toPin(l.a), b: toPin(l.b) }));
      const un = readUnreadable(parsed).map((u) => ({ ...u, where: toPin(u.where) }));
      const fac = readFacets(parsed).map((f) => ({ ...f, polygon: f.polygon.map(toPin) }));
      base.lines.push(...got);
      base.unreadable.push(...un);
      base.facets.push(...fac);
      if (spec.name === "masses" && Array.isArray(parsed.masses)) {
        for (const m of parsed.masses as Array<Record<string, unknown>>) {
          base.masses.push({ label: String(m.label ?? "?"), note: String(m.note ?? "") });
        }
      }
      // An explicitly empty answer is a refusal, and it is a valid one.
      if (!got.length && !un.length && !fac.length) base.refusedPasses.push(spec.name);
      base.passes.push({
        name: spec.name,
        ms: Date.now() - t0,
        lines: got.length + fac.length,
        refused: !got.length && !fac.length,
      });
      carried += `\n[${spec.name}] ${JSON.stringify(parsed).slice(0, 1200)}`;
    } catch (err) {
      base.refusedPasses.push(spec.name);
      base.passes.push({ name: spec.name, ms: Date.now() - t0, lines: 0, refused: true });
      base.reasons.push(`pass "${spec.name}" failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return base;
}
