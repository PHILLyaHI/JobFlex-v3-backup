// THE DECK IN 3D, AS DATA (2026-10-04; roofs 2026-10-10) — pure, no three.js.
//
// Owner: "it starts building in actual kind of a 3D." The frame's sticks
// (frame.ts), the boards on top (surface.ts) and, since M2, the roof's
// members and planes (roof.ts) become a list of boxes and polygons in feet,
// each filed under the layer it belongs to, in the order a crew builds them.
// The studio's 3D stands the layers up one after another (the build-up
// slider) and can fade the boards and the roofing to show the frame.
//
// The same list rides with the proposal (lib/deck/convertSchema), so the
// client's page shows the deck that was priced — frozen, like the fence's
// scene: a later change to the engine never redraws a deck a client has
// already seen. Nothing is uploaded for it.
//
// VERSION 2 (M2): ten more layers for the slab and the roof; a box may carry
// two more numbers, its yaw (the direction of its axis in plan) and its tilt
// (its rise along that axis), for rafters, hips, headers around a polygon;
// `polys` are the roof's flat faces. A version-1 scene still reads: its
// eight-number boxes are square to the axes, and its layer numbers are the
// same first ten.

import type { DeckFrame } from "./frame";
import type { DeckSurface } from "./surface";
import type { RoofFrame, RoofMember, RoofPlane } from "./roof";
import { ROOFING_LABEL, hasDeck, shapeOutline, sizeWords, structureWords, type DeckDesign } from "./design";

export const DECK_SCENE_VERSION = 2;

/** The layers. A box's first number is its index here; the first ten are version 1's, in its order. */
export const SCENE_LAYERS = [
  "footing",
  "post",
  "beam",
  "ledger",
  "joist",
  "rim",
  "blocking",
  "brace",
  "decking",
  "fascia",
  "slab",
  "roof-post",
  "header",
  "ridge",
  "rafter",
  "sheathing",
  "roofing",
  "trim",
  "gutter",
  "ceiling",
] as const;
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
  slab: "Slab",
  "roof-post": "Roof posts",
  header: "Headers",
  ridge: "Ridge and hips",
  rafter: "Rafters",
  sheathing: "Sheathing",
  roofing: "Roofing",
  trim: "Fascia and soffit",
  gutter: "Gutters",
  ceiling: "Ceiling",
};
/** The order the build-up slider stands the layers up in (a slab goes down first). */
export const SCENE_BUILD_ORDER: readonly SceneLayer[] = ["slab", "footing", "post", "beam", "ledger", "joist", "rim", "blocking", "brace", "decking", "fascia", "roof-post", "header", "ridge", "rafter", "sheathing", "roofing", "trim", "gutter", "ceiling"];
/** A layer's step in the build-up. */
export const buildRank = (layer: SceneLayer) => SCENE_BUILD_ORDER.indexOf(layer);
/** The layers a scene actually has, in build order — the slider runs over these. */
export function sceneBuildLayers(scene: DeckScene): SceneLayer[] {
  const present = new Set<number>();
  for (const b of scene.boxes) present.add(b[0]);
  for (const p of scene.polys) present.add(p[0]);
  if (scene.footings.length) present.add(SCENE_LAYERS.indexOf("footing"));
  if (scene.diagonal?.boards.length) present.add(SCENE_LAYERS.indexOf("decking"));
  return SCENE_BUILD_ORDER.filter((l) => present.has(SCENE_LAYERS.indexOf(l)));
}

/** The most a stored scene may carry. */
export const SCENE_MAX_BOXES = 8000;
export const SCENE_MAX_FOOTINGS = 400;
export const SCENE_MAX_DIAGONALS = 1500;
export const SCENE_MAX_POLYS = 400;

export interface DeckScene {
  v: typeof DECK_SCENE_VERSION;
  /** The outline's bounding size and the walking surface's height, ft; the roof's peak when there is one. */
  widthFt: number;
  depthFt: number;
  heightFt: number;
  peakFt: number;
  /**
   * Boxes: [layer, cx, cy, cz, sx, sy, sz, lean] or, with a direction,
   * [layer, cx, cy, cz, sx, sy, sz, lean, yaw, tilt]. Feet; x along the
   * house, y out from it, z up. `lean`: 0 for a square box; 1–4 for a knee
   * brace drawn as the diagonal of its box (1 = rising toward +x, 2 = toward
   * −x, 3 = toward +y, 4 = toward −y). With a yaw and a tilt (radians) the
   * box is `sx` long along an axis that points `yaw` from +x in plan and
   * rises `tilt`; `sy` is its width across, `sz` its depth.
   */
  boxes: number[][];
  /** Footings: [x, y, pad diameter, pad thickness, pier diameter, depth below the ground, top above it], ft. */
  footings: number[][];
  /** Boards laid on the diagonal: each a flat ring [x0, y0, x1, y1, …] at the walking surface. */
  diagonal: { thickFt: number; boards: number[][] } | null;
  /** Flat polygons in space: [layer, x, y, z, x, y, z, …], ft — the roof's faces, the ceiling, the soffit, a slab. */
  polys: number[][];
  /** The outline as a flat ring, ft (the deck's, or the roof's posts when there is no deck). */
  outline: number[];
  /** The house, where the deck touches one: blocks [x0, y0, x1, y1], its height, and a door on the main wall [centre x, width, height]. */
  house: { blocks: number[][]; heightFt: number; door: number[] | null } | null;
  colors: { frame: string; decking: string; fascia: string; roofing: string };
  /** What the client reads under the picture. */
  facts: string;
}

