// Roof diagram — calibration engine. Pure, no I/O, safe to import anywhere.
//
// The reconstruction (src/lib/roofRecon.ts) gets the GEOMETRY of a roof right —
// on the test house its area and pitch matched EagleView Instant to 0.01 % — but
// it is weak on two things a contractor reads first: edge classification (eaves
// read as hip/valley, 149 ft vs EagleView's 282 ft) and noise pitches (11, 13,
// 15, 3, 4 alongside the real 10/12). EagleView Instant Property Data is the
// opposite: contract-grade NUMBERS (area, squares, predominant pitch, building
// outlines) and no facet geometry at all. This module marries the two under the
// spec's rule — "Instant wins" — so every figure printed on the drawing traces
// back to Instant while the facets stay where the imagery put them.
//
// FRAME. Every point in the model is, and stays, in the reconstruction's RASTER
// frame: origin at the queried pin, x east, y north, z above ground, feet. The
// DSM, the roof mask and the chimney candidates all live in that frame, so the
// geometry is never rescaled or moved here. It is the Instant OUTLINE that is
// brought to the model, not the model to the outline:
//
//   1. every structure outline is converted into the frame, then the whole set
//      is aligned to the model's perimeter with a small rigid fit (rotation about
//      the pin ≤ 3°, shift ≤ 6 ft, least squares) — this absorbs UTM grid
//      convergence and georeferencing offset between the two sources. The
//      transform is reported so callers can apply it to anything else they
//      convert from lat/lng with the pin as origin (vision chimney boxes);
//   2. the whole model is RECTIFIED onto the house grid, then REFINED — the
//      topology/position passes of the drawing-rules spec §3 (T-junction weld,
//      chamfer removal, chain collapse, sliver merge, ridge centering, corner
//      anchoring, micro-line cleanup) — before anything is classified;
//   3. perimeter edges lying on the outline are reclassified EAVE (level) /
//      RAKE (climbing);
//   4. facet pitches are quantised to the 2–3 dominant values, and the
//      area-weighted mode is forced to Instant's predominant pitch;
//   5. facet areas are measured from plan geometry × pitch factor and summed;
//      k = √(instantArea / Σ), clamped to ±15 % (a bigger gap means the two
//      sources disagree on WHICH building was measured, and silently absorbing
//      it would hide that). k is applied to the REPORTED figures only:
//      face.areaSqft = geometric × k², line.lengthFt = geometric × k, totals
//      from those. The points are untouched, so bounds are geometric.
//
// SELECTION GATE (spec §4 + §6.5). Three candidates are built — SYNTHESIZED
// (the straight-skeleton model grown from the Instant outlines — or, when an
// accepted AI-traced roof edge is supplied on a single-ring lot
// (CalibrateInput.visionOutline), from that vision ring directly: it IS the
// roof edge, so no overhang-offset guessing; geometry only, figures stay
// Instant-calibrated — spec §6, fed
// a RECLASSIFIED clone of the refined recon as evidence so its gable
// detection sees real RAKEs), REFINED and pre-refine RECTIFIED — and each
// runs the identical tail (reclassification, pitch quantisation, k figures;
// the synthesized model is born classified so it skips the first two but
// takes k identically), is then PLANARIZED (spec §5 hard drawing invariants)
// and scored. The gate optimises SOUNDNESS × FAITHFULNESS: the validator's
// quality score measures physical soundness alone — on the test house a clean
// 10-facet / 526 ft synthesis outscored an honest 20-facet / 977 ft repair of
// a 22-facet / 887 ft roof — so each candidate also gets a FIDELITY score
// 0–100 (facet count vs Instant's, E/R/V/H/K footage vs the refined repair's)
// and the highest gate metric 0.6·validatorScore + 0.4·fidelity ships.
// `notes.pipeline` names the winner; `notes.validation` carries score,
// fidelity and gateMetric; `notes.validation.gateFellBack` still says when
// refine lost to pre-refine. Synthesis failing (no outlines / skeleton null)
// never blocks — the repaired recon candidates remain.
//
// GRAFT. When the refined evidence exists, the sub-roofs the straight skeleton
// cannot grow (dormers, porch roofs — evidence facets with no synthesized
// counterpart) are grafted onto the fresh synthesized model from that evidence
// BEFORE it is finished/planarized/validated; the grafted model replaces the
// synthesized candidate, and its OVERLAY faces (drawn atop a host facet whose
// figure already transferred) are excluded from the validator's R05 coverage
// sum. The finisher re-derives every area from its ring — which would restore
// the HOST's full figure (its ring is deliberately not re-cut) and count the
// dormer twice — so finishCalibration subtracts each overlay's footprint from
// its host via the graft report's hostAttribution BEFORE k is fit, and the
// footage dedupe exempts overlay lines (a dormer ridge above a base ridge is
// a real separate edge). Graft failing never blocks — the ungrafted synthesis
// remains.
//
// PER-STRUCTURE GATE. On lots with 2+ outline rings one pipeline winning the
// WHOLE lot would let a house that synthesizes well drag its garage into
// synthesis (or the reverse), so every finished candidate is cut into
// shared-nothing per-structure sub-models (facets assigned to rings by plan
// centroid; rings sharing a STRADDLING facet in any candidate are grouped and
// gated as one, so a straddler is never roofed twice by two independent
// winners), each sub's figures are refit against ITS Instant structure area
// when available (per-structure k — a whole-lot k misprices a structure whose
// recon error differs from the lot's), and each group is gated independently
// by the same metric — on validator score alone, fidelity recorded ABSENT,
// when no independent reference (Instant facet count or a refined sub) exists
// for it. The winners are composed into the shipped model — ids re-prefixed
// "s{i}:" (NESTED over a foreign prefix, never stripped, so ids stay unique by
// construction), coincident duplicated lines deduped, totals recomputed once,
// the composition planarized — and the COMPOSITION ITSELF is gated: it ships
// only while it stays within a small margin of the best whole-lot candidate
// on the same gate metric (the whole-lot yardstick is biased against
// per-structure k, so a material loss falls back, a hair does not).
// `notes.pipeline` then records the composition, e.g. "s0:synthesized+graft,
// s1:refined"; CalibrationReport.structureScaleK records the per-structure ks
// and the top-level scaleK/reconAreaSqft describe the shipped composition.
//
// Consequently `lengthFt` / `areaSqft` are the printable numbers and the polygon
// is the drawable shape. Drawing and export code must PRINT lengthFt/areaSqft
// and never re-measure the polygon — a re-measured figure would be 1/k off.
//
// Everything reported in CalibrationReport is what the drawing's "data source"
// line and the adversarial review need to judge how much surgery was done.

import type {
  EvLineType,
  InstantRoofData,
  RoofFace,
  RoofLine,
  RoofModel,
  RoofPoint,
} from "@/lib/eagleview";
import { EV_LINE_TYPES } from "@/lib/eagleview";
import { latLngRingToFrame } from "@/lib/roofRecon";
import { rectifyModel } from "@/lib/roofDiagram/rectify";
import { refineModel, type RefineReport } from "@/lib/roofDiagram/refine";
import { flattenFacets, type FlattenReport } from "./flatten";
import { keepOnlyRoof, type RoofRegionReport } from "./roofRegions";
import { validateRoofModel } from "@/lib/roofDiagram/validate";
import { planarizeModel, type PlanarizeReport } from "@/lib/roofDiagram/planarize";
import { CONFORM_MAX_FT, conformPerimeterToRing } from "@/lib/roofDiagram/conformOutline";
import { synthesizeRoofModel, type SynthesizeReport } from "@/lib/roofDiagram/synthesize";
import { graftSubRoofs, overlayFaceIds, type GraftReport } from "@/lib/roofDiagram/graft";
import type { CalibrationReport, ConformOutlineProvenance, VisionOutlineProvenance } from "@/lib/roofDiagram/types";

export interface CalibrateInput {
  /** Roof regions in model-frame feet from the vision pass — the areas that are
   *  actually roof. Facets outside them are dropped as ground (optional). */
  roofRegions?: Array<Array<{ x: number; y: number }>>;
  recon: RoofModel;
  instant: InstantRoofData;
  origin: { lat: number; lng: number };
  /** Accepted AI-traced roof-edge ring (outlineVision.traceRoofOutline) in the
   *  RAW pin frame — feet about `origin`, x east, y north, BEFORE the outline
   *  transform (the frame `instantWallRingsRaw` returns). When it survives the
   *  structural re-check on a single-ring lot it shapes GEOMETRY ONLY: the
   *  synthesis base ring and planarize's P2 clip target. Printed numbers stay
   *  Instant-calibrated (k on figures) regardless. Optional, additive. */
  visionOutline?: CalibrateVisionOutline;
}

/** The caller-validated vision outline handed to calibrateModel. The ring was
 *  already gated by traceRoofOutline against the SAME Instant wall ring this
 *  calibration converts (IoU, area ratio, wall-vertex distance) — calibrate
 *  re-checks structure only (finite points, corner count, non-trivial area). */
export interface CalibrateVisionOutline {
  /** Simple CCW roof-edge ring, RAW pin-frame feet. */
  ringFt: Array<{ x: number; y: number }>;
  /** "vision" = fresh trace this run; "vision-cache" = cached accepted trace. */
  source: "vision" | "vision-cache";
  /** IoU vs the dilated wall outline, from the acceptance gates. */
  iou: number;
  cornerCount: number;
  /** Upstream failure notes carried into provenance (usually empty — callers
   *  normally pass only an accepted ring). */
  reasons?: string[];
}

/** Summary of validateRoofModel's verdict on the SHIPPED model — persisted
 *  alongside a measurement so the drawing can say how sound its geometry is. */
export interface CalibrationValidation {
  /** Quality score 0–100 (spec §4 weighting) — physical soundness. */
  score: number;
  errors: number;
  warns: number;
  /** True when the REFINED candidate scored below the pre-refine (rectified)
   *  one at the selection gate. It does NOT say what shipped — the synthesized
   *  candidate may win regardless — so it is persisted alongside
   *  `CalibrationNotes.pipeline`, which names the winner. */
  gateFellBack: boolean;
  /** Faithfulness 0–100 of the shipped candidate to the measured evidence:
   *  0.5·facetAgreement (vs Instant's facet count) + 0.5·footageAgreement
   *  (vs the refined repair's E/R/V/H/K footage). */
  fidelity?: number;
  /** What the gate ranked candidates by: 0.6·score + 0.4·fidelity. */
  gateMetric?: number;
}

/** Side observations that are not part of the shared report contract. */
export interface CalibrationNotes {
  /** What the roof/not-roof gate removed before the pipeline ran. */
  roofRegions?: RoofRegionReport;
  /** Facet flattening applied to the repair candidates (flatten.ts). */
  flatten?: FlattenReport;
  /** Lines whose endpoints coincided in plan (< DEGENERATE_FT) and were
   *  WELDED OUT of the geometry — endpoints merged, line removed — instead of
   *  merely counted, so rings stay chainable and nothing draws as a dot. */
  degenerateLines: number;
  /** Diagnostics for the eave/rake pass: how many perimeter lines the topology
   *  found, how many passed the on-outline gate, and their footage by type
   *  before/after — the harness prints these to tune the gates. */
  perimeterLines: number;
  gatedLines: number;
  perimeterFtBefore: Record<string, number>;
  perimeterFtAfter: Record<string, number>;
  /** What the refine pass (spec §3) did to the SHIPPED topology; absent when
   *  the reconstruction was degenerate and refine never ran. When the
   *  validation gate fell back to the pre-refine geometry the counts are all
   *  zero and `applied` is false — the discarded counts move to
   *  `refineDiscarded`. */
  refine?: RefineReport & { applied?: boolean };
  /** Refine's counts when the gate discarded its geometry (spec §4). */
  refineDiscarded?: RefineReport;
  /** Validator verdict on the shipped model (spec §4) and whether the gate
   *  fell back to the pre-refine geometry to keep the score from dropping. */
  validation?: CalibrationValidation;
  /** Which candidate the selection gate shipped (spec §6.5). Widened
   *  ADDITIVELY to string: single-ring lots keep the plain names
   *  ("synthesized" / "refined" / "rectified"); on multi-ring lots the
   *  per-structure gate records the composition summary, e.g.
   *  "s0:synthesized+graft, s1:refined". */
  pipeline?: string;
  /** What planarization (spec §5) did to the SHIPPED model. */
  planarize?: PlanarizeReport;
  /** What synthesis (spec §6) built, whether or not its candidate won. */
  synthesize?: SynthesizeReport;
  /** What grafting evidence sub-roofs onto the synthesized candidate did,
   *  whether or not that candidate won; absent when nothing was synthesized
   *  or the graft failed. */
  graft?: GraftReport;
  /** Where the drawn roof-edge perimeter came from — "vision" when the
   *  accepted AI-traced outline shaped the synthesis base + P2 clip target,
   *  "instant" when a vision outline was supplied but not applied (the wall
   *  outline + measured overhang shaped the drawing as before). ABSENT when no
   *  vision outline reached this calibration, so vision-free runs stay
   *  byte-identical to the pre-vision pipeline. */
  outlineSource?: "vision" | "instant";
  /** Verdict on the vision-outline input (also recorded when it was skipped). */
  visionOutline?: VisionOutlineProvenance;
}

/** The three gate candidates a single structure chooses between. */
type GatePipeline = "synthesized" | "refined" | "rectified";

type LatLng = { lat: number; lng: number };
type P2 = { x: number; y: number };
/** Rotation about the origin (radians, CCW) followed by a translation, feet. */
type Rigid = CalibrationReport["outlineTransform"];

// ── tunables (feet unless noted) ─────────────────────────────────────────────

/** How far a perimeter edge may sit from an aligned outline ring and still
 *  count as lying ON it for eave/rake reclassification (measured: 4.5 ft gates
 *  19 of the 36 perimeter lines on the test house; 3 ft gated only 17). */
const GATE_FT = 4.5;
/** Floor for the eave/rake fallback below — a sub-inch drop is level whatever
 *  the run, and without it a 6-inch stub would be judged by noise. */
const EAVE_LEVEL_FLOOR_FT = 0.05;
/** Pitches covering less than this share of the roof are noise. */
const PITCH_MIN_SHARE = 0.05;
/** Never keep more than this many pitches — real roofs have 2–3. */
const PITCH_MAX_KEPT = 3;
/** When forcing the mode to Instant's pitch, only facets this close to it
 *  (rise/12) are pulled over; a genuine 4/12 porch is left alone. */
const PITCH_FORCE_WINDOW = 1.5;
const SCALE_MIN = 0.85;
const SCALE_MAX = 1.15;
/** Planarize P2 clip tolerance (ft) around the ACCEPTED vision roof edge —
 *  the ring is the drawn perimeter itself, so the band is tight where the
 *  wall-ring target needs max(2.5, overhang + 0.5). */
const VISION_CLIP_TOL_FT = 0.5;
/** The conformed repair candidate (§4b) may cost at most this much validator
 *  score vs its unconformed self — squareness never buys physical soundness. */
// A conformed candidate may cost this much validator score before it is
// reverted. Raised from 1 to 3 once flattening landed: snapping the perimeter
// onto the AI-traced roof edge is a gain in ACCURACY that the validator scores
// as a small loss (it re-tests planarity and coverage against geometry that
// just moved), and at 1.0 the pass reverted on 12629 NE 100th Pl and took the
// square perimeter with it.
const CONFORM_SCORE_DROP_MAX = 3;
/** Fallback eave height for the outline-only model when Instant has none. */
const DEFAULT_EAVE_FT = 10;
/** Two endpoints closer than this in plan make a line degenerate. */
const DEGENERATE_FT = 0.05;

