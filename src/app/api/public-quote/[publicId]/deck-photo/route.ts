import { db } from "@/lib/db";
import { rateLimitShared, ipFromRequest, HOUR } from "@/lib/rateLimit";
import { DECK_PLAN_EVENT, parseDeckPlan } from "@/lib/deck/convertSchema";
import { kindOfUrl, presignedGet, readLocal } from "@/lib/media/privateStore";

export const runtime = "nodejs";

// THE PHOTO OF THE HOUSE A DECK WAS DESIGNED ON (M2, 2026-10-10): the picture
// the contractor took of the back wall, kept with the proposal's DECK_PLAN
// (lib/deck/convertSchema) in the private file store. Public by the
// proposal's unguessable publicId, like the deck's 3D: a client who has the
// proposal link may see the picture of their own house, nobody else. A
// private blob answers with a redirect to a short presigned URL; the local
// fallback streams the file; an inline data URL is returned as the bytes.
export async function GET(req: Request, ctx: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await ctx.params;
  const gate = await rateLimitShared(`deck-photo:${ipFromRequest(req)}`, 120, HOUR);
  if (!gate.ok) return new Response("Too many requests", { status: 429 });
  const proposal = await db.proposal.findUnique({ where: { publicId }, select: { id: true, organization: { select: { deletedAt: true } } } });
  if (!proposal || proposal.organization.deletedAt) return new Response("Not found", { status: 404 });
  let url: string | null = null;
  try {
    const ev = await db.activityEvent.findFirst({ where: { proposalId: proposal.id, kind: DECK_PLAN_EVENT }, orderBy: { createdAt: "desc" }, select: { meta: true } });
    url = ev?.meta ? (parseDeckPlan(JSON.parse(ev.meta))?.design.photo?.url ?? null) : null;
  } catch {
    url = null;
  }
  if (!url) return new Response("Not found", { status: 404 });
  const kind = kindOfUrl(url);
  if (kind === "private-blob") {
    try {
      const to = await presignedGet(url, 15 * 60_000, false);
      return new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "private, no-store" } });
    } catch {
      return new Response("File storage is not reachable right now.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  }
  if (kind === "local") {
    const r = await readLocal(url, req.headers.get("range"), null);
    if (!r) return new Response("Not found", { status: 404 });
    return new Response(r.body, { status: r.status, headers: r.headers });
  }
  if (kind === "data") {
    const m = /^data:([^;,]+);base64,(.*)$/s.exec(url);
    if (!m) return new Response("Not found", { status: 404 });
    return new Response(Buffer.from(m[2], "base64"), { status: 200, headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=3600" } });
  }
  return new Response("Not found", { status: 404 });
}
