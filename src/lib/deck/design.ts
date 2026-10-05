// A DECK AS THE CONTRACTOR DESCRIBES IT (2026-10-04) — pure.
//
// Everything the studio's steps collect, in one plain object: the shape, how
// it meets the house, how high it stands, what it is framed and decked with.
// The frame itself is NOT stored here — frame.ts works it out from this, the
// same way every time, so the 3D, the material list and the price are three
// readings of one design and can never disagree.
//
// Lengths the contractor types are feet (the outline) and inches (heights);
// the engine works in inches inside.
//
// `normalizeDeckDesign` reads anything claiming to be a design — a saved
// one, a half-typed one — and gives back one the engine can build: numbers
// inside their rails, a choice that the wall or the species rules out moved
// to the nearest one that stands. It never throws.

import { LOADS, POST_SIZES, SOILS, SOLID_BEAMS, SPACINGS, JOIST_SIZES, type BuiltUpBeam, type JoistSize, type LedgerFastener, type LoadPsf, type PostSize, type SoilPsf, type SolidBeam, type SpacingIn } from "./codeTables";
import { DECKING, FRAMING_SPECIES, RAIL_TYPES, WALL_TYPES, defaultDecking, defaultFramingSpecies, wallType, type FramingSpeciesId, type RailTypeId, type WallTypeId } from "./catalog";

export const DECK_DESIGN_VERSION = 1;

/** Which corner of the rectangle an L-shape is missing. "Back" is the house side. */
export type NotchCorner = "front-left" | "front-right" | "back-left" | "back-right";
export const NOTCH_CORNERS: readonly NotchCorner[] = ["front-left", "front-right", "back-left", "back-right"];

/**
 * The outline. `widthFt` runs along the house, `depthFt` out from it. An L
 * is that rectangle with one corner cut away: a FRONT notch makes a deck
 * with a deep part and a shallow part; a BACK notch is where the house
 * itself steps out into the deck (a bump-out or a bay).
 */
export type DeckShape =
  | { kind: "rect"; widthFt: number; depthFt: number }
  | { kind: "L"; widthFt: number; depthFt: number; notch: { corner: NotchCorner; widthFt: number; depthFt: number } };

/**
 * How the deck meets the house:
 *   attached — a ledger on the house carries one side;
 *   beside   — it touches the house but stands on its own posts;
 *   detached — it stands in the yard.
 */
export type Placement = "attached" | "beside" | "detached";
export const PLACEMENTS: readonly Placement[] = ["attached", "beside", "detached"];
export const PLACEMENT_LABEL: Record<Placement, string> = {
  attached: "On the house — ledger",
  beside: "Beside the house — on its own posts",
  detached: "Away from the house",
};

/** A dropped beam sits under the joists; a flush beam is in their plane and the joists hang on it. */
export type BeamStyle = "dropped" | "flush";
export type BeamKind = "solid" | "built-up";
export type BeamSize = SolidBeam | BuiltUpBeam;
/** The built-up beams the studio offers (a single 2x is not a beam anyone orders). */
export const BUILT_UP_CHOICES: readonly BuiltUpBeam[] = ["2-2x6", "2-2x8", "2-2x10", "2-2x12", "3-2x8", "3-2x10", "3-2x12"];
export const isSolidBeam = (b: string): b is SolidBeam => (SOLID_BEAMS as readonly string[]).includes(b);

export type FootingType = "poured" | "pier-block";

