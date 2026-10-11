// THE SMART FIT — the deck finds the wall by itself (2026-10-10). Pure.
//
// Owner: "when I upload a picture of the house where the deck is supposed to
// be, it should find by itself where it's supposed to be — that wall on the
// picture — and if there is a jog on the house, an L shape, it should
// identify that and fit in; address the windows' height and everything you
// see on the wall; the picture adapted so only the wall is on the screen."
//
// The vision model reads the picture once (actions/deckEstimator readDeckPhoto)
// and answers with the wall's geometry as fractions of the picture: where
// the wall meets the ground, its eave, any jog, the back door, the windows,
// and any black bars or a phone's status bar around the picture. Everything
// after that is arithmetic here, so the same read always places the deck
// the same way and the QA script can prove it:
//
//   · the SCALE — pixels per foot — from the back door (80 in. is the door
//     every house has) or, failing that, the wall's height to the eave;
//   · the CROP — the wall and what will stand against it, the bars gone;
//   · the PLACEMENT — the elevation's ground line on the wall's base, the
//     deck centred on the door (an L's notch set to the house's jog), as
//     wide as its feet say at that scale;
//   · the HEIGHT the door asks for — its threshold above the ground is where
//     the deck's floor belongs — and whether a window sill is in the way.
//
// Fractions throughout: x to the right, y down, 0…1 of the picture they
// were read on. The studio crops the picture to `crop` and keeps the
// placement in the cropped picture's own fractions, so the client's page
// (lib/proposalPictures) draws it with no new code.

import type { DeckPhoto, DeckShape } from "./design";

export interface Pt {
  x: number;
  y: number;
}

/** What the vision model reads off the picture, validated. */
export interface WallRead {
  /** The wall's bottom edge, where it meets the ground (or the slab there), left end and right end. */
  base: { left: Pt; right: Pt };
  /** The top of that wall above each base end — the eave, or the top of the first storey. */
  eave: { left: Pt; right: Pt } | null;
  storeys: 1 | 2 | null;
  /** Where the wall steps (an L-shaped house): along the base, and which way the part beyond it goes. */
  jogs: Array<{ x: number; y: number; dir: "toward" | "away"; depthFt: number | null }>;
  /** The back door in that wall (a sliding or patio door), if seen. */
  door: { x0: number; x1: number; bottom: number; top: number } | null;
  windows: Array<{ x0: number; x1: number; sill: number; head: number }>;
  /** Black bands or a phone's status bar at the top and the bottom, as fractions of the height. */
  bars: { top: number; bottom: number };
  confidence: number;
  note: string | null;
}

/** The door every house has: 6 ft 8 in. */
export const DOOR_HEIGHT_FT = 80 / 12;
/** A storey of wall to the eave when there is no door to measure by. */
export const STOREY_FT = 9;
/** A read this unsure is shown, not trusted: the outline is centred and the contractor drags it. */
export const MIN_CONFIDENCE = 0.35;

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const frac = (v: unknown, d: number) => clamp(num(v, d), -0.5, 1.5);
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const pt = (v: unknown): Pt | null => {
  const o = obj(v);
  if (typeof o.x !== "number" || typeof o.y !== "number" || !Number.isFinite(o.x) || !Number.isFinite(o.y)) return null;
  return { x: frac(o.x, 0), y: frac(o.y, 0) };
};

