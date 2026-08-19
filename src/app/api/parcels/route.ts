// GET /api/parcels?lat=..&lon=..   or   /api/parcels?address=..&region=..
//
// Cadastral parcel lookup for the fence estimator, backed by ReportAll USA.
// The ReportAll quota is ALLTIME (1000 parcels for the life of the key), so
// this route is a cache first and a client second:
//
//   a. ParcelCache — a point that lands inside a cached parcel's ring, or an
//      address already fetched, returns instantly with cached: true.
//   b. ParcelMiss — a point that recently (7 days) returned zero parcels is a
//      404 with no external request.
//   c. Only then ReportAll. Hits are cached forever (robust_id key); a zero-
//      count point is recorded as a miss and answered with the NEAREST parcel
//      (rpp=1) so the UI can offer it — the nearest is cached too.
//
// Session-gated: the quota is a real shared resource and this route spends it.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  addressKeyOf,
  fetchNearest,
  fetchParcelByAddress,
  fetchParcelByPoint,
  isReportAllEnabled,
  ReportAllError,
  type Parcel,
} from "@/lib/reportall";
import { parseWkt, type RingPoint } from "@/lib/parcels";

export const runtime = "nodejs";

const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Cache candidate box around the point, degrees (~500 m) — candidates are
 *  then tested point-in-ring, so the box only bounds the SQL scan. */
const CACHE_BOX_DEG = 0.005;

function missKey(lat: number, lon: number): string {
  return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}

function pointInRing(lat: number, lon: number, ring: RingPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    const hit = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

interface CachedParcelRow {
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

function payload(row: CachedParcelRow, cached: boolean) {
  return {
    found: true as const,
    cached,
    parcel: {
      robustId: row.robustId,
      parcelId: row.parcelId,
      owner: row.owner,
      address: row.address,
      city: row.city,
      zip: row.zip,
      acreage: row.acreage,
      lat: row.lat,
      lon: row.lon,
    },
    rings: parseWkt(row.wkt),
  };
}

async function saveParcel(p: Parcel): Promise<void> {
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

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isReportAllEnabled()) {
    return NextResponse.json({ error: "REPORTALL_CLIENT_KEY is not configured" }, { status: 503 });
  }

  const url = new URL(req.url);
  const latStr = url.searchParams.get("lat");
  const lonStr = url.searchParams.get("lon");
  const address = url.searchParams.get("address")?.trim();
  const region = url.searchParams.get("region")?.trim();

  const byPoint = latStr !== null && lonStr !== null;
  if (!byPoint && !(address && region)) {
    return NextResponse.json(
      { error: "Pass lat+lon, or address+region" },
      { status: 400 },
    );
  }

  try {
    if (byPoint) {
      const lat = parseFloat(latStr as string);
      const lon = parseFloat(lonStr as string);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return NextResponse.json({ error: "lat/lon must be numbers" }, { status: 400 });
      }

      // a. Cache: any stored parcel whose OUTER RING contains the point.
      const candidates = await db.parcelCache.findMany({
        where: {
          lat: { gte: lat - CACHE_BOX_DEG, lte: lat + CACHE_BOX_DEG },
          lon: { gte: lon - CACHE_BOX_DEG, lte: lon + CACHE_BOX_DEG },
        },
        take: 50,
      });
      for (const row of candidates) {
        if (parseWkt(row.wkt).some((ring) => pointInRing(lat, lon, ring))) {
          return NextResponse.json(payload(row, true));
        }
      }

      // b. Fresh negative cache → no external request.
      const key = missKey(lat, lon);
      const miss = await db.parcelMiss.findUnique({ where: { key } });
      if (miss && Date.now() - miss.checkedAt.getTime() < MISS_TTL_MS) {
        return NextResponse.json({ found: false, cached: true }, { status: 404 });
      }

      // c. ReportAll.
      const parcel = await fetchParcelByPoint(lat, lon);
      if (parcel) {
        await saveParcel(parcel);
        if (miss) await db.parcelMiss.delete({ where: { key } }).catch(() => {});
        return NextResponse.json(payload(parcel, false));
      }

      await db.parcelMiss.upsert({
        where: { key },
        update: { checkedAt: new Date() },
        create: { key },
      });
      const nearest = await fetchNearest(lat, lon).catch(() => null);
      if (nearest) await saveParcel(nearest);
      return NextResponse.json(
        {
          found: false,
          nearest: nearest
            ? { address: nearest.address, city: nearest.city, lat: nearest.lat, lon: nearest.lon }
            : null,
        },
        { status: 404 },
      );
    }

    // ── address + region ──
    // a. Cache by the normalised address key — equality, so SQLite and Postgres
    //    agree (see the column's note in schema.prisma).
    const cachedByAddr = await db.parcelCache.findFirst({
      where: { addressKey: addressKeyOf(address) },
    });
    if (cachedByAddr) return NextResponse.json(payload(cachedByAddr, true));

    const parcel = await fetchParcelByAddress(address as string, region as string);
    if (parcel) {
      await saveParcel(parcel);
      return NextResponse.json(payload(parcel, false));
    }
    return NextResponse.json({ found: false, nearest: null }, { status: 404 });
  } catch (err) {
    if (err instanceof ReportAllError && err.httpStatus === 429) {
      return NextResponse.json(
        { error: "ReportAll quota or rate limit hit — the parcel allowance is ALLTIME, try again later or top up the account." },
        { status: 429 },
      );
    }
    console.error("[api/parcels] lookup failed:", err);
    return NextResponse.json({ error: "Parcel provider request failed" }, { status: 502 });
  }
}
