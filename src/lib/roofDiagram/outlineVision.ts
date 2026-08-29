// Roof diagram — AI-traced precise roof OUTLINE from the EagleView Instant ortho.
//
// Server-only: talks to OpenAI with the server key (same house style as
// chimneyVision.ts). Never import from a client component.
//
// What this solves: the Instant outline is the WALL footprint; the drawn roof
// perimeter is synthesized from it and can miss what the photo plainly shows
// (a porch roof, a bay, a clipped corner). The vision model traces the OUTER
// ROOF EDGE — the eave/rake perimeter seen from above — on the masked ortho.
// The model supplies corner TOPOLOGY only; exactness comes from the
// regularizer: every edge direction is snapped onto the house's dominant-axis
// grid (or its 45° diagonals) and corners are re-solved as intersections of
// the straightened edge lines. Printed numbers stay Instant-calibrated — the
// ring shapes GEOMETRY ONLY; nothing here rescales areas.
//
// Frame: local feet about the queried pin, x east, y north (the repo's
// latLngRingToFrame). Image y grows downward, latitude upward — the bbox
// mapping flips y. North-up orthos only; never pass an oblique.
//
// Best-effort by contract: with no OPENAI_API_KEY, an expired image token, or
// a trace that fails the validation gates, traceRoofOutline returns
// { ringFt: null, reasons } and never throws — the caller keeps drawing the
// synthesized outline exactly as today. Accepted traces are cached under
// .cache/roof-diagram/vision-outline-<slug>.json so recalibrate re-runs are
// free; the cache records the ORIGIN its ring is relative to, and a read under
// a different pin (instant pin vs a geocoded recon origin — they differ by
// feet) reframes the ring exactly instead of shipping it shifted. Fetched
// image bytes are cached as img-<slug>-t<tokenDigest>.png and NEVER refetched
// while the file exists (tokens expire; the bytes do not); the digest key ties
// the bytes to the token whose bbox maps them, so a reordered Instant response
// can never pair stale bytes with the wrong bbox. All caching is best-effort:
// on a read-only filesystem (serverless) writes are skipped, never fatal.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getOpenAI, getOpenAIModel, isOpenAIEnabled } from "@/lib/sdk/openai";
import { fetchPropertyImage } from "@/lib/eagleview";
import { latLngRingToFrame } from "@/lib/roofRecon";

// ── public types ─────────────────────────────────────────────────────────────

export interface OutlinePoint {
  x: number;
  y: number;
}

/** One Instant imagery token the tracer may use. Only north-up orthos with a
 *  bbox are usable; obliques are perspective views and are skipped. */
export interface OutlineImageCandidate {
  token: string;
  /** [minLon, minLat, maxLon, maxLat], EPSG:4326. */
  bbox: [number, number, number, number] | null;
  /** "ortho" | "oblique" */
  view: string;
  /** ortho only: neighbours blurred — preferred, the model cannot wander. */
  masked?: boolean;
  /** Pre-fetched bytes (e.g. the Solar rgb fallback); when set, `token` is
   *  never fetched and may be a placeholder. */
  bytes?: ArrayBuffer;
  contentType?: string;
}

export interface TraceRoofOutlineInput {
  imagery: OutlineImageCandidate[];
  /** The queried pin — the frame origin. */
  origin: { lat: number; lng: number };
  /** Cache key ("419-prairie-…" or a measurement id). No slug = no caching. */
  slug?: string;
  /** Instant WALL-outline rings in frame feet (largest = the house). Used for
   *  the dominant axis and every validation gate — never returned. */
  wallRings: OutlinePoint[][];
}

export interface TraceRoofOutlineOptions {
  /** Re-run the vision call even when an accepted trace is cached. Image
   *  BYTES stay cached regardless — force never refetches a token. */
  force?: boolean;
}

export type OutlineEdgeOrientation = "axis" | "diagonal" | "other";

export interface RoofOutlineGates {
  simpleRing: boolean;
  cornerCount: boolean;
  iou: boolean;
  areaRatio: boolean;
  wallVertexDistance: boolean;
}

export interface RoofOutlineResult {
  /** Regularized CCW roof-edge ring, frame feet — or null when no trace
   *  passed the gates (reasons say why). */
  ringFt: OutlinePoint[] | null;
  cornerCount: number;
  /** IoU of the ring vs the wall outline dilated 1.5 ft (gate ≥ 0.80). */
  iou: number;
  areaSqft: number;
  /** Final per-edge direction class, edge i = ringFt[i] → ringFt[i+1]. */
  orientations: OutlineEdgeOrientation[];
  /** Dominant house axis (deg CCW from +x East) used for snapping. */
  axisDeg: number | null;
  source: "vision" | "vision-cache" | "none";
  /** Empty on success; on failure, every gate or step that said no. */
  reasons: string[];
  /** Harness aid: the regularized ring that FAILED the gates (never drawn by
   *  the pipeline — ringFt stays the only accepted geometry). */
  rejectedRingFt?: OutlinePoint[];
}

