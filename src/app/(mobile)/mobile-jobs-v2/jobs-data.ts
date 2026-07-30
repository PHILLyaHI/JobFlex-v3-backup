// Mobile jobs (mobile-jobs-v2) — demo fixture.
//
// Carried over VERBATIM from the desktop jobs donor fixture
// (src/components/v3/jobs-blueprint/jobs-data.ts): same 14 records, same ids,
// titles, clients, statuses, dates, `rel` vocabulary and crews, so the handheld
// composition is judged against the same board as the desktop sheet.
// Seattle-area contractor texture — Maple Ave / Fern St / Alder Ct / Mill Creek
// / Redmond / Sammamish / Kirkland, and diverse client names.
//
// Every STATE the surface can render is reachable in this fixture:
//  · all four statuses (in progress ×1, scheduled ×9, completed ×3, canceled ×1)
//  · three UNSCHEDULED jobs with no crew (j8, j9, j14) — that is what makes the
//    row card's em-dash crew cell and its "Unscheduled" meta reachable
//  · one job with NO CLIENT (j14) — that is what makes the row sheet's disabled
//    "Message client" row reachable
//  · a multi-day range (j4, j7, j12) and a single-day job (j1, j10)
//  · a 3-person crew (j4) so the crew stack's overflow "+N" is reachable at a
//    2-pip cap
//
// This is a design surface: the data layer is out of scope, so nothing here
// touches Prisma or a server action. The array is mutated at runtime (mark
// completed / delete / create), so the component clones this seed per mount.

export type JobStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";

/** The desktop page's five status tabs, re-used as the filter's five options. */
export type StatusFilter = "ALL" | JobStatus;

export type Job = {
  id: string;
  title: string;
  client: string | null;
  status: JobStatus;
  start: string | null;
  end: string | null;
  rel: string | null;
  crew: string[];
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

export const JOBS_SEED: Job[] = [
  { id: 'j1',  title: 'Roof tear-off — 4812 Maple Ave',   client: 'M. Henderson', status: 'IN_PROGRESS', start: 'Jul 22, 2026', end: 'Jul 22, 2026', rel: 'today',      crew: ['Marcus B.', 'Dan K.'] },
  { id: 'j2',  title: 'Dumpster swap — Maple Ave',        client: 'M. Henderson', status: 'SCHEDULED',   start: 'Jul 22, 2026', end: null,            rel: 'today',      crew: ['Dan K.'] },
  { id: 'j3',  title: 'Fence repair — 1409 Fern St',      client: 'K. Nguyen',    status: 'SCHEDULED',   start: 'Jul 23, 2026', end: null,            rel: 'in 1 day',   crew: ['Marcus B.'] },
  { id: 'j4',  title: 'Asphalt reroof — Henderson',       client: 'M. Henderson', status: 'SCHEDULED',   start: 'Jul 24, 2026', end: 'Jul 25, 2026',  rel: 'in 2 days',  crew: ['Marcus B.', 'Dan K.', 'Ivan'] },
  { id: 'j5',  title: 'Cedar fence — 902 Alder Ct',       client: 'D. Reyes',     status: 'SCHEDULED',   start: 'Jul 25, 2026', end: null,            rel: 'in 3 days',  crew: ['Marcus B.'] },
  { id: 'j6',  title: 'Skylight install — 210 Fir St',    client: 'K. Marsh',     status: 'SCHEDULED',   start: 'Jul 28, 2026', end: null,            rel: 'in 6 days',  crew: ['Dan K.'] },
  { id: 'j7',  title: 'Siding patch — Mill Creek',        client: 'S. Patel',     status: 'SCHEDULED',   start: 'Jul 30, 2026', end: 'Jul 31, 2026',  rel: 'in 1 week',  crew: ['Marcus B.', 'Dan K.'] },
  { id: 'j8',  title: 'Gutter replacement — Redmond',     client: 'R. Okafor',    status: 'SCHEDULED',   start: null,           end: null,            rel: null,         crew: [] },
  { id: 'j9',  title: 'Pergola build — Sammamish',        client: 'L. Wong',      status: 'SCHEDULED',   start: null,           end: null,            rel: null,         crew: [] },
  { id: 'j10', title: 'Deck power wash — 55 Cedar Loop',  client: 'R. Tran',      status: 'COMPLETED',   start: 'Jul 20, 2026', end: 'Jul 20, 2026',  rel: '2d ago',     crew: ['Dan K.'] },
  { id: 'j11', title: 'Gutter guards — Redmond',          client: 'D. Pham',      status: 'COMPLETED',   start: 'Jul 17, 2026', end: null,            rel: '5d ago',     crew: ['Marcus B.'] },
  { id: 'j12', title: 'Cedar privacy fence — Kirkland',   client: 'K. Sorensen',  status: 'COMPLETED',   start: 'Jul 05, 2026', end: 'Jul 08, 2026',  rel: '2w ago',     crew: ['Marcus B.', 'Sofia R.'] },
  { id: 'j13', title: 'Punch list — Cypress Ln',          client: 'C. Ferreira',  status: 'CANCELED',    start: 'Jul 14, 2026', end: null,            rel: '1w ago',     crew: ['Marcus B.'] },
  { id: 'j14', title: 'Roof inspection — Bothell',        client: null,           status: 'SCHEDULED',   start: null,           end: null,            rel: null,         crew: [] },
];

/**
 * The desktop sheet pages 20 at a time (so its pager never appears on this
 * fixture). A handheld row is three lines tall, so 8 — the same reasoning that
 * took the clients book from 12 to 8 and the proposals ledger from 8 to 6. It
 * also makes the pager a real, reachable control here.
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

/**
 * "Jul 22" for a single day, "Jul 24 – Jul 25" for a range, null when the job
 * is unscheduled. The year is dropped: every record is 2026, so it carries no
 * information on a 320px meta line (design-system.md — text that adds nothing
 * to what is already visible should not exist). One helper for both the row and
 * the sheet, so the two can never drift.
 */
export function scheduleLabel(j: Job): string | null {
  if (!j.start) return null;
  const from = j.start.replace(", 2026", "");
  if (!j.end || j.end === j.start) return from;
  return `${from} – ${j.end.replace(", 2026", "")}`;
}

/**
 * The address / neighbourhood, taken from the part of the title after the
 * em dash — every record on this board is titled "<work> — <where>", which is
 * what lets the row sheet offer directions and the search box answer a city.
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
    siteOf(j.title).toLowerCase().includes(q) ||
    statusLabel(j.status).toLowerCase().includes(q) ||
    j.crew.join(" ").toLowerCase().includes(q)
  );
}

export function statusCount(list: Job[], f: StatusFilter): number {
  return list.filter((j) => matchesStatus(j, f)).length;
}
