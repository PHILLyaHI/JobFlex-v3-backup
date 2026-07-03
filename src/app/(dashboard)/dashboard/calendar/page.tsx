import { requireOrg, isWorkerRole, isSalesRole } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { expandRules } from "@/lib/availability";
import { viewerTimeZone } from "@/lib/viewerTz";
// The live /dashboard/calendar page now renders the v3 calendar-a orchestrator
// (frontend-design build). The same component also serves /v3/calendar-a so
// both routes stay in sync via src/components/v3/calendar-a/*.
import { CalendarViewA as CalendarView } from "@/app/v3/(dashboard)/calendar-a/calendar-view-a";
import { MobileCalendar } from "./mobile-calendar";

export default async function CalendarPage() {
  const { organizationId, role, user } = await requireOrg();
  // The month cursor lives client-side (Zustand), so the server can't scope the
  // fetch to the visible month — it must cover everywhere the user can navigate.
  // 45 days back made any older event invisible (created fine, never rendered).
  const from = new Date();
  from.setDate(from.getDate() - 400);
  const to = new Date();
  to.setDate(to.getDate() + 400);

  // ── Field-worker calendar: read-only, scoped to the worker's own job events
  // and the appointments they're staffed on. No dispatch tray, inbox, or pickers.
  if (isWorkerRole(role)) {
    const wp = await db.workerProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    const workerId = wp?.id ?? "__none__";
    // Their own recurring rules — the one thing a worker manages from here.
    const [myRules, myExceptions, workerOrg] = await Promise.all([
      db.unavailabilityRule.findMany({
        where: { organizationId, ownerId: user.id, active: true },
        orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
      }),
      db.unavailabilityException.findMany({
        where: { rule: { organizationId, ownerId: user.id } },
      }),
      db.organization.findUnique({
        where: { id: organizationId },
        select: { timezone: true },
      }),
    ]);
    const [events, myAppointments, myJobs, orgWorkers] = await Promise.all([
      db.jobEvent.findMany({
        where: {
          organizationId,
          startsAt: { gte: from, lte: to },
          job: { assignments: { some: { workerId } } },
        },
        orderBy: { startsAt: "asc" },
        include: {
          job: {
            select: {
              status: true,
              client: { select: { name: true, phone: true, address: true, city: true, state: true } },
              proposal: { select: { scopeOfWork: true } },
              assignments: { select: { workerId: true } },
            },
          },
        },
      }),
      // Appointments the worker is staffed on (AppointmentAssignment).
      db.appointment.findMany({
        where: {
          organizationId,
          startsAt: { gte: from, lte: to },
          assignments: { some: { workerId } },
        },
        orderBy: { startsAt: "asc" },
        include: {
          lead: { select: { name: true } },
          client: { select: { name: true, phone: true, address: true, city: true, state: true } },
          proposal: { select: { title: true } },
          assignments: { select: { workerId: true } },
        },
      }),
      // Jobs they're assigned to — the only jobs they can attach a new event to.
      db.job.findMany({
        where: { organizationId, assignments: { some: { workerId } } },
        orderBy: { createdAt: "desc" },
        include: { client: { select: { name: true } } },
        take: 80,
      }),
      // Name lookup so events can say who's staffed on them.
      db.workerProfile.findMany({
        where: { organizationId },
        select: { id: true, displayName: true },
      }),
    ]);
    const nameByWorkerId = new Map(orgWorkers.map((w) => [w.id, w.displayName]));
    const namesFor = (ids: { workerId: string }[] | undefined) =>
      (ids ?? [])
        .map((a) => nameByWorkerId.get(a.workerId))
        .filter((n): n is string => Boolean(n));
    const workerEvents = events.map((e) => ({
      id: e.id,
      kind: "job" as const,
      jobId: e.jobId,
      leadId: null,
      title: e.title,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      status: e.job?.status ?? "SCHEDULED",
      notes: e.notes,
      workerIds: e.job?.assignments.map((a) => a.workerId) ?? [],
      assigneeNames: namesFor(e.job?.assignments),
      clientName: e.job?.client?.name ?? null,
      clientPhone: e.job?.client?.phone ?? null,
      clientAddress: clientAddr(e.job?.client),
      scopeOfWork: scopeOnly(e.job?.proposal?.scopeOfWork),
    }));
    const workerAppointments = myAppointments.map((a) => ({
      id: `apt:${a.id}`,
      kind: "appointment" as const,
      jobId: null,
      leadId: a.leadId,
      title: a.title,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt.toISOString(),
      status: a.status,
      notes: a.notes,
      workerIds: [] as string[],
      assigneeNames: namesFor(a.assignments),
      clientName: a.lead?.name ?? a.client?.name ?? a.proposal?.title ?? null,
      clientPhone: a.client?.phone ?? null,
      clientAddress: clientAddr(a.client),
      scopeOfWork: null as string | null,
    }));
    // Show the worker's own recurring unavailability as blocked-style events
    // so creating a rule has visible effect on their week/month grids. Overnight
    // occurrences (10pm→8am) are split at midnight into per-day segments so each
    // renders cleanly on its own day rather than as a two-day span.
    const workerTz = await viewerTimeZone(workerOrg?.timezone);
    const myUnavailEvents = expandRules(myRules, myExceptions, from, to, workerTz).flatMap((iv) =>
      splitByDay(iv.start, iv.end).map((seg, i) => ({
        id: `unav:${iv.ruleId}:${iv.dateKey}:${i}`,
        kind: "blocked" as const,
        jobId: null,
        leadId: null,
        title: iv.label,
        startsAt: seg.start.toISOString(),
        endsAt: seg.end.toISOString(),
        status: "SCHEDULED",
        notes: null as string | null,
        workerIds: [] as string[],
        clientName: null,
      })),
    );
    const allWorkerEvents = [...workerEvents, ...workerAppointments, ...myUnavailEvents];
    return (
      <>
        <div className="md:hidden">
          <MobileCalendar events={allWorkerEvents} workers={[]} pendingAssignments={[]} />
        </div>
        <div className="hidden md:block">
          <CalendarView
            events={allWorkerEvents}
            unscheduledJobs={[]}
            workers={[]}
            // Their assigned jobs — the only jobs they can attach an event to.
            pickerJobs={myJobs.map((j) => ({
              id: j.id,
              title: j.title,
              status: j.status,
              clientName: j.client?.name ?? null,
            }))}
            pickerLeads={[]}
            pickerProposals={[]}
            pickerClients={[]}
            pickerWorkers={[]}
            pendingAssignments={[]}
            unavailabilityRules={myRules.map((r) => ({
              id: r.id,
              dayOfWeek: r.dayOfWeek,
              startMinute: r.startMinute,
              endMinute: r.endMinute,
              reason: r.reason,
              ownerId: r.ownerId,
              ownerName: "You",
            }))}
            selfUserId={user.id}
            readOnly
            // Create-only: can add a job event on one of their jobs, but not
            // edit/reschedule/dispatch (those stay manager-only).
            allowCreate
            createKinds={["job"]}
            canManageJobs={false}
          />
        </div>
      </>
    );
  }

  // ── Sales-rep calendar: writable, but scoped to their slice. Appointments
  // they created or are staffed on (Appointment.createdById), their own +
  // org-wide blocked time, and their own recurring unavailability. Job events
  // and dispatch (tray, inbox, team view) are delivery concerns and stay with
  // managers.
  if (isSalesRole(role)) {
    const wp = await db.workerProfile.findUnique({
      where: { userId: user.id },
      select: { id: true, displayName: true },
    });
    const workerId = wp?.id ?? "__none__";
    const [myJobEvents, myAppointments, myBlocked, myLeads, myProposals, myClients, salesOrg, myRules, myExceptions, orgWorkers] =
      await Promise.all([
        // Jobs they can see: assigned to them, or spun off a proposal they own
        // ("that he created"). Read-only here — they can't manage job events.
        db.jobEvent.findMany({
          where: {
            organizationId,
            startsAt: { gte: from, lte: to },
            job: {
              OR: [{ assignments: { some: { workerId } } }, { proposal: { ownerId: user.id } }],
            },
          },
          orderBy: { startsAt: "asc" },
          include: {
            job: {
              select: {
                status: true,
                client: { select: { name: true, phone: true, address: true, city: true, state: true } },
                proposal: { select: { scopeOfWork: true } },
                assignments: { select: { workerId: true } },
              },
            },
          },
        }),
        db.appointment.findMany({
          where: {
            organizationId,
            startsAt: { gte: from, lte: to },
            OR: [{ assignments: { some: { workerId } } }, { createdById: user.id }],
          },
          orderBy: { startsAt: "asc" },
          include: {
            lead: { select: { name: true, projectType: true } },
            client: { select: { name: true } },
            proposal: { select: { title: true } },
            assignments: { select: { workerId: true } },
          },
        }),
        db.blockedTime.findMany({
          where: {
            organizationId,
            startsAt: { gte: from, lte: to },
            OR: [{ ownerId: user.id }, { ownerId: null }],
          },
          orderBy: { startsAt: "asc" },
        }),
        db.lead.findMany({
          where: {
            organizationId,
            status: { in: ["NEW", "ROUTED", "CLAIMED", "CONTACTED", "QUOTED"] },
            OR: [{ assignedToId: user.id }, { claimedById: user.id }, { status: "NEW" }],
          },
          orderBy: { createdAt: "desc" },
          take: 60,
        }),
        db.proposal.findMany({
          where: { organizationId, ownerId: user.id },
          orderBy: { createdAt: "desc" },
          include: {
            client: { select: { name: true } },
            jobs: { select: { id: true }, take: 1 },
          },
          take: 60,
        }),
        db.client.findMany({
          where: { organizationId, deletedAt: null },
          orderBy: { updatedAt: "desc" },
          select: { id: true, name: true, email: true },
          take: 100,
        }),
        db.organization.findUnique({
          where: { id: organizationId },
          select: { timezone: true },
        }),
        db.unavailabilityRule.findMany({
          where: { organizationId, ownerId: user.id, active: true },
          orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
        }),
        db.unavailabilityException.findMany({
          where: { rule: { organizationId, ownerId: user.id } },
        }),
        // Name lookup so events can say who's staffed on them.
        db.workerProfile.findMany({
          where: { organizationId },
          select: { id: true, displayName: true },
        }),
      ]);

    const nameByWorkerId = new Map(orgWorkers.map((w) => [w.id, w.displayName]));
    const namesFor = (ids: { workerId: string }[] | undefined) =>
      (ids ?? [])
        .map((a) => nameByWorkerId.get(a.workerId))
        .filter((n): n is string => Boolean(n));
    const salesJobEvents = myJobEvents.map((e) => ({
      id: e.id,
      kind: "job" as const,
      jobId: e.jobId,
      leadId: null,
      title: e.title,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      status: e.job?.status ?? "SCHEDULED",
      notes: e.notes,
      workerIds: e.job?.assignments.map((a) => a.workerId) ?? [],
      assigneeNames: namesFor(e.job?.assignments),
      clientName: e.job?.client?.name ?? null,
      clientPhone: e.job?.client?.phone ?? null,
      clientAddress: clientAddr(e.job?.client),
      scopeOfWork: scopeOnly(e.job?.proposal?.scopeOfWork),
    }));
    const salesAppointments = myAppointments.map((a) => ({
      id: `apt:${a.id}`,
      kind: "appointment" as const,
      jobId: null,
      leadId: a.leadId,
      title: a.title,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt.toISOString(),
      status: a.status,
      notes: a.notes,
      workerIds: a.assignments.map((x) => x.workerId),
      assigneeNames: namesFor(a.assignments),
      clientName: a.lead?.name ?? a.client?.name ?? a.proposal?.title ?? null,
    }));
    const salesBlocked = myBlocked.map((b) => ({
      id: `block:${b.id}`,
      kind: "blocked" as const,
      jobId: null,
      leadId: null,
      title: b.reason,
      startsAt: b.startsAt.toISOString(),
      endsAt: b.endsAt.toISOString(),
      status: "SCHEDULED",
      notes: null as string | null,
      workerIds: [] as string[],
      clientName: null,
    }));
    // Own recurring unavailability rendered as blocked-style events (same
    // treatment as the worker view) so rules have visible effect on the grid.
    const salesTz = await viewerTimeZone(salesOrg?.timezone);
    const salesUnavailEvents = expandRules(myRules, myExceptions, from, to, salesTz).flatMap(
      (iv) =>
        splitByDay(iv.start, iv.end).map((seg, i) => ({
          id: `unav:${iv.ruleId}:${iv.dateKey}:${i}`,
          kind: "blocked" as const,
          jobId: null,
          leadId: null,
          title: iv.label,
          startsAt: seg.start.toISOString(),
          endsAt: seg.end.toISOString(),
          status: "SCHEDULED",
          notes: null as string | null,
          workerIds: [] as string[],
          clientName: null,
        })),
    );
    const salesEvents = [...salesJobEvents, ...salesAppointments, ...salesBlocked, ...salesUnavailEvents];
    const salesRules = myRules.map((r) => ({
      id: r.id,
      dayOfWeek: r.dayOfWeek,
      startMinute: r.startMinute,
      endMinute: r.endMinute,
      reason: r.reason,
      ownerId: r.ownerId,
      ownerName: "You",
    }));
    return (
      <>
        <div className="md:hidden">
          <MobileCalendar events={salesEvents} workers={[]} pendingAssignments={[]} />
        </div>
        <div className="hidden md:block">
          <CalendarView
            events={salesEvents}
            unscheduledJobs={[]}
            workers={[]}
            pickerJobs={[]}
            pickerLeads={myLeads.map((l) => ({
              id: l.id,
              name: l.name,
              email: l.email,
              projectType: l.projectType,
              aiCategory: l.aiCategory,
              status: l.status,
            }))}
            pickerProposals={myProposals.map((p) => ({
              id: p.id,
              title: p.title,
              status: p.status,
              clientName: p.client?.name ?? null,
              hasJob: p.jobs.length > 0,
            }))}
            pickerClients={myClients.map((c) => ({
              id: c.id,
              name: c.name,
              email: c.email,
            }))}
            unavailabilityRules={salesRules}
            unavailabilityPeople={[{ userId: user.id, name: "You" }]}
            selfUserId={user.id}
            // They can staff appointments — but only with themselves.
            pickerWorkers={wp ? [{ id: wp.id, name: wp.displayName, specialties: [] }] : []}
            pendingAssignments={[]}
            hideTeam
            // Appointment-only creation; job events are visible but read-only.
            createKinds={["appointment"]}
            canManageJobs={false}
          />
        </div>
      </>
    );
  }

  const [
    events,
    appointments,
    blockedTimes,
    unscheduledJobs,
    workers,
    allJobs,
    leads,
    proposalsList,
    clientsList,
    memberships,
    org,
    unavailRules,
    unavailExceptions,
    pendingAssignments,
  ] = await Promise.all([
    db.jobEvent.findMany({
      where: { organizationId, startsAt: { gte: from, lte: to } },
      orderBy: { startsAt: "asc" },
      include: {
        job: {
          select: {
            status: true,
            client: { select: { name: true, phone: true, address: true, city: true, state: true } },
            proposal: { select: { scopeOfWork: true } },
            assignments: { select: { workerId: true } },
          },
        },
      },
    }),
    db.appointment.findMany({
      where: { organizationId, startsAt: { gte: from, lte: to } },
      orderBy: { startsAt: "asc" },
      include: {
        lead: { select: { name: true, projectType: true } },
        client: { select: { name: true } },
        proposal: { select: { title: true } },
        assignments: { select: { workerId: true } },
      },
    }),
    db.blockedTime.findMany({
      where: { organizationId, startsAt: { gte: from, lte: to } },
      orderBy: { startsAt: "asc" },
    }),
    db.job.findMany({
      where: {
        organizationId,
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        events: { none: {} },
      },
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { name: true, address: true } },
        proposal: { select: { total: true } },
      },
      take: 30,
    }),
    db.workerProfile.findMany({
      // Declined invites are excluded everywhere else (plan limits, getTeamBusy)
      // — keep the pickers and team rows consistent with that.
      where: { organizationId, inviteStatus: { not: "DECLINED" } },
      include: {
        assignments: {
          where: { job: { status: { in: ["SCHEDULED", "IN_PROGRESS"] } } },
          select: { id: true },
        },
      },
      orderBy: { displayName: "asc" },
    }),
    db.job.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: { client: { select: { name: true } } },
      take: 80,
    }),
    db.lead.findMany({
      where: {
        organizationId,
        status: { in: ["NEW", "ROUTED", "CLAIMED", "CONTACTED", "QUOTED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    db.proposal.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { name: true } },
        jobs: { select: { id: true }, take: 1 },
      },
      take: 60,
    }),
    db.client.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, email: true },
      take: 100,
    }),
    db.membership.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    db.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    }),
    db.unavailabilityRule.findMany({
      where: { organizationId, active: true },
      include: { owner: { select: { name: true, email: true } } },
      orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
    }),
    db.unavailabilityException.findMany({
      where: { rule: { organizationId } },
    }),
    db.jobAssignment.findMany({
      where: {
        status: "PENDING",
        job: { organizationId },
      },
      include: {
        worker: { include: { user: { select: { email: true } } } },
        job: { select: { id: true, title: true, startsAt: true } },
      },
      orderBy: { assignedAt: "desc" },
      take: 50,
    }),
  ]);

  // Names for the "who's on it" line on chips + the detail sheet.
  const nameByWorkerId = new Map(workers.map((w) => [w.id, w.displayName]));
  const namesFor = (ids: { workerId: string }[] | undefined) =>
    (ids ?? [])
      .map((a) => nameByWorkerId.get(a.workerId))
      .filter((n): n is string => Boolean(n));

  const jobEventsRaw = events.map((e) => ({
    id: e.id,
    kind: "job" as const,
    jobId: e.jobId,
    leadId: null,
    title: e.title,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    status: e.job?.status ?? "SCHEDULED",
    notes: e.notes,
    workerIds: e.job?.assignments.map((a) => a.workerId) ?? [],
    assigneeNames: namesFor(e.job?.assignments),
    clientName: e.job?.client?.name ?? null,
    clientPhone: e.job?.client?.phone ?? null,
    clientAddress: clientAddr(e.job?.client),
    scopeOfWork: scopeOnly(e.job?.proposal?.scopeOfWork),
  }));

  // Row-key domain for the team view: an invited worker is their
  // WorkerProfile.id; anyone else (owner / managers) is `u:<userId>`.
  const workerIdByUserId = new Map(workers.map((w) => [w.userId, w.id]));
  const rowKeyForUser = (userId: string) => workerIdByUserId.get(userId) ?? `u:${userId}`;

  const appointmentsRaw = appointments.map((a) => ({
    id: `apt:${a.id}`,
    kind: "appointment" as const,
    jobId: null,
    leadId: a.leadId,
    title: a.title,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    status: a.status,
    notes: a.notes,
    workerIds: a.assignments.map((x) => x.workerId),
    assigneeNames: namesFor(a.assignments),
    clientName: a.lead?.name ?? a.client?.name ?? a.proposal?.title ?? null,
  }));

  const blockedRaw = blockedTimes.map((b) => ({
    id: `block:${b.id}`,
    kind: "blocked" as const,
    jobId: null,
    leadId: null,
    title: b.reason,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    status: "SCHEDULED",
    notes: null as string | null,
    // Personal blocks land on the owner's team-view row; org-wide blocks
    // (no owner) stay on the unassigned row.
    workerIds: b.ownerId ? [rowKeyForUser(b.ownerId)] : ([] as string[]),
    clientName: null,
  }));

  // Team view lists only actual workers (WorkerProfiles). Office members /
  // owner without a worker profile are intentionally NOT shown — jobs can only
  // be assigned to workers, so those rows added nothing but clutter.

  // Weekly rules expanded to concrete busy windows inside the visible range,
  // minus any per-instance "freed" exceptions. fullDay/timeLabel come straight
  // from the rule's minute bounds (timezone-independent) so the team view can
  // mirror the month view: whole day → full wash, part of the day → striped card.
  const tz = await viewerTimeZone(org?.timezone);
  const ruleById = new Map(unavailRules.map((r) => [r.id, r]));
  const unavailability = expandRules(unavailRules, unavailExceptions, from, to, tz).map((iv) => {
    const rule = ruleById.get(iv.ruleId!)!;
    const fullDay = rule.startMinute <= 0 && rule.endMinute >= 1440;
    return {
      personKey: rowKeyForUser(rule.ownerId),
      startsAt: iv.start.toISOString(),
      endsAt: iv.end.toISOString(),
      dateKey: iv.dateKey!,
      reason: iv.label,
      ruleId: iv.ruleId,
      fullDay,
      timeLabel: fullDay ? null : `${minLabel(rule.startMinute)}–${minLabel(rule.endMinute)}`,
    };
  });

  const mobileEvents = [...jobEventsRaw, ...appointmentsRaw, ...blockedRaw];
  const mobileWorkers = workers.map((w) => ({ id: w.id, name: w.displayName }));
  const mobilePending = pendingAssignments.map((a) => ({
    id: a.id,
    workerName: a.worker.displayName,
    jobTitle: a.job.title,
    jobStartsAt: a.job.startsAt,
  }));

  return (
    <>
      <div className="md:hidden">
        <MobileCalendar
          events={mobileEvents}
          workers={mobileWorkers}
          pendingAssignments={mobilePending}
        />
      </div>
      <div className="hidden md:block">
    <CalendarView
      events={[...jobEventsRaw, ...appointmentsRaw, ...blockedRaw]}
      unscheduledJobs={unscheduledJobs.map((j) => ({
        id: j.id,
        title: j.title,
        status: j.status,
        clientName: j.client?.name ?? null,
        clientAddress: j.client?.address ?? null,
        proposalTotal: j.proposal?.total ?? null,
      }))}
      workers={workers.map((w) => ({
        id: w.id,
        name: w.displayName,
        activeJobs: w.assignments.length,
      }))}
      pickerJobs={allJobs.map((j) => ({
        id: j.id,
        title: j.title,
        status: j.status,
        clientName: j.client?.name ?? null,
      }))}
      pickerLeads={leads.map((l) => ({
        id: l.id,
        name: l.name,
        email: l.email,
        projectType: l.projectType,
        aiCategory: l.aiCategory,
        status: l.status,
      }))}
      pickerProposals={proposalsList.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        clientName: p.client?.name ?? null,
        hasJob: p.jobs.length > 0,
      }))}
      pickerClients={clientsList.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
      }))}
      unavailability={unavailability}
      unavailabilityRules={unavailRules.map((r) => ({
        id: r.id,
        dayOfWeek: r.dayOfWeek,
        startMinute: r.startMinute,
        endMinute: r.endMinute,
        reason: r.reason,
        ownerId: r.ownerId,
        ownerName: r.owner.name ?? r.owner.email,
      }))}
      unavailabilityPeople={memberships.map((m) => ({
        userId: m.userId,
        name: m.user.name ?? m.user.email,
      }))}
      selfUserId={user.id}
      pickerWorkers={workers.map((w) => ({
        id: w.id,
        name: w.displayName,
        specialties: parseSpec(w.specialties),
      }))}
      pendingAssignments={pendingAssignments.map((a) => ({
        id: a.id,
        workerName: a.worker.displayName,
        workerEmail: a.worker.user?.email ?? null,
        jobId: a.job.id,
        jobTitle: a.job.title,
        jobStartsAt: a.job.startsAt,
        status: a.status,
        assignedAt: a.assignedAt,
        pingedAt: a.pingedAt,
      }))}
    />
      </div>
    </>
  );
}

// The AI estimate appends an "Assumptions:" block onto Proposal.scopeOfWork when
// it becomes a proposal. On the calendar we want the scope only, so cut from
// that heading onward (the proposal detail still shows the full text).
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

// Split an interval into per-calendar-day segments so an overnight block renders
// as one chip per day it touches (22:00–24:00, then 00:00–08:00) instead of a
// single two-day span. Ends each segment at 23:59:59.999 to stay single-day.
function splitByDay(start: Date, end: Date): { start: Date; end: Date }[] {
  const out: { start: Date; end: Date }[] = [];
  let cur = new Date(start);
  while (cur < end) {
    const midnight = new Date(cur);
    midnight.setHours(24, 0, 0, 0); // next local midnight
    const segEnd = end < midnight ? new Date(end) : new Date(midnight.getTime() - 1);
    out.push({ start: new Date(cur), end: segEnd });
    cur = midnight;
  }
  return out.length ? out : [{ start, end }];
}

function minLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h < 12 ? "a" : "p";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hh}${ampm}` : `${hh}:${String(m).padStart(2, "0")}${ampm}`;
}

function parseSpec(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
