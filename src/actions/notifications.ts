"use server";
import { db } from "@/lib/db";
import { requireManager, requireOrg } from "@/lib/orgContext";
import { SEEN_SURFACES, type SeenKey } from "@/lib/badgeCounts";

/**
 * Stamp a nav surface as seen for the current user — clears its badge until
 * newer items arrive. Called from <MarkNavSeen /> on each surface's page.
 * This is the only badge mutation that's a real action (the counting lives in
 * src/lib/badgeCounts.ts, deliberately outside "use server"). The key arrives
 * over the action wire, so it's validated at runtime, not just by the type.
 */
export async function markNavSeen(key: SeenKey) {
  if (!(key in SEEN_SURFACES)) return;
  const { organizationId, user } = await requireOrg();
  await db.navSeen.upsert({
    where: { userId_organizationId_key: { userId: user.id, organizationId, key } },
    create: { userId: user.id, organizationId, key },
    update: { seenAt: new Date() },
  });
}

export interface NotificationItem {
  id: string;
  kind: string;
  summary: string;
  createdAt: Date;
  href: string | null;
}

/** Resolve the best in-app destination for an activity row. */
function hrefFor(e: {
  proposalId: string | null;
  clientId: string | null;
  leadId: string | null;
}): string | null {
  if (e.proposalId) return `/dashboard/proposals/${e.proposalId}`;
  if (e.leadId) return `/dashboard/leads/${e.leadId}`;
  if (e.clientId) return `/dashboard/clients/${e.clientId}`;
  return null;
}

/**
 * Recent org activity, surfaced as the navbar bell feed. Read-only over
 * ActivityEvent — there is no dedicated Notification model.
 */
export async function recentNotifications(): Promise<NotificationItem[]> {
  const { organizationId } = await requireManager();
  const events = await db.activityEvent.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: {
      id: true,
      kind: true,
      summary: true,
      createdAt: true,
      proposalId: true,
      clientId: true,
      leadId: true,
    },
  });

  return events.map((e) => ({
    id: e.id,
    kind: e.kind,
    summary: e.summary,
    createdAt: e.createdAt,
    href: hrefFor(e),
  }));
}
