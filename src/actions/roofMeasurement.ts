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
// Billing rule: requestInstantRoofData is called EXACTLY once per invocation and
// never retried. Once Instant HAS resolved the result is paid for and must
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
  requestInstantRoofData,
  fetchPropertyImage,
  PD_DIAGRAM_PACKS,
  type EvOrderInput,
  type InstantImage,
  type InstantRoofData,
  type InstantStructure,
  type RoofModel,
} from "@/lib/eagleview";
import { isSolarEnabled } from "@/lib/solar";
import { deleteBlob, isBlobEnabled, uploadBlob } from "@/lib/sdk/blob";
import { buildReconModel, type ReconBuild, type ReconBuildInput } from "@/lib/roofReconBuild";
import { buildRoofV2, buildRoofV2FromRecon, measureCoverage, roofReconV2Enabled } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { measurePitchFromDsm, structurePitch } from "@/lib/roofRecon/pitchFromDsm";
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
async function structurePenetrations(
  instant: InstantRoofData,
  origin: LatLng | null,
  slug: string | undefined,
): Promise<ChimneyCandidate[]> {
  if (!origin) return [];
  try {
    const wallRings = instantWallRingsRaw(instant, origin);
    const read = await withDeadline(
      readRoofStructure({ imagery: instant.imagery, origin, slug, wallRings }),
      VISION_DEADLINE_MS,
      "Roof structure vision",
    );
    return read.penetrations.map((p) => ({
      x: p.x,
      y: p.y,
      wFt: p.wFt,
      hFt: p.hFt,
      kind: p.kind === "skylight" ? "vent" : p.kind,
      confidence: p.confidence,
      method: "vision" as const,
    }));
  } catch (err) {
    console.warn("[roofMeasurement] structure penetrations skipped:", err instanceof Error ? err.message : err);
    return [];
  }
}

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
function combineChimneys(
  dsm: ChimneyCandidate[],
  vision: ChimneyCandidate[],
  model: RoofModel,
  calibration: CalibrationReport | null,
  gate: boolean | null,
): ChimneyCandidate[] {
  const placedVision = applyRigidTransform(vision, calibration?.outlineTransform ?? IDENTITY_TRANSFORM);
  const merged = mergeChimneys(dsm, placedVision, { chimney: gate });
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
        };
      }
      console.warn("[roofMeasurement] ROOF_RECON_V2 produced no model — falling through to the calibrated path");
    } catch (err) {
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
      source: "instant+recon",
      origin: recon.origin,
    };
  } catch (err) {
    console.warn("[roofMeasurement] calibration failed, drawing the outline only:", errorMessage(err, String(err)));
    return outlineGeometry(recon, instant, input);
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

  const built = buildRoofV2FromRecon({
    mask: recon.mask,
    dsm: recon.dsm,
    groundElevFt: recon.diagnostics.groundElevFt,
    parcel,
    pitch12: recon.model.totals.predominantPitch ?? null,
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
  const firstRing = built.report.structures.find((st) => st.ring)?.ring;
  if (firstRing) {
    const reg = registerContourToRaster({
      contour: firstRing,
      mask: recon.mask,
      dsm: recon.dsm,
      groundElevFt: recon.diagnostics.groundElevFt,
    });
    registration = reg.applied
      ? { applied: true, transform: reg.transform, iouBefore: reg.iouBefore, iouAfter: reg.iouAfter }
      : { applied: false, reason: reg.reason, iouBefore: reg.iouBefore, iouAfter: reg.iouAfter };
    if (reg.applied) {
      const measured = measurePitchFromDsm({
        model,
        mask: recon.mask,
        dsm: recon.dsm,
        transform: reg.transform,
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
      });
      return partialReason
        ? {
            ...base,
            provenance: {
              ...base.provenance,
              partialCoverage: { reason: partialReason, measuredStructures },
            },
          }
        : base;
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
} | null {
  const first = buildRoofV2({
    instant,
    origin: recon.origin,
    clusters: recon.diagnostics.clusters ?? null,
  });
  const contour = first.report.structures.find((st) => st.ring)?.ring;
  if (!first.model || !contour) {
    console.warn("[roofMeasurement] V2: no usable contour — %s", first.report.reasons[0] ?? "unknown");
    return null;
  }

  const reg = registerContourToRaster({
    contour,
    mask: recon.mask,
    dsm: recon.dsm,
    groundElevFt: recon.diagnostics.groundElevFt,
  });
  const instantPitch = instant.totals?.predominantPitch ?? null;

  if (!reg.applied) {
    console.warn("[roofMeasurement] V2: registration refused — %s", reg.reason);
    return {
      model: first.model,
      registration: { applied: false, reason: reg.reason, iouBefore: reg.iouBefore, iouAfter: reg.iouAfter },
      pitchSource: {
        source: "instant",
        pitch12: instantPitch ?? 0,
        trustedShare: 0,
        reason:
          "The aerial elevation data could not be lined up with the building outline, so nothing measured from it " +
          "would describe this roof. The pitch is EagleView's published figure.",
      },
    };
  }

  const measured = measurePitchFromDsm({
    model: first.model,
    mask: recon.mask,
    dsm: recon.dsm,
    transform: reg.transform,
    sectionTolerance12: 0.75,
  });
  const sp = structurePitch(measured, instantPitch);
  // Rebuilt at the pitch that was measured, so the drawn geometry and the
  // printed label are one number and R04 cannot fire.
  const rebuilt = buildRoofV2({
    instant,
    origin: recon.origin,
    clusters: recon.diagnostics.clusters ?? null,
    pitchOverride12: sp.pitch12,
  });
  const model = rebuilt.model ?? first.model;
  const solar = instant.structures.some((st) => st.solarPanels === true);
  return {
    model,
    registration: {
      applied: true,
      transform: reg.transform,
      iouBefore: reg.iouBefore,
      iouAfter: reg.iouAfter,
    },
    pitchSource: {
      source: sp.source,
      pitch12: sp.pitch12,
      trustedShare: sp.trustedShare,
      reason: sp.reason,
      ...(solar ? { solarPanels: true } : {}),
    },
  };
}

// ── actions ──────────────────────────────────────────────────────────────────

/**
 * Instant measure: one billed EagleView Instant lookup + the free reconstruction,
 * run together, calibrated, chimney-scanned and saved.
 */
export async function measureRoofInstant(input: EvOrderInput): Promise<MeasureResult> {
  let organizationId: string;
  let userId: string;
  let instant: InstantRoofData;
  let recon: ReconBuild | null;
  /** Set when Instant could not be used, with the reason — the fallback logs it. */
  let instantMissing: string | null = null;

  try {
    const ctx = await requireEstimatorOrManager();
    organizationId = ctx.organizationId;
    userId = ctx.user.id;
    if (!isEagleViewEnabled()) return { ok: false, error: "EagleView is not configured" };
    if (!input.address && input.lat == null) return { ok: false, error: "Pick an address first" };

    // Both start at once; neither waits on the other. The Instant call is the
    // billed one and is issued exactly here, once. The reconstruction is
    // optional: when Solar is not configured it is rejected up front instead of
    // being attempted, and a slow one is abandoned at the deadline — either way
    // the outline-only path takes over below.
    const [instantSettled, reconSettled] = await Promise.allSettled([
      requestInstantRoofData(input, PD_DIAGRAM_PACKS),
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
    } else if (!instantSettled.value.structures.some((s) => (s.outline?.length ?? 0) >= 3)) {
      instantMissing = "EagleView Instant returned no structure outline for this address";
    }
    instant = instantSettled.status === "fulfilled" ? instantSettled.value : EMPTY_INSTANT;
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

  // ── No Instant: measure from the reconstruction alone (nothing was billed) ──
  if (instantMissing) {
    console.warn("[roofMeasurement] measuring without Instant: %s", instantMissing);
    if (!recon) {
      return {
        ok: false,
        error: `${instantMissing}, and the aerial reconstruction is unavailable too — nothing to measure this roof from.`,
      };
    }
    return reconOnlyMeasurement(recon, input, organizationId, userId, instantMissing);
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
  if (recon) {
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

  const { model, calibration, validation, pipeline, planarize, synthesize, graft, outlineSource, visionOutline: visionNote, source, origin, registration, pitchSource } = resolveGeometry(recon, instant, input, visionOutline, roofRegions);

  // Chimneys: DSM posts on the RAW reconstruction (the rasters' frame — the
  // calibrated model stays in it, so no transform is needed) + vision boxes on
  // the Instant ortho, merged and gated. Best-effort: any failure means none.
  let chimneys: ChimneyCandidate[] = [];
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
    let visionCands = await structurePenetrations(instant, origin, slugForVision);
    if (!visionCands.length) visionCands = await visionChimneys(instant, origin);
    chimneys = combineChimneys(dsmCands, visionCands, model, calibration, chimneyGate(instant.structures));
  } catch (err) {
    console.warn("[roofMeasurement] chimney detection skipped:", errorMessage(err, String(err)));
    chimneys = [];
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
    }),
  };

  try {
    const measurement = await persist(toSave);
    return { ok: true, measurement };
  } catch (err) {
    console.error(
      "[roofMeasurement] Instant request %s was billed but could not be saved: %s",
      instant.requestId,
      errorMessage(err, String(err)),
    );
    return { ok: true, measurement: unsavedDTO(toSave), unsaved: true };
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
