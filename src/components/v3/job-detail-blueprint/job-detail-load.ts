// JOB DETAIL / BLUEPRINT — the server read.
//
// This is the file that turns the page from a design preview into a record.
// Both editions (desktop ./job-detail-content.tsx and handheld
// ../mobile-job-detail/mobile-job-detail.tsx) render whatever this returns, so
// they cannot describe two different jobs.
//
// THE QUERY IS THE ARCHIVED CLASSIC PAGE'S, in intent and in scope: the same
// `job.findUnique` with client / proposal / events / assignments / photos /
// expenses / changeOrders, the same `organizationId` check afterwards, and the
// same org-wide WorkerProfile roster for the assign control. Nothing new is
// read and nothing here writes — every mutation on this surface goes through
// the server actions that already existed (jobs.ts, workers.ts, jobMedia.ts,
// changeOrders.ts).
//
// DATES ARE FORMATTED HERE, ON THE SERVER, and travel as strings — see the
// header of ./job-detail-data.ts for why. The formatters are hand-rolled for
// the same reason the sibling client-detail loader hand-rolls its own: Intl
// depends on the runtime's ICU build, and the drawing style wants its own
// terse "Aug 11 → Aug 14, 2026".

import { db } from "@/lib/db";
import { isOwnerOrManager, isWorkerRole } from "@/lib/orgContext";
import {
  STATUS_TO_KEY,
  type JdAssignState,
  type JdBooking,
  type JdChange,
  type JdCrew,
  type JdEvent,
  type JdExpense,
  type JdPhoto,
  type JdWorkerOption,
  type JobDetailRecord,
} from "./job-detail-data";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "Aug 11" */
function day(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
/** "Aug 11, 2026" */
function dayYear(d: Date): string {
  return `${day(d)}, ${d.getFullYear()}`;
}
/** "7:00 AM" */
function clock(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Page head: the job's own span. */
function headDates(startsAt: Date | null, endsAt: Date | null): string {
  if (!startsAt && !endsAt) return "Unscheduled";
  if (startsAt && endsAt && !sameDay(startsAt, endsAt)) {
    return `${day(startsAt)} → ${dayYear(endsAt)}`;
  }
  const only = (startsAt ?? endsAt)!;
  return dayYear(only);
}

/** Overview's Dates cell — the same span, terser ("Aug 11 → 14"). */
function fieldDates(startsAt: Date | null, endsAt: Date | null): string {
  if (!startsAt && !endsAt) return "—";
  if (startsAt && endsAt && !sameDay(startsAt, endsAt)) {
    const tail =
      startsAt.getMonth() === endsAt.getMonth() ? String(endsAt.getDate()) : day(endsAt);
    return `${day(startsAt)} → ${tail}`;
  }
  return day((startsAt ?? endsAt)!);
}

/** WorkerProfile.specialties is a JSON array in a TEXT column. */
function firstSpecialty(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) && typeof v[0] === "string" && v[0].trim() ? v[0].trim() : null;
  } catch {
    return null;
  }
}

/** A dialable href, or null when the digits don't make a number. */
function telHref(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.length >= 7 ? `tel:${digits}` : null;
}

/**
 * The window "Add to schedule" books.
 *
 * The job's OWN start is the honest default — that is the date the office
 * already agreed — but only while it is still ahead: booking a crew into last
 * month is never what the button means. Anything else falls back to tomorrow
 * 9:00–2:00, which is the span `scheduleJobFromTray` has always used for a job
 * dropped on the calendar with no time of its own.
 */
function bookingWindow(startsAt: Date | null, endsAt: Date | null): JdBooking {
  const now = new Date();
  let start: Date;
  let end: Date;
  if (startsAt && startsAt.getTime() > now.getTime()) {
    start = new Date(startsAt);
    end =
      endsAt && endsAt.getTime() > start.getTime()
        ? new Date(endsAt)
        : new Date(start.getTime() + 4 * 60 * 60 * 1000);
  } else {
    start = new Date(now);
    start.setDate(start.getDate() + 1);
    start.setHours(9, 0, 0, 0);
    end = new Date(start);
    end.setHours(14, 0, 0, 0);
  }
  const span = sameDay(start, end)
    ? `${day(start)} · ${clock(start)} – ${clock(end)}`
    : `${day(start)} ${clock(start)} → ${day(end)} ${clock(end)}`;
  return { startsAtISO: start.toISOString(), endsAtISO: end.toISOString(), label: span };
}

