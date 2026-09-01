// Cached parcel lookup — the ONE place a ReportAll point query is spent.
//
// WHY THIS FILE EXISTS
// The ReportAll quota is ALLTIME, not monthly: the account gets a fixed number
// of parcel requests and that is the lot. So every caller has to go cache-first,
// and there must be exactly one cache policy — two callers with two policies is
// two chances to burn quota on a lookup that was already paid for.
//
// Until now that policy lived inside app/api/parcels/route.ts and was reachable
// only over HTTP. The fence estimator's boundary loader runs on the server, so
// calling that route would have meant a server process making an HTTP request
// to itself, carrying a session cookie it already has, to run code it could
// call directly. The policy moved here instead; the route now calls this, and
// so does actions/fenceBoundary.ts.
//
// THE POLICY, in order — each step exists to avoid the next one's cost:
//   1. ParcelCache, by bounding box then a real point-in-ring test. A hit
//      costs nothing and is why re-opening the same lot is free forever.
//   2. ParcelMiss, a negative cache with a TTL. Somewhere genuinely uncovered
//      (unmapped county, a pin in water) would otherwise be re-queried on every
//      visit, and a miss costs exactly as much quota as a hit.
//   3. ReportAll. Only now, and the result is written back to the cache.
//
// Server-only: it reads the key through @/lib/reportall and touches Prisma.

import { db } from "@/lib/db";
import {
  addressKeyOf,
  fetchNearest,
  fetchParcelsByPoint,
  fetchParcelsByPolygon,
  isReportAllEnabled,
  type Parcel,
} from "@/lib/reportall";
import { haversineFt, parseWkt, type RingPoint } from "@/lib/parcels";

/** Half-width of the cache pre-filter box. ~0.01° ≈ 1.1km at this latitude —
 *  wide enough to catch any parcel containing the point, narrow enough that the
 *  candidate set stays small. The real test is point-in-ring below. */
const CACHE_BOX_DEG = 0.01;

/** How long a "nothing here" answer is trusted. Coverage does change, but not
 *  on a timescale where re-spending quota inside a fortnight is reasonable. */
const MISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** Negative-cache key. FIVE decimals (~1.1m), matching the rows app/api/parcels
 *  already wrote — a coarser key would orphan every existing ParcelMiss and
 *  re-spend quota once per location to learn what the table already knew. */
function missKey(lat: number, lon: number): string {
  return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}

/** Ray-casting point-in-polygon. `RingPoint` is the tuple [lat, lng] that
 *  parseWkt emits — indexed, not destructured, to keep that explicit. */
function pointInRing(lat: number, lon: number, ring: RingPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [aLat, aLon] = ring[i];
    const [bLat, bLon] = ring[j];
    const straddles = aLat > lat !== bLat > lat;
    if (!straddles) continue;
    const x = ((bLon - aLon) * (lat - aLat)) / (bLat - aLat) + aLon;
    if (lon < x) inside = !inside;
  }
  return inside;
}

/** One parcel the point landed in, geometry included. A point that hits several
 *  (a lot split by a road, a condo stack, a lot overlapped by right-of-way)
 *  returns one of these per parcel so the caller can offer a choice instead of
 *  guessing which one the contractor meant. */
export type ParcelChoice = {
  robustId: string;
  parcelId: string | null;
  owner: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  acreage: number | null;
  lat: number;
  lon: number;
  rings: RingPoint[][];
};

export type ParcelHit = {
  /**
   * Outer rings, lat-first; holes are not returned. The SUBJECT parcel's rings
   * come first, followed by those of any sibling parcel the same point hit (a
   * lot split by a road, a condo stack). Consumers that want one boundary can
   * keep reading rings[0]/the ring that contains their origin and are unchanged
   * by the extras; consumers that want the whole lot now have it.
   */
  rings: RingPoint[][];
  robustId: string;
  parcelId: string | null;
  owner: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  acreage: number | null;
  lat: number;
  lon: number;
  /** Every parcel the point landed in, SUBJECT FIRST. Length 1 is the ordinary
   *  case; more than that is what the picker exists for. */
  all: ParcelChoice[];
  /** True when this cost no quota. */
  cached: boolean;
};

/** The choice-shaped view of a parcel, so the cache path and the network path
 *  build the same thing. */
