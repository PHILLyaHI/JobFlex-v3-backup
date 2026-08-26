// Roof recon V2, phase 2 — TOPOLOGY FIRST, from the Instant contour.
//
// The old path hoped topology would happen and measured pitch: each plane
// cluster traced its own ring off the raster and simplified it alone, so
// neighbouring facets disagreed about the same physical line (H1,
// ROOF-DIAGNOSIS.md §E). This path inverts that. One contour, regularised
// once, and a straight skeleton grown from it — the topology is constructed,
// so it cannot come out non-simply-connected. Pitch is measured into those
// facets in phase 3; here every facet carries Instant's predominant pitch.
//
// Why the contour comes from Instant and not the mask (measured, not assumed):
//   • Instant's own area is derived from this very polygon —
//     totals.areaSqft = plan(outline) × slopeFactor(predominantPitch) held to
//     −0.06 % (Kirkland) and +0.07 % (Prairie). So the polygon IS the eave
//     line EagleView bills against, and it is the reference for our area.
//   • Google's building mask over-claims: on Kirkland it swallowed 543 sq ft
//     of ground beside the house (DSM there sits at 276.2 ft, the ground is
//     276.08, the roof is 295.3). Gate the mask to roof height and it agrees
//     with this contour to 0.6 %.
//
// Two things this path must NOT do, both established by measurement:
//   • It must not offset the ring outward for eave overhang
//     (calibrate.ts:2076). That offset exists because the outline was believed
//     to be the WALL footprint. It is not — see the area identity above — and
//     the default 1.5 ft offset would add +14.7 % (Kirkland) / +11.7 %
//     (Prairie) of roof that Instant never counted.
//   • It must not raise synthesize's MAX_VERTICES. Kirkland's 16-corner
//     contour is a tracing artifact (every turn 75–90°, wandering ±15° off
//     square); lifting the cap would build a roof on a crooked contour. The
//     regularisation below brings it inside the cap instead.
//
// Pure: contour in, model out. No I/O, no network.
import type { InstantRoofData, RoofModel } from "@/lib/eagleview";
import { instantWallRingsRaw } from "@/lib/roofDiagram/calibrate";
import { synthesizeRoofModel } from "@/lib/roofDiagram/synthesize";
import { areaOf, buildStructureFootprints, regularizeRing, type FootprintPoint, type RegularizeReport } from "@/lib/roofRecon/footprint";
import type { Raster } from "@/lib/solar";

/** Vertex cap — mirrors synthesize.ts, which refuses anything above it. Both
 *  are measured; see the constant there. */
const MAX_VERTICES = 64;
/** A skeleton facet is swept by exactly one contour edge, so on a single-mass
 *  roof the facet count IS the edge count — measured: Prairie 12 v → 12
 *  facets, 8 → 8, 6 → 6; Kirkland 14 → 14. That makes Instant's facetCount a
 *  measurement of how many sides the contour should have, and the vertex
 *  budget aims at it rather than at the skeleton's ceiling. The effect test
 *  still vetoes every individual removal, so a contour whose corners are all
 *  load-bearing simply stays where it is and the shortfall is reported. */
const MIN_BUDGET_VERTICES = 4;
/** Share of perimeter length that must sit within 3° of the 0/45/90 family. */
const MIN_FAMILY_SHARE = 0.85;
/**
 * A roof carries interior structure the outer contour cannot express when the
 * DSM found more planes than the contour has edges, plus this slack. Measured:
 * `clusters` predicted Instant's facetCount to within 2 on both fixtures
 * (Kirkland 12 vs 10, Prairie 20 vs 22), and it is free — it comes out of the
 * reconstruction diagnostics, before any Instant call.
 */
const MULTI_MASS_SLACK = 2;

/** Regularisation thresholds, exposed ONLY so the breadth harness can vary
 *  them against a sample and report sensitivity. Production passes nothing and
 *  gets the constants above. */
export interface ReconV2Tuning {
  simplifyFt?: number;
  snapTolDeg?: number;
  maxCornerShiftFt?: number;
  collinearMergeDeg?: number;
  minEdgeFt?: number;
  minFamilyShare?: number;
  maxVertices?: number;
}

export interface ReconV2Input {
  instant: InstantRoofData;
  origin: { lat: number; lng: number };
  /** Plane clusters the DSM segmentation found — the multi-mass detector. */
  clusters?: number | null;
  tuning?: ReconV2Tuning;
}

