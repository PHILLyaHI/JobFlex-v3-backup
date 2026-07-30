// Jobs blueprint — the donor's embedded demo data, hardcoded exactly as
// authored in jobflex-jobs-blueprint.html (JOBS: ДАННЫЕ block). Same shape as
// proposals-data.ts: the port keeps the donor's fixture so the page renders
// identically; wiring it to Prisma is a separate, out-of-scope decision.
//
// JobRow: title, status, clientName, startsAt, endsAt, crew, notes.

export type JobStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";

export type JobTab = { key: "ALL" | JobStatus; label: string };

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

export const PAGE_SIZE = 20;
