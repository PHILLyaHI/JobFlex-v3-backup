// Roof diagram — chimney / penetration detection from the EagleView Instant ortho
// via the vision model, plus the merge with the DSM "post" detector.
//
// Server-only: this file talks to OpenAI with the server key. Never import it
// from a client component.
//
// Why two detectors: Instant only says *whether* a chimney exists (pack 003
// classifier); it does not say where. The DSM detector (chimneyDsm.ts) finds
// things that stick up ≥ 1.5 ft above a facet plane — reliable on position and
// size, blind to what the thing is (a chimney and a plumbing stack look alike
// at 0.1 m/px). The vision pass on the fresh Instant ortho is the opposite:
// weak on position (a bounding box the model eyeballed, normalized 0..1) but it
// can tell a brick chimney from a skylight. mergeChimneys pairs them so the
// drawing gets the DSM's footprint (x, y, size, height) with the vision label.
//
// Frame: every candidate leaves here in the reconstruction's local-feet frame
// (origin = the queried pin, x east, y north). Boxes are mapped through the
// image's EPSG:4326 bbox, so this only works for a north-up ortho — the
// oblique shots have a bbox too but are perspective views; do not pass them.
// The raw lat/lng → frame conversion does not know about the calibration's
// outline transform; the action applies it with applyRigidTransform so vision
// boxes land in the same raster frame as the DSM posts.

import { getOpenAI, getOpenAIModel, isOpenAIEnabled } from "@/lib/sdk/openai";
import { latLngRingToFrame } from "@/lib/roofRecon";
import type { ChimneyCandidate } from "@/lib/roofDiagram/types";

export interface VisionImage {
  bytes: ArrayBuffer;
  contentType: string;
  /** [minLon, minLat, maxLon, maxLat], EPSG:4326, north-up ortho only. */
  bbox: [number, number, number, number];
}

// OpenAI rejects request bodies over 20 MB; base64 inflates by 4/3, so a
// 15 MB image is the most that fits with the prompt. There is no image
// resizing library in this repo, so a larger ortho is simply skipped — vision
// is best-effort and the DSM detector still runs. Instant orthos are ~1–3 MB.
const MAX_IMAGE_BYTES = 15_000_000;

/** DSM and vision centres closer than this are the same object. A chimney is
 *  2–4 ft across and the vision box is eyeballed, so 4 ft absorbs the model's
 *  slop without pairing two separate stacks on the same ridge. */
const PAIR_RADIUS_FT = 4;

/** When Instant insists a chimney exists but nothing was labelled one, a vent
 *  this confident and this big (a real vent pipe is ~0.3 ft) is the chimney. */
const PROMOTE_MIN_CONFIDENCE = 0.6;
const PROMOTE_MIN_EXTENT_FT = 1.5;

/** A roof has at most a couple of chimneys and a handful of penetrations worth
 *  drawing; more than this is detector noise. */
const MAX_CANDIDATES = 8;

/** Plausible plan extent of a penetration. A vent pipe is ~0.3 ft but the
 *  eyeballed box around it is wider; a chimney is 2–6 ft; a skylight up to
 *  ~8 ft. Anything past 12 ft is a dormer, a section of roof or the whole
 *  house; under 0.5 ft is a speck the model imagined. */
const MIN_EXTENT_FT = 0.5;
const MAX_EXTENT_FT = 12;

/** A box covering more than this share of the ortho is not a penetration —
 *  the Instant ortho is framed on one house, so 4 % is already a garage. */
const MAX_BOX_AREA_FRACTION = 0.04;

const KINDS: ReadonlySet<ChimneyCandidate["kind"]> = new Set(["chimney", "vent", "skylight"]);

const PROMPT =
  "You are looking at a north-up aerial photo of a residential lot. The property of interest is the " +
  "house at the CENTRE of the image; ignore every neighbouring building. On that central roof only, " +
  "find every chimney (a rectangular masonry or framed stack, usually with a shadow), roof vent/pipe and skylight. " +
  'Return JSON {"items":[{"kind":"chimney"|"vent"|"skylight","box":[x0,y0,x1,y1],"confidence":0..1}]} ' +
  "with box coordinates normalized 0..1 from the top-left corner. Return an empty list if none.";

interface VisionBox {
  kind: ChimneyCandidate["kind"];
  /** normalized, x0 < x1, y0 < y1, all within [0, 1] */
  box: [number, number, number, number];
  confidence: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Pull the usable boxes out of whatever JSON the model returned. The model
 *  is asked for {"items": [...]} but a bare array or an off-by-one key shows
 *  up often enough that we look in a few places before giving up. */
function parseVisionBoxes(text: string): VisionBox[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  let items: unknown = null;
  if (Array.isArray(parsed)) items = parsed;
  else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    items = obj.items ?? obj.results ?? obj.detections ?? null;
  }
  if (!Array.isArray(items)) return [];