// ── tuning ───────────────────────────────────────────────────────────────────

/** Same OpenAI body ceiling as chimneyVision — base64 inflates by 4/3. */
const MAX_IMAGE_BYTES = 15_000_000;

/** Three independent traces; the medoid (smallest summed symmetric-difference
 *  area vs the others) wins. Temperature spreads the samples apart. */
const TRACE_TEMPERATURES = [0, 0.4, 0.8] as const;

/** A raw trace with fewer corners is not a roof, with more it is noise. */
const RAW_MIN_CORNERS = 4;
const RAW_MAX_CORNERS = 24;

/** Snap an edge within this of the axis grid / the 45° diagonals. */
const AXIS_SNAP_DEG = 12;
const DIAG_SNAP_DEG = 10;

/** Adjacent edges bending less than this are one wall. */
const COLLINEAR_MERGE_DEG = 8;

/** Edges shorter than this after straightening are trace jitter. */
const MIN_EDGE_FT = 1;

/** A re-solved corner further than this from every point of its two edges
 *  means the intersection ran away — the regularization is rejected. */
const MAX_CORNER_SHIFT_FT = 12;

/** Validation gates (all must pass). */
const GATE_MIN_CORNERS = 4;
const GATE_MAX_CORNERS = 20;
const GATE_MIN_IOU = 0.8;
const GATE_DILATE_FT = 1.5;
const GATE_AREA_RATIO_MIN = 1.0;
const GATE_AREA_RATIO_MAX = 1.4;
const GATE_WALL_VERTEX_FT = 4;

/** Raster cell for the IoU gate — the spec's coverage checks use 0.5 ft. */
const IOU_CELL_FT = 0.5;

/** A cached ring whose recorded origin sits further than this from the
 *  caller's pin is another property (or garbage) — treat as a miss. Within the
 *  bound the ring is reframed exactly, so any honest pin disagreement
 *  (instant pin vs geocoded origin, feet apart) costs nothing. */
const MAX_CACHE_ORIGIN_DELTA_FT = 200;

const CACHE_DIR = () => resolve(process.cwd(), ".cache", "roof-diagram");

/** The wall-footprint hint is what grounds the model: without it, vision
 *  models return schematic polygons in multiples of 50 that never touched the
 *  photo. With the surveyed footprint in image coordinates the task becomes a
 *  local CORRECTION — follow the roof edge just outside the given polygon and
 *  fix what the photo contradicts. The gates still reject a parroted or lazy
 *  answer that drifts off the roof. */
function buildPrompt(footprintHint: string): string {
  return (
    "You are looking at a north-up aerial photo of a residential lot. Neighbouring buildings are blurred; " +
    "the property of interest is the sharp house at the CENTRE of the image. Coordinates: x runs 0..1000 " +
    "left to right, y runs 0..1000 top to bottom.\n" +
    `A ground survey gives this house's WALL footprint polygon in these coordinates: ${footprintHint}\n` +
    "The roof OVERHANGS the walls by about 1-2 ft (a handful of units here), so the true outer roof edge runs " +
    "just OUTSIDE that polygon. The survey may also miss roof-only features the photo clearly shows " +
    "(a porch roof, a bay, an attached garage wing).\n" +
    "TASK: trace the OUTER ROOF EDGE of this house exactly as visible in the photo — the outermost shingle " +
    "line (the eave/rake perimeter), NOT the wall line, NOT shadows, NOT trees, NOT the driveway, NOT any " +
    "detached or neighbouring building.\n" +
    'Return JSON {"corners":[[x,y],...],"edges":["axis"|"diagonal"|"other",...]}.\n' +
    "corners: the polygon CORNERS ONLY, in clockwise order starting anywhere — a point only where the roof " +
    "edge changes direction, never along a straight run; most houses have 4 to 14 corners. Read every corner " +
    "position carefully off the photo: do not copy the survey polygon, correct it to what the photo shows. " +
    "KEEP every notch, step and jog of the survey polygon that the photo does not clearly contradict — do not " +
    "simplify a stepped wall into one straight edge; your polygon normally has at least as many corners as " +
    "the survey polygon.\n" +
    "edges: one label per edge, edge i joining corners[i] to corners[i+1] (the last edge closes back to " +
    'corners[0]): "axis" when the edge runs along one of the house\'s two main axes, "diagonal" at roughly ' +
    '45 degrees to them, otherwise "other".'
  );
}

// ── small geometry ───────────────────────────────────────────────────────────

type P = OutlinePoint;

