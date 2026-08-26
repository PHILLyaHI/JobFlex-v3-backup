// How much of this roof do we actually know, and what may be done with it.
//
// The old rule was "any invariant error hides the plan". That is backwards, and
// the branch's own history says why: of the five failure classes the breadth
// sample turned up, four were defects in the RULES or arbitrary constants, not
// in the roofs — R11 fires on any two wings of unequal width, R12 demands 45°
// at a 135° corner, the 20 sq ft facet floor catches a legitimate bay window,
// EPS_Z made a 40 ft ridge prove itself level to 0.125 %, and MAX_VERTICES was
// a number nobody had measured. Hiding a drawing behind those hides a correct
// roof from the person who asked for it.
//
// So the drawing and the estimate are gated separately.
//
//   DRAWN — always, unless the roof cannot be SEEN. One condition: how much of
//   the building mask survives the "above ground + 4 ft" height gate, against
//   the contour it should fill. Under the floor, trees or shadow or poor
//   imagery are covering the roof and there is nothing honest to draw.
//
//   ESTIMATED — only when the geometry itself holds up. A facet that is not
//   planar (R03) or whose pitch does not match its own geometry (R04) is a real
//   defect: every printed figure is computed from that geometry, so pricing off
//   it misprices the job. Everything else is drawn with a flag.
//
// Between those two sits the honest middle: a roof at 80 % visibility is 20 %
// inferred, and a contractor is owed that number rather than a clean-looking
// plan that quietly guessed a fifth of itself.

/** Below this share of the contour actually seen, nothing is drawn. */
export const COVERAGE_FLOOR = 0.7;
/**
 * Above this, what was inferred fits inside the waste factor a contractor
 * already carries on the order, so the figures can be used as they stand.
 * Measured: both fixtures with a mask sit at ~101 % (Kirkland 2100 sq ft seen
 * against a 2079 sq ft contour, Prairie 3311 against 3274), so a real roof
 * lands at full coverage and any material shortfall is genuinely obscured.
 */
export const COVERAGE_CLEAR = 0.95;

/** Invariants that mean the geometry itself is wrong, not the rule about it. */
export const ESTIMATE_BLOCKING_CODES: readonly string[] = ["R03", "R04"];

export type RoofConfidence = "high" | "medium" | "low";

export interface RoofCoverage {
  /** Mask area that passed the height gate, sq ft. */
  seenSqft: number;
  /** Area of the contour the roof was drawn on, sq ft. */
  contourSqft: number;
  /** seenSqft / contourSqft. */
  share: number;
}

export interface RoofAssessment {
  confidence: RoofConfidence;
  /** False only when the roof cannot be seen well enough to draw anything. */
  drawable: boolean;
  /** False when the geometry itself is defective — figures must not be priced. */
  estimable: boolean;
  /** Share of the roof that was inferred rather than seen, 0–1, when known. */
  inferredShare: number | null;
  /** Plain sentences for the user. Never codes, never counts of checks. */
  reasons: string[];
}

/**
 * Judge a measurement. `coverage` is null when there was no reconstruction to
 * measure it from (the outline-only path) — that is not a reason to withhold
 * anything, only a reason not to claim high confidence.
 */
export function assessRoof(input: {
  coverage: RoofCoverage | null;
  /** Error codes the invariant validator reported, if it could read the model. */
  errorCodes: readonly string[];
  /** True when the validator could not read the model at all (its INPUT case). */
  cannotValidate?: boolean;
}): RoofAssessment {
  const { coverage, errorCodes } = input;
  const reasons: string[] = [];

  const share = coverage?.share ?? null;
  const inferredShare = share == null ? null : Math.max(0, 1 - share);

  if (share != null && share < COVERAGE_FLOOR) {
    return {
      confidence: "low",
      drawable: false,
      estimable: false,
      inferredShare,
      reasons: [
        `Only ${Math.round(share * 100)}% of this roof is visible from above — trees, shadow or the imagery itself are covering the rest.`,
        "There is not enough of it to draw a plan you could rely on.",
      ],
    };
  }

  const geometryBad = ESTIMATE_BLOCKING_CODES.some((c) => errorCodes.includes(c));
  if (geometryBad) {
    reasons.push(
      "Some facets do not hold together geometrically — they are not flat, or their pitch disagrees with their own shape.",
      "The plan is drawn so you can see the roof, but the area and footage are not reliable enough to price from.",
    );
  }

  if (input.cannotValidate) {
    reasons.push("This drawing could not be checked against the roof rules, so treat its figures as provisional.");
  }

  if (share != null && share < COVERAGE_CLEAR) {
    reasons.push(
      `About ${Math.round((inferredShare ?? 0) * 100)}% of the roof is hidden from above and has been inferred from the rest.`,
      "Carry an extra allowance on material for the inferred part, or measure it on site.",
    );
  }

  const confidence: RoofConfidence =
    geometryBad || (share != null && share < COVERAGE_CLEAR)
      ? geometryBad
        ? "low"
        : "medium"
      : input.cannotValidate || share == null
        ? "medium"
        : errorCodes.length > 0
          ? "medium"
          : "high";

  if (confidence === "medium" && reasons.length === 0) {
    reasons.push(
      errorCodes.length > 0
        ? "The drawing does not satisfy every roof rule. The shapes and figures are usable; check the plan against the aerial view before pricing."
        : "There was no aerial elevation data to check this drawing against, so its figures are provisional.",
    );
  }

  return { confidence, drawable: true, estimable: !geometryBad, inferredShare, reasons };
}

/** One short line for a badge. */
export const confidenceLabel = (c: RoofConfidence): string =>
  c === "high" ? "MEASURED" : c === "medium" ? "MEASURED — CHECK BEFORE PRICING" : "DRAFT — MEASURE ON SITE";
