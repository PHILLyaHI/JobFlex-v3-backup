// Phase 3 step 2 — the pitch of each skeleton facet, measured out of the DSM.
//
// The inversion this branch is for: the old path let topology fall out of a
// plane segmentation and then measured pitch per fragment, which is where R04
// came from — a facet labelled 6/12 whose own geometry says 4.85/12, because
// each fragment was quantised on its own with nothing tying a section together.
// Here the topology is already built and fixed; only the pitch is measured, and
// it is measured into facets that exist.
//
// Three things have to be right for the number to mean anything:
//
//   FRAME — the facets are in the Instant frame and the DSM is in Google's, and
//   they are 4 to 7.25 ft apart (register.ts). Sampling without the transform
//   reads the neighbouring slope, so a refused registration is not a licence to
//   measure anyway; it is a reason to say the pitch is not trustworthy.
//
//   SECTION — facets of one roof section share a pitch. Fitting each in
//   isolation and rounding it on its own is exactly the old defect.
//
//   RESIDUAL — the fit's own residual says whether the facet is sitting on ONE
//   slope. A facet straddling two reads a residual several times the validator's
//   planarity tolerance, and that is the check that the frames really line up —
//   the contour's IoU cannot see it.
//
// Pure: model + rasters + transform in, measurements out. Nothing is mutated.
import type { RoofModel } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";
import { fitPlane, planePitch12 } from "@/lib/roofRecon";
import { areaOf, type FootprintPoint } from "@/lib/roofRecon/footprint";
import type { Rigid2D } from "@/lib/roofRecon/register";

const FT_PER_M = 3.28084;
/** A facet with fewer DSM samples than this cannot support a plane fit. */
const MIN_SAMPLES = 12;
/**
 * The DSM's own noise floor, read out of the data rather than chosen: facets
 * that sit on one slope come in at p50 0.02–0.12 ft, mixed ones at 0.5–1.45.
 * The gap is an order of magnitude, so the boundary is not delicate.
 */
export const DSM_NOISE_FLOOR_FT = 0.2;
/** A robust fit may discard at most this share of a facet's samples. Past it
 *  the "obstruction" is most of the facet and the fit is no longer measuring
 *  the roof. */
const MAX_DROPPED_SHARE = 0.5;
/** Sample no closer than this to the facet's own edge: the DSM smears a foot or
 *  so across a crease, so edge pixels carry the neighbour's slope. One raster
 *  pixel is 0.33 ft; three is the mask's known over-reach. */
const EDGE_INSET_PX = 3;

export interface FacetPitch {
  id: string;
  /** Pitch of the least-squares plane through the DSM inside this facet. */
  pitch12: number;
  /** Down-slope azimuth of that plane, degrees clockwise from north. */
  azimuthDeg: number;
  /**
   * Residual of the fit, in feet. The MAX is reported for completeness but is
   * not the test: a single chimney pixel or an overhanging branch sets it, and
   * the DSM carries decimetre noise of its own. p50 and p90 are what say
   * whether the facet sits on ONE slope — a facet straddling two shows a p50
   * several times a clean facet's, not just a big maximum.
   */
  residualFt: number;
  residualP50Ft: number;
  residualP90Ft: number;
  residualRmsFt: number;
  samples: number;
  planSqft: number;
}

export interface PitchSection {
  /** Area-weighted pitch shared by the facets in this section. */
  pitch12: number;
  facetIds: string[];
  planSqft: number;
}

export interface PitchMeasurement {
  facets: FacetPitch[];
  sections: PitchSection[];
  /** Facets no plane could be fitted for, with why. */
  skipped: Array<{ id: string; reason: string }>;
}

const applyRigid = (p: FootprintPoint, t: Rigid2D): FootprintPoint => {
  const r = (t.thetaDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: p.x * c - p.y * s + t.dxFt, y: p.x * s + p.y * c + t.dyFt };
};

