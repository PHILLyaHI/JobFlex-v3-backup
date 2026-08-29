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

/**
 * How much of a roof may be drawn draining THE WRONG WAY before the drawing
 * stops being trustworthy. A facet the measurement says drains one way and
 * the plan draws draining another is unknown LAYOUT in exactly the sense the
 * two coverage figures above already price for unknown SURFACE, so no new
 * number enters this file:
 *
 *   above 1 − COVERAGE_CLEAR (5 %) — past what the waste factor a contractor
 *     already carries would absorb: say so, and stop calling the linear
 *     footage reliable, because the footage is drawn from exactly those lines.
 *   above 1 − COVERAGE_FLOOR (30 %) — the same share that makes a roof too
 *     unseen to draw at all: the layout must not be ordered from.
 *
 * Measured on the field set the day this shipped (share of roof AREA sitting
 * in facets the detector flagged): 9903 0.0 %, 419 Prairie 5.8 %, 12618
 * 8.4 %, 12621 23.1 %, 12629 27.2 %, and the owner's 12958 NE 201st St
 * 30.4 % with one facet draining 168° from its drawn direction — that last
 * roof is the reason this gate exists, and it lands exactly on the floor.
 */
/**
 * EagleView scores how much of each roof IT could see, in its own words:
 * `roof_occlusion_none|_minor|_major` and `tree_overhang_none|_minor|_major`.
 * That is the same question our DSM coverage answers, asked of different
 * imagery by a different vendor — so it is a second witness, not a duplicate.
 *
 * It is read as a CAP on confidence, never as a reason to refuse to draw:
 * their classifier says how well the roof could be seen, not whether our
 * geometry is sound. Where the two disagree the worse one wins, because a roof
 * that either source calls obscured is a roof somebody should look at.
 *
 * The mapping carries no new tuned number — it lines their three words up with
 * the three tiers this file already has, on the meaning the tiers already
 * carry: "some of it could not be seen" is exactly what stops a measurement
 * being `high`, and "most of it could not be seen" is what makes one `low`.
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

export const UNRECOGNISED_FLAG_SHARE = 1 - COVERAGE_CLEAR;
export const UNRECOGNISED_UNUSABLE_SHARE = 1 - COVERAGE_FLOOR;

export type RoofConfidence = "high" | "medium" | "low";

export interface RoofCoverage {
  /** Mask area that passed the height gate, sq ft. */
  seenSqft: number;
  /** Area of the contour the roof was drawn on, sq ft. */
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
 * the middle, the mask does not agree with our outline on this house, whatever
 * either number says on its own. No new constant.
 */
export const COVERAGE_EDGE_GAP = 2 * (1 - COVERAGE_CLEAR);

