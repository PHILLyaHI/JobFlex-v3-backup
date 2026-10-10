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

/** v2 (2026-10-10): `structure`, `floor`, `roof` and `photo` joined the design. A v1 design reads as a bare deck. */
export const DECK_DESIGN_VERSION = 2;

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

/* ------------------------------------------------------------------ */
/*  What stands on the deck (M2, 2026-10-10)                           */
/* ------------------------------------------------------------------ */

/**
 * What is being built: a bare deck; a deck with a roof over it (on the
 * house wall or a free-standing pavilion); a gazebo with its own roof shape,
 * standing on a deck, a slab or footings in the ground; a pergola of open
 * slats on any of the three.
 */
export type Structure = "deck" | "covered-deck" | "gazebo" | "pergola";
export const STRUCTURES: readonly Structure[] = ["deck", "covered-deck", "gazebo", "pergola"];
export const STRUCTURE_LABEL: Record<Structure, string> = { deck: "Deck", "covered-deck": "Covered deck", gazebo: "Gazebo", pergola: "Pergola" };

/** What a gazebo or a pergola stands on. A deck and a covered deck always stand on the deck. */
export type Floor = "deck" | "slab" | "ground";
export const FLOORS: readonly Floor[] = ["deck", "slab", "ground"];
export const FLOOR_LABEL: Record<Floor, string> = { deck: "On a deck", slab: "On a concrete slab", ground: "On footings in the ground" };

export type RoofKind = "shed" | "gable" | "hip" | "pyramid" | "double-tier" | "pergola";
export const ROOF_KINDS: readonly RoofKind[] = ["shed", "gable", "hip", "pyramid", "double-tier", "pergola"];
export const ROOF_KIND_LABEL: Record<RoofKind, string> = {
  shed: "Shed — one slope",
  gable: "Gable",
  hip: "Hip",
  pyramid: "Pyramid",
  "double-tier": "Double tier (pagoda)",
  pergola: "Open slats",
};
/** The roof's outline in plan: the deck's own rectangle, or its own figure. */
export type RoofPlanShape = "follows-deck" | "square" | "rect" | "hexagon" | "octagon";
export const ROOF_PLAN_SHAPES: readonly RoofPlanShape[] = ["follows-deck", "square", "rect", "hexagon", "octagon"];
export const ROOF_PLAN_LABEL: Record<RoofPlanShape, string> = { "follows-deck": "Follows the deck", square: "Square", rect: "Rectangle", hexagon: "Hexagon", octagon: "Octagon" };
/** On the house wall (a ledger carries the back of the roof) or free on its own posts. */
export type RoofAttach = "wall" | "free";
export type Roofing = "arch-shingle" | "3tab-shingle" | "designer-shingle" | "cedar-shake" | "metal-panel" | "standing-seam" | "none";
export const ROOFINGS: readonly Roofing[] = ["arch-shingle", "3tab-shingle", "designer-shingle", "cedar-shake", "metal-panel", "standing-seam", "none"];
export const ROOFING_LABEL: Record<Roofing, string> = {
  "arch-shingle": "Architectural shingles",
  "3tab-shingle": "3-tab shingles",
  "designer-shingle": "Designer shingles",
  "cedar-shake": "Cedar shakes",
  "metal-panel": "Metal panels, exposed fasteners",
  "standing-seam": "Standing-seam metal",
  none: "No roofing — open slats",
};
/** What the roofing sits on: sheathing, or purlins across the rafters (metal only). */
export type RoofDeck = "sheathing" | "purlins";
/**
 * What the rafters meet at the top: a ridge BEAM (the rafters bear on it and
 * the ceiling can stay open), a ridge BOARD with rafter ties (the ties take
 * the thrust), or none (hips meet at a king post or a steel ring). "auto"
 * lets the roof's shape decide.
 */