export interface DeckDesign {
  v: typeof DECK_DESIGN_VERSION;
  shape: DeckShape;
  placement: Placement;
  /** What the house is where the deck meets it. */
  wall: WallTypeId;
  /** The walking surface above the ground, inches. */
  heightIn: number;
  /** 40 psf, or the ground snow load where the building office names a bigger one. */
  loadPsf: LoadPsf;
  soilPsf: SoilPsf;
  /** Frost depth, inches (from the job's state; the contractor can correct it). */
  frostIn: number;
  framing: {
    species: FramingSpeciesId;
    joist: JoistSize | "auto";
    spacingIn: SpacingIn | "auto";
    beamStyle: BeamStyle | "auto";
    beamKind: BeamKind;
    beam: BeamSize | "auto";
    post: PostSize;
    /** How far the joists run past the outer beam, ft; "auto" picks what the table allows, up to 2 ft. */
    overhangFt: number | "auto";
    /** Doubled outside joists and a doubled rim — the owner's standard. */
    doubleRim: boolean;
    joistTape: boolean;
    /** "auto": over every dropped beam the joists run past, plus what the decking's maker requires. */
    blocking: "auto" | "mid-span";
    /** Knee braces at corner posts over 2 ft (AWC's guide). */
    braces: boolean;
  };
  ledger: {
    fastener: LedgerFastener;
    /** Two 1,500-lb hold-downs, or four 750-lb ones. */
    lateral: "two" | "four";
  };
  footing: {
    type: FootingType;
    /** How far the top of the concrete stands above the ground, inches. */
    aboveGradeIn: number;
    /** Dig a free-standing deck's footings to frost depth as well (the code only requires it of an attached one). */
    frostAlways: boolean;
  };
  decking: {
    product: string;
    /** Boards at 45° to the joists. */
    diagonal: boolean;
    fastening: "auto" | "screws" | "hidden";
    fascia: "auto" | "none" | "match";
    wastePct: number;
  };
  extras: {
    /** Railing as an allowance: a type and a length ("auto" = every open edge when a guard is required). */
    rail: RailTypeId;
    railFt: number | "auto";
    /** The shop's own price per foot for a custom rail, installed. */
    railCustomPerFt: number;
    /** Flights of stairs, priced per step until the stair builder lands. */
    stairFlights: number;
    stairWidthFt: number;
    /** Tear-out of an old deck, sq ft. */
    demoSqFt: number;
    /** Stainless connectors and fasteners (within 300 ft of salt water the code requires them). */
    stainless: boolean;
  };
}

/** The rails every number is held inside. */
export const DECK_LIMITS = {
  widthFt: { min: 4, max: 60 },
  depthFt: { min: 4, max: 40 },
  notchFt: { min: 2 },
  /** The least a leg of an L keeps after the notch, ft. */
  legFt: { min: 3 },
  heightIn: { min: 4, max: 360 },
  frostIn: { min: 0, max: 96 },
  overhangFt: { min: 0, max: 4 },
  aboveGradeIn: { min: 0, max: 12 },
  wastePct: { min: 0, max: 30 },
  railFt: { min: 0, max: 400 },
  stairFlights: { min: 0, max: 6 },
  stairWidthFt: { min: 3, max: 12 },
  demoSqFt: { min: 0, max: 4000 },
  railCustomPerFt: { min: 0, max: 1000 },
} as const;

