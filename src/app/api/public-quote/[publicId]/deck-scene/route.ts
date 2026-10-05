import { db } from "@/lib/db";
import { rateLimitShared, ipFromRequest, HOUR } from "@/lib/rateLimit";
import { DECK_PLAN_EVENT, parseDeckPlan } from "@/lib/deck/convertSchema";

export const runtime = "nodejs";

// The deck's 3D, for the client's page and the saved proposal (2026-10-04):
// the scene the Deck Studio froze with the proposal (an ActivityEvent
// DECK_PLAN, lib/deck/convertSchema), as the box list DeckModel3D draws.
// Public by the proposal's unguessable publicId, like the fence's scene. Only
// the scene goes out — the design and the address stay on the server.
export async function GET(req: Request, ctx: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await ctx.params;
  const gate = await rateLimitShared(`deck-scene:${ipFromRequest(req)}`, 120, HOUR);
  if (!gate.ok) return new Response("Too many requests", { status: 429 });
  const proposal = await db.proposal.findUnique({ where: { publicId }, select: { id: true, organization: { select: { deletedAt: true } } } });
  if (!proposal || proposal.organization.deletedAt) return new Response("Not found", { status: 404 });
  let scene = null;
  try {
    const ev = await db.activityEvent.findFirst({ where: { proposalId: proposal.id, kind: DECK_PLAN_EVENT }, orderBy: { createdAt: "desc" }, select: { meta: true } });
    scene = ev?.meta ? (parseDeckPlan(JSON.parse(ev.meta))?.scene ?? null) : null;
  } catch {
    scene = null;
  }
  if (!scene) return new Response("Not found", { status: 404 });
  return Response.json(scene, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } });
}
