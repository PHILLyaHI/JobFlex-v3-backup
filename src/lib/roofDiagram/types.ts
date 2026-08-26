// Roof diagram — shared contracts between the calibration engine, the chimney
// detectors, the measurement actions and (later) the drawing + export layers.
// Pure types only: this file must stay importable from client components.

import type { RoofModel, InstantRoofData } from "@/lib/eagleview";
import type { PlanarizeReport } from "@/lib/roofDiagram/planarize";
import type { SynthesizeReport } from "@/lib/roofDiagram/synthesize";
import type { GraftReport } from "@/lib/roofDiagram/graft";
import type { ConformReport } from "@/lib/roofDiagram/conformOutline";

/**
 * Where a saved measurement's geometry and numbers came from.
 *   instant+recon   — Instant numbers, reconstructed facets calibrated to them
 *   instant-outline — Instant numbers, no usable imagery: building outline only
 *   recon           — free aerial reconstruction alone (an ESTIMATE, never priced)
 */
export type MeasurementSource = "instant+recon" | "instant-outline" | "recon";

/** Which candidate the calibration selection gate shipped (spec §6.5):
 *  synthesized (straight skeleton from the Instant outline), refined
 *  (rectify+refine repair) or rectified (pre-refine fallback). Widened
 *  ADDITIVELY to string for multi-structure lots, where each structure is
 *  gated independently and the shipped model is a composition — the value is
 *  then a summary like "s0:synthesized+graft, s1:refined". The `(string & {})`
 *  arm keeps the three plain names in autocomplete. */
export type MeasurementPipeline = "synthesized" | "refined" | "rectified" | (string & {});

/** A roof penetration located in the model's local-feet frame (x east, y north). */
export interface ChimneyCandidate {
  x: number;
  y: number;
  wFt: number;
  hFt: number;
  /** DSM only: how far the post rises above the facet plane, feet. */
  heightFt?: number;
  kind: "chimney" | "vent" | "skylight";
  /** 0..1 */
  confidence: number;
  method: "dsm" | "vision" | "dsm+vision";
}

/** What calibrateModel did to the reconstruction so the drawing can say so. */
export interface CalibrationReport {
  /** XY scale applied so facet areas sum to Instant's total (1 = untouched). */
  scaleK: number;
  reconAreaSqft: number;
  instantAreaSqft: number | null;
  /** The dominant pitches (rise/12) every facet was snapped onto. */
  pitchesKept: number[];
  reclassified: { eave: number; rake: number };
  /** How many vertices the grid rectification moved under a direction
   *  constraint (the rectify report's `constrained` count). The field name is
   *  kept for compatibility with stored rows, which once held the per-vertex
   *  outline-snap count here. */
  snappedVertices: number;
  predominantPitchForced: boolean;
  /**
   * Rigid transform (rotation about the pin, then translation, feet) that
   * moved the Instant outline INTO the reconstruction's raster frame before
   * snapping — absorbs UTM grid convergence and georeferencing offset. Apply
   * the same transform to anything else converted from lat/lng with the pin as
   * origin (vision chimney boxes). Identity when no outline was available.
   */
  outlineTransform: { thetaRad: number; tx: number; ty: number };
  /**
   * Multi-structure compositions only (additive — absent on single-ring lots
   * and on older rows): the scale each shipped structure's figures actually
   * carry, fit against that structure's own Instant areaSqft when available
   * (else the winning candidate's whole-lot k). `ringIndexes` are the Instant
   * outline rings (largest-area first, the pipeline's ordering) the entry
   * covers — more than one when straddling facets forced rings onto one
   * candidate. The top-level `scaleK`/`reconAreaSqft` then describe the
   * composition as shipped: reconAreaSqft·scaleK² equals the printed area.
   */
  structureScaleK?: Array<{ ringIndexes: number[]; scaleK: number }>;
}

/** Validator verdict persisted with a measurement (drawing-rules spec §4). */
export interface MeasurementValidation {
  /** Quality score 0–100. */
  score: number;
  errors: number;
  warns: number;
  /** True when the REFINED candidate scored below the pre-refine (rectified)
   *  one at the selection gate. It does NOT say what shipped — the gate may
   *  ship the synthesized candidate regardless — read it alongside
   *  `RoofMeasurementDTO.pipeline`, which names the winner. */
  gateFellBack: boolean;
  /** Faithfulness 0–100 of the shipped candidate to the measured evidence
   *  (facet count vs Instant, footage vs the refined recon). Absent on rows
   *  saved before the fidelity gate. */
  fidelity?: number;
  /** The gate's combined metric for the shipped candidate:
   *  0.6·score + 0.4·fidelity (soundness × faithfulness). */
  gateMetric?: number;
}

