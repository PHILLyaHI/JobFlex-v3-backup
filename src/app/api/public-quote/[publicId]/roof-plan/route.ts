import { db } from "@/lib/db";
import { rateLimitShared, ipFromRequest, HOUR } from "@/lib/rateLimit";
import type { InstantRoofData } from "@/lib/eagleview";
import { roofFactsLine, roofPlanSvg, roofRings } from "@/lib/roofPictures";

export const runtime = "nodejs";

// The client's roof as a plan (2026-09-23): the measured outline with its
// edge lengths, drawn from the measurement's own rings — no key, no fetch.
export async function GET(req: Request, ctx: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await ctx.params;
  const gate = await rateLimitShared(`roof-plan:${ipFromRequest(req)}`, 120, HOUR);
  if (!gate.ok) return new Response("Too many requests", { status: 429 });
  const proposal = await db.proposal.findUnique({ where: { publicId }, select: { id: true, organization: { select: { deletedAt: true } } } });
  if (!proposal || proposal.organization.deletedAt) return new Response("Not found", { status: 404 });
  let link: { roofMeasurementId: string } | null = null;
  try {
    link = await db.proposalSitePhoto.findUnique({ where: { proposalId: proposal.id }, select: { roofMeasurementId: true } });
  } catch {
    link = null;
  }
  if (!link) return new Response("Not found", { status: 404 });
  const row = await db.roofMeasurement.findUnique({ where: { id: link.roofMeasurementId }, select: { instantJson: true, areaSqft: true, squares: true, predominantPitch: true, facetCount: true, createdAt: true } });
  if (!row) return new Response("Not found", { status: 404 });
  let instant: InstantRoofData | null = null;
  try { instant = row.instantJson ? (JSON.parse(row.instantJson) as InstantRoofData) : null; } catch { instant = null; }
  const rings = roofRings(instant);
  if (!rings.length) return new Response("Not found", { status: 404 });
  const facts = roofFactsLine({ areaSqft: row.areaSqft, squares: row.squares, pitch: row.predominantPitch, facetCount: row.facetCount, measuredOn: row.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) });
  return new Response(roofPlanSvg(rings, facts), { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=3600" } });
}
