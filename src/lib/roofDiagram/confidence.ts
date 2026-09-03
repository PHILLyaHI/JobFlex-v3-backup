// How much of this roof do we actually know, and what may be done with it —
// DATA-ONLY (roofcore). The drawing engine is gone: nothing here reads facets,
// linear footage or model areas any more. What is judged is the DATA of a
// measurement — DSM coverage of the outline, EagleView's own occlusion survey,
// where the pitch figure came from (solar panels!), completeness of the lot —
// and the verdict is a confidence tier plus plain sentences for the user.
//
// The dropped model inputs (invariant codes, unrecognised facets, massing,
// vision witness) left with the engine; their laws live on in ROOF-STATE.md.

/** Below this share of the contour actually seen, the roof is effectively unseen. */
export const COVERAGE_FLOOR = 0.7;
/**
 * Above this, what was inferred fits inside the waste factor a contractor
 * already carries on the order, so the figures can be used as they stand.
 * Measured: both fixtures with a mask sit at ~101 % (Kirkland 2100 sq ft seen
 * against a 2079 sq ft contour, Prairie 3311 against 3274), so a real roof
 * lands at full coverage and any material shortfall is genuinely obscured.
 */
export const COVERAGE_CLEAR = 0.95;

/**
 * EagleView scores how much of each roof IT could see, in its own words:
 * `roof_occlusion_none|_minor|_major` and `tree_overhang_none|_minor|_major`.
 * That is the same question our DSM coverage answers, asked of different
 * imagery by a different vendor — so it is a second witness, not a duplicate.
 *
 * It is read as a CAP on confidence: their classifier says how well the roof
 * could be seen. Where the two disagree the worse one wins, because a roof
 * that either source calls obscured is a roof somebody should look at.
 */
export type OcclusionSeverity = "none" | "minor" | "major" | "unknown";

export function occlusionSeverity(token: string | null | undefined): OcclusionSeverity {
  if (!token) return "unknown";
  const t = token.toLowerCase();
  if (/(^|_)(none|no)$/.test(t) || t.endsWith("_none")) return "none";
  if (t.endsWith("_minor") || t.includes("minor")) return "minor";
  if (t.endsWith("_major") || t.includes("major") || t.includes("severe")) return "major";
  return "unknown";
}

export type RoofConfidence = "high" | "medium" | "low";

export interface RoofCoverage {
  /** Mask area that passed the height gate, sq ft. */
  seenSqft: number;
  /** Area of the contour the roof was measured on, sq ft. */
  contourSqft: number;
  /** seenSqft / contourSqft — the CONTROL figure. */
  share: number;
  /**
   * The same, over the interior only, ignoring a 4 ft band along the boundary.
   * This is what "was this roof visible" means and it is what the tier is
   * judged on; null when the roof is too small to have an interior.
   *
   * Why the interior is the honest one, measured on Kirkland: 92 % of what the
   * mask was missing lay in bands along the perimeter, and nothing at all was
   * missing deeper than 8 ft in. The perimeter band measures agreement with
   * Google's segmentation boundary, not whether trees were in the way.
   */
  insetShare?: number | null;
}

/**
 * How far the interior figure and the whole-contour figure may disagree before
 * the disagreement is itself a finding. Twice the clear tolerance: if more than
 * two waste factors' worth of the roof behaves differently at the edge than in
 * the middle, the mask does not agree with the outline on this house, whatever
 * either number says on its own. No new constant.
 */
export const COVERAGE_EDGE_GAP = 2 * (1 - COVERAGE_CLEAR);

export interface RoofAssessment {
  confidence: RoofConfidence;
  /** False when a whole building is missing — the figures must not be priced. */
  estimable: boolean;
  /** Share of the roof that was NOT seen from above, 0-1, when known. */
  inferredShare: number | null;
  /** Plain sentences for the user. Never codes, never counts of checks. */
  reasons: string[];
}

export interface StructureCoverageInput {
  prefix: string;
  contourSqft: number;
  share: number | null;
}

/**
 * Judge a measurement's DATA. `coverage` is null when there was no aerial
 * reconstruction to measure it from — that is not a reason to withhold
 * anything, only a reason not to claim high confidence.
 */
