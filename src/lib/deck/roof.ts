// THE ROOF OVER THE DECK, WORKED OUT (Deck Studio M2, 2026-10-10) — pure.
//
// Owner: "covered deck, attached or detached; a gazebo on the ground, a slab
// or a deck; posts, rafters, shingles or metal; beams around the posts and
// rafters on top; a beam on the ridge or rafters tied; all the materials
// recalculated when the size changes." One design (design.ts `roof`) goes
// in; out comes every member of the roof with its size, its length and where
// it sits in space — posts, headers, the ledger on the house, rafters, jacks,
// hips, ridge, king posts, ties, slats, braces, fascia, gutters — plus the
// roof planes (sheathing, roofing, ceiling, soffit) as polygons. The 3D
// draws these, the material list counts them, the checks read their spans.
//
// HOW IT IS FRAMED:
//   · Posts stand at the corners of the roof's outline (the "ring"), more
//     along a side when its header cannot span it. On a deck the posts run
//     from their own footings up through the deck (frame.ts takes them as
//     extra posts); on a slab they sit on anchored bases; on the ground on
//     footings.
//   · Headers (beams) run post to post around the ring; the rafters bear on
//     top of them. A header is sized from the code's DECK beam tables at the
//     load a roof puts on it: the strip of roof it carries, at the roof's
//     live-or-snow plus dead load, turned into the deck table's "joist span"
//     (two feet of 50 psf deck for each foot of roof strip at that psf). A
//     gable-end header also carries the ridge beam's king post, read as the
//     uniform load with the same bending moment (2P/L).
//   · Rafters are read on the IRC rafter tables (roofTables.ts) by their
//     horizontal span, header to ridge or header to ledger.
//   · The ridge: a BEAM the rafters bear on (open ceiling; the beam spans
//     king posts over the gable-end headers, or the wall and one king post),
//     a BOARD with rafter ties every 4 ft, or NONE — a hip or a pyramid
//     carries itself to the corners along its hips, which are one size
//     deeper than the commons (R802.3); a polygon's hips meet at a steel
//     ring.
//   · A shed or a hip on the house wall hangs its upper edge on a ledger of
//     2x stock one size deeper than the rafters, two structural screws
//     every 16 in.
//
// Every face of the roof is one shape in plan: an eave line, a run inward to
// its top (ridge, apex, wall or the cap of a lower tier), and a side at each
// end that is a hip (at the corner's half-angle), a rake (square to the
// eave) or the house wall. One routine lays the rafters on a face; the
// kinds of roof differ only in which faces they are made of.
//
// Coordinates follow frame.ts: inches, x along the house, y out from it, z
// up from the ground. A member has an axis in plan (`yaw`) and a rise along
// it (`tilt`); its box is `sx` long along that axis, `sy` wide, `sz` deep.

import { POST_ACTUAL_IN, THICK_2X_IN, DRESSED_DEPTH_IN, JOIST_SIZES, SOLID_BEAMS, builtUpBeamMaxSpanIn, solidBeamMaxSpanIn, solidBeamTabulated, joistDepthIn, postMaxHeightIn, type JoistSize, type PostSize, type SpeciesGroup } from "./codeTables";
import { CEILING_FACTOR, ROOF_DEAD_PSF, RW_FACTOR, rafterMaxSpanIn, roofLoadFor, type RafterGroup, type RoofLoad } from "./roofTables";
import { beamSpec, footingFor, type BeamSpec, type Footing } from "./frame";
import { BUILT_UP_CHOICES, isSolidBeam, type BeamSize, type DeckDesign, type RoofDesign, type RoofKind, type Zone } from "./design";
import type { FramingSpecies } from "./catalog";
import { deckRate, lumberKey, type DeckRateBook } from "./rates";
import type { MarketSnapshot } from "../fence/market";

/* ------------------------------------------------------------------ */
/*  Constants a framer would recognise                                 */
/* ------------------------------------------------------------------ */

/** A rafter's heel over the header: how much of its depth stands above the bearing (a third is cut away for the seat). */
const HEEL_SHARE = 0.65;
/** A roof post stands this far in from the deck's edge, centre to edge, inches (its face just inside the rim). */
const POST_INSET_IN = 4.5;
/** Rafter ties on a ridge board, inches on centre (R802.5.2 allows 4 ft). */
const TIE_SPACING_IN = 48;
/** A roof ledger: two structural screws per 16 in. of wall (one per stud, two rows). */
const LEDGER_SCREW_SPACING_IN = 16;
/** A gutter run gets another downspout every this many feet. */
const DOWNSPOUT_EVERY_FT = 35;
/** Gutter hangers, inches on centre: 24, or 18 under snow. */
const HANGER_SPACING_IN = { plain: 24, snow: 18 };
/** The lower tier of a double-tier roof runs this share of the way to the peak before the band. */
const TIER_SHARE = 0.55;
/** The band between the two tiers, inches. */
const TIER_BAND_IN = 24;
/** Knee brace legs, inches. */
const BRACE_LEG_IN = 24;
/** The longest stick a yard stocks, inches. */
const STOCK_MAX_IN = 240;
/** A metal panel covers 36 in. net. */
const METAL_PANEL_COVER_IN = 36;
/** A cupola's footprint, inches, and the height of its box. */
const CUPOLA_IN = 30;
const CUPOLA_BOX_IN = 24;
/** The deck beam table's first column, ft, and how far a lighter load may stretch its span. */
const TABLE_FIRST_COLUMN_FT = 6;
const LIGHT_LOAD_STRETCH_MAX = 1.5;
/** A slab runs this far past the posts on every side, inches. */
const SLAB_APRON_IN = 12;
const SLAB_THICK_IN = 4;
/** The top of a slab above the ground, inches. */
const SLAB_TOP_IN = 4;

/* ------------------------------------------------------------------ */
/*  What comes out                                                     */
/* ------------------------------------------------------------------ */

export type RoofRole =
  | "roof-post"
  | "header"
  | "roof-ledger"
  | "rafter"
  | "jack"
  | "fly"
  | "hip"
  | "ridge"
  | "king"
  | "tie"
  | "purlin"
  | "slat"
  | "roof-brace"
  | "ring"
  | "tier-post"
  | "subfascia"
  | "fascia-eave"
  | "fascia-rake"
  | "gutter"
  | "downspout"
  | "cupola";

/** One member of the roof, inches. `yaw` is the direction of its axis in plan (radians, from +x toward +y); `tilt` its rise along that axis. */
export interface RoofMember {
  role: RoofRole;
  nominal: string;
  lengthIn: number;
  cx: number;
  cy: number;
  cz: number;
  /** Along the axis, across, and deep. */
  sx: number;
  sy: number;
  sz: number;
  yaw: number;
  tilt: number;
  /** The member's ends in plan, for the framing plan. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Which face it belongs to. */
  of?: string;
  ground?: boolean;
}

export type PlaneKind = "sheathing" | "roofing" | "ceiling" | "soffit" | "slab";
/** A flat polygon in space: [x, y, z, x, y, z, …], inches. */
export interface RoofPlane {
  kind: PlaneKind;
  ring: number[];
  of?: string;
}

export interface RoofPost {
  id: string;
  x: number;
  y: number;
  size: PostSize;
  /** Base of the post and the header's underside, inches above the ground. */
  bottomIn: number;
  topIn: number;
  heightIn: number;
  /** What it brings down, lb, and that weight as deck area at the deck's load. */
  loadLb: number;
  tributarySqFt: number;
  /** The post table's limit for a post carrying that at 40 psf (0 = beyond). */
  maxHeightIn: number;
  corner: boolean;
  /** How it meets the floor. */
  bearing: "deck" | "slab" | "ground";
  footing: Footing | null;
  /** Longer than stock: spliced at the deck. */
  spliced: boolean;
}

export interface RoofHeader {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  lengthIn: number;
  spec: BeamSpec;
  /** Post centres along it, as distances from its start, and the longest stretch between them. */
  postAt: number[];
  spanIn: number;
  /** The deck table it was read on: the equivalent joist span, ft, and the longest span it allows (0 = beyond). */
  eqJoistSpanFt: number;
  maxSpanIn: number;
  /** It also carries a king post. */
  kingPost: boolean;
  /** Its ends are on the wall (no post there). */
  wallEnd: boolean;
}

export interface RoofFace {
  id: string;
  /** Eave corners in plan (outer), the unit along the eave and the unit inward. */
  ax: number;
  ay: number;
  bx: number;
  by: number;
  ux: number;
  uy: number;
  nx: number;
  ny: number;
  /** Eave length, the horizontal run from the eave line to the top, and the top the rafters reach. */
  lengthIn: number;
  runIn: number;
  vTopIn: number;
  top: "ridge" | "apex" | "wall" | "cap" | "header";
  sideA: "hip" | "rake" | "wall";
  sideB: "hip" | "rake" | "wall";
  betaA: number;
  betaB: number;
  /** Where the header's line crosses the face (v), and where it starts and ends along the eave (u). */
  ovhIn: number;
  ringU0: number;
  ringU1: number;
  /** The face's top corners in plan. */
  tax: number;
  tay: number;
  tbx: number;
  tby: number;
  /** Area of the roof surface, sq ft. */
  areaSqFt: number;
  /** Lineal feet by edge kind. */
  eaveFt: number;
  rakeFt: number;
  wallFt: number;
  /** The tier it belongs to. */
  tier: 1 | 2;
}

export interface GutterPlan {
  kind: Exclude<RoofDesign["gutters"]["kind"], "none">;
  lf: number;
  runs: number;
  closed: boolean;
  corners: number;
  endCaps: number;
  downspouts: number;
  downspoutFt: number;
  downspoutSize: "2x3" | "3x4";
  hangers: number;
  elbows: number;
  guardsLf: number;
}