export type RidgeKind = "auto" | "beam" | "board" | "none";
export type CeilingKind = "none" | "tongue-groove" | "beadboard";
export const CEILING_LABEL: Record<CeilingKind, string> = { none: "Open — rafters showing", "tongue-groove": "Tongue-and-groove boards", beadboard: "Beadboard panels" };
export type FasciaFinish = "wood" | "pvc" | "aluminum-wrap";
export const FASCIA_FINISH_LABEL: Record<FasciaFinish, string> = { wood: "Painted wood 1x", pvc: "PVC trim board", "aluminum-wrap": "Aluminum wrap over wood" };
export type GutterKind = "none" | "k5" | "k6" | "half-round-alum" | "half-round-copper";
export const GUTTER_KINDS: readonly GutterKind[] = ["none", "k5", "k6", "half-round-alum", "half-round-copper"];
export const GUTTER_LABEL: Record<GutterKind, string> = {
  none: "No gutters",
  k5: "5-in. K-style aluminum",
  k6: "6-in. K-style aluminum",
  "half-round-alum": "Half-round aluminum",
  "half-round-copper": "Half-round copper",
};
export type RoofPostSize = "4x4" | "6x6" | "8x8";
export type RoofLoadChoice = "auto" | 20 | 30 | 50 | 70;
export type SlatSize = "2x2" | "2x4" | "2x6";

export interface RoofDesign {
  kind: RoofKind;
  attach: RoofAttach;
  plan: {
    shape: RoofPlanShape;
    /** A square or rectangle: along the house and out from it, ft. */
    widthFt: number;
    depthFt: number;
    /** A hexagon or octagon: across the flats, ft. */
    acrossFt: number;
    /** The roof's centre off the deck's centre, along the house, ft (a roof over part of a long deck). */
    offsetFt: number;
  };
  /** Rise per 12 in. of run. */
  pitch: number;
  /** Underside of the headers above the floor the posts stand on, inches. */
  eaveHeightIn: number;
  /** Eaves and rakes past the posts, inches. */
  overhangIn: number;
  load: RoofLoadChoice;
  post: RoofPostSize;
  rafter: JoistSize | "auto";
  rafterSpacingIn: SpacingIn;
  header: BeamSize | "auto";
  ridge: RidgeKind;
  roofing: Roofing;
  roofDeck: RoofDeck;
  ceiling: CeilingKind;
  cupola: boolean;
  fascia: { eave: boolean; rake: boolean; finish: FasciaFinish };
  soffit: boolean;
  gutters: { kind: GutterKind; guards: boolean };
  braces: boolean;
  /** A pergola's slats on top of its rafters. */
  slats: { size: SlatSize; spacingIn: number };
}

/** A photo of the back of the house, kept with the design so the client sees where the deck goes. */
export interface DeckPhoto {
  /** The stored file (private store, local or inline — lib/media/privateStore). */
  url: string;
  /** The picture's pixels. */
  w: number;
  h: number;
  /** Where the deck's elevation was placed on it: the ground line's left end and its width, as fractions of the picture. */
  placed: { x: number; y: number; w: number } | null;
}

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
  /** What stands on it (M2). A bare deck has `structure: "deck"`; its `roof` is kept so switching back and forth loses nothing. */
  structure: Structure;
  floor: Floor;
  roof: RoofDesign;
  photo: DeckPhoto | null;
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

export const ROOF_LIMITS = {
  planFt: { min: 6, max: 40 },
  acrossFt: { min: 8, max: 30 },
  offsetFt: { min: -30, max: 30 },
  pitch: { min: 2, max: 12 },
  eaveHeightIn: { min: 84, max: 144 },
  overhangIn: { min: 0, max: 36 },
  slatSpacingIn: { min: 3, max: 24 },
} as const;

/** The roof a structure starts with — a gable over a covered deck, a square pyramid gazebo, a pergola of 2x2 slats. */
export function defaultRoofDesign(structure: Structure = "covered-deck"): RoofDesign {
  const gazebo = structure === "gazebo";
  const pergola = structure === "pergola";
  return {
    kind: pergola ? "pergola" : gazebo ? "pyramid" : "gable",
    attach: gazebo || pergola ? "free" : "wall",
    plan: { shape: gazebo ? "square" : "follows-deck", widthFt: 12, depthFt: 12, acrossFt: 12, offsetFt: 0 },
    pitch: gazebo ? 6 : pergola ? 0 : 4,
    eaveHeightIn: 96,
    overhangIn: 12,
    load: "auto",
    post: "6x6",
    rafter: "auto",
    rafterSpacingIn: 16,
    header: "auto",
    ridge: "auto",
    roofing: pergola ? "none" : "arch-shingle",
    roofDeck: "sheathing",
    ceiling: "none",
    cupola: false,
    fascia: { eave: true, rake: true, finish: "wood" },
    soffit: false,
    gutters: { kind: structure === "covered-deck" ? "k5" : "none", guards: false },
    braces: true,
    slats: { size: "2x2", spacingIn: 12 },
  };
}

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
    structure: "deck",
    floor: "deck",
    roof: defaultRoofDesign("covered-deck"),
    photo: null,
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

  const structure = oneOf(r.structure, STRUCTURES, d.structure);
  // A deck and a covered deck stand on the deck; a gazebo or a pergola on whatever was chosen.
  const floor: Floor = structure === "deck" || structure === "covered-deck" ? "deck" : oneOf(r.floor, FLOORS, d.floor);
  const roof = normalizeRoof(r.roof, structure, floor, placement);
  const photo = normalizePhoto(r.photo);

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
    structure,
    floor,
    roof,
    photo,
  };
}