// Outline alignment: a perimeter vertex pairs with the nearest outline point
// within ALIGN_PAIR_FT; the fit needs ALIGN_MIN_PAIRS of them and is trusted
// only while it stays small — a bigger correction means the outline belongs to
// a different building, not that the grid is rotated.
const ALIGN_PAIR_FT = 6;
const ALIGN_MIN_PAIRS = 4;
const ALIGN_MAX_THETA_RAD = (3 * Math.PI) / 180;
const ALIGN_MAX_SHIFT_FT = 6;
const ALIGN_ITERATIONS = 2;
const IDENTITY: Rigid = { thetaRad: 0, tx: 0, ty: 0 };

// Collinear-overlap test, same numbers the recon uses to dedupe crease copies:
// within ~10° of parallel, endpoints within 2 ft of the other line, and the
// runs actually overlap by more than half a foot.
const OVERLAP_COS = 0.985;
const OVERLAP_PERP_FT = 2;
const OVERLAP_MARGIN_FT = 0.5;

// ── small helpers ─────────────────────────────────────────────────────────────

const pitchFactor = (pitch: number): number => Math.sqrt(1 + (pitch / 12) ** 2);
const dist3 = (a: RoofPoint, b: RoofPoint): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const dist2 = (a: P2, b: P2): number => Math.hypot(a.x - b.x, a.y - b.y);

/** An edge whose direction is within 60° of the owner facet's contour
 *  (|cos| to the up-slope gradient below this) runs level → EAVE; steeper
 *  than that it climbs → RAKE. Midpoint between the two ideals (0 and 1). */
const EAVE_MAX_COS = 0.5;

/** Least-squares plane z = a·x + b·y + c through 3D ring points → the plan
 *  UP-SLOPE unit gradient, or null when the fit is degenerate or the facet is
 *  flatter than ~0.6/12 (no slope direction to speak of). */
function planeGradient(pts: RoofPoint[]): { gx: number; gy: number } | null {
  if (pts.length < 3) return null;
  let mx = 0, my = 0, mz = 0;
  for (const p of pts) { mx += p.x; my += p.y; mz += p.z; }
  mx /= pts.length; my /= pts.length; mz /= pts.length;
  let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
  for (const p of pts) {
    const dx = p.x - mx, dy = p.y - my, dz = p.z - mz;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy; sxz += dx * dz; syz += dy * dz;
  }
  const det = sxx * syy - sxy * sxy;
  if (Math.abs(det) < 1e-6) return null;
  const a = (sxz * syy - syz * sxy) / det;
  const b = (syz * sxx - sxz * sxy) / det;
  const g = Math.hypot(a, b);
  if (g < 0.05) return null;
  return { gx: a / g, gy: b / g };
}

function emptyFootage(): Record<EvLineType, number> {
  return Object.fromEntries(EV_LINE_TYPES.map((t) => [t, 0])) as Record<EvLineType, number>;
}

/** Bounds over the model's points, always including the origin — matches what
 *  the recon and the EagleView parser emit, so the viewers' fit logic behaves
 *  the same for every source. */
function boundsOf(points: RoofPoint[]): RoofModel["totals"]["bounds"] {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const zs = points.map((p) => p.z);
  return {
    minX: Math.min(...xs, 0),
    maxX: Math.max(...xs, 0),
    minY: Math.min(...ys, 0),
    maxY: Math.max(...ys, 0),
    minZ: Math.min(...zs, 0),
    maxZ: Math.max(...zs, 0),
  };
}

/** Deep copy — the caller's model is never mutated. Plain data only, so a
 *  field-by-field copy is enough and keeps the type exact. */
function cloneModel(m: RoofModel): RoofModel {
  const face = (f: RoofFace): RoofFace => ({ ...f, lineIds: [...f.lineIds] });
  return {
    ...m,
    provenance: m.provenance ? { ...m.provenance } : undefined,
    location: { ...m.location },
    points: m.points.map((p) => ({ ...p })),
    lines: m.lines.map((l) => ({ ...l })),
    faces: m.faces.map(face),
    penetrations: m.penetrations.map(face),
    totals: {
      ...m.totals,
      footageByType: { ...m.totals.footageByType },
      bounds: { ...m.totals.bounds },
    },
  };
}

/** Geo ring → frame, with a GeoJSON-style closing duplicate removed so vertex
 *  and edge counts are honest. */
function ringToFrame(origin: LatLng, ring: LatLng[]): P2[] {
  const pts = latLngRingToFrame(origin, ring).ring;
  if (pts.length > 1 && dist2(pts[0], pts[pts.length - 1]) < 0.01) pts.pop();
  return pts;
}

