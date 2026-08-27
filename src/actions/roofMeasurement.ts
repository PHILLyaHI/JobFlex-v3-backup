"use server";
// Roof measurements of record — the server side of "Instant measure" and
// "Free estimate" on the roof estimator, plus the history list that lets a
// saved measurement be reopened without paying for it again.
//
// One click on Instant measure does the whole pipeline in one action:
//
//   EagleView Instant (billed)  ┐
//                               ├─ in parallel ─► calibrate ─► chimneys ─► save
//   aerial reconstruction (free)┘
//
// Roles of the two sources (docs/superpowers/specs/2026-08-23-roof-diagram-design.md):
// Instant is the truth for NUMBERS (area, squares, pitch, facet count, outline,
// flags); the reconstruction supplies facet GEOMETRY, which calibrateModel then
// snaps and reclassifies until every printed figure traces to Instant.
// When the reconstruction is unavailable (no HIGH Google imagery, no planes) the
// measurement still succeeds as an outline-only drawing: Instant's building
// polygon with totals — `source: "instant-outline"`.
//
// Frame: everything geometric lives in the reconstruction's raster frame —
// origin at the pin, x east, y north, feet. The DSM, the building mask and the
// DSM chimney candidates are all in it, so calibration must not rescale the
// model and vision boxes (converted from lat/lng with the pin as origin) are
// moved into it with the calibration's outline transform.
//
// Billing rule: a NEW EagleView order is submitted at most once per invocation
// and never retried — and only after the order ledger (obtainInstant) found
// nothing to reuse: no already-paid answer for the address, no pending order to
// collect. Once Instant HAS resolved the result is paid for and must
// reach the user: every later step degrades instead of throwing (calibration →
// outline-only, chimneys → none, save → returned unsaved with `unsaved: true`).
//
// When Instant does NOT resolve — it rejects, or it returns 200 with no
// structure outline — the measurement falls back to the reconstruction alone
// (`source: "recon"`), and nothing is billed. It used to return ok:false and
// die there, which had the dependency backwards: the paid source was mandatory
// and the free one optional. A recon-only result is clearly stamped an estimate
// by the viewers and ignored by the pricing path, so it cannot be mistaken for
// a measurement — the risk the old rule was guarding against.
//
// Deadlines: the reconstruction and the vision pass are raced against fixed
// budgets so the action finishes inside the route's maxDuration; a late
// reconstruction becomes the outline fallback, a late vision pass no candidates.
//
// Everything is org-scoped through requireEstimatorOrManager(). The two
// measure actions return `{ ok: false, error }` on every failure path (auth
// included) rather than throwing to the client; listRoofMeasurements and
// getRoofMeasurement are plain reads and CAN throw on auth or DB errors.
import { requireEstimatorOrManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import {
  isEagleViewEnabled,
  instantCompleteAddress,
  pollInstantResult,
  submitInstantOrder,
  fetchPropertyImage,
  PD_DIAGRAM_PACKS,
  type EvOrderInput,
  type InstantImage,
  type InstantRoofData,
  type InstantStructure,
  type RoofModel,
} from "@/lib/eagleview";
import { isSolarEnabled } from "@/lib/solar";
import type { Raster } from "@/lib/solar";
import { deleteBlob, isBlobEnabled, uploadBlob } from "@/lib/sdk/blob";
import { buildReconModel, type ReconBuild, type ReconBuildInput } from "@/lib/roofReconBuild";
import { buildRoofV2, buildRoofV2FromRecon, measureCoverage, roofReconV2Enabled, type ReconV2Structure } from "@/lib/roofRecon/reconV2";
import { COVERAGE_FLOOR } from "@/lib/roofDiagram/confidence";
import { detectUnrecognisedFacets } from "@/lib/roofRecon/surgeries";
import { readVisionEvidence, type VisionStructureEvidence } from "@/lib/roofRecon/visionEvidence";
import type { RoofStructureRead } from "@/lib/roofDiagram/roofStructureVision";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { measurePitchFromDsm, structurePitch, type PitchMeasurement } from "@/lib/roofRecon/pitchFromDsm";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";
import { parcelRingForPoint } from "@/lib/parcelLookup";
import {
  calibrateModel,
  instantWallRingsRaw,
  outlineOnlyModel,
  regularizeReconModel,
  type CalibrateVisionOutline,
  type CalibrationValidation,
} from "@/lib/roofDiagram/calibrate";
import { traceRoofOutline } from "@/lib/roofDiagram/outlineVision";
import { traceRoofRegions } from "@/lib/roofDiagram/roofRegionVision";
import { readRoofStructure } from "@/lib/roofDiagram/roofStructureVision";
import { detectChimneysDsm } from "@/lib/roofDiagram/chimneyDsm";
import {
  applyRigidTransform,
  detectChimneysVision,
  dropOutsideRoof,
  mergeChimneys,
} from "@/lib/roofDiagram/chimneyVision";
import { toDTO, toSummary, type StoredProvenance } from "@/lib/roofDiagram/dto";
import type { GraftReport } from "@/lib/roofDiagram/graft";
import type { PlanarizeReport } from "@/lib/roofDiagram/planarize";
import type { SynthesizeReport } from "@/lib/roofDiagram/synthesize";
import type {
  CalibrationReport,
  ChimneyCandidate,
  MeasurementPipeline,
  MeasurementSource,
  PitchSourceProvenance,
  RegistrationProvenance,
  StructureProvenance,
  RoofMeasurementDTO,
  RoofMeasurementSummary,
  VisionOutlineProvenance,
} from "@/lib/roofDiagram/types";

type MeasureResult =
  | {
      ok: true;
      measurement: RoofMeasurementDTO;
      /**
       * Set when the measurement was computed (and, for Instant, billed) but
       * the row could not be written. `measurement.id` is "unsaved"; the UI
       * can show the result but it will not appear in history.
       */
      unsaved?: boolean;
      /**
       * Set when NO new EagleView lookup was ordered: an already-paid answer
       * was reused ("stored") or an orphaned pending order was collected
       * ("recovered"). The UI says so, and offers the explicit paid re-measure.
       */
      reusedInstant?: { requestId: string; how: "stored" | "recovered" };
    }
  | { ok: false; error: string };

interface LatLng {
  lat: number;
  lng: number;
}

/** Budget for the free reconstruction (Solar layers + raster decode + plane fit). */
const RECON_DEADLINE_MS = 25_000;
/** Budget for the ortho download + vision model call. */
const VISION_DEADLINE_MS = 20_000;
/** Budget for the AI roof-outline trace. A cached accepted ring returns
 *  instantly; a slow trace is dropped at the deadline and the pipeline then
 *  behaves exactly as without vision — the paid measurement is never at risk. */
const OUTLINE_VISION_DEADLINE_MS = 8_000;
/** Candidates farther than this outside the model's bounds are noise (neighbour roofs). */
const BOUNDS_MARGIN_FT = 5;

const IDENTITY_TRANSFORM: CalibrationReport["outlineTransform"] = { thetaRad: 0, tx: 0, ty: 0 };

// lat/lng → the reconstruction's local feet frame (origin at the pin).
const D2R = Math.PI / 180;
const EARTH_R_M = 6378137;
const FT_PER_M = 3.28084;

// ── helpers (module-private: a "use server" file may only export async fns) ──

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

/**
 * Reject `p` if it has not settled within `ms`. The underlying work is not
 * cancelled (there is no handle to cancel a plane fit); its result is simply
 * discarded, which is what the fallbacks want.
 */
function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * The ortho we hand to the vision model. Unmasked first — EagleView blurs the
 * neighbours on a masked ortho and the blur edge reads as a roof edge to a
 * vision model; any ortho with a bbox is the fallback, since without a bbox a
 * box cannot be placed in the frame at all.
 */
function pickOrtho(instant: InstantRoofData): InstantImage | null {
  const orthos = instant.imagery.filter((i) => i.view === "ortho" && i.bbox);
  return orthos.find((i) => i.masked === false) ?? orthos[0] ?? null;
}

/**
 * Penetrations from the top-model roof read (roofStructureVision): chimneys,
 * vents and skylights with the size they actually are. The older single-purpose
 * vision pass sized them by eye and handed back three identical 6.2 × 8.5 ft
 * "vents", one of them off the roof — reading the whole roof at once (outline,
 * creases and penetrations together) is what makes the sizes come out right.
 * Best-effort: on any failure the DSM posts still stand on their own.
 */
/**
 * ONE AI read of the roof, used twice. It returns penetrations AND the
 * interior lines where two slopes meet; the penetrations have always been
 * used, the interior lines were computed and discarded. Both come from this
 * single call — reading the topology costs nothing extra.
 */
async function structureRead(
  instant: InstantRoofData,
  origin: LatLng | null,
  slug: string | undefined,
): Promise<RoofStructureRead | null> {
  if (!origin) return null;
  try {
    const wallRings = instantWallRingsRaw(instant, origin);
    return await withDeadline(
      readRoofStructure({ imagery: instant.imagery, origin, slug, wallRings }),
      VISION_DEADLINE_MS,
      "Roof structure vision",
    );
  } catch (err) {
    console.warn("[roofMeasurement] structure vision skipped:", err instanceof Error ? err.message : err);
    return null;
  }
}

const penetrationsOf = (read: RoofStructureRead | null): ChimneyCandidate[] =>
  (read?.penetrations ?? []).map((p) => ({
    x: p.x,
    y: p.y,
    wFt: p.wFt,
    hFt: p.hFt,
    kind: p.kind === "skylight" ? "vent" : p.kind,
    confidence: p.confidence,
    method: "vision" as const,
  }));

/** Vision pass over the Instant ortho. Best-effort: never fails the measurement. */
async function visionChimneys(instant: InstantRoofData, origin: LatLng | null): Promise<ChimneyCandidate[]> {
  const ortho = pickOrtho(instant);
  const bbox = ortho?.bbox;
  if (!ortho || !bbox || !origin) return [];
  try {
    const run = async (): Promise<ChimneyCandidate[]> => {
      const { bytes, contentType } = await fetchPropertyImage(ortho.token);
      return detectChimneysVision({ bytes, contentType, bbox }, origin);
    };
    return await withDeadline(run(), VISION_DEADLINE_MS, "Chimney vision");
  } catch (err) {
    console.warn("[roofMeasurement] chimney vision skipped:", err instanceof Error ? err.message : err);
    return [];
  }
}

/** Cache slug for the roof-outline trace — the eval harness's address slug, so
 *  a ring traced by the harness is reused here and vice versa. Undefined (no
 *  caching) when there is no address to key on. */
function outlineSlug(input: EvOrderInput, instant: InstantRoofData): string | undefined {
  const full = [input.address || instant.address || "", input.city || "", input.state || "", input.zip || ""]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return full || undefined;
}

/**
 * AI roof-outline trace over the Instant ortho (GEOMETRY only — the printed
 * numbers stay Instant-calibrated). Best-effort by contract: any failure or
 * timeout returns {} and the measurement proceeds exactly as without vision.
 * Only called AFTER the billed lookup resolved, and only when a reconstruction
 * exists to calibrate — the outline-only path draws the Instant polygon
 * verbatim and has no use for a traced roof edge.
 */
async function visionRoofOutline(
  instant: InstantRoofData,
  origin: LatLng,
  slug: string | undefined,
): Promise<{ outline?: CalibrateVisionOutline; note?: VisionOutlineProvenance }> {
  try {
    const wallRings = instantWallRingsRaw(instant, origin);
    if (wallRings.length === 0) return {};
    const trace = await withDeadline(
      traceRoofOutline({ imagery: instant.imagery, origin, slug, wallRings }),
      OUTLINE_VISION_DEADLINE_MS,
      "Roof outline vision",
    );
    if (trace.ringFt) {
      return {
        outline: {
          ringFt: trace.ringFt,
          source: trace.source === "vision-cache" ? "vision-cache" : "vision",
          iou: trace.iou,
          cornerCount: trace.cornerCount,
        },
      };
    }
    return { note: { applied: false, ...(trace.reasons.length ? { reasons: trace.reasons.slice(0, 6) } : {}) } };
  } catch (err) {
    console.warn("[roofMeasurement] outline vision skipped:", err instanceof Error ? err.message : err);
    return {};
  }
}

/**
 * AI roof/not-roof regions over the same ortho: which areas are actually ROOF,
 * so a concrete patio or a deck the building mask swallowed does not get drawn
 * as a wing (measured on 12629 NE 100th Pl: a 290 sq ft slab at 1/12). Advisory
 * and best-effort like the outline trace — the height test in roofRegions.ts
 * still runs without it.
 */
async function visionRoofRegions(
  instant: InstantRoofData,
  origin: LatLng,
  slug: string | undefined,
): Promise<Array<Array<{ x: number; y: number }>> | undefined> {
  try {
    const wallRings = instantWallRingsRaw(instant, origin);
    if (wallRings.length === 0) return undefined;
    const res = await withDeadline(
      traceRoofRegions({ imagery: instant.imagery, origin, slug, wallRings }),
      OUTLINE_VISION_DEADLINE_MS,
      "Roof region vision",
    );
    return res.regions.length ? res.regions : undefined;
  } catch (err) {
    console.warn("[roofMeasurement] roof-region vision skipped:", err instanceof Error ? err.message : err);
    return undefined;
  }
}

/**
 * Instant's chimney flag for the building we drew: the largest structure by
 * roof area (footprint when area is missing). Detached garages and sheds are
 * separate structures with their own flag, and the drawing is of the house.
 * When the largest structure has no answer, fall back to the parcel: any
 * structure saying "yes" is a yes, all of them saying "no" is a no, else unknown.
 */
function chimneyGate(structures: InstantStructure[]): boolean | null {
  const size = (s: InstantStructure) => s.areaSqft ?? s.footprintSqft ?? -1;
  let largest: InstantStructure | null = null;
  for (const s of structures) {
    if (!largest || size(s) > size(largest)) largest = s;
  }
  if (typeof largest?.chimney === "boolean") return largest.chimney;
  const flags = structures.map((s) => s.chimney).filter((f): f is boolean => typeof f === "boolean");
  if (flags.some((f) => f)) return true;
  if (flags.length && flags.every((f) => !f)) return false;
  return null;
}

/**
 * Combine the detectors: vision boxes are moved into the raster frame with the
 * calibration's outline transform (identity for outline-only models, whose
 * frame IS the pin frame), paired with the DSM posts, gated by Instant's flag,
 * and finally anything outside the roof (+ margin) is dropped.
 */
/**
 * Rigid inverse of the contour→raster registration, so a candidate measured in
 * the RASTER frame can be placed on a model that lives in the PIN frame.
 * `registerContourToRaster` returns raster = R(theta)*pin + d, so the inverse
 * is R(-theta) with translation -R(-theta)*d.
 */
function inverseRegistration(t: { dxFt: number; dyFt: number; thetaDeg: number }): CalibrationReport["outlineTransform"] {
  const thetaRad = -(t.thetaDeg * Math.PI) / 180;
  const cos = Math.cos(thetaRad);
  const sin = Math.sin(thetaRad);
  return { thetaRad, tx: -(t.dxFt * cos - t.dyFt * sin), ty: -(t.dxFt * sin + t.dyFt * cos) };
}

function combineChimneys(
  dsm: ChimneyCandidate[],
  vision: ChimneyCandidate[],
  model: RoofModel,
  calibration: CalibrationReport | null,
  gate: boolean | null,
  /**
   * V2 only: the transform that put the Instant contour onto the raster. The
   * DSM posts are found IN the raster and the V2 model stays in the pin frame,
   * so without this they land a whole registration offset away — measured
   * -7.4 ft on 12629 against a 4 ft pairing radius, which both mis-merges the
   * pairs and lets dropOutsideRoof discard real chimneys. The old calibrated
   * path has no such gap: its model IS in the raster frame and its
   * outlineTransform moves the vision side instead.
   */
  registration?: { dxFt: number; dyFt: number; thetaDeg: number } | null,
): ChimneyCandidate[] {
  const placedVision = applyRigidTransform(vision, calibration?.outlineTransform ?? IDENTITY_TRANSFORM);
  const placedDsm = registration ? applyRigidTransform(dsm, inverseRegistration(registration)) : dsm;
  const merged = mergeChimneys(placedDsm, placedVision, { chimney: gate });
  // Against the drawn facets, not the bounding box — see dropOutsideRoof.
  const roofIdx = buildIndexes(model);
  const roofRings = model.faces
    .map((f) => ringOf(f.lineIds, roofIdx))
    .filter((r): r is NonNullable<typeof r> => !!r && r.length >= 3)
    .map((r) => r.map((p) => ({ x: p.x, y: p.y })));
  return dropOutsideRoof(merged, roofRings, BOUNDS_MARGIN_FT);
}

/**
 * The outline-only fallback when Instant returned neither coordinates nor did
 * the caller supply any: there is no origin to place the outline in, so the
 * drawing gets Instant's totals and no geometry rather than a ring at (0,0)
 * of a frame that does not exist.
 */
function emptyGeometryModel(instant: InstantRoofData, input: EvOrderInput): RoofModel {
  return {
    source: "instant",
    location: {
      address: input.address || instant.address || undefined,
      city: input.city || undefined,
      state: input.state || undefined,
      postal: input.zip || undefined,
    },
    northOrientation: 0,
    points: [],
    lines: [],
    faces: [],
    penetrations: [],
    totals: {
      areaSqft: instant.totals.areaSqft,
      squares: instant.totals.squares,
      facetCount: instant.totals.facetCount ?? 0,
      predominantPitch: instant.totals.predominantPitch ?? 0,
      footageByType: {
        EAVE: 0,
        RIDGE: 0,
        VALLEY: 0,
        RAKE: 0,
        HIP: 0,
        FLASHING: 0,
        STEPFLASH: 0,
        OTHER: 0,
      },
      bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
    },
  };
}

interface Geometry {
  model: RoofModel;
  calibration: CalibrationReport | null;
  /** Validator verdict on the shipped geometry (null on the outline-only path). */
  validation: CalibrationValidation | null;
  /** Which gate candidate shipped, plus the planarize/synthesize/graft
   *  reports (spec §5–§6.5) — absent on the outline-only path. */
  pipeline?: MeasurementPipeline;
  planarize?: PlanarizeReport;
  synthesize?: SynthesizeReport;
  graft?: GraftReport;
  /** Where the drawn roof-edge perimeter came from (calibrated path only;
   *  absent when no vision outline reached the calibration). */
  outlineSource?: "vision" | "instant";
  visionOutline?: VisionOutlineProvenance;
  /** V2 path only: how the contour was registered and where the pitch came from. */
  registration?: RegistrationProvenance;
  pitchSource?: PitchSourceProvenance;
  /** V2 was on but could not build this roof; the old path measured it. */
  v2Fallthrough?: { reason: string };
  /** V2 paths: per-structure coverage and registration. */
  structures?: StructureProvenance[];
  /** V2 paths: EagleView shipped nested outlines — area double-counts, both sides. */
  nestedOutlines?: { overlapSqft: number; pairs: string[] };
  /** V2 paths: facets whose measured drain the drawing does not reproduce. */
  unrecognisedFacets?: Array<{ facet: string; dsmAz: number; faceAz: number; diffDeg: number }>;
  /** V2 paths: what the AI structure read is scored against. */
  visionInputs?: { contour: FootprintPoint[]; measurement: PitchMeasurement };
  source: MeasurementSource;
  origin: LatLng | null;
}

/**
 * Instant's outline (or, without an origin, its totals alone) as the model:
 * the path taken when there is no reconstruction or calibrating it failed.
 */
function outlineGeometry(recon: ReconBuild | null, instant: InstantRoofData, input: EvOrderInput): Geometry {
  const lat = recon?.origin.lat ?? instant.lat ?? input.lat;
  const lng = recon?.origin.lng ?? instant.lng ?? input.lng;
  const origin = lat != null && lng != null ? { lat, lng } : null;
  let model: RoofModel;
  try {
    model = origin ? outlineOnlyModel(instant, origin) : emptyGeometryModel(instant, input);
  } catch (err) {
    // The ring could not even be placed: keep the totals.
    console.warn("[roofMeasurement] outline fallback failed:", errorMessage(err, String(err)));
    model = emptyGeometryModel(instant, input);
  }
  return { model, calibration: null, validation: null, source: "instant-outline", origin };
}

/**
 * Geometry for a paid Instant result: the calibrated reconstruction when there
 * is one, else the outline. Never throws — a calibration failure degrades to
 * the outline so the billed numbers still reach the user.
 */
function resolveGeometry(
  recon: ReconBuild | null,
  instant: InstantRoofData,
  input: EvOrderInput,
  visionOutline?: CalibrateVisionOutline,
  roofRegions?: Array<Array<{ x: number; y: number }>>,
): Geometry {
  if (!recon) return outlineGeometry(null, instant, input);
  // ── ROOF_RECON_V2: topology first, then pitch measured into it ──
  // Off by default. The old path below is untouched, and V2 falling through
  // (no usable contour, skeleton refused) lands on it rather than failing.
  let v2Fallthrough: { reason: string } | undefined;
  if (roofReconV2Enabled()) {
    try {
      const v2 = buildV2Geometry(recon, instant);
      if (v2) {
        return {
          model: v2.model,
          calibration: null,
          validation: null,
          source: "instant+recon",
          origin: recon.origin,
          registration: v2.registration,
          pitchSource: v2.pitchSource,
          structures: v2.structures,
          ...(v2.nestedOutlines ? { nestedOutlines: v2.nestedOutlines } : {}),
          ...(v2.unrecognisedFacets ? { unrecognisedFacets: v2.unrecognisedFacets } : {}),
          ...(v2.visionInputs ? { visionInputs: v2.visionInputs } : {}),
        };
      }
      v2Fallthrough = { reason: "V2 could not build a usable contour or skeleton from this outline" };
      console.warn("[roofMeasurement] ROOF_RECON_V2 produced no model — falling through to the calibrated path");
    } catch (err) {
      v2Fallthrough = { reason: errorMessage(err, String(err)) };
      console.warn("[roofMeasurement] ROOF_RECON_V2 failed, falling through:", errorMessage(err, String(err)));
    }
  }
  try {
    const calibrated = calibrateModel({
      recon: recon.model,
      instant,
      origin: recon.origin,
      ...(visionOutline ? { visionOutline } : {}),
      ...(roofRegions ? { roofRegions } : {}),
    });
    return {
      model: calibrated.model,
      calibration: calibrated.report,
      validation: calibrated.notes.validation ?? null,
      pipeline: calibrated.notes.pipeline,
      planarize: calibrated.notes.planarize,
      synthesize: calibrated.notes.synthesize,
      ...(calibrated.notes.graft ? { graft: calibrated.notes.graft } : {}),
      ...(calibrated.notes.outlineSource ? { outlineSource: calibrated.notes.outlineSource } : {}),
      ...(calibrated.notes.visionOutline ? { visionOutline: calibrated.notes.visionOutline } : {}),
      ...(v2Fallthrough ? { v2Fallthrough } : {}),
      source: "instant+recon",
      origin: recon.origin,
    };
  } catch (err) {
    console.warn("[roofMeasurement] calibration failed, drawing the outline only:", errorMessage(err, String(err)));
    return { ...outlineGeometry(recon, instant, input), ...(v2Fallthrough ? { v2Fallthrough } : {}) };
  }
}

/** What provenanceJson holds: StoredProvenance plus the additive validation
 *  summary (drawing-rules spec §4) — rows saved by older builds lack the key. */
type StoredProvenanceWithValidation = StoredProvenance & { validation?: CalibrationValidation };

function provenanceOf(
  model: RoofModel,
  recon: ReconBuild | null,
  ortho: InstantImage | null,
  calibration: CalibrationReport | null,
  validation: CalibrationValidation | null,
  notes?: {
    pipeline?: MeasurementPipeline;
    planarize?: PlanarizeReport;
    synthesize?: SynthesizeReport;
    graft?: GraftReport;
    outlineSource?: "vision" | "instant";
    visionOutline?: VisionOutlineProvenance;
    registration?: RegistrationProvenance;
    pitchSource?: PitchSourceProvenance;
    v2Fallthrough?: { reason: string };
    instantReuse?: { requestId: string; how: "stored" | "recovered" };
    structures?: StructureProvenance[];
    nestedOutlines?: { overlapSqft: number; pairs: string[] };
    unrecognisedFacets?: Array<{ facet: string; dsmAz: number; faceAz: number; diffDeg: number }>;
    visionStructure?: VisionStructureEvidence;
  },
): StoredProvenanceWithValidation {
  // How much of this roof was actually visible from above — the one thing that
  // can withhold a drawing (confidence.ts). Measured against the model's own
  // plan area, which is the contour the facets were drawn on.
  const covIdx = buildIndexes(model);
  const planRings = model.faces
    .map((f) => ringOf(f.lineIds, covIdx))
    .filter((r): r is NonNullable<typeof r> => !!r && r.length >= 3)
    .map((r) => r.map((p) => ({ x: p.x, y: p.y })));
  const coverage = recon
    ? measureCoverage({
        mask: recon.mask,
        dsm: recon.dsm,
        groundElevFt: recon.diagnostics.groundElevFt,
        rings: planRings,
      })
    : null;
  return {
    calibration,
    ...(validation ? { validation } : {}),
    // Which gate candidate shipped (spec §6.5) — additive, absent on older rows.
    ...(notes?.pipeline ? { pipeline: notes.pipeline } : {}),
    provenance: {
      ...(coverage ? { coverage } : {}),
      ...(notes?.registration ? { registration: notes.registration } : {}),
      ...(notes?.pitchSource ? { pitchSource: notes.pitchSource } : {}),
      ...(notes?.v2Fallthrough ? { v2Fallthrough: notes.v2Fallthrough } : {}),
      ...(notes?.instantReuse ? { instantReuse: notes.instantReuse } : {}),
      ...(notes?.structures?.length ? { structures: notes.structures } : {}),
      ...(notes?.nestedOutlines ? { nestedOutlines: notes.nestedOutlines } : {}),
      ...(notes?.unrecognisedFacets?.length ? { unrecognisedFacets: notes.unrecognisedFacets } : {}),
      ...(notes?.visionStructure ? { visionStructure: notes.visionStructure } : {}),
      imageryQuality: model.provenance?.imageryQuality,
      imageryDate: model.provenance?.imageryDate,
      pixelSizeM: model.provenance?.pixelSizeM,
      instantImageryDate: ortho?.shotDate,
      googleAreaSqft: recon?.googleAreaSqft ?? null,
      // The planarize/synthesize/graft reports surface through DTO.provenance only.
      ...(notes?.planarize ? { planarize: notes.planarize } : {}),
      ...(notes?.synthesize ? { synthesize: notes.synthesize } : {}),
      ...(notes?.graft ? { graft: notes.graft } : {}),
      ...(notes?.outlineSource ? { outlineSource: notes.outlineSource } : {}),
      ...(notes?.visionOutline ? { visionOutline: notes.visionOutline } : {}),
    },
  };
}

interface PersistInput {
  organizationId: string;
  createdById: string;
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
  instantRequestId: string | null;
  instant: InstantRoofData | null;
  model: RoofModel;
  chimneys: ChimneyCandidate[];
  stored: StoredProvenanceWithValidation;
}

async function persist(p: PersistInput): Promise<RoofMeasurementDTO> {
  const row = await db.roofMeasurement.create({
    data: {
      organizationId: p.organizationId,
      createdById: p.createdById,
      source: p.source,
      address: p.address,
      city: p.city,
      state: p.state,
      zip: p.zip,
      lat: p.lat,
      lng: p.lng,
      areaSqft: p.areaSqft,
      squares: p.squares,
      predominantPitch: p.predominantPitch,
      facetCount: p.facetCount,
      instantRequestId: p.instantRequestId,
      // Imagery TOKENS are stored (they are how the ortho is re-fetched); the
      // image bytes never are.
      instantJson: p.instant ? JSON.stringify(p.instant) : null,
      modelJson: JSON.stringify(p.model),
      chimneyJson: JSON.stringify(p.chimneys),
      provenanceJson: JSON.stringify(p.stored),
    },
  });
  return toDTO(row);
}

/** The DTO a saved row WOULD have produced, built from the in-memory data. */
function unsavedDTO(p: PersistInput): RoofMeasurementDTO {
  return {
    id: "unsaved",
    source: p.source,
    address: p.address,
    city: p.city,
    state: p.state,
    zip: p.zip,
    lat: p.lat,
    lng: p.lng,
    areaSqft: p.areaSqft,
    squares: p.squares,
    predominantPitch: p.predominantPitch,
    facetCount: p.facetCount,
    model: p.model,
    instant: p.instant,
    chimneys: p.chimneys,
    calibration: p.stored.calibration,
    validation: p.stored.validation ?? null,
    ...(p.stored.pipeline ? { pipeline: p.stored.pipeline } : {}),
    provenance: p.stored.provenance,
    pngUrl: null,
    pdfUrl: null,
    createdAt: new Date().toISOString(),
  };
}


/** A stand-in used only to keep `instant` non-null on the no-Instant branch;
 *  nothing downstream of that branch reads it. */
const EMPTY_INSTANT: InstantRoofData = {
  requestId: "",
  address: null,
  lat: null,
  lng: null,
  structures: [],
  imagery: [],
  totals: {
    areaSqft: 0,
    squares: 0,
    predominantPitch: null,
    pitchLabel: null,
    maxEaveFt: null,
    facetCount: null,
    footprintSqft: null,
  },
};

/**
 * Measure from the aerial reconstruction alone, for an address Instant does
 * not cover (or failed on). Nothing was billed.
 *
 * The mask is gated to roof height first — Google's building mask reaches into
 * the ground around the house, 543 sq ft of it on the one house where both
 * sources exist, and gating at ground + 4 ft brings it to within 1 % of what
 * EagleView draws. Then the same single-contour regularisation and skeleton the
 * Instant path uses; only the contour's provenance differs.
 *
 * Saved as `source: "recon"`, so the viewers already stamp it an estimate and
 * the pricing path already ignores it.
 */
async function reconOnlyMeasurement(
  recon: ReconBuild,
  input: EvOrderInput,
  organizationId: string,
  userId: string,
  why: string,
  instant?: InstantRoofData,
): Promise<MeasureResult> {
  // The lot boundary decides which mask blobs belong to this property. Without
  // it only the structure under the pin is measured and a detached garage is
  // silently dropped — 629 of 2240 sq ft on 17028 NE 100th St. Cache-first and
  // quota-gated (parcelLookup.ts); when it cannot be had, the reason is carried
  // into the measurement rather than left in the log.
  const parcelRing = await parcelRingForPoint(recon.origin.lat, recon.origin.lng);
  console.log(
    "[roofMeasurement] parcel ring: %s%s (allowance %s remaining)",
    parcelRing.ring ? `${parcelRing.ring.length} points from ${parcelRing.source}` : "none",
    parcelRing.blocked ? ` — ${parcelRing.blocked}` : "",
    parcelRing.remaining ?? "unknown",
  );
  const parcel = parcelRing.ring
    ? parcelRing.ring.map(([plat, plng]) => ({
        x: (plng - recon.origin.lng) * D2R * EARTH_R_M * Math.cos(recon.origin.lat * D2R) * FT_PER_M,
        y: (plat - recon.origin.lat) * D2R * EARTH_R_M * FT_PER_M,
      }))
    : null;

  // THE AI HELPERS EARN THEIR KEEP HERE. Without Instant the contour comes
  // from Google's building mask, which is this path's weakest input: it
  // over-claims into the ground (543 sq ft beside the Kirkland house) and on
  // a rural lot covers only part of the buildings. roofRegionVision answers
  // exactly the question the mask gets wrong — which of this is roof and
  // which is patio, deck or driveway — so its polygons filter the mask.
  // Best-effort and free of consequence: a failed trace leaves the mask as it
  // was, and the coverage floor still guards the result.
  let roofRegions: FootprintPoint[][] | null = null;
  if (instant?.imagery?.length) {
    try {
      const slug = outlineSlug(input, instant);
      const traced = await withDeadline(
        traceRoofRegions({ imagery: instant.imagery, origin: recon.origin, slug, wallRings: instantWallRingsRaw(instant, recon.origin) }),
        OUTLINE_VISION_DEADLINE_MS,
        "Roof region vision",
      );
      if (traced.regions.length) {
        roofRegions = traced.regions;
        console.log("[roofMeasurement] AI roof regions: %d polygons, wall coverage %s", traced.regions.length, traced.wallCoverage.toFixed(2));
      }
    } catch (err) {
      console.warn("[roofMeasurement] roof-region vision skipped:", errorMessage(err, String(err)));
    }
  }

  const built = buildRoofV2FromRecon({
    mask: recon.mask,
    dsm: recon.dsm,
    groundElevFt: recon.diagnostics.groundElevFt,
    parcel,
    pitch12: recon.model.totals.predominantPitch ?? null,
    ...(roofRegions ? { roofRegions } : {}),
  });
  if (!built.model) {
    return {
      ok: false,
      error: `${why}. The aerial reconstruction could not produce a usable outline either${
        built.report.reasons.length ? ` (${built.report.reasons[0]})` : ""
      } — trace this roof manually.`,
    };
  }
  let model = built.model;

  // Measure the pitch here too — but with NO Instant there is no published
  // figure to fall back on, so a refused registration or an unreadable roof is
  // simply an unmeasured pitch, and the confidence level has to say so.
  let registration: RegistrationProvenance | undefined;
  let pitchSource: PitchSourceProvenance | undefined;
  const { provenance: structProvenance, transforms } = registerStructures(
    built.report.structures,
    recon.mask,
    recon.dsm,
    recon.diagnostics.groundElevFt,
  );
  const headline = structProvenance
    .filter((st) => st.registration?.applied)
    .sort((a, b) => b.contourSqft - a.contourSqft)[0];
  if (structProvenance.length) {
    const reg = headline?.registration;
    registration = reg
      ? { applied: true, transform: reg.transform!, iouBefore: reg.iouBefore!, iouAfter: reg.iouAfter ?? null }
      : {
          applied: false,
          reason: structProvenance.every((st) => !st.covered)
            ? "no structure on this lot is covered by the elevation data"
            : "registration refused",
          iouBefore: 0,
          iouAfter: null,
        };
    if (reg) {
      const measured = measurePitchFromDsm({
        model,
        mask: recon.mask,
        dsm: recon.dsm,
        transform: reg.transform!,
        transformFor: (id) => transforms.get(faceStructureIndex(id)) ?? null,
        sectionTolerance12: 0.75,
      });
      const sp = structurePitch(measured, null);
      if (sp.source === "measured") {
        const rebuilt = buildRoofV2FromRecon({
          mask: recon.mask,
          dsm: recon.dsm,
          groundElevFt: recon.diagnostics.groundElevFt,
          parcel,
          pitch12: sp.pitch12,
        });
        if (rebuilt.model) model = rebuilt.model;
        pitchSource = { source: "measured", pitch12: sp.pitch12, trustedShare: sp.trustedShare, reason: sp.reason };
      } else {
        pitchSource = {
          source: "instant",
          pitch12: built.report.pitch12 ?? 0,
          trustedShare: sp.trustedShare,
          reason:
            "Too little of this roof reads as a clean plane from above to measure its pitch, and there is no EagleView " +
            "figure for this address to fall back on — the pitch shown is the reconstruction's own estimate.",
        };
      }
    } else {
      pitchSource = {
        source: "instant",
        pitch12: built.report.pitch12 ?? 0,
        trustedShare: 0,
        reason:
          "The aerial elevation data could not be lined up with the building outline, and there is no EagleView figure " +
          "for this address — the pitch shown is the reconstruction's own estimate and should be checked on site.",
      };
    }
  }
  const measuredStructures = built.report.structures.filter((st) => st.ring).length;
  // The obtainInstant errors carry the pending order's id in their text; a row
  // that says WHY Instant is absent (and that a paid order is waiting) lets the
  // UI stop suggesting a new report where one is already bought.
  const pendingOrderId = why.match(/order ([0-9a-f]{8}-[0-9a-f-]{27,})/i)?.[1];
  const instantMissingNote = { reason: why, ...(pendingOrderId ? { pendingOrderId } : {}) };
  // Only a BLOCKED lookup is a partial measurement. A point that genuinely has
  // no parcel on record is not — there is nothing that was withheld.
  const partialReason = parcelRing.blocked
    ? `Only the building under the pin was measured: ${parcelRing.blocked}. A detached garage or shop on the same lot is not included.`
    : null;
  const toSave: PersistInput = {
    organizationId,
    createdById: userId,
    source: "recon",
    address: input.address || null,
    city: input.city || null,
    state: input.state || null,
    zip: input.zip || null,
    lat: recon.origin.lat,
    lng: recon.origin.lng,
    areaSqft: model.totals.areaSqft,
    squares: model.totals.squares,
    predominantPitch: pitchSource ? `${Math.round(pitchSource.pitch12)}/12` : built.report.pitch12 != null ? `${built.report.pitch12}/12` : null,
    facetCount: model.totals.facetCount,
    instantRequestId: null,
    instant: null,
    model,
    chimneys: [],
    stored: (() => {
      const base = provenanceOf(model, recon, null, null, null, {
        ...(registration ? { registration } : {}),
        ...(pitchSource ? { pitchSource } : {}),
        ...(structProvenance.length ? { structures: structProvenance } : {}),
      });
      return {
        ...base,
        provenance: {
          ...base.provenance,
          instantMissing: instantMissingNote,
          ...(partialReason ? { partialCoverage: { reason: partialReason, measuredStructures } } : {}),
        },
      };
    })(),
  };
  try {
    const measurement = await persist(toSave);
    return { ok: true, measurement };
  } catch (err) {
    console.error("[roofMeasurement] recon-only measurement could not be saved: %s", errorMessage(err, String(err)));
    return { ok: true, measurement: unsavedDTO(toSave), unsaved: true };
  }
}


/**
 * Coverage and registration for every structure on the lot, one at a time. The
 * Solar tile is centred on the house: on a farmstead the barns sit outside it,
 * and judged in one pool they read the lot down to 20 % coverage and 57 % IoU
 * while the house is fully covered (12117 202nd St SE). Per structure, the
 * house keeps its data and each uncovered barn is flagged individually.
 */
function registerStructures(
  structures: ReconV2Structure[],
  mask: Raster,
  dsm: Raster,
  groundElevFt: number,
): {
  /** provenance[i] belongs to the i-th structure WITH a ring — the same index
   *  synthesize stamps into face ids ("s{i}:F{n}"), which is the only real
   *  face→structure link (designator letters rank by area, across the lot). */
  provenance: StructureProvenance[];
  transforms: Map<number, { dxFt: number; dyFt: number; thetaDeg: number }>;
} {
  const provenance: StructureProvenance[] = [];
  const transforms = new Map<number, { dxFt: number; dyFt: number; thetaDeg: number }>();
  for (const st of structures) {
    const ring = st.ring;
    if (!ring) continue;
    // Registration FIRST, coverage on the moved ring. The order is the point:
    // Instant's georeference on the Snohomish farm sits ~10 ft east of the
    // raster, which read the fully-visible house down to 47 % when coverage
    // was measured unregistered — under the floor that then withheld the very
    // registration that removes the shift.
    const reg = registerContourToRaster({ contour: ring, mask, dsm, groundElevFt });
    const rad = reg.applied ? (reg.transform.thetaDeg * Math.PI) / 180 : 0;
    const ringForCoverage = reg.applied
      ? ring.map((pt) => ({
          x: pt.x * Math.cos(rad) - pt.y * Math.sin(rad) + reg.transform.dxFt,
          y: pt.x * Math.sin(rad) + pt.y * Math.cos(rad) + reg.transform.dyFt,
        }))
      : ring;
    const cov = measureCoverage({ mask, dsm, groundElevFt, rings: [ringForCoverage] });
    const covered = !!cov && cov.share >= COVERAGE_FLOOR;
    const entry: StructureProvenance = {
      prefix: st.prefix,
      contourSqft: st.contourAreaSqft,
      coverage: cov ? { seenSqft: cov.seenSqft, share: cov.share } : null,
      covered,
      ...(st.nestedIn ? { nestedIn: st.nestedIn } : {}),
      registration: reg.applied
        ? { applied: true, transform: reg.transform, iouBefore: reg.iouBefore, iouAfter: reg.iouAfter }
        : { applied: false, reason: reg.reason, iouBefore: reg.iouBefore, iouAfter: reg.iouAfter },
    };
    if (!covered) entry.note = "not covered by elevation data";
    else if (!reg.applied) entry.note = "registration refused";
    else transforms.set(provenance.length, reg.transform);
    provenance.push(entry);
  }
  return { provenance, transforms };
}

/** Raw face id → the index of the structure it grew from ("s2:F5" → 2; a
 *  single-structure model writes bare "F5" → 0). */
const faceStructureIndex = (rawFaceId: string): number => {
  const m = /^s(\d+):/.exec(rawFaceId);
  return m ? Number(m[1]) : 0;
};

/**
 * The V2 path: Instant contour → one regularisation → straight skeleton →
 * register onto the raster → measure the pitch into the facets it built.
 *
 * Gated by ROOF_RECON_V2. The old path is untouched and still the default; this
 * returns null whenever it cannot produce a model, and the caller falls through
 * to it rather than failing.
 *
 * The pitch has three possible origins and the user is told which:
 *   measured  — registration held and enough of the roof reads as a plane
 *   instant   — too little reads (a solar array is the usual cause), so
 *               EagleView's published figure is used; the GEOMETRY is unaffected
 *   refused   — registration itself failed, so the DSM is not in the same frame
 *               as the facets and nothing measured from it can be trusted
 */
function buildV2Geometry(
  recon: ReconBuild,
  instant: InstantRoofData,
): {
  model: RoofModel;
  registration: RegistrationProvenance;
  pitchSource: PitchSourceProvenance;
  structures: StructureProvenance[];
  nestedOutlines?: { overlapSqft: number; pairs: string[] };
  unrecognisedFacets?: Array<{ facet: string; dsmAz: number; faceAz: number; diffDeg: number }>;
  /** Kept so the AI structure read can be scored against the same measurement. */
  visionInputs?: { contour: FootprintPoint[]; measurement: PitchMeasurement };
} | null {
  const first = buildRoofV2({
    instant,
    origin: recon.origin,
    clusters: recon.diagnostics.clusters ?? null,
  });
  if (!first.model || !first.report.structures.some((st) => st.ring)) {
    console.warn("[roofMeasurement] V2: no usable contour — %s", first.report.reasons[0] ?? "unknown");
    return null;
  }

  const { provenance: structures, transforms } = registerStructures(
    first.report.structures,
    recon.mask,
    recon.dsm,
    recon.diagnostics.groundElevFt,
  );
  const nestedOutlines =
    first.report.nestedOverlapSqft > 0
      ? {
          overlapSqft: first.report.nestedOverlapSqft,
          pairs: first.report.structures.filter((st) => st.nestedIn).map((st) => `${st.prefix} inside ${st.nestedIn}`),
        }
      : undefined;
  const instantPitch = instant.totals?.predominantPitch ?? null;
  // The headline registration is the largest structure that got one — kept so
  // rows and viewers that predate the per-structure entry keep reading.
  const headline = structures
    .filter((st) => st.registration?.applied)
    .sort((a, b) => b.contourSqft - a.contourSqft)[0];

  if (!headline) {
    const reason = structures.every((st) => !st.covered)
      ? "no structure on this lot is covered by the elevation data"
      : structures.find((st) => st.note === "registration refused")?.registration?.reason ?? "registration refused";
    console.warn("[roofMeasurement] V2: no structure registered — %s", reason);
    return {
      model: first.model,
      registration: { applied: false, reason, iouBefore: 0, iouAfter: null },
      pitchSource: {
        source: "instant",
        pitch12: instantPitch ?? 0,
        trustedShare: 0,
        reason:
          "The aerial elevation data could not be lined up with any structure on this lot, so nothing measured from " +
          "it would describe this roof. The pitch is EagleView's published figure.",
      },
      structures,
      ...(nestedOutlines ? { nestedOutlines } : {}),
    };
  }

  const measured = measurePitchFromDsm({
    model: first.model,
    mask: recon.mask,
    dsm: recon.dsm,
    transform: headline.registration!.transform!,
    // Facets of a structure that did not register are skipped, so a barn with
    // no raster does not drag trustedShare below the floor for the house.
    transformFor: (id) => transforms.get(faceStructureIndex(id)) ?? null,
    sectionTolerance12: 0.75,
  });
  const solar = instant.structures.some((st) => st.solarPanels === true);
  const sp = structurePitch(measured, instantPitch, { solarPanels: solar });
  // Rebuilt at the pitch that was measured, so the drawn geometry and the
  // printed label are one number and R04 cannot fire.
  const rebuilt = buildRoofV2({
    instant,
    origin: recon.origin,
    clusters: recon.diagnostics.clusters ?? null,
    pitchOverride12: sp.pitch12,
  });
  const model = rebuilt.model ?? first.model;
  // The unrecognised-case detector: what the drawing did NOT reproduce. Runs
  // on the rebuilt model with the same measurement; geometry untouched.
  const unrecognised = detectUnrecognisedFacets(model, measured);
  return {
    model,
    registration: {
      applied: true,
      transform: headline.registration!.transform!,
      iouBefore: headline.registration!.iouBefore!,
      iouAfter: headline.registration!.iouAfter ?? null,
    },
    pitchSource: {
      source: sp.source,
      pitch12: sp.pitch12,
      trustedShare: sp.trustedShare,
      reason: sp.reason,
      ...(solar ? { solarPanels: true } : {}),
    },
    structures,
    ...(nestedOutlines ? { nestedOutlines } : {}),
    ...(unrecognised.length ? { unrecognisedFacets: unrecognised } : {}),
    visionInputs: { contour: first.report.structures.find((st) => st.ring)!.ring as FootprintPoint[], measurement: measured },
  };
}

// ── the Instant order ledger ─────────────────────────────────────────────────

/** ParcelCache-style address key: upper-cased, whitespace-collapsed, equality only. */
const instantAddressKey = (input: EvOrderInput): string =>
  [input.address, input.city, input.state, input.zip]
    .map((part) => (part ?? "").toUpperCase().replace(/\s+/g, " ").trim())
    .join("|");

/** A terminal Property Data verdict (failed/rejected), as opposed to "not ready yet". */
const isTerminalPdFailure = (err: unknown): boolean =>
  err instanceof Error && /^Property Data request (?!failed \()/i.test(err.message) && /fail|error|reject/i.test(err.message);

interface ObtainedInstant {
  instant: InstantRoofData;
  /** Absent when this call ordered (and paid for) a fresh lookup. */
  reuse?: { requestId: string; how: "stored" | "recovered" };
}

/**
 * The only place the product path gets Instant data, and the reason each click
 * is no longer a new bill:
 *
 *   1. An already-paid answer for the same address — a complete InstantOrder
 *      row, or the latest saved measurement's instantJson — is reused as is.
 *   2. A pending order for the address is COLLECTED (result/{id}) instead of
 *      re-ordered. This is the recovery half: a poll that timed out earlier
 *      left the row pending, and the paid result is picked up here for free.
 *   3. Only then is a new order submitted — and its requestId is written to
 *      the ledger BEFORE the first poll, because from the moment EagleView
 *      accepts an order it is billable whether or not we wait. Losing the id
 *      to a timeout exception is how two paid Snohomish lookups became
 *      unrecoverable on 2026-08-26.
 *
 * `forceNewOrder` skips step 1–2 for an explicit "re-measure at a new cost" —
 * a deliberate action, never a side effect of clicking measure again.
 */
async function obtainInstant(input: EvOrderInput, organizationId: string, forceNewOrder: boolean): Promise<ObtainedInstant> {
  const addressKey = instantAddressKey(input);
  const keyed = addressKey !== "|||";

  if (keyed && !forceNewOrder) {
    // 1a. a complete order in the ledger
    const done = await db.instantOrder.findFirst({
      where: { organizationId, addressKey, status: "complete", instantJson: { not: null } },
      orderBy: { createdAt: "desc" },
    });
    if (done?.instantJson) {
      try {
        return { instant: JSON.parse(done.instantJson) as InstantRoofData, reuse: { requestId: done.requestId, how: "stored" } };
      } catch {
        /* an unreadable stored answer falls through to the other sources */
      }
    }
    // 1b. an answer already saved on a measurement row (rows predate the ledger)
    const prior = await db.roofMeasurement.findMany({
      where: { organizationId, instantJson: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { instantJson: true, instantRequestId: true, address: true, city: true, state: true, zip: true },
    });
    for (const row of prior) {
      if (instantAddressKey({ address: row.address ?? "", city: row.city ?? "", state: row.state ?? "", zip: row.zip ?? "" }) !== addressKey) continue;
      try {
        const parsed = JSON.parse(row.instantJson as string) as InstantRoofData;
        if (parsed.structures?.some((st) => (st.outline?.length ?? 0) >= 3)) {
          return { instant: parsed, reuse: { requestId: row.instantRequestId ?? parsed.requestId, how: "stored" } };
        }
      } catch {
        /* skip unreadable rows */
      }
    }
    // 2. a pending order — collect it, never re-order over it
    const pending = await db.instantOrder.findFirst({
      where: { organizationId, addressKey, status: "pending" },
      orderBy: { createdAt: "desc" },
    });
    if (pending) {
      try {
        const got = await pollInstantResult(pending.requestId, input, instantCompleteAddress(input));
        if (got) {
          await db.instantOrder
            .update({ where: { id: pending.id }, data: { status: "complete", instantJson: JSON.stringify(got) } })
            .catch(() => {});
          return { instant: got, reuse: { requestId: pending.requestId, how: "recovered" } };
        }
        throw new Error(
          `A Property Data order for this address is already processing (order ${pending.requestId}) — measuring again later will collect it without paying twice.`,
        );
      } catch (err) {
        if (!isTerminalPdFailure(err)) throw err;
        // the old order is dead for good; record that and order fresh below
        await db.instantOrder
          .update({ where: { id: pending.id }, data: { status: "failed", error: errorMessage(err, String(err)) } })
          .catch(() => {});
      }
    }
  }

  // 3. a new order. The ledger write sits BETWEEN accept and the first poll.
  const { requestId, completeAddress } = await submitInstantOrder(input, PD_DIAGRAM_PACKS);
  try {
    await db.instantOrder.create({
      data: { organizationId, addressKey, address: input.address ?? null, requestId },
    });
  } catch (err) {
    // The order exists either way; without the ledger row a later timeout
    // orphans it again, so say it as loudly as a log can.
    console.error("[roofMeasurement] COULD NOT RECORD instant order %s — a poll timeout will orphan it:", requestId, err);
  }
  let got: InstantRoofData | null;
  try {
    got = await pollInstantResult(requestId, input, completeAddress);
  } catch (err) {
    if (isTerminalPdFailure(err)) {
      await db.instantOrder
        .update({ where: { requestId }, data: { status: "failed", error: errorMessage(err, String(err)) } })
        .catch(() => {});
    }
    throw err;
  }
  if (!got) {
    throw new Error(
      `Property Data is taking longer than expected (order ${requestId}). The order is saved — measuring this address again will collect it without paying twice.`,
    );
  }
  await db.instantOrder
    .update({ where: { requestId }, data: { status: "complete", instantJson: JSON.stringify(got) } })
    .catch(() => {});
  return { instant: got };
}

// ── actions ──────────────────────────────────────────────────────────────────

/**
 * Instant measure: one billed EagleView Instant lookup + the free reconstruction,
 * run together, calibrated, chimney-scanned and saved.
 */
export async function measureRoofInstant(
  input: EvOrderInput,
  opts?: {
    /**
     * Order a fresh (billed) EagleView lookup even when a paid answer for this
     * address already exists. Only an explicit user gesture may set this.
     */
    forceNewOrder?: boolean;
  },
): Promise<MeasureResult> {
  let organizationId: string;
  let userId: string;
  let instant: InstantRoofData;
  let recon: ReconBuild | null;
  let instantReuse: { requestId: string; how: "stored" | "recovered" } | undefined;
  /** Set when Instant could not be used, with the reason — the fallback logs it. */
  let instantMissing: string | null = null;

  try {
    const ctx = await requireEstimatorOrManager();
    organizationId = ctx.organizationId;
    userId = ctx.user.id;
    if (!isEagleViewEnabled()) return { ok: false, error: "EagleView is not configured" };
    if (!input.address && input.lat == null) return { ok: false, error: "Pick an address first" };

    // Both start at once; neither waits on the other. The Instant side goes
    // through the order ledger (obtainInstant): reuse first, then collect any
    // pending order, and only then a new billed order — whose id is recorded
    // before the first poll. The reconstruction is optional: when Solar is not
    // configured it is rejected up front instead of being attempted, and a
    // slow one is abandoned at the deadline — either way the outline-only path
    // takes over below.
    const [instantSettled, reconSettled] = await Promise.allSettled([
      obtainInstant(input, organizationId, opts?.forceNewOrder === true),
      isSolarEnabled()
        ? withDeadline(buildReconModel(input), RECON_DEADLINE_MS, "Roof reconstruction")
        : Promise.reject<ReconBuild>(new Error("Google Solar is not configured")),
    ]);

    // Instant is NOT a precondition for measuring a roof. It used to be — a
    // rejection returned ok:false and the whole measurement died, while the
    // free reconstruction was treated as the optional half. That is backwards,
    // and it is not a rare path: requestInstantRoofData throws on every failure
    // mode it has (non-200, no request id, a failed/rejected status, the 30 s
    // ceiling) and the API has no "not covered" response at all.
    //
    // The quiet case matters more. A 200 carrying an empty structures[] parses
    // into a valid object whose totals are all null — no throw, no outline, so
    // synthesis never starts and the drawing silently falls back to the repair
    // candidates. Both cases are folded here into one explicit condition.
    if (instantSettled.status === "rejected") {
      instantMissing = errorMessage(instantSettled.reason, "EagleView Instant request failed");
    } else if (!instantSettled.value.instant.structures.some((s) => (s.outline?.length ?? 0) >= 3)) {
      instantMissing = "EagleView Instant returned no structure outline for this address";
    }
    instant = instantSettled.status === "fulfilled" ? instantSettled.value.instant : EMPTY_INSTANT;
    instantReuse = instantSettled.status === "fulfilled" ? instantSettled.value.reuse : undefined;
    if (reconSettled.status === "fulfilled") {
      recon = reconSettled.value;
    } else {
      recon = null;
      console.warn(
        "[roofMeasurement] reconstruction unavailable, drawing the outline only:",
        errorMessage(reconSettled.reason, String(reconSettled.reason)),
      );
    }
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Couldn't measure this roof") };
  }

  // ── No Instant: measure from the reconstruction alone. NOTE this does NOT
  // mean nothing was billed — a poll timeout lands here with the order already
  // accepted (and billable) at EagleView. The order ledger keeps its id, and
  // the next measurement of this address collects it instead of paying again. ──
  if (instantMissing) {
    console.warn("[roofMeasurement] measuring without Instant: %s", instantMissing);
    if (!recon) {
      return {
        ok: false,
        error: `${instantMissing}, and the aerial reconstruction is unavailable too — nothing to measure this roof from.`,
      };
    }
    return reconOnlyMeasurement(recon, input, organizationId, userId, instantMissing, instant);
  }

  // ── From here on the Instant result is PAID FOR. Nothing below may throw. ──

  // AI roof-outline trace (geometry only — the printed numbers stay
  // Instant-calibrated): best-effort, strictly AFTER the billed lookup
  // resolved, and raced against its own deadline. A failed, slow or rejected
  // trace leaves visionOutline undefined and the pipeline behaves exactly as
  // without vision — the paid measurement is never lost to it.
  let visionOutline: CalibrateVisionOutline | undefined;
  let visionTraceNote: VisionOutlineProvenance | undefined;
  let roofRegions: Array<Array<{ x: number; y: number }>> | undefined;
  // Only the OLD calibrated path consumes these two traces; V2 builds from the
  // Instant contour and the DSM and never reads them, so with V2 on they were
  // two paid vision calls and up to 8 s per measurement for output that was
  // discarded. On a V2 fallthrough the old path simply runs without them —
  // exactly as it does when a trace fails — and the fallthrough is recorded.
  if (recon && !roofReconV2Enabled()) {
    const slug = outlineSlug(input, instant);
    // Both traces run against the same cached ortho; concurrently, so the pair
    // still fits inside one deadline's worth of wall clock.
    const [traced, regions] = await Promise.all([
      visionRoofOutline(instant, recon.origin, slug),
      visionRoofRegions(instant, recon.origin, slug),
    ]);
    visionOutline = traced.outline;
    visionTraceNote = traced.note;
    roofRegions = regions;
  }

  const { model, calibration, validation, pipeline, planarize, synthesize, graft, outlineSource, visionOutline: visionNote, source, origin, registration, pitchSource, v2Fallthrough, structures, nestedOutlines, unrecognisedFacets, visionInputs } = resolveGeometry(recon, instant, input, visionOutline, roofRegions);

  // Chimneys: DSM posts on the RAW reconstruction (the rasters' frame — the
  // calibrated model stays in it, so no transform is needed) + vision boxes on
  // the Instant ortho, merged and gated. Best-effort: any failure means none.
  let chimneys: ChimneyCandidate[] = [];
  /** The one AI structure read; its interior lines are scored below. */
  let aiRead: RoofStructureRead | null = null;
  try {
    const dsmCands = recon
      ? detectChimneysDsm({
          dsm: recon.dsm,
          mask: recon.mask,
          groundElevFt: recon.diagnostics.groundElevFt,
          model: recon.model,
        })
      : [];
    // Penetrations from the top-model roof read; the older per-penetration pass
    // is the fallback when that read is unavailable.
    const slugForVision = outlineSlug(input, instant);
    aiRead = await structureRead(instant, origin, slugForVision);
    let visionCands = penetrationsOf(aiRead);
    if (!visionCands.length) visionCands = await visionChimneys(instant, origin);
    chimneys = combineChimneys(
      dsmCands,
      visionCands,
      model,
      calibration,
      chimneyGate(instant.structures),
      registration?.applied ? registration.transform : null,
    );
  } catch (err) {
    console.warn("[roofMeasurement] chimney detection skipped:", errorMessage(err, String(err)));
    chimneys = [];
  }

  // The AI's topology read, scored against the DSM that produced this model.
  // Evidence only — measured 2026-08-28 to disagree with the DSM on every
  // wall where both spoke, so it may never move a vertex (visionEvidence.ts).
  let visionStructure: VisionStructureEvidence | undefined;
  if (aiRead && aiRead.interior.length && visionInputs) {
    try {
      visionStructure = readVisionEvidence({
        contour: visionInputs.contour,
        model,
        measurement: visionInputs.measurement,
        interior: aiRead.interior,
        unrecognised: (unrecognisedFacets ?? []).map((u) => u.facet),
        source: aiRead.source,
        model_: aiRead.model,
      });
      const ag = visionStructure.agreement;
      console.log(
        "[roofMeasurement] AI topology read: %d ridge / %d hip / %d valley · agrees with the DSM on %s of %d walls",
        visionStructure.lines.ridge, visionStructure.lines.hip, visionStructure.lines.valley,
        ag.share == null ? "n/a" : `${ag.agreed}`, ag.both,
      );
    } catch (err) {
      console.warn("[roofMeasurement] vision evidence skipped:", errorMessage(err, String(err)));
    }
  }

  const toSave: PersistInput = {
    organizationId,
    createdById: userId,
    source,
    address: input.address || instant.address || null,
    city: input.city || null,
    state: input.state || null,
    zip: input.zip || null,
    lat: instant.lat,
    lng: instant.lng,
    // On the V2 path the printed figures come from the DRAWN geometry — that is
    // the whole point of measuring pitch into the facets (ROOF-DIAGNOSIS §I:
    // an estimate's area must come from the geometry that was drawn).
    areaSqft: pitchSource ? model.totals.areaSqft : instant.totals.areaSqft,
    squares: pitchSource ? model.totals.squares : instant.totals.squares,
    predominantPitch: pitchSource ? `${Math.round(pitchSource.pitch12)}/12` : instant.totals.pitchLabel,
    facetCount: model.totals.facetCount || instant.totals.facetCount,
    instantRequestId: instant.requestId,
    instant,
    model,
    chimneys,
    stored: provenanceOf(model, recon, pickOrtho(instant), calibration, validation, {
      pipeline,
      planarize,
      synthesize,
      graft,
      outlineSource,
      // The calibration's verdict wins; a trace that never produced an
      // accepted ring still records why (best-effort diagnostics).
      visionOutline: visionNote ?? visionTraceNote,
      ...(registration ? { registration } : {}),
      ...(pitchSource ? { pitchSource } : {}),
      ...(v2Fallthrough ? { v2Fallthrough } : {}),
      ...(instantReuse ? { instantReuse } : {}),
      ...(structures?.length ? { structures } : {}),
      ...(nestedOutlines ? { nestedOutlines } : {}),
      ...(unrecognisedFacets?.length ? { unrecognisedFacets } : {}),
      ...(visionStructure ? { visionStructure } : {}),
    }),
  };

  try {
    const measurement = await persist(toSave);
    return { ok: true, measurement, ...(instantReuse ? { reusedInstant: instantReuse } : {}) };
  } catch (err) {
    console.error(
      "[roofMeasurement] Instant request %s was billed but could not be saved: %s",
      instant.requestId,
      errorMessage(err, String(err)),
    );
    return { ok: true, measurement: unsavedDTO(toSave), unsaved: true, ...(instantReuse ? { reusedInstant: instantReuse } : {}) };
  }
}

/**
 * Free estimate: the aerial reconstruction alone, saved as `source: "recon"`.
 * The model keeps `source: "synthetic"` so the viewers stamp it as an estimate
 * and the pricing path ignores it. No EagleView call, nothing billed.
 */
export async function measureRoofFree(input: ReconBuildInput): Promise<MeasureResult> {
  try {
    const { organizationId, user } = await requireEstimatorOrManager();
    if (!isSolarEnabled()) {
      return { ok: false, error: "Set GOOGLE_MAPS_API_KEY to enable the free roof preview." };
    }

    const recon = await withDeadline(buildReconModel(input), RECON_DEADLINE_MS, "Roof reconstruction");
    // No AI roof-outline trace on the free path: there is no Instant wall
    // outline to validate a trace against, so vision is deliberately skipped.
    // Straighten the drawing onto the house grid and run the refine passes;
    // figures are recomputed from the repaired geometry (k = 1 — nothing to
    // calibrate against) and the result is validator-gated (spec §4).
    const { model, validation, planarize } = regularizeReconModel(recon.model);
    let chimneys: ChimneyCandidate[] = [];
    try {
      const freeIdx = buildIndexes(model);
      chimneys = dropOutsideRoof(
        // The DSM detector needs the RASTER frame — always the raw recon model.
        detectChimneysDsm({
          dsm: recon.dsm,
          mask: recon.mask,
          groundElevFt: recon.diagnostics.groundElevFt,
          model: recon.model,
        }),
        model.faces
          .map((f) => ringOf(f.lineIds, freeIdx))
          .filter((r): r is NonNullable<typeof r> => !!r && r.length >= 3)
          .map((r) => r.map((p) => ({ x: p.x, y: p.y }))),
        BOUNDS_MARGIN_FT,
      );
    } catch (err) {
      console.warn("[roofMeasurement] chimney detection skipped:", errorMessage(err, String(err)));
    }

    const toSave: PersistInput = {
      organizationId,
      createdById: user.id,
      source: "recon",
      address: input.address || null,
      city: input.city || null,
      state: input.state || null,
      zip: input.zip || null,
      lat: recon.origin.lat,
      lng: recon.origin.lng,
      areaSqft: model.totals.areaSqft,
      squares: model.totals.squares,
      predominantPitch: `${model.totals.predominantPitch}/12`,
      facetCount: model.totals.facetCount,
      instantRequestId: null,
      instant: null,
      model,
      chimneys,
      stored: provenanceOf(model, recon, null, null, validation, { planarize }),
    };

    try {
      const measurement = await persist(toSave);
      return { ok: true, measurement };
    } catch (err) {
      // Nothing was billed, but the reconstruction is done — hand it back.
      console.error("[roofMeasurement] free estimate could not be saved: %s", errorMessage(err, String(err)));
      return { ok: true, measurement: unsavedDTO(toSave), unsaved: true };
    }
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Couldn't build the roof estimate") };
  }
}

/**
 * Recent measurements for the org, newest first — no geometry, list columns only.
 * Throws on auth / DB errors (a plain read; the page boundary handles it).
 */
export async function listRoofMeasurements(limit = 20): Promise<RoofMeasurementSummary[]> {
  const { organizationId } = await requireEstimatorOrManager();
  const take = Math.min(Math.max(Math.floor(limit) || 20, 1), 100);
  const rows = await db.roofMeasurement.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      source: true,
      address: true,
      city: true,
      state: true,
      areaSqft: true,
      squares: true,
      predominantPitch: true,
      facetCount: true,
      pngUrl: true,
      createdAt: true,
    },
  });
  return rows.map(toSummary);
}

