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
import { lookupParcelByPoint, lookupSiblingParcels } from "@/lib/parcelLookup";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  addressKeyOf,
  fetchParcelByAddress,
  isReportAllEnabled,
  ReportAllError,
  type Parcel,
} from "@/lib/reportall";
import { parseWkt } from "@/lib/parcels";
import { rateLimitShared, HOUR } from "@/lib/rateLimit";

export const runtime = "nodejs";

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
  // ReportAll's quota is ALLTIME — one account must not be able to drain it.
  const gate = await rateLimitShared(`parcels:${session.user.id}`, 30, HOUR);
  if (!gate.ok) return NextResponse.json({ error: "Too many requests — try again later." }, { status: 429 });
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

      // The cache-first policy lives in @/lib/parcelLookup and is SHARED with
      // actions/fenceBoundary.ts. It used to live here, reachable only over
      // HTTP; two callers with two policies would have been two ways to spend
      // the same ALLTIME quota twice.
      const found = await lookupParcelByPoint(lat, lon, { withNearest: true });
      if (found.ok) {
        const p = found.parcel;
        // The rest of the PROPERTY. A point sits in one lot; a house bought as
        // two adjoining deeds is two, and the fence goes round both. Cache-first
        // and swept at most once per lot (see lookupSiblingParcels), so this is
        // free on every repeat visit to the address.
        const siblings = await lookupSiblingParcels(
          { ...p, rings: p.all[0]?.rings ?? p.rings },
          p.all.map((c) => c.robustId),
        ).catch(() => []);
        const all = [...p.all, ...siblings];
        return NextResponse.json({
          found: true as const,
          cached: p.cached,
          parcel: {
            robustId: p.robustId,
            parcelId: p.parcelId,
            owner: p.owner,
            address: p.address,
            city: p.city,
            zip: p.zip,
            acreage: p.acreage,
            lat: p.lat,
            lon: p.lon,
          },
          // Flat rings stay for callers that want one boundary; `parcels` keeps
          // them grouped per lot, which is what an address covering more than
          // one parcel needs in order to draw the whole property.
          rings: all.flatMap((c) => c.rings),
          parcels: all,
        });
      }
      if (found.reason === "error") {
        return NextResponse.json({ error: found.error }, { status: 502 });
      }
      return NextResponse.json({ found: false, nearest: found.nearest ?? null }, { status: 404 });
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