/** Shoelace over an ordered ring — plan (projected) area, always positive. */
function planArea(ring: P2[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Nearest point on segment ab to p, and how far away it is. */
function nearestOnSegment(p: P2, a: P2, b: P2): { x: number; y: number; d: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const x = a.x + t * dx;
  const y = a.y + t * dy;
  return { x, y, d: Math.hypot(p.x - x, p.y - y) };
}

/** Nearest point on the closed polygon boundary. */
function nearestOnRing(p: P2, ring: P2[]): { x: number; y: number; d: number } {
  let best = { x: p.x, y: p.y, d: Infinity };
  for (let i = 0; i < ring.length; i++) {
    const c = nearestOnSegment(p, ring[i], ring[(i + 1) % ring.length]);
    if (c.d < best.d) best = c;
  }
  return best;
}

/** Nearest boundary point across every structure outline. */
function nearestOnRings(p: P2, rings: P2[][]): { x: number; y: number; d: number } {
  let best = { x: p.x, y: p.y, d: Infinity };
  for (const ring of rings) {
    const c = nearestOnRing(p, ring);
    if (c.d < best.d) best = c;
  }
  return best;
}

function applyRigid(t: Rigid, p: P2): P2 {
  const c = Math.cos(t.thetaRad);
  const s = Math.sin(t.thetaRad);
  return { x: c * p.x - s * p.y + t.tx, y: s * p.x + c * p.y + t.ty };
}

/** second ∘ first — apply `first`, then `second`. */
function composeRigid(first: Rigid, second: Rigid): Rigid {
  const shifted = applyRigid({ thetaRad: second.thetaRad, tx: 0, ty: 0 }, { x: first.tx, y: first.ty });
  return { thetaRad: first.thetaRad + second.thetaRad, tx: shifted.x + second.tx, ty: shifted.y + second.ty };
}

/**
 * Rigid fit that carries the outlines onto the model's perimeter (2D Procrustes
 * without scale). Each perimeter vertex pairs with its nearest outline boundary
 * point within ALIGN_PAIR_FT; θ = atan2(Σ cross, Σ dot) over the centred pairs,
 * t = centroid(model) − R·centroid(outline). Two passes, re-pairing after the
 * first so points that slid along an edge find their real partner. Identity
 * when there are too few pairs or the fit exceeds the trust limits.
 */
function alignOutlines(rings: P2[][], anchors: P2[]): Rigid {
  let total: Rigid = IDENTITY;
  let current = rings;
  for (let iter = 0; iter < ALIGN_ITERATIONS; iter++) {
    const pairs: Array<{ m: P2; o: P2 }> = [];
    for (const m of anchors) {
      const n = nearestOnRings(m, current);
      if (n.d <= ALIGN_PAIR_FT) pairs.push({ m, o: { x: n.x, y: n.y } });
    }
    if (pairs.length < ALIGN_MIN_PAIRS) {
      if (iter === 0) return IDENTITY;
      break;
    }
    const cm = { x: 0, y: 0 };
    const co = { x: 0, y: 0 };
    for (const { m, o } of pairs) {
      cm.x += m.x / pairs.length;
      cm.y += m.y / pairs.length;
      co.x += o.x / pairs.length;
      co.y += o.y / pairs.length;
    }
    let cross = 0;
    let dot = 0;
    for (const { m, o } of pairs) {
      const ox = o.x - co.x;
      const oy = o.y - co.y;
      const mx = m.x - cm.x;
      const my = m.y - cm.y;
      cross += ox * my - oy * mx;
      dot += ox * mx + oy * my;
    }
    const thetaRad = Math.atan2(cross, dot);
    const rco = applyRigid({ thetaRad, tx: 0, ty: 0 }, co);
    const step: Rigid = { thetaRad, tx: cm.x - rco.x, ty: cm.y - rco.y };
    total = composeRigid(total, step);
    current = current.map((ring) => ring.map((p) => applyRigid(step, p)));
  }
  if (Math.abs(total.thetaRad) > ALIGN_MAX_THETA_RAD || Math.hypot(total.tx, total.ty) > ALIGN_MAX_SHIFT_FT) {
    return IDENTITY;
  }
  return total;
}

interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

/** True when the two plan segments are collinear AND overlap along their run —
 *  the recon's definition of "the same physical edge drawn twice". */
function overlapsCollinear(s: Seg, c: Seg): boolean {
  const len = Math.hypot(s.bx - s.ax, s.by - s.ay);
  const cl = Math.hypot(c.bx - c.ax, c.by - c.ay);
  if (len < 1e-6 || cl < 1e-6) return false;
  const ux = (s.bx - s.ax) / len;
  const uy = (s.by - s.ay) / len;
  const cux = (c.bx - c.ax) / cl;
  const cuy = (c.by - c.ay) / cl;
  if (Math.abs(ux * cux + uy * cuy) < OVERLAP_COS) return false;
  const perp = (x: number, y: number) => Math.abs((x - c.ax) * -cuy + (y - c.ay) * cux);
  if (perp(s.ax, s.ay) > OVERLAP_PERP_FT || perp(s.bx, s.by) > OVERLAP_PERP_FT) return false;
  const t = (x: number, y: number) => (x - c.ax) * cux + (y - c.ay) * cuy;
  const t0 = Math.min(t(s.ax, s.ay), t(s.bx, s.by));
  const t1 = Math.max(t(s.ax, s.ay), t(s.bx, s.by));
  return !(t1 < OVERLAP_MARGIN_FT || t0 > cl - OVERLAP_MARGIN_FT);
}

/** Compose-time cross-candidate dedupe: refine moves endpoints further apart
 *  than COINCIDE_FT but well under a couple of feet, so two candidates' copies
 *  of the same physical run sit inside this tightened perpendicular band … */
const COMPOSE_DUP_PERP_FT = 0.5;
/** … and their endpoints pair (same or crossed orientation) within this. */
const COMPOSE_DUP_END_FT = 1.5;

/** Is `s` a near-coincident COPY of the kept run `c` — collinear within
 *  OVERLAP_COS, inside the TIGHTENED perpendicular band, and contained in
 *  c's span (± the endpoint tolerance)? Same family as overlapsCollinear, but
 *  a strict containment test: only a copy of the same physical run qualifies,
 *  never a distinct run continuing past it. */
function nearCoincidentRun(s: Seg, c: Seg): boolean {
  const len = Math.hypot(s.bx - s.ax, s.by - s.ay);
  const cl = Math.hypot(c.bx - c.ax, c.by - c.ay);
  if (len < 1e-6 || cl < 1e-6) return false;
  const ux = (s.bx - s.ax) / len;
  const uy = (s.by - s.ay) / len;
  const cux = (c.bx - c.ax) / cl;
  const cuy = (c.by - c.ay) / cl;
  if (Math.abs(ux * cux + uy * cuy) < OVERLAP_COS) return false;
  const perp = (x: number, y: number) => Math.abs((x - c.ax) * -cuy + (y - c.ay) * cux);
  if (perp(s.ax, s.ay) > COMPOSE_DUP_PERP_FT || perp(s.bx, s.by) > COMPOSE_DUP_PERP_FT) return false;
  const t = (x: number, y: number) => (x - c.ax) * cux + (y - c.ay) * cuy;
  const t0 = Math.min(t(s.ax, s.ay), t(s.bx, s.by));
  const t1 = Math.max(t(s.ax, s.ay), t(s.bx, s.by));
  return t0 >= -COMPOSE_DUP_END_FT && t1 <= cl + COMPOSE_DUP_END_FT;
}

/** Order a face's lines head-to-tail into a ring of points. STRICT, like
 *  refine's completeRing: null unless every line and point id resolves, the
 *  walk consumes every segment (no silent truncation at a chain break) and the
 *  ring closes back on its start — so area callers fall back to the recon's
 *  own figure instead of measuring a partial ring. Local twin of
 *  roofGeometry.ringOf so this module has no dependency on the component tree. */
function ringOf(
  lineIds: string[],
  linesById: Map<string, RoofLine>,
  pointsById: Map<string, RoofPoint>,
): RoofPoint[] | null {
  if (lineIds.length < 3) return null;
  const segs: RoofLine[] = [];
  for (const id of lineIds) {
    const l = linesById.get(id);
    if (!l) return null;
    segs.push(l);
  }
  const used = new Set<number>([0]);
  const ids: string[] = [segs[0].aId];
  let next = segs[0].bId;
  for (let i = 1; i < segs.length; i++) {
    ids.push(next);
    let found = -1;
    for (let j = 0; j < segs.length; j++) {
      if (used.has(j)) continue;
      if (segs[j].aId === next) {
        found = j;
        next = segs[j].bId;
      } else if (segs[j].bId === next) {
        found = j;
        next = segs[j].aId;
      } else {
        continue;
      }
      break;
    }
    if (found < 0) return null;
    used.add(found);
  }
  if (next !== segs[0].aId) return null;
  const pts: RoofPoint[] = [];
  for (const id of ids) {
    const p = pointsById.get(id);
    if (!p) return null;
    pts.push(p);
  }
  return pts;
}

/** Wall runs and penetration outlines are never crease twins: these types are
 *  counted unconditionally by footageByType and neither suppress nor get
 *  suppressed by the collinear-overlap dedupe (a flashing tick legitimately
 *  runs along the facet edge it flashes). */
const FOOTAGE_EXEMPT_TYPES: ReadonlySet<EvLineType> = new Set<EvLineType>(["FLASHING", "STEPFLASH", "OTHER"]);

/** Every line id referenced by a penetration ring — exempt from the dedupe the
 *  same way (a chimney outline hugs whatever line it sits against). */
const penetrationLineIds = (m: RoofModel): Set<string> => new Set(m.penetrations.flatMap((p) => p.lineIds));

/** Ids minted by graftSubRoofs — a "g{n}:" segment anywhere in the id, so
 *  split pieces ("g1:L5#2"), split points ("g1:L5@x1") and composed ids
 *  ("s0:g1:L5") all match. Keep in sync with graft.ts GRAFT_MARKER. */
const GRAFT_LINE_MARKER = /(^|:)g\d+:/;

/** Line ids exempt from footageByType's collinear-overlap dedupe: penetration
 *  rings plus grafted OVERLAY lines — a dormer ridge drawn plan-collinear
 *  above a base ridge is a distinct physical edge, not a crease twin, and must
 *  print its own footage. */
function footageExemptIds(m: RoofModel): Set<string> {
  const ids = penetrationLineIds(m);
  for (const l of m.lines) if (GRAFT_LINE_MARKER.test(l.id)) ids.add(l.id);
  return ids;
}

/** Footage per line type, counting each physical edge ONCE. The recon keeps
 *  both copies of a shared crease in `lines` (each facet's ring needs its own),
 *  so a plain sum would report ridge/hip/valley at exactly 2× — the recon
 *  dedupes the same way (longest first, skip collinear overlaps). Sums the
 *  lines' `lengthFt` (already carrying k); the overlap test uses the geometry.
 *  FLASHING/STEPFLASH/OTHER lines and `exemptIds` bypass the dedupe entirely. */
function footageByType(
  lines: RoofLine[],
  pointsById: Map<string, RoofPoint>,
  exemptIds: ReadonlySet<string>,
): Record<EvLineType, number> {
  const out = emptyFootage();
  const counted: Seg[] = [];
  const byLongest = [...lines].sort((p, q) => q.lengthFt - p.lengthFt);
  for (const l of byLongest) {
    if (FOOTAGE_EXEMPT_TYPES.has(l.type) || exemptIds.has(l.id)) {
      out[l.type] += l.lengthFt;
      continue;
    }
    const a = pointsById.get(l.aId);
    const b = pointsById.get(l.bId);
    if (!a || !b) continue;
    const seg: Seg = { ax: a.x, ay: a.y, bx: b.x, by: b.y };
    if (Math.hypot(seg.bx - seg.ax, seg.by - seg.ay) < 1e-6) continue;
    if (counted.some((c) => overlapsCollinear(seg, c))) continue;
    counted.push(seg);
    out[l.type] += l.lengthFt;
  }
  return out;
}

/** Area-weighted mode of face pitches (0 when there are no faces). */
function areaMode(faces: RoofFace[]): number {
  const area = new Map<number, number>();
  for (const f of faces) area.set(f.pitch, (area.get(f.pitch) ?? 0) + f.areaSqft);
  let mode = 0;
  let best = -1;
  for (const [p, a] of area) {
    if (a > best) {
      best = a;
      mode = p;
    }
  }
  return mode;
}

// ── degenerate-line weld ─────────────────────────────────────────────────────

/**
 * Drop lines whose endpoints coincide in plan (< DEGENERATE_FT). Dropping the
 * line alone would break every ring that chains through it, so the losing end
 * is WELDED first: bId becomes an alias of aId, every surviving line is
 * rewritten onto the winning ids, the dead line ids are filtered out of the
 * face rings and the orphaned points are removed. Mutates `model`; returns how
 * many lines were dropped.
 */
function dropDegenerateLines(model: RoofModel): number {
  const pointsById = new Map(model.points.map((p) => [p.id, p]));
  const alias = new Map<string, string>();
  const resolveId = (id: string): string => {
    let cur = id;
    while (alias.has(cur)) cur = alias.get(cur) as string;
    return cur;
  };
  const dropped = new Set<string>();
  for (const l of model.lines) {
    const aId = resolveId(l.aId);
    const bId = resolveId(l.bId);
    if (aId === bId) {
      // Both ends already welded to the same vertex — a fully collapsed line.
      dropped.add(l.id);
      continue;
    }
    const a = pointsById.get(aId);
    const b = pointsById.get(bId);
    if (!a || !b) continue;
    if (dist2(a, b) < DEGENERATE_FT) {
      alias.set(bId, aId);
      dropped.add(l.id);
    }
  }
  if (dropped.size === 0) return 0;
  model.lines = model.lines.filter((l) => !dropped.has(l.id));
  for (const l of model.lines) {
    l.aId = resolveId(l.aId);
    l.bId = resolveId(l.bId);
  }
  for (const list of [model.faces, model.penetrations]) {
    for (const f of list) f.lineIds = f.lineIds.filter((id) => !dropped.has(id));
  }
  model.points = model.points.filter((p) => !alias.has(p.id));
  return dropped.size;
}

// ── perimeter detection ──────────────────────────────────────────────────────

/**
 * Topology first: a line referenced by exactly one ROOF face. That alone is
 * not enough for recon models — facets are regularised independently, so a
 * shared crease is emitted twice (one copy per facet, each referenced once).
 * A candidate is therefore demoted when another face's line runs collinear
 * and overlapping with it — the recon's own definition of a duplicate.
 */
function detectPerimeter(
  model: RoofModel,
  pointsById: Map<string, RoofPoint>,
): { perimeter: RoofLine[]; ownersOf: Map<string, Set<number>> } {
  const ownersOf = new Map<string, Set<number>>();
  model.faces.forEach((f, fi) => {
    for (const id of f.lineIds) {
      const s = ownersOf.get(id) ?? new Set<number>();
      s.add(fi);
      ownersOf.set(id, s);
    }
  });
  const segOf = (l: RoofLine): Seg | null => {
    const a = pointsById.get(l.aId);
    const b = pointsById.get(l.bId);
    return a && b ? { ax: a.x, ay: a.y, bx: b.x, by: b.y } : null;
  };
  const owned = model.lines
    .map((l) => ({ line: l, owners: ownersOf.get(l.id), seg: segOf(l) }))
    .filter((e): e is { line: RoofLine; owners: Set<number>; seg: Seg } => !!e.owners && !!e.seg);
  const perimeter: RoofLine[] = [];
  for (const e of owned) {
    if (e.owners.size !== 1) continue;
    const [owner] = e.owners;
    const twinned = owned.some(
      (o) => o.line.id !== e.line.id && !o.owners.has(owner) && overlapsCollinear(e.seg, o.seg),
    );
    if (!twinned) perimeter.push(e.line);
  }
  return { perimeter, ownersOf };
}

// ── validation ───────────────────────────────────────────────────────────────

/** Score a model with the shared validator, using the tolerance set for its
 *  source: EagleView-parsed models are held to generated tolerances, everything
 *  else (recon-derived geometry, however calibrated) to reconstructed ones.
 *  `overlay` (grafted candidates): face ids whose plan areas the R05 coverage
 *  sum must skip — they are drawn atop a host facet. */
function validationOf(
  model: RoofModel,
  overlay?: Set<string>,
): { score: number; errors: number; warns: number } {
  const v = validateRoofModel(model, {
    source: model.source === "eagleview" ? "eagleview" : "recon",
    ...(overlay && overlay.size ? { overlayFaceIds: overlay } : {}),
  });
  return { score: v.score, errors: v.errors, warns: v.warns };
}

/** An honest all-zero RefineReport for the gate-fell-back case: the shipped
 *  geometry received none of refine's repairs, whatever the discarded run did. */
function zeroRefineReport(): RefineReport {
  return {
    weldedTJunctions: 0,
    chamfersRemoved: 0,
    chainsCollapsed: 0,
    sliversMerged: 0,
    ridgesCentered: 0,
    creasesAnchored: 0,
    microLinesDropped: 0,
    otherSuppressed: 0,
  };
}

// ── perimeter eave/rake reclassification ─────────────────────────────────────

/** What the eave/rake pass saw and did — the diagnostics the harness prints. */
interface PerimeterReclass {
  perimeterLines: number;
  gatedLines: number;
  reclassified: { eave: number; rake: number };
  perimeterFtBefore: Record<string, number>;
  perimeterFtAfter: Record<string, number>;
}

/**
 * Reclassify perimeter edges EAVE/RAKE in place (pipeline step 3 — see the
 * file header). Extracted from finishCalibration so the SAME rule prepares the
 * synthesis evidence clone: spec §6.3 gable detection needs real RAKEs, not
 * the recon's raw perimeter types. `apply: false` only measures the perimeter
 * footage (synthesized candidates are born classified, §6.5).
 *
 * With outlines in hand, only edges that actually LIE on one are touched:
 * both endpoints on it and the midpoint within GATE_FT (a chord across a
 * corner has both ends on the outline but cuts through the building). A
 * single-face edge that stays inside the outline is a roof-to-wall run the
 * recon already typed FLASHING/STEPFLASH from DSM evidence — leave it.
 * Without an outline the topological answer is all we have; the wall types
 * are still preserved because a wall is not open air.
 * Eave vs rake by the OWNER FACET'S SLOPE, not by endpoint heights: DSM
 * noise puts ±1 ft on any perimeter vertex, so a level eave routinely fails
 * a 0.75 ft test and flips to RAKE (measured on the test house: eave footage
 * FELL 149 → 118 ft under the z rule, against 282 ft in the EagleView
 * report). An eave runs along the facet's contour, perpendicular to the
 * up-slope gradient; a rake climbs it. Endpoint heights remain the fallback
 * when the plane fit is degenerate or the facet is flat.
 */
function reclassifyPerimeter(
  model: RoofModel,
  rings: P2[][],
  hasOutline: boolean,
  opts: { apply: boolean },
): PerimeterReclass {
  const pointsById = new Map(model.points.map((p) => [p.id, p]));
  const linesById = new Map(model.lines.map((l) => [l.id, l]));
  const { perimeter, ownersOf } = detectPerimeter(model, pointsById);
  const gradByFace = new Map<number, { gx: number; gy: number } | null>();
  const gradientOf = (fi: number): { gx: number; gy: number } | null => {
    if (!gradByFace.has(fi)) {
      const ring = ringOf(model.faces[fi].lineIds, linesById, pointsById);
      gradByFace.set(fi, ring ? planeGradient(ring) : null);
    }
    return gradByFace.get(fi) ?? null;
  };
  const reclassified = { eave: 0, rake: 0 };
  const perimeterFtBefore: Record<string, number> = {};
  const perimeterFtAfter: Record<string, number> = {};
  let gatedLines = 0;
  for (const l of perimeter) {
    const a = pointsById.get(l.aId);
    const b = pointsById.get(l.bId);
    if (!a || !b) continue;
    perimeterFtBefore[l.type] = (perimeterFtBefore[l.type] ?? 0) + dist3(a, b);
  }
  const reclassifyTargets = opts.apply ? perimeter : [];
  for (const l of reclassifyTargets) {
    const a = pointsById.get(l.aId);
    const b = pointsById.get(l.bId);
    if (!a || !b) continue;
    if (hasOutline) {
      // On the outline = both endpoints AND the midpoint within GATE_FT of an
      // aligned ring, all by DISTANCE — the recon's traced edge wanders more
      // than its corners, so proximity is the honest membership test.
      const da = nearestOnRings(a, rings).d;
      const db = nearestOnRings(b, rings).d;
      if (da > GATE_FT || db > GATE_FT) continue;
      const mid = nearestOnRings({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, rings);
      if (mid.d > GATE_FT) continue;
    } else if (l.type === "FLASHING" || l.type === "STEPFLASH") {
      continue;
    }
    gatedLines++;
    const owner = ownersOf.get(l.id);
    const g = owner && owner.size === 1 ? gradientOf([...owner][0]) : null;
    let want: EvLineType;
    if (g) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      want = Math.abs((dx * g.gx + dy * g.gy) / len) < EAVE_MAX_COS ? "EAVE" : "RAKE";
    } else {
      // No single owning facet, so there is no gradient to compare against —
      // but the question is the same one, and it must be asked the same way.
      // It used to be |Δz| ≤ 0.75 ft, an absolute drop with no reference to the
      // edge's RUN, which is only a levelness test on an edge of one particular
      // length. Measured on the saved models: a 1.2 ft edge dropping 0.48 ft —
      // slope 0.44, a 24° climb — passed as an EAVE, while the branch above
      // would have called it a RAKE at a tenth of that.
      //
      // So the fallback compares the edge's own SLOPE against the same
      // discriminator EAVE_MAX_COS applies when a facet is known: half the
      // roof's gradient. On a 6/12 roof that is 0.25, and the two branches
      // agree instead of contradicting each other. No new constant: the
      // threshold is the roof's own pitch.
      const dx = b.x - a.x, dy = b.y - a.y;
      const run = Math.hypot(dx, dy);
      if (run < 1e-6) continue;
      const refGrad = Math.abs(Number(model.totals?.predominantPitch)) / 12 || 0.5;
      const maxDrop = Math.max(EAVE_LEVEL_FLOOR_FT, EAVE_MAX_COS * refGrad * run);
      want = Math.abs(a.z - b.z) <= maxDrop ? "EAVE" : "RAKE";
    }
    if (l.type !== want) {
      if (want === "EAVE") reclassified.eave++;
      else reclassified.rake++;
      l.type = want;
    }
  }
  for (const l of perimeter) {
    const a = pointsById.get(l.aId);
    const b = pointsById.get(l.bId);
    if (a && b) perimeterFtAfter[l.type] = (perimeterFtAfter[l.type] ?? 0) + dist3(a, b);
  }
  return { perimeterLines: perimeter.length, gatedLines, reclassified, perimeterFtBefore, perimeterFtAfter };
}

// ── kept pitch set, fidelity and post-planarize totals ───────────────────────

/** The 2–3 dominant facet pitches (area-ranked, noise share dropped), with
 *  Instant's predominant prepended when missing — calibrate's kept set. Also
 *  handed to synthesis (spec §6.4) so its labels quantise onto the SAME values
 *  the repair candidates snap to. */
function keptPitchSet(faces: RoofFace[], instantPitch: number | null): number[] {
  const areaByPitch = new Map<number, number>();
  let totalArea = 0;
  for (const f of faces) {
    const key = Math.round(f.pitch);
    areaByPitch.set(key, (areaByPitch.get(key) ?? 0) + f.areaSqft);
    totalArea += f.areaSqft;
  }
  const ranked = [...areaByPitch.entries()].sort((a, b) => b[1] - a[1]);
  let kept = ranked
    .filter(([, a], i) => i === 0 || a >= PITCH_MIN_SHARE * (totalArea || 1))
    .slice(0, PITCH_MAX_KEPT)
    .map(([p]) => p);
  if (instantPitch != null && !kept.includes(instantPitch)) kept = [instantPitch, ...kept];
  return kept;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** The line types fidelity's footage term compares: drip edge + creases. */
const FIDELITY_TYPES: readonly EvLineType[] = ["EAVE", "RIDGE", "VALLEY", "HIP", "RAKE"];

/**
 * FIDELITY 0–100 (selection gate): how faithful a candidate is to the measured
 * evidence, complementing the validator's physical-soundness score.
 *   facetAgreement   = 100·clamp01(1 − |facets − instantFacets| / max(4, instantFacets))
 *   footageAgreement = 100·clamp01(1 − relRMS over EAVE/RIDGE/VALLEY/HIP/RAKE
 *                      vs the refined repair, rel = |a−b| / max(a, b, 10))
 *   fidelity         = 0.5·facetAgreement + 0.5·footageAgreement
 */
function fidelityOf(
  candidate: RoofModel,
  instantFacets: number,
  referenceFootage: Record<EvLineType, number>,
): { fidelity: number; facetAgreement: number; footageAgreement: number } {
  const facetAgreement =
    100 * clamp01(1 - Math.abs(candidate.totals.facetCount - instantFacets) / Math.max(4, instantFacets));
  let sum = 0;
  for (const t of FIDELITY_TYPES) {
    const a = candidate.totals.footageByType[t];
    const b = referenceFootage[t];
    const rel = Math.abs(a - b) / Math.max(a, b, 10);
    sum += rel * rel;
  }
  const footageAgreement = 100 * clamp01(1 - Math.sqrt(sum / FIDELITY_TYPES.length));
  return { fidelity: 0.5 * facetAgreement + 0.5 * footageAgreement, facetAgreement, footageAgreement };
}

/** A candidate whose per-type footage diverges this badly from the repair
 *  evidence may not ship while a faithful candidate exists — a beautiful but
 *  coarse synthesis must not beat an honest drawing on looks alone. */
const FOOTAGE_AGREEMENT_FLOOR = 40;

/** The composition may trail the best whole-lot candidate by this much gate
 *  metric and still ship: the yardstick (refined footage at the refined
 *  candidate's WHOLE-LOT k) is inherently biased against a composition whose
 *  figures carry honest per-structure k, and the composition carries strictly
 *  more information (independent per-structure gating and scale). A
 *  double-roofed or otherwise broken composition tanks facet/footage
 *  agreement and loses by far more than this — it still falls back. */
const COMPOSITION_KEEP_MARGIN = 1.0;

/** Eave overhang this house actually shows: the median plan distance from the
 *  repaired model's EAVE endpoints to the wall outline, clamped to the
 *  code-plausible 0.5–3 ft band (default 1.5 when there is no evidence). */
function measuredOverhangFt(model: RoofModel, rings: P2[][]): number {
  const pts = new Map(model.points.map((p) => [p.id, p]));
  const ds: number[] = [];
  for (const l of model.lines) {
    if (l.type !== "EAVE") continue;
    for (const id of [l.aId, l.bId]) {
      const p = pts.get(id);
      if (!p) continue;
      const d = nearestOnRings(p, rings).d;
      if (Number.isFinite(d) && d <= 6) ds.push(d);
    }
  }
  if (ds.length < 4) return 1.5;
  ds.sort((a, b) => a - b);
  const median = ds[Math.floor(ds.length / 2)];
  return Math.min(3, Math.max(0.5, median));
}

/** Offset a CCW simple ring OUTWARD by `d` feet: each edge line moves along
 *  its outward normal, consecutive offset lines re-intersect; a near-parallel
 *  or runaway intersection (shift > 4·d from the original vertex) falls back
 *  to the vertex translated along its angle-bisector normal — never a spike. */
function offsetRingOutward(ring: P2[], d: number): P2[] {
  const n = ring.length;
  if (n < 3 || !(d > 0)) return ring.map((p) => ({ ...p }));
  // CCW interior is to the LEFT of each edge, so outward = right normal.
  const area = ring.reduce((s, p, i) => {
    const q = ring[(i + 1) % n];
    return s + (p.x * q.y - q.x * p.y);
  }, 0);
  const sign = area >= 0 ? 1 : -1; // flip normals for a CW ring
  const lines: Array<{ px: number; py: number; dx: number; dy: number }> = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    const nx = (sign * dy) / len, ny = (sign * -dx) / len; // outward normal
    lines.push({ px: a.x + nx * d, py: a.y + ny * d, dx: dx / len, dy: dy / len });
  }
  const m = lines.length;
  if (m < 3) return ring.map((p) => ({ ...p }));
  const out: P2[] = [];
  for (let i = 0; i < m; i++) {
    const A = lines[(i - 1 + m) % m];
    const B = lines[i];
    const orig = ring[i % n];
    const det = A.dx * B.dy - A.dy * B.dx;
    let v: P2 | null = null;
    if (Math.abs(det) > 1e-9) {
      const t = ((B.px - A.px) * B.dy - (B.py - A.py) * B.dx) / det;
      v = { x: A.px + A.dx * t, y: A.py + A.dy * t };
      if (Math.hypot(v.x - orig.x, v.y - orig.y) > 4 * d) v = null;
    }
    if (!v) {
      // Bisector fallback: average of the two edges' outward normals.
      const nx = (A.dy + B.dy) * sign, ny = -(A.dx + B.dx) * sign;
      const len = Math.hypot(nx, ny) || 1;
      v = { x: orig.x + (nx / len) * d, y: orig.y + (ny / len) * d };
    }
    out.push(v);
  }
  return out;
}

/** Gate metric (spec §4 + §6.5): soundness × faithfulness. */
const gateMetricOf = (validatorScore: number, fidelity: number): number =>
  0.6 * validatorScore + 0.4 * fidelity;

/**
 * Recompute totals from the SURVIVING geometry after planarization removed
 * some of it (spec §5 P3 exclusions, trimmed/clipped pieces), so the persisted
 * figures match the drawing. face.areaSqft and line.lengthFt already carry k
 * and are summed as they stand — k is never applied twice.
 */
function retotalFromGeometry(model: RoofModel): void {
  const pointsById = new Map(model.points.map((p) => [p.id, p]));
  const areaSqft = model.faces.reduce((s, f) => s + f.areaSqft, 0);
  model.totals.areaSqft = areaSqft;
  model.totals.squares = areaSqft / 100;
  model.totals.facetCount = model.faces.length;
  model.totals.footageByType = footageByType(model.lines, pointsById, footageExemptIds(model));
  model.totals.bounds = boundsOf(model.points);
}

/**
 * Planarize (spec §5) and, when the invariants actually removed geometry (a
 * facet excluded, or line footage lost to trimming/clipping), retotal from
 * what survived. A pure split preserves footage exactly (proportional
 * lengthFt), so untouched models keep their calibrated totals bit-for-bit.
 * `overhangFt` — the eave overhang measured on THIS house — widens P2's clip
 * tolerance so the deliberate overhang offset (clamped to 3 ft) is never
 * clipped back by the 2.5 ft default. `clip` — the accepted vision roof-edge
 * ring: P2 then clips to IT with its tight tolerance instead of the wall
 * rings + overhang band (P4 hole measurement stays on `outlines`).
 */
function planarizeForShip(
  model: RoofModel,
  outlines?: P2[][],
  overhangFt?: number,
  clip?: { outlines: P2[][]; toleranceFt: number },
): { model: RoofModel; report: PlanarizeReport } {
  const before = model.lines.reduce((s, l) => s + l.lengthFt, 0);
  const pl = planarizeModel(model, {
    ...(outlines?.length ? { outlines } : {}),
    ...(overhangFt != null ? { overhangFt } : {}),
    ...(clip ? { clip } : {}),
  });
  const after = pl.model.lines.reduce((s, l) => s + l.lengthFt, 0);
  if (pl.report.facetsExcluded > 0 || Math.abs(after - before) > 0.05) retotalFromGeometry(pl.model);
  return pl;
}

// ── per-structure gate: split, re-prefix, compose (multi-ring lots) ──────────

/** Even-odd point-in-polygon test over a plan ring. */
function pointInRing(pt: P2, ring: P2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Cut a FINISHED candidate into shared-nothing per-structure sub-models, one
 * per gate GROUP (`groups` — a partition of ring indexes from straddlerGroups;
 * default: one group per ring). Every face (and penetration) is assigned to a
 * group by its plan centroid — the ring containing it, else the nearest ring
 * boundary; its lines follow it (a line referenced from two groups — which
 * detached structures should never produce — is duplicated so both sub-rings
 * stay closable; composeStructures dedupes the coincident copies when both
 * ship). Lines owned by no face (flashing runs) follow their midpoints, so
 * wall-flashing footage survives the composition. Sub-model totals are
 * recomputed from the sub-geometry; a group that received no faces yields null.
 */
function splitByStructure(model: RoofModel, rings: P2[][], groups?: number[][]): Array<RoofModel | null> {
  const pointsById = new Map(model.points.map((p) => [p.id, p]));
  const linesById = new Map(model.lines.map((l) => [l.id, l]));
  const ringGroups = groups ?? rings.map((_, i) => [i]);
  const groupOfRing: number[] = [];
  ringGroups.forEach((g, gi) => {
    for (const ri of g) groupOfRing[ri] = gi;
  });
  const ringIndexOf = (p: P2): number => {
    for (let i = 0; i < rings.length; i++) if (pointInRing(p, rings[i])) return i;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < rings.length; i++) {
      const d = nearestOnRing(p, rings[i]).d;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };
  const centroidOf = (lineIds: string[]): P2 | null => {
    const seen = new Set<string>();
    let sx = 0;
    let sy = 0;
    for (const id of lineIds) {
      const l = linesById.get(id);
      if (!l) continue;
      for (const pid of [l.aId, l.bId]) {
        if (seen.has(pid)) continue;
        const p = pointsById.get(pid);
        if (!p) continue;
        seen.add(pid);
        sx += p.x;
        sy += p.y;
      }
    }
    return seen.size ? { x: sx / seen.size, y: sy / seen.size } : null;
  };
  const groupIndexOf = (p: P2): number => groupOfRing[ringIndexOf(p)] ?? 0;
  const faceGroup = new Map<string, number>();
  const lineGroups = new Map<string, Set<number>>();
  const claim = (lineId: string, gi: number): void => {
    const s = lineGroups.get(lineId) ?? new Set<number>();
    s.add(gi);
    lineGroups.set(lineId, s);
  };
  for (const list of [model.faces, model.penetrations]) {
    for (const f of list) {
      const c = centroidOf(f.lineIds);
      const gi = c ? groupIndexOf(c) : 0;
      faceGroup.set(f.id, gi);
      for (const id of f.lineIds) claim(id, gi);
    }
  }
  for (const l of model.lines) {
    if (lineGroups.has(l.id)) continue;
    const a = pointsById.get(l.aId);
    const b = pointsById.get(l.bId);
    if (!a || !b) continue;
    claim(l.id, groupIndexOf({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }));
  }
  return ringGroups.map((_, gi) => {
    const faces = model.faces.filter((f) => faceGroup.get(f.id) === gi);
    if (faces.length === 0) return null;
    const lines = model.lines.filter((l) => lineGroups.get(l.id)?.has(gi));
    const keepPts = new Set(lines.flatMap((l) => [l.aId, l.bId]));
    const sub: RoofModel = {
      ...model,
      provenance: model.provenance ? { ...model.provenance } : undefined,
      location: { ...model.location },
      points: model.points.filter((p) => keepPts.has(p.id)).map((p) => ({ ...p })),
      lines: lines.map((l) => ({ ...l })),
      faces: faces.map((f) => ({ ...f, lineIds: [...f.lineIds] })),
      penetrations: model.penetrations
        .filter((f) => faceGroup.get(f.id) === gi)
        .map((f) => ({ ...f, lineIds: [...f.lineIds] })),
      totals: {
        ...model.totals,
        footageByType: { ...model.totals.footageByType },
        bounds: { ...model.totals.bounds },
      },
    };
    retotalFromGeometry(sub);
    return sub;
  });
}

/** A facet counts as STRADDLING two rings when at least this share of its
 *  plan samples (ring vertices + edge midpoints + interior grid) falls in
 *  each. 0.05, not 0.2: grouping two rings is CHEAP — it only reduces gate
 *  granularity — while a sub-threshold straddler is roofed twice (assigned
 *  wholly by centroid, the second ring's independent winner grows over the
 *  overlap again), so the union errs toward grouping. */
const STRADDLE_MIN_SHARE = 0.05;

/**
 * Union-find the outline rings into gate GROUPS: rings that share a straddling
 * facet in ANY candidate must be gated together on one candidate — otherwise
 * the facet is assigned wholly by centroid while the other ring's independent
 * winner roofs the same plan area a second time. Samples each facet's ring
 * vertices and edge midpoints PLUS a coarse interior grid clipped to the ring
 * — boundary-only sampling tracks PERIMETER share, so a long thin straddler
 * reaching deep into a second ring under-counted its true area share (line
 * endpoints remain the fallback when the ring cannot be chained); samples
 * outside every ring (eave overhang corners) are ignored. Returns a partition
 * of ring indexes, each group sorted ascending, groups ordered by first ring.
 */
function straddlerGroups(models: RoofModel[], rings: P2[][]): number[][] {
  const parent = rings.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    parent[i] = r;
    return r;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (const m of models) {
    const pointsById = new Map(m.points.map((p) => [p.id, p]));
    const linesById = new Map(m.lines.map((l) => [l.id, l]));
    for (const f of m.faces) {
      const ring = ringOf(f.lineIds, linesById, pointsById);
      const samples: P2[] = [];
      if (ring) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i];
          const b = ring[(i + 1) % ring.length];
          samples.push({ x: a.x, y: a.y }, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        }
        // Interior grid (see the doc comment): share must track AREA.
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const p of ring) {
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y);
          maxY = Math.max(maxY, p.y);
        }
        const plan: P2[] = ring.map((p) => ({ x: p.x, y: p.y }));
        const step = Math.max(2, Math.max(maxX - minX, maxY - minY) / 12);
        for (let x = minX + step / 2; x < maxX; x += step) {
          for (let y = minY + step / 2; y < maxY; y += step) {
            if (pointInRing({ x, y }, plan)) samples.push({ x, y });
          }
        }
      } else {
        const seen = new Set<string>();
        for (const id of f.lineIds) {
          const l = linesById.get(id);
          if (!l) continue;
          for (const pid of [l.aId, l.bId]) {
            if (seen.has(pid)) continue;
            seen.add(pid);
            const p = pointsById.get(pid);
            if (p) samples.push({ x: p.x, y: p.y });
          }
        }
      }
      const counts = rings.map(() => 0);
      let inAny = 0;
      for (const p of samples) {
        for (let ri = 0; ri < rings.length; ri++) {
          if (pointInRing(p, rings[ri])) {
            counts[ri]++;
            inAny++;
            break;
          }
        }
      }
      if (inAny < 2) continue;
      const touched: number[] = [];
      for (let ri = 0; ri < rings.length; ri++) {
        if (counts[ri] > 0 && counts[ri] / inAny >= STRADDLE_MIN_SHARE) touched.push(ri);
      }
      for (let i = 1; i < touched.length; i++) union(touched[0], touched[i]);
    }
  }
  const byRoot = new Map<number, number[]>();
  for (let i = 0; i < rings.length; i++) {
    const r = find(i);
    const g = byRoot.get(r) ?? [];
    g.push(i);
    byRoot.set(r, g);
  }
  return [...byRoot.values()]
    .map((g) => g.sort((a, b) => a - b))
    .sort((a, b) => a[0] - b[0]);
}

