// ReportAll USA parcel client (reportallusa.com) — SERVER ONLY. The client key
// lives in REPORTALL_CLIENT_KEY and must never reach a browser bundle: only the
// /api/parcels route and the /api/parcel-tiles proxy import this module.
//
// QUOTA IS ALLTIME, NOT MONTHLY: 1000 parcel results and 20000 tiles for the
// life of the key. Every caller therefore goes through the ParcelCache /
// ParcelMiss tables first (see /api/parcels) — this module only speaks to the
// network. The per-response quota headers are logged to the SERVER console so
// a dev watching the terminal sees the spend; they are never forwarded to the
// client.
//
// API notes that cost real requests to learn (keep them):
//   · v=9 is mandatory.
//   · address lookup uses `address` + `region` ("County, ST" — comma + space).
//   · spatial_intersect takes WKT POINT(lon lat) — LON FIRST — with si_srid.
//   · spatial_nearest + sn_srid + rpp=1 finds the closest parcel to a miss.
//   · geometry (geom_as_wkt, EPSG:4326) is returned always; no returnGeometry.
//   · rpp=0 returns just the count without spending parcel quota.

import { ExternalCallError, externalFetch } from "@/lib/externalCall";
const BASE = "https://reportallusa.com/api/parcels";

/** The allowance the key ships with — for the log line, not a limit we enforce. */
export const QUOTA_ALLTIME = 1000;

/** Remaining parcels as of the last response, or null before the first call.
 *  In-memory only; parcelLookup.ts persists it so a cold start still knows. */
let lastQuotaRemaining: number | null = null;

export const lastSeenQuotaRemaining = (): number | null => lastQuotaRemaining;

export interface Parcel {
  robustId: string;
  parcelId: string | null;
  owner: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  acreage: number | null;
  wkt: string;
  lat: number;
  lon: number;
  // The assessor's record, read since 2026-09-16 for the HVAC estimator: the
  // house's living area, year built and storeys, the county, and the building
  // footprint polygons (`return_buildings=true`). Null where a county does not
  // publish them; the API answered them all along, the client never read them.
  bldgSqft: number | null;
  yearBuilt: number | null;
  storeys: number | null;
  buildingCount: number | null;
  countyName: string | null;
  stateAbbr: string | null;
  landUseClass: string | null;
  /** Building footprints as WKT polygons (lon lat), outer rings. */
  buildingsWkt: string[];
}

export interface RawResult {
  robust_id?: string;
  parcel_id?: string;
  owner?: string;
  address?: string;
  addr_city?: string;
  addr_zip?: string;
  acreage_calc?: string | number;
  geom_as_wkt?: string;
  latitude?: string | number;
  longitude?: string | number;
  bldg_sqft?: string | number;
  year_built?: string | number;
  story_height?: string | number;
  buildings?: string | number;
  county_name?: string;
  state_abbr?: string;
  land_use_class?: string;
  /** With return_buildings=true: the footprint polygons. The docs say "array
   *  entries" and stop there, so WKT strings, {geom_as_wkt} objects and
   *  GeoJSON geometries are all read. */
  buildings_poly?: unknown;
}

interface RawResponse {
  status?: string;
  count?: number;
  results?: RawResult[];
}

export class ReportAllError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = "ReportAllError";
  }
}

export function isReportAllEnabled(): boolean {
  return Boolean(process.env.REPORTALL_CLIENT_KEY);
}

/** Cache key for an address: upper-cased, whitespace-collapsed, trimmed of the
 *  trailing punctuation a typed address carries. Both the stored column and the
 *  query run through this, so the comparison is plain equality and behaves the
 *  same on SQLite and Postgres. */
export function addressKeyOf(address: string | null | undefined): string | null {
  if (!address) return null;
  const key = address.replace(/\s+/g, " ").replace(/[.,]+$/, "").trim().toUpperCase();
  return key || null;
}

