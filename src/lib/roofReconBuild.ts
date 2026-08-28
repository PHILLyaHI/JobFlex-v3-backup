// Free aerial roof reconstruction, as a reusable build step.
//
// This is the body that used to live inside the `reconRoofPreview` server
// action: geocode → Google Solar data layers → DSM + building mask → parcel
// scoping → pitch priors → reconstructRoof → provenance. It was moved here so
// the roof-diagram pipeline (src/actions/roofMeasurement.ts) can run the same
// reconstruction in PARALLEL with a billed EagleView Instant lookup and keep
// the rasters + diagnostics the action used to throw away — the DSM and mask
// feed chimney detection, `groundElevFt` puts DSM heights above ground, and
// `origin` is the frame every later stage shares.
//
// No auth and no env guard in here: every caller is a server action that has
// already run requireEstimatorOrManager() and isSolarEnabled(). Failures that
// used to be `{ ok: false, error }` returns are thrown as ReconUnavailableError
// carrying the SAME user-facing message, so the preview action can stay a thin
// `try { … } catch → { ok: false, error: err.message }` wrapper.
//
// Coordinate frame of the returned model: the tile's local-feet frame — origin
// at the queried pin (the Solar tile centre), x east, y north, z feet above
// ground. Geo rings convert into it via latLngRingToFrame(origin, ring).
import { geocode } from "@/lib/maps";
import { fetchParcelRing } from "@/lib/parcel";
import {
  getBuildingInsights,
  getDataLayers,
  fetchRaster,
  type DataLayerUrls,
  type Raster,
  type SolarDate,
  type SolarFailureKind,
} from "@/lib/solar";
import { reconstructRoof, latLngRingToFrame, type ReconResult } from "@/lib/roofRecon";
import { readSolarCache, solarCacheKey, writeSolarCache, type CachedSolar } from "@/lib/solarCache";
import type { RoofModel } from "@/lib/eagleview";

const M2_TO_SQFT = 10.7639;

/**
 * A reconstruction that could not be built for a reason the user should read.
 *
 * The `kind` is what decides what the screen says and whether it offers a retry
 * button. Before it existed the reason went to console.warn and nothing else,
 * so a 15 s network timeout and a genuine absence of Google coverage produced
 * the SAME drawing with the same caption — "no usable aerial elevation data for
 * this address" — which was a lie in the first case.
 */
export class ReconUnavailableError extends Error {
  constructor(
    message: string,
    readonly kind: SolarFailureKind = "no-coverage",
  ) {
    super(message);
    this.name = "ReconUnavailableError";
  }
}

export interface ReconBuildInput {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  /** Ignore the frozen Solar answer for this place and fetch it again. */
  refreshSolar?: boolean;
}

export interface ReconBuild {
  /** `source: "synthetic"` — an estimate until calibrated against Instant. */
  model: RoofModel;
  /** Google Solar DSM, metres, raw (not yet above ground). */
  dsm: Raster;
  /** Google Solar building mask (1 = building), same grid as `dsm`. */
  mask: Raster;
  diagnostics: ReconResult["diagnostics"];
  /** Google's own whole-roof area for the same building, as an independent check. */
  googleAreaSqft: number | null;
  /** True when several structures on the parcel were measured together. */
  multiStructure: boolean;
  /** Other structures in the tile that were NOT measured, plan-view sqft. */
  excludedSqft: number[];
  layers: DataLayerUrls;
  /** The pin the tile was fetched around — the origin of the model's frame. */
  origin: { lat: number; lng: number };
}

function isoDate(d: SolarDate | null): string | undefined {
  if (!d?.year) return undefined;
  const p = (n?: number) => String(n ?? 1).padStart(2, "0");
  return `${d.year}-${p(d.month)}-${p(d.day)}`;
}