/** The model's JSON, checked field by field; null when there is no usable wall in it. */
export function parseWallRead(raw: unknown): WallRead | null {
  const r = obj(raw);
  const base = obj(r.base);
  const left = pt(base.left);
  const right = pt(base.right);
  if (!left || !right) return null;
  // Left is left: a read with the ends swapped is turned around, not refused.
  const [bl, br] = left.x <= right.x ? [left, right] : [right, left];
  if (br.x - bl.x < 0.08) return null;
  const e = obj(r.eave);
  const el = pt(e.left);
  const er = pt(e.right);
  const eave = el && er && el.y < bl.y - 0.03 && er.y < br.y - 0.03 ? { left: el.x <= er.x ? el : er, right: el.x <= er.x ? er : el } : null;
  const storeys = r.storeys === 2 ? 2 : r.storeys === 1 ? 1 : null;
  const jogs = (Array.isArray(r.jogs) ? r.jogs : [])
    .map((j) => {
      const o = obj(j);
      if (typeof o.x !== "number" || !Number.isFinite(o.x)) return null;
      const x = frac(o.x, 0);
      if (x <= bl.x + 0.02 || x >= br.x - 0.02) return null;
      const t = (x - bl.x) / (br.x - bl.x);
      const y = typeof o.y === "number" && Number.isFinite(o.y) ? frac(o.y, 0) : bl.y + (br.y - bl.y) * t;
      const depthFt = typeof o.depthFt === "number" && Number.isFinite(o.depthFt) && o.depthFt > 0 ? clamp(o.depthFt, 0.5, 40) : null;
      return { x, y, dir: o.dir === "away" ? ("away" as const) : ("toward" as const), depthFt };
    })
    .filter((j): j is NonNullable<typeof j> => !!j)
    .sort((a, b) => a.x - b.x)
    .slice(0, 4);
  const d = obj(r.door);
  const door =
    typeof d.x0 === "number" && typeof d.x1 === "number" && typeof d.bottom === "number" && typeof d.top === "number" && [d.x0, d.x1, d.bottom, d.top].every((v) => Number.isFinite(v as number))
      ? (() => {
          const x0 = frac(Math.min(d.x0 as number, d.x1 as number), 0);
          const x1 = frac(Math.max(d.x0 as number, d.x1 as number), 0);
          const bottom = frac(Math.max(d.bottom as number, d.top as number), 0);
          const top = frac(Math.min(d.bottom as number, d.top as number), 0);
          // A door is taller than it is wide, and it stands on the wall.
          return x1 - x0 >= 0.015 && bottom - top >= 0.04 && x0 >= bl.x - 0.05 && x1 <= br.x + 0.05 ? { x0, x1, bottom, top } : null;
        })()
      : null;
  const windows = (Array.isArray(r.windows) ? r.windows : [])
    .map((w) => {
      const o = obj(w);
      if ([o.x0, o.x1, o.sill, o.head].some((v) => typeof v !== "number" || !Number.isFinite(v))) return null;
      const x0 = frac(Math.min(o.x0 as number, o.x1 as number), 0);
      const x1 = frac(Math.max(o.x0 as number, o.x1 as number), 0);
      const sill = frac(Math.max(o.sill as number, o.head as number), 0);
      const head = frac(Math.min(o.sill as number, o.head as number), 0);
      return x1 - x0 >= 0.01 && sill - head >= 0.02 ? { x0, x1, sill, head } : null;
    })
    .filter((w): w is NonNullable<typeof w> => !!w)
    .slice(0, 12);
  const b = obj(r.bars);
  const bars = { top: clamp(num(b.top, 0), 0, 0.35), bottom: clamp(num(b.bottom, 0), 0, 0.35) };
  const confidence = clamp(num(r.confidence, 0.5), 0, 1);
  const note = typeof r.note === "string" && r.note.trim() ? r.note.trim().slice(0, 240) : null;
  return { base: { left: bl, right: br }, eave, storeys, jogs, door, windows, bars, confidence, note };
}

/** The base line's y at a given x (the wall may run a little uphill in the picture). */
export function baseYAt(read: WallRead, x: number): number {
  const { left, right } = read.base;
  if (right.x - left.x < 1e-6) return left.y;
  const t = clamp((x - left.x) / (right.x - left.x), 0, 1);
  return left.y + (right.y - left.y) * t;
}

