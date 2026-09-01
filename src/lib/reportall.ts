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

const BASE = "https://reportallusa.com/api/parcels";

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
}

interface RawResult {
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
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function normalize(r: RawResult): Parcel | null {
  // robust_id is the cache key and wkt is the payload — a result missing either
  // is unusable and is dropped rather than half-cached.
  if (!r.robust_id || !r.geom_as_wkt) return null;
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
  };
}

async function call(params: Record<string, string>): Promise<Parcel[]> {
  const key = process.env.REPORTALL_CLIENT_KEY;
  if (!key) throw new ReportAllError("REPORTALL_CLIENT_KEY is not set", 0);
  const qs = new URLSearchParams({ client: key, v: "9", ...params });
  const res = await fetch(`${BASE}?${qs}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });

  // Spend visibility — server console only, never the client response.
  const used = res.headers.get("x-reportall-api-parcels-request-quota-used");
  const left = res.headers.get("x-reportall-api-parcels-quota-remaining");
  if (used || left) {
    console.log(`[reportall] quota used=${used ?? "?"} remaining=${left ?? "?"}`);
  }

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