function choiceOf(
  p: {
    robustId: string;
    parcelId: string | null;
    owner: string | null;
    address: string | null;
    city: string | null;
    zip: string | null;
    acreage: number | null;
    lat: number;
    lon: number;
  },
  rings: RingPoint[][],
): ParcelChoice {
  return {
    robustId: p.robustId,
    parcelId: p.parcelId,
    owner: p.owner,
    address: p.address,
    city: p.city,
    zip: p.zip,
    acreage: p.acreage,
    lat: p.lat,
    lon: p.lon,
    rings,
  };
}

/** The closest parcel to a point that hit nothing — a "did you mean here?"
 *  hint, not an answer. Only fetched when the caller asks, because it costs a
 *  second request out of the same ALLTIME quota. */
export type NearestHint = { address: string | null; city: string | null; lat: number; lon: number };

export type ParcelLookup =
  | { ok: true; parcel: ParcelHit }
  | {
      ok: false;
      reason: "disabled" | "not-found" | "error";
      error?: string;
      nearest?: NearestHint | null;
    };

/** Write a fetched parcel into the cache. Existing rows are left alone: the
 *  geometry does not change, and an update would only churn the row. */
export async function saveParcel(p: Parcel): Promise<void> {
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
}

// ── Sibling lots ───────────────────────────────────────────────────────────
// A point query answers "which lot is this pin in", and that is one lot. A house
// bought as TWO adjoining deeds is two lots, and fencing it means fencing both —
// so after the subject is known, the parcels that TOUCH it and carry the SAME
// OWNER are pulled in as well.
//
// Cost discipline is the same as everywhere else in this file: the cache is
// asked first, the sweep spends ONE request capped at SIBLING_SWEEP_RPP parcels,
// every parcel it returns is written to the cache (so the spend keeps paying),
// and the sweep is recorded in ParcelMiss under a `sib:` key so a lot is never
// swept twice.

/** Box half-width for the CACHE side of the sibling search (~1.1 km, the same
 *  pre-filter the point lookup uses). Parcel rows are keyed by their CENTROID,
 *  and a large neighbouring lot's centroid sits far outside the subject's own
 *  footprint even when the two share a fence line — a tighter box silently
 *  dropped an adjoining lot whose rings met at 0 ft. The box only narrows the
 *  candidate set; `ringsTouch` is what decides. */
const SIBLING_CACHE_BOX_DEG = 0.01;
/** How far outside the subject's bounding box the SWEEP polygon reaches (~11 m):
 *  far enough to catch a lot across a shared boundary, near enough that the
 *  answer stays a handful of parcels. */
const SIBLING_SWEEP_PAD_DEG = 0.0001;
/** Parcels one sweep may return. Every one is quota, and every one is cached. */
const SIBLING_SWEEP_RPP = 8;
/** Two rings this close at any vertex are treated as sharing a boundary. */
const SIBLING_TOUCH_FT = 30;
/** How long a completed sweep stands. Deed lines do not move. */
const SWEEP_TTL_MS = 180 * 24 * 60 * 60 * 1000;

/** What both the cache row and a freshly fetched `Parcel` structurally are —
 *  the fields the sibling filter reads. */
type ParcelLike = {
  robustId: string;
  parcelId: string | null;
  owner: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  acreage: number | null;
  lat: number;
  lon: number;
  wkt: string;
};

/** Owner names compared as records, not as strings: case, punctuation and
 *  double spaces differ between two deeds of the same household. */
function ownerKey(owner: string | null | undefined): string | null {
  if (!owner) return null;
  const key = owner.replace(/[^A-Za-z0-9]+/g, " ").trim().toUpperCase();
  return key || null;
}

function bboxOf(rings: RingPoint[][]): { minLat: number; maxLat: number; minLon: number; maxLon: number } | null {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const ring of rings) {
    for (const [la, lo] of ring) {
      if (la < minLat) minLat = la;
      if (la > maxLat) maxLat = la;
      if (lo < minLon) minLon = lo;
      if (lo > maxLon) maxLon = lo;
    }
  }
  return Number.isFinite(minLat) ? { minLat, maxLat, minLon, maxLon } : null;
}

/** Do two parcels share a boundary? Vertex proximity rather than real polygon
 *  adjacency: cadastral neighbours are digitised from the same survey corners,
 *  so their rings meet at shared vertices, and 30 ft absorbs the rounding. */