/**
 * Refit ONE structure's sub-model figures against ITS Instant areaSqft (the
 * whole-lot candidates carry a k fit on the ENTIRE lot, which misprices a
 * structure whose recon error differs from the lot's). The adjustment rides on
 * the printed figures only, exactly like k itself: areas × adj², lengths ×
 * adj, points untouched; the resulting EFFECTIVE k is clamped to the same
 * ±15% band. Mutates `sub` and retotals it. Returns the effective k the sub's
 * figures now carry (the lot k unchanged when the structure has no Instant
 * area to fit against).
 */
function rescaleSubToStructure(sub: RoofModel, structAreaSqft: number | null, lotK: number): number {
  if (structAreaSqft == null || !(structAreaSqft > 0)) return lotK;
  if (!(sub.totals.areaSqft > 0) || !(lotK > 0)) return lotK;
  const geomArea = sub.totals.areaSqft / (lotK * lotK);
  const kEff = Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.sqrt(structAreaSqft / geomArea)));
  const adj = kEff / lotK;
  if (Math.abs(adj - 1) < 1e-9) return kEff;
  const adj2 = adj * adj;
  for (const f of sub.faces) f.areaSqft *= adj2;
  for (const f of sub.penetrations) f.areaSqft *= adj2;
  for (const l of sub.lines) l.lengthFt *= adj;
  retotalFromGeometry(sub);
  return kEff;
}

/** "s2:" + id, NESTING any existing structure prefix rather than stripping it
 *  ("P4" → "s2:P4"; "s2:P4" stays "s2:P4"; "s0:P4" → "s2:s0:P4"). Stripping a
 *  foreign s{j}: prefix used to collide with the target ring's native ids —
 *  per-structure id counters restart, so s0:P4 and s1:P4 both exist — nesting
 *  keeps ids unique by construction. Every other namespace (graft "g{n}:",
 *  planarize "pz:") is preserved under the structure prefix as before. */