export interface PhotoScale {
  /** Pixels per foot in the picture the read was made on. 0 when nothing in it gives a size. */
  pxPerFt: number;
  by: "door" | "eave" | "none";
}

/** A foot in pixels: the door's 80 in., else the wall's storeys to the eave. */
export function scaleFromRead(read: WallRead, photoW: number, photoH: number): PhotoScale {
  if (read.door) {
    const px = (read.door.bottom - read.door.top) * photoH;
    if (px > 8) return { pxPerFt: px / DOOR_HEIGHT_FT, by: "door" };
  }
  if (read.eave) {
    const px = ((read.base.left.y - read.eave.left.y + (read.base.right.y - read.eave.right.y)) / 2) * photoH;
    if (px > 8) return { pxPerFt: px / (STOREY_FT * (read.storeys ?? 1)), by: "eave" };
  }
  void photoW;
  return { pxPerFt: 0, by: "none" };
}

export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the fit is sized for: the deck's elevation as lib/deck/elevation measures it. */
export interface FitDeck {
  shape: DeckShape;
  /** The elevation's width and height, ft (a roof's overhang can reach past the deck). */
  elevWidthFt: number;
  elevHeightFt: number;
  /** Where the deck's x = 0 lands in the elevation, ft. */
  elevLeftFt: number;
}

export interface Placed {
  x: number;
  y: number;
  w: number;
}

/** The outline's bounds on the read's picture, in fractions, for a placement in that picture. */
function outlineBox(placed: Placed, deck: FitDeck, photoW: number, photoH: number): { x0: number; x1: number; y0: number; y1: number } {
  const sx = placed.w / deck.elevWidthFt; // fraction of width per ft
  const sy = sx * (photoW / photoH); // fraction of height per ft (a foot is the same pixels both ways)
  return { x0: placed.x, x1: placed.x + placed.w, y1: placed.y, y0: placed.y - deck.elevHeightFt * sy };
}

/**
 * Where the deck goes on the read's picture: the ground line on the wall's
 * base, centred on the door (an L's back notch on the house's jog), as wide
 * as the elevation's feet at the scale. Null without a scale.
 */
export function placeOnWall(read: WallRead, scale: PhotoScale, deck: FitDeck, photoW: number, photoH: number): Placed | null {
  if (!(scale.pxPerFt > 0) || !(deck.elevWidthFt > 0) || !(photoW > 0)) return null;
  void photoH; // the ground line is read off the base, which already carries the picture's height
  const ftX = scale.pxPerFt / photoW; // fraction of width per ft
  const w = deck.elevWidthFt * ftX;
  const deckW = deck.shape.widthFt;
  // The deck's centre on the wall.
  let cx: number;
  const toward = read.jogs.find((j) => j.dir === "toward");
  if (deck.shape.kind === "L" && deck.shape.notch.corner.startsWith("back") && toward) {
    // The house bumps out into the deck: the notch's edge meets the jog.
    const nw = deck.shape.notch.widthFt;
    cx = deck.shape.notch.corner === "back-left" ? toward.x - nw * ftX + (deckW / 2) * ftX : toward.x + nw * ftX - (deckW / 2) * ftX;
  } else if (read.door) cx = (read.door.x0 + read.door.x1) / 2;
  else if (read.jogs.length) {
    // No door: the widest run of wall between jogs.
    const xs = [read.base.left.x, ...read.jogs.map((j) => j.x), read.base.right.x];
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > xs[best + 1] - xs[best]) best = i - 1;
    cx = (xs[best] + xs[best + 1]) / 2;
  } else cx = (read.base.left.x + read.base.right.x) / 2;
  const x = cx - (deck.elevLeftFt + deckW / 2) * ftX;
  const y = baseYAt(read, cx);
  return { x: r3(x), y: r3(y), w: r3(w) };
}

/**
 * The picture cut to the wall: the base and the eave (or the structure's
 * height when there is no eave) with room around them, the bars gone, and
 * never less than three fifths of the picture wide. The outline's own box
 * is kept inside it, so a deck wider than the wall still shows whole.
 */
