// Surveyed parcel boundaries from Regrid (regrid.com/api).
//
// Extracted from src/actions/fenceBoundary.ts, which had these as private
// helpers because a "use server" file may only export async functions. The roof
// reconstruction needs the same parcel ring — to decide which of the several
// building footprints in a Solar tile actually belong to THIS property — and so
// does scripts/roof-recon-eval.ts, which runs outside any request and therefore
// cannot call an auth-gated server action. One implementation, three callers.
//
// No auth and no session here on purpose: callers that face a user must do their
// own `requireEstimatorOrManager()` first (fenceBoundary.ts still does).

export interface LatLngPoint {
  lat: number;
  lng: number;
}

// Minimal, defensive GeoJSON shapes — Regrid wraps the FeatureCollection under
// `parcels` on the v2 API, but we also accept a bare FeatureCollection.
export interface RegridGeometry {
  type?: string;
  coordinates?: unknown;
}
export interface RegridFeature {
  geometry?: RegridGeometry;
  properties?: Record<string, unknown>;
}
export interface RegridResponse {
  parcels?: { features?: RegridFeature[] };
  features?: RegridFeature[];
  buildings?: { features?: RegridFeature[] };
}

import { ExternalCallError, externalFetch } from "@/lib/externalCall";
export function isRegridEnabled(): boolean {
  return Boolean(process.env.REGRID_API_KEY);
}

function asPair(c: unknown): [number, number] | null {
  return Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number"
    ? [c[0], c[1]]
    : null;
}

// A GeoJSON ring is [[lng,lat], ...] → our {lat,lng}[].
export function ringToLatLng(ring: unknown): LatLngPoint[] {
  if (!Array.isArray(ring)) return [];
  const out: LatLngPoint[] = [];
  for (const c of ring) {
    const p = asPair(c);
    if (p) out.push({ lng: p[0], lat: p[1] });
  }
  return out;
}

// Outer ring of a Polygon, or the largest polygon's outer ring of a MultiPolygon.
export function outerRing(geom: RegridGeometry | undefined): LatLngPoint[] {
  if (!geom || !Array.isArray(geom.coordinates)) return [];
  if (geom.type === "Polygon") {
    return ringToLatLng(geom.coordinates[0]);
  }
  if (geom.type === "MultiPolygon") {
    let best: LatLngPoint[] = [];
    for (const poly of geom.coordinates) {
      if (Array.isArray(poly)) {
        const ring = ringToLatLng(poly[0]);
        if (ring.length > best.length) best = ring;
      }
    }
    return best;
  }
  return [];
}

// Ray-casting point-in-polygon (ring in {lat,lng}).
export function pointInRing(lat: number, lng: number, ring: LatLngPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng;
    const yi = ring[i].lat;
    const xj = ring[j].lng;
    const yj = ring[j].lat;
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function extractRing(data: RegridResponse, lat: number, lng: number): LatLngPoint[] {
  const features = data.parcels?.features ?? data.features ?? [];
  const rings = features.map((f) => outerRing(f?.geometry)).filter((r) => r.length >= 3);
  if (rings.length === 0) return [];
  // The point endpoint can return neighbouring parcels within its default radius,
  // so prefer the parcel that actually CONTAINS the queried point.
  return rings.find((r) => pointInRing(lat, lng, r)) ?? rings[0];
}

// The raw Regrid v2 point response (v1 is gone → 404). Requires lat + lon (NOT
// lng). Results are limited to the area your Regrid plan covers — out-of-coverage
// points return 200 with empty features.
// `status` is carried out so callers can tell an auth failure from no coverage.
// That distinction matters more than usual here: Regrid issues 30-day JWTs, so a
// working integration goes 401 on a schedule and the message needs to say so
// rather than blaming coverage.
export async function fetchRegridPoint(
  lat: number,
  lng: number,
): Promise<{ data: RegridResponse | null; status: number }> {
  if (!isRegridEnabled()) return { data: null, status: 0 };
  const url = `https://app.regrid.com/api/v2/parcels/point.json?lat=${lat}&lon=${lng}&token=${encodeURIComponent(
    process.env.REGRID_API_KEY as string,
  )}`;
  try {
    const res = await externalFetch("regrid", "parcel point", url, {}, { timeoutMs: REGRID_TIMEOUT_MS });
    return { data: (await res.json()) as RegridResponse, status: res.status };
  } catch (err) {
    // The {data, status} contract predates the wrapper and fenceBoundary reads
    // the status, so an HTTP failure stays a status here; only the unanswered
    // case propagates as a throw, exactly as the bare fetch used to.
    if (err instanceof ExternalCallError && err.httpStatus != null) return { data: null, status: err.httpStatus };
    throw err;
  }
}

/**
 * How long a Regrid point lookup may take. The same ceiling reportall.ts uses
 * for the same shape of call — one JSON lookup for the parcel under a point.
 * There was none at all before 2026-08-28, on a call the roof measurement makes.
 */
const REGRID_TIMEOUT_MS = 15_000;

/** Why no ring came back, when the reason is not "this point has no parcel". */
export type ParcelFailureKind =
  /** REGRID_API_KEY is not set. */
  | "disabled"
  /** Regrid answered, and the answer is that it has nothing here. */
  | "no-coverage"
  /** 401/403 — Regrid issues 30-day JWTs, so a working integration expires on a schedule. */
  | "auth"
  /** The request hung or the connection broke. */
  | "timeout"
  | "error";

export interface ParcelRingLookup {
  /** The outer ring, or empty. Empty is NOT by itself a failure — see `blocked`. */
  ring: LatLngPoint[];
  /**
   * Set when the ring is empty for a reason the caller must surface, as opposed
   * to the point genuinely having no parcel.
   *
   * This distinction is the whole point of the type. The old signature returned
   * a bare array and swallowed everything into it: an expired JWT, a dead
   * network and a rural point with no parcel on file were the same `[]`. The
   * lot boundary decides which mask blobs belong to the property, so losing it
   * silently drops a detached garage from the measurement — 629 of 2240 sq ft
   * on 17028 NE 100th St, and it looked like a smaller house rather than a
   * failed lookup.
   */
  blocked?: { kind: ParcelFailureKind; message: string };
}

/** The parcel ring for a point, with the reason when there is none. Never throws. */
export async function fetchParcelRing(lat: number, lng: number): Promise<ParcelRingLookup> {
  if (!isRegridEnabled()) {
    return { ring: [], blocked: { kind: "disabled", message: "parcel lookup is not configured (REGRID_API_KEY)" } };
  }
  try {
    const { data, status } = await fetchRegridPoint(lat, lng);
    if (!data) {
      const kind: ParcelFailureKind = status === 401 || status === 403 ? "auth" : "error";
      return {
        ring: [],
        blocked: {
          kind,
          message:
            kind === "auth"
              ? `Regrid rejected our credentials (${status}) — its tokens are 30-day JWTs and this one needs renewing`
              : `Regrid parcel lookup failed (${status})`,
        },
      };
    }
    const ring = extractRing(data, lat, lng);
    // A 200 with no ring is Regrid saying it has nothing here. That is an
    // ANSWER, and it is deliberately not `blocked`.
    return { ring };
  } catch (err) {
    const unanswered = err instanceof ExternalCallError && err.kind === "unreachable";
    return {
      ring: [],
      blocked: {
        kind: unanswered ? "timeout" : "error",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