function rePrefixId(id: string, pfx: string): string {
  return id.startsWith(pfx) ? id : pfx + id;
}

/** Two endpoints this close in plan are the same welded location — the
 *  coincidence test for the compose-time duplicate-line dedupe. */
const COINCIDE_FT = 0.05;

/**
 * Concatenate the per-structure winner sub-models into one model on `shell`'s
 * metadata, re-prefixing every id with its group's "s{i}:" (NESTED over any
 * foreign prefix — see rePrefixId — so every id from part i starts with
 * "s{i}:" and ids stay unique across parts by construction) so the
 * validator's per-structure footprint chaining sees each structure on its
 * own. A line splitByStructure duplicated into two shipping parts of the SAME
 * candidate (`tag`) is deduped here: when both copies are coincident the
 * second is dropped and its endpoints are welded onto the kept copy's points
 * — otherwise FLASHING/STEPFLASH/OTHER footage (exempt from the collinear
 * dedupe) would print at 2× and the line would draw twice. When two groups
 * ship DIFFERENT candidates that id-keyed dedupe cannot see the copies, so a
 * second, GEOMETRY-keyed pass then dedupes the exempt types across structure
 * prefixes: longest first, a same-type copy from another prefix lying inside
 * a tightened perpendicular band along the kept run (nearCoincidentRun) is
 * dropped — endpoints welded onto the kept copy when they pair within
 * COMPOSE_DUP_END_FT, an unreferenced copy simply removed, and a
 * face-referenced copy whose endpoints do not pair is KEPT (footage must
 * never break a ring). Id uniqueness is
 * ASSERTED at the end — a violation throws (the caller falls back to the
 * whole-lot winner) rather than shipping corrupt geometry. Designators are
 * re-lettered area-ascending (A1..A9, B1.., as synthesis does) so labels
 * don't repeat across structures. Totals are stale by construction — the
 * caller retotals once. Exported for the compose harness (multi-ring smoke).
 */
export function composeStructures(
  parts: Array<{ ringIndex: number; tag: string; model: RoofModel }>,
  shell: RoofModel,
): RoofModel {
  const out = cloneModel(shell);
  out.points = [];
  out.lines = [];
  out.faces = [];
  out.penetrations = [];
  interface KeptLine {
    newId: string;
    aId: string;
    bId: string;
    a: P2;
    b: P2;
  }
  /** First composed copy per (source candidate, pre-split line id). */
  const bySource = new Map<string, KeptLine>();
  const lineAlias = new Map<string, string>();
  const pointAlias = new Map<string, string>();
  for (const { ringIndex, tag, model } of parts) {
    const pfx = `s${ringIndex}:`;
    const pointsById = new Map(model.points.map((p) => [p.id, p]));
    for (const p of model.points) out.points.push({ ...p, id: rePrefixId(p.id, pfx) });
    for (const l of model.lines) {
      const newId = rePrefixId(l.id, pfx);
      const aId = rePrefixId(l.aId, pfx);
      const bId = rePrefixId(l.bId, pfx);
      const a = pointsById.get(l.aId);
      const b = pointsById.get(l.bId);
      const srcKey = `${tag}\u0000${l.id}`;
      const kept = bySource.get(srcKey);
      if (kept && a && b) {
        const same = dist2(a, kept.a) <= COINCIDE_FT && dist2(b, kept.b) <= COINCIDE_FT;
        const crossed = !same && dist2(a, kept.b) <= COINCIDE_FT && dist2(b, kept.a) <= COINCIDE_FT;
        if (same || crossed) {
          lineAlias.set(newId, kept.newId);
          pointAlias.set(aId, same ? kept.aId : kept.bId);
          pointAlias.set(bId, same ? kept.bId : kept.aId);
          continue;
        }
      }
      out.lines.push({ ...l, id: newId, aId, bId });
      if (!kept && a && b) {
        bySource.set(srcKey, { newId, aId, bId, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } });
      }
    }
    for (const list of ["faces", "penetrations"] as const) {
      for (const f of model[list]) {
        out[list].push({
          ...f,
          id: rePrefixId(f.id, pfx),
          lineIds: f.lineIds.map((id) => rePrefixId(id, pfx)),
        });
      }
    }
  }
  if (pointAlias.size) {
    for (const l of out.lines) {
      l.aId = pointAlias.get(l.aId) ?? l.aId;
      l.bId = pointAlias.get(l.bId) ?? l.bId;
    }
    out.points = out.points.filter((p) => !pointAlias.has(p.id));
  }
  if (lineAlias.size) {
    for (const list of ["faces", "penetrations"] as const) {
      for (const f of out[list]) f.lineIds = f.lineIds.map((id) => lineAlias.get(id) ?? id);
    }
  }
  // ── cross-candidate exempt dedupe (see the doc comment) ──
  const exempt = out.lines
    .filter((l) => FOOTAGE_EXEMPT_TYPES.has(l.type))
    .sort((p, q) => q.lengthFt - p.lengthFt);
  if (exempt.length > 1) {
    const ptById = new Map(out.points.map((p) => [p.id, p]));
    const referenced = new Set<string>();
    for (const list of ["faces", "penetrations"] as const) {
      for (const f of out[list]) for (const id of f.lineIds) referenced.add(id);
    }
    const pfxOf = (id: string): string => /^s\d+:/.exec(id)?.[0] ?? "";
    interface KeptRun {
      id: string;
      aId: string;
      bId: string;
      a: P2;
      b: P2;
      pfx: string;
      type: EvLineType;
    }
    const keptRuns: KeptRun[] = [];
    const dupLine = new Map<string, string>();
    const dupPoint = new Map<string, string>();
    const dropOnly = new Set<string>();
    for (const l of exempt) {
      const a = ptById.get(l.aId);
      const b = ptById.get(l.bId);
      if (!a || !b) continue;
      const pfx = pfxOf(l.id);
      const seg: Seg = { ax: a.x, ay: a.y, bx: b.x, by: b.y };
      const twin = keptRuns.find(
        (k) =>
          k.type === l.type &&
          k.pfx !== pfx &&
          nearCoincidentRun(seg, { ax: k.a.x, ay: k.a.y, bx: k.b.x, by: k.b.y }),
      );
      if (!twin) {
        keptRuns.push({
          id: l.id,
          aId: l.aId,
          bId: l.bId,
          a: { x: a.x, y: a.y },
          b: { x: b.x, y: b.y },
          pfx,
          type: l.type,
        });
        continue;
      }
      const same = dist2(a, twin.a) <= COMPOSE_DUP_END_FT && dist2(b, twin.b) <= COMPOSE_DUP_END_FT;
      const crossed =
        !same && dist2(a, twin.b) <= COMPOSE_DUP_END_FT && dist2(b, twin.a) <= COMPOSE_DUP_END_FT;
      if (same || crossed) {
        dupLine.set(l.id, twin.id);
        const aTo = same ? twin.aId : twin.bId;
        const bTo = same ? twin.bId : twin.aId;
        if (l.aId !== aTo) dupPoint.set(l.aId, aTo);
        if (l.bId !== bTo) dupPoint.set(l.bId, bTo);
      } else if (!referenced.has(l.id)) {
        dropOnly.add(l.id);
      }
    }
    if (dupLine.size || dropOnly.size) {
      const resolvePt = (id: string): string => {
        let cur = id;
        const seen = new Set<string>();
        while (dupPoint.has(cur) && !seen.has(cur)) {
          seen.add(cur);
          cur = dupPoint.get(cur) as string;
        }
        return cur;
      };
      out.lines = out.lines.filter((l) => !dupLine.has(l.id) && !dropOnly.has(l.id));
      for (const l of out.lines) {
        l.aId = resolvePt(l.aId);
        l.bId = resolvePt(l.bId);
      }
      const usedPts = new Set<string>();
      for (const l of out.lines) {
        usedPts.add(l.aId);
        usedPts.add(l.bId);
      }
      out.points = out.points.filter((p) => usedPts.has(p.id));
      for (const list of ["faces", "penetrations"] as const) {
        for (const f of out[list]) f.lineIds = f.lineIds.map((id) => dupLine.get(id) ?? id);
      }
    }
  }
  const seenIds = new Set<string>();
  for (const id of [
    ...out.points.map((p) => p.id),
    ...out.lines.map((l) => l.id),
    ...out.faces.map((f) => f.id),
    ...out.penetrations.map((f) => f.id),
  ]) {
    if (seenIds.has(id)) throw new Error(`composeStructures: duplicate id "${id}"`);
    seenIds.add(id);
  }
  const order = out.faces.map((_, i) => i).sort((a, b) => out.faces[a].areaSqft - out.faces[b].areaSqft);
  order.forEach((faceIdx, rank) => {
    out.faces[faceIdx].designator = `${String.fromCharCode(65 + Math.floor(rank / 9))}${(rank % 9) + 1}`;
  });
  return out;
}

// ── the calibration tail: reclassify → pitch → figures ───────────────────────

interface FinishContext {
  /** Aligned Instant outline rings in the frame (empty when none). */
  rings: P2[][];
  hasOutline: boolean;
  instantArea: number | null;
  instantPitch: number | null;
  /** Synthesized models are born classified (spec §6.5): skip eave/rake
   *  reclassification and pitch quantisation, apply the k-figures step only. */
  preclassified?: boolean;
  /** Graft report of a grafted synthesized candidate: its `hostAttribution`
   *  entries tell the finisher to subtract each overlay's plan footprint from
   *  its HOST face's ring-derived area (the host ring is deliberately not
   *  re-cut by graft), so the dormer is not counted twice and k is fit
   *  against an honest denominator. */
  graft?: GraftReport;
}

/** Everything the tail measured, for the report/notes of whichever candidate wins. */
interface FinishResult {
  model: RoofModel;
  scaleK: number;
  reconAreaSqft: number;
  pitchesKept: number[];
  reclassified: { eave: number; rake: number };
  predominantPitchForced: boolean;
  degenerateLines: number;
  perimeterLines: number;
  gatedLines: number;
  perimeterFtBefore: Record<string, number>;
  perimeterFtAfter: Record<string, number>;
}

/**
 * The pipeline AFTER geometry surgery (rectify + refine): weld out degenerate
 * lines, reclassify the perimeter, quantise pitches, then measure figures and
 * apply k — exactly once. Factored out of calibrateModel so the validation
 * gate can run it on both the refined and the pre-refine candidate and ship
 * whichever scores higher. Mutates and returns `model`; every index and the
 * perimeter itself are rebuilt HERE because refine renumbers and removes
 * lines and faces.
 */
function finishCalibration(model: RoofModel, ctx: FinishContext): FinishResult {
  const { rings, hasOutline, instantArea, instantPitch } = ctx;
  const degenerateLines = dropDegenerateLines(model);

  // ── reclassify perimeter edges (shared helper — the synthesis evidence
  // clone gets the identical pass). Synthesized candidates are born classified
  // (§6.5): only measure their perimeter, change nothing. ──
  const rc = reclassifyPerimeter(model, rings, hasOutline, { apply: !ctx.preclassified });
  const pointsById = new Map(model.points.map((p) => [p.id, p]));
  const linesById = new Map(model.lines.map((l) => [l.id, l]));

  // ── pitch quantisation ──
  // Synthesized candidates arrive with labels already quantised to the recon's
  // kept set (§6.4) — leave them untouched.
  let predominantPitchForced = false;
  if (!ctx.preclassified) {
    const kept = keptPitchSet(model.faces, instantPitch);

    const originalPitch = new Map(model.faces.map((f) => [f.id, f.pitch]));
    const snapTo = (pitch: number): number => {
      let best = kept[0];
      let bestD = Infinity;
      for (const k of kept) {
        const d = Math.abs(pitch - k);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      return best;
    };
    for (const f of model.faces) f.pitch = snapTo(f.pitch);

    // Forced = the forcing branch actually moved at least one facet; agreeing
    // with EagleView out of the box is not surgery.
    if (instantPitch != null && areaMode(model.faces) !== instantPitch) {
      // The quantised mode disagrees with EagleView. Pull over every facet whose
      // MEASURED pitch was within the window — 9.6 and 11.2 are 10/12 read
      // through DSM noise; a 4/12 porch is not.
      for (const f of model.faces) {
        const orig = originalPitch.get(f.id) ?? f.pitch;
        if (Math.abs(orig - instantPitch) <= PITCH_FORCE_WINDOW && f.pitch !== instantPitch) {
          f.pitch = instantPitch;
          predominantPitchForced = true;
        }
      }
    }
  }
  const predominantPitch = instantPitch ?? areaMode(model.faces);
  const pitchesKept = [...new Set(model.faces.map((f) => f.pitch))].sort((a, b) => a - b);

  // ── geometric areas → reported figures ──
  // Slope area from the plan polygon (shoelace over the ring, post-refine)
  // times the pitch factor √(1+(p/12)²). Faces whose ring cannot be assembled
  // keep the recon's figure so the sum stays honest. The points never move: k
  // rides on the printed numbers only (area × k², length × k).
  const faceRing = (f: RoofFace) => ringOf(f.lineIds, linesById, pointsById);
  // Graft host deduction (file header GRAFT): a host's ring still CONTAINS its
  // grafted overlays' footprints, so its ring-derived area alone would count
  // each dormer twice (once here, once through the overlay face). Subtract the
  // overlay's plan area × the host's CURRENT pitch factor (labels are final by
  // this point; grafted candidates are preclassified, so graft-time and
  // finish-time factors agree), floored at 1 sqft. The deduction lives INSIDE
  // the pure geometricArea so reconAreaSqft (k's denominator) and the printed
  // figure agree, and re-running the finisher never subtracts twice.
  const hostDeductionSqft = new Map<string, number>();
  if (ctx.graft?.hostAttribution) {
    const facesById = new Map(model.faces.map((f) => [f.id, f]));
    for (const att of ctx.graft.hostAttribution) {
      const host = facesById.get(att.hostFaceId);
      if (!host) continue;
      const prior = hostDeductionSqft.get(att.hostFaceId) ?? 0;
      hostDeductionSqft.set(att.hostFaceId, prior + att.planSqft * pitchFactor(host.pitch));
    }
  }
  const geometricArea = (f: RoofFace): number => {
    const ring = faceRing(f);
    if (!ring) return f.areaSqft; // recon figure — already carries graft's own transfer
    const raw = planArea(ring) * pitchFactor(f.pitch);
    const deduction = hostDeductionSqft.get(f.id);
    return deduction ? Math.max(1, raw - deduction) : raw;
  };
  const reconAreaSqft = model.faces.reduce((s, f) => s + geometricArea(f), 0);

  let scaleK = 1;
  if (instantArea != null && reconAreaSqft > 0) {
    scaleK = Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.sqrt(instantArea / reconAreaSqft)));
  }
  const k2 = scaleK * scaleK;

  for (const f of model.faces) f.areaSqft = geometricArea(f) * k2;
  for (const f of model.penetrations) {
    const ring = faceRing(f);
    if (ring) f.areaSqft = planArea(ring) * pitchFactor(f.pitch) * k2;
  }
  for (const l of model.lines) {
    const a = pointsById.get(l.aId);
    const b = pointsById.get(l.bId);
    if (a && b) l.lengthFt = dist3(a, b) * scaleK;
  }

  const areaSqft = model.faces.reduce((s, f) => s + f.areaSqft, 0);
  model.totals = {
    areaSqft,
    squares: areaSqft / 100,
    facetCount: model.faces.length,
    predominantPitch,
    footageByType: footageByType(model.lines, pointsById, footageExemptIds(model)),
    bounds: boundsOf(model.points),
  };

  return {
    model,
    scaleK,
    reconAreaSqft,
    pitchesKept,
    reclassified: rc.reclassified,
    predominantPitchForced,
    degenerateLines,
    perimeterLines: rc.perimeterLines,
    gatedLines: rc.gatedLines,
    perimeterFtBefore: rc.perimeterFtBefore,
    perimeterFtAfter: rc.perimeterFtAfter,
  };
}