/**
 * One saved measurement with its geometry, or null when it is not this org's.
 * Throws on auth / DB errors (a plain read; the page boundary handles it).
 */
export async function getRoofMeasurement(id: string): Promise<RoofMeasurementDTO | null> {
  const { organizationId } = await requireEstimatorOrManager();
  if (!id) return null;
  const row = await db.roofMeasurement.findFirst({ where: { id, organizationId } });
  return row ? toDTO(row) : null;
}

/** Upper bound on the PNG data URL the export sends (≈ 6 MB of image bytes). */
const PNG_DATA_URL_MAX_CHARS = 8_000_000;
/** Only a Vercel Blob URL of ours is ever deleted before a re-upload. */
const BLOB_URL = /^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//i;

/**
 * Export PNG: the browser captures the combined sheet, this stores it in
 * Vercel Blob (`roof-diagram/<id>.png`) and records the URL on the row so the
 * history list gets a thumbnail and the proposal attach can reuse it. Only
 * PNG data URLs are accepted; the row must belong to the caller's org, which
 * is checked BEFORE the upload so a foreign id cannot spend Blob storage.
 * Never throws to the client.
 */
export async function saveRoofDiagramPng(
  id: string,
  dataUrl: string,
): Promise<{ ok: true; pngUrl: string } | { ok: false; error: string }> {
  try {
    const { organizationId } = await requireEstimatorOrManager();
    if (!id || id === "unsaved") return { ok: false, error: "This measurement was not saved, so its drawing cannot be stored" };
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) {
      return { ok: false, error: "Expected a PNG data URL" };
    }
    if (dataUrl.length > PNG_DATA_URL_MAX_CHARS) return { ok: false, error: "The PNG is too large to store (6 MB limit)" };
    if (!isBlobEnabled()) return { ok: false, error: "Vercel Blob is not configured" };

    const owned = await db.roofMeasurement.findFirst({ where: { id, organizationId }, select: { pngUrl: true } });
    if (!owned) return { ok: false, error: "Measurement not found" };

    const buffer = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
    if (!buffer.length) return { ok: false, error: "The PNG is empty" };

    // Fixed key, no random suffix: a re-export replaces the drawing instead of
    // orphaning a blob per click. @vercel/blob 0.27 has no allowOverwrite, so
    // the previous blob is deleted first (best-effort — a missing blob is fine).
    if (owned.pngUrl && BLOB_URL.test(owned.pngUrl)) {
      try {
        await deleteBlob(owned.pngUrl);
      } catch {
        /* stale or already-deleted blob; the upload below still proceeds */
      }
    }
    const { url } = await uploadBlob(`roof-diagram/${id}.png`, buffer, { addRandomSuffix: false });
    const { count } = await db.roofMeasurement.updateMany({
      where: { id, organizationId },
      data: { pngUrl: url },
    });
    if (count === 0) return { ok: false, error: "Measurement not found" };
    return { ok: true, pngUrl: url };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Couldn't store the roof diagram") };
  }
}
