// What the AI structure read says about the roof's TOPOLOGY, scored against
// what the DSM measured — and, deliberately, nothing more.
//
// The AI read (roofStructureVision.ts, gpt-5.4 over the EagleView ortho)
// returns three things: the outer outline, the INTERIOR lines where two
// slopes meet (ridge / hip / valley), and penetrations. The product has
// always used the penetrations; the interior lines were computed and thrown
// away. This module gives them a job — the job the measurement supports, and
// not the one that was hoped for.
//
// MEASURED, 2026-08-28, on the two houses that have both a cached read and a
// registered DSM:
//   12629 — walls where both the DSM and vision had an opinion: 3.
//           Walls where they AGREED: 0. Vision drew a ridge across a slope
//           the DSM measures as one plane (the lower half of that roof is
//           under tree shadow and the model simply could not see it).
//   419   — the two never both spoke on the same wall: 3 walls DSM-only,
//           4 vision-only, 0 overlapping.
// So the interior lines are NOT trustworthy enough to decide gables, and
// nothing here is allowed to move a vertex. What they ARE good for:
//
//   1. an INDEPENDENT WITNESS on the facets the pipeline already doubts.
//      The unrecognised-case detector (surgeries.ts) flags facets whose
//      measured drain disagrees with the drawn one. When vision independently
//      draws a crease across such a facet, two unrelated sources say the same
//      part of the drawing is wrong, and the contractor is told so.
//   2. a per-house AGREEMENT SCORE, recorded on every measurement. This is
//      how the question "can vision be promoted to a driver?" gets answered
//      from the field instead of from an opinion — the same discipline the
//      unrecognised-case list already follows. Today it reads 0/3; if it
//      reads 40/44 across the next fifty roofs, the promotion is justified
//      and this comment is the record of what changed.
//
// Pure and side-effect free; the caller owns the network and the cache.

import type { RoofModel } from "@/lib/eagleview";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";
import type { StructureInteriorLine } from "@/lib/roofDiagram/roofStructureVision";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";
import { DSM_NOISE_FLOOR_FT, type PitchMeasurement } from "@/lib/roofRecon/pitchFromDsm";
import { CLUSTER_AZ_TOL_DEG, GABLE_MIN_DEG } from "@/lib/roofRecon/refineClusters";

/**
 * How close an interior line's endpoint must land to a wall before it counts
 * as terminating on it. The eave overhang the drawing already allows for is
 * 12–24 in (drawing-rules spec §5 P2), so 4 ft is one overhang plus the
 * vision trace's own slack — tight enough that a line crossing the middle of
 * the roof is never read as landing on a wall.
 */
const WALL_LANDING_FT = 4;
/** A gable is a WALL: the field's real gable ends measure 10.6–20.7 ft, the
 *  slivers that fake them 3.4–3.5. Same floor the wavefront carriers use. */
const MIN_WALL_FT = 8;

export type WallVerdict = "gable" | "hip" | "silent";

export interface VisionWall {
  /** Index into the structure contour. */
  edge: number;
  lengthFt: number;
  /** The facet that owns this wall, when one does. */
  facet: string | null;
  dsm: WallVerdict;
  vision: WallVerdict;
}

export interface VisionStructureEvidence {
  lines: { ridge: number; hip: number; valley: number };
  /** Walls where BOTH sources spoke, and how often they said the same thing. */
  agreement: { both: number; agreed: number; share: number | null };
  walls: VisionWall[];
  /**
   * Facets the DSM already flagged as unrecognised that vision ALSO draws a
   * crease through — two independent sources doubting the same spot.
   */
  corroborated: string[];
  /** Where the read came from, for the record. */
  source: string;
  model: string;
}

const azDiff = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

const distToSeg = (p: FootprintPoint, a: FootprintPoint, b: FootprintPoint): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** Least-squares drain azimuth of a facet ring, degrees clockwise from north. */
function drainAzimuth(ring: Array<{ x: number; y: number; z: number }>): number {
  let sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
  const n = ring.length;
  for (const p of ring) {
    sx += p.x; sy += p.y; sz += p.z;
    sxx += p.x * p.x; syy += p.y * p.y; sxy += p.x * p.y;
    sxz += p.x * p.z; syz += p.y * p.z;
  }
  const den = sxx * (syy * n - sy * sy) - sxy * (sxy * n - sy * sx) + sx * (sxy * sy - syy * sx);
  if (Math.abs(den) < 1e-9) return 0;
  const a = (sxz * (syy * n - sy * sy) - sxy * (syz * n - sy * sz) + sx * (syz * sy - syy * sz)) / den;
  const b = (sxx * (syz * n - sz * sy) - sxz * (sxy * n - sx * sy) + sx * (sxy * sz - syz * sx)) / den;
  return ((Math.atan2(-a, -b) * 180) / Math.PI + 360) % 360;
}

