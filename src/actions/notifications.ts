"use server";
import { db } from "@/lib/db";
import { requireManager, requireOrg } from "@/lib/orgContext";
import { SEEN_SURFACES, countNewForSurface, type SeenKey } from "@/lib/badgeCounts";

/**
 * Stamp a nav surface as seen for the current user — clears its badge until
 * newer items arrive. Called from <MarkNavSeen /> on each surface's page.
 * This is the only badge mutation that's a real action (the counting lives in
 * src/lib/badgeCounts.ts, deliberately outside "use server"). The key arrives
 * over the action wire, so it's validated at runtime, not just by the type.
 *
 * Returns whether a badge was actually showing (items newer than the previous
 * stamp) so the caller can skip its router.refresh() — a full server re-render
 * of layout + page — on the common badge-less visit.
 */
export async function markNavSeen(key: SeenKey): Promise<{ hadNew: boolean }> {
  if (!(key in SEEN_SURFACES)) return { hadNew: false };
  const { organizationId, user } = await requireOrg();
  const prev = await db.navSeen.findUnique({
    where: { userId_organizationId_key: { userId: user.id, organizationId, key } },
    select: { seenAt: true },
  });
  const hadNew = (await countNewForSurface(key, organizationId, prev?.seenAt, user.id)) > 0;
  await db.navSeen.upsert({
    where: { userId_organizationId_key: { userId: user.id, organizationId, key } },
    create: { userId: user.id, organizationId, key },
    update: { seenAt: new Date() },
  });
  return { hadNew };
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
 * The bell feed for whoever is asking.
 *
 * A MANAGER gets the org's activity stream (below). A WORKER gets their OWN
 * schedule — the jobs and appointments they have been put on — because
 * `recentNotifications` is requireManager()-gated and an installer calling it
 * receives an error, not an empty list. That is why a worker had no in-app
 * notification surface at all: not an empty bell, an unreachable one.
 *
 * Derived from the assignment rows themselves rather than a Notification
 * table, which does not exist. `assignedAt` is when the office put them on the
 * work, so it is the honest timestamp for "you were scheduled".
 */
export async function notificationFeed(): Promise<NotificationItem[]> {
  const { organizationId, user, role } = await requireOrg();
  const limited = role === "INSTALLER";
  if (!limited) return recentNotifications();

  const profile = await db.workerProfile.findFirst({
    where: { userId: user.id, organizationId },
    select: { id: true },
  });
  if (!profile) return [];

  const [jobs, appts] = await Promise.all([
    db.jobAssignment.findMany({
      where: { workerId: profile.id, job: { organizationId } },
      orderBy: { assignedAt: "desc" },
      take: 12,
      select: {
        id: true,
        status: true,
        assignedAt: true,
        job: { select: { id: true, title: true, startsAt: true } },
      },
    }),
    db.appointmentAssignment.findMany({
      where: { workerId: profile.id, appointment: { organizationId } },
      orderBy: { appointment: { startsAt: "desc" } },
      take: 12,
      select: {
        id: true,
        appointment: { select: { id: true, title: true, startsAt: true } },
      },
    }),
  ]);

  const when = (d: Date | null) =>
    d
      ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : "a date to be confirmed";

  const items: NotificationItem[] = [
    ...jobs.map((a) => ({
      id: a.id,
      kind: a.status === "PENDING" ? "ASSIGNED" : `ASSIGNMENT_${a.status}`,
      summary:
        a.status === "PENDING"
          ? `You're scheduled: "${a.job.title}" — ${when(a.job.startsAt)}. Awaiting your answer.`
          : `"${a.job.title}" — ${when(a.job.startsAt)}`,
      createdAt: a.assignedAt,
      // A PENDING row IS the ask — land on the jobs page with the offers
      // popup already open (?offers=1), so the bell click reaches Accept /
      // Decline directly. Answered rows go to the job record.
      href: a.status === "PENDING" ? "/dashboard/jobs?offers=1" : `/dashboard/jobs/${a.job.id}`,
    })),
    ...appts.map((a) => ({
      id: a.id,
      kind: "APPOINTMENT",
      summary: `You're on "${a.appointment.title}" — ${when(a.appointment.startsAt)}`,
      // Appointments carry no assignedAt of their own; the booking time is the
      // only timestamp there is, and it is what the worker cares about anyway.
      createdAt: a.appointment.startsAt ?? new Date(0),
      href: "/dashboard/calendar",
    })),
  ];

  return items
    .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())
    .slice(0, 12);
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
