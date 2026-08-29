// The measured roof: layout led by the DSM, the skeleton demoted to filler.
//
// The owner's decision after the source ablation: ablation run 2 showed the
// DSM finding the real layout — ridges, valleys, 62 ft of rakes in their
// places — with only the execution untidy, while the skeleton's equal-pitch
// assumption invents a cross of hips that survives every later layer. Step 1
// then measured the layout INSIDE the Instant contour: 90-97% of a suburban
// roof is held by measured clusters, ridges 24-83 ft where the skeleton draws
// 4-19, and the crown junk dies at the contour. So the roles become:
//
//   contour   Instant (regularised, registered)     — as before
//   layout    the DSM's own clusters                — this module
//   filler    the skeleton, ONLY where no trusted DSM (per structure)
//   veto      lidar / Hough / vision                — unchanged
//
// HOW: clip the building mask to the registered Instant contour and hand it to
// reconstructRoof itself — the full machinery (clustering, leftover claiming,
// ring tracing, axis snapping, edge welding, RIDGE/HIP/VALLEY/RAKE
// classification) runs unchanged inside the contour; a re-implementation would
// be §K7. The result is carried back into the Instant frame and its perimeter
// is conformed onto the contour by conformPerimeterToRing — the same machinery
// the calibrated path used for vision outlines.
//
// A structure whose measured share is below COVERAGE_FLOOR keeps the skeleton
// (provenance skeleton-fill): below that floor the pipeline already says "not
// resolved", and a layout led by unmeasured pixels would be the skeleton's
// assumption wearing measurement's clothes.
import type { RoofModel } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { reconstructRoof } from "@/lib/roofRecon";
import { conformPerimeterToRing } from "@/lib/roofDiagram/conformOutline";
import { COVERAGE_FLOOR } from "@/lib/roofDiagram/confidence";
import { validateRoofInvariants } from "@/lib/roofDiagram/validate";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";
import { areaOf, type FootprintPoint } from "@/lib/roofRecon/footprint";

const FT_PER_M = 3.28084;
/** The step-2 guard: no facet under this survives the stitch. */
const MIN_FACET_SQFT = 15;

export interface MeasuredRoofResult {
  model: RoofModel | null;
  /** The conformed measured model even when guards rejected it — so a reviewer
   *  can SEE what was rejected instead of taking the codes' word for it. */
  rejectedCandidate?: RoofModel;
  /** Per-line/facet source: every id present was measured; the rest is fill. */
  engine: "measured-dsm" | "skeleton-fill";
  measuredShare: number;
  conform: { vertsMoved: number; maxMoveFt: number; reverted: number } | null;
  guards: { euler: number; tilingPct: number; errorCodes: string[]; smallFacets: number };
  reasons: string[];
}

export interface MeasuredRoofInput {
  dsm: Raster;
  mask: Raster;
  /** Regularised Instant contour, Instant frame. */
  contour: FootprintPoint[];
  /** Registration Instant→raster. */
  transform: { dxFt: number; dyFt: number; thetaDeg: number };
  /** The skeleton for this structure — the filler and the fallback. */
  skeleton: RoofModel;
}

const inRing = (p: { x: number; y: number }, r: ReadonlyArray<{ x: number; y: number }>): boolean => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if (r[i].y > p.y !== r[j].y > p.y && p.x < ((r[j].x - r[i].x) * (p.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) inside = !inside;
  }
  return inside;
};

const eulerOf = (m: RoofModel): number =>
  new Set(m.points.map((p) => p.id)).size - new Set(m.lines.map((l) => l.id)).size + m.faces.length;

function guardsOf(m: RoofModel, contourSqft: number) {
  const idx = buildIndexes(m);
  let plan = 0;
  let small = 0;
  for (const f of m.faces) {
    const r = ringOf(f.lineIds, idx);
    if (!r || r.length < 3) continue;
    const a = Math.abs(areaOf(r.map((q) => ({ x: q.x, y: q.y }))));
    plan += a;
    if (a < MIN_FACET_SQFT) small++;
  }
  const errorCodes = [...new Set(validateRoofInvariants(m).results.filter((x) => x.level === "error").map((x) => x.id))];
  return {
    euler: eulerOf(m),
    tilingPct: contourSqft > 0 ? Math.abs(plan - contourSqft) / contourSqft * 100 : 0,
    errorCodes,
    smallFacets: small,
  };
}

