// Calendar blueprint — demo data, hardcoded exactly as the donor's <script>
// declares it (jobflex-calendar-blueprint_5.html). Every id, title, date,
// status, phone number and address is verbatim; nothing is derived, sorted or
// reformatted here. The behavior module clones these seeds per mount so the
// runtime mutations (drag-to-reschedule, create, delete, confirm) start from
// the same state on every navigation.

export type CalKind = "job" | "appointment" | "blocked";

export type CalEvent = {
  id: string;
  kind: CalKind;
  title: string;
  start: Date;
  end: Date;
  status: string;
  workers: string[];
  client?: string;
  phone?: string;
  addr?: string;
  scope?: string;
  notes?: string;
  /** Blocked time created with no crew picked — the block belongs to the owner. */
  selfOnly?: boolean;
  /** Spans whole days: rendered in the week's all-day band, never in the time grid. */
  allDay?: boolean;
};

export type CalWorker = { id: string; name: string; role: string };
export type TrayJob = { id: string; title: string; client: string; city: string; duration: string };
export type InboxItem = { id: string; title: string; worker: string; when: string };
export type JobStatus = { value: string; label: string };

/** Wednesday, 22 July 2026 — the donor's frozen "today". */
export const TODAY = new Date(2026, 6, 22);

export const JOB_STATUSES: JobStatus[] = [
  { value: "SCHEDULED", label: "Scheduled" }, { value: "IN_PROGRESS", label: "In progress" },
  { value: "COMPLETED", label: "Completed" }, { value: "CANCELED", label: "Canceled" },
];

export const workersData: CalWorker[] = [
  { id: "w1", name: "Marcus B.", role: "Lead installer" },
  { id: "w2", name: "Sofia R.",  role: "Estimator" },
  { id: "w3", name: "Dan K.",    role: "Installer" },
  { id: "w4", name: "Ivan",      role: "Owner" },
];

function iso(y: number, m: number, d: number, h: number, min?: number) {
  return new Date(y, m, d, h, min || 0);
}

