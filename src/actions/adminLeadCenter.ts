"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { startCascade } from "@/lib/leadCenter/cascade";
import { routePlatformLeadToOrg } from "@/lib/leadCenter/route";
import { buildRanking } from "@/lib/leadCenter/matching";
import { getRoutingMode, setRoutingMode, type RoutingMode } from "@/lib/leadCenter/routingMode";

// Platform-admin Lead Center controls. Manual assignment is the escape hatch
// for MANUAL_QUEUE leads (and can override a pending offer: cancelling it
// inside the transaction makes the contractor's later accept fail its
// conditional update with "no longer available").

export async function manualAssignPlatformLead(
  platformLeadId: string,
  organizationId: string,
): Promise<{ ok: true; leadId: string }> {
  const admin = await requirePlatformAdmin();
  // The write itself lives in lib/leadCenter/route so the re-route that follows
  // a contractor passing on a lead does exactly the same thing.
  const { leadId } = await routePlatformLeadToOrg(platformLeadId, organizationId, admin.id);
  revalidatePath("/admin/lead-center");
  return { ok: true, leadId };
}

// Send a MANUAL_QUEUE lead back through the cascade — useful once new shops
// sign up or an existing one completes its profile. Attempts reset, but orgs
// that already received an offer are never offered the same lead twice
// (LeadOffer's unique constraint / the cascade's already-offered skip).
export async function requeuePlatformLead(platformLeadId: string): Promise<{ ok: true }> {
  await requirePlatformAdmin();

  const res = await db.platformLead.updateMany({
    where: { id: platformLeadId, status: "MANUAL_QUEUE" },
    data: { status: "MATCHING", queueReason: null, attemptCount: 0 },
  });
  if (res.count === 0) throw new Error("Only leads in the manual queue can be requeued.");

  try {
    await startCascade(platformLeadId);
  } catch (err) {
    console.warn("[admin-lead-center] requeue cascade failed — cron will re-drive:", err);
  }

  revalidatePath("/admin/lead-center");
  return { ok: true };
}

// ── Routing mode ───────────────────────────────────────────────────────────
// AUTO (the cascade offers each new request to the best shop) or MANUAL (every
// request waits in the queue for an admin). See lib/leadCenter/routingMode.

export async function readLeadRoutingMode(): Promise<RoutingMode> {
  await requirePlatformAdmin();
  return getRoutingMode();
}

export async function setLeadRoutingMode(mode: RoutingMode): Promise<{ ok: true }> {
  await requirePlatformAdmin();
  if (mode !== "AUTO" && mode !== "MANUAL") throw new Error("Unknown routing mode");
  await setRoutingMode(mode);
  revalidatePath("/admin/lead-center");
  return { ok: true };
}

/**
 * Route every waiting lead to its best-scoring shop, in one pass.
 *
 * The manual-mode counterpart of the cascade: same ranking, same write as
 * `manualAssignPlatformLead`, but the admin approves the whole batch instead of
 * clicking through it. Leads with no eligible shop are left where they are and
 * counted — routing one of those would mean inventing a match.
 */
export async function routeAllWaitingLeads(): Promise<{
  ok: true;
  routed: number;
  skipped: number;
}> {
  await requirePlatformAdmin();

  const waiting = await db.platformLead.findMany({
    where: { status: { in: ["MANUAL_QUEUE", "MATCHING"] } },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  let routed = 0;
  let skipped = 0;
  for (const pl of waiting) {
    const ranking = await buildRanking(pl).catch(() => []);
    const top = ranking[0];
    if (!top) {
      skipped += 1;
      continue;
    }
    try {
      await manualAssignPlatformLead(pl.id, top.orgId);
      routed += 1;
    } catch {
      // Someone accepted it mid-pass, or the shop vanished — either way it is
      // not this batch's lead any more.
      skipped += 1;
    }
  }

  revalidatePath("/admin/lead-center");
  return { ok: true, routed, skipped };
}
