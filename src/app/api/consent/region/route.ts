import { NextResponse } from "next/server";
import { consentModeFor } from "@/lib/consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/consent/region → { country, mode }
//
// Which consent model the visitor gets, from Vercel's edge geolocation
// header (x-vercel-ip-country). Read here rather than in the root layout so
// the layout stays static; the banner asks once, only while no choice has
// been recorded. US and Canada get the notice strip (cookies on by default,
// "Do not sell or share" in the footer); everywhere else, and an unknown
// country, the opt-in banner. No personal data: the country code only.
export async function GET(req: Request) {
  const country = (req.headers.get("x-vercel-ip-country") ?? "").trim().toUpperCase() || null;
  return NextResponse.json(
    { country, mode: consentModeFor(country) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
