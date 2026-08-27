// The gate that lets the weighted wavefront into the product.
//
// The skeleton assumes an equal-pitch hip roof and draws one. On a house that
// really has gables that costs the drawing its rakes and doubles its hips —
// measured on 12629: rake 51 → 0 ft, flashing 29 → 0, hip 124 → 239 against
// the same house drawn by the older path. The linear footage is what a
// contractor orders trim and ridge vent from, so a wrong layout is more
// expensive than a slightly wrong area.
//
// The wavefront (weightedWavefront.ts) draws gables natively, but it must
// never get to draw a roof the skeleton would have drawn better. So:
//
//   1. CARRIERS. Only run when the DSM says this roof has a gable the drawing
//      missed — a facet whose measured drain fights its drawn drain by
//      GABLE_MIN_DEG while a neighbour drains the way it measures. No
//      carriers, no wavefront: the skeleton already agrees with the roof.
//   2. EVIDENCE. Per-edge slopes come from the DSM clusters, gables from the
//      carriers. Vision is not consulted here — measured 2026-08-28 to
//      disagree with the DSM on the walls where both speak.
//   3. VERDICT. The result must beat the skeleton on the checks that matter:
//      Euler 1, tiling under half a percent, the area identity intact, and NO
//      NEW validator error codes. Anything short and the skeleton ships with
//      the reason recorded — a fallback is never silent.
//
// Single-structure lots only. A multi-structure lot would need every
// structure solved and composed, and the farm (20 structures) is not the
// place to debut that; those keep the skeleton and say so.

import type { RoofModel } from "@/lib/eagleview";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";
import { validateRoofInvariants } from "@/lib/roofDiagram/validate";
import { areaOf, type FootprintPoint } from "@/lib/roofRecon/footprint";
import { DSM_NOISE_FLOOR_FT, MIN_TRUSTED_SQFT, type PitchMeasurement } from "@/lib/roofRecon/pitchFromDsm";
import { CLUSTER_AZ_TOL_DEG, GABLE_MIN_DEG } from "@/lib/roofRecon/refineClusters";
import { weightedSkeleton } from "@/lib/roofRecon/weightedWavefront";
import { modelFromWavefront } from "@/lib/roofRecon/wavefrontModel";

/**
 * A gable is a WALL. Measured across the field set: real gable ends run
 * 10.6–20.7 ft, while the slivers that fake the signature run 3.4–3.5 ft.
 * Below this a carrier stays a hip and stays visible in the unrecognised
 * detector instead. Category: absolute floor on a physical length.
 */
const MIN_GABLE_WALL_FT = 8;
/**
 * Slopes within this of each other are ONE slope, so the wavefront is handed
 * one number for them. sectionTolerance12's own figure — the pipeline's
 * existing definition of "the same slope" — reused rather than invented: a
 * fallback pitch sitting beside a measured one on two parallel walls
 * otherwise manufactures a step the wavefront cannot ride (its co-normal
 * parallel-contact case) and the whole roof falls back for nothing.
 */
const SAME_SLOPE_12 = 0.75;
/** Tiling tolerance — the project's own drawn-geometry figure. */
const MAX_TILING_PCT = 0.5;

const azDiff = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

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

const eulerOf = (m: RoofModel): number =>
  new Set(m.points.map((p) => p.id)).size - new Set(m.lines.map((l) => l.id)).size + m.faces.length;

function planAreaOf(m: RoofModel): number {
  const idx = buildIndexes(m);
  return m.faces.reduce((s, f) => {
    const r = ringOf(f.lineIds, idx);
    return s + (r && r.length >= 3 ? Math.abs(areaOf(r.map((p) => ({ x: p.x, y: p.y })))) : 0);
  }, 0);
}
const errorCodesOf = (m: RoofModel): Set<string> =>
  new Set(validateRoofInvariants(m).results.filter((r) => r.level === "error").map((r) => r.id));

export interface WavefrontGateInput {
  /** The structure's regularised contour, frame feet, CCW. */
  contour: FootprintPoint[];
  /** The skeleton model as it would ship — already at the measured pitch. */
  skeletonModel: RoofModel;
  /** The DSM measurement behind that model. */
  measurement: PitchMeasurement;
  /** Whole-structure pitch, the fallback for edges with no cluster. */
  structurePitch12: number;
  structureIndex: number;
}