function signedArea(ring: P[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

function ensureCCW(ring: P[]): P[] {
  return signedArea(ring) >= 0 ? ring : ring.slice().reverse();
}

/** Proper segment intersection (shared endpoints of adjacent edges excluded
 *  by the caller). Touching counts as crossing — a ring that touches itself
 *  is not simple. */
function segmentsCross(a: P, b: P, c: P, d: P): boolean {
  const o = (p: P, q: P, r: P) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
  const on = (p: P, q: P, r: P) =>
    o(p, q, r) === 0 && r.x >= Math.min(p.x, q.x) && r.x <= Math.max(p.x, q.x) && r.y >= Math.min(p.y, q.y) && r.y <= Math.max(p.y, q.y);
  return on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
}

function isSimpleRing(ring: P[]): boolean {
  const n = ring.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) return false;
    for (let j = i + 1; j < n; j++) {
      // skip the edge itself and the two adjacent edges (they share a vertex)
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (segmentsCross(a, b, ring[j], ring[(j + 1) % n])) return false;
    }
  }
  return true;
}

function pointInRing(p: P, ring: P[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distToSegment(p: P, a: P, b: P): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distToRingBoundary(p: P, ring: P[]): number {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) d = Math.min(d, distToSegment(p, ring[i], ring[(i + 1) % ring.length]));
  return d;
}

/** Fold an angle difference to (-90, 90] — direction, not heading. */
function fold90(deg: number): number {
  let d = ((deg % 180) + 180) % 180;
  if (d > 90) d -= 180;
  return d;
}

/** Length-weighted dominant axis of the wall rings, deg in [0, 90). The local
 *  copy of rectify's dominantAxisDeg, over rings instead of a RoofModel. */
export function dominantAxisFromRings(rings: P[][]): number {
  const hist = new Array<number>(90).fill(0);
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 0.5) continue;
      const deg = ((((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI) % 90) + 90) % 90;
      hist[Math.round(deg) % 90] += len;
    }
  }
  let best = 0;
  let bestS = -1;
  for (let d = 0; d < 90; d++) {
    let s = 0;
    for (let k = -2; k <= 2; k++) s += hist[(d + k + 90) % 90];
    if (s > bestS) {
      bestS = s;
      best = d;
    }
  }
  return best;
}

// ── vision call + parsing ────────────────────────────────────────────────────

/** One raw trace, normalized 0..1000 image coords, y down. */
export interface RawOutlineTrace {
  corners: [number, number][];
  edges: OutlineEdgeOrientation[];
  temperature: number;
}

function parseTrace(text: string, temperature: number): RawOutlineTrace | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const rawCorners = obj.corners ?? obj.polygon ?? obj.points ?? null;
  if (!Array.isArray(rawCorners)) return null;
  const corners: [number, number][] = [];
  for (const c of rawCorners) {
    let x: unknown;
    let y: unknown;
    if (Array.isArray(c) && c.length >= 2) {
      [x, y] = c;
    } else if (c && typeof c === "object") {
      x = (c as Record<string, unknown>).x;
      y = (c as Record<string, unknown>).y;
    }
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < 0 || x > 1000 || y < 0 || y > 1000) return null;
    corners.push([x, y]);
  }
  // drop a duplicated closing vertex
  if (corners.length >= 2) {
    const [fx, fy] = corners[0];
    const [lx, ly] = corners[corners.length - 1];
    if (Math.hypot(fx - lx, fy - ly) < 2) corners.pop();
  }
  if (corners.length < RAW_MIN_CORNERS || corners.length > RAW_MAX_CORNERS) return null;
  const ring = corners.map(([x, y]) => ({ x, y }));
  if (!isSimpleRing(ring)) return null;

  const rawEdges = Array.isArray(obj.edges) ? obj.edges : [];
  const edges: OutlineEdgeOrientation[] = corners.map((_, i) => {
    const e = rawEdges[i];
    return e === "axis" || e === "diagonal" || e === "other" ? e : "other";
  });
  return { corners, edges, temperature };
}

/** Set ROOF_OUTLINE_DEBUG=1 to see why traces are rejected (harness only —
 *  the pipeline itself stays silent). */
const debugLog = (...args: unknown[]) => {
  if (process.env.ROOF_OUTLINE_DEBUG) console.error("[outlineVision]", ...args);
};