function num(v: string | number | undefined): number | null {
  if (v === undefined || v === null || v === "") return null;
  // Assessor figures arrive as "2,140"; the comma is not a decimal point.
  const n = typeof v === "number" ? v : parseFloat(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** A GeoJSON Polygon/MultiPolygon → WKT polygons (one per outer ring). */
function geoJsonToWkt(g: unknown): string[] {
  const obj = g as { type?: string; coordinates?: unknown; geometry?: unknown } | null;
  if (!obj || typeof obj !== "object") return [];
  if (obj.geometry) return geoJsonToWkt(obj.geometry);
  const ring = (r: unknown) => (Array.isArray(r) ? (r as Array<[number, number]>).filter((c) => Array.isArray(c) && c.length >= 2).map(([x, y]) => `${x} ${y}`).join(",") : "");
  if (obj.type === "Polygon" && Array.isArray(obj.coordinates)) {
    const outer = ring((obj.coordinates as unknown[])[0]);
    return outer ? [`POLYGON((${outer}))`] : [];
  }
  if (obj.type === "MultiPolygon" && Array.isArray(obj.coordinates)) {
    return (obj.coordinates as unknown[]).map((poly) => ring((poly as unknown[])[0])).filter(Boolean).map((o) => `POLYGON((${o}))`);
  }
  return [];
}

/** Whatever shape `buildings_poly` comes in → WKT strings. */
export function buildingsWktOf(raw: unknown): string[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const out: string[] = [];
  for (const item of list) {
    if (typeof item === "string") {
      if (/^\s*(MULTI)?POLYGON/i.test(item)) out.push(item.trim());
      else { try { out.push(...geoJsonToWkt(JSON.parse(item))); } catch { /* not a geometry */ } }
    } else if (item && typeof item === "object") {
      const o = item as { geom_as_wkt?: string; wkt?: string; geometry?: unknown; type?: string };
      if (typeof o.geom_as_wkt === "string") out.push(o.geom_as_wkt);
      else if (typeof o.wkt === "string") out.push(o.wkt);
      else out.push(...geoJsonToWkt(o));
    }
  }
  return out;
}

/** The API's row → our record. Exported for scripts/qa/hvac-parcel.check.ts. */
export function parcelFromRaw(r: RawResult): Parcel | null {
  // robust_id is the cache key and wkt is the payload — a result missing either
  // is unusable and is dropped rather than half-cached.
  if (!r.robust_id || !r.geom_as_wkt) return null;
  const year = num(r.year_built);
  return {
    robustId: r.robust_id,
    parcelId: r.parcel_id ?? null,
    owner: r.owner ?? null,
    address: r.address ?? null,
    city: r.addr_city ?? null,
    zip: r.addr_zip ?? null,
    acreage: num(r.acreage_calc),
    wkt: r.geom_as_wkt,
    lat: num(r.latitude) ?? 0,
    lon: num(r.longitude) ?? 0,
    bldgSqft: (() => { const n = num(r.bldg_sqft); return n && n > 0 ? n : null; })(),
    yearBuilt: year && year > 1700 && year < 2100 ? Math.round(year) : null,
    storeys: (() => { const n = num(r.story_height); return n && n > 0 && n < 10 ? n : null; })(),
    buildingCount: (() => { const n = num(r.buildings); return n !== null && n >= 0 ? Math.round(n) : null; })(),
    countyName: r.county_name?.trim() || null,
    stateAbbr: r.state_abbr?.trim().toUpperCase() || null,
    landUseClass: r.land_use_class?.trim() || null,
    buildingsWkt: buildingsWktOf(r.buildings_poly),
  };
}

const normalize = parcelFromRaw;

/**
 * Read the spend headers off ANY ReportAll response. The header is the ONLY
 * authoritative count — a locally kept tally drifted 17 results ahead of the
 * truth before this (992 believed, 975 real). Persisted on every response, in
 * one place, so no code path can observe a header and forget to record it.
 * Fire-and-forget: bookkeeping is never worth failing a parcel lookup over,
 * and the dynamic import keeps this module usable from routes that bundle
 * without the Prisma client.
 */
function readQuotaHeaders(res: Response): void {
  const used = res.headers.get("x-reportall-api-parcels-request-quota-used");
  const left = res.headers.get("x-reportall-api-parcels-quota-remaining");
  if (!used && !left) return;
  const n = Number(left);
  if (Number.isFinite(n)) {
    lastQuotaRemaining = n;
    void import("@/lib/db")
      .then(({ db }) =>
        db.syncState.upsert({
          where: { key: "reportall:quota-remaining" },
          update: { cursor: String(n) },
          create: { key: "reportall:quota-remaining", cursor: String(n) },
        }),
      )
      .catch(() => {});
  }
  console.log(`[reportall] parcel ${used ?? "?"}/${QUOTA_ALLTIME} spent, ${left ?? "?"} remaining`);
}

async function call(params: Record<string, string>): Promise<Parcel[]> {
  const key = process.env.REPORTALL_CLIENT_KEY;
  if (!key) throw new ReportAllError("REPORTALL_CLIENT_KEY is not set", 0);
  // return_buildings: the footprint polygons ride on the same 1-quota answer.
  const qs = new URLSearchParams({ client: key, v: "9", return_buildings: "true", ...params });
  let res: Response;
  try {
    res = await externalFetch("reportall", "parcels", `${BASE}?${qs}`, {}, {
      timeoutMs: 15_000,
      // NOT the default retry set: ReportAll's 429 means an ALLTIME allowance
      // of 1,000 lookups is exhausted or throttled — an answer about the
      // account, not a hiccup — and asking again cannot un-spend it. Only 5xx
      // and unanswered attempts are retried.
      retryOn: (st) => st >= 500,
      onResponse: readQuotaHeaders,
    });
  } catch (err) {
    if (err instanceof ExternalCallError) {
      throw new ReportAllError(
        err.httpStatus === 429 ? "ReportAll rate limit / quota exhausted" : err.message,
        err.httpStatus ?? 0,
      );
    }
    throw err;
  }

  // Spend visibility — server console only, never the client response. The
  // remaining count is also kept in memory so a caller can refuse to spend the
  // last of an ALLTIME allowance before it makes the request (parcelLookup.ts).
  // Quota headers were read by the onResponse hook above — on EVERY response,
  // failures included, which the old inline read could not do once retries
  // existed: a 429's own headers carry the final count.

  if (res.status === 429) throw new ReportAllError("ReportAll rate limit / quota exhausted", 429);
  if (!res.ok) throw new ReportAllError(`ReportAll request failed (${res.status})`, res.status);
  const data = (await res.json()) as RawResponse;
  if (data.status && data.status !== "OK") {
    throw new ReportAllError(`ReportAll returned status ${data.status}`, res.status);
  }
  return (data.results ?? []).map(normalize).filter((p): p is Parcel => p !== null);
}

/**
 * EVERY parcel containing the point, in the order ReportAll returned them.
 * Lon-first inside the WKT, per the API.
 *
 * One point genuinely resolves to several parcels: a lot split by a road or a
 * creek, a condo stack, a lot overlapped by right-of-way. Taking `results[0]`
 * threw the rest away — and since the request was already paid for out of an
 * ALLTIME quota, the discarded parcels were quota the account had spent and
 * could not spend again. The caller decides which one is the subject lot.
 */
export async function fetchParcelsByPoint(lat: number, lon: number): Promise<Parcel[]> {
  return call({
    spatial_intersect: `POINT(${lon} ${lat})`,
    si_srid: "4326",
  });
}

/**
 * Every parcel intersecting a WKT POLYGON (lon-first, EPSG:4326). One request,
 * up to `rpp` parcels — used to find the lots that ADJOIN a subject parcel, so
 * a property recorded as two deeds can be shown as the two lots it is.
 *
 * The polygon is a box around the subject, so the answer includes lots across a
 * kerb; the caller filters by owner and by whether the geometry actually
 * touches. Quota: every parcel returned is spent, which is why `rpp` is capped
 * here and why the caller only ever sweeps a given lot once.
 */
export async function fetchParcelsByPolygon(wkt: string, rpp = 12): Promise<Parcel[]> {
  return call({
    spatial_intersect: wkt,
    si_srid: "4326",
    rpp: String(rpp),
  });
}

/** Parcel by street address within a region ("King County, WA" — comma + space). */
export async function fetchParcelByAddress(address: string, region: string): Promise<Parcel | null> {
  const results = await call({ address, region });
  return results[0] ?? null;
}

/** Closest parcel to a point that hit nothing (rpp=1 keeps the spend at one). */
export async function fetchNearest(lat: number, lon: number): Promise<Parcel | null> {
  const results = await call({
    spatial_nearest: `POINT(${lon} ${lat})`,
    sn_srid: "4326",
    rpp: "1",
  });
  return results[0] ?? null;
}