export function assessRoof(input: {
  coverage: RoofCoverage | null;
  /**
   * Per-structure coverage, when the measurement knows it. The floor then
   * applies to each STRUCTURE: a barn outside the Solar tile is flagged
   * individually, instead of its 0 % dragging the aggregate under the floor
   * and hiding the whole farmstead (12117 202nd St SE: aggregate 20 %, house
   * fully covered). Absent → the aggregate rules.
   */
  structures?: StructureCoverageInput[] | null;
  /**
   * Set when the pitch could not be measured and EagleView's published one was
   * used. On a roof under solar panels the elevation data describes the panels,
   * not the roof — a note about where one number came from, not a defect.
   */
  pitchSource?: { source: "measured" | "instant"; reason: string; solarPanels?: boolean; trustedShare?: number } | null;
  /**
   * The lot-boundary lookup failed. Not a gate — the measured structures are
   * measured correctly — but the reader has to be told, because what may be
   * missing is a whole other BUILDING.
   */
  parcelBlocked?: { kind: string; message: string } | null;
  completeness?: {
    findings: ReadonlyArray<{ level: "error" | "warn"; code: string; message: string }>;
  } | null;
  instantOcclusion?: {
    occlusion: string | null;
    treeOverhang: string | null;
    occlusionConfidence?: number | null;
    overhangConfidence?: number | null;
  } | null;
}): RoofAssessment {
  const { coverage } = input;
  const reasons: string[] = [];

  // Completeness first. A roof that lost a building is not a low-confidence
  // roof — it is a roof with a piece absent, and nothing below can put it back.
  const missing = (input.completeness?.findings ?? []).filter((f) => f.level === "error");
  if (missing.length) {
    return {
      confidence: "low",
      estimable: false,
      inferredShare: null,
      reasons: [
        ...missing.map((f) => f.message),
        "Do not price from these figures until the missing part is accounted for — measure it on site or re-run the measurement.",
      ],
    };
  }

  const structs = input.structures?.length ? input.structures : null;
  const coveredStructs = structs?.filter((st) => st.share != null && st.share >= COVERAGE_FLOOR) ?? null;
  const uncoveredStructs = structs?.filter((st) => !(st.share != null && st.share >= COVERAGE_FLOOR)) ?? null;

  // With per-structure knowledge, the inferred share is judged over the
  // structures that HAVE data; the ones without are flagged one by one below.
  const share = coveredStructs?.length
    ? coveredStructs.reduce((s, st) => s + (st.share as number) * st.contourSqft, 0) /
      coveredStructs.reduce((s, st) => s + st.contourSqft, 0)
    : coverage?.insetShare ?? coverage?.share ?? null;
  const inferredShare = share == null ? null : Math.max(0, 1 - share);
  // The control figure and how far it stands from the one we judged on.
  const controlShare = coverage?.share ?? null;
  const edgeGap =
    coverage?.insetShare != null && controlShare != null
      ? Math.abs(coverage.insetShare - controlShare)
      : null;
  const maskDisagrees = edgeGap != null && edgeGap > COVERAGE_EDGE_GAP;

  if (structs && coveredStructs && coveredStructs.length === 0) {
    return {
      confidence: "low",
      estimable: false,
      inferredShare,
      reasons: [
        "None of the buildings on this lot is visible in the aerial elevation data — trees, shadow or the imagery itself are covering them.",
      ],
    };
  }
  if (!structs && share != null && share < COVERAGE_FLOOR) {
    return {
      confidence: "low",
      estimable: false,
      inferredShare,
      reasons: [
        `Only ${Math.round(share * 100)}% of this roof is visible from above — trees, shadow or the imagery itself are covering the rest.`,
      ],
    };
  }

  for (const st of uncoveredStructs ?? []) {
    reasons.push(
      `Structure ${st.prefix} (${Math.round(st.contourSqft).toLocaleString("en-US")} sq ft) is not covered by the aerial elevation data — verify it on site.`,
    );
  }

  if (input.pitchSource?.source === "measured" && input.pitchSource.trustedShare != null && input.pitchSource.trustedShare < 0.7) {
    reasons.push(
      `The pitch was measured on the ${Math.round(input.pitchSource.trustedShare * 100)}% of the roof that reads clearly from above; the rest is under trees or otherwise obscured.`,
    );
  }

  if (input.pitchSource?.source === "instant") {
    reasons.push(
      input.pitchSource.solarPanels
        ? "The pitch is EagleView's published figure: this roof carries solar panels, and the aerial elevation data measures the panels rather than the roof beneath them."
        : "The pitch is EagleView's published figure — too little of this roof reads as a clean plane from above to measure it ourselves.",
    );
  }

  if (share != null && share < COVERAGE_CLEAR) {
    reasons.push(
      `About ${Math.round((inferredShare ?? 0) * 100)}% of the roof is hidden from above.`,
      "Carry an extra allowance on material for the hidden part, or measure it on site.",
    );
  }

  if (maskDisagrees && edgeGap != null) {
    reasons.push(
      `The building outline the elevation data draws does not line up with this roof's edge: ${Math.round((coverage?.insetShare ?? 0) * 100)}% of the interior is covered against ${Math.round((controlShare ?? 0) * 100)}% of the whole outline.`,
    );
  }

  for (const w of (input.completeness?.findings ?? []).filter((f) => f.level === "warn")) reasons.push(w.message);

  if (input.parcelBlocked) {
    reasons.push(
      `The lot boundary for this address could not be looked up (${input.parcelBlocked.message}), so only the buildings the aerial data puts under the pin were measured. If this property has a detached garage, shop or barn, check it is accounted for.`,
    );
  }

  const occ = input.instantOcclusion ?? null;
  const occSev = occlusionSeverity(occ?.occlusion);
  const overSev = occlusionSeverity(occ?.treeOverhang);
  const rank: Record<OcclusionSeverity, number> = { none: 0, unknown: 0, minor: 1, major: 2 };
  const worstSev: OcclusionSeverity = rank[overSev] > rank[occSev] ? overSev : occSev;
  const instantCap: RoofConfidence | null = worstSev === "major" ? "low" : worstSev === "minor" ? "medium" : null;

  const ours: RoofConfidence =
    (share != null && share < COVERAGE_CLEAR) || (uncoveredStructs?.length ?? 0) > 0 || maskDisagrees
      ? "medium"
      : share == null
        ? "medium"
        : "high";

  // The worse of the two witnesses wins.
  const tier: Record<RoofConfidence, number> = { high: 0, medium: 1, low: 2 };
  const confidence: RoofConfidence =
    instantCap && tier[instantCap] > tier[ours] ? instantCap : ours;

  if (occ && worstSev !== "unknown" && worstSev !== "none") {
    const what =
      overSev === worstSev && occSev === worstSev
        ? "tree cover and obstruction"
        : overSev === worstSev
          ? "tree cover"
          : "obstruction";
    const conf = overSev === worstSev ? occ.overhangConfidence : occ.occlusionConfidence;
    const certainty = conf != null ? ` (its own certainty ${Math.round(conf * 100)}%)` : "";
    if (instantCap && tier[instantCap] > tier[ours]) {
      reasons.push(
        `The aerial elevation data covered this roof, but EagleView's survey of the same building reports ${worstSev} ${what}${certainty} — two sources disagree about how much of it is actually visible, and the more cautious one is shown here.`,
      );
    } else {
      reasons.push(
        `EagleView's own survey also reports ${worstSev} ${what} on this roof${certainty}.`,
      );
    }
  } else if (occ && worstSev === "none" && ours !== "high") {
    reasons.push("EagleView's own survey reports this roof as unobstructed, so what is uncertain here is our reading of it, not the view of it.");
  }

  if (confidence === "medium" && reasons.length === 0) {
    reasons.push("There was no aerial elevation data to check this measurement against, so its figures are provisional.");
  }

  return {
    confidence,
    estimable: true,
    inferredShare,
    reasons,
  };
}

/** One short line for a badge. */
export const confidenceLabel = (c: RoofConfidence): string =>
  c === "high" ? "High confidence" : c === "medium" ? "Medium confidence" : "Low confidence";