/** One event's date line — "Aug 11 · 7:00 AM". */
function eventWhen(startsAt: Date): string {
  return `${day(startsAt)} · ${clock(startsAt)}`;
}

/** Its second line: the author's note if there is one, else the span. */
function eventMeta(startsAt: Date, endsAt: Date, notes: string | null): string | null {
  const trimmed = notes?.trim();
  if (trimmed) return trimmed;
  return sameDay(startsAt, endsAt)
    ? `until ${clock(endsAt)}`
    : `until ${day(endsAt)} · ${clock(endsAt)}`;
}

const ASSIGNMENT_STATE: Record<string, JdCrew["state"]> = {
  ACCEPTED: "ok",
  COMPLETED: "ok",
  PENDING: "wait",
  DECLINED: "no",
};

/** The reader's OWN assignment, which keeps COMPLETED apart from ACCEPTED —
 *  see the note on `JdAssignState`. */
const OWN_ASSIGNMENT_STATE: Record<string, JdAssignState> = {
  ACCEPTED: "ok",
  COMPLETED: "done",
  PENDING: "wait",
  DECLINED: "no",
};

function directionsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/**
 * A Google Calendar "add event" template for the job's own span. Ends four
 * hours after the start when the job has no end, which is the same default
 * length `bookingWindow` above falls back to.
 */
