// THE DECK IN 3D, AS DATA (2026-10-04) — pure, no three.js.
//
// Owner: "it starts building in actual kind of a 3D." The frame's sticks
// (frame.ts) and the boards on top (surface.ts) become a list of boxes in
// feet, each filed under the layer it belongs to — footings, posts, beams,
// ledger, joists, rim, blocking, braces, decking, fascia — in the order a
// crew builds them. The studio's 3D stands the layers up one after another
// (the build-up slider) and can fade the boards to show the frame.
//
// The same list rides with the proposal (lib/deck/convertSchema), so the
// client's page shows the deck that was priced — frozen, like the fence's
// scene (lib/fence/scene.ts): a later change to the engine never redraws a
// deck a client has already seen. Nothing is uploaded; production has no
// public Blob store for it and does not need one.
//
// Compact on purpose: a box is seven numbers and a lean code, rounded to a
// thousandth of a foot. A 16 x 12 deck is about 5 KB; the largest deck the
// studio draws stays under the limit below.

import type { DeckFrame } from "./frame";
import type { DeckSurface } from "./surface";
import { shapeOutline, sizeWords } from "./design";

export const DECK_SCENE_VERSION = 1;

/** The layers, in build order. A box's first number is its index here. */
export const SCENE_LAYERS = ["footing", "post", "beam", "ledger", "joist", "rim", "blocking", "brace", "decking", "fascia"] as const;
export type SceneLayer = (typeof SCENE_LAYERS)[number];
export const SCENE_LAYER_LABEL: Record<SceneLayer, string> = {
  footing: "Footings",
  post: "Posts",
  beam: "Beams",
  ledger: "Ledger",
  joist: "Joists",
  rim: "Rim",
  blocking: "Blocking",
  brace: "Braces",
  decking: "Decking",
  fascia: "Fascia",
};

/** The most a stored scene may carry. */
export const SCENE_MAX_BOXES = 6000;
export const SCENE_MAX_FOOTINGS = 400;
export const SCENE_MAX_DIAGONALS = 1500;

export interface DeckScene {
  v: typeof DECK_SCENE_VERSION;
  /** The outline's bounding size and the walking surface's height, ft. */
  widthFt: number;
  depthFt: number;
  heightFt: number;
  /**
   * Boxes: [layer, cx, cy, cz, sx, sy, sz, lean]. Feet; x along the house,
   * y out from it, z up. `lean`: 0 for a square box; 1–4 for a knee brace,
   * drawn as the diagonal of its box (1 = rising toward +x, 2 = toward −x,
   * 3 = toward +y, 4 = toward −y).
   */
  boxes: number[][];
  /** Footings: [x, y, pad diameter, pad thickness, pier diameter, depth below the ground, top above it], ft. */
  footings: number[][];
  /** Boards laid on the diagonal: each a flat ring [x0, y0, x1, y1, …] at the walking surface. */
  diagonal: { thickFt: number; boards: number[][] } | null;
  /** The outline as a flat ring, ft. */
  outline: number[];
  /** The house, where the deck touches one: blocks [x0, y0, x1, y1], its height, and a door on the main wall [centre x, width, height]. */
  house: { blocks: number[][]; heightFt: number; door: number[] | null } | null;
  colors: { frame: string; decking: string; fascia: string };
  /** What the client reads under the picture. */
  facts: string;
}

const r3 = (inches: number) => Math.round((inches / 12) * 1000) / 1000;
const LEAN: Record<string, number> = { "x:1": 1, "x:-1": 2, "y:1": 3, "y:-1": 4 };

/** Treated lumber's green-brown, or the heartwood's own colour. */
function frameColor(frame: DeckFrame): string {
  if (frame.species.id === "redwood") return "#a4573e";
  if (frame.species.id === "western-cedar") return "#b5764a";
  return frame.species.group === "SP" ? "#a59863" : "#9d8c62";
}

/** A convex ring clipped to a rectangle (Sutherland–Hodgman). */
function clipToRect(ring: Array<[number, number]>, x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  const edges: Array<{ inside: (p: [number, number]) => boolean; cross: (a: [number, number], b: [number, number]) => [number, number] }> = [
    { inside: (p) => p[0] >= x0, cross: (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])] },
    { inside: (p) => p[0] <= x1, cross: (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])] },
    { inside: (p) => p[1] >= y0, cross: (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0] },
    { inside: (p) => p[1] <= y1, cross: (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1] },
  ];
  let out = ring;
  for (const e of edges) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[i];
      const b = src[(i + 1) % src.length];
      const ain = e.inside(a);
      const bin = e.inside(b);
      if (ain && bin) out.push(b);
      else if (ain && !bin) out.push(e.cross(a, b));
      else if (!ain && bin) out.push(e.cross(a, b), b);
    }
    if (out.length === 0) break;
  }
  return out;
}