/** Event = jobEvent | appointment | blocked (CalendarEvent from EventChip). */
export const EVENTS_SEED: CalEvent[] = [
  { id: 'e1',  kind: 'job',         title: 'Roof tear-off — 4812 Maple Ave', start: iso(2026, 6, 22, 7, 0),  end: iso(2026, 6, 22, 15, 0), status: 'IN_PROGRESS', workers: ['w1', 'w3'], client: 'M. Henderson', phone: '(425) 555-0132', addr: '4812 Maple Ave, Bothell', scope: 'Tear off two layers, install synthetic underlayment and architectural shingles.', notes: 'Dumpster drops at 7:00.' },
  { id: 'e2',  kind: 'appointment', title: 'Estimate visit — S. Rao',        start: iso(2026, 6, 22, 16, 0), end: iso(2026, 6, 22, 17, 0), status: 'SCHEDULED',   workers: ['w2'], client: 'S. Rao', phone: '(425) 555-0116', addr: 'Sammamish, WA', notes: 'Corner lot, wants privacy panels.' },
  { id: 'e3',  kind: 'job',         title: 'Dumpster swap — Maple Ave',      start: iso(2026, 6, 22, 13, 0), end: iso(2026, 6, 22, 14, 0), status: 'SCHEDULED',   workers: ['w3'], client: 'M. Henderson', addr: '4812 Maple Ave, Bothell' },
  { id: 'e4',  kind: 'job',         title: 'Fence repair — 1409 Fern St',    start: iso(2026, 6, 23, 8, 0),  end: iso(2026, 6, 23, 12, 0), status: 'SCHEDULED',   workers: ['w1'], client: 'K. Nguyen', phone: '(425) 555-0170', addr: '1409 Fern St, Bothell' },
  { id: 'e5',  kind: 'blocked',     title: 'Shop maintenance',               start: iso(2026, 6, 23, 15, 0), end: iso(2026, 6, 23, 17, 0), status: 'SCHEDULED',   workers: ['w3'] },
  { id: 'e6',  kind: 'job',         title: 'Asphalt reroof — Henderson',     start: iso(2026, 6, 24, 7, 0),  end: iso(2026, 6, 24, 16, 0), status: 'SCHEDULED',   workers: ['w1', 'w3'], client: 'M. Henderson', addr: '4812 Maple Ave, Bothell' },
  { id: 'e7',  kind: 'appointment', title: 'Walkthrough — A. Kim',           start: iso(2026, 6, 24, 11, 0), end: iso(2026, 6, 24, 12, 0), status: 'SCHEDULED',   workers: ['w2'], client: 'A. Kim', addr: 'Bellevue, WA' },
  { id: 'e8',  kind: 'job',         title: 'Cedar fence — 902 Alder Ct',     start: iso(2026, 6, 25, 8, 0),  end: iso(2026, 6, 25, 17, 0), status: 'SCHEDULED',   workers: ['w1'], client: 'D. Reyes', phone: '(425) 555-0148', addr: '902 Alder Ct, Kirkland' },
  { id: 'e9',  kind: 'job',         title: 'Deck power wash — 55 Cedar Loop', start: iso(2026, 6, 20, 9, 0), end: iso(2026, 6, 20, 13, 0), status: 'COMPLETED',   workers: ['w3'], client: 'R. Tran', addr: '55 Cedar Loop, Bothell' },
  { id: 'e10', kind: 'job',         title: 'Gutter guards — Redmond',        start: iso(2026, 6, 17, 9, 0),  end: iso(2026, 6, 17, 14, 0), status: 'COMPLETED',   workers: ['w1'], client: 'D. Pham', addr: 'Redmond, WA' },
  { id: 'e11', kind: 'job',         title: 'Skylight install — 210 Fir St',  start: iso(2026, 6, 28, 8, 0),  end: iso(2026, 6, 28, 12, 0), status: 'SCHEDULED',   workers: ['w3'], client: 'K. Marsh', addr: '210 Fir St, Woodinville' },
  { id: 'e12', kind: 'appointment', title: 'Site check — Cascade PM',        start: iso(2026, 6, 29, 10, 0), end: iso(2026, 6, 29, 11, 0), status: 'SCHEDULED',   workers: ['w2'], client: 'Cascade PM', addr: 'Redmond, WA' },
  { id: 'e13', kind: 'job',         title: 'Siding patch — Mill Creek',      start: iso(2026, 6, 30, 8, 0),  end: iso(2026, 6, 30, 15, 0), status: 'SCHEDULED',   workers: ['w1', 'w3'], client: 'S. Patel', addr: 'Mill Creek, WA' },
  { id: 'e14', kind: 'job',         title: 'Punch list — Cypress Ln',        start: iso(2026, 6, 14, 9, 0),  end: iso(2026, 6, 14, 12, 0), status: 'CANCELED',    workers: ['w1'], client: 'C. Ferreira', addr: '61 Cypress Ln, Bothell' },
];

/** Unscheduled work for the tray (DispatchableJob). */
export const TRAY_SEED: TrayJob[] = [
  { id: 'u1', title: 'Gutter replacement', client: 'R. Okafor', city: 'Redmond', duration: '4h' },
  { id: 'u2', title: 'Pergola build',      client: 'L. Wong',   city: 'Sammamish', duration: '2d' },
  { id: 'u3', title: 'Chain-link fence',   client: 'N. Ivanov', city: 'Lynnwood', duration: '1d' },
  { id: 'u4', title: 'Roof inspection',    client: 'T. Ortiz',  city: 'Bothell',  duration: '2h' },
];

/** Crew assignments awaiting confirmation (AppointmentAssignment). */
export const INBOX_SEED: InboxItem[] = [
  { id: 'a1', title: 'Asphalt reroof — Henderson', worker: 'Marcus B.', when: 'Jul 24 · 7:00 AM' },
  { id: 'a2', title: 'Cedar fence — 902 Alder Ct', worker: 'Dan K.',    when: 'Jul 25 · 8:00 AM' },
  { id: 'a3', title: 'Siding patch — Mill Creek',  worker: 'Marcus B.', when: 'Jul 30 · 8:00 AM' },
];