// ── public API ────────────────────────────────────────────────────────────────

/** The outline of the largest structure that has one (Instant returns every
 *  building on the parcel; the house is the one with the most roof). */
export function pickOutline(instant: InstantRoofData): LatLng[] | null {
  const ranked = instant.structures
    .filter((s) => s.outline && s.outline.length >= 3)
    .sort((a, b) => (b.areaSqft ?? b.footprintSqft ?? 0) - (a.areaSqft ?? a.footprintSqft ?? 0));
  return ranked[0]?.outline ?? null;
}

/** Every usable structure outline, largest first. Instant's totals sum all
 *  structures, so calibration and the footprint drawing use all of them. */
export function pickOutlines(instant: InstantRoofData): LatLng[][] {
  return instant.structures
    .filter((s) => s.outline && s.outline.length >= 3)
    .sort((a, b) => (b.areaSqft ?? b.footprintSqft ?? 0) - (a.areaSqft ?? a.footprintSqft ?? 0))
    .map((s) => s.outline as LatLng[]);
}

/** The Instant structure outlines converted into the raster frame and carried
 *  by a calibration's `outlineTransform` — exactly the rings calibrateModel
 *  aligned. Exposed for the harnesses (spec §6: synthesis needs the aligned
 *  outlines without re-running the whole calibration). */
export function instantOutlineRings(
  instant: InstantRoofData,
  origin: LatLng,
  transform: CalibrationReport["outlineTransform"],
): P2[][] {
  return pickOutlines(instant)
    .map((o) => ringToFrame(origin, o))
    .filter((r) => r.length >= 3)
    .map((ring) => ring.map((p) => applyRigid(transform, p)));
}

/** The Instant wall-outline rings in the RAW pin frame — pickOutlines through
 *  the frame conversion, BEFORE any outline transform. Exactly the wallRings
 *  outlineVision.traceRoofOutline validates against, and the frame its ringFt
 *  comes back in; calibrateModel then lands both in the drawing frame with the
 *  same rigid transform. */
export function instantWallRingsRaw(instant: InstantRoofData, origin: LatLng): P2[][] {
  return pickOutlines(instant)
    .map((o) => ringToFrame(origin, o))
    .filter((r) => r.length >= 3);
}

function locationFromInstant(base: RoofModel["location"], instant: InstantRoofData): RoofModel["location"] {
  return {
    ...base,
    address: base.address ?? instant.address ?? undefined,
    lat: base.lat ?? instant.lat ?? undefined,
    lng: base.lng ?? instant.lng ?? undefined,
  };
}

/** What regularizeReconModel hands back alongside the model itself. */
export interface RegularizedRecon {
  model: RoofModel;
  /** What the refine pass (spec §3) did to the SHIPPED topology: all-zero with
   *  `applied: false` when the gate fell back to the pre-refine geometry. */
  refine: RefineReport & { applied?: boolean };
  /** Refine's counts when the gate discarded its geometry. */
  refineDiscarded?: RefineReport;
  /** Validator verdict on the shipped model, incl. whether the gate fell back. */
  validation: CalibrationValidation;
  /** What planarization (spec §5) did to the shipped model. */
  planarize: PlanarizeReport;
}

/**
 * Regularize a FREE reconstruction (no Instant): rectify the lines onto the
 * house grid, run the refine passes (no outlines to pin against), then
 * recompute every figure from the repaired geometry with k = 1 — lengths as 3D
 * distances, facet areas as plan area × pitch factor, footage with the
 * crease-twin dedupe, fresh bounds. The same validation gate as calibrateModel
 * applies (spec §4): both the refined and the pre-refine (rectified) geometry
 * are finished and scored, and when refine loses, the pre-refine model ships
 * with `validation.gateFellBack` set. The model keeps `source: "synthetic"` so
 * the estimate stamp and the pricing guard hold.
 */
export function regularizeReconModel(recon: RoofModel): RegularizedRecon {
  const { model } = rectifyModel(recon);
  const refined = refineModel(model);
  // Planarize (spec §5) BOTH candidates before validation, like calibrateModel;
  // when planarize excluded geometry, totals are recomputed from what survived.
  const plRefined = planarizeForShip(recomputeFigures(refined.model));
  const plPre = planarizeForShip(recomputeFigures(model));
  const vRefined = validationOf(plRefined.model);
  const vPre = validationOf(plPre.model);
  const gateFellBack = vRefined.score < vPre.score;
  const v = gateFellBack ? vPre : vRefined;
  const winPl = gateFellBack ? plPre : plRefined;
  return {
    model: winPl.model,
    refine: gateFellBack ? { ...zeroRefineReport(), applied: false } : { ...refined.report, applied: true },
    ...(gateFellBack ? { refineDiscarded: refined.report } : {}),
    validation: { ...v, gateFellBack },
    planarize: winPl.report,
  };
}

/** The k = 1 figure recompute behind the free path. Mutates and returns `model`. */
function recomputeFigures(model: RoofModel): RoofModel {
  dropDegenerateLines(model);
  const pointsById = new Map(model.points.map((p) => [p.id, p]));
  const linesById = new Map(model.lines.map((l) => [l.id, l]));
  for (const l of model.lines) {
    const a = pointsById.get(l.aId);
    const b = pointsById.get(l.bId);
    if (a && b) l.lengthFt = dist3(a, b);
  }
  let areaSqft = 0;
  for (const list of [model.faces, model.penetrations]) {
    for (const f of list) {
      const ring = ringOf(f.lineIds, linesById, pointsById);
      if (ring) f.areaSqft = planArea(ring) * pitchFactor(f.pitch);
      if (list === model.faces) areaSqft += f.areaSqft;
    }
  }
  model.totals.areaSqft = areaSqft;
  model.totals.squares = areaSqft / 100;
  model.totals.footageByType = footageByType(model.lines, pointsById, footageExemptIds(model));
  model.totals.bounds = boundsOf(model.points);
  return model;
}

/**
 * Fallback when imagery is unusable: every Instant building outline as a closed
 * ring of EAVE lines at eave height, no facets, and Instant's totals verbatim.
 * The drawing shows the footprints with "facets unavailable"; export still
 * works. Behaves like a calibrated model with an identity outline transform and
 * k = 1: the points are the raw frame conversion (origin at the pin) and every
 * lengthFt is geometric, so the drawing prints them the same way. Without an
 * outline the model is empty apart from the totals.
 */
export function outlineOnlyModel(instant: InstantRoofData, origin: LatLng): RoofModel {
  const rings = pickOutlines(instant)
    .map((o) => ringToFrame(origin, o))
    .filter((r) => r.length >= 3);
  const z = instant.totals.maxEaveFt ?? DEFAULT_EAVE_FT;

  const points: RoofPoint[] = [];
  const lines: RoofLine[] = [];
  for (const ring of rings) {
    const first = points.length;
    ring.forEach((p, i) => points.push({ id: `P${first + i + 1}`, x: p.x, y: p.y, z }));
    ring.forEach((_, i) => {
      const a = points[first + i];
      const b = points[first + ((i + 1) % ring.length)];
      lines.push({ id: `L${lines.length + 1}`, type: "EAVE", aId: a.id, bId: b.id, lengthFt: dist3(a, b) });
    });
  }
  const footage = emptyFootage();
  footage.EAVE = lines.reduce((s, l) => s + l.lengthFt, 0);

  return {
    source: "instant",
    location: locationFromInstant({}, instant),
    northOrientation: 0,
    points,
    lines,
    faces: [],
    penetrations: [],
    totals: {
      areaSqft: instant.totals.areaSqft,
      squares: instant.totals.squares,
      facetCount: instant.totals.facetCount ?? 0,
      predominantPitch: instant.totals.predominantPitch ?? 0,
      footageByType: footage,
      bounds: boundsOf(points),
    },
  };
}

/**
 * Calibrate a reconstructed model against Instant. Never mutates the input.
 * See the file header for the pipeline; the report says what each step did.
 * Order fixed by the drawing-rules audit: rectify (directions) → refine
 * (topology/position) → reclassify + figures (once, k applied once), with the
 * three-way selection gate (spec §6.5) choosing between the synthesized,
 * refined and pre-refine candidates after planarization (spec §5) by the
 * combined metric 0.6·validatorScore + 0.4·fidelity (soundness × faithfulness).
 */
