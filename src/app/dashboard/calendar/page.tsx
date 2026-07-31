// Calendar — Blueprint edition. Pixel-identical port of the canonical calendar
// donor (jobflex-calendar-blueprint_5.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// The classic calendar page was archived to
// old-design-pages/dashboard/calendar/page.tsx and stays restorable by moving
// it back into src/app/(dashboard)/dashboard/calendar/.
//
// This page is NOT a fixture: the grid, the dispatch tray, the crew inbox and
// the link picker are all read from the database here, and every mutation the
// behavior module performs goes through the existing calendar server actions
// (appointments.ts / blockedTime.ts / jobs.ts / workers.ts). The queries and the
// role scoping are the archived classic page's — same where-clauses, same
// ±400-day window, same row-key domain — so both editions describe the same
// calendar.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  requireOrg,
  isWorkerRole,
  isSalesRole,
  isEstimatorRole,
  NoOrgError,
  UnauthorizedError,
} from "@/lib/orgContext";
import { roleLabel } from "@/lib/prismaEnums";
import { db } from "@/lib/db";
import { CalendarContent } from "@/components/v3/calendar-blueprint/calendar-content";
import type {
  CalEvent,
  CalKind,
  CalWorker,
  CalendarSeed,
  InboxItem,
  LinkOption,
  TrayJob,
} from "@/components/v3/calendar-blueprint/calendar-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Calendar",
  description: "Calendar — month, week and crew views with an unscheduled-work tray on one sheet.",
};

// The AI estimate appends an "Assumptions:" block onto Proposal.scopeOfWork when
// it becomes a proposal. On the calendar we want the scope only, so cut from
// that heading onward (verbatim from the archived classic page).
function scopeOnly(scope: string | null | undefined): string | null {
  if (!scope) return null;
  const cut = scope.split(/\n{2,}\s*Assumptions:/i)[0].trim();
  return cut || null;
}

// Compose a one-line client address from the parts we have, or null.
function clientAddr(
  c: { address?: string | null; city?: string | null; state?: string | null } | null | undefined,
): string | null {
  if (!c) return null;
  const line = [c.address, c.city, c.state].filter(Boolean).join(", ").trim();
  return line || null;
}

/** "4h" / "2d" for a tray card. `scheduleJobFromTray` books 9:00–14:00 when the
 *  job carries no span of its own, so that is the honest fallback. */
function durLabel(startsAt: Date | null, endsAt: Date | null): string {
  if (!startsAt || !endsAt) return "5h";
  const h = Math.max(1, Math.round((endsAt.getTime() - startsAt.getTime()) / 3600000));
  return h >= 24 ? Math.round(h / 24) + "d" : h + "h";
}

/**
 * The all-day flag is not a column — it is what a span from midnight to the end
 * of the same-or-a-later day MEANS. Deriving it here is what makes the week
 * grid's all-day band survive a reload: dropping a block into the band writes
 * exactly this span, and reading it back puts the block straight back in the
 * band instead of stretching it down the time grid.
 */
function isAllDay(start: Date, end: Date): boolean {
  const startsAtMidnight = start.getHours() === 0 && start.getMinutes() === 0;
  const endsAtDayEnd = end.getHours() === 23 && end.getMinutes() >= 59;
  return startsAtMidnight && endsAtDayEnd;
}

function money(n: number | null | undefined): string | null {
  if (n == null) return null;
  return "$" + Math.round(n).toLocaleString("en-US");
}