const ringArea = (ring: Array<[number, number]>) => Math.abs(ring.reduce((a, p, i) => a + p[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * p[1], 0)) / 2;

/** Boards at 45° across the deck, each clipped to the rectangles of the outline. Inches in, feet out. */
function diagonalBoards(frame: DeckFrame, surface: DeckSurface): number[][] {
  const zones = frame.zones.map((z) => z.zone);
  const width = Math.max(...zones.map((z) => z.x1));
  const depth = Math.max(...zones.map((z) => z.y1));
  const w = surface.product.widthIn;
  const pitch = w + surface.product.gapIn;
  const out: number[][] = [];
  // A board is the strip between two lines x − y = c: its width across is w, so the lines are w·√2 apart in c.
  const step = pitch * Math.SQRT2;
  const band = w * Math.SQRT2;
  const far = width + depth;
  for (let c = -depth; c < width && out.length < SCENE_MAX_DIAGONALS; c += step) {
    const strip: Array<[number, number]> = [
      [c - far, -far],
      [c + band - far, -far],
      [c + band + far, far],
      [c + far, far],
    ];
    for (const z of zones) {
      const ring = clipToRect(strip, z.x0, z.y0, z.x1, z.y1);
      if (ring.length >= 3 && ringArea(ring) > 2) out.push(ring.flatMap((p) => [r3(p[0]), r3(p[1])]));
    }
  }
  return out;
}

/** The scene a frame and its boards stand up. */
export function deckScene(frame: DeckFrame, surface: DeckSurface): DeckScene {
  const { design } = frame;
  const zones = frame.zones.map((z) => z.zone);
  const width = Math.max(...zones.map((z) => z.x1));
  const depth = Math.max(...zones.map((z) => z.y1));
  const layer = (name: SceneLayer) => SCENE_LAYERS.indexOf(name);
  const boxes: number[][] = [];
  const box = (name: SceneLayer, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, lean = 0) => {
    if (boxes.length < SCENE_MAX_BOXES) boxes.push([layer(name), r3(cx), r3(cy), r3(cz), r3(sx), r3(sy), r3(sz), lean]);
  };

  for (const s of frame.sticks) {
    box(s.role, s.cx, s.cy, s.cz, s.sx, s.sy, s.sz, s.lean ? LEAN[`${s.lean.axis}:${s.lean.dir}`] ?? 0 : 0);
  }
  const boardZ = frame.surfaceIn - surface.product.thickIn / 2;
  for (const p of surface.pieces) box("decking", p.cx, p.cy, boardZ, p.sx, p.sy, surface.product.thickIn);
  if (surface.fascia.on) {
    const t = 0.75;
    const h = surface.fascia.heightIn;
    const z = frame.joistBottomIn + h / 2;
    for (const e of frame.edges) {
      if (e.house) continue;
      if (e.side === "front" || e.side === "back") box("fascia", (e.x0 + e.x1) / 2, e.y0 + (e.side === "front" ? t / 2 : -t / 2), z, Math.abs(e.x1 - e.x0), t, h);
      else box("fascia", e.x0 + (e.side === "right" ? t / 2 : -t / 2), (e.y0 + e.y1) / 2, z, t, Math.abs(e.y1 - e.y0), h);
    }
  }

  const footings = frame.posts.slice(0, SCENE_MAX_FOOTINGS).map((p) => [r3(p.x), r3(p.y), r3(p.footing.padIn), r3(p.footing.padThickIn), r3(p.footing.pierIn), r3(p.footing.depthIn), r3(p.footing.topIn)]);

  // The house: the wall the deck meets, and the part of the house that steps into an L.
  let house: DeckScene["house"] = null;
  if (design.placement !== "detached") {
    const margin = 48;
    const blocks: number[][] = [[r3(-margin), r3(-144), r3(width + margin), 0]];
    if (design.shape.kind === "L" && design.shape.notch.corner.startsWith("back")) {
      const b = zones[1];
      const left = design.shape.notch.corner.endsWith("left");
      blocks.push([r3(left ? -margin : b.x0), 0, r3(left ? b.x1 : width + margin), r3(b.y0)]);
    }
    // A door onto the deck, on the longest stretch of the main wall.
    const main = frame.edges.filter((e) => e.house && e.side === "back" && Math.abs(e.y0) < 0.01).sort((a, b) => b.lengthIn - a.lengthIn)[0];
    const doorWidth = main && main.lengthIn >= 120 ? 72 : 36;
    const door = main && main.lengthIn >= doorWidth + 24 ? [r3((main.x0 + main.x1) / 2), r3(doorWidth), r3(80)] : null;
    house = { blocks, heightFt: Math.max(10, r3(frame.surfaceIn + 108)), door };
  }

  const outline = shapeOutline(design.shape).flatMap((p) => [r3(p.x), r3(p.y)]);

  const height = design.heightIn >= 24 ? `${Math.floor(design.heightIn / 12)} ft${design.heightIn % 12 ? ` ${Math.round(design.heightIn % 12)} in.` : ""}` : `${design.heightIn} in.`;
  return {
    v: DECK_SCENE_VERSION,
    widthFt: r3(width),
    depthFt: r3(depth),
    heightFt: r3(frame.surfaceIn),
    boxes,
    footings,
    diagonal: surface.diagonal ? { thickFt: r3(surface.product.thickIn), boards: diagonalBoards(frame, surface) } : null,
    outline,
    house,
    colors: { frame: frameColor(frame), decking: surface.product.color, fascia: surface.product.color },
    facts: `${sizeWords(design)} · ${Math.round(frame.areaSqFt)} sq ft · ${height} high · ${surface.product.label}`,
  };
}

/* ------------------------------------------------------------------ */
/*  Reading a stored scene back                                        */
/* ------------------------------------------------------------------ */

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const HEX = /^#[0-9a-f]{6}$/i;
const inside = (n: number, min: number, max: number) => n >= min && n <= max;
/** Nothing in a deck scene is farther than this from its origin, ft. */
const REACH = 400;

const numbers = (raw: unknown, length: number, min = -REACH, max = REACH): number[] | null => {
  if (!Array.isArray(raw) || raw.length !== length) return null;
  const out: number[] = [];
  for (const v of raw) {
    if (!fin(v) || !inside(v, min, max)) return null;
    out.push(v);
  }
  return out;
};

/** A stored scene, read back defensively: a bad shape is no scene, never a crash. */
export function parseDeckScene(raw: unknown): DeckScene | null {
  const r = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  if (!r || r.v !== DECK_SCENE_VERSION) return null;
  if (!fin(r.widthFt) || !fin(r.depthFt) || !fin(r.heightFt)) return null;
  if (!inside(r.widthFt, 1, REACH) || !inside(r.depthFt, 1, REACH) || !inside(r.heightFt, 0, 60)) return null;
  if (!Array.isArray(r.boxes) || r.boxes.length > SCENE_MAX_BOXES) return null;
  const boxes: number[][] = [];
  for (const b of r.boxes) {
    const n = numbers(b, 8);
    if (!n || !Number.isInteger(n[0]) || !inside(n[0], 0, SCENE_LAYERS.length - 1) || !Number.isInteger(n[7]) || !inside(n[7], 0, 4)) return null;
    if (n[4] <= 0 || n[5] <= 0 || n[6] <= 0) return null;
    boxes.push(n);
  }
  if (!Array.isArray(r.footings) || r.footings.length > SCENE_MAX_FOOTINGS) return null;
  const footings: number[][] = [];
  for (const f of r.footings) {
    const n = numbers(f, 7);
    if (!n || n[2] <= 0 || n[4] <= 0) return null;
    footings.push(n);
  }
  let diagonal: DeckScene["diagonal"] = null;
  const d = (r.diagonal && typeof r.diagonal === "object" ? r.diagonal : null) as Record<string, unknown> | null;
  if (d) {
    if (!fin(d.thickFt) || !inside(d.thickFt, 0.01, 1) || !Array.isArray(d.boards) || d.boards.length > SCENE_MAX_DIAGONALS) return null;
    const boards: number[][] = [];
    for (const ring of d.boards) {
      if (!Array.isArray(ring) || ring.length < 6 || ring.length > 24 || ring.length % 2 !== 0) return null;
      const n = numbers(ring, ring.length);
      if (!n) return null;
      boards.push(n);
    }
    diagonal = { thickFt: d.thickFt, boards };
  }
  const outline = Array.isArray(r.outline) && r.outline.length >= 8 && r.outline.length <= 24 && r.outline.length % 2 === 0 ? numbers(r.outline, r.outline.length) : null;
  if (!outline) return null;
  let house: DeckScene["house"] = null;
  const h = (r.house && typeof r.house === "object" ? r.house : null) as Record<string, unknown> | null;
  if (h) {
    if (!fin(h.heightFt) || !inside(h.heightFt, 1, 80) || !Array.isArray(h.blocks) || h.blocks.length > 4) return null;
    const blocks: number[][] = [];
    for (const b of h.blocks) {
      const n = numbers(b, 4);
      if (!n) return null;
      blocks.push(n);
    }
    const door = h.door === null || h.door === undefined ? null : numbers(h.door, 3);
    if (h.door !== null && h.door !== undefined && !door) return null;
    house = { blocks, heightFt: h.heightFt, door };
  }
  const c = (r.colors && typeof r.colors === "object" ? r.colors : {}) as Record<string, unknown>;
  const color = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v) ? v : fallback);
  return {
    v: DECK_SCENE_VERSION,
    widthFt: r.widthFt,
    depthFt: r.depthFt,
    heightFt: r.heightFt,
    boxes,
    footings,
    diagonal,
    outline,
    house,
    colors: { frame: color(c.frame, "#9d8c62"), decking: color(c.decking, "#a58a5c"), fascia: color(c.fascia, "#a58a5c") },
    facts: typeof r.facts === "string" ? r.facts.slice(0, 200) : "",
  };
}
