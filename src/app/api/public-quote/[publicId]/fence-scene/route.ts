import { db } from "@/lib/db";
import { rateLimitShared, ipFromRequest, HOUR } from "@/lib/rateLimit";
import { FENCE_PLAN_EVENT, parseFencePlan } from "@/lib/fence/planSvg";
import { fenceSceneFromPlan } from "@/lib/fence/scene";

export const runtime = "nodejs";

// The fence's 3D, for the client's page and the saved proposal (2026-09-27):
// the scene the estimator stored with the proposal (an ActivityEvent
// FENCE_PLAN, lib/fence/scene), as the JSON FenceModel3D takes. Public by the
// proposal's unguessable publicId, like the page and the plan drawing.
export async function GET(req: Request, ctx: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await ctx.params;
  const gate = await rateLimitShared(`fence-scene:${ipFromRequest(req)}`, 120, HOUR);
  if (!gate.ok) return new Response("Too many requests", { status: 429 });
  const proposal = await db.proposal.findUnique({ where: { publicId }, select: { id: true, organization: { select: { deletedAt: true } } } });
  if (!proposal || proposal.organization.deletedAt) return new Response("Not found", { status: 404 });
  let scene = null;
  try {
    const ev = await db.activityEvent.findFirst({ where: { proposalId: proposal.id, kind: FENCE_PLAN_EVENT }, orderBy: { createdAt: "desc" }, select: { meta: true } });
    const plan = ev?.meta ? parseFencePlan(JSON.parse(ev.meta)) : null;
    scene = plan ? fenceSceneFromPlan(plan) : null;
  } catch {
    scene = null;
  }
  if (!scene) return new Response("Not found", { status: 404 });
  return Response.json(scene, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } });
}