export default async function CalendarPage() {
  let organizationId: string;
  let role: string;
  let userId: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
    role = ctx.role;
    userId = ctx.user.id;
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard%2Fcalendar");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  // The cursor lives client-side, so the fetch cannot be scoped to the visible
  // month — it must cover everywhere the toolbar can navigate to.
  const from = new Date();
  from.setDate(from.getDate() - 400);
  const to = new Date();
  to.setDate(to.getDate() + 400);

  const worker = isWorkerRole(role);
  const sales = isSalesRole(role);
  // Everyone else (OWNER / ADMIN / MANAGER / ESTIMATOR / legacy roles) gets the
  // manager calendar — exactly the fallthrough the archived page used. The
  // dispatch actions are `requireManager()`-guarded on their own, so this flag
  // only decides what the UI offers, never what the server permits.
  const canManage = !worker && !sales;
  const estimator = isEstimatorRole(role);

  // Mirrors the three create actions' own guards, so the sheet never shows a tab
  // whose submit can only be refused: `createJobEvent` bars SALES + ESTIMATOR,
  // `createAppointment` / `createBlockedTime` bar INSTALLER + ESTIMATOR.
  const createKinds: CalKind[] = [];
  if (!sales && !estimator) createKinds.push("job");
  if (!worker && !estimator) createKinds.push("appointment", "blocked");

  const self = worker || sales
    ? await db.workerProfile.findUnique({ where: { userId }, select: { id: true } })
    : null;
  const selfWorkerId = self?.id ?? "__none__";

  // ── Role-scoped where-clauses (archived page, verbatim shapes) ────────────
  const jobEventWhere = worker
    ? {
        organizationId,
        startsAt: { gte: from, lte: to },
        OR: [
          { job: { assignments: { some: { workerId: selfWorkerId } } } },
          { createdById: userId },
        ],
      }
    : sales
      ? {
          organizationId,
          startsAt: { gte: from, lte: to },
          job: {
            OR: [
              { assignments: { some: { workerId: selfWorkerId } } },
              { proposal: { ownerId: userId } },
            ],
          },
        }
      : { organizationId, startsAt: { gte: from, lte: to } };

  const appointmentWhere = worker
    ? {
        organizationId,
        startsAt: { gte: from, lte: to },
        assignments: { some: { workerId: selfWorkerId } },
      }
    : sales
      ? {
          organizationId,
          startsAt: { gte: from, lte: to },
          OR: [{ assignments: { some: { workerId: selfWorkerId } } }, { createdById: userId }],
        }
      : { organizationId, startsAt: { gte: from, lte: to } };

  // Blocked time: managers see the org's; everyone else sees their own plus the
  // org-wide (ownerless) blocks, which is the archived sales branch's scope.
  const blockedWhere = canManage
    ? { organizationId, startsAt: { gte: from, lte: to } }
    : {
        organizationId,
        startsAt: { gte: from, lte: to },
        OR: [{ ownerId: userId }, { ownerId: null }],
      };

  const [events, appointments, blockedTimes, workerProfiles, memberships] = await Promise.all([
    db.jobEvent.findMany({
      where: jobEventWhere,
      orderBy: { startsAt: "asc" },
      include: {
        job: {
          select: {
            status: true,
            client: { select: { name: true, phone: true, address: true, city: true, state: true } },
            proposal: { select: { scopeOfWork: true } },
            assignments: { select: { id: true, workerId: true } },
          },
        },
      },
    }),
    db.appointment.findMany({
      where: appointmentWhere,
      orderBy: { startsAt: "asc" },
      include: {
        lead: { select: { name: true, projectType: true } },
        client: { select: { name: true, phone: true, address: true, city: true, state: true } },
        proposal: { select: { title: true } },
        assignments: { select: { workerId: true } },
      },
    }),
    db.blockedTime.findMany({
      where: blockedWhere,
      orderBy: { startsAt: "asc" },
    }),
    db.workerProfile.findMany({
      // Declined invites are excluded everywhere else (plan limits, getTeamBusy)
      // — keep the team rows and the crew picker consistent with that.
      where: { organizationId, inviteStatus: { not: "DECLINED" } },
      select: { id: true, userId: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    db.membership.findMany({ where: { organizationId }, select: { userId: true, role: true } }),
  ]);

  // Dispatch surfaces are manager-only, same as the archived page.
  const [unscheduledJobs, pendingAssignments] = canManage
    ? await Promise.all([
        db.job.findMany({
          where: {
            organizationId,
            status: { in: ["SCHEDULED", "IN_PROGRESS"] },
            events: { none: {} },
          },
          orderBy: { createdAt: "desc" },
          include: {
            client: { select: { name: true, city: true, address: true } },
            proposal: { select: { total: true } },
          },
          take: 30,
        }),
        db.jobAssignment.findMany({
          where: { status: "PENDING", job: { organizationId } },
          include: {
            worker: { select: { displayName: true } },
            job: { select: { id: true, title: true, startsAt: true } },
          },
          orderBy: { assignedAt: "desc" },
          take: 50,
        }),
      ])
    : [[], []];

  // ── Link picker sources ──────────────────────────────────────────────────
  const [pickerJobs, pickerProposals, pickerLeads, pickerClients] = await Promise.all([
    // A worker may only hang an event off a job they are assigned to; sales get
    // no job picker at all (job events are a delivery concern).
    sales
      ? Promise.resolve([])
      : db.job.findMany({
          where: worker
            ? { organizationId, assignments: { some: { workerId: selfWorkerId } } }
            : { organizationId },
          orderBy: { createdAt: "desc" },
          include: { client: { select: { name: true, city: true } } },
          take: 80,
        }),
    worker
      ? Promise.resolve([])
      : db.proposal.findMany({
          where: sales ? { organizationId, ownerId: userId } : { organizationId },
          orderBy: { createdAt: "desc" },
          include: { client: { select: { name: true, city: true } } },
          take: 60,
        }),
    worker
      ? Promise.resolve([])
      : db.lead.findMany({
          where: sales
            ? {
                organizationId,
                status: { in: ["NEW", "ROUTED", "CLAIMED", "CONTACTED", "QUOTED"] },
                OR: [{ assignedToId: userId }, { claimedById: userId }, { status: "NEW" }],
              }
            : {
                organizationId,
                status: { in: ["NEW", "ROUTED", "CLAIMED", "CONTACTED", "QUOTED"] },
              },
          orderBy: { createdAt: "desc" },
          select: { id: true, name: true, status: true, projectType: true, city: true },
          take: 60,
        }),
    worker
      ? Promise.resolve([])
      : db.client.findMany({
          where: { organizationId, deletedAt: null },
          orderBy: { updatedAt: "desc" },
          select: { id: true, name: true, address: true, city: true, state: true },
          take: 100,
        }),
  ]);

  // ── Shaping ──────────────────────────────────────────────────────────────
  const roleByUser = new Map(memberships.map((m) => [m.userId, m.role]));
  const workerIdByUserId = new Map(workerProfiles.map((w) => [w.userId, w.id]));

  // Events carry worker IDS, not names — the blueprint resolves the display name
  // through `workersData` at render time, which is also what keeps a rename from
  // needing every event row re-shaped.
  const workers: CalWorker[] = workerProfiles.map((w) => ({
    id: w.id,
    name: w.displayName,
    role: roleLabel(roleByUser.get(w.userId) ?? "INSTALLER"),
  }));

  const jobEvents: CalEvent[] = events.map((e) => ({
    id: e.id,
    rid: e.id,
    jobId: e.jobId,
    kind: "job" as const,
    title: e.title,
    start: e.startsAt,
    end: e.endsAt,
    status: e.job?.status ?? "SCHEDULED",
    workers: e.job?.assignments.map((a) => a.workerId) ?? [],
    assignmentIds: Object.fromEntries(
      (e.job?.assignments ?? []).map((a) => [a.workerId, a.id]),
    ),
    client: e.job?.client?.name ?? undefined,
    phone: e.job?.client?.phone ?? undefined,
    addr: clientAddr(e.job?.client) ?? undefined,
    scope: scopeOnly(e.job?.proposal?.scopeOfWork) ?? undefined,
    notes: e.notes ?? undefined,
    allDay: isAllDay(e.startsAt, e.endsAt) || undefined,
  }));

  const appointmentEvents: CalEvent[] = appointments.map((a) => ({
    id: `apt:${a.id}`,
    rid: a.id,
    kind: "appointment" as const,
    title: a.title,
    start: a.startsAt,
    end: a.endsAt,
    status: a.status,
    workers: a.assignments.map((x) => x.workerId),
    client: a.lead?.name ?? a.client?.name ?? a.proposal?.title ?? undefined,
    phone: a.client?.phone ?? undefined,
    addr: clientAddr(a.client) ?? undefined,
    notes: a.notes ?? undefined,
    allDay: isAllDay(a.startsAt, a.endsAt) || undefined,
  }));

  const blockedEvents: CalEvent[] = blockedTimes.map((b) => {
    // Personal blocks land on their owner's team row; an ownerless (org-wide)
    // block belongs to no row, exactly as in the classic page.
    const ownerWorkerId = b.ownerId ? workerIdByUserId.get(b.ownerId) : undefined;
    return {
      id: `block:${b.id}`,
      rid: b.id,
      kind: "blocked" as const,
      title: b.reason,
      start: b.startsAt,
      end: b.endsAt,
      status: "SCHEDULED",
      workers: ownerWorkerId ? [ownerWorkerId] : [],
      selfOnly: b.ownerId === userId || undefined,
    };
  });

  const tray: TrayJob[] = unscheduledJobs.map((j) => ({
    id: j.id,
    title: j.title,
    client: j.client?.name ?? "No client",
    city: j.client?.city ?? j.client?.address ?? "—",
    duration: durLabel(j.startsAt, j.endsAt),
  }));

  const inbox: InboxItem[] = pendingAssignments.map((a) => ({
    id: a.id,
    title: a.job.title,
    worker: a.worker.displayName,
    when: a.job.startsAt
      ? a.job.startsAt.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "Not scheduled",
  }));

  const links: LinkOption[] = [
    ...pickerJobs.map((j) => ({
      id: `job:${j.id}`,
      rid: j.id,
      kind: "job" as const,
      title: j.title,
      client: j.client?.name ?? "No client",
      status: j.status.toLowerCase(),
      meta: [j.client?.city, durLabel(j.startsAt, j.endsAt)].filter(Boolean).join(" · "),
    })),
    ...pickerProposals.map((p) => ({
      id: `prop:${p.id}`,
      rid: p.id,
      kind: "proposal" as const,
      title: p.title,
      client: p.client?.name ?? "No client",
      status: p.status.toLowerCase(),
      meta: [p.client?.city, money(p.total)].filter(Boolean).join(" · "),
    })),
    ...pickerLeads.map((l) => ({
      id: `lead:${l.id}`,
      rid: l.id,
      kind: "lead" as const,
      title: l.name,
      client: l.name,
      status: l.status.toLowerCase(),
      meta: [l.city, l.projectType].filter(Boolean).join(" · ") || "Lead",
    })),
    ...pickerClients.map((c) => ({
      id: `client:${c.id}`,
      rid: c.id,
      kind: "client" as const,
      title: c.name,
      client: c.name,
      status: "active",
      meta: clientAddr(c) ?? "Client",
    })),
  ];

  const seed: CalendarSeed = {
    today: new Date().toISOString(),
    events: [...jobEvents, ...appointmentEvents, ...blockedEvents],
    workers,
    tray,
    inbox,
    links,
    createKinds,
    canManage,
  };

  return <CalendarContent seed={seed} />;
}
