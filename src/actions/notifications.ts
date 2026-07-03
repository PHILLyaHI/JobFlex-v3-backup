"use server";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/orgContext";

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