/** Week view window: 6:00–20:00. */
export const WG_START = 6;
export const WG_END = 20;
/** Height of one hour row in the week grid. Mirrored by `--wg-row` in the CSS
 *  module — the drag-to-create geometry and the event blocks are computed from
 *  this number, so the two must stay in sync. */
export const WG_ROW = 54;
/** Drag-to-create and the time list snap to this many minutes. */
export const SNAP_MIN = 15;
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOW1 = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const KIND_IC: Record<string, string> = { job: 'i-hardhat', appointment: 'i-cal', blocked: 'i-ban' };

/** Link targets for the "link a record" picker. A job event links to work
 *  (jobs, proposals); an appointment is a meeting, so it also links to the
 *  people it can be about — leads and clients. Rows carry a status so the badge
 *  can use the shared `.pstatus--*` tones. */
export type LinkKind = "job" | "proposal" | "lead" | "client";
export type LinkOption = {
  id: string;
  kind: LinkKind;
  title: string;
  client: string;
  status: string;
  meta: string;
};

/** Which tabs each event kind offers, in order. `all` is prepended by the UI. */
export const LINK_TABS: Record<string, LinkKind[]> = {
  job: ["job", "proposal"],
  appointment: ["lead", "client", "proposal"],
};

export const LINK_LABEL: Record<LinkKind, string> = {
  job: "Job", proposal: "Proposal", lead: "Lead", client: "Client",
};

export const LINK_OPTIONS: LinkOption[] = [
  { id: 'u1', kind: 'job',      title: 'Gutter replacement',    client: 'R. Okafor',   status: 'scheduled', meta: 'Redmond · 4h' },
  { id: 'u2', kind: 'job',      title: 'Pergola build',         client: 'L. Wong',     status: 'scheduled', meta: 'Sammamish · 2d' },
  { id: 'u3', kind: 'job',      title: 'Chain-link fence',      client: 'N. Ivanov',   status: 'scheduled', meta: 'Lynnwood · 1d' },
  { id: 'u4', kind: 'job',      title: 'Roof inspection',       client: 'T. Ortiz',    status: 'scheduled', meta: 'Bothell · 2h' },
  { id: 'p1', kind: 'proposal', title: 'Cedar privacy fence',   client: 'D. Reyes',    status: 'sent',      meta: 'Kirkland · $8,400' },
  { id: 'p2', kind: 'proposal', title: 'Full reroof — GAF HDZ', client: 'A. Kim',      status: 'viewed',    meta: 'Bellevue · $24,600' },
  { id: 'p3', kind: 'proposal', title: 'Deck rebuild',          client: 'S. Patel',    status: 'draft',     meta: 'Mill Creek · $11,200' },
  { id: 'p4', kind: 'proposal', title: 'Gutter guards',         client: 'D. Pham',     status: 'accepted',  meta: 'Redmond · $1,600' },
  { id: 'l1', kind: 'lead',     title: 'S. Rao',                client: 'S. Rao',      status: 'new',       meta: 'Sammamish · privacy panels' },
  { id: 'l2', kind: 'lead',     title: 'B. Whitaker',           client: 'B. Whitaker', status: 'contacted', meta: 'Kenmore · gutter quote' },
  { id: 'l3', kind: 'lead',     title: 'Northgate Rentals',     client: 'Northgate Rentals', status: 'qualified', meta: 'Everett · 4 units' },
  { id: 'c1', kind: 'client',   title: 'M. Henderson',          client: 'M. Henderson', status: 'active',   meta: '4812 Maple Ave, Bothell' },
  { id: 'c2', kind: 'client',   title: 'K. Nguyen',             client: 'K. Nguyen',   status: 'active',    meta: '1409 Fern St, Bothell' },
  { id: 'c3', kind: 'client',   title: 'Cascade PM',            client: 'Cascade PM',  status: 'active',    meta: 'Redmond · property mgr' },
  { id: 'c4', kind: 'client',   title: 'R. Tran',               client: 'R. Tran',     status: 'active',    meta: '55 Cedar Loop, Bothell' },
];
