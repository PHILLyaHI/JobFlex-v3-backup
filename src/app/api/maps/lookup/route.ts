import { NextResponse } from "next/server";
import { geocode, isMapsEnabled, staticMapUrl } from "@/lib/maps";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!isMapsEnabled()) return NextResponse.json({ disabled: true });
  const url = new URL(req.url);
  const address = url.searchParams.get("address");
  if (!address) return NextResponse.json({ error: "Missing address" }, { status: 400 });
  let geo: Awaited<ReturnType<typeof geocode>>;
  try {
    geo = await geocode(address);
  } catch {
    // The lookup service did not answer — that is a 503 to our caller, not a
    // 404: the address was never judged.
    return NextResponse.json({ error: "Address lookup did not answer — try again" }, { status: 503 });
  }
  if (!geo) return NextResponse.json({ error: "Couldn't geocode" }, { status: 404 });
  const map = staticMapUrl(geo.lat, geo.lng, { zoom: 20, mapType: "satellite" });
  return NextResponse.json({ lat: geo.lat, lng: geo.lng, mapUrl: map });
}
