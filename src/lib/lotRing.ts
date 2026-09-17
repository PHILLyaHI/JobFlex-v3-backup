// THE LOT BOUNDARY FOR THE ROOF PATH — one source order, stated out loud.
//
// The roof measurement used to take its lot outline from Regrid alone
// (lib/parcel.fetchParcelRing), while the fence studio and the HVAC estimator
// took theirs from ParcelCache → ReportAll (lib/parcelLookup). Two services for
// one fact is two sets of coverage, two failure modes and two silences: Regrid
// issues 30-day JWTs, so its token expires on a schedule, and an expired token
// returns an empty ring that reads exactly like "this address has no parcel".
// The roof then measured only the structure under the pin and said nothing.
//
// The order here (owner, 2026-09-17):
//   1. ParcelCache, then ReportAll — the same call the fence and the estimator
//      make, so a lot either service has already paid for is free, and the
//      ALLTIME allowance is spent under the same reserve (lookupParcelByPoint
//      refuses below QUOTA_FLOOR rather than answering a silent "no parcel").
//   2. Regrid, and ONLY when ReportAll answered that it has no parcel here.
//      A ReportAll outage or a missing key is NOT that answer, and falling
//      through on those would hide an outage behind a second service.
//
// Nothing in the fence or HVAC paths changes: they call lookupParcelByPoint
// directly and always did.

import { lookupParcelByPoint } from "@/lib/parcelLookup";
import { fetchParcelRing, pointInRing, type LatLngPoint } from "@/lib/parcel";

/** Where the outline came from. `none` is "nobody has a boundary here", which
 *  is an answer; `blocked` below says when it is a failure instead. */
export type LotRingSource = "cache" | "reportall" | "regrid" | "none";

export interface LotRingResult {
  /** The outer ring containing the point, or empty. */
  ring: LatLngPoint[];
  source: LotRingSource;
  /**
   * Set when the ring is empty for a reason the caller must surface, as opposed
   * to the point genuinely having no parcel on file. Same contract, and the
   * same reasoning, as lib/parcel.ParcelRingLookup["blocked"]: losing the
   * boundary silently drops a detached garage from the measurement.
   */
  blocked?: { kind: string; message: string };
}

/** ReportAll rings are [lat, lng] tuples; the roof code speaks { lat, lng }. */
const toLatLng = (ring: ReadonlyArray<readonly [number, number]>): LatLngPoint[] =>
  ring.map(([lat, lng]) => ({ lat, lng }));

/**
 * The lot boundary for a point: cache, then ReportAll, then Regrid only if
 * ReportAll says there is no parcel here. Never throws — the roof measurement
 * treats a missing boundary as a narrower measurement, not as a failure.
 */
export async function lotRingForPoint(lat: number, lng: number): Promise<LotRingResult> {
  const found = await lookupParcelByPoint(lat, lng).catch(() => null);

  if (found?.ok) {
    // A multi-ring answer is one lot recorded in parts, or the sibling lots the
    // same point hit; the ring that CONTAINS the pin is the one the roof means.
    const rings = found.parcel.rings.map(toLatLng);
    const ring = rings.find((r) => pointInRing(lat, lng, r)) ?? rings[0] ?? [];
    const source: LotRingSource = found.parcel.cached ? "cache" : "reportall";
    console.log(
      `[lotRing] ${source}: ${ring.length} points for ${lat.toFixed(5)},${lng.toFixed(5)}` +
        (rings.length > 1 ? ` (${rings.length} rings on this point)` : ""),
    );
    if (ring.length >= 3) return { ring, source };
    // A parcel with no usable geometry is not an answer anybody can measure by.
    return {
      ring: [],
      source: "none",
      blocked: { kind: "error", message: "The parcel record for this point carries no usable boundary." },
    };
  }

  // Not "no parcel here" — an outage, a missing key, an exhausted allowance.
  // Regrid is not a cover for any of those: say what happened.
  if (found && found.reason !== "not-found") {
    console.warn(`[lotRing] none (${found.reason}): ${found.error ?? "parcel lookup unavailable"}`);
    return {
      ring: [],
      source: "none",
      blocked: { kind: found.reason, message: found.error ?? "Parcel lookup unavailable." },
    };
  }

  // ReportAll answered that it has nothing here. Regrid covers counties
  // ReportAll does not, so it is worth one more question — and only here.
  const regrid = await fetchParcelRing(lat, lng);
  if (regrid.ring.length >= 3) {
    console.log(`[lotRing] regrid: ${regrid.ring.length} points (ReportAll has no parcel here)`);
    return { ring: regrid.ring, source: "regrid" };
  }
  console.log(
    `[lotRing] none: ReportAll has no parcel here` +
      (regrid.blocked ? ` and Regrid ${regrid.blocked.kind} (${regrid.blocked.message})` : " and neither has Regrid"),
  );
  // Both answered "nothing here". That is not a failure to report — but a
  // Regrid auth failure IS, and it is the one that hid an expired token.
  return { ring: [], source: "none", ...(regrid.blocked ? { blocked: regrid.blocked } : {}) };
}

/**
 * A structure that belongs to somebody else: every vertex of its outline falls
 * outside the lot. The veto only ever runs in this direction — a structure that
 * straddles the line stays, because dropping a real roof is the expensive
 * mistake and keeping a neighbour's shed is a visible one.
 */
export function ringWhollyOutsideLotRing(
  lot: ReadonlyArray<LatLngPoint>,
  ring: ReadonlyArray<LatLngPoint>,
): boolean {
  if (lot.length < 3 || ring.length < 3) return false;
  return ring.every((p) => !pointInRing(p.lat, p.lng, lot as LatLngPoint[]));
}