export async function buildReconModel(input: ReconBuildInput): Promise<ReconBuild> {
  // Resolve coordinates — the address autocomplete usually supplies them.
  let { lat, lng } = input;
  if (lat == null || lng == null) {
    const query = [input.address, input.city, input.state, input.zip].filter(Boolean).join(", ");
    if (!query) throw new ReconUnavailableError("Enter an address first.", "error");
    const hit = await geocode(query);
    if (!hit) throw new ReconUnavailableError("Couldn't locate that address.", "error");
    lat = hit.lat;
    lng = hit.lng;
  }

  // The frozen answer for this place, if we have one. Everything Google can
  // tell us about a roof — the layer URLs, both rasters and the building
  // insights — is cached together, because a measurement needs all of it and a
  // partial cache would still be one hung request away from failing.
  const cacheKey = solarCacheKey(input.lat == null || input.lng == null ? input : { ...input, lat, lng });
  const cached = input.refreshSolar ? null : await readSolarCache(cacheKey);
  if (cached) {
    // The pin is taken from the frozen row, not re-geocoded: the rasters are
    // in the tile fetched around THAT pin, and the model's frame has its origin
    // there. Recomputing it could shift every coordinate by a metre or two.
    lat = cached.lat;
    lng = cached.lng;
  }

  const layers = cached?.layers ?? (await getDataLayers(lat, lng));
  if (!layers.dsmUrl || !layers.maskUrl) {
    throw new ReconUnavailableError(
      "Google has no high-resolution roof data for this address. Order an EagleView report to measure it.",
      "no-coverage",
    );
  }
  if (layers.imageryQuality !== "HIGH") {
    // Below HIGH the DSM is 0.25-1 m/px; a facet is then only a few pixels
    // across and plane segmentation cannot resolve it. Refuse rather than
    // return a confident-looking wrong model.
    throw new ReconUnavailableError(
      `Only ${layers.imageryQuality}-resolution imagery is available here, which is too coarse to measure a roof. Order an EagleView report instead.`,
      "no-coverage",
    );
  }

  const [dsm, mask] = cached
    ? [cached.dsm, cached.mask]
    : await Promise.all([fetchRaster(layers.dsmUrl), fetchRaster(layers.maskUrl)]);
  if (dsm.width !== mask.width || dsm.height !== mask.height) {
    throw new ReconUnavailableError("Google returned mismatched imagery layers for this address.", "error");
  }

  // Parcel ring decides which of the tile's structures belong to this property.
  // Without it we measure only the building under the pin, which understates a
  // property that has a detached garage or wing. Soft-fails by design.
  const ring = await fetchParcelRing(lat, lng);
  const parcel = ring.length >= 3 ? latLngRingToFrame({ lat, lng }, ring) : undefined;

  // Google's per-segment pitch, rounded, becomes the candidate set our own
  // planes snap to — it says which pitches this roof is actually framed to, so
  // slope noise is corrected toward a real value instead of any integer.
  // Fetched before reconstruction because it feeds it; also reused below as an
  // independent area check.
  let insights: Awaited<ReturnType<typeof getBuildingInsights>> | null = cached?.insights ?? null;
  if (!cached) {
    try {
      insights = await getBuildingInsights(lat, lng);
    } catch {
      /* priors and the cross-check are both optional */
    }
  }

  // Freeze before reconstructing: what was paid for in latency is the three
  // Solar answers, and they are worth keeping even if our own maths then
  // refuses this roof.
  if (!cached) {
    const frozen: CachedSolar = { lat, lng, layers, insights, dsm, mask };
    await writeSolarCache(cacheKey, frozen);
  }
  const pitchPriors12 = [
    ...new Set(
      (insights?.segments ?? [])
        .map((s) => Math.round(Math.tan((s.pitchDegrees * Math.PI) / 180) * 12))
        .filter((p) => p >= 1 && p <= 24),
    ),
  ];

  const { model, diagnostics } = reconstructRoof(dsm, mask, { parcel, pitchPriors12 });
  if (!model.faces.length) {
    throw new ReconUnavailableError("Couldn't resolve any roof planes at this address.", "no-coverage");
  }

  model.location = {
    address: input.address,
    city: input.city,
    state: input.state,
    postal: input.zip,
    lat,
    lng,
  };
  model.provenance = {
    imageryQuality: layers.imageryQuality,
    imageryDate: isoDate(layers.imageryDate),
    pixelSizeM: dsm.pixelSizeM,
    facetsFound: diagnostics.clusters,
    facetsDropped: diagnostics.droppedClusters,
  };

  const googleAreaSqft =
    insights?.wholeRoofAreaM2 != null ? insights.wholeRoofAreaM2 * M2_TO_SQFT : null;

  return {
    model,
    dsm,
    mask,
    diagnostics,
    googleAreaSqft,
    multiStructure: diagnostics.keptComponents > 1,
    excludedSqft: diagnostics.maskComponentsSqft.slice(diagnostics.keptComponents),
    layers,
    origin: { lat, lng },
  };
}
