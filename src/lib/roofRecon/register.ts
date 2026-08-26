// Registering the Instant contour onto the Google raster.
//
// Phase 3 measures pitch out of the DSM into facets built from the Instant
// contour, and those two live in frames that do not agree. Measured on the two
// houses that have both: the contour must move (−7.25, −0.75) ft and 1.25° on
// Kirkland, (−4.00, +0.50) ft and 0° on Prairie. Direction is stable — both
// westward — but the magnitude nearly doubles between them, so there is no
// frame constant to bake in. It has to be solved per house.
//
// Why the existing alignment could not do it (calibrate.ts alignOutlines):
// ALIGN_PAIR_FT = 6 is the ICP capture radius AND ALIGN_MAX_SHIFT_FT = 6 is the
// ceiling on the answer. At a true offset of 7.25 ft the correct
// correspondences are outside the radius from the first iteration, so the fit
// never sees them; and had it fitted 7.25 anyway, the result would have been
// thrown away for exceeding the ceiling. A capture radius and a plausibility
// ceiling are two different numbers and must not be the same one.
//
// So: a coarse sweep wide enough to find the answer, then a fine one to sharpen
// it. The coarse radius is not a constant — the offset scales with how big the
// building is (a bigger footprint means a bigger georeferencing lever), so it
// is a share of the contour's own extent.
//
// Pure: rasters and a polygon in, a transform out. No I/O.
import type { Raster } from "@/lib/solar";
import { areaOf, type FootprintPoint } from "@/lib/roofRecon/footprint";

const FT_PER_M = 3.28084;

/** Height above local ground a mask pixel must clear to be roof — the same gate
 *  the fallback and the coverage metric use (reconV2.ts). */
const ROOF_MIN_HEIGHT_FT = 4;

/**
 * Coarse search radius, as a share of the contour's own bounding diagonal —
 * not a constant, because the offset scales with how big the building is.
 *
 * Swept on both fixtures. The TRANSFORM is stable from 0.10 up (−7.4 ft on
 * Kirkland, −4.25 on Prairie at every share); what changes is whether it can
 * be reached at all, and what the score means:
 *
 *   share   Kirkland found   IoU after   note
 *   0.05    −5.00 ft         89.8 %      clipped by the radius, wrong answer
 *   0.10    −7.33 ft         92.8 %      reaches it, no margin (needs 7.4 of 7.1)
 *   0.20    −7.41 ft         88.2 %      reaches it with room  ← chosen
 *   0.80    −7.16 ft         29.5 %      neighbourhood swamped by other buildings
 *
 * 0.05 cannot reach the measured offset (11 % of the diagonal on Kirkland) and
 * 0.10 has no margin over it. 0.20 does, and still refuses to wander half a
 * building away.
 */
export const COARSE_RADIUS_SHARE = 0.2;
/*
 * The radius does two jobs on purpose, and both need the same number: it bounds
 * where the fit may look, and it defines the neighbourhood the fit is JUDGED
 * over. The score has to include roof the contour fails to cover, or a small
 * contour dropped inside a big roof scores perfectly — measured: an 8×60 ft
 * sliver scored 75 % when the judging set was narrowed to the fitted contour.
 * So the neighbourhood must be wide enough to hold this roof and tight enough
 * to exclude the neighbours', which is what the sweep below settles.
 */
/** Rotation is small in every sample — grid convergence and georeferencing, not
 *  a different north. Searched to here and no further. */
export const MAX_ROTATION_DEG = 4;
/**
 * A fit worse than this is not a registration, it is a coincidence. Separate
 * from the search radius on purpose: this one judges the ANSWER, the radius
 * only bounds the looking.
 */
export const MIN_ACCEPTABLE_IOU = 0.6;

export interface Rigid2D {
  dxFt: number;
  dyFt: number;
  thetaDeg: number;
}

export type RegisterResult =
  | {
      applied: true;
      transform: Rigid2D;
      iouBefore: number;
      iouAfter: number;
      /** Cells of roof-height mask the fit was scored against. */
      seenSqft: number;
    }
  | {
      applied: false;
      /** Plain reason — never a silent identity transform. */
      reason: string;
      /** The best fit found, so a caller can log what it could not use. */
      best: Rigid2D | null;
      iouBefore: number;
      iouAfter: number | null;
      seenSqft: number;
    };

const applyRigid = (p: FootprintPoint, t: Rigid2D): FootprintPoint => {
  const r = (t.thetaDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: p.x * c - p.y * s + t.dxFt, y: p.x * s + p.y * c + t.dyFt };
};

/** Distance from a point to a ring's boundary (0 when inside). */
function distToRing(x: number, y: number, ring: FootprintPoint[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)));
  }
  return best;
}