export interface MeasurementProvenance {
  /** Google Solar imagery behind the reconstruction. */
  imageryQuality?: string;
  imageryDate?: string;
  pixelSizeM?: number;
  /** EagleView Instant ortho shot date, when imagery was returned. */
  instantImageryDate?: string;
  /** Google's own whole-roof figure, as an independent check. */
  googleAreaSqft?: number | null;
  /** What planarization (spec §5) did to the shipped model. */
  planarize?: PlanarizeReport;
  /** What synthesis (spec §6) built, whether or not its candidate won. */
  synthesize?: SynthesizeReport;
  /** What grafting sub-roofs from the refined evidence onto the synthesized
   *  candidate did, whether or not that candidate won. Absent when synthesis
   *  produced nothing to graft onto (and on rows saved before grafting). */
  graft?: GraftReport;
  /** Where the drawn roof-edge PERIMETER geometry came from (additive):
   *  "vision" when an accepted AI-traced outline shaped the synthesis base and
   *  the planarize clip target, "instant" when the wall outline + measured
   *  overhang did while a vision trace participated. Absent when no vision
   *  outline reached the calibration (older rows, free path, outline-only) —
   *  read absence as "instant". Numbers are Instant-calibrated either way. */
  outlineSource?: "vision" | "instant";
  /** The vision-outline trace verdict behind `outlineSource` (additive). */
  visionOutline?: VisionOutlineProvenance;
  /**
   * Set when only PART of the property was measured and the user must be told.
   * Today the one cause is a missing parcel ring on the no-Instant path: with
   * no lot boundary only the structure under the pin is taken, so a detached
   * garage is left out — measured at 28 % of the roof on the one address where
   * both answers exist. Never log this without also showing it.
   */
  partialCoverage?: { reason: string; measuredStructures: number };
  /**
   * How much of the roof was actually seen from above: gated mask area against
   * the drawn contour's area. The only condition that withholds a drawing
   * (confidence.ts); absent when there was no reconstruction to measure it
   * from, which is itself not a reason to withhold anything.
   */
  coverage?: { seenSqft: number; contourSqft: number; share: number };
  /**
   * Where the pitch came from and why. "instant" means the elevation data was
   * describing something ON the roof rather than the roof — a solar array is
   * the usual cause — so the published pitch was used instead of one averaged
   * out of panels. Geometry is unaffected either way.
   */
  pitchSource?: PitchSourceProvenance;
  /** How the Instant contour was put onto the Google raster (register.ts). */
  registration?: RegistrationProvenance;
  /**
   * Set when ROOF_RECON_V2 was ON but could not build this roof, so the row
   * was measured by the old calibrated path. A fallthrough must be readable
   * off the row, not only in a server log that scrolls away.
   */
  v2Fallthrough?: { reason: string };
}

/** Where the printed pitch came from, and why — shown to the user. */
export interface PitchSourceProvenance {
  source: "measured" | "instant";
  pitch12: number;
  /** Share of plan area whose facets fitted a plane to the DSM's noise floor. */
  trustedShare: number;
  reason: string;
  solarPanels?: boolean;
}

/** The per-house frame registration, cached with the model: the two frames are
 *  4–7.25 ft apart and there is no constant, so it is solved and kept. */
export interface RegistrationProvenance {
  applied: boolean;
  transform?: { dxFt: number; dyFt: number; thetaDeg: number };
  iouBefore: number;
  iouAfter: number | null;
  /** Present only when it was refused — never a silent identity. */
  reason?: string;
}

/** Verdict of the AI roof-outline trace recorded with a measurement — how the
 *  drawn perimeter's source was decided (additive; absent on older rows and
 *  wherever no trace was attempted). */
export interface VisionOutlineProvenance {
  /** True when the accepted vision ring actually shaped the shipped geometry. */
  applied: boolean;
  /** "vision" = fresh trace this run; "vision-cache" = cached accepted trace. */
  source?: "vision" | "vision-cache";
  /** IoU of the ring vs the dilated wall outline (acceptance gate ≥ 0.80). */
  iou?: number;
  cornerCount?: number;
  /** Why no ring was accepted (trace / gate failures), when one was attempted. */
  reasons?: string[];
  /** Why an ACCEPTED ring was still not applied (e.g. a multi-ring lot). */
  skippedReason?: string;
  /** What conforming the shipped repair candidate's outer contour onto the
   *  accepted ring did (additive) — recorded only when a refined/rectified
   *  candidate shipped under an applied vision ring; the synthesized
   *  candidate is built FROM the ring and records nothing here. */
  conform?: ConformOutlineProvenance;
}

/** The conform-pass verdict persisted with a measurement (additive). */
export interface ConformOutlineProvenance extends ConformReport {
  /** calibrate's no-regression gate rejected the conformed geometry — the
   *  unconformed candidate shipped; the counts describe the discarded attempt. */
  gateReverted?: boolean;
}

/** The saved measurement as the UI consumes it. JSON columns are parsed here. */
export interface RoofMeasurementDTO {
  id: string;
  source: MeasurementSource;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  areaSqft: number | null;
  squares: number | null;
  predominantPitch: string | null;
  facetCount: number | null;
  model: RoofModel;
  instant: InstantRoofData | null;
  chimneys: ChimneyCandidate[];
  calibration: CalibrationReport | null;
  /** Null for rows saved before the validator existed. */
  validation: MeasurementValidation | null;
  /** Which candidate the selection gate shipped; absent for rows saved before
   *  the gate existed and for outline-only / free-estimate paths. */
  pipeline?: MeasurementPipeline;
  provenance: MeasurementProvenance;
  pngUrl: string | null;
  pdfUrl: string | null;
  createdAt: string;
}

/** Lightweight row for the history list — no geometry. */
export interface RoofMeasurementSummary {
  id: string;
  source: MeasurementSource;
  address: string | null;
  city: string | null;
  state: string | null;
  areaSqft: number | null;
  squares: number | null;
  predominantPitch: string | null;
  facetCount: number | null;
  pngUrl: string | null;
  createdAt: string;
}