const r3 = (inches: number) => Math.round((inches / 12) * 1000) / 1000;
const r4 = (rad: number) => Math.round(rad * 10000) / 10000;
const LEAN: Record<string, number> = { "x:1": 1, "x:-1": 2, "y:1": 3, "y:-1": 4 };

/** Treated lumber's green-brown, or the heartwood's own colour. */
function frameColor(speciesId: string, group: string): string {
  if (speciesId === "redwood") return "#a4573e";
  if (speciesId === "western-cedar") return "#b5764a";
  return group === "SP" ? "#a59863" : "#9d8c62";
}

/** The roofing's colour in the 3D. */
export function roofingColor(roofing: DeckDesign["roof"]["roofing"]): string {
  switch (roofing) {
    case "3tab-shingle":
      return "#5b5651";
    case "designer-shingle":
      return "#4a4642";
    case "cedar-shake":
      return "#9a7a52";
    case "metal-panel":
      return "#6f7478";
    case "standing-seam":
      return "#3f4a55";
    case "none":
      return "#9d8c62";
    default:
      return "#565250";
  }
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

/** Which layer a roof member is drawn in. */
const ROOF_MEMBER_LAYER: Record<RoofMember["role"], SceneLayer> = {
  "roof-post": "roof-post",
  header: "header",
  "roof-ledger": "header",
  "roof-brace": "header",
  rafter: "rafter",
  jack: "rafter",
  fly: "rafter",
  tie: "rafter",
  purlin: "rafter",
  slat: "rafter",
  hip: "ridge",
  ridge: "ridge",
  king: "ridge",
  ring: "ridge",
  "tier-post": "ridge",
  subfascia: "trim",
  "fascia-eave": "trim",
  "fascia-rake": "trim",
  cupola: "trim",
  gutter: "gutter",
  downspout: "gutter",
};
const ROOF_PLANE_LAYER: Record<RoofPlane["kind"], SceneLayer> = { sheathing: "sheathing", roofing: "roofing", ceiling: "ceiling", soffit: "trim", slab: "slab" };

export interface SceneInput {
  /** The deck's frame and boards — null for a gazebo or a pergola on a slab or the ground. */
  frame: DeckFrame | null;
  surface: DeckSurface | null;
  roof: RoofFrame | null;
  design: DeckDesign;
}

/** The scene a frame, its boards and its roof stand up. */
export function deckScene(frame: DeckFrame | null, surface: DeckSurface | null, extra: { roof?: RoofFrame | null; design?: DeckDesign } = {}): DeckScene {
  const roof = extra.roof ?? null;
  const design = extra.design ?? frame?.design;
  if (!design) throw new Error("deckScene needs a frame or a design");
  const layer = (name: SceneLayer) => SCENE_LAYERS.indexOf(name);
  const boxes: number[][] = [];
  const polys: number[][] = [];
  const box = (name: SceneLayer, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, lean = 0) => {
    if (boxes.length < SCENE_MAX_BOXES) boxes.push([layer(name), r3(cx), r3(cy), r3(cz), r3(sx), r3(sy), r3(sz), lean]);
  };
  const turned = (name: SceneLayer, m: RoofMember) => {
    if (boxes.length >= SCENE_MAX_BOXES) return;
    const yaw = r4(m.yaw);
    const tilt = r4(m.tilt);
    if (yaw === 0 && tilt === 0) boxes.push([layer(name), r3(m.cx), r3(m.cy), r3(m.cz), r3(m.sx), r3(m.sy), r3(m.sz), 0]);
    else boxes.push([layer(name), r3(m.cx), r3(m.cy), r3(m.cz), r3(m.sx), r3(m.sy), r3(m.sz), 0, yaw, tilt]);
  };

  // The deck.
  let width = 0;
  let depth = 0;
  let heightIn = 0;
  if (frame) {
    const zones = frame.zones.map((z) => z.zone);
    width = Math.max(...zones.map((z) => z.x1));
    depth = Math.max(...zones.map((z) => z.y1));
    heightIn = frame.surfaceIn;
    for (const s of frame.sticks) box(s.role, s.cx, s.cy, s.cz, s.sx, s.sy, s.sz, s.lean ? LEAN[`${s.lean.axis}:${s.lean.dir}`] ?? 0 : 0);
    if (surface) {
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
    }
  }

  // The roof.
  let peakIn = heightIn;
  if (roof) {
    for (const m of roof.members) turned(ROOF_MEMBER_LAYER[m.role], m);
    for (const p of roof.planes) {
      if (polys.length >= SCENE_MAX_POLYS) break;
      polys.push([layer(ROOF_PLANE_LAYER[p.kind]), ...p.ring.map((v) => r3(v))]);
    }
    for (const p of roof.posts) {
      if (p.footing && p.bearing === "ground") {
        /* drawn below with the footings */
      }
    }
    peakIn = Math.max(peakIn, roof.peakIn);
    const xs = roof.eaveRing.map((p) => p.x);
    const ys = roof.eaveRing.map((p) => p.y);
    width = Math.max(width, Math.max(...xs));
    depth = Math.max(depth, Math.max(...ys));
    if (!frame) {
      heightIn = roof.floorIn;
    }
  }

  // Footings: the deck's (the roof's on a deck are among them), and the roof's own on the ground.
  const footings: number[][] = [];
  const pushFooting = (x: number, y: number, f: { padIn: number; padThickIn: number; pierIn: number; depthIn: number; topIn: number }) => {
    if (footings.length < SCENE_MAX_FOOTINGS) footings.push([r3(x), r3(y), r3(f.padIn), r3(f.padThickIn), r3(f.pierIn), r3(f.depthIn), r3(f.topIn)]);
  };
  if (frame) for (const p of frame.posts) pushFooting(p.x, p.y, p.footing);
  if (roof) for (const p of roof.posts) if (p.footing) pushFooting(p.x, p.y, p.footing);

  // The house: the wall the deck meets, and the part of the house that steps into an L.
  let house: DeckScene["house"] = null;
  const onWall = frame ? design.placement !== "detached" : roof?.attach === "wall";
  if (onWall) {
    const margin = 48;
    const blocks: number[][] = [[r3(-margin), r3(-144), r3(width + margin), 0]];
    if (frame && design.shape.kind === "L" && design.shape.notch.corner.startsWith("back")) {
      const b = frame.zones[1].zone;
      const left = design.shape.notch.corner.endsWith("left");
      blocks.push([r3(left ? -margin : b.x0), 0, r3(left ? b.x1 : width + margin), r3(b.y0)]);
    }
    // A door onto the deck, on the longest stretch of the main wall.
    const main = frame ? frame.edges.filter((e) => e.house && e.side === "back" && Math.abs(e.y0) < 0.01).sort((a, b) => b.lengthIn - a.lengthIn)[0] : { x0: 0, x1: width, lengthIn: width };
    const doorWidth = main && main.lengthIn >= 120 ? 72 : 36;
    const door = main && main.lengthIn >= doorWidth + 24 ? [r3((main.x0 + main.x1) / 2), r3(doorWidth), r3(80)] : null;
    // The wall stands above the roof where one leans on it.
    const wallTop = Math.max(heightIn + 108, peakIn + 30);
    house = { blocks, heightFt: Math.max(10, r3(wallTop)), door };
  }

  const outline = frame ? shapeOutline(design.shape).flatMap((p) => [r3(p.x), r3(p.y)]) : (roof?.ring ?? []).flatMap((p) => [r3(p.x), r3(p.y)]);

  const height = heightIn >= 24 ? `${Math.floor(heightIn / 12)} ft${heightIn % 12 ? ` ${Math.round(heightIn % 12)} in.` : ""}` : `${heightIn} in.`;
  const factParts = [structureWords(design)];
  if (frame) factParts.push(`${Math.round(frame.areaSqFt)} sq ft`, `${height} high`, frame.decking.label);
  if (roof) {
    if (roof.kind === "pergola") factParts.push(`${roof.rafters.size} rafters, ${design.roof.slats.size} slats`);
    else factParts.push(`${roof.kind === "double-tier" ? "double-tier" : roof.kind} roof ${design.roof.pitch}:12`, ROOFING_LABEL[design.roof.roofing].toLowerCase());
  }
  const colors = { frame: frameColor(design.framing.species, frame?.group ?? roof?.group ?? "SP"), decking: surface?.product.color ?? "#a58a5c", fascia: surface?.product.color ?? "#a58a5c", roofing: roofingColor(design.roof.roofing) };
  return {
    v: DECK_SCENE_VERSION,
    widthFt: r3(Math.max(width, 48)),
    depthFt: r3(Math.max(depth, 48)),
    heightFt: r3(heightIn),
    peakFt: r3(peakIn),
    boxes,
    footings,
    diagonal: frame && surface?.diagonal ? { thickFt: r3(surface.product.thickIn), boards: diagonalBoards(frame, surface) } : null,
    polys,
    outline,
    house,
    colors,
    facts: factParts.join(" · "),
  };
}

/** The words the figure's caption uses when there is no deck under it. */
export const sceneSizeWords = sizeWords;
export const sceneHasDeck = hasDeck;

/* ------------------------------------------------------------------ */
/*  Reading a stored scene back                                        */
/* ------------------------------------------------------------------ */

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const HEX = /^#[0-9a-f]{6}$/i;
const inside = (n: number, min: number, max: number) => n >= min && n <= max;
/** Nothing in a deck scene is farther than this from its origin, ft. */
const REACH = 400;
/** Version 1 knew only the first ten layers. */
const V1_LAYERS = 10;

const numbers = (raw: unknown, length: number, min = -REACH, max = REACH): number[] | null => {
  if (!Array.isArray(raw) || raw.length !== length) return null;
  const out: number[] = [];
  for (const v of raw) {
    if (!fin(v) || !inside(v, min, max)) return null;
    out.push(v);
  }
  return out;
};

/** A stored scene, read back defensively: a bad shape is no scene, never a crash. Reads version 1 and 2. */
export function parseDeckScene(raw: unknown): DeckScene | null {
  const r = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  if (!r || (r.v !== 1 && r.v !== DECK_SCENE_VERSION)) return null;
  const v1 = r.v === 1;
  const maxLayer = (v1 ? V1_LAYERS : SCENE_LAYERS.length) - 1;
  if (!fin(r.widthFt) || !fin(r.depthFt) || !fin(r.heightFt)) return null;
  if (!inside(r.widthFt, 1, REACH) || !inside(r.depthFt, 1, REACH) || !inside(r.heightFt, 0, 60)) return null;
  const peakFt = fin(r.peakFt) && inside(r.peakFt, 0, 120) ? r.peakFt : r.heightFt;
  if (!Array.isArray(r.boxes) || r.boxes.length > SCENE_MAX_BOXES) return null;
  const boxes: number[][] = [];
  for (const b of r.boxes) {
    const long = Array.isArray(b) && b.length === 10 && !v1;
    const n = numbers(b, long ? 10 : 8);
    if (!n || !Number.isInteger(n[0]) || !inside(n[0], 0, maxLayer) || !Number.isInteger(n[7]) || !inside(n[7], 0, 4)) return null;
    if (n[4] <= 0 || n[5] <= 0 || n[6] <= 0) return null;
    if (long && (!inside(n[8], -7, 7) || !inside(n[9], -1.6, 1.6))) return null;
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
  const polys: number[][] = [];
  if (!v1) {
    if (r.polys !== undefined && (!Array.isArray(r.polys) || r.polys.length > SCENE_MAX_POLYS)) return null;
    for (const p of (r.polys as unknown[]) ?? []) {
      if (!Array.isArray(p) || p.length < 10 || p.length > 1 + 3 * 12 || (p.length - 1) % 3 !== 0) return null;
      const n = numbers(p, p.length);
      if (!n || !Number.isInteger(n[0]) || !inside(n[0], 0, maxLayer)) return null;
      polys.push(n);
    }
  }
  const outline = Array.isArray(r.outline) && r.outline.length >= 6 && r.outline.length <= 24 && r.outline.length % 2 === 0 ? numbers(r.outline, r.outline.length) : null;
  if (!outline) return null;
  let house: DeckScene["house"] = null;
  const h = (r.house && typeof r.house === "object" ? r.house : null) as Record<string, unknown> | null;
  if (h) {
    if (!fin(h.heightFt) || !inside(h.heightFt, 1, 120) || !Array.isArray(h.blocks) || h.blocks.length > 4) return null;
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
    peakFt,
    boxes,
    footings,
    diagonal,
    polys,
    outline,
    house,
    colors: { frame: color(c.frame, "#9d8c62"), decking: color(c.decking, "#a58a5c"), fascia: color(c.fascia, "#a58a5c"), roofing: color(c.roofing, "#565250") },
    facts: typeof r.facts === "string" ? r.facts.slice(0, 200) : "",
  };
}