/** A new deck for a shop in `state`: the owner's standards, the region's lumber. */
export function defaultDeckDesign(opts: { state?: string | null; frostIn?: number } = {}): DeckDesign {
  return {
    v: DECK_DESIGN_VERSION,
    shape: { kind: "rect", widthFt: 16, depthFt: 12 },
    placement: "attached",
    wall: "wood-rim",
    heightIn: 36,
    loadPsf: 40,
    soilPsf: 1500,
    frostIn: clamp(opts.frostIn ?? 24, DECK_LIMITS.frostIn.min, DECK_LIMITS.frostIn.max),
    framing: {
      species: defaultFramingSpecies(opts.state),
      joist: "auto",
      spacingIn: "auto",
      beamStyle: "auto",
      beamKind: "solid",
      beam: "auto",
      post: "6x6",
      overhangFt: "auto",
      doubleRim: true,
      joistTape: true,
      blocking: "auto",
      braces: true,
    },
    ledger: { fastener: "lag", lateral: "two" },
    footing: { type: "poured", aboveGradeIn: 3, frostAlways: false },
    decking: { product: defaultDecking(opts.state), diagonal: false, fastening: "auto", fascia: "auto", wastePct: 10 },
    extras: { rail: "none", railFt: "auto", railCustomPerFt: 0, stairFlights: 0, stairWidthFt: 4, demoSqFt: 0, stainless: false },
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : fallback);
const oneOf = <T extends string | number>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
/** To the nearest inch, in feet — a typed 12.3333 stays 12'-4". */
const toInch = (ft: number) => Math.round(ft * 12) / 12;

function normalizeShape(raw: unknown, fallback: DeckShape): DeckShape {
  const r = obj(raw);
  const widthFt = toInch(clamp(num(r.widthFt, fallback.widthFt), DECK_LIMITS.widthFt.min, DECK_LIMITS.widthFt.max));
  const depthFt = toInch(clamp(num(r.depthFt, fallback.depthFt), DECK_LIMITS.depthFt.min, DECK_LIMITS.depthFt.max));
  if (r.kind !== "L") return { kind: "rect", widthFt, depthFt };
  const n = obj(r.notch);
  const corner = oneOf(n.corner, NOTCH_CORNERS, "front-right");
  // Each leg keeps at least 3 ft; a rectangle too small for that stays a rectangle.
  const maxW = widthFt - DECK_LIMITS.legFt.min;
  const maxD = depthFt - DECK_LIMITS.legFt.min;
  if (maxW < DECK_LIMITS.notchFt.min || maxD < DECK_LIMITS.notchFt.min) return { kind: "rect", widthFt, depthFt };
  return {
    kind: "L",
    widthFt,
    depthFt,
    notch: {
      corner,
      widthFt: toInch(clamp(num(n.widthFt, widthFt / 2), DECK_LIMITS.notchFt.min, maxW)),
      depthFt: toInch(clamp(num(n.depthFt, depthFt / 2), DECK_LIMITS.notchFt.min, maxD)),
    },
  };
}

/**
 * Anything → a design the engine can build. A choice the wall rules out is
 * moved, not refused: a ledger on brick veneer becomes a deck beside the
 * house, a fastener with no table for this wall becomes the wall's first.
 */
export function normalizeDeckDesign(raw: unknown, opts: { state?: string | null; frostIn?: number } = {}): DeckDesign {
  const d = defaultDeckDesign(opts);
  const r = obj(raw);
  const f = obj(r.framing);
  const l = obj(r.ledger);
  const ft = obj(r.footing);
  const dk = obj(r.decking);
  const ex = obj(r.extras);

  const wall = oneOf(r.wall, WALL_TYPES.map((w) => w.id), d.wall);
  const w = wallType(wall);
  let placement = oneOf(r.placement, PLACEMENTS, d.placement);
  if (placement === "attached" && !w.ledger) placement = "beside";
  const fastener = oneOf(l.fastener, w.fasteners.length ? w.fasteners : (["lag"] as LedgerFastener[]), w.fasteners[0] ?? "lag");

  const beamKind = oneOf(f.beamKind, ["solid", "built-up"] as const, d.framing.beamKind);
  const beamRaw = typeof f.beam === "string" ? f.beam : "auto";
  const beam: BeamSize | "auto" = beamKind === "solid" ? (isSolidBeam(beamRaw) ? beamRaw : "auto") : (BUILT_UP_CHOICES as readonly string[]).includes(beamRaw) ? (beamRaw as BuiltUpBeam) : "auto";
  const overhangFt = f.overhangFt === "auto" || f.overhangFt === undefined ? "auto" : toInch(clamp(num(f.overhangFt, 0), DECK_LIMITS.overhangFt.min, DECK_LIMITS.overhangFt.max));
  const railFt = ex.railFt === "auto" || ex.railFt === undefined ? "auto" : Math.round(clamp(num(ex.railFt, 0), DECK_LIMITS.railFt.min, DECK_LIMITS.railFt.max) * 10) / 10;

  return {
    v: DECK_DESIGN_VERSION,
    shape: normalizeShape(r.shape, d.shape),
    placement,
    wall,
    heightIn: Math.round(clamp(num(r.heightIn, d.heightIn), DECK_LIMITS.heightIn.min, DECK_LIMITS.heightIn.max) * 4) / 4,
    loadPsf: oneOf(num(r.loadPsf, d.loadPsf), LOADS, d.loadPsf) as LoadPsf,
    soilPsf: oneOf(num(r.soilPsf, d.soilPsf), SOILS, d.soilPsf) as SoilPsf,
    frostIn: Math.round(clamp(num(r.frostIn, d.frostIn), DECK_LIMITS.frostIn.min, DECK_LIMITS.frostIn.max)),
    framing: {
      species: oneOf(f.species, FRAMING_SPECIES.map((s) => s.id), d.framing.species),
      joist: f.joist === "auto" ? "auto" : oneOf(f.joist, JOIST_SIZES, "auto" as JoistSize | "auto"),
      spacingIn: f.spacingIn === "auto" ? "auto" : (oneOf(num(f.spacingIn, 0), SPACINGS, "auto" as SpacingIn | "auto") as SpacingIn | "auto"),
      beamStyle: oneOf(f.beamStyle, ["auto", "dropped", "flush"] as const, d.framing.beamStyle),
      beamKind,
      beam,
      post: oneOf(f.post, POST_SIZES, d.framing.post),
      overhangFt,
      doubleRim: typeof f.doubleRim === "boolean" ? f.doubleRim : d.framing.doubleRim,
      joistTape: typeof f.joistTape === "boolean" ? f.joistTape : d.framing.joistTape,
      blocking: oneOf(f.blocking, ["auto", "mid-span"] as const, d.framing.blocking),
      braces: typeof f.braces === "boolean" ? f.braces : d.framing.braces,
    },
    ledger: { fastener, lateral: oneOf(l.lateral, ["two", "four"] as const, d.ledger.lateral) },
    footing: {
      type: oneOf(ft.type, ["poured", "pier-block"] as const, d.footing.type),
      aboveGradeIn: Math.round(clamp(num(ft.aboveGradeIn, d.footing.aboveGradeIn), DECK_LIMITS.aboveGradeIn.min, DECK_LIMITS.aboveGradeIn.max)),
      frostAlways: typeof ft.frostAlways === "boolean" ? ft.frostAlways : d.footing.frostAlways,
    },
    decking: {
      product: oneOf(dk.product, DECKING.map((p) => p.id), d.decking.product),
      diagonal: dk.diagonal === true,
      fastening: oneOf(dk.fastening, ["auto", "screws", "hidden"] as const, d.decking.fastening),
      fascia: oneOf(dk.fascia, ["auto", "none", "match"] as const, d.decking.fascia),
      wastePct: Math.round(clamp(num(dk.wastePct, d.decking.wastePct), DECK_LIMITS.wastePct.min, DECK_LIMITS.wastePct.max)),
    },
    extras: {
      rail: oneOf(ex.rail, RAIL_TYPES.map((t) => t.id), d.extras.rail),
      railFt,
      railCustomPerFt: Math.round(clamp(num(ex.railCustomPerFt, 0), DECK_LIMITS.railCustomPerFt.min, DECK_LIMITS.railCustomPerFt.max) * 100) / 100,
      stairFlights: Math.round(clamp(num(ex.stairFlights, 0), DECK_LIMITS.stairFlights.min, DECK_LIMITS.stairFlights.max)),
      stairWidthFt: Math.round(clamp(num(ex.stairWidthFt, d.extras.stairWidthFt), DECK_LIMITS.stairWidthFt.min, DECK_LIMITS.stairWidthFt.max) * 2) / 2,
      demoSqFt: Math.round(clamp(num(ex.demoSqFt, 0), DECK_LIMITS.demoSqFt.min, DECK_LIMITS.demoSqFt.max)),
      stainless: ex.stainless === true,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  The outline as rectangles                                          */
/* ------------------------------------------------------------------ */

/** One rectangle of the deck, inches. x runs along the house, y out from it. */
export interface Zone {
  id: "a" | "b";
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * An L is two rectangles side by side. Zone "a" is the full-depth part,
 * "b" the other leg: shallower for a front notch, starting farther out for a
 * back notch (where the house steps into the deck).
 */
export function shapeZones(shape: DeckShape): Zone[] {
  const W = Math.round(shape.widthFt * 12);
  const D = Math.round(shape.depthFt * 12);
  if (shape.kind === "rect") return [{ id: "a", x0: 0, x1: W, y0: 0, y1: D }];
  const nw = Math.round(shape.notch.widthFt * 12);
  const nd = Math.round(shape.notch.depthFt * 12);
  const left = shape.notch.corner.endsWith("left");
  const front = shape.notch.corner.startsWith("front");
  const a: Zone = left ? { id: "a", x0: nw, x1: W, y0: 0, y1: D } : { id: "a", x0: 0, x1: W - nw, y0: 0, y1: D };
  const bx = left ? { x0: 0, x1: nw } : { x0: W - nw, x1: W };
  const b: Zone = front ? { id: "b", ...bx, y0: 0, y1: D - nd } : { id: "b", ...bx, y0: nd, y1: D };
  return [a, b];
}

/** One straight side of the outline, inches. */
export interface DeckEdge {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Which way the side faces: "back" is the house side of the deck. */
  side: "front" | "back" | "left" | "right";
  /** It lies against the house (never for a detached deck). */
  house: boolean;
  lengthIn: number;
}

/** The outline's sides. Collinear sides of two zones are one side. */
export function shapeEdges(shape: DeckShape, placement: Placement): DeckEdge[] {
  const zones = shapeZones(shape);
  const W = Math.round(shape.widthFt * 12);
  const D = Math.round(shape.depthFt * 12);
  const againstHouse = placement !== "detached";
  const edge = (x0: number, y0: number, x1: number, y1: number, side: DeckEdge["side"], house: boolean): DeckEdge => ({ x0, y0, x1, y1, side, house: house && againstHouse, lengthIn: Math.abs(x1 - x0) + Math.abs(y1 - y0) });
  if (shape.kind === "rect") {
    return [edge(0, 0, W, 0, "back", true), edge(W, 0, W, D, "right", false), edge(0, D, W, D, "front", false), edge(0, 0, 0, D, "left", false)];
  }
  const [a, b] = zones;
  const left = shape.notch.corner.endsWith("left");
  const front = shape.notch.corner.startsWith("front");
  const xb = left ? b.x1 : b.x0; // the line the two legs share
  const out: DeckEdge[] = [];
  if (front) {
    out.push(edge(0, 0, W, 0, "back", true));
    out.push(edge(a.x0, D, a.x1, D, "front", false));
    out.push(edge(b.x0, b.y1, b.x1, b.y1, "front", false));
    // The step between the two fronts.
    out.push(edge(xb, b.y1, xb, D, left ? "left" : "right", false));
    out.push(edge(0, 0, 0, left ? b.y1 : D, "left", false));
    out.push(edge(W, 0, W, left ? D : b.y1, "right", false));
  } else {
    // The house steps into the deck: its two faces there are house sides.
    out.push(edge(a.x0, 0, a.x1, 0, "back", true));
    out.push(edge(b.x0, b.y0, b.x1, b.y0, "back", true));
    out.push(edge(xb, 0, xb, b.y0, left ? "left" : "right", true));
    out.push(edge(0, D, W, D, "front", false));
    out.push(edge(0, left ? b.y0 : 0, 0, D, "left", false));
    out.push(edge(W, left ? 0 : b.y0, W, D, "right", false));
  }
  return out;
}

/** The outline as a ring of points, inches, for drawing. */
export function shapeOutline(shape: DeckShape): Array<{ x: number; y: number }> {
  const W = Math.round(shape.widthFt * 12);
  const D = Math.round(shape.depthFt * 12);
  if (shape.kind === "rect") return [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D }, { x: 0, y: D }];
  const nw = Math.round(shape.notch.widthFt * 12);
  const nd = Math.round(shape.notch.depthFt * 12);
  switch (shape.notch.corner) {
    case "front-right":
      return [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D - nd }, { x: W - nw, y: D - nd }, { x: W - nw, y: D }, { x: 0, y: D }];
    case "front-left":
      return [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D }, { x: nw, y: D }, { x: nw, y: D - nd }, { x: 0, y: D - nd }];
    case "back-right":
      return [{ x: 0, y: 0 }, { x: W - nw, y: 0 }, { x: W - nw, y: nd }, { x: W, y: nd }, { x: W, y: D }, { x: 0, y: D }];
    default:
      return [{ x: nw, y: 0 }, { x: W, y: 0 }, { x: W, y: D }, { x: 0, y: D }, { x: 0, y: nd }, { x: nw, y: nd }];
  }
}

export function shapeAreaSqFt(shape: DeckShape): number {
  return shapeZones(shape).reduce((a, z) => a + (z.x1 - z.x0) * (z.y1 - z.y0), 0) / 144;
}

/** The size as a contractor says it: "16 ft × 12 ft", inches kept when there are any. */
export function sizeWords(design: DeckDesign): string {
  const ft = (n: number) => {
    const inches = Math.round(n * 12);
    return inches % 12 === 0 ? `${inches / 12} ft` : `${Math.floor(inches / 12)}'-${inches % 12}"`;
  };
  const s = design.shape;
  return s.kind === "rect" ? `${ft(s.widthFt)} × ${ft(s.depthFt)}` : `${ft(s.widthFt)} × ${ft(s.depthFt)} L-shaped`;
}