function calendarUrl(
  title: string,
  start: Date,
  end: Date | null,
  location: string | null,
): string {
  const stamp = (d: Date) =>
    new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const finish = end ?? new Date(new Date(start).getTime() + 4 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${stamp(start)}/${stamp(finish)}`,
    ...(location ? { location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

const CHANGE_STATE: Record<string, JdChange["state"]> = {
  DRAFT: "draft",
  SENT: "sent",
  APPROVED: "ok",
  DECLINED: "no",
};

/**
 * The job behind `[id]`, scoped to the caller's org, shaped for the page.
 * Returns null when the id resolves to nothing this org owns — the page turns
 * that into a 404 rather than inventing a job, which is the whole point of
 * deleting the fixture.
 *
 * A field worker takes ../job-detail-load.ts's OTHER read (below): a narrower
 * query, assignment-scoped, with the money columns never selected. One entry
 * point so the page cannot pick the wrong one, and `userId` is required to take
 * that branch — no user, no assignment, no record.
 */
export async function loadJobDetail(
  id: string,
  organizationId: string,
  role: string,
  userId?: string,
): Promise<JobDetailRecord | null> {
  if (isWorkerRole(role)) {
    return userId ? loadWorkerScoped(id, organizationId, userId) : null;
  }
  const job = await db.job.findUnique({
    where: { id },
    include: {
      client: true,
      proposal: { select: { id: true, title: true, total: true } },
      events: { orderBy: { startsAt: "asc" } },
      assignments: {
        include: {
          worker: {
            select: { id: true, displayName: true, phone: true, specialties: true },
          },
        },
        orderBy: { assignedAt: "asc" },
      },
      photos: { orderBy: { createdAt: "desc" } },
      expenses: { orderBy: { createdAt: "desc" } },
      changeOrders: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!job || job.organizationId !== organizationId) return null;

  // The assign control's candidates: the org's roster minus whoever is already
  // on this job. A worker who DECLINED the org invite is not on the team, so
  // they are not offered either.
  const assignedIds = new Set(job.assignments.map((a) => a.workerId));
  const roster: JdWorkerOption[] = (
    await db.workerProfile.findMany({
      where: { organizationId, inviteStatus: { not: "DECLINED" } },
      select: { id: true, displayName: true, phone: true, specialties: true },
      orderBy: { displayName: "asc" },
    })
  )
    .filter((w) => !assignedIds.has(w.id))
    .map((w) => ({
      id: w.id,
      name: w.displayName,
      meta: [firstSpecialty(w.specialties), w.phone].filter(Boolean).join(" · ") || null,
    }));

  const events: JdEvent[] = job.events.map((e) => ({
    id: e.id,
    title: e.title,
    when: eventWhen(e.startsAt),
    meta: eventMeta(e.startsAt, e.endsAt, e.notes),
  }));

  const crew: JdCrew[] = job.assignments.map((a) => ({
    assignmentId: a.id,
    workerId: a.workerId,
    name: a.worker.displayName,
    meta:
      [firstSpecialty(a.worker.specialties) ?? "Crew", a.worker.phone]
        .filter(Boolean)
        .join(" · ") || "Crew",
    state: ASSIGNMENT_STATE[a.status] ?? "wait",
    // The office is not on the crew list; nothing to mark.
    me: false,
  }));

  const changes: JdChange[] = job.changeOrders.map((c, i) => ({
    id: c.id,
    ref: `CO-${i + 1}`,
    title: c.title,
    meta: c.description?.trim() || `logged ${day(c.createdAt)}`,
    amount: c.amount,
    state: CHANGE_STATE[c.status] ?? "draft",
    publicToken: c.publicToken,
  }));

  const photos: JdPhoto[] = job.photos.map((p) => ({
    id: p.id,
    url: p.url,
    kind: p.kind ? p.kind.charAt(0) + p.kind.slice(1).toLowerCase() : "Photo",
    caption: p.caption?.trim() || `Added ${day(p.createdAt)}`,
  }));

  const expenses: JdExpense[] = job.expenses.map((e) => ({
    id: e.id,
    vendor: e.category,
    meta: e.note?.trim() || `logged ${day(e.createdAt)}`,
    amount: e.amount,
  }));

  const addressLine =
    [job.client?.address, job.client?.city, job.client?.state, job.client?.zip]
      .filter(Boolean)
      .join(", ")
      .trim() || null;

  return {
    id: job.id,
    title: job.title,
    status: STATUS_TO_KEY[job.status] ?? "sch",
    dates: headDates(job.startsAt, job.endsAt),
    fieldDates: fieldDates(job.startsAt, job.endsAt),
    clientName: job.client?.name ?? null,
    scopeOfWork: job.scopeOfWork?.trim() || null,
    notes: job.notes?.trim() || null,
    contact: job.client
      ? {
          name: job.client.name,
          phone: job.client.phone,
          phoneHref: telHref(job.client.phone),
          email: job.client.email,
          address: addressLine,
        }
      : null,
    // `Job.proposalId` decides the whole proposal section. The include above
    // resolves it to a row; a dangling id (proposal deleted) reads as no
    // proposal, which is the honest answer — there is nothing to open.
    proposal: job.proposal
      ? { id: job.proposal.id, title: job.proposal.title, total: job.proposal.total }
      : null,
    // Both worker-edition affordances. The office record is unchanged: it has
    // "Add to schedule", which books the CREW, and a desk.
    directionsUrl: null,
    calendarUrl: null,
    events,
    crew,
    changes,
    photos,
    expenses,
    roster,
    booking: bookingWindow(job.startsAt, job.endsAt),
    canWrite: isOwnerOrManager(role),
    canPhotos: isOwnerOrManager(role),
    viewer: "manager",
    assignment: null,
  };
}

/**
 * THE FIELD WORKER'S READ — the same `JobDetailRecord`, narrower.
 *
 * ── THE ACCESS RULE IS THE WHERE CLAUSE ────────────────────────────────────
 * The job is found by `{ id, organizationId, assignments: { some: { workerId } } }`,
 * so a worker can never open a job they are not on: the rule cannot be dropped
 * by a later edit the way a check written after the query can. No WorkerProfile
 * for this user is the same answer as no job — null, which the page turns into
 * a 404. That is also the honest answer for a job that exists but belongs to
 * someone else's crew: a 403 would confirm it exists.
 *
 * ── WHAT IS NOT SELECTED IS THE DISCLOSURE RULE ────────────────────────────
 * No expenses, no change orders, no proposal, no roster, and a client reduced
 * to name + address — the columns the pre-blueprint worker view read, exactly.
 * The withholding is done HERE rather than in the markup: a record that never
 * carried the number cannot leak it through a component someone edits later.
 */
async function loadWorkerScoped(
  id: string,
  organizationId: string,
  userId: string,
): Promise<JobDetailRecord | null> {
  const wp = await db.workerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!wp) return null;

  const job = await db.job.findFirst({
    where: { id, organizationId, assignments: { some: { workerId: wp.id } } },
    include: {
      // Name and address only — see the header's disclosure note.
      client: { select: { name: true, address: true, city: true, state: true, zip: true } },
      events: { orderBy: { startsAt: "asc" } },
      photos: { orderBy: { createdAt: "desc" } },
      assignments: {
        // Specialty, not phone: a crewmate's number is the office's to give
        // out, and the pre-blueprint view never printed one.
        include: { worker: { select: { displayName: true, specialties: true } } },
        orderBy: { assignedAt: "asc" },
      },
    },
  });
  if (!job) return null;

  const addressLine =
    [job.client?.address, job.client?.city, job.client?.state, job.client?.zip]
      .filter(Boolean)
      .join(", ")
      .trim() || null;

  const events: JdEvent[] = job.events.map((e) => ({
    id: e.id,
    title: e.title,
    when: eventWhen(e.startsAt),
    meta: eventMeta(e.startsAt, e.endsAt, e.notes),
  }));

  const crew: JdCrew[] = job.assignments.map((a) => ({
    assignmentId: a.id,
    workerId: a.workerId,
    name: a.worker.displayName,
    meta: firstSpecialty(a.worker.specialties) ?? "Crew",
    state: ASSIGNMENT_STATE[a.status] ?? "wait",
    me: a.workerId === wp.id,
  }));

  const photos: JdPhoto[] = job.photos.map((p) => ({
    id: p.id,
    url: p.url,
    kind: p.kind ? p.kind.charAt(0) + p.kind.slice(1).toLowerCase() : "Photo",
    caption: p.caption?.trim() || `Added ${day(p.createdAt)}`,
  }));

  // The WHERE clause guarantees one, but `find` is still typed as optional.
  const own = job.assignments.find((a) => a.workerId === wp.id)?.status ?? "PENDING";

  return {
    id: job.id,
    title: job.title,
    status: STATUS_TO_KEY[job.status] ?? "sch",
    dates: headDates(job.startsAt, job.endsAt),
    fieldDates: fieldDates(job.startsAt, job.endsAt),
    clientName: job.client?.name ?? null,
    scopeOfWork: job.scopeOfWork?.trim() || null,
    notes: job.notes?.trim() || null,
    contact: job.client
      ? {
          name: job.client.name,
          phone: null,
          phoneHref: null,
          email: null,
          address: addressLine,
        }
      : null,
    proposal: null,
    directionsUrl: addressLine ? directionsUrl(addressLine) : null,
    calendarUrl: job.startsAt
      ? calendarUrl(job.title, job.startsAt, job.endsAt, addressLine)
      : null,
    events,
    crew,
    changes: [],
    photos,
    expenses: [],
    roster: [],
    // Never read — `canWrite` is false, so nothing on this edition books
    // anything — but the shape is the shape.
    booking: bookingWindow(job.startsAt, job.endsAt),
    canWrite: false,
    // A worker only reaches this loader through their own assignment, and the
    // crew documents the work: photos are theirs to add (upload re-checks the
    // assignment server-side).
    canPhotos: true,
    viewer: "worker",
    assignment: OWN_ASSIGNMENT_STATE[own] ?? "wait",
  };
}