function ringsTouch(a: RingPoint[][], b: RingPoint[][]): boolean {
  for (const ra of a) {
    for (const pa of ra) {
      for (const rb of b) {
        for (const pb of rb) {
          if (haversineFt(pa, pb) <= SIBLING_TOUCH_FT) return true;
        }
      }
    }
  }
  return false;
}

/** The subject's bounding box, padded, as lon-first WKT for spatial_intersect. */
function sweepPolygon(rings: RingPoint[][]): string | null {
  const b = bboxOf(rings);
  if (!b) return null;
  const p = SIBLING_SWEEP_PAD_DEG;
  const x0 = (b.minLon - p).toFixed(6), x1 = (b.maxLon + p).toFixed(6);
  const y0 = (b.minLat - p).toFixed(6), y1 = (b.maxLat + p).toFixed(6);
  return `POLYGON((${x0} ${y0},${x1} ${y0},${x1} ${y1},${x0} ${y1},${x0} ${y0}))`;
}

/**
 * The OTHER lots of the same property: parcels that touch `subject` and are
 * recorded to the same owner. `exclude` are parcels the caller already has (the
 * ones the point itself hit), so they are never returned twice.
 *
 * Never throws — a property is still fencible when its second deed cannot be
 * found, and the caller should get the subject either way.
 */
export async function lookupSiblingParcels(
  subject: ParcelChoice,
  exclude: string[] = [],
): Promise<ParcelChoice[]> {
  const owner = ownerKey(subject.owner);
  // Without an owner name there is nothing that says two touching lots are one
  // property, and "every neighbour" is not what was asked for.
  if (!owner || !subject.rings.length) return [];
  const skip = new Set([subject.robustId, ...exclude]);

  const fromRows = (rows: ParcelLike[]) => {
    const out: ParcelChoice[] = [];
    for (const row of rows) {
      if (skip.has(row.robustId)) continue;
      if (ownerKey(row.owner) !== owner) continue;
      const rings = parseWkt(row.wkt);
      if (!rings.length || !ringsTouch(subject.rings, rings)) continue;
      out.push(choiceOf(row, rings));
    }
    return out;
  };

  // 1 — cache
  try {
    const rows = await db.parcelCache.findMany({
      where: {
        lat: { gte: subject.lat - SIBLING_CACHE_BOX_DEG, lte: subject.lat + SIBLING_CACHE_BOX_DEG },
        lon: { gte: subject.lon - SIBLING_CACHE_BOX_DEG, lte: subject.lon + SIBLING_CACHE_BOX_DEG },
      },
      take: 80,
    });
    const hits = fromRows(rows);
    if (hits.length) return hits;
  } catch (err) {
    console.warn("[parcelLookup] sibling cache read failed:", err);
  }

  // 2 — has this lot already been swept? A sweep that found nothing is an
  //     answer, and re-buying it every visit is exactly the spend this file exists
  //     to avoid.
  const key = `sib:${subject.robustId}`;
  const swept = await db.parcelMiss.findUnique({ where: { key } }).catch(() => null);
  if (swept && Date.now() - swept.checkedAt.getTime() < SWEEP_TTL_MS) return [];

  // 3 — spend, once.
  const wkt = sweepPolygon(subject.rings);
  if (!wkt || !isReportAllEnabled()) return [];
  try {
    const found = await fetchParcelsByPolygon(wkt, SIBLING_SWEEP_RPP);
    for (const p of found) {
      await saveParcel(p).catch((err) => console.warn("[parcelLookup] sibling cache write failed:", err));
    }
    await db.parcelMiss
      .upsert({ where: { key }, update: { checkedAt: new Date() }, create: { key } })
      .catch(() => {});
    return fromRows(found);
  } catch (err) {
    // No sweep marker on a failure: an outage is not evidence about the deeds.
    console.warn("[parcelLookup] sibling sweep failed:", err);
    return [];
  }
}

/**
 * The parcel containing a point, cache-first.
 *
 * Never throws: a ReportAll outage returns `{ ok: false, reason: "error" }` so
 * the caller can degrade rather than fail. That matters for the fence studio,
 * where the parcel is one of three independent things being loaded and the
 * other two should still arrive.
 */
