import { db } from "@/lib/db";
import { rateLimitShared, ipFromRequest, HOUR } from "@/lib/rateLimit";
import { satellitePhotoPng } from "@/lib/staticMapPhoto";

export const runtime = "nodejs";

// The homeowner's own house, as the proposal page shows it: the satellite
// photo of the measurement the proposal was converted from. Public by the
// proposal's unguessable publicId, like the page itself; nothing else about
// the measurement leaves the server. 404 when the proposal has no linked
// measurement (or the link table is not pushed yet).
export async function GET(req: Request, ctx: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await ctx.params;
  const gate = await rateLimitShared(`site-photo:${ipFromRequest(req)}`, 120, HOUR);
  if (!gate.ok) return new Response("Too many requests", { status: 429 });

  const proposal = await db.proposal.findUnique({
    where: { publicId },
    select: { id: true, organization: { select: { deletedAt: true } } },
  });
  if (!proposal || proposal.organization.deletedAt) return new Response("Not found", { status: 404 });

  let link: { roofMeasurementId: string } | null = null;
  try {
    link = await db.proposalSitePhoto.findUnique({ where: { proposalId: proposal.id }, select: { roofMeasurementId: true } });
  } catch {
    link = null;
  }
  if (!link) return new Response("Not found", { status: 404 });

  const row = await db.roofMeasurement.findUnique({
    where: { id: link.roofMeasurementId },
    select: { address: true, city: true, state: true, zip: true, lat: true, lng: true, instantJson: true },
  });
  if (!row) return new Response("Not found", { status: 404 });

  const photo = await satellitePhotoPng(row);
  if (!photo.ok) return new Response(photo.error, { status: 502 });
  return new Response(new Uint8Array(photo.bytes), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400, s-maxage=86400" },
  });
}