function inRing(x: number, y: number, ring: FootprintPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

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

/**
 * Least squares, then repeatedly drop the samples beyond twice the median
 * residual and refit. Never discards more than MAX_DROPPED_SHARE — past that
 * the outliers are the subject and the fit would be measuring them.
 */
function robustFitPlane(pts: Array<{ x: number; y: number; z: number }>) {
  let keep = pts;
  let plane = fitPlane(keep);
  const floor = Math.max(MIN_SAMPLES, Math.ceil(pts.length * (1 - MAX_DROPPED_SHARE)));
  for (let it = 0; it < 5 && plane; it++) {
    const res = keep.map((p) => Math.abs(p.z - (plane!.a * p.x + plane!.b * p.y + plane!.c)));
    const sorted = [...res].sort((a, b) => a - b);
    const limit = Math.max(DSM_NOISE_FLOOR_FT * 0.75, 2 * sorted[Math.floor(sorted.length / 2)]);
    const next = keep.filter((_, i) => res[i] <= limit);
    if (next.length < floor || next.length === keep.length) break;
    keep = next;
    plane = fitPlane(keep);
  }
  return plane;
}

export interface MeasurePitchInput {
  model: RoofModel;
  mask: Raster;
  /** DSM in METRES. */
  dsm: Raster;
  /** Registration from register.ts — the facets live in the Instant frame. */
  transform: Rigid2D;
  /**
   * How far two fitted pitches may differ and still be one section. Left to the
   * caller because the right value is a measurement, not a constant — see the
   * harness.
   */
  sectionTolerance12: number;
}

/** Fit a plane to the DSM inside every facet, then group the facets into
 *  sections that share a pitch. */
export function measurePitchFromDsm(input: MeasurePitchInput): PitchMeasurement {
  const { model, mask, dsm, transform, sectionTolerance12 } = input;
  const idx = buildIndexes(model);
  const stepFt = dsm.pixelSizeM * FT_PER_M;
  const inset = EDGE_INSET_PX * stepFt;
  const { width: w, height: h } = dsm;

  const facets: FacetPitch[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const f of model.faces) {
    const id = String(f.designator || f.id);
    const ring3 = ringOf(f.lineIds, idx);
    if (!ring3 || ring3.length < 3) {
      skipped.push({ id, reason: "facet ring does not close" });
      continue;
    }
    const plan = ring3.map((p) => ({ x: p.x, y: p.y }));
    const planSqft = areaOf(plan);
    // Into the raster's frame before sampling — this is the whole point.
    const moved = plan.map((p) => applyRigid(p, transform));
    const xs = moved.map((p) => p.x);
    const ys = moved.map((p) => p.y);
    const pts: Array<{ x: number; y: number; z: number }> = [];
    const px0 = Math.max(0, Math.floor(Math.min(...xs) / stepFt + w / 2 - 1));
    const px1 = Math.min(w - 1, Math.ceil(Math.max(...xs) / stepFt + w / 2 + 1));
    const py0 = Math.max(0, Math.floor(h / 2 - Math.max(...ys) / stepFt - 1));
    const py1 = Math.min(h - 1, Math.ceil(h / 2 - Math.min(...ys) / stepFt + 1));
    for (let py = py0; py <= py1; py++) {
      for (let px = px0; px <= px1; px++) {
        const x = (px + 0.5 - w / 2) * stepFt;
        const y = (h / 2 - py - 0.5) * stepFt;
        if (!inRing(x, y, moved)) continue;
        if (distToRing(x, y, moved) < inset) continue;
        if (!(mask.data[py * w + px] > 0)) continue;
        const z = dsm.data[py * w + px];
        if (!Number.isFinite(z)) continue;
        pts.push({ x, y, z: z * FT_PER_M });
      }
    }
    if (pts.length < MIN_SAMPLES) {
      skipped.push({ id, reason: `${pts.length} DSM samples inside it, needs ${MIN_SAMPLES}` });
      continue;
    }
    // ROBUST fit, and it is the whole difference. A plain least-squares plane is
    // dragged by whatever sits on the roof but is not the roof — a chimney, an
    // overhanging branch, a solar array. Measured on the two fixtures: nine of
    // the eighteen facets that looked "mixed" (p50 0.2–1.2 ft) were not mixed at
    // all; discarding 30–49 % of their samples as outliers brought them to
    // p50 0.04–0.10 and moved their pitches from 4.36–7.33 to 5.85–7.16 on a
    // 6/12 roof. No cut was needed for any of them, and cutting on the raw
    // residual would have invented a roof plane out of a tree.
    const plane = robustFitPlane(pts);
    if (!plane) {
      skipped.push({ id, reason: "no plane could be fitted" });
      continue;
    }
    const res = pts.map((p) => Math.abs(p.z - (plane.a * p.x + plane.b * p.y + plane.c))).sort((x, y) => x - y);
    const at = (q: number) => res[Math.min(res.length - 1, Math.floor(res.length * q))];
    const azimuthDeg = ((Math.atan2(-plane.a, -plane.b) * 180) / Math.PI + 360) % 360;
    facets.push({
      id,
      pitch12: planePitch12(plane),
      azimuthDeg,
      residualFt: res[res.length - 1],
      residualP50Ft: at(0.5),
      residualP90Ft: at(0.9),
      residualRmsFt: Math.sqrt(res.reduce((s2, r) => s2 + r * r, 0) / res.length),
      samples: pts.length,
      planSqft,
    });
  }

  // Sections: facets whose fitted pitches sit within the tolerance share one
  // area-weighted pitch. Single-linkage over the sorted pitches, so a run of
  // facets stepping gently across the tolerance stays one section — which is
  // what a real roof section looks like under DSM noise.
  const sorted = [...facets].sort((a, b) => a.pitch12 - b.pitch12);
  const sections: PitchSection[] = [];
  let group: FacetPitch[] = [];
  const close = () => {
    if (!group.length) return;
    const area = group.reduce((s, g) => s + g.planSqft, 0);
    const pitch12 = area > 0 ? group.reduce((s, g) => s + g.pitch12 * g.planSqft, 0) / area : group[0].pitch12;
    sections.push({ pitch12, facetIds: group.map((g) => g.id), planSqft: area });
    group = [];
  };
  for (const f of sorted) {
    if (group.length && f.pitch12 - group[group.length - 1].pitch12 > sectionTolerance12) close();
    group.push(f);
  }
  close();

  return { facets, sections, skipped };
}
