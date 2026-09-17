"use server";
// Ground elevation profile of the TRACED FENCE — the one the price reads.
// The implementation (USGS 3DEP first, Google fallback, disk cache, rate
// limit) lives in lib/elevationProfile, shared with POST /api/fence/elevation,
// which serves the lot's display-only contour lattice outside the server-action
// queue (see the header there for why).
//
// Failure is a value, not a throw: the studio prices the fence off the plan
// length either way, and says so in the proposal's assumptions.
import { requireEstimatorOrManager } from "@/lib/orgContext";
import { elevationForPoints, type ElevationProfileResult } from "@/lib/elevationProfile";

export type { ElevationProfileResult, ElevationSource } from "@/lib/elevationProfile";

export async function fetchElevationProfile(
  points: Array<{ lat: number; lng: number }>,
): Promise<ElevationProfileResult> {
  const { organizationId } = await requireEstimatorOrManager();
  return elevationForPoints(points, organizationId);
}