function inRing(x: number, y: number, ring: FootprintPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** IoU of a transformed contour against a fixed set of 1 ft roof cells. */
function iouAt(cells: FootprintPoint[], ring: FootprintPoint[], ringArea: number, t: Rigid2D): number {
  const moved = ring.map((p) => applyRigid(p, t));
  let hit = 0;
  for (const c of cells) if (inRing(c.x, c.y, moved)) hit++;
  const union = cells.length + ringArea - hit;
  return union > 0 ? hit / union : 0;
}

export interface RegisterInput {
  /** The drawn contour, in the Instant frame (feet from the pin). */
  contour: FootprintPoint[];
  /** Google Solar building mask. */
  mask: Raster;
  /** Google Solar DSM, METRES. */
  dsm: Raster;
  groundElevFt: number;
}

/**
 * Find the rigid transform that puts `contour` onto the roof the raster shows.
 * Returns an explicit refusal rather than an identity transform when it cannot
 * — a silent identity is indistinguishable from "no offset", and that is the
 * failure this whole exercise exists to remove.
 */
export function registerContourToRaster(input: RegisterInput): RegisterResult {
  const { contour, mask, dsm, groundElevFt } = input;
  const identity: Rigid2D = { dxFt: 0, dyFt: 0, thetaDeg: 0 };
  const ringArea = areaOf(contour);
  if (contour.length < 3 || !(ringArea > 0)) {
    return { applied: false, reason: "no contour to register", best: null, iouBefore: 0, iouAfter: null, seenSqft: 0 };
  }

  // Roof-height cells, one per square foot, over the contour's neighbourhood.
  const xs = contour.map((p) => p.x);
  const ys = contour.map((p) => p.y);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const radius = Math.max(4, COARSE_RADIUS_SHARE * diag);
  const pad = radius + 4;
  const cutM = (groundElevFt + ROOF_MIN_HEIGHT_FT) / FT_PER_M;
  const stepFt = mask.pixelSizeM * FT_PER_M;
  const { width: w, height: h } = mask;
  const cells: FootprintPoint[] = [];
  for (let x = Math.min(...xs) - pad; x <= Math.max(...xs) + pad; x += 1) {
    for (let y = Math.min(...ys) - pad; y <= Math.max(...ys) + pad; y += 1) {
      const px = Math.round(x / stepFt + w / 2 - 0.5);
      const py = Math.round(h / 2 - 0.5 - y / stepFt);
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      if (!(mask.data[py * w + px] > 0)) continue;
      const z = dsm.data[py * w + px];
      if (!Number.isFinite(z) || z < cutM) continue;
      // A cell no candidate transform could ever cover — the neighbour's roof,
      // typically — belongs to no fit and only inflates the union, dragging the
      // score down without informing it. The search can move the contour by at
      // most `radius`, so anything further out is not this building.
      if (!inRing(x, y, contour) && distToRing(x, y, contour) > radius) continue;
      cells.push({ x, y });
    }
  }
  const seenSqft = cells.length;
  const iouBefore0 = iouAt(cells, contour, ringArea, identity);
  if (cells.length < 100) {
    return {
      applied: false,
      reason: `only ${seenSqft} sq ft of roof-height mask near this building — not enough to register against`,
      best: null,
      iouBefore: iouBefore0,
      iouAfter: null,
      seenSqft,
    };
  }

  // Coarse: wide enough to reach the answer. Fine: sharpen it.
  let best = { t: identity, iou: iouBefore0 };
  const sweep = (centre: Rigid2D, span: number, step: number, thetaSpan: number, thetaStep: number) => {
    for (let dx = centre.dxFt - span; dx <= centre.dxFt + span + 1e-9; dx += step) {
      for (let dy = centre.dyFt - span; dy <= centre.dyFt + span + 1e-9; dy += step) {
        for (let th = centre.thetaDeg - thetaSpan; th <= centre.thetaDeg + thetaSpan + 1e-9; th += thetaStep) {
          const t = { dxFt: dx, dyFt: dy, thetaDeg: th };
          const v = iouAt(cells, contour, ringArea, t);
          if (v > best.iou) best = { t, iou: v };
        }
      }
    }
  };
  sweep(identity, radius, 1, MAX_ROTATION_DEG, 1);
  sweep(best.t, 1, 0.25, 1, 0.25);

  const iouBefore = iouBefore0;
  const iouAfter = best.iou;

  if (iouAfter < MIN_ACCEPTABLE_IOU) {
    return {
      applied: false,
      reason:
        `best alignment reaches only ${(iouAfter * 100).toFixed(0)}% overlap (needs ${(MIN_ACCEPTABLE_IOU * 100).toFixed(0)}%) — ` +
        `the contour and the aerial imagery do not describe the same building well enough to register`,
      best: best.t,
      iouBefore,
      iouAfter,
      seenSqft,
    };
  }
  return { applied: true, transform: best.t, iouBefore, iouAfter, seenSqft };
}