export interface RoofAssessment {
  confidence: RoofConfidence;
  /** False only when the roof cannot be seen well enough to draw anything. */
  drawable: boolean;
  /** False when the geometry itself is defective — figures must not be priced. */
  estimable: boolean;
  /** Share of the roof that was inferred rather than seen, 0–1, when known. */
  inferredShare: number | null;
  /**
   * False when part of the roof is drawn draining the wrong way. The linear
   * footage — ridge, hip, valley, rake — IS those lines, so it is the first
   * figure to go wrong and the last that should be ordered from; the area and
   * the outer dimensions survive a layout error far better.
   */
  footageReliable: boolean;
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
  /** EagleView shipped nested outlines — the area double-counts, both sides. */
  nestedOutlines?: { overlapSqft: number; pairs: string[] } | null;
  /** Facets whose measured drain the drawing does not reproduce. */
  unrecognisedFacets?: Array<{ facet: string; diffDeg: number }> | null;
  /** Facets an INDEPENDENT AI read of the photo also draws a crease through. */
  visionCorroborated?: readonly string[] | null;
  /** Share of roof AREA in facets drawn draining the wrong way, 0–1. */
  unrecognisedShare?: number | null;
  /**
   * Set when the pitch could not be measured and EagleView's published one was
   * used. On a roof under solar panels the elevation data describes the panels,
   * not the roof — the GEOMETRY is unaffected, so this is a note about where one
   * number came from, not a defect. Without it such a roof reads as low
   * confidence for a reason that is not its fault.
   */
  pitchSource?: { source: "measured" | "instant"; reason: string; solarPanels?: boolean; trustedShare?: number } | null;
  /**
   * EagleView's own verdict on how much of this roof was visible, with the
   * confidence it attached. A second source for the question our coverage
   * answers — see OcclusionSeverity.
   */
  /**
   * What the mass split could and could not do on this roof.
   *
   * `claimShare` is the fraction of the roof that some ridge accounts for.
   * Above COVERAGE_CLEAR the masses are built on; below COVERAGE_FLOOR the
   * elevation data did not resolve this roof's layout at all, and that is worth
   * telling a contractor, because the drawing looks no different when it
   * happens. 12621 ships today at 19 per cent with a 4 ft ridge on a 2,924
   * sq ft house, `medium`, and nothing said.
   *
   * A SECOND TEST WAS TRIED AND DROPPED, and the reason belongs here: "the
   * drawn ridge is shorter than the L - W an equal-pitch hip on this footprint
   * would give" cannot fire on a nearly square building, because there L - W is
   * about zero — and nearly square is exactly the footprint whose ridge
   * collapses. 12621's own minimum-area rectangle is 56 x 54 ft, so the test
   * was structurally unable to catch the one case it was written for. Firing on
   * the share alone, at the floor the pipeline already uses for "not resolved",
   * is honest; adding a second condition that never fires would only have
   * looked more careful.
   */
  massing?: {
    claimShare: number | null;
  } | null;
  /**
   * Did anything go MISSING? Section J's first-level rule: invariants check that
   * a model agrees with itself, none checks that it is whole, and an omission
   * looks like "less" rather than like an error. An `error` finding here means a
   * building or a piece of footprint is not on the drawing at all — the figures
   * are short by it, and they must not be priced.
   */
  /**
   * The lot-boundary lookup failed. Not a gate — the drawing is fine and the
   * measured structure is measured correctly — but the reader has to be told,
   * because what may be missing is a whole other BUILDING, and nothing in the
   * drawing looks wrong when one is absent.
   */
  parcelBlocked?: { kind: string; message: string } | null;
  /**
   * What the vision reader could NOT see, by its own account — named
   * obstructions with places. Part of vision's promoted role as a witness
   * (owner's decision 2026-08-28): its refusals and named confounders face the
   * user; its lines still draw nothing.
   */
  visionRead?: {
    unreadable: ReadonlyArray<{ why: string }>;
    refusedPasses: readonly string[];
  } | null;
  completeness?: {
    findings: ReadonlyArray<{ level: "error" | "warn"; code: string; message: string }>;
    /** Instant's facet count minus ours, as a share of Instant's. */
    facetDeficitShare?: number | null;
  } | null;
  instantOcclusion?: {
    occlusion: string | null;
    treeOverhang: string | null;
    occlusionConfidence?: number | null;
    overhangConfidence?: number | null;
  } | null;
}): RoofAssessment {
  const { coverage, errorCodes } = input;
  const reasons: string[] = [];

  // Completeness first. A roof that lost a building is not a low-confidence
  // roof — it is a roof with a piece absent, and nothing below can put it back.
  const missing = (input.completeness?.findings ?? []).filter((f) => f.level === "error");
  if (missing.length) {
    return {
      confidence: "low",
      drawable: true,
      estimable: false,
      footageReliable: false,
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
    // No structure at all is covered — this really is a roof nobody saw.
    return {
      confidence: "low",
      drawable: false,
      estimable: false,
      footageReliable: false,
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
      footageReliable: false,
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

  const badShare = input.unrecognisedShare ?? null;
  const layoutUnusable = badShare != null && badShare > UNRECOGNISED_UNUSABLE_SHARE;
  const layoutFlagged = badShare != null && badShare > UNRECOGNISED_FLAG_SHARE;
  if (input.unrecognisedFacets?.length) {
    const names = input.unrecognisedFacets.map((u) => u.facet).join(", ");
    const both = (input.visionCorroborated ?? []).filter((f) => input.unrecognisedFacets!.some((u) => u.facet === f));
    const pct = badShare == null ? null : Math.round(badShare * 100);
    reasons.push(
      `${input.unrecognisedFacets.length} facet${input.unrecognisedFacets.length === 1 ? "" : "s"} (${names})` +
        (pct != null ? `, about ${pct}% of this roof,` : "") +
        ` drain in a different direction than drawn: the aerial elevation data sees a gable, shed or split slope where this plan draws a hip.` +
        (both.length ? ` A separate read of the aerial photo draws a roof line through ${both.join(", ")} too — two independent sources put a crease there.` : ""),
    );
    if (layoutUnusable) {
      reasons.push(
        "That is too much of the roof for the line layout to be trusted: the ridge, hip, valley and rake lengths must NOT be used to order trim, ridge vent or flashing — measure those on site.",
        "The total area and the outer dimensions are affected far less and remain usable with the normal waste allowance.",
      );
    } else if (layoutFlagged) {
      reasons.push(
        "Part of the roof is drawn the wrong way round, so the line layout is unreliable — check the ridge, hip, valley and rake lengths against the aerial view before ordering trim.",
        "The total area and the outer dimensions are affected far less.",
      );
    } else {
      reasons.push(
        "The outer dimensions and the total area are unaffected; the interior lines in those spots are the drawing\u2019s assumption, not a measurement.",
      );
    }
  }

  if (input.nestedOutlines) {
    reasons.push(
      `EagleView returned overlapping structure outlines for this lot (${input.nestedOutlines.pairs.join(", ")}): about ` +
        `${Math.round(input.nestedOutlines.overlapSqft).toLocaleString("en-US")} sq ft of plan is counted twice, in this drawing's total and in EagleView's own figure alike (their total sums the structures as sent).`,
      "Do not reconcile the two totals against each other on this lot; verify the overlapping buildings on site.",
    );
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

  // ── EagleView's own view of how much of this roof was visible ──
  if (maskDisagrees && edgeGap != null) {
    reasons.push(
      `The building outline the elevation data draws does not line up with this roof's edge: ${Math.round((coverage?.insetShare ?? 0) * 100)}% of the interior is covered against ${Math.round((controlShare ?? 0) * 100)}% of the whole outline. The middle of the roof was seen; the disagreement is at the perimeter, so treat the outer dimensions with more caution than the area.`,
    );
  }

  // EagleView counted more facets than we drew. Judged on the same two shares
  // the layout gate uses, because it is the same kind of quantity: how much of
  // the roof's detail is unaccounted for. Only consulted when EagleView's own
  // confidence in that count allowed the comparison — completeness.ts gates it.
  const deficitShare = input.completeness?.facetDeficitShare ?? null;
  const deficitFlagged = deficitShare != null && deficitShare > UNRECOGNISED_FLAG_SHARE;
  const deficitUnusable = deficitShare != null && deficitShare > UNRECOGNISED_UNUSABLE_SHARE;
  if (deficitFlagged) {
    reasons.push(
      `EagleView's survey counts ${Math.round((deficitShare as number) * 100)}% more roof facets on this building than this plan draws — interior detail this drawing did not reproduce.` +
        (deficitUnusable ? " That is enough of the roof's detail for the linear footage to be treated as indicative only; the area is checked separately and stands." : ""),
    );
  }
  for (const w of (input.completeness?.findings ?? []).filter((f) => f.level === "warn")) reasons.push(w.message);

  if (input.parcelBlocked) {
    reasons.push(
      `The lot boundary for this address could not be looked up (${input.parcelBlocked.message}), so only the buildings the aerial data puts under the pin were measured. If this property has a detached garage, shop or barn, check it is on the drawing.`,
    );
  }

  // ── the elevation data could not resolve this roof's layout ──
  const mass = input.massing ?? null;
  const layoutCollapsed = mass?.claimShare != null && mass.claimShare < COVERAGE_FLOOR;
  if (layoutCollapsed) {
    reasons.push(
      `The aerial elevation data could trace only ${Math.round((mass!.claimShare as number) * 100)}% of this roof back to a ridge, so the line layout on this plan is unreliable: a building whose ridges cannot be resolved usually has more than one roof mass, and this plan draws them as one. The total area and the outer dimensions are affected far less — check the ridge, hip, valley and rake lengths against the aerial view before ordering trim.`,
    );
  }

  // ── what the vision witness says it could not see ──
  const vr = input.visionRead ?? null;
  if (vr && vr.unreadable.length) {
    // One reason, the distinct causes folded together — ten near-identical
    // shadow entries must not become ten rows on the screen.
    const whys = [...new Set(vr.unreadable.map((u) => u.why.split(";")[0].trim()).filter(Boolean))].slice(0, 3);
    reasons.push(
      `An AI read of the aerial photo could not see ${vr.unreadable.length > 1 ? "parts" : "part"} of this roof: ${whys.join("; ")}. Those areas rely on the elevation data alone.`,
    );
  }

  const occ = input.instantOcclusion ?? null;
  const occSev = occlusionSeverity(occ?.occlusion);
  const overSev = occlusionSeverity(occ?.treeOverhang);
  const rank: Record<OcclusionSeverity, number> = { none: 0, unknown: 0, minor: 1, major: 2 };
  const worstSev: OcclusionSeverity = rank[overSev] > rank[occSev] ? overSev : occSev;
  const instantCap: RoofConfidence | null = worstSev === "major" ? "low" : worstSev === "minor" ? "medium" : null;

  const ours: RoofConfidence =
    geometryBad || layoutUnusable
      ? "low"
      : (share != null && share < COVERAGE_CLEAR) || (uncoveredStructs?.length ?? 0) > 0 || layoutFlagged || maskDisagrees || deficitFlagged || layoutCollapsed
        ? "medium"
        : input.cannotValidate || share == null
          ? "medium"
          : errorCodes.length > 0
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
      // the disagreement case: our own coverage looked fine, theirs does not
      reasons.push(
        `The aerial elevation data covered this roof, but EagleView's survey of the same building reports ${worstSev} ${what}${certainty} — two sources disagree about how much of it is actually visible, and the more cautious one is shown here.`,
        "Check the plan against the aerial view before pricing.",
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
    reasons.push(
      errorCodes.length > 0
        ? "The drawing does not satisfy every roof rule. The shapes and figures are usable; check the plan against the aerial view before pricing."
        : "There was no aerial elevation data to check this drawing against, so its figures are provisional.",
    );
  }

  return {
    confidence,
    drawable: true,
    estimable: !geometryBad,
    // A collapsed layout must not be bought from: linear footage is exactly the
    // figure it corrupts, and it is the one a contractor orders trim against.
    footageReliable: !layoutFlagged && !deficitFlagged && !layoutCollapsed,
    inferredShare,
    reasons,
  };
}

/** One short line for a badge. */
export const confidenceLabel = (c: RoofConfidence): string =>
  c === "high" ? "MEASURED" : c === "medium" ? "MEASURED — CHECK BEFORE PRICING" : "DRAFT — MEASURE ON SITE";