/**
 * The roof, brought inside its rails and made to agree with the structure:
 * a pergola's roof is slats; a gazebo has a roof shape of its own, never a
 * shed; a polygon is roofed as a pyramid; a roof can hang on the wall only
 * where the deck meets the house.
 */
export function normalizeRoof(raw: unknown, structure: Structure, floor: Floor, placement: Placement): RoofDesign {
  // A bare deck keeps a covered deck's roof in the drawer, so switching to one later starts from the usual.
  const d = defaultRoofDesign(structure === "deck" ? "covered-deck" : structure);
  const r = obj(raw);
  const pl = obj(r.plan);
  const fa = obj(r.fascia);
  const gu = obj(r.gutters);
  const sl = obj(r.slats);
  let kind = oneOf(r.kind, ROOF_KINDS, d.kind);
  if (structure === "pergola") kind = "pergola";
  else if (kind === "pergola") kind = d.kind;
  if (structure === "gazebo" && kind === "shed") kind = "hip";
  let shape = oneOf(pl.shape, ROOF_PLAN_SHAPES, d.plan.shape);
  if (floor !== "deck" && shape === "follows-deck") shape = "rect";
  if ((shape === "hexagon" || shape === "octagon") && kind !== "pyramid" && kind !== "double-tier" && kind !== "pergola") kind = "pyramid";
  if (kind === "pyramid" && shape === "rect") shape = "square";
  if (kind === "shed" && shape !== "follows-deck") shape = shape === "square" ? "square" : "rect";
  let attach = oneOf(r.attach, ["wall", "free"] as const, d.attach);
  // The wall carries a roof only where the deck meets it (or where a gazebo on its own floor is built against it).
  if (floor === "deck" && placement === "detached") attach = "free";
  if (shape === "hexagon" || shape === "octagon") attach = "free";
  if (kind === "pyramid" || kind === "double-tier") attach = "free";
  const widthFt = toInch(clamp(num(pl.widthFt, d.plan.widthFt), ROOF_LIMITS.planFt.min, ROOF_LIMITS.planFt.max));
  const depthFt = shape === "square" ? widthFt : toInch(clamp(num(pl.depthFt, d.plan.depthFt), ROOF_LIMITS.planFt.min, ROOF_LIMITS.planFt.max));
  const roofing = structure === "pergola" ? "none" : (oneOf(r.roofing, ROOFINGS, d.roofing) === "none" ? d.roofing : oneOf(r.roofing, ROOFINGS, d.roofing));
  const metal = roofing === "metal-panel" || roofing === "standing-seam";
  const rafterRaw = r.rafter === "auto" ? "auto" : oneOf(r.rafter, JOIST_SIZES, "auto" as JoistSize | "auto");
  const headerRaw = typeof r.header === "string" ? r.header : "auto";
  const header: BeamSize | "auto" = isSolidBeam(headerRaw) ? headerRaw : (BUILT_UP_CHOICES as readonly string[]).includes(headerRaw) ? (headerRaw as BuiltUpBeam) : "auto";
  const loadRaw = r.load === "auto" || r.load === undefined ? "auto" : num(r.load, 0);
  const load: RoofLoadChoice = loadRaw === "auto" ? "auto" : ([20, 30, 50, 70] as const).find((l) => l === loadRaw) ?? "auto";
  return {
    kind,
    attach,
    plan: {
      shape,
      widthFt,
      depthFt,
      acrossFt: toInch(clamp(num(pl.acrossFt, d.plan.acrossFt), ROOF_LIMITS.acrossFt.min, ROOF_LIMITS.acrossFt.max)),
      offsetFt: toInch(clamp(num(pl.offsetFt, 0), ROOF_LIMITS.offsetFt.min, ROOF_LIMITS.offsetFt.max)),
    },
    pitch: kind === "pergola" ? 0 : Math.round(clamp(num(r.pitch, d.pitch), ROOF_LIMITS.pitch.min, ROOF_LIMITS.pitch.max)),
    eaveHeightIn: Math.round(clamp(num(r.eaveHeightIn, d.eaveHeightIn), ROOF_LIMITS.eaveHeightIn.min, ROOF_LIMITS.eaveHeightIn.max)),
    overhangIn: Math.round(clamp(num(r.overhangIn, d.overhangIn), ROOF_LIMITS.overhangIn.min, ROOF_LIMITS.overhangIn.max)),
    load,
    post: oneOf(r.post, ["4x4", "6x6", "8x8"] as const, d.post),
    rafter: rafterRaw,
    rafterSpacingIn: oneOf(num(r.rafterSpacingIn, 0), SPACINGS, d.rafterSpacingIn) as SpacingIn,
    header,
    ridge: oneOf(r.ridge, ["auto", "beam", "board", "none"] as const, d.ridge),
    roofing,
    roofDeck: metal ? oneOf(r.roofDeck, ["sheathing", "purlins"] as const, d.roofDeck) : "sheathing",
    ceiling: kind === "pergola" ? "none" : oneOf(r.ceiling, ["none", "tongue-groove", "beadboard"] as const, d.ceiling),
    cupola: kind !== "pergola" && kind !== "shed" && r.cupola === true,
    fascia: {
      eave: kind === "pergola" ? false : typeof fa.eave === "boolean" ? fa.eave : d.fascia.eave,
      rake: kind === "pergola" ? false : typeof fa.rake === "boolean" ? fa.rake : d.fascia.rake,
      finish: oneOf(fa.finish, ["wood", "pvc", "aluminum-wrap"] as const, d.fascia.finish),
    },
    soffit: kind !== "pergola" && r.soffit === true,
    gutters: { kind: kind === "pergola" ? "none" : oneOf(gu.kind, GUTTER_KINDS, d.gutters.kind), guards: gu.guards === true },
    braces: typeof r.braces === "boolean" ? r.braces : d.braces,
    slats: { size: oneOf(sl.size, ["2x2", "2x4", "2x6"] as const, d.slats.size), spacingIn: Math.round(clamp(num(sl.spacingIn, d.slats.spacingIn), ROOF_LIMITS.slatSpacingIn.min, ROOF_LIMITS.slatSpacingIn.max)) },
  };
}

