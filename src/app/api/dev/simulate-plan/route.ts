// TEMP (2026-09-19) — POST /api/dev/simulate-plan — the dev-only plan simulator.
// Remove together with lib/devSimulation and the block on /dashboard/upgrade.
//
// Moves the signed-in owner's organization one rung up or down the plan
// ladder WITHOUT Stripe, by the same write a paid checkout makes
// (lib/subscriptionRecord.recordPlanChange), then sends the browser back to
// /dashboard/upgrade with ?simulated=<slug>, which the page treats exactly as
// the ?session_id return leg — so the activation stamp that plays after a real
// payment plays here, from the same code.
//
// THE GATE IS THE FIRST LINE. Outside a development machine this route does
// not exist as far as any caller can tell: a plain 404, before the session is
// even read, so nothing about it can be probed on Vercel.

import { NextResponse } from "next/server";
import { isDevSimulationEnabled } from "@/lib/devSimulation";
import { requireOwner } from "@/lib/orgContext";
import { getPlanCatalog } from "@/lib/planCatalogServer";
import { db } from "@/lib/db";
import { recordPlanChange } from "@/lib/subscriptionRecord";
import { SubscriptionStatus } from "@/lib/prismaEnums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isDevSimulationEnabled()) return new NextResponse(null, { status: 404 });

  let organizationId: string;
  try {
    ({ organizationId } = await requireOwner());
  } catch {
    return NextResponse.json({ error: "Owner access required" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { direction?: string };
  const direction = body.direction === "down" ? "down" : body.direction === "up" ? "up" : null;
  if (!direction) return NextResponse.json({ error: "direction must be up or down" }, { status: 400 });

  // The ladder is the catalog's own order (Starter < Professional < Enterprise,
  // as /admin/plans sorts them), paid plans only — the same rung the upgrade
  // page's "up / down" reads from.
  const ladder = (await getPlanCatalog()).filter((p) => !p.isFree);
  const sub = await db.subscription.findUnique({ where: { organizationId }, select: { plan: true } });
  const current = (sub?.plan ?? "").toLowerCase();
  const at = ladder.findIndex((p) => p.slug === current);
  const next = direction === "up" ? ladder[at + 1] : at > 0 ? ladder[at - 1] : undefined;
  if (!next) {
    return NextResponse.json(
      { error: direction === "up" ? "Already on the top plan." : "Already on the lowest plan." },
      { status: 409 },
    );
  }

  const now = Date.now();
  const planSlug = await recordPlanChange({
    organizationId,
    planSlug: next.slug,
    status: SubscriptionStatus.ACTIVE,
    customerId: null,
    subId: null,
    trialEnd: null,
    periodEnd: new Date(now + 30 * 24 * 60 * 60 * 1000),
  });
  console.info(`[dev/simulate-plan] ${organizationId}: ${current || "(none)"} → ${planSlug} (${direction})`);
  return NextResponse.json({ ok: true, from: current || null, to: planSlug });
}