  const out: VisionBox[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const rec = it as Record<string, unknown>;
    const kind = typeof rec.kind === "string" ? rec.kind.toLowerCase() : "";
    if (!KINDS.has(kind as ChimneyCandidate["kind"])) continue;
    const box = rec.box;
    if (!Array.isArray(box) || box.length !== 4 || !box.every(isFiniteNumber)) continue;
    const x0 = Math.min(box[0], box[2]);
    const x1 = Math.max(box[0], box[2]);
    const y0 = Math.min(box[1], box[3]);
    const y1 = Math.max(box[1], box[3]);
    // Outside the image, or a box with no area, is a hallucination — drop it
    // rather than clamp: a clamped box would land on the wrong spot.
    if (x0 < 0 || y0 < 0 || x1 > 1 || y1 > 1) continue;
    if (x1 - x0 <= 0 || y1 - y0 <= 0) continue;
    const c = isFiniteNumber(rec.confidence) ? Math.min(1, Math.max(0, rec.confidence)) : 0.5;
    out.push({ kind: kind as ChimneyCandidate["kind"], box: [x0, y0, x1, y1], confidence: c });
  }
  return out;
}

/** Normalized box → the four geo corners → the local-feet frame → centre + extents.
 *  Image y grows downward, latitude grows upward, hence maxLat - y·span.
 *  Implausible sizes are dropped here rather than clamped: a box that is
 *  really the whole roof has no meaningful centre either. */
function boxToCandidate(
  b: VisionBox,
  bbox: VisionImage["bbox"],
  origin: { lat: number; lng: number },
): ChimneyCandidate | null {
  const [x0, y0, x1, y1] = b.box;
  if ((x1 - x0) * (y1 - y0) > MAX_BOX_AREA_FRACTION) return null;

  const [minLon, minLat, maxLon, maxLat] = bbox;
  const lonSpan = maxLon - minLon;
  const latSpan = maxLat - minLat;
  const toGeo = (x: number, y: number) => ({ lng: minLon + x * lonSpan, lat: maxLat - y * latSpan });
  const { ring } = latLngRingToFrame(origin, [toGeo(x0, y0), toGeo(x1, y0), toGeo(x1, y1), toGeo(x0, y1)]);
  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  const wFt = Math.max(...xs) - Math.min(...xs);
  const hFt = Math.max(...ys) - Math.min(...ys);
  const x = (Math.max(...xs) + Math.min(...xs)) / 2;
  const y = (Math.max(...ys) + Math.min(...ys)) / 2;
  if (![x, y, wFt, hFt].every(Number.isFinite) || wFt <= 0 || hFt <= 0) return null;
  const extent = Math.max(wFt, hFt);
  if (extent > MAX_EXTENT_FT || extent < MIN_EXTENT_FT) return null;
  return { x, y, wFt, hFt, kind: b.kind, confidence: b.confidence, method: "vision" };
}

function toBase64(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("base64");
}

/**
 * Ask the vision model for penetrations on a north-up ortho. Best-effort: any
 * failure (no key, oversized image, network, bad JSON) returns [] so the
 * measurement never fails because of an optional label pass.
 */
