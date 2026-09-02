// Jobs blueprint — row shape, status vocabulary and the date formatters the
// table renders with.
//
// This used to be the donor's embedded demo array and nothing else. The page is
// now read from the database (src/app/dashboard/jobs/page.tsx) and writes
// through the real job server actions, so the fixture below survives only as
// the fallback for a mount with no options (the standalone mock routes have no
// session to read from) — exactly the same arrangement Workers uses.
//
// DATES. Rows carry a plain "YYYY-MM-DD" calendar day, not a display string:
// the server has to hand over something the client can re-derive "today" /
// "in 2 days" from, and the donor's hardcoded ", 2026" suffix stripping only
// ever worked in its own demo year. `longDate` / `rangeLabel` / `relLabel`
// turn that day back into the donor's exact plates.

export type JobStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";

export type JobTab = { key: "ALL" | JobStatus; label: string };

/** One live JobAssignment row. `crew` below is what the table PRINTS; this is
 *  what the row menu's crew editor WRITES with — `assignWorker` takes the
 *  worker profile id, `unassignAssignment` takes the assignment id, so a
 *  toggle needs both and neither can be derived from a display name. */
export type JobAssignmentRef = { id: string; workerId: string };

/** JobAssignment.status, as the board sees it. */
export type MyAssignmentStatus = "PENDING" | "ACCEPTED" | "DECLINED";

export type Job = {
  id: string;
  title: string;
  /** Display name of the linked client, or null when the job has none. */
  client: string | null;
  status: JobStatus;
  /** "YYYY-MM-DD", or null when unscheduled. */
  start: string | null;
  /** "YYYY-MM-DD", or null for a single-day job. */
  end: string | null;
  /** Display names of the assigned crew. */
  crew: string[];
  /** The same crew as ids. Absent on the fixture rows (mock routes make no
   *  writes); the live board always carries it, in `crew` order. */
  assignments?: JobAssignmentRef[];
  /** LIMITED roles only: the caller's OWN assignment status on this job. A
   *  PENDING row prints "Not accepted yet" instead of the job status, DECLINED
   *  prints "Declined" — the worker's answer is the row's headline until it is
   *  given. Null/absent for managers and on the fixture. */
  myAssignment?: MyAssignmentStatus | null;
  /** Managers only: how many of this job's assignments are still PENDING —
   *  drives the small "awaiting crew" hint next to the status plate. */
  pendingCrew?: number;
};

/** A client the create dialog can attach the new job to. */
export type JobClientOption = { id: string; name: string };

/** A worker the create dialog can staff the new job with. */
export type JobCrewOption = { id: string; name: string };

/** A proposal the create dialog can attach the new job to (`Job.proposalId`).
 *  Optional on every job — a job created with none simply has none. */
export type JobProposalOption = {
  id: string;
  title: string;
  /** Client on the proposal, so picking one can carry its client across. */
  clientId: string | null;
  client: string | null;
  /** Raw status ("DRAFT" / "SENT" / "ACCEPTED" …) — the picker's annotation. */
  status: string;
  total: number;
};

/** "$12,400" — the picker's money plate. Whole dollars: the annotation line is
 *  a glance, not an invoice. */
export function money(n: number): string {
  return "$" + Math.round(n || 0).toLocaleString("en-US");
}

export const JOB_TABS: JobTab[] = [
  { key: "ALL", label: "All" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CANCELED", label: "Canceled" },
];

export const ACCENT: Record<JobStatus, string> = {
  SCHEDULED: "var(--blueprint)",
  IN_PROGRESS: "var(--warning)",
  COMPLETED: "var(--success)",
  CANCELED: "var(--danger)",
};

/** Parsed field by field on purpose: `new Date("2026-07-30")` is read as UTC
 *  midnight and renders as the previous day in every negative-offset timezone. */
export function parseDay(v: string | null | undefined): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** The inverse of `parseDay` — a Date to the calendar day it falls on locally. */
export function toDay(d: Date | null | undefined): string | null {
  if (!d) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

/** "2026-07-30" → "Jul 30, 2026" — the donor's display plate. */
export function longDate(v: string | null | undefined): string | null {
  const d = parseDay(v);
  return d
    ? d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })
    : null;
}