export interface WavefrontGateResult {
  /** Set only when the wavefront won. */
  model?: RoofModel;
  /** Facets whose measured drain marked their wall as a gable. */
  carriers: string[];
  /** Contour edges handed to the engine as vertical. */
  gableEdges: number[];
  /** Why the skeleton was kept, when it was. */
  refused?: string;
  /** Slope classes handed to the engine, for the record. */
  slopeClasses: Array<{ pitch12: number; edges: number }>;
}

export function tryWavefront(input: WavefrontGateInput): WavefrontGateResult {
  const { contour, skeletonModel, measurement } = input;
  const byLabel = new Map(measurement.facets.map((f) => [f.id, f]));
  const idx = buildIndexes(skeletonModel);

  interface FacetInfo {
    label: string;
    plan: FootprintPoint[];
    area: number;
    drain: number;
    dsmAz: number | null;
    dsmPitch: number | null;
    trusted: boolean;
  }
  const facets: FacetInfo[] = [];
  for (const f of skeletonModel.faces) {
    const ring = ringOf(f.lineIds, idx);
    if (!ring || ring.length < 3) continue;
    const label = String(f.designator || f.id);
    const m = byLabel.get(label);
    const plan = ring.map((p) => ({ x: p.x, y: p.y }));
    facets.push({
      label,
      plan,
      area: Math.abs(areaOf(plan)),
      drain: drainAzimuth(ring.map((p) => ({ x: p.x, y: p.y, z: p.z }))),
      dsmAz: m ? m.azimuthDeg : null,
      dsmPitch: m ? m.pitch12 : null,
      trusted: !!m && m.residualP50Ft <= DSM_NOISE_FLOOR_FT,
    });
  }
  if (facets.length < 3) return { carriers: [], gableEdges: [], slopeClasses: [], refused: "too few facets to judge" };

  // ── clusters: adjacency + DSM azimuth + DSM pitch (the step-1 rule) ──
  const shares = (a: FacetInfo, b: FacetInfo): boolean => {
    for (let i = 0; i < a.plan.length; i++) {
      const p = a.plan[i];
      const q = a.plan[(i + 1) % a.plan.length];
      const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      for (let j = 0; j < b.plan.length; j++) {
        const u = b.plan[j];
        const v = b.plan[(j + 1) % b.plan.length];
        const dx = v.x - u.x;
        const dy = v.y - u.y;
        const l2 = dx * dx + dy * dy;
        if (l2 < 1e-12) continue;
        const t = ((mid.x - u.x) * dx + (mid.y - u.y) * dy) / l2;
        if (t < -0.01 || t > 1.01) continue;
        if (Math.hypot(mid.x - (u.x + t * dx), mid.y - (u.y + t * dy)) < 0.05) return true;
      }
    }
    return false;
  };
  const cluster = new Map<FacetInfo, number>();
  let cid = 0;
  for (const f of facets) {
    if (f.dsmAz == null || cluster.has(f)) continue;
    cid++;
    const stack = [f];
    cluster.set(f, cid);
    while (stack.length) {
      const cur = stack.pop()!;
      for (const nb of facets) {
        if (nb === cur || nb.dsmAz == null || cluster.has(nb)) continue;
        if (!shares(cur, nb)) continue;
        if (azDiff(cur.dsmAz!, nb.dsmAz) <= CLUSTER_AZ_TOL_DEG && Math.abs((cur.dsmPitch ?? 0) - (nb.dsmPitch ?? 0)) <= SAME_SLOPE_12) {
          cluster.set(nb, cid);
          stack.push(nb);
        }
      }
    }
  }
  const clusterPitch = new Map<number, number>();
  for (let c = 1; c <= cid; c++) {
    const trusted = facets.filter((f) => cluster.get(f) === c && f.trusted && f.dsmPitch != null);
    const area = trusted.reduce((s, f) => s + f.area, 0);
    clusterPitch.set(
      c,
      area >= MIN_TRUSTED_SQFT ? trusted.reduce((s, f) => s + f.dsmPitch! * f.area, 0) / area : input.structurePitch12,
    );
  }

  // ── per-edge slope, and the carriers ──
  const slopes: number[] = [];
  const carriers: string[] = [];
  const gableEdges: number[] = [];
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % contour.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    let owner: FacetInfo | null = null;
    for (const f of facets) {
      for (let j = 0; j < f.plan.length && !owner; j++) {
        const u = f.plan[j];
        const v = f.plan[(j + 1) % f.plan.length];
        const dx = v.x - u.x;
        const dy = v.y - u.y;
        const l2 = dx * dx + dy * dy;
        if (l2 < 1e-12) continue;
        const t = ((mid.x - u.x) * dx + (mid.y - u.y) * dy) / l2;
        if (t < -0.01 || t > 1.01) continue;
        if (Math.hypot(mid.x - (u.x + t * dx), mid.y - (u.y + t * dy)) < 0.05) owner = f;
      }
      if (owner) break;
    }
    if (!owner) {
      slopes.push(input.structurePitch12 / 12);
      continue;
    }
    const isCarrier =
      len >= MIN_GABLE_WALL_FT &&
      owner.dsmAz != null &&
      owner.trusted &&
      azDiff(owner.drain, owner.dsmAz) >= GABLE_MIN_DEG &&
      facets.some((nb) => nb !== owner && nb.dsmAz != null && azDiff(nb.dsmAz, owner!.dsmAz!) <= CLUSTER_AZ_TOL_DEG);
    if (isCarrier) {
      slopes.push(Number.POSITIVE_INFINITY);
      gableEdges.push(i);
      if (!carriers.includes(owner.label)) carriers.push(owner.label);
      continue;
    }
    const c = cluster.get(owner);
    slopes.push((c != null ? clusterPitch.get(c)! : input.structurePitch12) / 12);
  }

  if (!gableEdges.length) {
    return { carriers, gableEdges, slopeClasses: [], refused: "no gable carrier — the skeleton already agrees with the roof" };
  }

  // ── slope classes ──
  const finite = slopes.map((s, i) => ({ s, i })).filter((x) => Number.isFinite(x.s)).sort((x, y) => x.s - y.s);
  const classes: number[][] = [];
  let last = -1;
  for (const x of finite) {
    if (classes.length && x.s * 12 - last <= SAME_SLOPE_12) classes[classes.length - 1].push(x.i);
    else classes.push([x.i]);
    last = x.s * 12;
  }
  for (const cls of classes) {
    const mean = cls.reduce((s, i) => s + slopes[i] * 12, 0) / cls.length;
    for (const i of cls) slopes[i] = mean / 12;
  }
  const slopeClasses = classes.map((cls) => ({ pitch12: slopes[cls[0]] * 12, edges: cls.length }));

  // ── run and judge ──
  const wf = weightedSkeleton(contour, slopes, { degenerateRetry: true });
  if (!wf) return { carriers, gableEdges, slopeClasses, refused: "the wavefront could not solve this outline" };
  const model = modelFromWavefront({ contour, slopes, result: wf, base: skeletonModel, structureIndex: input.structureIndex });
  if (!model) return { carriers, gableEdges, slopeClasses, refused: "the wavefront result could not be assembled" };

  const outline = Math.abs(areaOf(contour));
  const euler = eulerOf(model);
  if (euler !== 1) return { carriers, gableEdges, slopeClasses, refused: `wavefront Euler ${euler}` };
  const tiling = outline > 0 ? (Math.abs(planAreaOf(model) - outline) / outline) * 100 : 100;
  if (tiling >= MAX_TILING_PCT) return { carriers, gableEdges, slopeClasses, refused: `wavefront tiling off by ${tiling.toFixed(2)}%` };
  // the H3 identity: printed area must come from the drawn geometry
  const idx2 = buildIndexes(model);
  let fromAreas = 0;
  let fromRings = 0;
  for (const f of model.faces) {
    fromAreas += f.areaSqft / Math.sqrt(1 + (f.pitch / 12) ** 2);
    const r = ringOf(f.lineIds, idx2);
    if (r && r.length >= 3) fromRings += Math.abs(areaOf(r.map((p) => ({ x: p.x, y: p.y }))));
  }
  const identity = fromRings > 0 ? (Math.abs(fromAreas - fromRings) / fromRings) * 100 : 100;
  if (identity >= MAX_TILING_PCT) return { carriers, gableEdges, slopeClasses, refused: `wavefront area identity off by ${identity.toFixed(2)}%` };
  const before = errorCodesOf(skeletonModel);
  const after = errorCodesOf(model);
  const introduced = [...after].filter((c) => !before.has(c));
  if (introduced.length) {
    return { carriers, gableEdges, slopeClasses, refused: `wavefront introduces ${introduced.join(",")}` };
  }

  return { model, carriers, gableEdges, slopeClasses };
}
