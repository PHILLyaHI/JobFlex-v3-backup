// Is the model COMPLETE — not merely consistent with itself?
//
// ROOF-STATE §J, the first-level rule: invariants check that a model agrees
// with ITSELF, and none checks that it is whole. An omission does not look like
// an error; it looks like "less". And re-summing the same set a second way is
// not a check — the lost term is missing from both sums and the identity closes
// perfectly. R05 is exactly that: it chains its "outline" from the model's own
// boundary lines, so deleting a face and its lines shrinks both sides equally
// and R05 passes clean.
//
// The audit that produced this module found the worst case on the branch: a
// whole STRUCTURE can vanish — a contour that self-intersects or exceeds the
// vertex cap never reaches the skeleton, a structure the skeleton cannot solve
// is dropped from the faces — and nothing fails. The area becomes the sum of
// the survivors, R05 closes over the survivors, Euler is clean, the drawing is
// handsome, and the contractor gets a plan of the house with the detached
// garage simply not on it.
//
// So every check here compares a total against a value from OUTSIDE the sum:
// the contours that went in, and EagleView's own count and footprint.

import type { InstantRoofData, RoofModel } from "@/lib/eagleview";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";
import { areaOf, type FootprintPoint } from "@/lib/roofRecon/footprint";

/**
 * How far a drawn plan area may sit from the contour it was grown on. The same
 * figure the pipeline already uses for a two-source area comparison — the
 * roof-material cross-check in instantSurvey.ts — and the complement of
 * COVERAGE_CLEAR. No new number.
 */
const AREA_TOLERANCE = 0.05;
/**
 * EagleView's own facet count is only worth comparing against when EagleView
 * believes it. The same half it takes to aim the vertex budget: below that its
 * own score says the count is more likely wrong than right (measured: 0.189 on
 * 419 Prairie, against 0.59+ for every other field on that roof).
 */
const FACET_COUNT_MIN_CONFIDENCE = 0.5;

export interface CompletenessFinding {
  /** `error` means something is missing from the drawing, not merely uncertain. */
  level: "error" | "warn";
  code: "STRUCTURE_MISSING" | "PLAN_AREA_SHORT" | "FACETS_SHORT" | "FOOTPRINT_MISMATCH";
  message: string;
}

export interface CompletenessReport {
  findings: CompletenessFinding[];
  /** Structures that went in, and how many are represented in the drawing. */
  structuresIn: number;
  structuresDrawn: number;
  /** Plan area of the drawn facets against the contours they were grown on. */
  planSqft: number;
  contourSqft: number;
  planShortfallPct: number;
  /** Instant's facet count minus ours, when its own confidence allows the test. */
  facetDeficit: number | null;
  facetDeficitShare: number | null;
}

export interface CompletenessInput {
  /** The model as it will ship. */
  model: RoofModel;
  /** Every structure that reached the builder, whether or not it produced a ring. */
  structures: ReadonlyArray<{ prefix: string; ring: FootprintPoint[] | null; contourAreaSqft: number; nestedIn?: string }>;
  /**
   * Structures the skeleton was handed and could not solve, by the builder's
   * own account. This is the authoritative list: facet DESIGNATORS do not
   * encode structures — one building routinely produces both `A…` and `B…`
   * letters, because the lettering ranks facet groups by area across the lot.
   */
  synthesizeFailed?: readonly string[];
  /** Present on the Instant path — the external count and footprint. */
  instant?: InstantRoofData | null;
  /** EagleView's confidence in its own facet count, when it scored one. */
  facetCountConfidence?: number | null;
}

const planAreaOf = (m: RoofModel): number => {
  const idx = buildIndexes(m);
  return m.faces.reduce((s, f) => {
    const r = ringOf(f.lineIds, idx);
    return s + (r && r.length >= 3 ? Math.abs(areaOf(r.map((p) => ({ x: p.x, y: p.y })))) : 0);
  }, 0);
};

export function checkCompleteness(input: CompletenessInput): CompletenessReport {
  const { model, structures, instant } = input;
  const findings: CompletenessFinding[] = [];

  // ── 1. did every structure that went in come out? ──
  const wentIn = structures.filter((s) => s.ring && s.ring.length >= 3);
  const failed = input.synthesizeFailed ?? [];
  for (const f of failed) {
    findings.push({
      level: "error",
      code: "STRUCTURE_MISSING",
      message: `One of the buildings on this lot has an outline but no roof in this drawing (${f}). The area and the linear footage below are short by that whole building.`,
    });
  }
  // A structure that never produced a ring at all is a different loss, and the
  // one the coverage gate cannot see: it is in neither the covered nor the
  // uncovered list, so nothing downstream mentions it.
  for (const s of structures) {
    if (s.ring && s.ring.length >= 3) continue;
    findings.push({
      level: "error",
      code: "STRUCTURE_MISSING",
      message: `Building ${s.prefix} could not be turned into a usable outline, so it is not on this drawing at all. Everything below describes the rest of the lot.`,
    });
  }

  // ── 2. does the drawn plan cover the contours it was grown on? ──
  // Pitch-independent on both sides, so a measured pitch that differs from the
  // published one cannot fake a shortfall. Nested outlines are skipped: their
  // plan area double-counts on BOTH sides and the comparison is meaningless.
  const nested = structures.some((s) => s.nestedIn);
  const contourSqft = wentIn.reduce((s2, s) => s2 + s.contourAreaSqft, 0);
  const planSqft = planAreaOf(model);
  const planShortfallPct = contourSqft > 0 ? ((contourSqft - planSqft) / contourSqft) * 100 : 0;
  if (!nested && contourSqft > 0 && planShortfallPct > AREA_TOLERANCE * 100) {
    findings.push({
      level: "error",
      code: "PLAN_AREA_SHORT",
      message: `The drawn roof covers ${Math.round(planSqft).toLocaleString("en-US")} sq ft of ground against the ${Math.round(contourSqft).toLocaleString("en-US")} sq ft of building outline it was built from — ${planShortfallPct.toFixed(1)}% of the footprint has no facet on it.`,
    });
  }

  // ── 3. EagleView's own count, when EagleView believes it ──
  const instantFacets = instant?.totals?.facetCount ?? null;
  const conf = input.facetCountConfidence ?? null;
  const countTrusted = instantFacets != null && (conf == null || conf >= FACET_COUNT_MIN_CONFIDENCE);
  const facetDeficit = countTrusted ? (instantFacets as number) - model.faces.length : null;
  const facetDeficitShare =
    facetDeficit != null && instantFacets ? facetDeficit / instantFacets : null;

  // ── 4. EagleView's own footprint, the external value nothing has ever read ──
  const instantFootprint = instant?.totals?.footprintSqft ?? null;
  if (!nested && instantFootprint != null && instantFootprint > 0 && contourSqft > 0) {
    const gap = Math.abs(contourSqft - instantFootprint) / instantFootprint;
    if (gap > AREA_TOLERANCE) {
      findings.push({
        level: "warn",
        code: "FOOTPRINT_MISMATCH",
        message: `The outlines this drawing was built from cover ${Math.round(contourSqft).toLocaleString("en-US")} sq ft, while EagleView's own footprint figure for the same buildings is ${Math.round(instantFootprint).toLocaleString("en-US")} sq ft — a ${(gap * 100).toFixed(0)}% disagreement about the size of the building itself.`,
      });
    }
  }

  return {
    findings,
    structuresIn: wentIn.length,
    structuresDrawn: wentIn.length - failed.length,
    planSqft,
    contourSqft,
    planShortfallPct,
    facetDeficit,
    facetDeficitShare,
  };
}