export async function lookupParcelByPoint(
  lat: number,
  lon: number,
  opts: { withNearest?: boolean } = {},
): Promise<ParcelLookup> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, reason: "error", error: "lat/lon must be numbers" };
  }
  if (!isReportAllEnabled()) {
    return {
      ok: false,
      reason: "disabled",
      error: "Set REPORTALL_CLIENT_KEY in .env.local to load property lines.",
    };
  }

  // 1 — cache
  try {
    const candidates = await db.parcelCache.findMany({
      where: {
        lat: { gte: lat - CACHE_BOX_DEG, lte: lat + CACHE_BOX_DEG },
        lon: { gte: lon - CACHE_BOX_DEG, lte: lon + CACHE_BOX_DEG },
      },
      take: 50,
    });
    // EVERY cached parcel containing the point, not the first one found: the
    // network path returns all of them, and a cached answer that quietly
    // returned fewer would make the picker appear on the first visit to an
    // address and vanish on the second.
    const hits: ParcelChoice[] = [];
    for (const row of candidates) {
      const rings = parseWkt(row.wkt);
      if (rings.some((ring) => pointInRing(lat, lon, ring))) hits.push(choiceOf(row, rings));
    }
    if (hits.length) {
      const subject = hits[0];
      return {
        ok: true,
        parcel: {
          ...subject,
          rings: hits.flatMap((h) => h.rings),
          all: hits,
          cached: true,
        },
      };
    }
  } catch (err) {
    // A cache read failing is not a reason to skip the lookup, but it IS a
    // reason to say so: silently falling through would spend quota on every
    // request for as long as the table is unreadable.
    console.warn("[parcelLookup] cache read failed:", err);
  }

  // 2 — negative cache
  const key = missKey(lat, lon);
  const miss = await db.parcelMiss.findUnique({ where: { key } }).catch(() => null);
  if (miss && Date.now() - miss.checkedAt.getTime() < MISS_TTL_MS) {
    return { ok: false, reason: "not-found" };
  }

  // 3 — spend
  try {
    // One request, every parcel it returned. The subject is the first whose
    // geometry actually contains the point (ReportAll's own order is not a
    // ranking); the others ride along as extra rings and are all cached, so a
    // pin dropped on the sibling half of a split lot is free from here on.
    const found = await fetchParcelsByPoint(lat, lon);
    const ringsOf = new Map<Parcel, RingPoint[][]>();
    for (const p of found) ringsOf.set(p, parseWkt(p.wkt));
    const parcel =
      found.find((p) => (ringsOf.get(p) ?? []).some((ring) => pointInRing(lat, lon, ring))) ??
      found[0] ??
      null;
    if (parcel) {
      for (const p of found) {
        await saveParcel(p).catch((err) =>
          console.warn("[parcelLookup] cache write failed:", err),
        );
      }
      if (miss) await db.parcelMiss.delete({ where: { key } }).catch(() => {});
      // Subject first, then the siblings in the order the provider gave them.
      const all = [parcel, ...found.filter((p) => p !== parcel)].map((p) =>
        choiceOf(p, ringsOf.get(p) ?? []),
      );
      return {
        ok: true,
        parcel: {
          ...choiceOf(parcel, ringsOf.get(parcel) ?? []),
          rings: all.flatMap((c) => c.rings),
          all,
          cached: false,
        },
      };
    }
    await db.parcelMiss
      .upsert({ where: { key }, update: { checkedAt: new Date() }, create: { key } })
      .catch(() => {});
    if (!opts.withNearest) return { ok: false, reason: "not-found" };
    // A second request, and the caller asked for it. Cached too — a nearest
    // hit is a real parcel and the next pin dropped near it should be free.
    const nearest = await fetchNearest(lat, lon).catch(() => null);
    if (nearest) await saveParcel(nearest).catch(() => {});
    return {
      ok: false,
      reason: "not-found",
      nearest: nearest
        ? { address: nearest.address, city: nearest.city, lat: nearest.lat, lon: nearest.lon }
        : null,
    };
  } catch (err) {
    // Deliberately NOT written to ParcelMiss: an outage is not evidence that
    // the point is uncovered, and caching it as one would hide the parcel for
    // a fortnight after the service came back.
    return {
      ok: false,
      reason: "error",
      error: err instanceof Error ? err.message : "Parcel lookup failed.",
    };
  }
}
