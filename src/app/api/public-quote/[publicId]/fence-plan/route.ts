import { db } from "@/lib/db";
import { rateLimitShared, ipFromRequest, HOUR } from "@/lib/rateLimit";
import { FENCE_PLAN_EVENT, fencePlanSvg, parseFencePlan } from "@/lib/fence/planSvg";

export const runtime = "nodejs";

// The fence's layout, drawn for the client (2026-09-23): the plan the
// estimator stored with the proposal (an ActivityEvent FENCE_PLAN), as an
// SVG. Public by the proposal's unguessable publicId, like the page itself.
export async function GET(req: Request, ctx: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await ctx.params;
  const gate = await rateLimitShared(`fence-plan:${ipFromRequest(req)}`, 120, HOUR);
  if (!gate.ok) return new Response("Too many requests", { status: 429 });
  const proposal = await db.proposal.findUnique({ where: { publicId }, select: { id: true, organization: { select: { deletedAt: true } } } });
  if (!proposal || proposal.organization.deletedAt) return new Response("Not found", { status: 404 });
  let plan = null;
  try {
    const ev = await db.activityEvent.findFirst({ where: { proposalId: proposal.id, kind: FENCE_PLAN_EVENT }, orderBy: { createdAt: "desc" }, select: { meta: true } });
    plan = ev?.meta ? parseFencePlan(JSON.parse(ev.meta)) : null;
  } catch {
    plan = null;
  }
  if (!plan) return new Response("Not found", { status: 404 });
  return new Response(fencePlanSvg(plan), { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=3600" } });
}