export function buildMeasuredRoof(input: MeasuredRoofInput): MeasuredRoofResult {
  const { dsm, mask, contour, transform: T, skeleton } = input;
  const reasons: string[] = [];
  const contourSqft = Math.abs(areaOf(contour));

  // ── the contour, in raster frame ──
  const th = (T.thetaDeg * Math.PI) / 180;
  const moved = contour.map((p) => ({
    x: p.x * Math.cos(th) - p.y * Math.sin(th) + T.dxFt,
    y: p.x * Math.sin(th) + p.y * Math.cos(th) + T.dyFt,
  }));

  // ── clip the mask to it ──
  const w = mask.width;
  const h = mask.height;
  const stepFt = mask.pixelSizeM * FT_PER_M;
  const cx = w / 2;
  const cy = h / 2;
  const clipped = new Float32Array(w * h);
  let contourPx = 0;
  let maskPx = 0;
  for (let i = 0; i < w * h; i++) {
    const p = { x: ((i % w) + 0.5 - cx) * stepFt, y: (cy - Math.floor(i / w) - 0.5) * stepFt };
    if (!inRing(p, moved)) continue;
    contourPx++;
    if (mask.data[i] > 0.5) {
      clipped[i] = 1;
      maskPx++;
    }
  }
  const measuredShare = contourPx ? maskPx / contourPx : 0;
  if (measuredShare < COVERAGE_FLOOR) {
    reasons.push(
      `only ${(measuredShare * 100).toFixed(0)}% of the contour is covered by usable elevation data — below the ${COVERAGE_FLOOR * 100}% floor the pipeline already treats as "not resolved", so the skeleton fills this structure whole`,
    );
    return {
      model: skeleton,
      engine: "skeleton-fill",
      measuredShare,
      conform: null,
      guards: guardsOf(skeleton, contourSqft),
      reasons,
    };
  }

  // ── the full reconstruction, inside the contour only ──
  const recon = reconstructRoof(dsm as never, { ...mask, data: clipped } as never, { minFacetSqft: MIN_FACET_SQFT });
  if (!recon.model.faces.length) {
    reasons.push("the reconstruction resolved no planes inside the contour — skeleton fill");
    return { model: skeleton, engine: "skeleton-fill", measuredShare, conform: null, guards: guardsOf(skeleton, contourSqft), reasons };
  }

  // ── back into the Instant frame ──
  const inv = (p: { x: number; y: number }) => {
    const x = p.x - T.dxFt;
    const y = p.y - T.dyFt;
    return { x: x * Math.cos(-th) - y * Math.sin(-th), y: x * Math.sin(-th) + y * Math.cos(-th) };
  };
  const model: RoofModel = JSON.parse(JSON.stringify(recon.model)) as RoofModel;
  for (const p of model.points) {
    const q = inv(p);
    p.x = q.x;
    p.y = q.y;
  }

  // ── the perimeter onto the contour ──
  const conform = conformPerimeterToRing(model, contour);
  const guards = guardsOf(conform.model, contourSqft);

  // The stitch must not ship worse topology than the skeleton it replaces.
  if (guards.euler !== 1 || guards.errorCodes.includes("R03") || guards.errorCodes.includes("R04")) {
    reasons.push(
      `stitched model fails hard guards (Euler ${guards.euler}, codes ${guards.errorCodes.join("/") || "none"}) — skeleton kept`,
    );
    return {
      model: skeleton,
      engine: "skeleton-fill",
      rejectedCandidate: conform.model,
      measuredShare,
      conform: conform.report,
      guards: guardsOf(skeleton, contourSqft),
      reasons,
    };
  }
  if (guards.smallFacets > 0) reasons.push(`${guards.smallFacets} facet(s) under ${MIN_FACET_SQFT} sq ft survived tracing`);

  return {
    model: conform.model,
    engine: "measured-dsm",
    measuredShare,
    conform: conform.report,
    guards,
    reasons,
  };
}