export async function detectChimneysVision(
  img: VisionImage,
  origin: { lat: number; lng: number },
): Promise<ChimneyCandidate[]> {
  if (!isOpenAIEnabled()) return [];
  if (!img.bytes || img.bytes.byteLength === 0 || img.bytes.byteLength > MAX_IMAGE_BYTES) return [];
  const [minLon, minLat, maxLon, maxLat] = img.bbox;
  if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite) || maxLon <= minLon || maxLat <= minLat) return [];
  // A north-up ortho of the pin always contains the pin. A bbox that does not
  // is a different tile, a lat/lon-swapped bbox, or an oblique — any of which
  // would put every box somewhere on the wrong side of the world.
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return [];
  if (origin.lng < minLon || origin.lng > maxLon || origin.lat < minLat || origin.lat > maxLat) return [];

  try {
    const client = getOpenAI();
    const contentType = img.contentType && img.contentType.startsWith("image/") ? img.contentType : "image/png";
    const dataUrl = `data:${contentType};base64,${toBase64(img.bytes)}`;
    const completion = await client.chat.completions.create({
      model: getOpenAIModel(),
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
    });
    const text = completion.choices[0]?.message?.content ?? "";
    const boxes = parseVisionBoxes(text);
    const out: ChimneyCandidate[] = [];
    for (const b of boxes) {
      const c = boxToCandidate(b, img.bbox, origin);
      if (c) out.push(c);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Move candidates by the calibration's outline transform: rotate (x, y) about
 * the origin by theta, then translate. Sizes are unchanged — the boxes are
 * axis-aligned eyeballs, not surveyed rectangles, so rotating their extents
 * would be false precision. Pure; returns new objects.
 */
export function applyRigidTransform(
  cands: ChimneyCandidate[],
  t: { thetaRad: number; tx: number; ty: number },
): ChimneyCandidate[] {
  const cos = Math.cos(t.thetaRad);
  const sin = Math.sin(t.thetaRad);
  return cands.map((c) => ({
    ...c,
    x: c.x * cos - c.y * sin + t.tx,
    y: c.x * sin + c.y * cos + t.ty,
  }));
}

/**
 * Drop candidates whose centre is not ON the roof. A vision box that lands in
 * the yard after the transform was never a roof penetration; the margin absorbs
 * an eave overhang and box slop.
 *
 * Against the ROOF, not its bounding box. The box of an L-shaped roof contains
 * the whole notch, so a vent standing in the yard inside the L survived the
 * filter and was drawn on the plan — the "VENT outside the outline" on the
 * report. A roof is a polygon and the test has to be one.
 */
export function dropOutsideRoof(
  cands: ChimneyCandidate[],
  /** Facet rings in plan, feet — the roof as drawn. */
  rings: Array<Array<{ x: number; y: number }>>,
  marginFt = 5,
): ChimneyCandidate[] {
  const usable = rings.filter((r) => r.length >= 3);
  if (!usable.length) return cands;
  const inside = (c: ChimneyCandidate, ring: Array<{ x: number; y: number }>): boolean => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if (a.y > c.y !== b.y > c.y && c.x < ((b.x - a.x) * (c.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
  };
  const near = (c: ChimneyCandidate, ring: Array<{ x: number; y: number }>): boolean => {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / l2)) : 0;
      if (Math.hypot(c.x - (a.x + t * dx), c.y - (a.y + t * dy)) <= marginFt) return true;
    }
    return false;
  };
  return cands.filter((c) => usable.some((r) => inside(c, r) || near(c, r)));
}

function dist(a: ChimneyCandidate, b: ChimneyCandidate): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Top `MAX_CANDIDATES` by confidence. When Instant says there is a chimney,
 *  a labelled chimney must survive the cut even if eight vents outscore it —
 *  otherwise the gate below would promote a vent while the real one sits in
 *  the discard pile. */
function capCandidates(cands: ChimneyCandidate[], gate: { chimney: boolean | null }): ChimneyCandidate[] {
  const sorted = cands.slice().sort((a, b) => b.confidence - a.confidence);
  if (sorted.length <= MAX_CANDIDATES) return sorted;
  const kept = sorted.slice(0, MAX_CANDIDATES);
  if (gate.chimney === true && !kept.some((c) => c.kind === "chimney")) {
    const bestChimney = sorted.find((c) => c.kind === "chimney");
    if (bestChimney) kept[kept.length - 1] = bestChimney;
  }
  return kept;
}

/**
 * Pair DSM and vision candidates (centres within 4 ft): the DSM supplies
 * position, footprint and height, the vision box supplies the label. Unmatched
 * candidates keep their own values. Sorted by confidence and capped at 8, then
 * Instant's chimney flag is applied as a gate.
 */
export function mergeChimneys(
  dsm: ChimneyCandidate[],
  vision: ChimneyCandidate[],
  gate: { chimney: boolean | null },
): ChimneyCandidate[] {
  // Greedy nearest-pair matching: for each DSM post take the closest unused
  // vision box inside the radius. Candidates are few (≤ ~10 each), so O(n·m)
  // is fine and simpler than a proper assignment.
  const usedVision = new Set<number>();
  const merged: ChimneyCandidate[] = [];

  for (const d of dsm) {
    let bestIdx = -1;
    let bestDist = PAIR_RADIUS_FT;
    vision.forEach((v, i) => {
      if (usedVision.has(i)) return;
      const dd = dist(d, v);
      if (dd <= bestDist) {
        bestDist = dd;
        bestIdx = i;
      }
    });
    if (bestIdx < 0) {
      merged.push(d);
      continue;
    }
    usedVision.add(bestIdx);
    const v = vision[bestIdx];
    // The DSM cannot tell a chimney from a stack; the vision label is the
    // whole reason the pass exists, so it wins regardless of the two scores.
    merged.push({
      ...d,
      kind: v.kind,
      confidence: Math.max(d.confidence, v.confidence),
      method: "dsm+vision",
    });
  }
  vision.forEach((v, i) => {
    if (!usedVision.has(i)) merged.push(v);
  });

  const capped = capCandidates(merged, gate);

  // Gate on Instant's classifier. `false` is a positive statement ("no chimney")
  // so chimney labels go; vents and skylights are not what it was asked about.
  // `null` (pack not ordered / unknown) leaves everything alone.
  let out = gate.chimney === false ? capped.filter((c) => c.kind !== "chimney") : capped;

  if (gate.chimney === true && !out.some((c) => c.kind === "chimney")) {
    let best: ChimneyCandidate | null = null;
    for (const c of out) {
      if (c.kind !== "vent") continue;
      if (c.confidence < PROMOTE_MIN_CONFIDENCE) continue;
      if (Math.max(c.wFt, c.hFt) < PROMOTE_MIN_EXTENT_FT) continue;
      if (!best || c.confidence > best.confidence) best = c;
    }
    if (best) {
      const promoted = best;
      out = out.map((c) => (c === promoted ? { ...c, kind: "chimney" } : c));
    }
  }

  return out;
}
