// Parcel ring for a point — SERVER ONLY, cache first, and it refuses to spend
// the last of the allowance.
//
// The ReportAll parcel quota is ALLTIME: 1000 results for the life of the key,
// not 1000 a month. Anything that reaches for a parcel is therefore spending a
// finite, shared, unrenewable resource, and the failure mode nobody notices is
// the one this module exists to prevent: the allowance quietly runs out, the
// lookup starts failing, and a caller that treats "no parcel" as "one building"
// under-measures every multi-structure lot from then on without saying so.
//
// Measured on 17028 NE 100th St, Redmond: with the ring, two structures,
// 1611 + 629 sq ft. Without it, one, 1611 sq ft — a 28 % undercount, silent.
//
// So the contract is: never fail open. A caller gets either a ring, or an
// explicit `blocked` with a reason it is expected to carry into its own output
// where a human can see it. `null` with no reason is only ever "this point
// genuinely has no parcel".
//
// The lookup order mirrors /api/parcels (which predates this module and can
// adopt it): cached ring containing the point → fresh negative cache → network.
import { db } from "@/lib/db";
import { parseWkt, type RingPoint } from "@/lib/parcels";
import {
  addressKeyOf,
  fetchParcelByPoint,
  isReportAllEnabled,
  lastSeenQuotaRemaining,
  QUOTA_ALLTIME,
  ReportAllError,
  type Parcel,
} from "@/lib/reportall";

/**
 * Stop spending with this much of the ALLTIME allowance left. The reserve is
 * for the fence estimator, which is interactive and user-facing: a roof
 * measurement degrading to one structure with a visible flag is recoverable,
 * a fence draw with no parcel is not.
 */
export const QUOTA_FLOOR = 100;

/** Where the remaining count survives a cold start (SyncState is key→string). */
const QUOTA_KEY = "reportall:quota-remaining";
/** Candidate box for the cache lookup — ~0.01° is comfortably over a lot. */
const CACHE_BOX_DEG = 0.01;
/** How long a "no parcel here" answer stands before it is re-checked. */
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const missKey = (lat: number, lon: number): string => `${lat.toFixed(5)},${lon.toFixed(5)}`;

function pointInRing(lat: number, lon: number, ring: RingPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ai, aj] = [ring[i], ring[j]];
    if (ai[0] > lat !== aj[0] > lat && lon < ((aj[1] - ai[1]) * (lat - ai[0])) / (aj[0] - ai[0]) + ai[1]) {
      inside = !inside;
    }
  }
  return inside;
}

/** Last known remaining, preferring the live value over the persisted one. */
export async function remainingQuota(): Promise<number | null> {
  const live = lastSeenQuotaRemaining();
  if (live != null) return live;
  try {
    const row = await db.syncState.findUnique({ where: { key: QUOTA_KEY } });
    const n = Number(row?.cursor);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function persistQuota(): Promise<void> {
  const n = lastSeenQuotaRemaining();
  if (n == null) return;
  try {
    await db.syncState.upsert({
      where: { key: QUOTA_KEY },
      update: { cursor: String(n) },
      create: { key: QUOTA_KEY, cursor: String(n) },
    });
  } catch {
    /* the count is an optimisation; losing it costs one extra request */
  }
}

async function cacheParcel(p: Parcel): Promise<void> {
  try {
    await db.parcelCache.upsert({
      where: { robustId: p.robustId },
      update: {},
      create: {
        robustId: p.robustId,
        parcelId: p.parcelId,
        owner: p.owner,
        address: p.address,
        addressKey: addressKeyOf(p.address),
        city: p.city,
        zip: p.zip,
        acreage: p.acreage,
        wkt: p.wkt,
        lat: p.lat,
        lon: p.lon,
      },
    });
  } catch {
    /* caching is best-effort; a failed write costs one repeat request */
  }
}

export interface ParcelRingResult {
  /** Outer ring as [lat, lng] pairs, or null when there is none to give. */
  ring: RingPoint[] | null;
  source: "cache" | "network" | "none";
  /**
   * Set when a ring was NOT fetched for a reason the caller must surface —
   * quota exhausted, ReportAll unconfigured, or the request failed. Distinct
   * from `ring: null, source: "none"`, which means the point really has no
   * parcel. Never let this reach a user as silence.
   */
  blocked?: string;
  /** Remaining allowance as last seen, for the caller's own logging. */
  remaining: number | null;
}

/**
 * The parcel ring containing a point. Free on a cache hit or a fresh miss;
 * otherwise one ReportAll result, and only while the allowance is above
 * QUOTA_FLOOR.
 */
export async function parcelRingForPoint(lat: number, lon: number): Promise<ParcelRingResult> {
  // a. cache — any stored parcel whose outer ring contains the point
  try {
    const candidates = await db.parcelCache.findMany({
      where: {
        lat: { gte: lat - CACHE_BOX_DEG, lte: lat + CACHE_BOX_DEG },
        lon: { gte: lon - CACHE_BOX_DEG, lte: lon + CACHE_BOX_DEG },
      },
      take: 50,
    });
    for (const row of candidates) {
      const rings = parseWkt(row.wkt);
      const outer = rings[0];
      if (outer && rings.some((r) => pointInRing(lat, lon, r))) {
        return { ring: outer, source: "cache", remaining: await remainingQuota() };
      }
    }
  } catch {
    /* fall through to the network path */
  }

  const remaining = await remainingQuota();

  if (!isReportAllEnabled()) {
    return { ring: null, source: "none", blocked: "parcel lookup is not configured (REPORTALL_CLIENT_KEY)", remaining };
  }

  // b. fresh negative cache — a point already known to have no parcel
  try {
    const miss = await db.parcelMiss.findUnique({ where: { key: missKey(lat, lon) } });
    if (miss && Date.now() - miss.checkedAt.getTime() < MISS_TTL_MS) {
      return { ring: null, source: "none", remaining };
    }
  } catch {
    /* fall through */
  }

  // c. the quota gate, BEFORE the request
  if (remaining != null && remaining < QUOTA_FLOOR) {
    return {
      ring: null,
      source: "none",
      blocked: `parcel allowance is down to ${remaining} of ${QUOTA_ALLTIME} (floor ${QUOTA_FLOOR}) — not spending it here`,
      remaining,
    };
  }

  // d. network
  try {
    const parcel = await fetchParcelByPoint(lat, lon);
    await persistQuota();
    const left = await remainingQuota();
    if (!parcel) {
      await db.parcelMiss
        .upsert({ where: { key: missKey(lat, lon) }, update: { checkedAt: new Date() }, create: { key: missKey(lat, lon) } })
        .catch(() => {});
      return { ring: null, source: "none", remaining: left };
    }
    await cacheParcel(parcel);
    const outer = parseWkt(parcel.wkt)[0] ?? null;
    return { ring: outer, source: "network", remaining: left };
  } catch (err) {
    await persistQuota();
    const msg =
      err instanceof ReportAllError && err.httpStatus === 429
        ? "parcel allowance exhausted or rate-limited"
        : `parcel lookup failed (${err instanceof Error ? err.message : String(err)})`;
    return { ring: null, source: "none", blocked: msg, remaining: await remainingQuota() };
  }
}