export interface ReconV2Structure {
  /** A/B/C… — the facet-lettering prefix this structure owns. */
  prefix: string;
  ring: FootprintPoint[] | null;
  regularize: RegularizeReport;
  /** Contour area AFTER regularisation — what the facet areas are checked on. */
  contourAreaSqft: number;
  /** Contour area as Instant sent it, before regularisation. */
  instantAreaSqft: number;
  contourEdges: number;
  clusters: number | null;
  instantFacetCount: number | null;
  /** Interior structure the outer contour cannot carry — not a failure. */
  multiMass: boolean;
  notes: string[];
}

export interface ReconV2Report {
  structures: ReconV2Structure[];
  /** Facets the skeleton produced across all structures. */
  facets: number;
  gableEnds: number;
  pitch12: number | null;
  /** Instant facetCount minus what the skeleton grew; positive = interior
   *  structure is missing, and on a multi-mass roof that is expected. */
  facetDeficit: number | null;
  /** Every reason the contour or the skeleton fell short. */
  reasons: string[];
  synthesizeFailed: string[];
}

export interface ReconV2Result {
  model: RoofModel | null;
  report: ReconV2Report;
}

/** Off by default; the old path keeps shipping until the final acceptance. */
export function roofReconV2Enabled(): boolean {
  const v = process.env.ROOF_RECON_V2;
  return v === "1" || v === "true" || v === "on";
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Build the phase-2 model: Instant contour → the phase-1 regularisation pass →
 * straight skeleton. Returns `model: null` when no structure survived, with
 * the reasons on the report — never throws, and never bends the contour to
 * make the skeleton start.
 */
export function buildRoofV2(input: ReconV2Input): ReconV2Result {
  const { instant, origin } = input;
  const reasons: string[] = [];
  const clusters = input.clusters ?? null;

  const pitchRaw = instant.totals?.predominantPitch ?? null;
  const pitch12 = pitchRaw != null && Number.isFinite(pitchRaw) && pitchRaw > 0 ? pitchRaw : null;
  if (pitch12 == null) reasons.push("Instant carries no usable predominant pitch");

  // Instant's rings, largest first — the same order the facet counts come in.
  const raw = instantWallRingsRaw(instant, origin).sort((a, b) => areaOf(b) - areaOf(a));
  if (raw.length === 0) {
    return {
      model: null,
      report: { structures: [], facets: 0, gableEnds: 0, pitch12, facetDeficit: null, reasons: [...reasons, "Instant returned no outline"], synthesizeFailed: [] },
    };
  }
  const facetCounts = [...instant.structures]
    .filter((s) => s.outline && s.outline.length >= 3)
    .sort((a, b) => (b.areaSqft ?? b.footprintSqft ?? 0) - (a.areaSqft ?? a.footprintSqft ?? 0))
    .map((s) => s.facetCount ?? null);

  const tune = input.tuning ?? {};
  const cap = tune.maxVertices ?? MAX_VERTICES;
  const opts = {
    ...(tune.simplifyFt != null ? { simplifyFt: tune.simplifyFt } : {}),
    ...(tune.snapTolDeg != null ? { snapTolDeg: tune.snapTolDeg } : {}),
    ...(tune.maxCornerShiftFt != null ? { maxCornerShiftFt: tune.maxCornerShiftFt } : {}),
    ...(tune.collinearMergeDeg != null ? { collinearMergeDeg: tune.collinearMergeDeg } : {}),
    ...(tune.minEdgeFt != null ? { minEdgeFt: tune.minEdgeFt } : {}),
    minFamilyShare: tune.minFamilyShare ?? MIN_FAMILY_SHARE,
  };
  const structures: ReconV2Structure[] = [];
  const usable: FootprintPoint[][] = [];
  raw.forEach((ring, i) => {
    const notes: string[] = [];
    // First pass at the ceiling, only to learn how many sides the contour
    // really has once it is square — the multi-mass test needs that number.
    const probe = regularizeRing(ring, { ...opts, maxVertices: cap });
    // The detector runs on the WHOLE roof's cluster count, so it is only
    // meaningful on a single-ring lot; on a multi-ring lot the clusters belong
    // to several buildings and cannot be attributed to one contour.
    const attributable = raw.length === 1 ? clusters : null;
    const multiMass = attributable != null && attributable > probe.ring.length + MULTI_MASS_SLACK;
    // On a single-mass roof aim the budget at Instant's facet count; on a
    // multi-mass one the contour is not supposed to match it, so leave the
    // ceiling alone.
    const wanted = facetCounts[i];
    const budget =
      !multiMass && wanted != null && Number.isFinite(wanted)
        ? Math.max(MIN_BUDGET_VERTICES, Math.min(cap, wanted))
        : cap;
    const reg = budget === cap ? probe : regularizeRing(ring, { ...opts, maxVertices: budget });
    const edges = reg.ring.length;
    // The budget is an aim, not a gate: only the skeleton's own ceiling can
    // refuse a contour. Falling short means some corners are load-bearing.
    const withinCap = edges <= cap;
    if (budget < cap) {
      notes.push(
        `vertex budget ${budget} from Instant's facetCount ${wanted} (one facet per contour edge)` +
          (edges > budget ? ` — stopped at ${edges}, the remaining corners are load-bearing` : ""),
      );
    }
    if (multiMass) {
      notes.push(
        `multi-mass: ${attributable} plane clusters against ${edges} contour edges — the roof carries interior structure ` +
          "(cross gable, sub-roof, wing) that a skeleton on the outer contour cannot grow",
      );
    }
    if (!withinCap) notes.push(`contour still has ${edges} vertices, over the ${cap} cap — the skeleton will refuse it`);
    if (!reg.report.asserts.angles) notes.push(`only ${(reg.report.familyShare * 100).toFixed(1)}% of the perimeter is on the family`);
    if (!reg.report.simple) notes.push("regularised contour is not simple");

    structures.push({
      prefix: LETTERS[i] ?? `S${i}`,
      ring: reg.report.simple ? reg.ring : null,
      regularize: reg.report,
      contourAreaSqft: reg.report.areaSqft,
      instantAreaSqft: areaOf(ring),
      contourEdges: edges,
      clusters: attributable,
      instantFacetCount: facetCounts[i] ?? null,
      multiMass,
      notes,
    });
    // A contour over the cap or self-intersecting is not handed to the
    // skeleton — it would be rejected there anyway, silently (synthesize.ts:403).
    if (reg.report.simple && withinCap) usable.push(reg.ring);
    else reasons.push(`structure ${LETTERS[i] ?? i}: contour not usable — ${notes.join("; ") || "unknown"}`);
  });

  if (usable.length === 0) {
    return { model: null, report: { structures, facets: 0, gableEnds: 0, pitch12, facetDeficit: null, reasons: [...reasons, "no usable contour"], synthesizeFailed: [] } };
  }

  // NOTE: `outlines` goes in AS IS. No offsetRingOutward — see the file header.
  const synth = synthesizeRoofModel({
    outlines: usable,
    recon: null,
    instantPitch: pitch12,
    // A contour regularised to exact right angles makes wavefront events
    // exactly simultaneous — see skeleton.ts SkeletonOptions.
    degenerateRetry: true,
    ...(pitch12 != null ? { forcePitch: pitch12 } : {}),
  });
  if (!synth) {
    return { model: null, report: { structures, facets: 0, gableEnds: 0, pitch12, facetDeficit: null, reasons: [...reasons, "skeleton produced no structure"], synthesizeFailed: [] } };
  }

  const instantFacets = instant.totals?.facetCount ?? null;
  return {
    model: synth.model,
    report: {
      structures,
      facets: synth.model.faces.length,
      gableEnds: synth.report.gableEnds,
      pitch12,
      facetDeficit: instantFacets != null ? instantFacets - synth.model.faces.length : null,
      reasons,
      synthesizeFailed: synth.report.failed ?? [],
    },
  };
}

// ── fallback: no Instant ─────────────────────────────────────────────────────

/**
 * Height above local ground a mask pixel must reach to count as roof.
 *
 * Measured on the two houses that have both a mask and a contour. Google's
 * building mask over-claims: on Kirkland it swallowed 543 sq ft of ground
 * beside the house, sitting at 276.2 ft against a ground elevation of 276.08
 * and a roof at 295.3. Gate the mask at ground + 4 ft and the survivor agrees
 * with the Instant contour to 0.6 % (2066 vs 2079 sq ft); Prairie lands within
 * 1.1 % (3311 vs 3274).
 *
 * The threshold is deliberately LOW and deliberately measured from the GROUND,
 * not from the roof. Prairie's perimeter fringe sits 12.9 ft above the ground
 * and 13.5 ft below the main roof: that is a porch or a garage, real roof that
 * a "close to the roof height" rule would have thrown away — the same mistake
 * that cost Redmond its second structure, 664 sq ft, a 30 % undercount.
 */
const ROOF_MIN_HEIGHT_FT = 4;
const FT_PER_M = 3.28084;

export interface ReconV2FallbackInput {
  /** Google Solar building mask, 1 = building. */
  mask: Raster;
  /** Google Solar DSM in METRES — the raster is not in feet. */
  dsm: Raster;
  groundElevFt: number;
  /** Parcel ring in frame feet; decides which mask blobs belong to this lot. */
  parcel?: FootprintPoint[] | null;
  /** Predominant pitch from the reconstruction (rise/12). */
  pitch12: number | null;
}

/**
 * Build the roof WITHOUT Instant: gate the mask to roof height, take one
 * outline per structure, regularise, grow the skeleton. Same pass as the
 * Instant path from the contour onward — only where the contour comes from
 * differs, and it is a noisier source, so the vertex cap bites more often.
 *
 * There is no facetCount here, so the vertex budget cannot aim at anything and
 * is left at the skeleton's ceiling.
 */
export function buildRoofV2FromRecon(input: ReconV2FallbackInput): ReconV2Result {
  const reasons: string[] = [];
  const { mask, dsm } = input;
  const cutM = (input.groundElevFt + ROOF_MIN_HEIGHT_FT) / FT_PER_M;
  const gated: Raster = {
    ...mask,
    data: mask.data.map((v, i) => {
      const z = dsm.data[i];
      return v > 0 && Number.isFinite(z) && z >= cutM ? v : 0;
    }),
  } as Raster;

  const res = buildStructureFootprints(gated, {
    ...(input.parcel ? { parcel: input.parcel } : {}),
    maxVertices: MAX_VERTICES,
    minFamilyShare: MIN_FAMILY_SHARE,
  });

  const pitch12 = input.pitch12 != null && Number.isFinite(input.pitch12) && input.pitch12 > 0 ? input.pitch12 : null;
  const structures: ReconV2Structure[] = [];
  const usable: FootprintPoint[][] = [];
  for (const st of res.structures) {
    const notes: string[] = [];
    const ring = st.ring;
    if (!ring) {
      notes.push(st.report.reasons[0] ?? "no outline for this structure");
    } else if (ring.length > MAX_VERTICES) {
      notes.push(`contour has ${ring.length} vertices, over the ${MAX_VERTICES} cap — the skeleton will refuse it`);
    }
    structures.push({
      prefix: st.prefix,
      ring: ring && ring.length <= MAX_VERTICES ? ring : null,
      regularize: {
        vertices: st.report.vertices,
        edgesUnder3Ft: st.report.edgesUnder3Ft,
        perimeterFt: st.report.perimeterFt,
        areaSqft: st.report.areaSqft,
        rawAreaSqft: st.maskAreaSqft,
        axisDeg: st.report.axisDeg,
        worstAngleDeviationDeg: st.report.worstAngleDeviationDeg,
        familyShare: st.report.familyShare,
        offFamily: st.report.offFamily,
        staircaseEdgesRemoved: st.report.staircaseEdgesRemoved,
        budgetEdgesRemoved: [],
        maxCornerShiftFt: st.report.maxCornerShiftFt,
        simple: !!ring,
        asserts: st.report.asserts,
        reasons: st.report.reasons,
      },
      contourAreaSqft: st.report.areaSqft,
      instantAreaSqft: st.maskAreaSqft,
      contourEdges: ring?.length ?? 0,
      clusters: null,
      instantFacetCount: null,
      multiMass: false,
      notes,
    });
    if (ring && ring.length <= MAX_VERTICES) usable.push(ring);
    else reasons.push(`structure ${st.prefix}: ${notes.join("; ") || "unusable contour"}`);
  }

  if (!usable.length) {
    return { model: null, report: { structures, facets: 0, gableEnds: 0, pitch12, facetDeficit: null, reasons: [...reasons, "no usable contour after the height gate"], synthesizeFailed: [] } };
  }
  const synth = synthesizeRoofModel({
    outlines: usable,
    recon: null,
    instantPitch: pitch12,
    degenerateRetry: true,
    ...(pitch12 != null ? { forcePitch: pitch12 } : {}),
  });
  if (!synth) {
    return { model: null, report: { structures, facets: 0, gableEnds: 0, pitch12, facetDeficit: null, reasons: [...reasons, "skeleton produced no structure"], synthesizeFailed: [] } };
  }
  return {
    model: synth.model,
    report: {
      structures,
      facets: synth.model.faces.length,
      gableEnds: synth.report.gableEnds,
      pitch12,
      facetDeficit: null,
      reasons,
      synthesizeFailed: synth.report.failed ?? [],
    },
  };
}