async function requestTrace(dataUrl: string, prompt: string, temperature: number): Promise<RawOutlineTrace | null> {
  try {
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      // read at call time — the sdk's module-level const is captured before a
      // tsx harness's env loader runs and would pin the inaccessible default
      model: getOpenAIModel(),
      temperature,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
    });
    const text = completion.choices[0]?.message?.content ?? "";
    const trace = parseTrace(text, temperature);
    if (!trace) debugLog(`t=${temperature}: unusable trace, raw: ${text.slice(0, 400)}`);
    return trace;
  } catch (e) {
    debugLog(`t=${temperature}: request failed:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/** Symmetric-difference area of two normalized traces, rasterized on a 96²
 *  grid over the 0..1000 square. Units: grid cells — only compared. */
function symDiffCells(a: RawOutlineTrace, b: RawOutlineTrace): number {
  const N = 96;
  const ra = a.corners.map(([x, y]) => ({ x, y }));
  const rb = b.corners.map(([x, y]) => ({ x, y }));
  let diff = 0;
  for (let iy = 0; iy < N; iy++) {
    for (let ix = 0; ix < N; ix++) {
      const p = { x: ((ix + 0.5) * 1000) / N, y: ((iy + 0.5) * 1000) / N };
      if (pointInRing(p, ra) !== pointInRing(p, rb)) diff++;
    }
  }
  return diff;
}

/** Indices ordered medoid-first: ascending summed symmetric-difference area
 *  vs the other traces; ties go to the lower temperature (the list is
 *  already ordered coolest first). The gates try the medoid first and only
 *  fall through to the outliers when it fails. */
export function rankByMedoid(traces: RawOutlineTrace[]): number[] {
  const scores = traces.map((t, i) => {
    let s = 0;
    for (let j = 0; j < traces.length; j++) if (j !== i) s += symDiffCells(t, traces[j]);
    return { i, s };
  });
  return scores.sort((a, b) => a.s - b.s || a.i - b.i).map((x) => x.i);
}

/** The medoid itself — rankByMedoid's first pick. */
export function pickMedoid(traces: RawOutlineTrace[]): RawOutlineTrace | null {
  return traces.length ? traces[rankByMedoid(traces)[0]] : null;
}

// ── px → frame ───────────────────────────────────────────────────────────────

// Mirrors latLngRingToFrame's equirectangular constants (src/lib/roofRecon.ts)
// so the two directions round-trip exactly.
const D2R = Math.PI / 180;
const EARTH_R_M = 6378137;
const FT_PER_M = 3.28084;

/** Frame feet → normalized 0..1000 image coords (y down) through the ortho
 *  bbox — the exact inverse of normalizedRingToFrame. Used to hand the model
 *  the surveyed footprint in ITS coordinate system. */
export function frameRingToNormalized(
  ring: P[],
  bbox: [number, number, number, number],
  origin: { lat: number; lng: number },
): [number, number][] {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return ring.map((p) => {
    const lng = origin.lng + p.x / (D2R * Math.cos(origin.lat * D2R) * EARTH_R_M * FT_PER_M);
    const lat = origin.lat + p.y / (D2R * EARTH_R_M * FT_PER_M);
    return [
      Math.round(Math.min(1000, Math.max(0, ((lng - minLon) / (maxLon - minLon)) * 1000))),
      Math.round(Math.min(1000, Math.max(0, ((maxLat - lat) / (maxLat - minLat)) * 1000))),
    ];
  });
}

/** Normalized 0..1000 (y down) → geo through the ortho bbox → frame feet.
 *  Image top row is maxLat, hence the flip. */
export function normalizedRingToFrame(
  corners: [number, number][],
  bbox: [number, number, number, number],
  origin: { lat: number; lng: number },
): P[] {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const geo = corners.map(([x, y]) => ({
    lng: minLon + (x / 1000) * (maxLon - minLon),
    lat: maxLat - (y / 1000) * (maxLat - minLat),
  }));
  return latLngRingToFrame(origin, geo).ring;
}

// ── regularization ───────────────────────────────────────────────────────────

interface EdgeLine {
  thetaDeg: number;
  nx: number; //  unit normal
  ny: number;
  c: number; //   n · p = c
  lenFt: number;
  pts: P[]; //    original endpoints this line explains
  orientation: OutlineEdgeOrientation;
}

function snapDirection(deg: number, axisDeg: number): { thetaDeg: number; orientation: OutlineEdgeOrientation } {
  const nearest = (targets: number[]) => {
    let best = Infinity;
    for (const t of targets) {
      const d = fold90(deg - t);
      if (Math.abs(d) < Math.abs(best)) best = d;
    }
    return best;
  };
  const da = nearest([axisDeg, axisDeg + 90]);
  if (Math.abs(da) <= AXIS_SNAP_DEG) return { thetaDeg: deg - da, orientation: "axis" };
  const dd = nearest([axisDeg + 45, axisDeg + 135]);
  if (Math.abs(dd) <= DIAG_SNAP_DEG) return { thetaDeg: deg - dd, orientation: "diagonal" };
  return { thetaDeg: deg, orientation: "other" };
}

function buildLine(thetaDeg: number, pts: P[], lenFt: number, orientation: OutlineEdgeOrientation): EdgeLine {
  const rad = (thetaDeg * Math.PI) / 180;
  const nx = -Math.sin(rad);
  const ny = Math.cos(rad);
  const c = pts.reduce((s, p) => s + nx * p.x + ny * p.y, 0) / pts.length;
  return { thetaDeg, nx, ny, c, lenFt, pts, orientation };
}

function mergeLines(a: EdgeLine, b: EdgeLine): EdgeLine {
  const keep = a.lenFt >= b.lenFt ? a : b;
  return buildLine(keep.thetaDeg, [...a.pts, ...b.pts], a.lenFt + b.lenFt, keep.orientation);
}

function solveCorners(lines: EdgeLine[]): P[] | null {
  const n = lines.length;
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    const l1 = lines[(i - 1 + n) % n];
    const l2 = lines[i];
    const det = l1.nx * l2.ny - l1.ny * l2.nx;
    if (Math.abs(det) < 1e-6) return null;
    out.push({ x: (l1.c * l2.ny - l2.c * l1.ny) / det, y: (l1.nx * l2.c - l2.nx * l1.c) / det });
  }
  return out;
}

/**
 * Straighten a traced ring onto the house grid: snap edge directions
 * (axis ±12°, diagonals ±10°, else keep), merge collinear neighbours (< 8°),
 * re-solve each corner as the intersection of its two straightened edge lines
 * (offset = mean projection of the edge's original endpoints), drop edges
 * < 1 ft, enforce a simple CCW ring. Null when the solve degenerates — the
 * caller falls back to the raw ring and lets the gates decide.
 */
export function regularizeRing(
  raw: P[],
  axisDeg: number,
): { ring: P[]; orientations: OutlineEdgeOrientation[] } | null {
  const src = ensureCCW(raw);
  const n0 = src.length;
  if (n0 < 3) return null;

  const lines: EdgeLine[] = [];
  for (let i = 0; i < n0; i++) {
    const a = src[i];
    const b = src[(i + 1) % n0];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    const snap = snapDirection(deg, axisDeg);
    lines.push(buildLine(snap.thetaDeg, [a, b], len, snap.orientation));
  }

  for (let iter = 0; iter < 12; iter++) {
    // merge collinear cyclic neighbours
    let merged = true;
    while (merged && lines.length >= 4) {
      merged = false;
      for (let i = 0; i < lines.length; i++) {
        const j = (i + 1) % lines.length;
        if (Math.abs(fold90(lines[i].thetaDeg - lines[j].thetaDeg)) < COLLINEAR_MERGE_DEG) {
          const m = mergeLines(lines[i], lines[j]);
          lines.splice(Math.max(i, j), 1);
          lines.splice(Math.min(i, j), 1, m);
          merged = true;
          break;
        }
      }
    }
    if (lines.length < 4) return null;

    const corners = solveCorners(lines);
    if (!corners) return null;

    // shortest straightened edge below the floor: the whole line was jitter
    let shortIdx = -1;
    let shortLen = MIN_EDGE_FT;
    for (let i = 0; i < lines.length; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % lines.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < shortLen) {
        shortLen = len;
        shortIdx = i;
      }
    }
    if (shortIdx >= 0) {
      lines.splice(shortIdx, 1);
      continue;
    }

    // runaway intersection check
    for (let i = 0; i < corners.length; i++) {
      const near = [...lines[(i - 1 + lines.length) % lines.length].pts, ...lines[i].pts];
      const d = Math.min(...near.map((p) => Math.hypot(p.x - corners[i].x, p.y - corners[i].y)));
      if (d > MAX_CORNER_SHIFT_FT) return null;
    }
    if (!isSimpleRing(corners)) return null;
    const ccw = ensureCCW(corners);
    // corners[i] is the meet of lines i-1 and i, so edge i (corners[i]→[i+1])
    // lies on lines[i]; a reversal reindexes, so recompute labels from the
    // final geometry instead of trusting the line order.
    const orientations = ccw.map((a, i) => {
      const b = ccw[(i + 1) % ccw.length];
      const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      return snapDirection(deg, axisDeg).orientation;
    });
    return { ring: ccw, orientations };
  }
  return null;
}

// ── validation gates ─────────────────────────────────────────────────────────

function ringBounds(rings: P[][]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const r of rings)
    for (const p of r) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  return { minX, maxX, minY, maxY };
}

/** IoU of `ring` vs `wall` dilated by `dilateFt`, rasterized at 0.5 ft (the
 *  cell grows on a huge extent so the grid stays bounded). */
export function dilatedIoU(ring: P[], wall: P[], dilateFt: number): number {
  const b = ringBounds([ring, wall]);
  const pad = dilateFt + 1;
  const w = b.maxX - b.minX + 2 * pad;
  const h = b.maxY - b.minY + 2 * pad;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 0;
  const cell = Math.max(IOU_CELL_FT, w / 400, h / 400);
  const nx = Math.max(4, Math.ceil(w / cell));
  const ny = Math.max(4, Math.ceil(h / cell));
  let inter = 0;
  let union = 0;
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const p = { x: b.minX - pad + (ix + 0.5) * cell, y: b.minY - pad + (iy + 0.5) * cell };
      const inRing = pointInRing(p, ring);
      const inWall = pointInRing(p, wall) || distToRingBoundary(p, wall) <= dilateFt;
      if (inRing && inWall) inter++;
      if (inRing || inWall) union++;
    }
  }
  return union === 0 ? 0 : inter / union;
}

export interface GateEvaluation {
  gates: RoofOutlineGates;
  iou: number;
  areaSqft: number;
  reasons: string[];
}

/** Run every acceptance gate for a candidate ring against the primary
 *  (largest-area) wall ring. All-pass ⇒ reasons is empty. */
export function evaluateGates(ring: P[], wallRings: P[][]): GateEvaluation {
  const reasons: string[] = [];
  const primary = wallRings
    .filter((r) => r.length >= 3)
    .sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)))[0];
  const areaSqft = Math.abs(signedArea(ring));

  const simpleRing = isSimpleRing(ring);
  if (!simpleRing) reasons.push("ring is not simple");
  const cornerCount = ring.length >= GATE_MIN_CORNERS && ring.length <= GATE_MAX_CORNERS;
  if (!cornerCount) reasons.push(`corner count ${ring.length} outside ${GATE_MIN_CORNERS}..${GATE_MAX_CORNERS}`);

  if (!primary) {
    reasons.push("no wall ring to validate against");
    return { gates: { simpleRing, cornerCount, iou: false, areaRatio: false, wallVertexDistance: false }, iou: 0, areaSqft, reasons };
  }

  const iouVal = simpleRing ? dilatedIoU(ring, primary, GATE_DILATE_FT) : 0;
  const iou = iouVal >= GATE_MIN_IOU;
  if (!iou) reasons.push(`IoU ${iouVal.toFixed(3)} < ${GATE_MIN_IOU} vs wall outline +${GATE_DILATE_FT} ft`);

  const wallArea = Math.abs(signedArea(primary));
  const ratio = wallArea > 0 ? areaSqft / wallArea : 0;
  const areaRatio = ratio >= GATE_AREA_RATIO_MIN && ratio <= GATE_AREA_RATIO_MAX;
  if (!areaRatio)
    reasons.push(`area ratio ${ratio.toFixed(2)}x wall footprint outside ${GATE_AREA_RATIO_MIN}..${GATE_AREA_RATIO_MAX}`);

  let worst = 0;
  for (const v of primary) worst = Math.max(worst, distToRingBoundary(v, ring));
  const wallVertexDistance = worst <= GATE_WALL_VERTEX_FT;
  if (!wallVertexDistance) reasons.push(`wall vertex ${worst.toFixed(1)} ft from vision ring (max ${GATE_WALL_VERTEX_FT})`);

  return { gates: { simpleRing, cornerCount, iou, areaRatio, wallVertexDistance }, iou: iouVal, areaSqft, reasons };
}

// ── caching ──────────────────────────────────────────────────────────────────

/** What vision-outline-<slug>.json holds. Raw traces are kept so prompt or
 *  regularizer changes can be replayed without another OpenAI call. */
export interface VisionOutlineCache {
  slug: string;
  createdAt: string;
  model: string;
  /** The pin ringFt is relative to. Callers disagree on the pin (the harness
   *  uses instant.lat/lng, the server a possibly-geocoded recon origin, feet
   *  apart), so a read under another pin reframes the ring through geo
   *  coordinates. Absent only on legacy caches — treated as a miss, because
   *  the frame they were traced in is unknowable. */
  origin?: { lat: number; lng: number };
  imageIndex: number;
  axisDeg: number;
  rawTraces: RawOutlineTrace[];
  /** Index into rawTraces of the accepted trace (medoid order, first to pass). */
  chosenIndex: number;
  ringFt: P[];
  orientations: OutlineEdgeOrientation[];
  gates: RoofOutlineGates;
  iou: number;
  areaSqft: number;
  accepted: true;
}

function cachePath(slug: string): string {
  return resolve(CACHE_DIR(), `vision-outline-${slug}.json`);
}

function readAcceptedCache(slug: string): VisionOutlineCache | null {
  try {
    const p = cachePath(slug);
    if (!existsSync(p)) return null;
    const j = JSON.parse(readFileSync(p, "utf8")) as VisionOutlineCache;
    if (!j || j.accepted !== true || !Array.isArray(j.ringFt) || j.ringFt.length < 3) return null;
    if (!j.ringFt.every((pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y))) return null;
    if (j.origin && !(Number.isFinite(j.origin.lat) && Number.isFinite(j.origin.lng))) return null;
    return j;
  } catch {
    return null;
  }
}

/** Feet-scale planar distance between two nearby pins — the same
 *  equirectangular flat-earth step as latLngRingToFrame, so it measures
 *  exactly the shift a mismatched origin would inflict on the ring. */
function originDeltaFt(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dx = (a.lng - b.lng) * D2R * Math.cos(b.lat * D2R) * EARTH_R_M * FT_PER_M;
  const dy = (a.lat - b.lat) * D2R * EARTH_R_M * FT_PER_M;
  return Math.hypot(dx, dy);
}

/** Re-express a cached ring (origin-relative to cached.origin) in the
 *  caller's frame: frame → geo with the RECORDED origin, geo → frame with the
 *  caller's. Null means unusable — no recorded origin (legacy cache) or the
 *  two pins are too far apart to be the same property. */
function reframeCachedRing(cached: VisionOutlineCache, origin: { lat: number; lng: number }): P[] | null {
  const co = cached.origin;
  if (!co) return null;
  const delta = originDeltaFt(co, origin);
  if (!Number.isFinite(delta) || delta > MAX_CACHE_ORIGIN_DELTA_FT) return null;
  if (delta < 1e-6) return cached.ringFt;
  const geo = cached.ringFt.map((p) => ({
    lng: co.lng + p.x / (D2R * Math.cos(co.lat * D2R) * EARTH_R_M * FT_PER_M),
    lat: co.lat + p.y / (D2R * EARTH_R_M * FT_PER_M),
  }));
  return latLngRingToFrame(origin, geo).ring;
}

/** Byte-cache name keyed by a digest of the TOKEN, never the candidate's array
 *  index: a fresh Instant response may reorder its imagery, and index-keyed
 *  bytes would pair a stale image with the new candidate's bbox. */
function imageBytesPath(slug: string, token: string): string {
  const digest = createHash("sha256").update(token).digest("hex").slice(0, 16);
  return resolve(CACHE_DIR(), `img-${slug}-t${digest}.png`);
}

// ── image selection + fetch ──────────────────────────────────────────────────

interface PickedImage {
  bytes: ArrayBuffer;
  contentType: string;
  bbox: [number, number, number, number];
  index: number;
}

function bboxArea(b: [number, number, number, number]): number {
  return Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
}

function usableCandidates(
  imagery: OutlineImageCandidate[],
  origin: { lat: number; lng: number },
): Array<{ cand: OutlineImageCandidate; index: number }> {
  return imagery
    .map((cand, index) => ({ cand, index }))
    .filter(({ cand }) => {
      if (cand.view !== "ortho" || !cand.bbox) return false;
      const [minLon, minLat, maxLon, maxLat] = cand.bbox;
      if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite) || maxLon <= minLon || maxLat <= minLat) return false;
      // the pin must be inside — same guard as chimneyVision (a bbox that
      // does not contain the pin is a swapped or foreign tile)
      return origin.lng >= minLon && origin.lng <= maxLon && origin.lat >= minLat && origin.lat <= maxLat;
    })
    .sort((a, b) => {
      const am = a.cand.masked ? 0 : 1;
      const bm = b.cand.masked ? 0 : 1;
      if (am !== bm) return am - bm; //             masked first
      return bboxArea(a.cand.bbox!) - bboxArea(b.cand.bbox!); //  then tightest
    });
}

/** Masked ortho with the tightest bbox first; cached bytes win over the
 *  network; a failed token falls through to the next candidate. */
export async function pickImage(
  imagery: OutlineImageCandidate[],
  origin: { lat: number; lng: number },
  slug: string | undefined,
  reasons: string[],
): Promise<PickedImage | null> {
  for (const { cand, index } of usableCandidates(imagery, origin)) {
    if (cand.bytes && cand.bytes.byteLength > 0) {
      return { bytes: cand.bytes, contentType: cand.contentType ?? "image/png", bbox: cand.bbox!, index };
    }
    if (slug) {
      const p = imageBytesPath(slug, cand.token);
      if (existsSync(p)) {
        const buf = readFileSync(p);
        const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
        return { bytes, contentType: "image/png", bbox: cand.bbox!, index };
      }
    }
    try {
      const img = await fetchPropertyImage(cand.token);
      if (!img.bytes || img.bytes.byteLength === 0) throw new Error("empty image");
      if (slug) {
        // The byte cache is a convenience, isolated from the fetch: on a
        // read-only filesystem (serverless — .cache/ never exists under
        // /var/task) mkdirSync throws EROFS, and a shared try would discard a
        // perfectly good fetch and kill vision in production.
        try {
          mkdirSync(CACHE_DIR(), { recursive: true });
          writeFileSync(imageBytesPath(slug, cand.token), Buffer.from(img.bytes));
        } catch {
          /* best-effort */
        }
      }
      return { bytes: img.bytes, contentType: img.contentType, bbox: cand.bbox!, index };
    } catch (e) {
      reasons.push(`image ${index} fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return null;
}

// ── main entry ───────────────────────────────────────────────────────────────

const FAIL = (reasons: string[], axisDeg: number | null = null): RoofOutlineResult => ({
  ringFt: null,
  cornerCount: 0,
  iou: 0,
  areaSqft: 0,
  orientations: [],
  axisDeg,
  source: "none",
  reasons,
});

/**
 * Trace the outer roof edge on the best Instant ortho with the vision model,
 * regularize it onto the house grid, and accept it only when every gate
 * passes. Best-effort by contract: returns { ringFt: null, reasons } on ANY
 * failure and never throws. An accepted trace is cached per slug; the cache
 * short-circuits the OpenAI call (and works with no key at all) unless
 * opts.force.
 */
export async function traceRoofOutline(
  input: TraceRoofOutlineInput,
  opts: TraceRoofOutlineOptions = {},
): Promise<RoofOutlineResult> {
  try {
    const wallRings = (input.wallRings ?? []).filter((r) => r.length >= 3);
    if (wallRings.length === 0) return FAIL(["no wall rings supplied"]);
    const axisDeg = dominantAxisFromRings(wallRings);

    // cached accepted ring: still re-gated against the CURRENT wall rings so a
    // recalibrated frame can not resurrect a stale trace
    if (input.slug && !opts.force) {
      const cached = readAcceptedCache(input.slug);
      const cachedRing = cached ? reframeCachedRing(cached, input.origin) : null;
      if (cached && cachedRing) {
        const g = evaluateGates(cachedRing, wallRings);
        if (g.reasons.length === 0) {
          return {
            ringFt: cachedRing,
            cornerCount: cachedRing.length,
            iou: g.iou,
            areaSqft: g.areaSqft,
            orientations: cached.orientations,
            axisDeg: cached.axisDeg,
            source: "vision-cache",
            reasons: [],
          };
        }
      }
    }

    if (!isOpenAIEnabled()) return FAIL(["openai disabled (no OPENAI_API_KEY)"], axisDeg);

    const reasons: string[] = [];
    const img = await pickImage(input.imagery ?? [], input.origin, input.slug, reasons);
    if (!img) return FAIL([...reasons, "no usable ortho image"], axisDeg);
    if (img.bytes.byteLength > MAX_IMAGE_BYTES) return FAIL(["image too large for the vision API"], axisDeg);

    const contentType = img.contentType.startsWith("image/") ? img.contentType : "image/png";
    const dataUrl = `data:${contentType};base64,${Buffer.from(img.bytes).toString("base64")}`;

    // the footprint hint, clockwise in image coords (CCW in frame + y flip)
    const primaryWall = wallRings
      .slice()
      .sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)))[0];
    const hint = JSON.stringify(frameRingToNormalized(ensureCCW(primaryWall), img.bbox, input.origin));
    const prompt = buildPrompt(hint);
    debugLog(`footprint hint: ${hint}`);

    // all three temperatures concurrently — the medoid vote is
    // order-independent, and sequential calls (~5.6 s) burned nearly the whole
    // 8 s server deadline that must also cover the ortho download
    const settled = await Promise.allSettled(TRACE_TEMPERATURES.map((t) => requestTrace(dataUrl, prompt, t)));
    const traces: RawOutlineTrace[] = [];
    for (const s of settled) if (s.status === "fulfilled" && s.value) traces.push(s.value);
    if (traces.length === 0) return FAIL([...reasons, "no valid trace from the vision model"], axisDeg);
    debugLog(`traces: ${traces.map((t) => `${t.corners.length}c@t${t.temperature}`).join(", ")}`);

    // medoid first; a failed medoid falls through to the next-closest trace —
    // the gates, not the vote, have the final word
    let firstRejected: { ring: P[]; reasons: string[] } | null = null;
    for (const idx of rankByMedoid(traces)) {
      const trace = traces[idx];
      const rawFrameRing = ensureCCW(normalizedRingToFrame(trace.corners, img.bbox, input.origin));

      // the AI supplies topology; the solver supplies exactness — but when the
      // solve degenerates, the raw ring still gets its day in front of the gates
      const reg = regularizeRing(rawFrameRing, axisDeg);
      const ring = reg?.ring ?? rawFrameRing;
      const orientations =
        reg?.orientations ??
        ring.map((a, i) => {
          const b = ring[(i + 1) % ring.length];
          return snapDirection((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI, axisDeg).orientation;
        });

      const g = evaluateGates(ring, wallRings);
      debugLog(
        `trace t=${trace.temperature}: ${trace.corners.length} → ${ring.length} corners${reg ? "" : " (raw, solver degenerated)"} · ` +
          (g.reasons.length ? `rejected: ${g.reasons.join("; ")}` : `ACCEPTED IoU ${g.iou.toFixed(3)}`),
      );
      if (g.reasons.length > 0) {
        if (!firstRejected) firstRejected = { ring, reasons: g.reasons };
        continue;
      }

      if (input.slug) {
        try {
          mkdirSync(CACHE_DIR(), { recursive: true });
          const payload: VisionOutlineCache = {
            slug: input.slug,
            createdAt: new Date().toISOString(),
            model: getOpenAIModel(),
            origin: { lat: input.origin.lat, lng: input.origin.lng },
            imageIndex: img.index,
            axisDeg,
            rawTraces: traces,
            chosenIndex: idx,
            ringFt: ring,
            orientations,
            gates: g.gates,
            iou: g.iou,
            areaSqft: g.areaSqft,
            accepted: true,
          };
          writeFileSync(cachePath(input.slug), JSON.stringify(payload, null, 2));
        } catch {
          // caching is a convenience; the trace is already accepted
        }
      }

      return {
        ringFt: ring,
        cornerCount: ring.length,
        iou: g.iou,
        areaSqft: g.areaSqft,
        orientations,
        axisDeg,
        source: "vision",
        reasons: [],
      };
    }

    return {
      ...FAIL([...reasons, ...(firstRejected?.reasons ?? ["every trace failed the gates"])], axisDeg),
      rejectedRingFt: firstRejected?.ring,
    };
  } catch (e) {
    return FAIL([`unexpected: ${e instanceof Error ? e.message : String(e)}`]);
  }
}