export function cropForWall(read: WallRead, scale: PhotoScale, placed: Placed | null, deck: FitDeck, photoW: number, photoH: number): Crop {
  const ftY = scale.pxPerFt > 0 ? scale.pxPerFt / photoH : 0;
  const top = clamp(read.bars.top, 0, 0.35);
  const bottom = 1 - clamp(read.bars.bottom, 0, 0.35);
  let x0 = read.base.left.x;
  let x1 = read.base.right.x;
  const baseY = Math.max(read.base.left.y, read.base.right.y);
  let y0 = read.eave ? Math.min(read.eave.left.y, read.eave.right.y) : baseY - (ftY > 0 ? (STOREY_FT + 1) * ftY : 0.45);
  let y1 = baseY;
  if (placed) {
    const box = outlineBox(placed, deck, photoW, photoH);
    x0 = Math.min(x0, box.x0);
    x1 = Math.max(x1, box.x1);
    y0 = Math.min(y0, box.y0);
    y1 = Math.max(y1, box.y1);
  }
  // Room around it: a tenth of the span each side, a little sky, two feet of yard.
  const mx = Math.max(0.04, (x1 - x0) * 0.1);
  const my = Math.max(0.04, (y1 - y0) * 0.12);
  x0 -= mx;
  x1 += mx;
  y0 -= my;
  y1 += ftY > 0 ? Math.max(my * 0.6, 2 * ftY) : my;
  // Never a sliver: at least three fifths of the picture wide, half of it tall.
  if (x1 - x0 < 0.6) {
    const c = (x0 + x1) / 2;
    x0 = c - 0.3;
    x1 = c + 0.3;
  }
  if (y1 - y0 < 0.5) {
    const c = (y0 + y1) / 2;
    y0 = c - 0.25;
    y1 = c + 0.25;
  }
  x0 = clamp(x0, 0, 1);
  x1 = clamp(x1, 0, 1);
  y0 = clamp(y0, top, bottom);
  y1 = clamp(y1, top, bottom);
  if (x1 - x0 < 0.2 || y1 - y0 < 0.2) return { x: 0, y: top, w: 1, h: r3(bottom - top) };
  return { x: r3(x0), y: r3(y0), w: r3(x1 - x0), h: r3(y1 - y0) };
}

/** A placement on the read's picture, said in the cropped picture's fractions. */
export function placedInCrop(placed: Placed, crop: Crop): Placed {
  return { x: r3((placed.x - crop.x) / crop.w), y: r3((placed.y - crop.y) / crop.h), w: r3(placed.w / crop.w) };
}

/** The door's threshold above the ground, in inches — where the deck's floor belongs. Null without a door or a scale. */
export function heightFromDoor(read: WallRead, scale: PhotoScale, photoH: number): number | null {
  if (!read.door || !(scale.pxPerFt > 0)) return null;
  const cx = (read.door.x0 + read.door.x1) / 2;
  const px = (baseYAt(read, cx) - read.door.bottom) * photoH;
  const inches = Math.round((px / scale.pxPerFt) * 12);
  if (inches < 4 || inches > 360) return null;
  return inches;
}

/** The lowest window sill above the ground, in inches, among the windows over the deck's span. Null when none. */
export function lowestSillIn(read: WallRead, scale: PhotoScale, placed: Placed | null, photoH: number): number | null {
  if (!(scale.pxPerFt > 0) || !read.windows.length) return null;
  const inSpan = placed ? read.windows.filter((w) => w.x1 > placed.x && w.x0 < placed.x + placed.w) : read.windows;
  if (!inSpan.length) return null;
  const sills = inSpan.map((w) => Math.round((((baseYAt(read, (w.x0 + w.x1) / 2) - w.sill) * photoH) / scale.pxPerFt) * 12));
  return Math.min(...sills);
}