function normalizePhoto(raw: unknown): DeckPhoto | null {
  const r = obj(raw);
  if (typeof r.url !== "string" || !r.url || r.url.length > 2000) return null;
  const w = Math.round(clamp(num(r.w, 0), 0, 20000));
  const h = Math.round(clamp(num(r.h, 0), 0, 20000));
  if (w < 16 || h < 16) return null;
  const p = obj(r.placed);
  const placed = typeof p.x === "number" && typeof p.y === "number" && typeof p.w === "number" ? { x: clamp(num(p.x, 0.1), -0.5, 1.5), y: clamp(num(p.y, 0.9), 0, 1.5), w: clamp(num(p.w, 0.8), 0.05, 3) } : null;
  return { url: r.url, w, h, placed };
}

/** True when the design has a deck frame under it (a bare or covered deck, or a gazebo/pergola standing on a deck). */
export function hasDeck(design: DeckDesign): boolean {
  return design.structure === "deck" || design.structure === "covered-deck" || design.floor === "deck";
}
/** True when something stands on the posts: a roof or a pergola. */
export function hasRoof(design: DeckDesign): boolean {
  return design.structure !== "deck";
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
  if (!hasDeck(design)) {
    const p = design.roof.plan;
    if (p.shape === "hexagon" || p.shape === "octagon") return `${ft(p.acrossFt)} ${p.shape}`;
    return p.shape === "square" ? `${ft(p.widthFt)} square` : `${ft(p.widthFt)} × ${ft(p.depthFt)}`;
  }
  return s.kind === "rect" ? `${ft(s.widthFt)} × ${ft(s.depthFt)}` : `${ft(s.widthFt)} × ${ft(s.depthFt)} L-shaped`;
}

/** What is being built, as a title: "16 ft × 12 ft covered deck", "12 ft octagon gazebo". */
export function structureWords(design: DeckDesign): string {
  const what = design.structure === "deck" ? "deck" : design.structure === "covered-deck" ? "covered deck" : design.structure;
  return `${sizeWords(design)} ${what}`;
}