/** The Schedule column's headline: one day, or a span with the year said once. */
export function rangeLabel(j: Pick<Job, "start" | "end">): string | null {
  const a = longDate(j.start);
  if (!a) return null;
  if (!j.end || j.end === j.start) return a;
  const b = longDate(j.end);
  if (!b) return a;
  const sameYear = (j.start || "").slice(0, 4) === j.end.slice(0, 4);
  return (sameYear ? a.replace(/,\s*\d{4}$/, "") : a) + " – " + b;
}

/** The relative line under it, in the donor's own vocabulary:
 *  today / in 1 day / in 2 days / in 1 week / 2d ago / 2w ago. */
export function relLabel(v: string | null | undefined): string | null {
  const d = parseDay(v);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days === 0) return "today";
  if (days > 0) {
    if (days === 1) return "in 1 day";
    if (days < 7) return "in " + days + " days";
    if (days < 14) return "in 1 week";
    return "in " + Math.round(days / 7) + " weeks";
  }
  const ago = -days;
  if (ago < 7) return ago + "d ago";
  if (ago < 14) return "1w ago";
  return Math.round(ago / 7) + "w ago";
}

/** Fallback roster for a mount with no server data (mock routes only). */
export const JOBS_SEED: Job[] = [
  { id: 'j1',  title: 'Roof tear-off — 4812 Maple Ave',   client: 'M. Henderson', status: 'IN_PROGRESS', start: '2026-07-22', end: '2026-07-22', crew: ['Marcus B.', 'Dan K.'] },
  { id: 'j2',  title: 'Dumpster swap — Maple Ave',        client: 'M. Henderson', status: 'SCHEDULED',   start: '2026-07-22', end: null,         crew: ['Dan K.'] },
  { id: 'j3',  title: 'Fence repair — 1409 Fern St',      client: 'K. Nguyen',    status: 'SCHEDULED',   start: '2026-07-23', end: null,         crew: ['Marcus B.'] },
  { id: 'j4',  title: 'Asphalt reroof — Henderson',       client: 'M. Henderson', status: 'SCHEDULED',   start: '2026-07-24', end: '2026-07-25', crew: ['Marcus B.', 'Dan K.', 'Ivan'] },
  { id: 'j5',  title: 'Cedar fence — 902 Alder Ct',       client: 'D. Reyes',     status: 'SCHEDULED',   start: '2026-07-25', end: null,         crew: ['Marcus B.'] },
  { id: 'j6',  title: 'Skylight install — 210 Fir St',    client: 'K. Marsh',     status: 'SCHEDULED',   start: '2026-07-28', end: null,         crew: ['Dan K.'] },
  { id: 'j7',  title: 'Siding patch — Mill Creek',        client: 'S. Patel',     status: 'SCHEDULED',   start: '2026-07-30', end: '2026-07-31', crew: ['Marcus B.', 'Dan K.'] },
  { id: 'j8',  title: 'Gutter replacement — Redmond',     client: 'R. Okafor',    status: 'SCHEDULED',   start: null,         end: null,         crew: [] },
  { id: 'j9',  title: 'Pergola build — Sammamish',        client: 'L. Wong',      status: 'SCHEDULED',   start: null,         end: null,         crew: [] },
  { id: 'j10', title: 'Deck power wash — 55 Cedar Loop',  client: 'R. Tran',      status: 'COMPLETED',   start: '2026-07-20', end: '2026-07-20', crew: ['Dan K.'] },
  { id: 'j11', title: 'Gutter guards — Redmond',          client: 'D. Pham',      status: 'COMPLETED',   start: '2026-07-17', end: null,         crew: ['Marcus B.'] },
  { id: 'j12', title: 'Cedar privacy fence — Kirkland',   client: 'K. Sorensen',  status: 'COMPLETED',   start: '2026-07-05', end: '2026-07-08', crew: ['Marcus B.', 'Sofia R.'] },
  { id: 'j13', title: 'Punch list — Cypress Ln',          client: 'C. Ferreira',  status: 'CANCELED',    start: '2026-07-14', end: null,         crew: ['Marcus B.'] },
  { id: 'j14', title: 'Roof inspection — Bothell',        client: null,           status: 'SCHEDULED',   start: null,         end: null,         crew: [] },
];

export const PAGE_SIZE = 20;