export interface RoofFrame {
  roof: RoofDesign;
  /** The kind as framed (a hip over a square is a pyramid; an attached hip too narrow for its hips is framed as a gable). */
  kind: RoofKind;
  kindNote: string | null;
  attach: RoofDesign["attach"];
  floor: DeckDesign["floor"];
  species: FramingSpecies;
  group: SpeciesGroup;
  rafterGroup: RafterGroup | "RW";
  /** Loads, psf. */
  roofLoad: RoofLoad;
  deadPsf: number;
  totalPsf: number;
  /** The roof's outline in plan: the post ring and the eave line. */
  ring: Array<{ x: number; y: number }>;
  eaveRing: Array<{ x: number; y: number }>;
  centreX: number;
  centreY: number;
  /** Bounding sizes of the eave outline, inches, and the plan areas, sq ft. */
  widthIn: number;
  depthIn: number;
  ringAreaSqFt: number;
  footprintSqFt: number;
  /** Levels, inches above the ground. */
  floorIn: number;
  headerBottomIn: number;
  headerTopIn: number;
  peakIn: number;
  slope: number;
  pitchAngle: number;
  faces: RoofFace[];
  posts: RoofPost[];
  headers: RoofHeader[];
  ledger: { lengthIn: number; nominal: string; fasteners: number; zIn: number } | null;
  rafters: {
    size: JoistSize;
    spacingIn: number;
    count: number;
    commons: number;
    jacks: number;
    flies: number;
    longestIn: number;
    /** The horizontal span of a common, header to ridge or ledger, and the table's limit. */
    spanIn: number;
    maxSpanIn: number;
    estimated: boolean;
  };
  ridge: { kind: "beam" | "board" | "none"; nominal: string; lengthIn: number; spec: BeamSpec | null; spanIn: number; maxSpanIn: number; eqJoistSpanFt: number; /** "auto" wanted a beam and the table had none this long. */ fellBack: boolean } | null;
  hips: { count: number; nominal: string; totalIn: number };
  kingPosts: number;
  ties: number;
  slats: { count: number; nominal: string; totalIn: number } | null;
  members: RoofMember[];
  planes: RoofPlane[];
  /** Lineal feet of each edge. */
  eaveFt: number;
  rakeFt: number;
  wallFt: number;
  ridgeFt: number;
  hipFt: number;
  roofAreaSqFt: number;
  /** Squares to buy, waste included, and the sheets of sheathing. */
  wasteFactor: number;
  squares: number;
  sheets: number;
  metalPanels: Array<{ lengthFt: number; count: number }>;
  ceilingSqFt: number;
  soffitSqFt: number;
  gutters: GutterPlan | null;
  slab: { sqFt: number; cuYd: number } | null;
  hardware: { hurricaneTies: number; rafterHangers: number; postBases: number; postCaps: number; slabAnchors: number; braces: number; ledgerScrews: number; ringPlate: number; kingBrackets: number; wallHangers: number };
  flags: {
    rafterBeyondTable: boolean;
    headerBeyondTable: string[];
    ridgeBeyondTable: boolean;
    postBeyondTable: boolean;
    speciesEstimated: boolean;
    tooWideForHip: boolean;
    postSpliced: boolean;
  };
}

export interface RoofBuildOptions {
  rates?: DeckRateBook;
  market?: MarketSnapshot;
}

/** What the roof needs to know about the deck it stands on: its rectangles and where its footings top out. */
export interface DeckUnder {
  zones: Zone[];
  footingTopIn: number;
}

/* ------------------------------------------------------------------ */
/*  Small geometry                                                     */
/* ------------------------------------------------------------------ */

type V2 = { x: number; y: number };
const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: V2) => Math.hypot(v.x, v.y);
const unit = (v: V2): V2 => {
  const l = len(v) || 1;
  return { x: v.x / l, y: v.y / l };
};
const cot = (b: number) => (Math.abs(b - Math.PI / 2) < 1e-9 ? 0 : 1 / Math.tan(b));
const ringArea = (pts: readonly V2[]) => Math.abs(pts.reduce((a, p, i) => a + p.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * p.y, 0)) / 2;
const centroid = (pts: readonly V2[]): V2 => ({ x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length });

/** The species row the rafter tables are read on. */
export function rafterGroupFor(species: FramingSpecies): RafterGroup | "RW" {
  switch (species.id) {
    case "southern-pine":
      return "SP";
    case "douglas-fir":
      return "DF";
    case "hem-fir":
      return "HF";
    case "spf":
      return "SPF";
    default:
      return "RW";
  }
}

/** One size deeper, for hips, the ridge board and the ledger (a 2x12 stays a 2x12). */
export function oneDeeper(size: JoistSize): JoistSize {
  const i = JOIST_SIZES.indexOf(size);
  return JOIST_SIZES[Math.min(JOIST_SIZES.length - 1, i + 1)];
}

const depthOf = (nominal: string) => DRESSED_DEPTH_IN[Number(nominal.split("x")[1])] ?? 5.5;

/** The roof's outline as the contractor set it, in the deck's coordinates (or its own when there is no deck). */
export function roofRing(design: DeckDesign, deck: DeckUnder | null): { pts: V2[]; regular: boolean; apothemIn: number } {
  const r = design.roof;
  const p = r.plan;
  const wall = r.attach === "wall";
  if (p.shape === "hexagon" || p.shape === "octagon") {
    const n = p.shape === "hexagon" ? 6 : 8;
    const across = p.acrossFt * 12;
    const a = across / 2;
    const R = a / Math.cos(Math.PI / n);
    const c: V2 = deck ? { x: Math.max(...deck.zones.map((z) => z.x1)) / 2 + p.offsetFt * 12, y: Math.max(...deck.zones.map((z) => z.y1)) / 2 } : { x: R, y: n === 6 ? a : a };
    const phi0 = -Math.PI / 2 - Math.PI / n;
    const pts: V2[] = [];
    for (let k = 0; k < n; k++) pts.push({ x: c.x + R * Math.cos(phi0 + (2 * Math.PI * k) / n), y: c.y + R * Math.sin(phi0 + (2 * Math.PI * k) / n) });
    return { pts, regular: true, apothemIn: a };
  }
  let x0: number;
  let x1: number;
  let y0: number;
  let y1: number;
  if (p.shape === "follows-deck" && deck) {
    // The full-depth leg of the deck, posts just inside its edges; on the wall the back posts give way to the ledger.
    const z = deck.zones[0];
    x0 = z.x0 + POST_INSET_IN;
    x1 = z.x1 - POST_INSET_IN;
    y0 = wall ? 0 : z.y0 + POST_INSET_IN;
    y1 = z.y1 - POST_INSET_IN;
  } else {
    const W = p.widthFt * 12;
    const D = p.depthFt * 12;
    if (deck) {
      const zs = deck.zones;
      const dw = Math.max(...zs.map((z) => z.x1));
      const dd = Math.max(...zs.map((z) => z.y1));
      const cx = dw / 2 + p.offsetFt * 12;
      x0 = cx - W / 2;
      x1 = cx + W / 2;
      if (wall) {
        y0 = 0;
        y1 = Math.min(D, dd - POST_INSET_IN);
      } else {
        const cy = dd / 2;
        y0 = Math.max(POST_INSET_IN, cy - D / 2);
        y1 = Math.min(dd - POST_INSET_IN, cy + D / 2);
      }
      // Posts stay on the deck.
      x0 = Math.max(POST_INSET_IN, x0);
      x1 = Math.min(dw - POST_INSET_IN, x1);
    } else {
      x0 = 0;
      x1 = W;
      y0 = 0;
      y1 = D;
    }
  }
  if (x1 - x0 < 48) x1 = x0 + 48;
  if (y1 - y0 < 48) y1 = y0 + 48;
  return { pts: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], regular: false, apothemIn: Math.min(x1 - x0, y1 - y0) / 2 };
}

/* ------------------------------------------------------------------ */
/*  The build                                                          */
/* ------------------------------------------------------------------ */

interface FaceSpec {
  id: string;
  A: V2;
  B: V2;
  /** Inward unit (the slope goes up along it). */
  n: V2;
  runIn: number;
  vTopIn: number;
  top: RoofFace["top"];
  sideA: RoofFace["sideA"];
  sideB: RoofFace["sideB"];
  betaA: number;
  betaB: number;
  ovhIn: number;
  /** Where the header is, along the eave, from A. */
  ringU0: number;
  ringU1: number;
  tier: 1 | 2;
}

