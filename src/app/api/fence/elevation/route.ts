import { NextResponse, type NextRequest } from "next/server";
import { requireEstimatorOrManager } from "@/lib/orgContext";
import { elevationForPoints, MAX_ELEVATION_POINTS } from "@/lib/elevationProfile";
import { RateLimitError } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/fence/elevation  { points: [{ lat, lng }, …] }
//
// The fence estimator's contour lattice (up to 900 points over the lot). The
// same implementation as the `fetchElevationProfile` server action — same
// sources, cache and per-org rate limit — reached by a plain fetch so it does
// not sit in the one-at-a-time server-action queue in front of the traced
// fence's own profile, which is what the price reads. Answers the action's
// result shape: { ok: true, elevFt, cached, source, resM? } | { ok: false, error }.
export async function POST(req: NextRequest) {
  let organizationId: string;
  try {
    ({ organizationId } = await requireEstimatorOrManager());
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  let points: unknown;
  try {
    points = ((await req.json()) as { points?: unknown })?.points;
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON" }, { status: 400 });
  }
  if (!Array.isArray(points) || points.length > MAX_ELEVATION_POINTS) {
    return NextResponse.json({ ok: false, error: "points must be an array of at most " + MAX_ELEVATION_POINTS }, { status: 400 });
  }
  try {
    return NextResponse.json(await elevationForPoints(points as Array<{ lat: number; lng: number }>, organizationId));
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 429 });
    }
    console.error("[api/fence/elevation] failed:", err);
    return NextResponse.json({ ok: false, error: "Ground lookup failed" }, { status: 500 });
  }
}