export interface PhotoFit {
  scale: PhotoScale;
  crop: Crop;
  /** In the CROPPED picture's fractions — what the design keeps. */
  placed: Placed;
  /** The read's wall, said in feet when there is a scale. */
  wallFt: number | null;
  suggestedHeightIn: number | null;
  lowestSillIn: number | null;
  door: boolean;
  windows: number;
  jog: boolean;
  confidence: number;
  /** What was found and what to do about it, one line each, for the strip under the photo. */
  notes: string[];
  /** The read was too unsure to place by: the outline is centred and the notes say so. */
  unsure: boolean;
}

/** "18 in.", "3 ft", "2'-10"" — the studio's own way of saying a height. */
const inWords = (n: number) => (n < 24 ? `${n} in.` : n % 12 === 0 ? `${n / 12} ft` : `${Math.floor(n / 12)}'-${n % 12}"`);

/** Everything the studio needs from one read of the picture. */
export function fitPhoto(read: WallRead, deck: FitDeck, heightIn: number, photoW: number, photoH: number): PhotoFit {
  const scale = scaleFromRead(read, photoW, photoH);
  const unsure = read.confidence < MIN_CONFIDENCE;
  const onWall = unsure ? null : placeOnWall(read, scale, deck, photoW, photoH);
  const crop = cropForWall(read, scale, onWall, deck, photoW, photoH);
  const placed = onWall ? placedInCrop(onWall, crop) : { x: 0.1, y: r3(clamp((baseYAt(read, 0.5) - crop.y) / crop.h, 0.3, 0.98)), w: 0.8 };
  const wallFt = scale.pxPerFt > 0 ? Math.round(((read.base.right.x - read.base.left.x) * photoW) / scale.pxPerFt) : null;
  const suggestedHeightIn = heightFromDoor(read, scale, photoH);
  const sill = lowestSillIn(read, scale, onWall, photoH);
  const notes: string[] = [];
  if (unsure) notes.push("The wall could not be read with confidence — the outline is centred; drag it to the wall and pull the handle to size it.");
  else {
    const found = [wallFt ? `the wall, about ${wallFt} ft wide` : "the wall", read.door ? "the back door" : null, read.windows.length ? `${read.windows.length} window${read.windows.length === 1 ? "" : "s"}` : null, read.jogs.length ? "a jog in the house" : null].filter(Boolean);
    notes.push(`Found ${found.join(", ")} — scale from the ${scale.by === "door" ? "door (80 in.)" : scale.by === "eave" ? "wall's height to the eave" : "picture: none, so the size is yours to pull"}.`);
    if (read.door) notes.push(`The deck is centred on the door${deck.shape.kind === "L" && read.jogs.some((j) => j.dir === "toward") && deck.shape.notch.corner.startsWith("back") ? ", its notch on the house's jog" : ""}.`);
    else if (read.jogs.length) notes.push("No door seen — the deck sits on the longest run of wall; drag it where the door is.");
    if (suggestedHeightIn !== null && Math.abs(suggestedHeightIn - heightIn) >= 2) notes.push(`The door's threshold is ${inWords(suggestedHeightIn)} above the ground — that is where the floor belongs (the design says ${inWords(Math.round(heightIn))}).`);
    else if (suggestedHeightIn !== null) notes.push(`The door's threshold is ${inWords(suggestedHeightIn)} up — the floor height matches it.`);
    if (sill !== null && heightIn + 2 > sill) notes.push(`A window sill is only ${inWords(sill)} up — a ${inWords(Math.round(heightIn))} floor would come above it: lower the deck, or that window becomes a door.`);
    else if (sill !== null) notes.push(`The lowest window sill is ${inWords(sill)} up — the floor stays below it.`);
  }
  if (read.note) notes.push(read.note);
  return { scale, crop, placed, wallFt, suggestedHeightIn, lowestSillIn: sill, door: !!read.door, windows: read.windows.length, jog: read.jogs.length > 0, confidence: read.confidence, notes: notes.slice(0, 6), unsure };
}