export function buildRoofFrame(design: DeckDesign, species: FramingSpecies, group: SpeciesGroup, deck: DeckUnder | null, opts: RoofBuildOptions = {}): RoofFrame {
  const r = design.roof;
  const ovh = r.overhangIn;
  const pergola = r.kind === "pergola";
  const slope = pergola ? 0 : r.pitch / 12;
  const theta = Math.atan(slope);
  const cosT = Math.cos(theta);
  const rafterGroup = rafterGroupFor(species);
  const price = (key: string) => deckRate(key, opts.rates, opts.market).price;

  // Loads.
  const roofLoad: RoofLoad = r.load === "auto" ? roofLoadFor(design.loadPsf) : r.load;
  const metal = r.roofing === "metal-panel" || r.roofing === "standing-seam";
  const deadPsf = (pergola ? ROOF_DEAD_PSF.open : metal ? ROOF_DEAD_PSF.metal : r.roofing === "cedar-shake" ? ROOF_DEAD_PSF.shake : ROOF_DEAD_PSF.shingle) + (r.ceiling !== "none" ? ROOF_DEAD_PSF.ceiling : 0);
  const livePsf = pergola ? 10 : roofLoad;
  const totalPsf = livePsf + deadPsf;

  // The ring and the floor.
  const { pts: ring, regular, apothemIn } = roofRing(design, deck);
  const n = ring.length;
  const c = centroid(ring);
  const wall = r.attach === "wall" && !regular;
  const floorIn = design.floor === "deck" ? design.heightIn : design.floor === "slab" ? SLAB_TOP_IN : design.footing.aboveGradeIn;
  const headerBottomIn = floorIn + r.eaveHeightIn;

  // Rafters: the size that spans, at the spacing asked.
  const spacing = r.rafterSpacingIn;
  const ceilingOn = r.ceiling !== "none";

  // Which faces, by kind.
  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const W = x1 - x0;
  const D = y1 - y0;
  let kind: RoofKind = r.kind;
  let kindNote: string | null = null;
  let tooWideForHip = false;
  if (!regular && (kind === "pyramid" || (kind === "hip" && Math.abs(W - D) < 0.5))) kind = "pyramid";
  if (regular && kind === "hip") kind = "pyramid";
  if (kind === "hip" && wall && W < 2 * (D + ovh) + 12) {
    kind = "gable";
    tooWideForHip = true;
    kindNote = "An attached hip needs the cover at least twice as wide along the house as it comes out from it; this one is framed as a gable.";
  }
  if (kind === "pyramid" && !regular && Math.abs(W - D) > 0.5) {
    kind = "hip";
  }

  const eaveX0 = x0 - ovh;
  const eaveX1 = x1 + ovh;
  const eaveY0 = wall ? y0 : y0 - ovh;
  const eaveY1 = y1 + ovh;
  const halfPi = Math.PI / 2;
  const faceSpecs: FaceSpec[] = [];
  let ridgeFrom: V2 | null = null;
  let ridgeTo: V2 | null = null;
  let ridgeSpanIn = 0;
  let ridgeSupports: "king-king" | "wall-king" | "none" = "none";
  let eaveRing: V2[] = [];
  let apex: V2 | null = null;
  /** The second tier of a double-tier roof. */
  let tier2: { ring: V2[]; apothemIn: number; ovhIn: number; baseTopIn: number } | null = null;

  const rectFace = (id: string, A: V2, B: V2, nrm: V2, runIn: number, top: RoofFace["top"], sideA: RoofFace["sideA"], sideB: RoofFace["sideB"], ringU0: number, ringU1: number, ovhIn = ovh, vTopIn = runIn, tier: 1 | 2 = 1): FaceSpec => ({
    id,
    A,
    B,
    n: nrm,
    runIn,
    vTopIn,
    top,
    sideA,
    sideB,
    betaA: sideA === "hip" ? Math.PI / 4 : halfPi,
    betaB: sideB === "hip" ? Math.PI / 4 : halfPi,
    ovhIn,
    ringU0,
    ringU1,
    tier,
  });

  if (pergola) {
    eaveRing = [{ x: eaveX0, y: eaveY0 }, { x: eaveX1, y: eaveY0 }, { x: eaveX1, y: eaveY1 }, { x: eaveX0, y: eaveY1 }];
  } else if (kind === "shed") {
    // One slope from the front eave up to the wall (or to a taller back header).
    const runIn = eaveY1 - eaveY0;
    faceSpecs.push(rectFace("s", { x: eaveX0, y: eaveY1 }, { x: eaveX1, y: eaveY1 }, { x: 0, y: -1 }, runIn, wall ? "wall" : "header", "rake", "rake", ovh, eaveX1 - eaveX0 - ovh));
    eaveRing = [{ x: eaveX0, y: eaveY0 }, { x: eaveX1, y: eaveY0 }, { x: eaveX1, y: eaveY1 }, { x: eaveX0, y: eaveY1 }];
  } else if (kind === "gable") {
    const alongY = wall || D > W;
    if (alongY) {
      // Ridge out from the house (or along the deeper side): the eaves are the left and right sides.
      const runIn = (eaveX1 - eaveX0) / 2;
      const Lu = eaveY1 - eaveY0;
      faceSpecs.push(rectFace("gl", { x: eaveX0, y: eaveY0 }, { x: eaveX0, y: eaveY1 }, { x: 1, y: 0 }, runIn, "ridge", wall ? "wall" : "rake", "rake", wall ? 0 : ovh, Lu - ovh));
      faceSpecs.push(rectFace("gr", { x: eaveX1, y: eaveY1 }, { x: eaveX1, y: eaveY0 }, { x: -1, y: 0 }, runIn, "ridge", "rake", wall ? "wall" : "rake", ovh, wall ? Lu : Lu - ovh));
      const cx = (eaveX0 + eaveX1) / 2;
      ridgeFrom = { x: cx, y: eaveY0 };
      ridgeTo = { x: cx, y: eaveY1 };
      ridgeSpanIn = wall ? y1 - y0 : y1 - y0;
      ridgeSupports = wall ? "wall-king" : "king-king";
    } else {
      const runIn = (eaveY1 - eaveY0) / 2;
      const Lu = eaveX1 - eaveX0;
      faceSpecs.push(rectFace("gb", { x: eaveX1, y: eaveY0 }, { x: eaveX0, y: eaveY0 }, { x: 0, y: 1 }, runIn, "ridge", "rake", "rake", ovh, Lu - ovh));
      faceSpecs.push(rectFace("gf", { x: eaveX0, y: eaveY1 }, { x: eaveX1, y: eaveY1 }, { x: 0, y: -1 }, runIn, "ridge", "rake", "rake", ovh, Lu - ovh));
      const cy = (eaveY0 + eaveY1) / 2;
      ridgeFrom = { x: eaveX0, y: cy };
      ridgeTo = { x: eaveX1, y: cy };
      ridgeSpanIn = x1 - x0;
      ridgeSupports = "king-king";
    }
    eaveRing = [{ x: eaveX0, y: eaveY0 }, { x: eaveX1, y: eaveY0 }, { x: eaveX1, y: eaveY1 }, { x: eaveX0, y: eaveY1 }];
  } else if (kind === "hip" && wall) {
    const runIn = eaveY1 - eaveY0;
    faceSpecs.push(rectFace("hf", { x: eaveX0, y: eaveY1 }, { x: eaveX1, y: eaveY1 }, { x: 0, y: -1 }, runIn, "wall", "hip", "hip", ovh, eaveX1 - eaveX0 - ovh));
    faceSpecs.push(rectFace("hl", { x: eaveX0, y: eaveY0 }, { x: eaveX0, y: eaveY1 }, { x: 1, y: 0 }, runIn, "wall", "wall", "hip", 0, eaveY1 - eaveY0 - ovh));
    faceSpecs.push(rectFace("hr", { x: eaveX1, y: eaveY1 }, { x: eaveX1, y: eaveY0 }, { x: -1, y: 0 }, runIn, "wall", "hip", "wall", ovh, eaveY1 - eaveY0));
    ridgeFrom = { x: eaveX0 + runIn, y: eaveY0 };
    ridgeTo = { x: eaveX1 - runIn, y: eaveY0 };
    eaveRing = [{ x: eaveX0, y: eaveY0 }, { x: eaveX1, y: eaveY0 }, { x: eaveX1, y: eaveY1 }, { x: eaveX0, y: eaveY1 }];
  } else if (kind === "hip") {
    const We = eaveX1 - eaveX0;
    const De = eaveY1 - eaveY0;
    const runIn = Math.min(We, De) / 2;
    faceSpecs.push(rectFace("hb", { x: eaveX1, y: eaveY0 }, { x: eaveX0, y: eaveY0 }, { x: 0, y: 1 }, runIn, We > De ? "ridge" : "apex", "hip", "hip", ovh, We - ovh));
    faceSpecs.push(rectFace("hr", { x: eaveX1, y: eaveY1 }, { x: eaveX1, y: eaveY0 }, { x: -1, y: 0 }, runIn, De > We ? "ridge" : "apex", "hip", "hip", ovh, De - ovh));
    faceSpecs.push(rectFace("hf", { x: eaveX0, y: eaveY1 }, { x: eaveX1, y: eaveY1 }, { x: 0, y: -1 }, runIn, We > De ? "ridge" : "apex", "hip", "hip", ovh, We - ovh));
    faceSpecs.push(rectFace("hl", { x: eaveX0, y: eaveY0 }, { x: eaveX0, y: eaveY1 }, { x: 1, y: 0 }, runIn, De > We ? "ridge" : "apex", "hip", "hip", ovh, De - ovh));
    if (We > De) {
      ridgeFrom = { x: eaveX0 + runIn, y: (eaveY0 + eaveY1) / 2 };
      ridgeTo = { x: eaveX1 - runIn, y: (eaveY0 + eaveY1) / 2 };
    } else {
      ridgeFrom = { x: (eaveX0 + eaveX1) / 2, y: eaveY0 + runIn };
      ridgeTo = { x: (eaveX0 + eaveX1) / 2, y: eaveY1 - runIn };
    }
    eaveRing = [{ x: eaveX0, y: eaveY0 }, { x: eaveX1, y: eaveY0 }, { x: eaveX1, y: eaveY1 }, { x: eaveX0, y: eaveY1 }];
  } else {
    // A pyramid over a square or a regular polygon, in one tier or two.
    const polyFaces = (pts: V2[], a: number, o: number, id: string, cap: number | null, tier: 1 | 2): V2[] => {
      const m = pts.length;
      const cc = centroid(pts);
      const scale = (a + o) / a;
      const outer = pts.map((p) => ({ x: cc.x + (p.x - cc.x) * scale, y: cc.y + (p.y - cc.y) * scale }));
      const beta = halfPi - Math.PI / m;
      for (let k = 0; k < m; k++) {
        const A = outer[k];
        const B = outer[(k + 1) % m];
        const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
        const nrm = unit(sub(cc, mid));
        const Lu = len(sub(B, A));
        const runIn = a + o;
        const spec = rectFace(`${id}${k}`, A, B, nrm, runIn, cap === null ? "apex" : "cap", "hip", "hip", o * cot(beta), Lu - o * cot(beta), o, cap ?? runIn, tier);
        spec.betaA = beta;
        spec.betaB = beta;
        faceSpecs.push(spec);
      }
      return outer;
    };
    const a = regular ? apothemIn : W / 2;
    apex = c;
    if (kind === "double-tier") {
      const cap = ovh + TIER_SHARE * a;
      eaveRing = polyFaces(ring, a, ovh, "t", cap, 1);
      const s2 = 1 - TIER_SHARE;
      const ring2 = ring.map((p) => ({ x: c.x + (p.x - c.x) * s2, y: c.y + (p.y - c.y) * s2 }));
      const ovh2 = Math.max(6, Math.round(ovh * 0.6));
      tier2 = { ring: ring2, apothemIn: a * s2, ovhIn: ovh2, baseTopIn: 0 };
    } else {
      eaveRing = polyFaces(ring, a, ovh, "p", null, 1);
    }
  }

  // ── Rafter size: the smallest that spans the longest common's horizontal span.
  const faceRunToTop = (f: FaceSpec) => Math.max(0, f.vTopIn - f.ovhIn);
  const tableSpan = (size: JoistSize) => (pergola ? rafterMaxSpanIn(20, rafterGroup, size, spacing as 12 | 16 | 24) : rafterMaxSpanIn(roofLoad, rafterGroup, size, spacing as 12 | 16 | 24, ceilingOn));
  // A pergola's rafters run front to back in one piece when they can; past the table or past stock, header rows divide the depth into bays.
  const pergolaStock = STOCK_MAX_IN - 2 * ovh - 6;
  let pergolaBays = 1;
  let rafterSize: JoistSize;
  if (pergola) {
    const depthIn = y1 - y0;
    if (r.rafter !== "auto") {
      rafterSize = r.rafter;
      pergolaBays = Math.max(1, Math.ceil(depthIn / Math.min(Math.max(1, tableSpan(rafterSize)), pergolaStock) - 1e-9));
    } else {
      rafterSize = "2x12";
      for (let bays = 1; bays <= 6; bays++) {
        const bay = depthIn / bays;
        if (bay > pergolaStock) continue;
        const fit = JOIST_SIZES.find((sz) => tableSpan(sz) >= bay);
        if (fit) {
          rafterSize = fit;
          pergolaBays = bays;
          break;
        }
      }
    }
  } else rafterSize = r.rafter !== "auto" ? r.rafter : JOIST_SIZES.find((sz) => tableSpan(sz) >= faceSpecs.filter((f) => f.tier === 1).reduce((m, f) => Math.max(m, faceRunToTop(f)), 0)) ?? "2x12";
  const commonSpanIn = pergola ? (y1 - y0) / pergolaBays : faceSpecs.filter((f) => f.tier === 1).reduce((m, f) => Math.max(m, faceRunToTop(f)), 0);
  const rafterMax = tableSpan(rafterSize);
  const rafterDepth = joistDepthIn(rafterSize);
  const heel = HEEL_SHARE * rafterDepth;

  // ── Headers: sized from the deck beam table at the roof's load.
  const headerCandidates: BeamSize[] = r.header !== "auto" ? [r.header] : [...BUILT_UP_CHOICES, ...(solidBeamTabulated(40, group) ? SOLID_BEAMS : [])];
  /**
   * The deck beam table's first column is a 6-ft joist span (150 lb/ft of
   * 50-psf deck). A light roof or a pergola puts less than that on a header;
   * the table cannot be read below its first column, so the span it allows
   * there is stretched by the square root of the load ratio (bending grows
   * with w·L²), never past one and a half times. An ESTIMATE, said in the
   * checks.
   */
  const headerMaxSpan = (size: BeamSize, eqJoistSpanFt: number) => {
    const col = Math.max(TABLE_FIRST_COLUMN_FT, eqJoistSpanFt);
    const base = isSolidBeam(size) ? solidBeamMaxSpanIn(40, group, size, col) : builtUpBeamMaxSpanIn(40, group, size, col);
    if (!(base > 0) || eqJoistSpanFt >= TABLE_FIRST_COLUMN_FT) return base;
    const stretch = Math.min(LIGHT_LOAD_STRETCH_MAX, Math.sqrt(TABLE_FIRST_COLUMN_FT / Math.max(0.5, eqJoistSpanFt)));
    return Math.floor(base * stretch);
  };
  const postSetCost = price("labor.roofPost") + price("hw.postBase") + price("hw.postCap") + (r.eaveHeightIn / 12) * price(lumberKey(r.post));
  const pickHeader = (lengthIn: number, eqJoistSpanFt: number): { spec: BeamSpec; maxSpanIn: number; segments: number } => {
    type Opt = { spec: BeamSpec; maxSpanIn: number; segments: number; cost: number };
    const options: Opt[] = headerCandidates.map((size) => {
      const spec = beamSpec(size);
      const maxSpanIn = headerMaxSpan(size, eqJoistSpanFt);
      const segments = maxSpanIn > 0 ? Math.max(1, Math.ceil(lengthIn / maxSpanIn - 1e-9)) : 1;
      return { spec, maxSpanIn, segments, cost: (lengthIn / 12) * spec.plies * price(lumberKey(spec.stock)) + (segments - 1) * postSetCost };
    });
    const tabulated = options.filter((o) => o.maxSpanIn > 0);
    if (!tabulated.length) {
      const deepest = options.reduce((m, o) => (o.spec.depthIn > m.spec.depthIn || (o.spec.depthIn === m.spec.depthIn && o.spec.plies > m.spec.plies) ? o : m));
      return { spec: deepest.spec, maxSpanIn: 0, segments: 1 };
    }
    const best = tabulated.reduce((m, o) => (o.cost < m.cost - 0.005 || (Math.abs(o.cost - m.cost) <= 0.005 && o.spec.depthIn < m.spec.depthIn) ? o : m));
    return { spec: best.spec, maxSpanIn: best.maxSpanIn, segments: best.segments };
  };

  // The ridge first, where there is one: its king posts load the headers.
  const headerBeyond: string[] = [];
  let ridge: RoofFrame["ridge"] = null;
  let kingPosts = 0;
  let ties = 0;
  let ridgeBeyond = false;
  let ridgeLengthIn = 0;
  if (ridgeFrom && ridgeTo) {
    ridgeLengthIn = len(sub(ridgeTo, ridgeFrom));
    const auto: "beam" | "board" | "none" = kind === "gable" ? "beam" : "board";
    const asked = r.ridge === "auto" ? auto : r.ridge;
    const rk: "beam" | "board" | "none" = kind === "hip" && asked === "none" ? "board" : kind === "gable" && asked === "none" ? "board" : asked;
    if (rk === "beam" && kind === "gable") {
      const runFt = faceSpecs[0].runIn / 12;
      const eq = (2 * runFt * totalPsf) / 50;
      const pick = pickHeader(ridgeSpanIn, eq);
      const beyond = pick.maxSpanIn === 0 || pick.maxSpanIn < ridgeSpanIn - 0.01;
      const tieAcross = Math.abs(ridgeTo.x - ridgeFrom.x) > Math.abs(ridgeTo.y - ridgeFrom.y) ? y1 - y0 : x1 - x0;
      if (beyond && r.ridge === "auto" && tieAcross <= STOCK_MAX_IN) {
        // Nothing in the table carries a beam this long: framed with a ridge board and ties instead (the checks say so; "Beam" prices an engineered one).
        const nominal = oneDeeper(rafterSize);
        ridge = { kind: "board", nominal, lengthIn: ridgeLengthIn, spec: null, spanIn: ridgeSpanIn, maxSpanIn: pick.maxSpanIn, eqJoistSpanFt: Math.round(eq * 10) / 10, fellBack: true };
        ties = Math.floor(ridgeSpanIn / TIE_SPACING_IN) + 1;
      } else {
        ridgeBeyond = beyond;
        ridge = { kind: "beam", nominal: pick.spec.stock, lengthIn: ridgeLengthIn, spec: pick.spec, spanIn: ridgeSpanIn, maxSpanIn: pick.maxSpanIn, eqJoistSpanFt: Math.round(eq * 10) / 10, fellBack: false };
        kingPosts = ridgeSupports === "king-king" ? 2 : 1;
      }
    } else if (rk === "beam") {
      // A hip's short ridge as a beam: a built-up pair, bearing on the hips' meeting points.
      const spec = beamSpec(`2-${oneDeeper(rafterSize)}` as BeamSize);
      ridge = { kind: "beam", nominal: spec.stock, lengthIn: ridgeLengthIn, spec, spanIn: ridgeLengthIn, maxSpanIn: 0, eqJoistSpanFt: 0, fellBack: false };
    } else {
      const nominal = oneDeeper(rafterSize);
      ridge = { kind: "board", nominal, lengthIn: ridgeLengthIn, spec: null, spanIn: 0, maxSpanIn: 0, eqJoistSpanFt: 0, fellBack: false };
      if (kind === "gable") ties = Math.floor(ridgeSpanIn / TIE_SPACING_IN) + 1;
    }
  }

  // ── Posts and headers around the ring.
  const posts: RoofPost[] = [];
  const headers: RoofHeader[] = [];
  const members: RoofMember[] = [];
  const planes: RoofPlane[] = [];
  const footprintSqFt = ringArea(eaveRing) / 144;
  const ringAreaSqFt = ringArea(ring) / 144;
  const [pw, pd] = POST_ACTUAL_IN[r.post];
  const postCount0 = wall ? n - 2 : n;
  const shareLb = (totalPsf * footprintSqFt * (wall ? 0.5 : 1)) / Math.max(1, postCount0);
  const headerTopOf = new Map<string, number>();

  const edgeIsWall = (k: number) => wall && Math.abs(ring[k].y - y0) < 0.01 && Math.abs(ring[(k + 1) % n].y - y0) < 0.01;
  const faceOfEdge = (k: number): FaceSpec | undefined => {
    const A = ring[k];
    const B = ring[(k + 1) % n];
    const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    return faceSpecs.filter((f) => f.tier === 1).find((f) => {
      // The face whose eave is parallel to this edge and just outside it.
      const u = unit(sub(f.B, f.A));
      const d = sub(mid, f.A);
      const along = d.x * u.x + d.y * u.y;
      const off = d.x * f.n.x + d.y * f.n.y;
      return Math.abs(off - f.ovhIn) < 0.6 && along > -1 && along < len(sub(f.B, f.A)) + 1;
    });
  };

  // Posts at the ring's corners (not on the wall).
  const cornerPosts: Array<{ k: number; x: number; y: number }> = [];
  for (let k = 0; k < n; k++) {
    const p = ring[k];
    if (wall && Math.abs(p.y - y0) < 0.01) continue;
    cornerPosts.push({ k, x: p.x, y: p.y });
  }

  // Headers edge by edge, with the posts their spans need.
  const extraPosts: Array<{ x: number; y: number; edge: number }> = [];
  for (let k = 0; k < n; k++) {
    if (edgeIsWall(k)) continue;
    const A = ring[k];
    const B = ring[(k + 1) % n];
    const lengthIn = len(sub(B, A));
    const face = faceOfEdge(k);
    // What this header carries: half the rafters' run on its face (eave side), or a king post on a gable end.
    let tribFt = 0;
    let king = false;
    if (pergola) tribFt = (y1 - y0) / 2 / 12 + ovh / 12;
    else if (face) tribFt = (face.vTopIn - face.ovhIn) / 2 / 12 + face.ovhIn / 12;
    else if (kind === "gable") {
      // A gable end: the rakes bear on nothing; the king post does, when the ridge is a beam.
      const runFt = faceSpecs[0].runIn / 12;
      if (ridge?.kind === "beam") {
        const P = totalPsf * runFt * (ridgeSpanIn / 12) * 0.5;
        const wEq = (2 * P) / Math.max(1, lengthIn / 12);
        tribFt = wEq / totalPsf;
        king = true;
      } else tribFt = 1;
    } else if (kind === "shed") tribFt = (y1 - y0) / 2 / 12 + ovh / 12;
    const eq = Math.round(((2 * tribFt * totalPsf) / 50) * 10) / 10;
    const pick = pickHeader(lengthIn, eq);
    const wallEnd = wall && (Math.abs(A.y - y0) < 0.01 || Math.abs(B.y - y0) < 0.01);
    const id = `h${k + 1}`;
    if (pick.maxSpanIn === 0) headerBeyond.push(id);
    const postAt: number[] = [0, lengthIn];
    for (let s = 1; s < pick.segments; s++) {
      const at = (lengthIn * s) / pick.segments;
      postAt.splice(postAt.length - 1, 0, at);
      const u = unit(sub(B, A));
      extraPosts.push({ x: A.x + u.x * at, y: A.y + u.y * at, edge: k });
    }
    const spanIn = postAt.slice(1).reduce((m, v, i) => Math.max(m, v - postAt[i]), 0);
    headers.push({ id, x0: A.x, y0: A.y, x1: B.x, y1: B.y, lengthIn, spec: pick.spec, postAt, spanIn, eqJoistSpanFt: eq, maxSpanIn: pick.maxSpanIn, kingPost: king, wallEnd });
  }
  const pergolaMidYs: number[] = [];
  if (pergola && pergolaBays > 1) {
    for (let k = 1; k < pergolaBays; k++) {
      const yk = y0 + ((y1 - y0) * k) / pergolaBays;
      pergolaMidYs.push(yk);
      const lengthIn = x1 - x0;
      const tribFt = (y1 - y0) / pergolaBays / 12;
      const eq = Math.round(((2 * tribFt * totalPsf) / 50) * 10) / 10;
      const pick = pickHeader(lengthIn, eq);
      const id = `hm${k}`;
      if (pick.maxSpanIn === 0) headerBeyond.push(id);
      const postAt: number[] = [0, lengthIn];
      for (let sgm = 1; sgm < pick.segments; sgm++) {
        const at = (lengthIn * sgm) / pick.segments;
        postAt.splice(postAt.length - 1, 0, at);
        extraPosts.push({ x: x0 + at, y: yk, edge: -1 });
      }
      extraPosts.push({ x: x0, y: yk, edge: -1 }, { x: x1, y: yk, edge: -1 });
      const spanIn = postAt.slice(1).reduce((m, v, i) => Math.max(m, v - postAt[i]), 0);
      headers.push({ id, x0, y0: yk, x1, y1: yk, lengthIn, spec: pick.spec, postAt, spanIn, eqJoistSpanFt: eq, maxSpanIn: pick.maxSpanIn, kingPost: false, wallEnd: false });
    }
  }
  const headerDepth = headers.length ? Math.max(...headers.map((h) => h.spec.depthIn)) : 9.25;
  const headerTopIn = headerBottomIn + headerDepth;
  for (const h of headers) headerTopOf.set(h.id, headerTopIn);

  // A free shed's back posts are taller: the back header sits up at the top of the slope.
  const shedRise = kind === "shed" && !wall ? (y1 - y0) * slope : 0;

  // All posts: corners and the ones the headers needed.
  const allPostPts: Array<{ x: number; y: number; corner: boolean }> = [...cornerPosts.map((p) => ({ x: p.x, y: p.y, corner: true })), ...extraPosts.map((p) => ({ x: p.x, y: p.y, corner: false }))];
  const postBottomIn = design.floor === "deck" ? (deck ? deck.footingTopIn : 0) : design.floor === "slab" ? SLAB_TOP_IN : design.footing.aboveGradeIn;
  const designForFootings: DeckDesign = design.floor === "ground" ? { ...design, placement: wall ? "attached" : "detached" } : design;
  let postBeyond = false;
  let postSpliced = false;
  allPostPts.forEach((p, i) => {
    const topIn = headerBottomIn + (kind === "shed" && !wall && Math.abs(p.y - y0) < 0.01 ? shedRise : 0);
    const loadLb = Math.round(shareLb * (p.corner ? 1 : 1.3));
    const tributarySqFt = Math.round((loadLb / 50) * 10) / 10;
    const maxHeightIn = postMaxHeightIn(40, group, r.post, Math.min(160, tributarySqFt));
    if (r.eaveHeightIn > maxHeightIn) postBeyond = true;
    const heightIn = topIn - postBottomIn;
    const spliced = heightIn > STOCK_MAX_IN;
    if (spliced) postSpliced = true;
    const footing = design.floor === "ground" ? footingFor(designForFootings, p.x, p.y, Math.round((loadLb / (design.loadPsf + 10)) * 10) / 10, r.post, design.footing.aboveGradeIn) : null;
    posts.push({ id: `rp${i + 1}`, x: p.x, y: p.y, size: r.post, bottomIn: postBottomIn, topIn, heightIn, loadLb, tributarySqFt, maxHeightIn, corner: p.corner, bearing: design.floor, footing, spliced });
    members.push({ role: "roof-post", nominal: r.post, lengthIn: heightIn, cx: p.x, cy: p.y, cz: postBottomIn + heightIn / 2, sx: pw, sy: pd, sz: heightIn, yaw: 0, tilt: 0, x0: p.x, y0: p.y, x1: p.x, y1: p.y, ground: design.floor !== "deck" });
  });

  // Headers as lumber: post centre to post centre, plus half a post at each free end.
  for (const h of headers) {
    const u = unit({ x: h.x1 - h.x0, y: h.y1 - h.y0 });
    const yaw = Math.atan2(u.y, u.x);
    const ext0 = h.wallEnd && Math.abs(h.y0 - y0) < 0.01 ? 0 : pw / 2;
    const ext1 = h.wallEnd && Math.abs(h.y1 - y0) < 0.01 ? 0 : pw / 2;
    const ax = h.x0 - u.x * ext0;
    const ay = h.y0 - u.y * ext0;
    const bx = h.x1 + u.x * ext1;
    const by = h.y1 + u.y * ext1;
    const L = Math.hypot(bx - ax, by - ay);
    const top = headerTopIn;
    // A free shed's back header rides up the slope; its side headers tilt.
    const zA = top + (kind === "shed" && !wall ? (y1 - Math.min(Math.max(ay, y0), y1)) * slope : 0);
    const zB = top + (kind === "shed" && !wall ? (y1 - Math.min(Math.max(by, y0), y1)) * slope : 0);
    const tilt = Math.atan2(zB - zA, L);
    const ply = h.spec.kind === "solid" ? h.spec.thickIn : THICK_2X_IN;
    for (let p = 0; p < h.spec.plies; p++) {
      const off = -h.spec.thickIn / 2 + (p + 0.5) * ply;
      // Plies are side by side across the header (toward the roof's inside).
      const nx = -u.y;
      const ny = u.x;
      members.push({ role: "header", nominal: h.spec.stock, lengthIn: L, cx: (ax + bx) / 2 + nx * off, cy: (ay + by) / 2 + ny * off, cz: (zA + zB) / 2 - h.spec.depthIn / 2, sx: L / Math.cos(tilt), sy: ply, sz: h.spec.depthIn, yaw, tilt, x0: ax, y0: ay, x1: bx, y1: by, of: h.id });
    }
  }

  // ── Rafters on every face.
  const faces: RoofFace[] = [];
  let commons = 0;
  let jacks = 0;
  let flies = 0;
  let longest = 0;
  let eaveFt = 0;
  let rakeFt = 0;
  let wallFt = 0;
  let roofAreaSqFt = 0;
  let ceilingSqFt = 0;
  let soffitSqFt = 0;
  let hipTotal = 0;
  let hipCount = 0;
  const hipNominal = oneDeeper(rafterSize);
  const hipDepth = depthOf(hipNominal);
  const seenHips = new Set<string>();
  const subfasciaNominal = rafterDepth > 7.5 ? "2x8" : "2x6";
  const fasciaBoardIn = rafterDepth > 7.5 ? 10 : 8;

  /** The top of the rafters at horizontal distance v from the eave line, on a face whose header top is `hTop`. */
  const zTopAt = (v: number, ovhIn: number, hTop: number) => hTop + heel + (v - ovhIn) * slope;

  const layFace = (f: FaceSpec, hTop: number, roleTag: string) => {
    const u = unit(sub(f.B, f.A));
    const Lu = len(sub(f.B, f.A));
    const at = (uu: number, vv: number): V2 => ({ x: f.A.x + u.x * uu + f.n.x * vv, y: f.A.y + u.y * uu + f.n.y * vv });
    const vMax = (uu: number) => Math.min(f.vTopIn, f.sideA === "hip" ? uu * Math.tan(f.betaA) : Infinity, f.sideB === "hip" ? (Lu - uu) * Math.tan(f.betaB) : Infinity);
    const yaw = Math.atan2(f.n.y, f.n.x);
    const rafterAt = (uu: number, role: RoofRole) => {
      const v1 = vMax(uu);
      if (!(v1 > 10)) return;
      const p0 = at(uu, 0);
      const p1 = at(uu, v1);
      const z0 = zTopAt(0, f.ovhIn, hTop) - rafterDepth / 2 / cosT;
      const z1 = zTopAt(v1, f.ovhIn, hTop) - rafterDepth / 2 / cosT;
      const L = v1 / cosT;
      members.push({ role, nominal: rafterSize, lengthIn: L, cx: (p0.x + p1.x) / 2, cy: (p0.y + p1.y) / 2, cz: (z0 + z1) / 2, sx: L, sy: THICK_2X_IN, sz: rafterDepth, yaw, tilt: theta, x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y, of: f.id });
      longest = Math.max(longest, L);
      if (role === "fly") flies++;
      else if (v1 >= f.vTopIn - 0.5) commons++;
      else jacks++;
    };
    // The fly rafters at a rake overhang, then the layout from the header's start.
    if (f.sideA === "rake" && f.ringU0 > 2) rafterAt(THICK_2X_IN / 2, "fly");
    if (f.sideB === "rake" && Lu - f.ringU1 > 2) rafterAt(Lu - THICK_2X_IN / 2, "fly");
    const start = f.ringU0 + (f.sideA === "hip" ? spacing : THICK_2X_IN / 2);
    const end = f.ringU1 - (f.sideB === "hip" ? 1 : THICK_2X_IN / 2);
    const placed: number[] = [];
    for (let uu = start; uu <= end + 1e-6; uu += spacing) placed.push(uu);
    if (f.sideB !== "hip" && (placed.length === 0 || end - placed[placed.length - 1] > 3)) placed.push(end);
    for (const uu of placed) rafterAt(uu, roleTag === "jack" ? "jack" : "rafter");

    // The face's corners and figures.
    const TA = at(cot(f.betaA) * f.vTopIn, f.vTopIn);
    const TB = at(Lu - cot(f.betaB) * f.vTopIn, f.vTopIn);
    const planArea = ringArea([f.A, f.B, TB, TA]);
    const area = planArea / cosT / 144;
    roofAreaSqFt += area;
    const sideLen = (side: RoofFace["sideA"]) => (side === "rake" || side === "wall" ? f.vTopIn / cosT : 0);
    const rake = (f.sideA === "rake" ? sideLen("rake") : 0) + (f.sideB === "rake" ? sideLen("rake") : 0);
    const wallLen = (f.sideA === "wall" ? sideLen("wall") : 0) + (f.sideB === "wall" ? sideLen("wall") : 0) + (f.top === "wall" ? len(sub(TB, TA)) : 0);
    eaveFt += Lu / 12;
    rakeFt += rake / 12;
    wallFt += wallLen / 12;
    // Ceiling and soffit areas.
    const A1 = at(cot(f.betaA) * f.ovhIn, f.ovhIn);
    const B1 = at(Lu - cot(f.betaB) * f.ovhIn, f.ovhIn);
    if (ceilingOn) ceilingSqFt += ringArea([A1, B1, TB, TA]) / cosT / 144;
    if (r.soffit) soffitSqFt += ringArea([f.A, f.B, B1, A1]) / 144;
    faces.push({
      id: f.id,
      ax: f.A.x,
      ay: f.A.y,
      bx: f.B.x,
      by: f.B.y,
      ux: u.x,
      uy: u.y,
      nx: f.n.x,
      ny: f.n.y,
      lengthIn: Lu,
      runIn: f.runIn,
      vTopIn: f.vTopIn,
      top: f.top,
      sideA: f.sideA,
      sideB: f.sideB,
      betaA: f.betaA,
      betaB: f.betaB,
      ovhIn: f.ovhIn,
      ringU0: f.ringU0,
      ringU1: f.ringU1,
      tax: TA.x,
      tay: TA.y,
      tbx: TB.x,
      tby: TB.y,
      areaSqFt: Math.round(area * 10) / 10,
      eaveFt: Lu / 12,
      rakeFt: rake / 12,
      wallFt: wallLen / 12,
      tier: f.tier,
    });

    // Planes: sheathing and roofing over the whole face, the ceiling under the rafters inside the header, the soffit under the overhang.
    const zt = (v: number) => zTopAt(v, f.ovhIn, hTop);
    const ring3 = (pts: Array<[V2, number]>) => pts.flatMap(([p, z]) => [p.x, p.y, z]);
    if (!pergola) {
      planes.push({ kind: "sheathing", ring: ring3([[f.A, zt(0) + 0.25], [f.B, zt(0) + 0.25], [TB, zt(f.vTopIn) + 0.25], [TA, zt(f.vTopIn) + 0.25]]), of: f.id });
      planes.push({ kind: "roofing", ring: ring3([[f.A, zt(0) + 0.9], [f.B, zt(0) + 0.9], [TB, zt(f.vTopIn) + 0.9], [TA, zt(f.vTopIn) + 0.9]]), of: f.id });
      if (ceilingOn) {
        const under = rafterDepth / cosT + 0.75;
        planes.push({ kind: "ceiling", ring: ring3([[A1, zt(f.ovhIn) - under], [B1, zt(f.ovhIn) - under], [TB, zt(f.vTopIn) - under], [TA, zt(f.vTopIn) - under]]), of: f.id });
      }
      if (r.soffit && f.ovhIn > 2) {
        const zs = zt(0) - rafterDepth / cosT - 0.75;
        planes.push({ kind: "soffit", ring: ring3([[f.A, zs], [f.B, zs], [B1, zs], [A1, zs]]), of: f.id });
      }
    }

    // Hips at hip corners, once each (the corner is shared by two faces).
    const hipAt = (E: V2, T: V2) => {
      const key = `${Math.round(E.x)},${Math.round(E.y)}`;
      if (seenHips.has(key)) return;
      seenHips.add(key);
      const hz = len(sub(T, E));
      const rise = f.vTopIn * slope;
      const L = Math.hypot(hz, rise);
      const tiltH = Math.atan2(rise, hz);
      const z0 = zTopAt(0, f.ovhIn, hTop) - hipDepth / 2 / Math.cos(tiltH);
      const z1 = zTopAt(f.vTopIn, f.ovhIn, hTop) - hipDepth / 2 / Math.cos(tiltH);
      members.push({ role: "hip", nominal: hipNominal, lengthIn: L, cx: (E.x + T.x) / 2, cy: (E.y + T.y) / 2, cz: (z0 + z1) / 2, sx: L, sy: THICK_2X_IN, sz: hipDepth, yaw: Math.atan2(T.y - E.y, T.x - E.x), tilt: tiltH, x0: E.x, y0: E.y, x1: T.x, y1: T.y, of: f.id });
      hipTotal += L;
      hipCount++;
    };
    if (f.sideA === "hip") hipAt(f.A, TA);
    if (f.sideB === "hip") hipAt(f.B, TB);

    // Fascia: the sub-fascia across the rafter tails, the finish board over it; rakes on the fly rafters.
    const outward = { x: -f.n.x, y: -f.n.y };
    const zEave = zTopAt(0, f.ovhIn, hTop) - rafterDepth / cosT / 2;
    if (r.fascia.eave) {
      const off = THICK_2X_IN / 2;
      members.push({ role: "subfascia", nominal: subfasciaNominal, lengthIn: Lu, cx: (f.A.x + f.B.x) / 2 + outward.x * off, cy: (f.A.y + f.B.y) / 2 + outward.y * off, cz: zEave, sx: Lu, sy: THICK_2X_IN, sz: depthOf(subfasciaNominal), yaw: Math.atan2(u.y, u.x), tilt: 0, x0: f.A.x, y0: f.A.y, x1: f.B.x, y1: f.B.y, of: f.id });
      members.push({ role: "fascia-eave", nominal: `1x${fasciaBoardIn}`, lengthIn: Lu, cx: (f.A.x + f.B.x) / 2 + outward.x * (THICK_2X_IN + 0.4), cy: (f.A.y + f.B.y) / 2 + outward.y * (THICK_2X_IN + 0.4), cz: zEave - 0.5, sx: Lu + 1.5, sy: 0.75, sz: fasciaBoardIn - 0.75, yaw: Math.atan2(u.y, u.x), tilt: 0, x0: f.A.x, y0: f.A.y, x1: f.B.x, y1: f.B.y, of: f.id });
    }
    if (r.fascia.rake) {
      const rakeAt = (P: V2, T: V2, side: 1 | -1) => {
        const L = f.vTopIn / cosT;
        const off = { x: u.x * side * (THICK_2X_IN / 2 + 0.4), y: u.y * side * (THICK_2X_IN / 2 + 0.4) };
        members.push({ role: "fascia-rake", nominal: `1x${fasciaBoardIn}`, lengthIn: L, cx: (P.x + T.x) / 2 + off.x, cy: (P.y + T.y) / 2 + off.y, cz: (zEave + zTopAt(f.vTopIn, f.ovhIn, hTop) - rafterDepth / cosT / 2) / 2 - 0.5, sx: L, sy: 0.75, sz: fasciaBoardIn - 0.75, yaw, tilt: theta, x0: P.x, y0: P.y, x1: T.x, y1: T.y, of: f.id });
      };
      if (f.sideA === "rake") rakeAt(f.A, TA, -1);
      if (f.sideB === "rake") rakeAt(f.B, TB, 1);
    }

    // Gutters along this eave.
    if (r.gutters.kind !== "none") {
      const gw = r.gutters.kind === "k6" ? 6 : 5;
      const off = THICK_2X_IN + 0.75 + gw / 2 + 0.25;
      members.push({ role: "gutter", nominal: r.gutters.kind, lengthIn: Lu, cx: (f.A.x + f.B.x) / 2 + outward.x * off, cy: (f.A.y + f.B.y) / 2 + outward.y * off, cz: zEave + rafterDepth / 2 - 2.5, sx: Lu + 1, sy: gw, sz: 4, yaw: Math.atan2(u.y, u.x), tilt: 0, x0: f.A.x, y0: f.A.y, x1: f.B.x, y1: f.B.y, of: f.id });
    }
  };

  for (const f of faceSpecs.filter((f) => f.tier === 1)) layFace(f, headerTopIn, f.top === "cap" || f.sideA === "hip" ? "jack" : "rafter");

  // The second tier: a band of short posts on a ring beam at the lower tier's cap, and a small pyramid over it.
  if (tier2 && apex) {
    const lower = faceSpecs.find((f) => f.tier === 1)!;
    const capZ = zTopAt(lower.vTopIn, lower.ovhIn, headerTopIn);
    const ringTop = capZ - rafterDepth / cosT + 0.5;
    const ringDepth = 7.25;
    // The ring beam where the lower tier stops (a 2x8 between the hips' tops).
    for (let k = 0; k < tier2.ring.length; k++) {
      const A = tier2.ring[k];
      const B = tier2.ring[(k + 1) % tier2.ring.length];
      const L = len(sub(B, A));
      members.push({ role: "ring", nominal: "2x8", lengthIn: L, cx: (A.x + B.x) / 2, cy: (A.y + B.y) / 2, cz: ringTop - ringDepth / 2, sx: L, sy: THICK_2X_IN, sz: ringDepth, yaw: Math.atan2(B.y - A.y, B.x - A.x), tilt: 0, x0: A.x, y0: A.y, x1: B.x, y1: B.y, of: "tier" });
      members.push({ role: "tier-post", nominal: "4x4", lengthIn: TIER_BAND_IN, cx: A.x, cy: A.y, cz: ringTop + TIER_BAND_IN / 2, sx: 3.5, sy: 3.5, sz: TIER_BAND_IN, yaw: 0, tilt: 0, x0: A.x, y0: A.y, x1: A.x, y1: A.y, of: "tier" });
    }
    const upperHeaderTop = ringTop + TIER_BAND_IN + 7.25;
    for (let k = 0; k < tier2.ring.length; k++) {
      const A = tier2.ring[k];
      const B = tier2.ring[(k + 1) % tier2.ring.length];
      const L = len(sub(B, A));
      members.push({ role: "header", nominal: "2x8", lengthIn: L, cx: (A.x + B.x) / 2, cy: (A.y + B.y) / 2, cz: upperHeaderTop - ringDepth / 2, sx: L, sy: THICK_2X_IN, sz: ringDepth, yaw: Math.atan2(B.y - A.y, B.x - A.x), tilt: 0, x0: A.x, y0: A.y, x1: B.x, y1: B.y, of: "tier" });
    }
    const m = tier2.ring.length;
    const cc = centroid(tier2.ring);
    const a2 = tier2.apothemIn;
    const o2 = tier2.ovhIn;
    const scale = (a2 + o2) / a2;
    const outer = tier2.ring.map((p) => ({ x: cc.x + (p.x - cc.x) * scale, y: cc.y + (p.y - cc.y) * scale }));
    const beta = halfPi - Math.PI / m;
    for (let k = 0; k < m; k++) {
      const A = outer[k];
      const B = outer[(k + 1) % m];
      const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
      const nrm = unit(sub(cc, mid));
      const Lu = len(sub(B, A));
      const spec = rectFace(`u${k}`, A, B, nrm, a2 + o2, "apex", "hip", "hip", o2 * cot(beta), Lu - o2 * cot(beta), o2, a2 + o2, 2);
      spec.betaA = beta;
      spec.betaB = beta;
      faceSpecs.push(spec);
      layFace(spec, upperHeaderTop, "jack");
    }
    tier2.baseTopIn = upperHeaderTop;
  }

  // ── The ridge, king posts and ties.
  const peakIn = (() => {
    if (pergola) return headerTopIn + rafterDepth + (r.slats.size === "2x6" ? 5.5 : r.slats.size === "2x4" ? 3.5 : 1.5);
    const top1 = faceSpecs.filter((f) => f.tier === 1)[0];
    let z = top1 ? zTopAt(top1.vTopIn, top1.ovhIn, headerTopIn) : headerTopIn;
    if (tier2) {
      const up = faceSpecs.find((f) => f.tier === 2);
      if (up) z = zTopAt(up.vTopIn, up.ovhIn, tier2.baseTopIn);
    }
    return z;
  })();
  if (ridge && ridgeFrom && ridgeTo) {
    const depth = ridge.spec ? ridge.spec.depthIn : depthOf(ridge.nominal);
    const thick = ridge.spec ? ridge.spec.thickIn : THICK_2X_IN;
    const yaw = Math.atan2(ridgeTo.y - ridgeFrom.y, ridgeTo.x - ridgeFrom.x);
    const plies = ridge.spec ? ridge.spec.plies : 1;
    const ply = ridge.spec && ridge.spec.kind === "solid" ? thick : THICK_2X_IN;
    const nx = -Math.sin(yaw);
    const ny = Math.cos(yaw);
    for (let p = 0; p < plies; p++) {
      const off = -thick / 2 + (p + 0.5) * ply;
      members.push({ role: "ridge", nominal: ridge.spec ? ridge.spec.stock : ridge.nominal, lengthIn: ridge.lengthIn, cx: (ridgeFrom.x + ridgeTo.x) / 2 + nx * off, cy: (ridgeFrom.y + ridgeTo.y) / 2 + ny * off, cz: peakIn - depth / 2, sx: ridge.lengthIn, sy: ply, sz: depth, yaw, tilt: 0, x0: ridgeFrom.x, y0: ridgeFrom.y, x1: ridgeTo.x, y1: ridgeTo.y });
    }
    if (kingPosts > 0) {
      const kingAt = (P: V2) => {
        const h = Math.max(6, peakIn - depth - headerTopIn);
        members.push({ role: "king", nominal: "4x4", lengthIn: h, cx: P.x, cy: P.y, cz: headerTopIn + h / 2, sx: 3.5, sy: 3.5, sz: h, yaw: 0, tilt: 0, x0: P.x, y0: P.y, x1: P.x, y1: P.y });
      };
      // On the ring's ends of the ridge (the rake overhang cantilevers past them).
      const ux = Math.cos(yaw);
      const uy = Math.sin(yaw);
      const inset = (P: V2, dir: 1 | -1) => ({ x: P.x + ux * dir * ovh, y: P.y + uy * dir * ovh });
      if (ridgeSupports === "king-king") {
        kingAt(inset(ridgeFrom, 1));
        kingAt(inset(ridgeTo, -1));
      } else kingAt(inset(ridgeTo, -1));
    }
    if (ties > 0) {
      const across = kind === "gable" && Math.abs(Math.sin(yaw)) > 0.5 ? x1 - x0 : y1 - y0;
      const tieYaw = yaw + halfPi;
      for (let k = 0; k < ties; k++) {
        const t = ties === 1 ? 0.5 : k / (ties - 1);
        const P = { x: ridgeFrom.x + (ridgeTo.x - ridgeFrom.x) * t, y: ridgeFrom.y + (ridgeTo.y - ridgeFrom.y) * t };
        const px = Math.min(Math.max(P.x, x0 + 2), x1 - 2);
        const py = Math.min(Math.max(P.y, y0 + 2), y1 - 2);
        members.push({ role: "tie", nominal: "2x6", lengthIn: across, cx: Math.abs(Math.sin(yaw)) > 0.5 ? (x0 + x1) / 2 : px, cy: Math.abs(Math.sin(yaw)) > 0.5 ? py : (y0 + y1) / 2, cz: headerTopIn + heel + 2.75, sx: across, sy: THICK_2X_IN, sz: 5.5, yaw: tieYaw, tilt: 0, x0: px, y0: py, x1: px, y1: py });
      }
    }
  }

  // The ledger on the house, for a shed or an attached hip.
  let ledger: RoofFrame["ledger"] = null;
  if (wall && (kind === "shed" || kind === "hip")) {
    const nominal = oneDeeper(rafterSize);
    const ld = depthOf(nominal);
    const top1 = faceSpecs.find((f) => f.id === "s" || f.id === "hf")!;
    const zTop = zTopAt(top1.vTopIn, top1.ovhIn, headerTopIn);
    const lx0 = kind === "shed" ? x0 : ridgeFrom!.x;
    const lx1 = kind === "shed" ? x1 : ridgeTo!.x;
    const L = lx1 - lx0;
    const fasteners = Math.max(4, Math.ceil(L / LEDGER_SCREW_SPACING_IN) * 2);
    ledger = { lengthIn: L, nominal, fasteners, zIn: zTop };
    members.push({ role: "roof-ledger", nominal, lengthIn: L, cx: (lx0 + lx1) / 2, cy: THICK_2X_IN / 2, cz: zTop - ld / 2, sx: L, sy: THICK_2X_IN, sz: ld, yaw: 0, tilt: 0, x0: lx0, y0: 0, x1: lx1, y1: 0 });
  }

  // Pergola: rafters across the ring, slats on top.
  let slats: RoofFrame["slats"] = null;
  if (pergola) {
    const yawR = halfPi;
    const L = eaveY1 - eaveY0;
    const zR = headerTopIn + rafterDepth / 2;
    const placed: number[] = [];
    for (let x = x0 + THICK_2X_IN / 2; x <= x1 - THICK_2X_IN / 2 + 1e-6; x += spacing) placed.push(x);
    if (x1 - THICK_2X_IN / 2 - placed[placed.length - 1] > 3) placed.push(x1 - THICK_2X_IN / 2);
    // One piece front to back when it comes out of stock; otherwise cut over the header rows.
    const cuts: Array<[number, number]> = L <= STOCK_MAX_IN ? [[eaveY0, eaveY1]] : [eaveY0, ...pergolaMidYs, eaveY1].slice(0, -1).map((a, i, arr) => [a, i + 1 < arr.length ? arr[i + 1] : eaveY1] as [number, number]);
    for (const x of placed) {
      for (const [ya, yb] of cuts) {
        const len = yb - ya;
        members.push({ role: "rafter", nominal: rafterSize, lengthIn: len, cx: x, cy: (ya + yb) / 2, cz: zR, sx: len, sy: THICK_2X_IN, sz: rafterDepth, yaw: yawR, tilt: 0, x0: x, y0: ya, x1: x, y1: yb });
        longest = Math.max(longest, len);
      }
      commons++;
    }
    if (wall) {
      // On the house: a ledger one size deeper than the rafters, the rafters hung on it.
      const nominal = oneDeeper(rafterSize);
      const ld = depthOf(nominal);
      const Lw = x1 - x0;
      const fasteners = Math.max(4, Math.ceil(Lw / LEDGER_SCREW_SPACING_IN) * 2);
      ledger = { lengthIn: Lw, nominal, fasteners, zIn: headerTopIn + rafterDepth };
      members.push({ role: "roof-ledger", nominal, lengthIn: Lw, cx: (x0 + x1) / 2, cy: THICK_2X_IN / 2, cz: headerTopIn + rafterDepth - ld / 2, sx: Lw, sy: THICK_2X_IN, sz: ld, yaw: 0, tilt: 0, x0, y0: 0, x1, y1: 0 });
    }
    const sd = r.slats.size === "2x6" ? 5.5 : r.slats.size === "2x4" ? 3.5 : 1.5;
    const sw = 1.5;
    const Ls = eaveX1 - eaveX0;
    let count = 0;
    let total = 0;
    for (let y = eaveY0 + sw / 2; y <= eaveY1 - sw / 2 + 1e-6; y += r.slats.spacingIn) {
      members.push({ role: "slat", nominal: r.slats.size, lengthIn: Ls, cx: (eaveX0 + eaveX1) / 2, cy: y, cz: headerTopIn + rafterDepth + sd / 2, sx: Ls, sy: sw, sz: sd, yaw: 0, tilt: 0, x0: eaveX0, y0: y, x1: eaveX1, y1: y });
      count++;
      total += Ls;
    }
    slats = { count, nominal: r.slats.size, totalIn: total };
    eaveFt = 0;
  }

  // Purlins across the rafters for metal on open framing.
  if (!pergola && metal && r.roofDeck === "purlins") {
    for (const f of faces) {
      const u = { x: f.ux, y: f.uy };
      const nn = { x: f.nx, y: f.ny };
      const hTop = f.tier === 2 && tier2 ? tier2.baseTopIn : headerTopIn;
      for (let v = 6; v < f.vTopIn - 3; v += 24) {
        // The purlin's ends follow the face's sides at this v.
        const uA = f.sideA === "hip" ? v * cot(f.betaA) : 0;
        const uB = f.lengthIn - (f.sideB === "hip" ? v * cot(f.betaB) : 0);
        if (uB - uA < 12) continue;
        const P = { x: f.ax + u.x * uA + nn.x * v, y: f.ay + u.y * uA + nn.y * v };
        const Q = { x: f.ax + u.x * uB + nn.x * v, y: f.ay + u.y * uB + nn.y * v };
        const L = uB - uA;
        members.push({ role: "purlin", nominal: "2x4", lengthIn: L, cx: (P.x + Q.x) / 2, cy: (P.y + Q.y) / 2, cz: zTopAt(v, f.ovhIn, hTop) + 0.75, sx: L, sy: 1.5, sz: 3.5, yaw: Math.atan2(u.y, u.x), tilt: 0, x0: P.x, y0: P.y, x1: Q.x, y1: Q.y, of: f.id });
      }
    }
  }

  // Knee braces at every post, along its headers.
  let braces = 0;
  if (r.braces) {
    for (const p of posts) {
      if (p.heightIn < BRACE_LEG_IN * 2) continue;
      const mine = headers.filter((h) => (Math.abs(h.x0 - p.x) < 0.01 && Math.abs(h.y0 - p.y) < 0.01) || (Math.abs(h.x1 - p.x) < 0.01 && Math.abs(h.y1 - p.y) < 0.01) || h.postAt.some((a, i) => i > 0 && i < h.postAt.length - 1 && Math.abs(h.x0 + ((h.x1 - h.x0) * a) / h.lengthIn - p.x) < 0.5 && Math.abs(h.y0 + ((h.y1 - h.y0) * a) / h.lengthIn - p.y) < 0.5));
      for (const h of mine) {
        const u = unit({ x: h.x1 - h.x0, y: h.y1 - h.y0 });
        const atStart = Math.abs(h.x0 - p.x) < 0.5 && Math.abs(h.y0 - p.y) < 0.5;
        const atEnd = Math.abs(h.x1 - p.x) < 0.5 && Math.abs(h.y1 - p.y) < 0.5;
        const dirs: Array<1 | -1> = atStart ? [1] : atEnd ? [-1] : [1, -1];
        for (const d of dirs) {
          const L = BRACE_LEG_IN * Math.SQRT2;
          const ex = p.x + u.x * d * (BRACE_LEG_IN / 2);
          const ey = p.y + u.y * d * (BRACE_LEG_IN / 2);
          const yaw = Math.atan2(u.y * d, u.x * d);
          members.push({ role: "roof-brace", nominal: "4x4", lengthIn: L, cx: ex, cy: ey, cz: p.topIn - BRACE_LEG_IN / 2, sx: L, sy: 3.5, sz: 3.5, yaw, tilt: Math.PI / 4, x0: p.x, y0: p.y, x1: p.x + u.x * d * BRACE_LEG_IN, y1: p.y + u.y * d * BRACE_LEG_IN });
          braces++;
        }
      }
    }
  }

  // A cupola at the peak.
  if (r.cupola && !pergola) {
    const half = CUPOLA_IN / 2;
    const base = peakIn - 2;
    const corners: V2[] = [{ x: c.x - half, y: c.y - half }, { x: c.x + half, y: c.y - half }, { x: c.x + half, y: c.y + half }, { x: c.x - half, y: c.y + half }];
    for (const q of corners) members.push({ role: "cupola", nominal: "4x4", lengthIn: CUPOLA_BOX_IN, cx: q.x, cy: q.y, cz: base + CUPOLA_BOX_IN / 2, sx: 3.5, sy: 3.5, sz: CUPOLA_BOX_IN, yaw: 0, tilt: 0, x0: q.x, y0: q.y, x1: q.x, y1: q.y });
    const top = base + CUPOLA_BOX_IN;
    const peak = top + half * 0.75;
    for (let k = 0; k < 4; k++) {
      const A = corners[k];
      const B = corners[(k + 1) % 4];
      const o = { x: (A.x - c.x) * 1.2 + c.x, y: (A.y - c.y) * 1.2 + c.y };
      const o2 = { x: (B.x - c.x) * 1.2 + c.x, y: (B.y - c.y) * 1.2 + c.y };
      planes.push({ kind: "roofing", ring: [o.x, o.y, top, o2.x, o2.y, top, c.x, c.y, peak], of: "cupola" });
    }
  }

  // ── Figures for the material list.
  const ridgeFt = ridge ? ridge.lengthIn / 12 : 0;
  const hipRoof = kind === "hip" || kind === "pyramid" || kind === "double-tier";
  const wasteFactor = pergola ? 1 : hipRoof ? 1.15 : 1.1;
  const squares = pergola ? 0 : Math.ceil((roofAreaSqFt * wasteFactor) / 100 * 10) / 10;
  const sheets = pergola || (metal && r.roofDeck === "purlins") ? 0 : Math.ceil((roofAreaSqFt * wasteFactor) / 32 - 1e-9);
  const metalPanels: RoofFrame["metalPanels"] = [];
  if (metal) {
    const byLen = new Map<number, number>();
    for (const f of faces) {
      const slopedFt = Math.ceil((f.vTopIn / cosT) / 12 + 0.25);
      const panels = Math.ceil(f.lengthIn / METAL_PANEL_COVER_IN);
      byLen.set(slopedFt, (byLen.get(slopedFt) ?? 0) + panels);
    }
    for (const [lengthFt, count] of [...byLen].sort((a, b) => a[0] - b[0])) metalPanels.push({ lengthFt, count });
  }

  // Gutters: every eave that is not on the wall; a hip's eaves make one closed run.
  let gutters: GutterPlan | null = null;
  if (r.gutters.kind !== "none" && !pergola) {
    const eaves = faces.filter((f) => f.tier === 1).map((f) => f.lengthIn / 12);
    const lf = eaves.reduce((a, b) => a + b, 0);
    const closed = hipRoof && !wall;
    const runs = closed ? 1 : eaves.length;
    const downspouts = closed ? Math.max(2, Math.ceil(lf / DOWNSPOUT_EVERY_FT)) : eaves.reduce((a, ft) => a + Math.max(1, Math.ceil(ft / DOWNSPOUT_EVERY_FT)), 0);
    const dropFt = (headerTopIn + heel) / 12 + 1;
    const hangerEvery = roofLoad >= 30 ? HANGER_SPACING_IN.snow : HANGER_SPACING_IN.plain;
    gutters = {
      kind: r.gutters.kind,
      lf: Math.round(lf * 10) / 10,
      runs,
      closed,
      corners: closed ? faces.filter((f) => f.tier === 1).length : 0,
      endCaps: closed ? 0 : runs * 2,
      downspouts,
      downspoutFt: Math.ceil(downspouts * dropFt),
      downspoutSize: r.gutters.kind === "k5" ? "2x3" : "3x4",
      hangers: Math.ceil((lf * 12) / hangerEvery) + runs,
      elbows: downspouts * 3,
      guardsLf: r.gutters.guards ? Math.round(lf * 10) / 10 : 0,
    };
    // Downspouts drawn at the posts nearest each run's end.
    let placedDs = 0;
    for (const p of posts) {
      if (placedDs >= downspouts || !p.corner) continue;
      const dsw = gutters.downspoutSize === "2x3" ? 2 : 3;
      const dsd = gutters.downspoutSize === "2x3" ? 3 : 4;
      const out = unit(sub(p, c));
      const h = headerTopIn + heel - 4 - (floorIn + 2);
      members.push({ role: "downspout", nominal: gutters.downspoutSize, lengthIn: h, cx: p.x + out.x * (pw / 2 + 2), cy: p.y + out.y * (pd / 2 + 2), cz: floorIn + 2 + h / 2, sx: dsw, sy: dsd, sz: h, yaw: 0, tilt: 0, x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      placedDs++;
    }
  }

  // A slab under a gazebo or a pergola.
  let slab: RoofFrame["slab"] = null;
  if (design.floor === "slab") {
    const sqFt = ((x1 - x0 + 2 * SLAB_APRON_IN) * (y1 - y0 + 2 * SLAB_APRON_IN)) / 144;
    slab = { sqFt: Math.round(sqFt), cuYd: Math.round(((sqFt * (SLAB_THICK_IN / 12)) / 27) * 1.1 * 10) / 10 };
    planes.push({ kind: "slab", ring: [x0 - SLAB_APRON_IN, y0 - SLAB_APRON_IN, SLAB_TOP_IN, x1 + SLAB_APRON_IN, y0 - SLAB_APRON_IN, SLAB_TOP_IN, x1 + SLAB_APRON_IN, y1 + SLAB_APRON_IN, SLAB_TOP_IN, x0 - SLAB_APRON_IN, y1 + SLAB_APRON_IN, SLAB_TOP_IN] });
  }

  const rafterCount = commons + jacks + flies;
  const hardware = {
    hurricaneTies: pergola ? 0 : rafterCount,
    rafterHangers: pergola ? 0 : (ridge?.kind === "beam" ? commons : 0) + (ledger ? commons + flies : 0) + jacks + hipCount,
    postBases: posts.length,
    postCaps: posts.length,
    slabAnchors: design.floor === "slab" ? posts.length * 2 : 0,
    braces,
    ledgerScrews: ledger?.fasteners ?? 0,
    ringPlate: (kind === "pyramid" || kind === "double-tier") && regular ? (tier2 ? 2 : 1) : 0,
    kingBrackets: kingPosts + (ridgeSupports === "wall-king" ? 1 : 0),
    wallHangers: wall && kind === "gable" ? 2 : 0,
  };

  return {
    roof: r,
    kind,
    kindNote,
    attach: wall ? "wall" : "free",
    floor: design.floor,
    species,
    group,
    rafterGroup,
    roofLoad,
    deadPsf,
    totalPsf,
    ring,
    eaveRing,
    centreX: c.x,
    centreY: c.y,
    widthIn: Math.max(...eaveRing.map((p) => p.x)) - Math.min(...eaveRing.map((p) => p.x)),
    depthIn: Math.max(...eaveRing.map((p) => p.y)) - Math.min(...eaveRing.map((p) => p.y)),
    ringAreaSqFt: Math.round(ringAreaSqFt * 10) / 10,
    footprintSqFt: Math.round(footprintSqFt * 10) / 10,
    floorIn,
    headerBottomIn,
    headerTopIn,
    peakIn,
    slope,
    pitchAngle: theta,
    faces,
    posts,
    headers,
    ledger,
    rafters: { size: rafterSize, spacingIn: spacing, count: rafterCount, commons, jacks, flies, longestIn: longest, spanIn: Math.round(commonSpanIn), maxSpanIn: rafterMax, estimated: rafterGroup === "RW" || ceilingOn },
    ridge,
    hips: { count: hipCount, nominal: hipNominal, totalIn: hipTotal },
    kingPosts,
    ties,
    slats,
    members,
    planes,
    eaveFt: Math.round(eaveFt * 10) / 10,
    rakeFt: Math.round(rakeFt * 10) / 10,
    wallFt: Math.round(wallFt * 10) / 10,
    ridgeFt: Math.round(ridgeFt * 10) / 10,
    hipFt: Math.round((hipTotal / 12) * 10) / 10,
    roofAreaSqFt: Math.round(roofAreaSqFt * 10) / 10,
    wasteFactor,
    squares,
    sheets,
    metalPanels,
    ceilingSqFt: Math.round(ceilingSqFt),
    soffitSqFt: Math.round(soffitSqFt),
    gutters,
    slab,
    hardware,
    flags: {
      rafterBeyondTable: commonSpanIn > rafterMax + 0.01,
      headerBeyondTable: headerBeyond,
      ridgeBeyondTable: ridgeBeyond,
      postBeyondTable: postBeyond,
      speciesEstimated: rafterGroup === "RW",
      tooWideForHip,
      postSpliced,
    },
  };
}

/** The roof's posts as the deck frame takes them: their own footings through the deck. */
export function roofPostsForDeck(roof: RoofFrame): Array<{ id: string; x: number; y: number; size: PostSize; loadLb: number }> {
  if (roof.floor !== "deck") return [];
  return roof.posts.map((p) => ({ id: p.id, x: p.x, y: p.y, size: p.size, loadLb: p.loadLb }));
}

/** "Gable 6:12 · 2x8 rafters @ 16 in. · 4 posts" */
export function roofWords(roof: RoofFrame): string {
  const r = roof.roof;
  if (roof.kind === "pergola") return `Pergola · ${roof.rafters.size} rafters @ ${roof.rafters.spacingIn} in. · ${r.slats.size} slats @ ${r.slats.spacingIn} in. · ${roof.posts.length} posts`;
  const name = roof.kind === "double-tier" ? "Double-tier" : roof.kind.charAt(0).toUpperCase() + roof.kind.slice(1);
  return `${name} ${r.pitch}:12 · ${roof.rafters.size} rafters @ ${roof.rafters.spacingIn} in. · ${roof.posts.length} ${roof.posts.length === 1 ? "post" : "posts"}`;
}

export { CEILING_FACTOR, RW_FACTOR };
