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
export interface StructureCoverageInput {
  prefix: string;
  contourSqft: number;
  share: number | null;
}

export function assessRoof(input: {
  coverage: RoofCoverage | null;
  /**
   * Per-structure coverage, when the measurement knows it. The floor then
   * applies to each STRUCTURE: a barn outside the Solar tile is flagged
   * individually and drawn from its outline, instead of its 0 % dragging the
   * aggregate under the floor and hiding the whole farmstead (12117 202nd St
   * SE: aggregate 20 %, house fully covered). Absent → the aggregate rules,
   * exactly as before.
   */
  structures?: StructureCoverageInput[] | null;
  /** Error codes the invariant validator reported, if it could read the model. */
  errorCodes: readonly string[];
  /** True when the validator could not read the model at all (its INPUT case). */
  cannotValidate?: boolean;
  /**
   * Set when the pitch could not be measured and EagleView's published one was
   * used. On a roof under solar panels the elevation data describes the panels,
   * not the roof — the GEOMETRY is unaffected, so this is a note about where one
   * number came from, not a defect. Without it such a roof reads as low
   * confidence for a reason that is not its fault.
   */
  pitchSource?: { source: "measured" | "instant"; reason: string; solarPanels?: boolean; trustedShare?: number } | null;
}): RoofAssessment {
  const { coverage, errorCodes } = input;
  const reasons: string[] = [];

  const structs = input.structures?.length ? input.structures : null;
  const coveredStructs = structs?.filter((st) => st.share != null && st.share >= COVERAGE_FLOOR) ?? null;
  const uncoveredStructs = structs?.filter((st) => !(st.share != null && st.share >= COVERAGE_FLOOR)) ?? null;

  // With per-structure knowledge, the inferred share is judged over the
  // structures that HAVE data; the ones without are flagged one by one below.
  const share = coveredStructs?.length
    ? coveredStructs.reduce((s, st) => s + (st.share as number) * st.contourSqft, 0) /
      coveredStructs.reduce((s, st) => s + st.contourSqft, 0)
    : coverage?.share ?? null;
  const inferredShare = share == null ? null : Math.max(0, 1 - share);

  if (structs && coveredStructs && coveredStructs.length === 0) {
    // No structure at all is covered — this really is a roof nobody saw.
    return {
      confidence: "low",
      drawable: false,
      estimable: false,
      inferredShare,
      reasons: [
        "None of the buildings on this lot is visible in the aerial elevation data — trees, shadow or the imagery itself are covering them.",
        "There is not enough to draw a plan you could rely on.",
      ],
    };
  }
  if (!structs && share != null && share < COVERAGE_FLOOR) {
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

  for (const st of uncoveredStructs ?? []) {
    reasons.push(
      `Structure ${st.prefix} (${Math.round(st.contourSqft).toLocaleString("en-US")} sq ft) is not covered by the aerial elevation data — its plan is drawn from the outline alone; verify it on site.`,
    );
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

  if (input.pitchSource?.source === "measured" && input.pitchSource.trustedShare != null && input.pitchSource.trustedShare < 0.7) {
    // An honest basis line, not a warning: the measured facets AGREE (that is
    // the gate now), the rest of the roof is under trees or otherwise unread.
    reasons.push(
      `The pitch was measured on the ${Math.round(input.pitchSource.trustedShare * 100)}% of the roof that reads clearly from above — the measured facets agree with each other; the rest is under trees or otherwise obscured.`,
    );
  }

  if (input.pitchSource?.source === "instant") {
    reasons.push(
      input.pitchSource.solarPanels
        ? "The pitch is EagleView's published figure: this roof carries solar panels, and the aerial elevation data measures the panels rather than the roof beneath them."
        : "The pitch is EagleView's published figure — too little of this roof reads as a clean plane from above to measure it ourselves.",
      "The drawing and its areas are unaffected; only the pitch comes from elsewhere.",
    );
  }

  if (share != null && share < COVERAGE_CLEAR) {
    reasons.push(
      `About ${Math.round((inferredShare ?? 0) * 100)}% of the roof is hidden from above and has been inferred from the rest.`,
      "Carry an extra allowance on material for the inferred part, or measure it on site.",
    );
  }

  const confidence: RoofConfidence =
    geometryBad || (share != null && share < COVERAGE_CLEAR) || (uncoveredStructs?.length ?? 0) > 0
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