export interface VisionEvidenceInput {
  /** The structure's regularised contour, frame feet. */
  contour: FootprintPoint[];
  /** The model as drawn (already at the measured pitch). */
  model: RoofModel;
  /** The DSM measurement behind that model. */
  measurement: PitchMeasurement;
  /** Interior lines from the AI read, frame feet. */
  interior: StructureInteriorLine[];
  /** Designators the unrecognised-case detector flagged. */
  unrecognised: readonly string[];
  source: string;
  model_: string;
}

export function readVisionEvidence(input: VisionEvidenceInput): VisionStructureEvidence {
  const { contour, interior, measurement } = input;
  const byLabel = new Map(measurement.facets.map((f) => [f.id, f]));
  const idx = buildIndexes(input.model);

  interface FacetInfo {
    label: string;
    plan: FootprintPoint[];
    drain: number;
    dsmAz: number | null;
    trusted: boolean;
  }
  const facets: FacetInfo[] = [];
  for (const f of input.model.faces) {
    const ring = ringOf(f.lineIds, idx);
    if (!ring || ring.length < 3) continue;
    const label = String(f.designator || f.id);
    const m = byLabel.get(label);
    facets.push({
      label,
      plan: ring.map((p) => ({ x: p.x, y: p.y })),
      drain: drainAzimuth(ring.map((p) => ({ x: p.x, y: p.y, z: p.z }))),
      dsmAz: m ? m.azimuthDeg : null,
      trusted: !!m && m.residualP50Ft <= DSM_NOISE_FLOOR_FT,
    });
  }

  const lines = { ridge: 0, hip: 0, valley: 0 };
  for (const l of interior) {
    if (l.type === "RIDGE") lines.ridge++;
    else if (l.type === "HIP") lines.hip++;
    else if (l.type === "VALLEY") lines.valley++;
  }

  const walls: VisionWall[] = [];
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % contour.length];
    const lengthFt = Math.hypot(b.x - a.x, b.y - a.y);
    if (lengthFt < MIN_WALL_FT) continue;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

    let owner: FacetInfo | null = null;
    for (const f of facets) {
      for (let j = 0; j < f.plan.length && !owner; j++) {
        if (distToSeg(mid, f.plan[j], f.plan[(j + 1) % f.plan.length]) < 0.05) owner = f;
      }
      if (owner) break;
    }

    // DSM verdict: the same gable signature the wavefront's carriers use.
    let dsm: WallVerdict = "silent";
    if (owner && owner.dsmAz != null && owner.trusted) {
      const drainsWithNeighbour = facets.some(
        (nb) => nb !== owner && nb.dsmAz != null && azDiff(nb.dsmAz, owner!.dsmAz!) <= CLUSTER_AZ_TOL_DEG,
      );
      dsm = azDiff(owner.drain, owner.dsmAz) >= GABLE_MIN_DEG && drainsWithNeighbour ? "gable" : "hip";
    }

    // Vision verdict: a ridge terminating on this wall with no hip nearer is
    // a gable end; a hip landing on it is a hip end.
    let ridgeD = Infinity;
    let hipD = Infinity;
    for (const l of interior) {
      for (const ep of [l.a, l.b]) {
        const d = distToSeg(ep, a, b);
        if (l.type === "RIDGE") ridgeD = Math.min(ridgeD, d);
        else if (l.type === "HIP") hipD = Math.min(hipD, d);
      }
    }
    const vision: WallVerdict =
      ridgeD < WALL_LANDING_FT && ridgeD < hipD ? "gable" : hipD < WALL_LANDING_FT ? "hip" : "silent";

    walls.push({ edge: i, lengthFt, facet: owner?.label ?? null, dsm, vision });
  }

  const spoke = walls.filter((w) => w.dsm !== "silent" && w.vision !== "silent");
  const agreed = spoke.filter((w) => w.dsm === w.vision);

  // Corroboration: a doubted facet that vision also draws a crease across.
  const doubted = new Set(input.unrecognised);
  const corroborated: string[] = [];
  for (const f of facets) {
    if (!doubted.has(f.label)) continue;
    const crossed = interior.some((l) => {
      // does the line pass through this facet's plan interior?
      const mid = { x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 };
      let hit = false;
      const r = f.plan;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        if (r[i].y > mid.y !== r[j].y > mid.y && mid.x < ((r[j].x - r[i].x) * (mid.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) hit = !hit;
      }
      return hit;
    });
    if (crossed) corroborated.push(f.label);
  }

  return {
    lines,
    agreement: { both: spoke.length, agreed: agreed.length, share: spoke.length ? agreed.length / spoke.length : null },
    walls,
    corroborated,
    source: input.source,
    model: input.model_,
  };
}
