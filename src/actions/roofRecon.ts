"use server";
// Free, instant roof preview reconstructed from Google Solar DSM imagery — the
// no-EagleView-order path for the roof estimator.
//
// Returns the SAME RoofModel shape an ordered EagleView report produces, tagged
// `source: "synthetic"`, so the existing blueprint 2D/3D viewers render it with
// no changes. The tag is what the estimator uses to keep synthetic measurements
// out of the pricing path — see RoofEstimatorForm.
//
// Stateless: nothing is written to the DB. A synthetic model is a preview, not a
// measurement of record, so it should not occupy the EagleViewReport cache.
import { requireEstimatorOrManager } from "@/lib/orgContext";
import { geocode } from "@/lib/maps";
import { fetchParcelRing } from "@/lib/parcel";
import {
  isSolarEnabled,
  getBuildingInsights,
  getDataLayers,
  fetchRaster,
  type SolarDate,
} from "@/lib/solar";
import { reconstructRoof, latLngRingToFrame } from "@/lib/roofRecon";
import type { RoofModel } from "@/lib/eagleview";
import { enforceRateLimit, HOUR } from "@/lib/rateLimit";

const M2_TO_SQFT = 10.7639;

function isoDate(d: SolarDate | null): string | undefined {
  if (!d?.year) return undefined;
  const p = (n?: number) => String(n ?? 1).padStart(2, "0");
  return `${d.year}-${p(d.month)}-${p(d.day)}`;
}

export interface ReconPreview {
  model: RoofModel;
  /** Google's own whole-roof area for the same building, as an independent check. */
  googleAreaSqft: number | null;
  /** True when several structures on the parcel were measured together. */
  multiStructure: boolean;
  /** Other structures in the tile that were NOT measured, plan-view sqft. */
  excludedSqft: number[];
}

export async function reconRoofPreview(input: {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lng?: number;
}): Promise<{ ok: true; preview: ReconPreview } | { ok: false; error: string }> {
  const { organizationId: rlOrg } = await requireEstimatorOrManager();
  await enforceRateLimit(`roof-recon:${rlOrg}`, 30, HOUR, "roof scans");
  if (!isSolarEnabled()) {
    return { ok: false, error: "Set GOOGLE_MAPS_API_KEY to enable the free roof preview." };
  }

  try {
    // Resolve coordinates — the address autocomplete usually supplies them.
    let { lat, lng } = input;
    if (lat == null || lng == null) {
      const query = [input.address, input.city, input.state, input.zip].filter(Boolean).join(", ");
      if (!query) return { ok: false, error: "Enter an address first." };
      const hit = await geocode(query);
      if (!hit) return { ok: false, error: "Couldn't locate that address." };
      lat = hit.lat;
      lng = hit.lng;
    }

    const layers = await getDataLayers(lat, lng);
    if (!layers.dsmUrl || !layers.maskUrl) {
      return {
        ok: false,
        error:
          "Google has no high-resolution roof data for this address. Order an EagleView report to measure it.",
      };
    }
    if (layers.imageryQuality !== "HIGH") {
      // Below HIGH the DSM is 0.25-1 m/px; a facet is then only a few pixels
      // across and plane segmentation cannot resolve it. Refuse rather than
      // return a confident-looking wrong model.
      return {
        ok: false,
        error: `Only ${layers.imageryQuality}-resolution imagery is available here, which is too coarse to measure a roof. Order an EagleView report instead.`,
      };
    }

    const [dsm, mask] = await Promise.all([
      fetchRaster(layers.dsmUrl),
      fetchRaster(layers.maskUrl),
    ]);
    if (dsm.width !== mask.width || dsm.height !== mask.height) {
      return { ok: false, error: "Google returned mismatched imagery layers for this address." };
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
    let insights: Awaited<ReturnType<typeof getBuildingInsights>> | null = null;
    try {
      insights = await getBuildingInsights(lat, lng);
    } catch {
      /* priors and the cross-check are both optional */
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
      return { ok: false, error: "Couldn't resolve any roof planes at this address." };
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
      ok: true,
      preview: {
        model,
        googleAreaSqft,
        multiStructure: diagnostics.keptComponents > 1,
        excludedSqft: diagnostics.maskComponentsSqft.slice(diagnostics.keptComponents),
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't build the roof preview.",
    };
  }
}