/** The small record the design keeps of a fit, so the strip can say what it found after a reload. */
export function fitSummary(fit: PhotoFit): NonNullable<DeckPhoto["fit"]> {
  return { by: fit.scale.by, pxPerFt: Math.round(fit.scale.pxPerFt * 100) / 100, wallFt: fit.wallFt, suggestedHeightIn: fit.suggestedHeightIn, door: fit.door, windows: fit.windows, jog: fit.jog, confidence: Math.round(fit.confidence * 100) / 100, notes: fit.notes };
}

/**
 * Black bands at the top and the bottom of a picture (a phone's screenshot
 * of a photo): how many rows to cut from each end, from each row's mean
 * brightness (0…255). A band is contiguous rows darker than `dark`, at
 * most a third of the picture from either end.
 */
export function letterboxRows(rowMean: ArrayLike<number>, dark = 22): { top: number; bottom: number } {
  const n = rowMean.length;
  const cap = Math.floor(n / 3);
  let top = 0;
  while (top < cap && rowMean[top] <= dark) top++;
  let bottom = 0;
  while (bottom < cap && rowMean[n - 1 - bottom] <= dark) bottom++;
  // A band thinner than a hair is noise, not a bar.
  if (top < Math.max(4, n * 0.01)) top = 0;
  if (bottom < Math.max(4, n * 0.01)) bottom = 0;
  return { top, bottom };
}

/** The prompt the read runs on — the JSON the model must answer with, field by field. */
export const WALL_READ_PROMPT = `You read one photo of the back (or side) of a house, taken from the yard, for a deck builder. Answer with ONE JSON object and nothing else. Every coordinate is a FRACTION of the whole picture: x from 0 at the left edge to 1 at the right edge, y from 0 at the top edge to 1 at the bottom edge. Use the picture exactly as given, including any black bands.
{
  "base": {"left": {"x","y"}, "right": {"x","y"}},   // the two ends of the house wall's bottom edge where the wall meets the ground, the patio or the old deck — the wall a new deck would stand against (the main face toward the camera). Include the whole face, across any step in it.
  "eave": {"left": {"x","y"}, "right": {"x","y"}} | null,   // the top of that wall face above each base end: the eave, or the top of the first storey if the wall goes up two storeys.
  "storeys": 1 | 2 | null,   // storeys of wall between the base and the eave you gave.
  "jogs": [{"x", "y", "dir": "toward" | "away", "depthFt": number | null}],   // where the wall steps in or out (an L-shaped house, a bump-out, a bay): x along the base; "toward" when the part of the wall to the RIGHT of the step comes toward the camera, "away" when it steps back; depthFt your estimate of the step. [] when the wall is one flat face.
  "door": {"x0", "x1", "bottom", "top"} | null,   // the back door in that wall (a sliding, patio or hinged door): its left and right edges, the bottom of the door (its threshold) and the top of the door frame. Null when there is none in the wall.
  "windows": [{"x0", "x1", "sill", "head"}],   // each window in that wall: left and right edges, the sill (bottom) and the head (top). [] when none.
  "bars": {"top", "bottom"},   // black bands, a phone's status bar or another app's chrome at the top and the bottom of the picture, as fractions of the picture's height; 0 when the picture goes edge to edge.
  "confidence": 0..1,   // how sure you are of the base line and the door.
  "note": string | null   // one short sentence a builder should know (a hose bib in the way, a window well, the ground sloping), else null.
}
Rules: the base line is where the WALL meets the ground, not where the roof or a fence does; a standard exterior door is about 80 inches tall — use it to judge sizes; if the ground in front of the wall is hidden (a hedge, an old deck), give the base where the wall would meet it; never invent a door or a window you cannot see.`;
