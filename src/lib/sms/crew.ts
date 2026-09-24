// THE CREW'S TEXTS (2026-09-24) — server only.
//
// A worker with a phone and the "text their schedule" switch hears about
// the things that change their day, and nothing else:
//   - put on a job or an appointment (with the link to confirm),
//   - the job moved to another day or time,
//   - the job cancelled,
//   - the evening "tomorrow" list at 6 PM and the morning "today" list at
//     7 AM, company time, only when there is something on it.
// The words are in ./format; the sending rules (STOP, caps, quiet hours)
// in ./send. Everything here is best-effort and never throws into the
// action that scheduled the work.

import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { zonedParts } from "@/lib/booking";
import { atLocalHour } from "@/lib/servicePlans";
import { crewAssignedText, crewCancelledText, crewDigestText, crewMovedText, dayLabel, type CrewSlot } from "./format";
import { flushHeldTexts, textWorker } from "./send";

const DIGEST_EVENING_HOUR = 18;
const DIGEST_MORNING_HOUR = 7;

type Crew = { organizationId: string; phone: string | null; smsOptIn: boolean; token: string };
export type CrewSnapshot = { orgName: string | null; tz: string; slot: CrewSlot; workers: Crew[] };

function log(what: string, err: unknown) {
  console.error(`[sms/crew] ${what}: ${err instanceof Error ? err.message : String(err)}`);
}

async function linkFor(token: string): Promise<string> {
  return `${await appBaseUrl()}/w/${token}`;
}

// ── job assignments ───────────────────────────────────────────────────────

/** "You're on <job>" — the job's own date, or its next crew event. */
export async function textAssignmentCreated(assignmentId: string): Promise<void> {
  try {
    const a = await db.jobAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        worker: { select: { organizationId: true, phone: true, smsOptIn: true, token: true } },
        job: {
          select: {
            title: true,
            startsAt: true,
            endsAt: true,
            client: { select: { address: true } },
            proposal: { select: { address: true } },
            organization: { select: { name: true, timezone: true } },
            events: { orderBy: { startsAt: "asc" }, take: 1, where: { startsAt: { gte: new Date(Date.now() - 86_400_000) } }, select: { startsAt: true, endsAt: true } },
          },
        },
      },
    });
    if (!a || !a.worker.phone || !a.worker.smsOptIn) return;
    const when = a.job.events[0] ?? (a.job.startsAt ? { startsAt: a.job.startsAt, endsAt: a.job.endsAt } : null);
    const tz = a.job.organization.timezone || "America/New_York";
    const slot: CrewSlot = { title: a.job.title, startsAt: when?.startsAt ?? new Date(), endsAt: when?.endsAt ?? null, address: a.job.client?.address ?? a.job.proposal?.address ?? null };
    const body = when
      ? crewAssignedText(a.job.organization.name, slot, await linkFor(a.worker.token), tz)
      : crewAssignedText(a.job.organization.name, { ...slot, startsAt: new Date() }, await linkFor(a.worker.token), tz).replace(/ \w{3} \w{3} \d{1,2}, [^.]*\./, ", date to follow.");
    await textWorker(a.worker, body, "crew-assigned");
  } catch (err) {
    log("assignment", err);
  }
}

// ── appointments ──────────────────────────────────────────────────────────

export async function crewOfAppointment(appointmentId: string, workerIds?: string[]): Promise<CrewSnapshot | null> {
  const apt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      title: true,
      startsAt: true,
      endsAt: true,
      client: { select: { address: true } },
      lead: { select: { address: true } },
      organization: { select: { name: true, timezone: true } },
      assignments: { select: { worker: { select: { id: true, organizationId: true, phone: true, smsOptIn: true, token: true } } } },
    },
  });
  if (!apt) return null;
  const workers = apt.assignments.map((x) => x.worker).filter((w) => !workerIds || workerIds.includes(w.id));
  return {
    orgName: apt.organization.name,
    tz: apt.organization.timezone || "America/New_York",
    slot: { title: apt.title, startsAt: apt.startsAt, endsAt: apt.endsAt, address: apt.client?.address ?? apt.lead?.address ?? null },
    workers,
  };
}

export async function textAppointmentAssigned(appointmentId: string, workerIds: string[]): Promise<void> {
  try {
    const snap = await crewOfAppointment(appointmentId, workerIds);
    if (!snap) return;
    for (const w of snap.workers) await textWorker(w, crewAssignedText(snap.orgName, snap.slot, await linkFor(w.token), snap.tz), "crew-assigned");
  } catch (err) {
    log("appointment assigned", err);
  }
}

export async function textAppointmentMoved(appointmentId: string): Promise<void> {
  try {
    const snap = await crewOfAppointment(appointmentId);
    if (!snap) return;
    for (const w of snap.workers) await textWorker(w, crewMovedText(snap.orgName, snap.slot, await linkFor(w.token), snap.tz), "crew-moved");
  } catch (err) {
    log("appointment moved", err);
  }
}

