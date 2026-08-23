// Mobile jobs (mobile-jobs-v2) — row shape, status vocabulary and the date
// formatters the board renders with.
//
// This file used to be the donor demo fixture and nothing else. The board is
// now READ FROM THE DATABASE by ./jobs-board.ts (the desktop jobs page's query,
// org-scoped through requireOrg) and written through the real job server
// actions, so the fixture is gone rather than kept as a fallback: a handheld
// board that quietly shows fourteen invented jobs is worse than one that says
// it could not load.
//
// DATES. Rows carry a plain "YYYY-MM-DD" calendar day, not a display string —
// the same contract the desktop rows use. The server has to hand over something
// the client can re-derive "today" / "in 2 days" from, and the old hardcoded
// ", 2026" suffix stripping only ever worked in its own demo year.

export type JobStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";

/** The desktop page's five status tabs, re-used as the filter's five options. */
export type StatusFilter = "ALL" | JobStatus;

/** One JobAssignment row. The `id` is what `unassignWorker` takes (it wants the
 *  ASSIGNMENT, not the worker), so the mapping ships with the row rather than
 *  being looked up again at click time. */
export type JobCrewAssignment = { id: string; workerId: string; name: string };

/** JobAssignment.status, as the board sees it. */
export type MyAssignmentStatus = "PENDING" | "ACCEPTED" | "DECLINED";

export type Job = {
  id: string;
  title: string;
  /** Display name of the linked client, or null when the job has none. */
  client: string | null;
  clientId: string | null;
  status: JobStatus;
  /** "YYYY-MM-DD", or null when unscheduled. */
  start: string | null;
  /** "YYYY-MM-DD", or null for a single-day job. */
  end: string | null;
  /** Display names of the assigned crew — derived from `assignments`. */
  crew: string[];
  assignments: JobCrewAssignment[];
  /** Where the work is: the client's address if there is one, else the tail of
   *  the title after the em dash. Feeds the sheet's "Get directions". */
  site: string;
  /** Title of the linked proposal, or null. */
  proposal: string | null;
  /** LIMITED roles only: the caller's OWN assignment status on this job. A
   *  PENDING row prints "Not accepted yet" instead of the job status, DECLINED
   *  prints "Declined". Null for office roles. */
  myAssignment: MyAssignmentStatus | null;
  /** Office roles only: how many of this job's assignments are still PENDING —
   *  drives the small "awaiting crew" hint next to the status badge. */
  pendingCrew: number;
};

/** A client the create sheet can attach the new job to. */
export type JobClientOption = { id: string; name: string };
/** A worker the create sheet and the crew sheet can staff a job with. */
export type JobCrewOption = { id: string; name: string };
/** A proposal the create sheet can link the new job to. */
export type JobProposalOption = { id: string; title: string; clientId: string | null };

/** Everything one mount of the handheld board needs, in a single round trip. */
export type JobsBoard = {
  jobs: Job[];
  clients: JobClientOption[];
  crew: JobCrewOption[];
  proposals: JobProposalOption[];
  /** Owner/manager. Staffing and status writes are `requireManager` actions, so
   *  the rows that call them are disabled for everyone else rather than offered
   *  and then refused by the server. */
  canManage: boolean;
  /** LIMITED role (installer/sales/estimator). Mounts the Offers button +
   *  bottom sheet in the page head and lets the rows headline the caller's
   *  own answer. */
  isWorker: boolean;
};

export const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CANCELED", label: "Canceled" },
];

/** Not completed and not canceled — the masthead's primary numeral. */
export const OPEN_STATUSES: JobStatus[] = ["SCHEDULED", "IN_PROGRESS"];

/**
 * The desktop sheet pages 20 at a time. A handheld row is three lines tall, so
 * 8 — the same reasoning that took the clients book from 12 to 8 and the
 * proposals ledger from 8 to 6.
 */
export const PAGE_SIZE = 8;

/** "IN_PROGRESS" → "In progress". The desktop helper, verbatim. */
export function statusLabel(s: JobStatus): string {
  return s.charAt(0) + s.slice(1).toLowerCase().replace("_", " ");
}

/**
 * Two letters, so a page of rows is scannable: "M. Henderson" → MH,
 * "Marcus B." → MB, a single word → its first two letters. Punctuation is
 * stripped first, which is what keeps the "M." initial from becoming ".".
 */
export function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z ]/g, " ").split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Parsed field by field on purpose: `new Date("2026-07-30")` is read as UTC
 *  midnight and renders as the previous day in every negative-offset timezone.
 *  The desktop helper, verbatim. */
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

/** "2026-07-30" → "Jul 30". The year is dropped when it is the current one: on
 *  a 320px meta line it carries no information (DESIGN.md — text that adds
 *  nothing to what is already visible should not exist), and a job dated some
 *  other year has to say so. */
function shortDay(v: string | null | undefined): string | null {
  const d = parseDay(v);
  if (!d) return null;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/**
 * "Jul 22" for a single day, "Jul 24 – Jul 25" for a range, null when the job
 * is unscheduled. One helper for both the row and the sheet, so the two can
 * never drift.
 */
export function scheduleLabel(j: Pick<Job, "start" | "end">): string | null {
  const a = shortDay(j.start);
  if (!a) return null;
  if (!j.end || j.end === j.start) return a;
  return `${a} – ${shortDay(j.end) ?? ""}`.trim();
}

/** The relative plate, in the donor's own vocabulary:
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
    if (days < 7) return `in ${days} days`;
    if (days < 14) return "in 1 week";
    return `in ${Math.round(days / 7)} weeks`;
  }
  const ago = -days;
  if (ago < 7) return `${ago}d ago`;
  if (ago < 14) return "1w ago";
  return `${Math.round(ago / 7)}w ago`;
}

/**
 * The address / neighbourhood taken from the part of the title after the em
 * dash — the shape a jobs board is usually titled in ("<work> — <where>"). Only
 * the fallback now: a real record carries its client's address, which the
 * server read prefers (see jobs-board.ts).
 */
export function siteOf(title: string): string {
  const i = title.indexOf("—");
  return i === -1 ? title : title.slice(i + 1).trim();
}

export function matchesStatus(j: Job, f: StatusFilter): boolean {
  return f === "ALL" ? true : j.status === f;
}

/** Job, client, site and crew all answer the search box. */
export function matchesQuery(j: Job, query: string): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    j.title.toLowerCase().includes(q) ||
    (j.client ?? "").toLowerCase().includes(q) ||
    j.site.toLowerCase().includes(q) ||
    statusLabel(j.status).toLowerCase().includes(q) ||
    j.crew.join(" ").toLowerCase().includes(q)
  );
}

export function statusCount(list: Job[], f: StatusFilter): number {
  return list.filter((j) => matchesStatus(j, f)).length;
}
