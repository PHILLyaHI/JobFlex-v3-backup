// GET /api/parcel-tiles/{z}/{x}/{y} — proxy for ReportAll's parcel-boundary
// raster tiles, so the client key never reaches the browser. Tiles ride a
// SEPARATE ALLTIME quota (20000) from parcel lookups, and the browser cache is
// the first line of thrift: tiles are immutable for our purposes, so they ship
// with a year-long Cache-Control and a repeat pan costs nothing.
//
// ReportAll serves tiles for zoom 14–21; anything else is answered locally
// with 204 so a stray zoom level cannot spend quota.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

const TILE_BASE = "https://reportallusa.com/dyn/tile.py";
const MIN_ZOOM = 14;
const MAX_ZOOM = 21;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse(null, { status: 401 });
  const key = process.env.REPORTALL_CLIENT_KEY;
  if (!key) return new NextResponse(null, { status: 503 });

  const { z, x, y } = await ctx.params;
  const zi = parseInt(z, 10);
  const xi = parseInt(x, 10);
  const yi = parseInt(y, 10);
  if (![zi, xi, yi].every(Number.isFinite) || zi < MIN_ZOOM || zi > MAX_ZOOM) {
    return new NextResponse(null, { status: 204 });
  }

  const qs = new URLSearchParams({
    map: "siteroot/Base_Layers.map",
    layer: "Parcels",
    mode: "tile",
    tilemode: "gmap",
    tile: `${xi} ${yi} ${zi}`,
    client: key,
  });

  try {
    const res = await fetch(`${TILE_BASE}?${qs}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return new NextResponse(null, { status: 502 });
    const body = await res.arrayBuffer();
    return new NextResponse(body, {
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "image/png",
        // Immutable enough: parcel line-work changes on a cadastral timescale.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