/** Called with a snapshot taken BEFORE the row was deleted. */
export async function textCrewCancelled(snap: CrewSnapshot | null): Promise<void> {
  if (!snap) return;
  try {
    for (const w of snap.workers) await textWorker(w, crewCancelledText(snap.orgName, snap.slot, snap.tz), "crew-cancelled");
  } catch (err) {
    log("cancelled", err);
  }
}

// ── crew events on the job calendar ───────────────────────────────────────

export async function crewOfJobEvent(eventId: string): Promise<CrewSnapshot | null> {
  const ev = await db.jobEvent.findUnique({
    where: { id: eventId },
    select: {
      title: true,
      startsAt: true,
      endsAt: true,
      organization: { select: { name: true, timezone: true } },
      job: {
        select: {
          client: { select: { address: true } },
          proposal: { select: { address: true } },
          assignments: { select: { worker: { select: { organizationId: true, phone: true, smsOptIn: true, token: true } } } },
        },
      },
    },
  });
  if (!ev) return null;
  return {
    orgName: ev.organization.name,
    tz: ev.organization.timezone || "America/New_York",
    slot: { title: ev.title, startsAt: ev.startsAt, endsAt: ev.endsAt, address: ev.job?.client?.address ?? ev.job?.proposal?.address ?? null },
    workers: ev.job?.assignments.map((x) => x.worker) ?? [],
  };
}

export async function textJobEventMoved(eventId: string): Promise<void> {
  try {
    const snap = await crewOfJobEvent(eventId);
    if (!snap) return;
    for (const w of snap.workers) await textWorker(w, crewMovedText(snap.orgName, snap.slot, await linkFor(w.token), snap.tz), "crew-moved");
  } catch (err) {
    log("event moved", err);
  }
}

// ── the evening and morning lists ─────────────────────────────────────────

async function slotsFor(workerId: string, from: Date, to: Date): Promise<CrewSlot[]> {
  const [apts, events] = await Promise.all([
    db.appointmentAssignment.findMany({
      where: { workerId, appointment: { startsAt: { gte: from, lt: to }, status: { not: "CANCELED" } } },
      select: { appointment: { select: { title: true, startsAt: true, endsAt: true, client: { select: { address: true } }, lead: { select: { address: true } } } } },
    }),
    db.jobEvent.findMany({
      where: { startsAt: { gte: from, lt: to }, job: { assignments: { some: { workerId } } } },
      select: { title: true, startsAt: true, endsAt: true, job: { select: { client: { select: { address: true } }, proposal: { select: { address: true } } } } },
    }),
  ]);
  return [
    ...apts.map((x) => ({ title: x.appointment.title, startsAt: x.appointment.startsAt, endsAt: x.appointment.endsAt, address: x.appointment.client?.address ?? x.appointment.lead?.address ?? null })),
    ...events.map((e) => ({ title: e.title, startsAt: e.startsAt, endsAt: e.endsAt, address: e.job?.client?.address ?? e.job?.proposal?.address ?? null })),
  ];
}

/**
 * The hourly tick: held office texts go out once their quiet window ends,
 * and every company's opted-in crew gets tomorrow's list at 6 PM and
 * today's at 7 AM, company time. Said once per worker per day.
 */
export async function runCrewTexts(now = new Date()): Promise<{ flushed: number; digests: number }> {
  const flushed = await flushHeldTexts(now).catch((err) => {
    log("flush", err);
    return 0;
  });
  let digests = 0;
  const workers = await db.workerProfile.findMany({
    where: { smsOptIn: true, phone: { not: null } },
    select: { id: true, organizationId: true, phone: true, smsOptIn: true, token: true, organization: { select: { name: true, timezone: true } } },
  });
  for (const w of workers) {
    try {
      const tz = w.organization.timezone || "America/New_York";
      const local = zonedParts(now, tz);
      const which = local.h === DIGEST_EVENING_HOUR ? "tomorrow" : local.h === DIGEST_MORNING_HOUR ? "today" : null;
      if (!which) continue;
      const dayStart = atLocalHour(new Date(now.getTime() + (which === "tomorrow" ? 86_400_000 : 0) + (local.h >= 12 ? 0 : 0)), 0, tz);
      // atLocalHour keys on the UTC date; take the local calendar day instead.
      const localDay = new Date(Date.UTC(local.y, local.m - 1, local.d + (which === "tomorrow" ? 1 : 0)));
      const from = atLocalHour(localDay, 0, tz);
      const to = new Date(from.getTime() + 86_400_000);
      void dayStart;
      const kind = `crew-digest-${which}-${localDay.toISOString().slice(0, 10)}`;
      const said = await db.smsMessage.findFirst({ where: { to: w.phone!, kind, direction: "OUT" }, select: { id: true } });
      if (said) continue;
      const slots = await slotsFor(w.id, from, to);
      if (!slots.length) continue;
      const body = crewDigestText(w.organization.name, which, slots, await linkFor(w.token), tz);
      const r = await textWorker(w, body, kind);
      if (r?.ok) digests++;
    } catch (err) {
      log(`digest for worker ${w.id}`, err);
    }
  }
  return { flushed, digests };
}

/** "Tue Oct 7" for a worker-responded line. */
export function whenLabel(d: Date | null | undefined, tz: string): string | null {
  return d ? dayLabel(d, tz) : null;
}
