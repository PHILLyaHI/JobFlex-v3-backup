import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { CalendarView } from "./calendar-view";

export default async function CalendarPage() {
  const { organizationId } = await requireOrg();
  const from = new Date();
  from.setDate(from.getDate() - 45);
  const to = new Date();
  to.setDate(to.getDate() + 180);

  const [
    events,
    appointments,
    blockedTimes,
    unscheduledJobs,
    workers,
    allJobs,
    leads,
    pendingAssignments,
  ] = await Promise.all([
    db.jobEvent.findMany({
      where: { organizationId, startsAt: { gte: from, lte: to } },
      orderBy: { startsAt: "asc" },
      include: {
        job: {
          select: {
            status: true,
            client: { select: { name: true } },
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
      where: { organizationId },
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
    clientName: e.job?.client?.name ?? null,
  }));

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
    workerIds: [],
    clientName: a.lead?.name ?? null,
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
    workerIds: [] as string[],
    clientName: null,
  }));

  return (
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
  );
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