export function calibrateModel(
  input: CalibrateInput,
  opts?: {
    exposeCandidates?: boolean;
    /** Harness hook: per-candidate gate scores and conform verdicts, as
     *  human-readable lines. Never called on the production path. */
    onGateDebug?: (msg: string) => void;
  },
): {
  model: RoofModel;
  report: CalibrationReport;
  notes: CalibrationNotes;
  /** The finished (planarized, retotaled) gate candidates — only when
   *  opts.exposeCandidates is set, for the harnesses' side-by-side tables. */
  candidates?: { refined: RoofModel; rectified: RoofModel; synthesized: RoofModel | null };
} {
  const { instant, origin } = input;
  // IS THIS ACTUALLY ROOF? (roofRegions.ts) The Solar mask is a BUILDING mask:
  // patios, decks and carports come in with the house, and the reconstruction
  // traces facets on them (measured on 12629 NE 100th Pl: a 290 sq ft "wing" at
  // 1/12 whose corners sit 0.5 ft above ground — the back patio slab). Strip
  // them before anything else runs, so no later pass has to defend geometry
  // that is not roof. Vision regions, when the caller supplies them, add the
  // cases height alone cannot judge (a raised deck, a carport).
  const roofOnly = keepOnlyRoof(input.recon, input.roofRegions ? { regions: input.roofRegions } : {});
  const model = cloneModel(roofOnly.model);
  model.source = "instant";
  model.location = locationFromInstant(model.location, instant);

  const instantArea = instant.totals.areaSqft > 0 ? instant.totals.areaSqft : null;
  const ip = instant.totals.predominantPitch;
  const instantPitch = typeof ip === "number" && Number.isFinite(ip) ? ip : null;

  // Degenerate reconstruction: nothing to calibrate, hand it back labelled.
  if (model.faces.length === 0) {
    return {
      model,
      report: {
        scaleK: 1,
        reconAreaSqft: model.totals.areaSqft,
        instantAreaSqft: instantArea,
        pitchesKept: [],
        reclassified: { eave: 0, rake: 0 },
        snappedVertices: 0,
        predominantPitchForced: false,
        outlineTransform: IDENTITY,
      },
      notes: { degenerateLines: 0, perimeterLines: 0, gatedLines: 0, perimeterFtBefore: {}, perimeterFtAfter: {} },
    };
  }

  const pointsById = new Map(model.points.map((p) => [p.id, p]));

  // Perimeter vertices anchor the outline fit. Detection is REPEATED inside
  // finishCalibration on whichever candidate it is given, because refine
  // renumbers and removes lines and faces; this early pass only needs the raw
  // perimeter's positions.
  const { perimeter: anchorPerimeter } = detectPerimeter(model, pointsById);
  const perimeterPointIds = [...new Set(anchorPerimeter.flatMap((l) => [l.aId, l.bId]))];
  const perimeterPoints = perimeterPointIds
    .map((id) => pointsById.get(id))
    .filter((p): p is RoofPoint => !!p);

  // ── 1. outlines → frame, aligned onto the model ──
  // Converted TOGETHER with their structures' facet counts (same ranking and
  // filters as pickOutlines) so the per-structure gate can pair ring i with
  // its Instant facetCount.
  const converted = instant.structures
    .filter((s) => s.outline && s.outline.length >= 3)
    .sort((a, b) => (b.areaSqft ?? b.footprintSqft ?? 0) - (a.areaSqft ?? a.footprintSqft ?? 0))
    .map((s) => ({ ring: ringToFrame(origin, s.outline ?? []), facetCount: s.facetCount, areaSqft: s.areaSqft }))
    .filter((e) => e.ring.length >= 3);
  const rawRings = converted.map((e) => e.ring);
  const ringFacetCounts = converted.map((e) => e.facetCount);
  const outlineTransform = rawRings.length > 0 ? alignOutlines(rawRings, perimeterPoints) : IDENTITY;
  const rings = rawRings.map((ring) => ring.map((p) => applyRigid(outlineTransform, p)));
  const hasOutline = rings.length > 0;

  // ── 1b. vision roof-edge outline (GEOMETRY only — numbers stay Instant-
  // calibrated, k on figures). The accepted AI-traced ring arrives in the RAW
  // pin frame and is landed in the drawing frame with the SAME rigid transform
  // as the wall rings, so the two stay registered. Applied only on single-ring
  // lots this round: the ring was validated against ONE structure's wall ring,
  // and on a multi-ring lot the per-structure gate could let it claim the
  // wrong building — skipped cleanly and noted. Only a structural re-check
  // here; the acceptance gates (IoU, area ratio, wall-vertex distance) already
  // ran in traceRoofOutline against the same wall ring. Rectify/alignment
  // above stays driven by the Instant wall outline — the Procrustes anchor is
  // unchanged. ──
  let visionRing: P2[] | null = null;
  let visionNote: VisionOutlineProvenance | undefined;
  const vo = input.visionOutline;
  if (vo) {
    const detail = {
      source: vo.source,
      iou: vo.iou,
      cornerCount: vo.cornerCount,
      ...(vo.reasons?.length ? { reasons: vo.reasons } : {}),
    };
    const ring = (vo.ringFt ?? []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
    if (!hasOutline) {
      visionNote = { applied: false, ...detail, skippedReason: "no Instant outline to validate against" };
    } else if (rings.length >= 2) {
      visionNote = { applied: false, ...detail, skippedReason: "multi-ring lot — vision outline not applied this round" };
    } else if (ring.length < 4 || ring.length > 20 || ring.length !== (vo.ringFt?.length ?? 0) || planArea(ring) < 100) {
      visionNote = { applied: false, ...detail, skippedReason: "vision ring failed the structural re-check" };
    } else {
      visionRing = ring.map((p) => applyRigid(outlineTransform, { x: p.x, y: p.y }));
      visionNote = { applied: true, ...detail };
    }
  }
  const outlineSource: CalibrationNotes["outlineSource"] = visionRing
    ? "vision"
    : vo && hasOutline
      ? "instant"
      : undefined;
  /** P2 clip override for the SYNTHESIZED candidate only: its outline IS the
   *  ring, so the tight band is a pure safety net. The refined/rectified
   *  candidates must NOT take it — the acceptance gates let the traced ring
   *  cut up to 4 ft off a real bay/jog (outlineVision GATE_WALL_VERTEX_FT),
   *  so clipping their genuine repair geometry to ring + 0.5 ft amputated it
   *  invisibly (finding #2). They keep the wall-ring + max(2.5, overhang+0.5)
   *  clip and get the conform pass (§4b below) instead. */
  const visionClip = visionRing ? { outlines: [visionRing], toleranceFt: VISION_CLIP_TOL_FT } : undefined;
  // A candidate CONFORMED onto the vision ring must also be clipped against
  // that ring (review finding: the wall-ring clip amputates real geometry the
  // trace legitimately follows, e.g. a deep porch eave the wall clip cannot
  // reach). Tolerance = CONFORM_MAX_FT: everything conform may leave near the
  // ring stays; the garage-style wholly-outside referenced components remain
  // protected by P2's referenced-line exemption.
  const conformClip = visionRing ? { outlines: [visionRing], toleranceFt: CONFORM_MAX_FT } : undefined;

  // ── 2. rectify: straighten every line onto the house grid ──
  // Replaces the earlier per-vertex outline snapping, which pulled corners one
  // by one and KINKED every line meeting them (measured on the test house:
  // crooked eave footage rose 14 → 54 ft). Rectification instead gives each
  // near-grid line an exact grid direction (axes within 12°, diagonals within
  // 10°; perimeter edges running along an aligned outline edge are pinned to
  // it) and solves ALL vertex positions together, so lines stay straight while
  // they move. z is untouched.
  // Deliberately WITHOUT outline pinning: measured on the test house, pinning
  // perimeter edges to the Instant outline dragged connected valleys/hips off
  // the grid again (off-grid hip 12 → 56 ft, valley 28 → 67 ft) because the
  // aligned footprint is itself a couple of degrees off the raster grid. The
  // outline's job here is the eave/rake gate below, not geometry.
  const rect = rectifyModel(model, {});
  for (const rp of rect.model.points) {
    const p = pointsById.get(rp.id);
    if (p) {
      p.x = rp.x;
      p.y = rp.y;
    }
  }
  // Reported as CalibrationReport.snappedVertices: how many vertices the grid
  // rectification moved under a direction constraint (outline pinning is off —
  // see the note above — so `pinnedToOutline` would always be 0).
  const snappedVertices = rect.report.constrained;

  // ── 3. refine: topology/position repairs between rectify and reclassification ──
  // The spec §3 passes: T-junction weld, chamfer removal, collinear chain
  // collapse, sliver merge, ridge centering, corner anchoring, micro-line
  // cleanup. refine renumbers and removes lines and faces, so the pipeline
  // CONTINUES ON refined.model — finishCalibration rebuilds every index and
  // the perimeter from whichever model it receives.
  const refined = refineModel(model, { outlines: hasOutline ? rings : undefined });

  // ── 4. three-way selection gate (spec §4 + §6.5) ──
  // Candidates: (a) SYNTHESIZED from the aligned Instant outlines over the
  // refined recon (gable evidence + pitch labels), (b) REFINED, (c) pre-refine
  // RECTIFIED. Each runs the identical tail (the synthesized model skips
  // reclassification and quantisation — it is born classified — but takes the
  // k-figures step identically), is planarized (spec §5) and validated. The
  // highest score ships; synthesis failing never blocks the repair candidates.
  const ctx: FinishContext = { rings, hasOutline, instantArea, instantPitch };
  // Synthesis evidence (§6.3–§6.4): a CLONE of the refined model carrying the
  // same perimeter eave/rake reclassification the repair candidates receive —
  // gable detection needs real RAKEs, not the recon's raw perimeter types —
  // plus calibrate's kept pitch set and Instant's predominant as the forced
  // pitch, so the synthesized labels land on the same values.
  let synthesized: ReturnType<typeof synthesizeRoofModel> = null;
  let graft: GraftReport | undefined;
  /** The eave overhang measured on this house — also handed to every
   *  planarizeForShip so P2's clip tolerance never undoes the offset below. */
  let overhangFt: number | undefined;
  if (hasOutline) {
    const evidence = cloneModel(refined.model);
    reclassifyPerimeter(evidence, rings, hasOutline, { apply: true });
    // The Instant outline is the WALL footprint; the ROOF edge overhangs it
    // (12–24″ typical). Building the skeleton on the wall polygon loses that
    // ring of roof (measured: synthesized eaves 244 ft vs the report's 282),
    // so the rings are offset OUTWARD by the overhang this house actually
    // shows — the median distance from the repaired eaves to the outline.
    const overhang = measuredOverhangFt(evidence, rings);
    overhangFt = overhang;
    // With an accepted vision outline, the vision ring IS the roof edge — the
    // skeleton grows from it directly, no offset guessing. Without one, the
    // wall rings are offset outward by the measured overhang as before.
    synthesized = synthesizeRoofModel({
      outlines: visionRing ? [visionRing] : rings.map((r) => offsetRingOutward(r, overhang)),
      recon: evidence,
      instantPitch,
      keptPitches: keptPitchSet(evidence.faces, instantPitch),
      ...(instantPitch != null ? { forcePitch: instantPitch } : {}),
    });
    // GRAFT (file header): the sub-roofs the skeleton cannot grow are grafted
    // onto the fresh synthesized model from the reclassified refined evidence
    // BEFORE it is finished/planarized/validated; the grafted model REPLACES
    // the synthesized candidate. Graft failing never blocks — the ungrafted
    // synthesis remains and no report is recorded.
    if (synthesized) {
      try {
        // Same quantisation context synthesizeRoofModel got, so graft's
        // pitch-differs test compares like with like (raw evidence labels vs
        // the base's kept-set-snapped labels).
        const g = graftSubRoofs(synthesized.model, evidence, {
          keptPitches: keptPitchSet(evidence.faces, instantPitch),
          forcePitch: instantPitch,
        });
        synthesized = { model: g.model, report: synthesized.report };
        graft = g.report;
      } catch {
        /* graft failing never blocks — the ungrafted synthesis remains */
      }
    }
  }

  interface Candidate {
    pipeline: GatePipeline;
    finish: FinishResult;
    planarize: PlanarizeReport;
    /** True for the synthesized candidate when the graft actually ran — its
     *  validation then excludes overlay faces from the R05 coverage sum. */
    grafted: boolean;
    v: { score: number; errors: number; warns: number };
  }
  const finishAndScore = (
    pipeline: GatePipeline,
    m: RoofModel,
    preclassified: boolean,
    graftRep?: GraftReport,
    /** The model was conformed onto the vision ring — clip P2 against that
     *  ring (+CONFORM_MAX_FT) instead of the wall rings. */
    conformedToRing?: boolean,
  ): Candidate => {
    const finish = finishCalibration(m, {
      ...ctx,
      ...(preclassified ? { preclassified: true } : {}),
      ...(graftRep ? { graft: graftRep } : {}),
    });
    const pl = planarizeForShip(
      finish.model,
      hasOutline ? rings : undefined,
      overhangFt,
      pipeline === "synthesized" ? visionClip : conformedToRing ? conformClip : undefined,
    );
    // Excluded-overlay restitution: finishCalibration deducted each grafted
    // overlay's footprint from its HOST's ring-derived area (file header
    // GRAFT). If planarize then EXCLUDES the overlay face (a P3 weld left it
    // unclosable), the dormer's area would vanish from the totals entirely —
    // the overlay's own figure is gone AND the host still carries the
    // deduction. Add each missing overlay's deduction back onto its surviving
    // host (same terms the finisher subtracted: planSqft × the host's CURRENT
    // pitch factor × k²) and retotal, so the printed total under-counts
    // nothing and stays reconcilable with reconAreaSqft·k².
    // P3 may have SPLIT a pinched facet after the letters were handed out, so a
    // new facet can arrive without one (and the old letters no longer follow
    // area order). Re-rank over what is actually drawn.
    if (pl.model.faces.some((f) => !f.designator)) {
      const order = pl.model.faces.map((_, i) => i).sort((a, b) => (pl.model.faces[a].areaSqft ?? 0) - (pl.model.faces[b].areaSqft ?? 0));
      order.forEach((faceIdx, rank) => {
        pl.model.faces[faceIdx].designator = `${String.fromCharCode(65 + Math.floor(rank / 9))}${(rank % 9) + 1}`;
      });
    }
    if (graftRep?.hostAttribution?.length && pl.report.facetsExcluded > 0) {
      const facesById = new Map(pl.model.faces.map((f) => [f.id, f]));
      const k2 = finish.scaleK * finish.scaleK;
      let restored = false;
      for (const att of graftRep.hostAttribution) {
        if (facesById.has(att.overlayFaceId)) continue;
        const host = facesById.get(att.hostFaceId);
        if (!host) continue;
        host.areaSqft += att.planSqft * pitchFactor(host.pitch) * k2;
        restored = true;
      }
      if (restored) retotalFromGeometry(pl.model);
    }
    finish.model = pl.model;
    return {
      pipeline,
      finish,
      planarize: pl.report,
      grafted: graftRep != null,
      v: validationOf(pl.model, graftRep != null ? overlayFaceIds(pl.model) : undefined),
    };
  };
  // FLATTEN (flatten.ts): a roof plane is flat, and the reconstruction's facets
  // are not — traced from a noisy DSM they wander feet off their own plane
  // (measured on 12629 NE 100th Pl: 3.8 ft worst, one facet folding 167° across
  // its own surface, which drew as creases no line marked). Nothing else in the
  // chain repairs that: refine straightens lines in PLAN, rectify fixes their
  // DIRECTIONS. So both repair candidates are flattened by a global vertex
  // solve before they are finished. Synthesis is planar by construction and is
  // left alone. Kept only when it does not cost validator score (same
  // no-regression discipline as refine and conform).
  const flatRefined = flattenFacets(refined.model);
  const flatPre = flattenFacets(model);
  const refinedForGate = flatRefined.report.devAfterFt <= flatRefined.report.devBeforeFt ? flatRefined.model : refined.model;
  const preForGate = flatPre.report.devAfterFt <= flatPre.report.devBeforeFt ? flatPre.model : model;

  // Raw repair candidates. With a vision ring in play they are finished from
  // CLONES: finishCalibration mutates what it is given, and the pristine
  // refined/rectified geometry is still needed by the conform pass below —
  // while the RAW refined figures stay the gate's evidence reference either
  // way. Vision-free runs keep the exact pre-conform behavior.
  const candRefinedRaw = finishAndScore("refined", visionRing ? cloneModel(refinedForGate) : refinedForGate, false);
  const candPreRaw = finishAndScore("rectified", visionRing ? cloneModel(preForGate) : preForGate, false);

  // ── 4b. conform the repair candidates onto the vision ring (finding #2's
  // counterpart). The synthesized candidate is BUILT from the ring; refined/
  // rectified keep the recon's traced perimeter, which P2's clip can trim but
  // never straighten — conformPerimeterToRing snaps their outer EAVE/RAKE
  // contour onto the ring instead (structure-guarded: a component outside the
  // ring, like a detached garage, is untouched bit-for-bit). NO-REGRESSION
  // GATE, mirroring the refine fell-back pattern: the conformed candidate
  // ships only while its validator score stays within CONFORM_SCORE_DROP_MAX
  // of the unconformed one AND its footage still agrees with the raw refined
  // evidence at the gate floor — otherwise the attempt is discarded and the
  // discard recorded.
  //
  // SELECTION stays on the RAW candidates: straightening shifts footage a few
  // ft by construction, so a conformed candidate always concedes footage-
  // agreement points to an unconformed twin (measured on Kirkland: raw
  // rectified 62.8 out-ranked conformed refined 62.6 and shipped the crooked
  // geometry the pass exists to fix). The gate therefore ranks the same raw
  // candidates it always ranked — pipeline choice is conform-independent —
  // and the WINNER then ships its conformed variant when the no-regression
  // gate kept it, with the shipped variant's own validation/fidelity numbers
  // recorded. ──
  let candRefined = candRefinedRaw;
  let candPre = candPreRaw;
  const conformNoteOf = new Map<GatePipeline, ConformOutlineProvenance>();
  if (visionRing) {
    const rawFootage = candRefinedRaw.finish.model.totals.footageByType;
    const rawFacets = instant.totals.facetCount ?? candRefinedRaw.finish.model.totals.facetCount;
    const tryConform = (pipeline: "refined" | "rectified", pristine: RoofModel, raw: Candidate): Candidate => {
      const c = conformPerimeterToRing(pristine, visionRing);
      if (!c.changed) {
        opts?.onGateDebug?.(`conform ${pipeline}: no geometry change`);
        conformNoteOf.set(pipeline, { ...c.report });
        return raw;
      }
      // Conform moved vertices in PLAN, which tilts the facets they belong to
      // off their planes again — measured on 12629 NE 100th Pl: conforming a
      // flattened candidate cost 9 validator points and the pass was reverted,
      // taking the square perimeter with it. Re-flatten (height only) after the
      // snap so the two passes compose instead of undoing each other.
      const reflat = flattenFacets(c.model);
      const conformed = reflat.report.devAfterFt <= reflat.report.devBeforeFt ? reflat.model : c.model;
      const cand = finishAndScore(pipeline, conformed, false, undefined, true);
      const agree = fidelityOf(cand.finish.model, rawFacets, rawFootage).footageAgreement;
      const keep = cand.v.score >= raw.v.score - CONFORM_SCORE_DROP_MAX && agree >= FOOTAGE_AGREEMENT_FLOOR;
      opts?.onGateDebug?.(
        `conform ${pipeline}: score ${raw.v.score.toFixed(1)} (e${raw.v.errors}/w${raw.v.warns}) → ${cand.v.score.toFixed(1)} (e${cand.v.errors}/w${cand.v.warns}) · footageAgreement ${agree.toFixed(1)} · ${keep ? "kept" : "REVERTED by the no-regression gate"} · ${JSON.stringify(c.report)}`,
      );
      if (opts?.onGateDebug) {
        // Rule-level diff for the harness: which findings the conform changed.
        const linesOf = (m: RoofModel): string[] =>
          validateRoofModel(m, { source: "recon" })
            .results.filter((r) => r.level !== "ok")
            .map((r) => `${r.level} ${r.id}: ${r.msg}`);
        const rawLines = new Set(linesOf(raw.finish.model));
        const confLines = new Set(linesOf(cand.finish.model));
        for (const s of confLines) if (!rawLines.has(s)) opts.onGateDebug(`    +[${pipeline}] ${s}`);
        for (const s of rawLines) if (!confLines.has(s)) opts.onGateDebug(`    -[${pipeline}] ${s}`);
      }
      conformNoteOf.set(pipeline, keep ? { ...c.report } : { ...c.report, gateReverted: true });
      return keep ? cand : raw;
    };
    // Conform starts from the FLATTENED geometry, not the pristine one: the two
    // passes compose (flat facets, then a perimeter snapped to the traced roof
    // edge), and starting from the unflattened model would throw away whichever
    // improvement lost the gate.
    candRefined = tryConform("refined", refinedForGate, candRefinedRaw);
    candPre = tryConform("rectified", preForGate, candPreRaw);
  }
  const candSynth = synthesized
    ? finishAndScore("synthesized", synthesized.model, true, graft)
    : null;

  // The gate optimises soundness × faithfulness (file header): each candidate
  // gets a FIDELITY score against the evidence — Instant's facet count
  // (fallback: the refined repair's) and the refined repair's footage — and
  // the highest 0.6·validatorScore + 0.4·fidelity ships.
  // The evidence reference is the RAW refined repair — never the conformed
  // (or a clipped) variant, which would hide its own geometry loss.
  const refFootage = candRefinedRaw.finish.model.totals.footageByType;
  const instantFacets = instant.totals.facetCount ?? candRefinedRaw.finish.model.totals.facetCount;
  const scoreCandidate = (c: Candidate) => {
    const f = fidelityOf(c.finish.model, instantFacets, refFootage);
    return { ...c, fidelity: f.fidelity, footageAgreement: f.footageAgreement, metric: gateMetricOf(c.v.score, f.fidelity) };
  };
  // RAW candidates rank (§4b: the conform must not change WHICH pipeline wins).
  const sRefined = scoreCandidate(candRefinedRaw);
  const sPre = scoreCandidate(candPreRaw);
  const sSynth = candSynth ? scoreCandidate(candSynth) : null;
  const scored = [...(sSynth ? [sSynth] : []), sRefined, sPre];
  // Hard fidelity floor: when any candidate keeps footageAgreement ≥ the
  // floor, candidates below it are ineligible regardless of validator score.
  const eligible = scored.some((c) => c.footageAgreement >= FOOTAGE_AGREEMENT_FLOOR)
    ? scored.filter((c) => c.footageAgreement >= FOOTAGE_AGREEMENT_FLOOR)
    : scored;
  if (opts?.onGateDebug) {
    for (const c of scored) {
      opts.onGateDebug(
        `gate ${c.pipeline}: score ${c.v.score.toFixed(1)} · fidelity ${c.fidelity.toFixed(1)} · footage ${c.footageAgreement.toFixed(1)} · metric ${c.metric.toFixed(1)}`,
      );
    }
  }
  let winner = eligible[0];
  for (const c of eligible) if (c.metric > winner.metric) winner = c;
  opts?.onGateDebug?.(`gate winner: ${winner.pipeline} (metric ${winner.metric.toFixed(1)})`);
  // gateFellBack: the REFINED candidate scored below pre-refine at the gate —
  // interpret alongside `pipeline`, which names what actually shipped.
  const gateFellBack = sRefined.metric < sPre.metric;
  // The winning pipeline ships its CONFORMED variant when the no-regression
  // gate kept it (§4b) — validation/fidelity/metric recorded for the model
  // that actually ships, never the raw twin's.
  const shipped =
    winner.pipeline === "refined" && candRefined !== candRefinedRaw
      ? scoreCandidate(candRefined)
      : winner.pipeline === "rectified" && candPre !== candPreRaw
        ? scoreCandidate(candPre)
        : winner;
  if (shipped !== winner) {
    opts?.onGateDebug?.(`ships conformed ${winner.pipeline} (metric ${shipped.metric.toFixed(1)})`);
  }
  // Conform provenance rides with the candidate that actually ships; the
  // synthesized candidate is built FROM the ring, so nothing to record there.
  const shippedConform = conformNoteOf.get(winner.pipeline);
  if (visionNote && shippedConform) visionNote = { ...visionNote, conform: shippedConform };

  // ── 5. per-structure gate (2+ outline rings — file header) ──
  // Each finished candidate is cut into shared-nothing sub-models per gate
  // GROUP (rings sharing a straddling facet in any candidate are grouped, so
  // a straddler is never roofed twice by two independent winners); each sub is
  // refit against its group's Instant structure area (per-structure k); every
  // group runs the SAME gate (0.6·score + 0.4·fidelity with the footage
  // floor) over its own subs — fidelity's facet reference is the group's
  // Instant facetCounts when every ring has one, else the refined sub's, its
  // footage reference the refined sub's; with NO independent reference the
  // gate is validator score alone and fidelity stays ABSENT, never a
  // fabricated self-comparison of 100 — and the winners are composed: ids
  // re-prefixed "s{i}:" (nested), coincident duplicated lines deduped, one
  // retotal, then planarization of the composition. The composition ships
  // only while it stays within COMPOSITION_KEEP_MARGIN of the best whole-lot
  // candidate on the same gate metric. Single-ring lots skip all of this.
  if (rings.length >= 2) {
    const groups = straddlerGroups(
      [
        ...(candSynth ? [candSynth.finish.model] : []),
        candRefined.finish.model,
        candPre.finish.model,
      ],
      rings,
    );
    const subsOf = (c: Candidate | null): Array<RoofModel | null> =>
      c ? splitByStructure(c.finish.model, rings, groups) : groups.map(() => null);
    const subSynth = subsOf(candSynth);
    const subRefined = subsOf(candRefined);
    const subPre = subsOf(candPre);

    // Per-structure k (file header): refit every sub — the refined reference
    // sub included, so fidelity compares like with like — against the group's
    // summed Instant structure areaSqft (all rings or nothing).
    const ringAreas = converted.map((e) => e.areaSqft);
    const groupAreaOf = (group: number[]): number | null => {
      let sum = 0;
      for (const ri of group) {
        const a = ringAreas[ri];
        if (typeof a !== "number" || !(a > 0)) return null;
        sum += a;
      }
      return sum;
    };
    const kEffOf = new Map<RoofModel, number>();
    groups.forEach((group, gi) => {
      const target = groupAreaOf(group);
      const pairs: Array<[RoofModel | null, number]> = [
        [subSynth[gi], candSynth?.finish.scaleK ?? 1],
        [subRefined[gi], candRefined.finish.scaleK],
        [subPre[gi], candPre.finish.scaleK],
      ];
      for (const [sub, lotK] of pairs) {
        if (sub) kEffOf.set(sub, rescaleSubToStructure(sub, target, lotK));
      }
    });

    interface StructWinner {
      ringIndexes: number[];
      pipeline: GatePipeline;
      grafted: boolean;
      model: RoofModel;
      overlay: Set<string> | null;
      scaleK: number;
    }
    const structWinners: StructWinner[] = [];
    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];
      const refSub = subRefined[gi];
      const entries: Array<{ pipeline: GatePipeline; grafted: boolean; model: RoofModel }> = [];
      const synthSub = subSynth[gi];
      if (synthSub) entries.push({ pipeline: "synthesized", grafted: candSynth?.grafted ?? false, model: synthSub });
      if (refSub) entries.push({ pipeline: "refined", grafted: false, model: refSub });
      const preSub = subPre[gi];
      if (preSub) entries.push({ pipeline: "rectified", grafted: false, model: preSub });
      if (entries.length === 0) continue;
      // Independent references for this group: Instant's per-structure facet
      // counts (summed — all rings of the group or nothing) and the refined
      // sub's footage.
      let instantFacetsGroup: number | null = 0;
      for (const ri of group) {
        const c = ringFacetCounts[ri];
        if (typeof c !== "number" || !(c > 0)) {
          instantFacetsGroup = null;
          break;
        }
        instantFacetsGroup += c;
      }
      const refFtGroup = refSub?.totals.footageByType ?? null;
      const scoredSubs = entries.map((e) => {
        const overlay = e.grafted ? overlayFaceIds(e.model) : null;
        const v = validationOf(e.model, overlay ?? undefined);
        if (refFtGroup && refSub) {
          const f = fidelityOf(e.model, instantFacetsGroup ?? refSub.totals.facetCount, refFtGroup);
          return {
            ...e,
            overlay,
            v,
            fidelity: f.fidelity as number | undefined,
            footageAgreement: f.footageAgreement as number | undefined,
            metric: gateMetricOf(v.score, f.fidelity),
          };
        }
        if (instantFacetsGroup != null) {
          // A facet reference but no refined sub: the footage term has no
          // independent reference, so fidelity is the facet term alone.
          const facetAgreement =
            100 *
            clamp01(
              1 -
                Math.abs(e.model.totals.facetCount - instantFacetsGroup) /
                  Math.max(4, instantFacetsGroup),
            );
          return {
            ...e,
            overlay,
            v,
            fidelity: facetAgreement as number | undefined,
            footageAgreement: undefined as number | undefined,
            metric: gateMetricOf(v.score, facetAgreement),
          };
        }
        // No independent reference at all (finding: self-comparison used to
        // fabricate fidelity = 100 here): validator score alone, fidelity
        // ABSENT.
        return {
          ...e,
          overlay,
          v,
          fidelity: undefined as number | undefined,
          footageAgreement: undefined as number | undefined,
          metric: v.score,
        };
      });
      // The footage floor is meaningful only when a footage reference exists.
      const passFloor =
        refFtGroup && scoredSubs.some((c) => (c.footageAgreement ?? -1) >= FOOTAGE_AGREEMENT_FLOOR)
          ? scoredSubs.filter((c) => (c.footageAgreement ?? -1) >= FOOTAGE_AGREEMENT_FLOOR)
          : scoredSubs;
      let w = passFloor[0];
      for (const c of passFloor) if (c.metric > w.metric) w = c;
      structWinners.push({
        ringIndexes: group,
        pipeline: w.pipeline,
        grafted: w.pipeline === "synthesized" && w.grafted,
        model: w.model,
        overlay: w.overlay,
        scaleK: kEffOf.get(w.model) ?? 1,
      });
    }

    // Compose the winners, then GATE THE COMPOSITION: it ships only while it
    // stays within COMPOSITION_KEEP_MARGIN of the best whole-lot candidate on
    // the same metric. Composition failing or losing never blocks — the
    // whole-lot winner below remains.
    const composedReturn =
      structWinners.length > 0
        ? (() => {
            try {
              const composed = composeStructures(
                structWinners.map((w) => ({
                  ringIndex: w.ringIndexes[0],
                  tag: `${w.pipeline}${w.grafted ? "+graft" : ""}`,
                  model: w.model,
                })),
                candRefined.finish.model,
              );
              // Totals once, from the composed geometry (faces/lines already
              // carry their own structure's k — k is never applied twice),
              // then the spec §5 invariants over the whole composition.
              retotalFromGeometry(composed);
              const plComposed = planarizeForShip(composed, rings, overhangFt);
              const shipModel = plComposed.model;
              shipModel.totals.predominantPitch = instantPitch ?? areaMode(shipModel.faces);
              // Overlay ids tracked THROUGH the re-prefixing, not re-derived
              // from the composed model — the graft module's own markers are
              // its business.
              const composedOverlay = new Set<string>();
              for (const w of structWinners) {
                if (!w.overlay) continue;
                for (const id of w.overlay) composedOverlay.add(rePrefixId(id, `s${w.ringIndexes[0]}:`));
              }
              const vComposed = validationOf(shipModel, composedOverlay);
              const fComposed = fidelityOf(shipModel, instantFacets, refFootage);
              const composedMetric = gateMetricOf(vComposed.score, fComposed.fidelity);
              if (composedMetric < winner.metric - COMPOSITION_KEEP_MARGIN) return null; // composition gate
              const pipelineSummary = structWinners
                .map(
                  (w) =>
                    `${w.ringIndexes.map((ri) => `s${ri}`).join("+")}:${w.pipeline}${w.grafted ? "+graft" : ""}`,
                )
                .join(", ");
              const anyRefined = structWinners.some((w) => w.pipeline === "refined");
              // The composition mixes candidates: the perimeter diagnostics
              // still reflect the REPAIR EVIDENCE (refined candidate) — the
              // figures every structure's fidelity was judged against — but
              // scaleK/reconAreaSqft describe the SHIPPED composition: the
              // area-weighted k its faces actually carry, so
              // reconAreaSqft·scaleK² equals the printed areaSqft exactly.
              const rep = candRefined.finish;
              const kByPfx = new Map(structWinners.map((w) => [`s${w.ringIndexes[0]}:`, w.scaleK]));
              let composedGeomSqft = 0;
              for (const f of shipModel.faces) {
                const m = /^s\d+:/.exec(f.id);
                const k = (m ? kByPfx.get(m[0]) : undefined) ?? rep.scaleK;
                composedGeomSqft += k > 0 ? f.areaSqft / (k * k) : f.areaSqft;
              }
              const composedScaleK =
                composedGeomSqft > 0
                  ? Math.sqrt(shipModel.totals.areaSqft / composedGeomSqft)
                  : rep.scaleK;
              return {
                model: shipModel,
                report: {
                  scaleK: composedScaleK,
                  reconAreaSqft: composedGeomSqft,
                  instantAreaSqft: instantArea,
                  pitchesKept: rep.pitchesKept,
                  reclassified: rep.reclassified,
                  snappedVertices,
                  predominantPitchForced: rep.predominantPitchForced,
                  outlineTransform,
                  structureScaleK: structWinners.map((w) => ({
                    ringIndexes: [...w.ringIndexes],
                    scaleK: w.scaleK,
                  })),
                },
                notes: {
                  degenerateLines: rep.degenerateLines,
                  perimeterLines: rep.perimeterLines,
                  gatedLines: rep.gatedLines,
                  perimeterFtBefore: rep.perimeterFtBefore,
                  perimeterFtAfter: rep.perimeterFtAfter,
                  ...(anyRefined
                    ? { refine: { ...refined.report, applied: true } }
                    : { refine: { ...zeroRefineReport(), applied: false }, refineDiscarded: refined.report }),
                  validation: {
                    ...vComposed,
                    gateFellBack,
                    fidelity: fComposed.fidelity,
                    gateMetric: composedMetric,
                  },
                  pipeline: pipelineSummary,
                  ...(outlineSource ? { outlineSource } : {}),
                  ...(visionNote ? { visionOutline: visionNote } : {}),
                  planarize: plComposed.report,
                  ...(synthesized ? { synthesize: synthesized.report } : {}),
                  ...(graft ? { graft } : {}),
                },
                ...(opts?.exposeCandidates
                  ? {
                      candidates: {
                        refined: sRefined.finish.model,
                        rectified: sPre.finish.model,
                        synthesized: sSynth?.finish.model ?? null,
                      },
                    }
                  : {}),
              };
            } catch {
              // composeStructures asserted (or a pass threw): never ship a
              // suspect composition — the whole-lot winner below remains.
              return null;
            }
          })()
        : null;
    if (composedReturn) return composedReturn;
  }

  const win = shipped.finish;

  return {
    model: win.model,
    report: {
      scaleK: win.scaleK,
      reconAreaSqft: win.reconAreaSqft,
      instantAreaSqft: instantArea,
      pitchesKept: win.pitchesKept,
      reclassified: win.reclassified,
      snappedVertices,
      predominantPitchForced: win.predominantPitchForced,
      outlineTransform,
    },
    notes: {
      degenerateLines: win.degenerateLines,
      perimeterLines: win.perimeterLines,
      gatedLines: win.gatedLines,
      perimeterFtBefore: win.perimeterFtBefore,
      perimeterFtAfter: win.perimeterFtAfter,
      ...(winner.pipeline === "refined"
        ? { refine: { ...refined.report, applied: true } }
        : { refine: { ...zeroRefineReport(), applied: false }, refineDiscarded: refined.report }),
      validation: { ...shipped.v, gateFellBack, fidelity: shipped.fidelity, gateMetric: shipped.metric },
      pipeline: winner.pipeline,
      ...(outlineSource ? { outlineSource } : {}),
      ...(visionNote ? { visionOutline: visionNote } : {}),
      planarize: shipped.planarize,
      ...(roofOnly.report.droppedGround.length || roofOnly.report.droppedOffRoof.length || roofOnly.report.notes.length
        ? { roofRegions: roofOnly.report }
        : {}),
      // Flattening only ever applies to a repair candidate, so report the one
      // that actually shipped (synthesis is planar by construction).
      ...(winner.pipeline === "refined"
        ? { flatten: flatRefined.report }
        : winner.pipeline === "rectified"
          ? { flatten: flatPre.report }
          : {}),
      ...(synthesized ? { synthesize: synthesized.report } : {}),
      ...(graft ? { graft } : {}),
    },
    ...(opts?.exposeCandidates
      ? {
          candidates: {
            refined: sRefined.finish.model,
            rectified: sPre.finish.model,
            synthesized: sSynth?.finish.model ?? null,
          },
        }
      : {}),
  };
}
