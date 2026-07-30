// Mobile calendar (mobile-calendar-v2) — demo fixture.
//
// Carried over VERBATIM from the desktop calendar donor fixture
// (src/components/v3/calendar-blueprint/calendar-data.ts): every id, title,
// date, status, phone number, address, tray job, inbox row and link option is
// the same value under the same field name, so the handheld composition is
// judged against the same content as the desktop sheet. Seattle-area
// contractor texture (Bothell / Kirkland / Redmond / Woodinville / Mill Creek
// / Sammamish / Lynnwood / Everett).
//
// Two mechanical adaptations, both forced by the mobile shell:
//  · KIND_IC.blocked points at `i-calendar-ban` instead of `i-ban`. The shared
//    mobile sprite carries 48 symbols and `i-ban` is not one of them, so the
//    page ships that one symbol itself under the collision-proof prefix.
//  · The desktop week-grid geometry (WG_START / WG_END / WG_ROW) is not
//    carried: there is no 8-column × 14-hour time grid on a phone, so the
//    constants that drove its pixel maths have nothing to drive. SNAP_MIN
//    stays — the create form still snaps its times.
//
// States every branch of the UI needs, and where they live in this seed:
//  · no phone      → e3, e5, e6, e7, e9, e10, e11, e12, e13, e14 (disabled
//                    "Call client" row in the actions sheet)
//  · no address    → e5 "Shop maintenance" (disabled "Get directions")
//  · already done  → e9, e10 COMPLETED (disabled "Mark completed")
//  · not a job     → e2, e7, e12 appointments + e5 blocked (status is a job
//                    concept, so "Mark completed" is disabled for them too)
//  · no client     → e5 (the row falls back to its kind label)
//  · canceled      → e14 (the fourth status tone)
//  · a crew member with an empty week → w4 Ivan (dashed note on his team card)
//  · a day with nothing on it → any empty cell (agenda's "Nothing scheduled")
//
// This is a design surface: the data layer is out of scope, so nothing here
// touches Prisma or a server action. The arrays are mutated at runtime
// (reschedule, create, delete, complete, confirm, schedule-from-tray), so the
// component clones these seeds per mount and no mutation leaks between mounts.

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
  /** Spans whole days: it has a date but no clock span, so it has no duration. */
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

/** Create-form times snap to this many minutes. */
export const SNAP_MIN = 15;
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOW1 = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const KIND_IC: Record<CalKind, string> = {
  job: 'i-hardhat', appointment: 'i-cal', blocked: 'i-calendar-ban',
};
export const KIND_LABEL: Record<CalKind, string> = {
  job: 'Job event', appointment: 'Appointment', blocked: 'Blocked time',
};

/** Link targets for the "link a record" picker. A job event links to work
 *  (jobs, proposals); an appointment is a meeting, so it also links to the
 *  people it can be about — leads and clients. */
export type LinkKind = "job" | "proposal" | "lead" | "client";
export type LinkOption = {
  id: string;
  kind: LinkKind;
  title: string;
  client: string;
  status: string;
  meta: string;
};

/** Which record kinds each event kind may link to, in order. */
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

/* ============================================================
   VIEWS AND FILTERING
   ============================================================ */

export type ViewKey = "month" | "week" | "team";
export const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "month", label: "Month" }, { key: "week", label: "Week" }, { key: "team", label: "Team" },
];

/** Not a real filter value — the "no filter" sentinel. */
export const ALL = "ALL";
export type FilterOpt = { key: string; label: string };

/**
 * The desktop bar carries a multi-select worker dropdown AND a four-button
 * status set side by side. Neither survives 320px, and the house rule is ONE
 * dropdown, so both collapse into a single option list: All, the four
 * statuses, then the four crew members. Nine cells is exactly the 3×3 the
 * menu grid wants.
 */
export function filterOptions(): FilterOpt[] {
  return [
    { key: ALL, label: "All" },
    ...JOB_STATUSES.map((s) => ({ key: `S:${s.value}`, label: s.label })),
    ...workersData.map((w) => ({ key: `W:${w.id}`, label: w.name })),
  ];
}

export function matchesFilter(e: CalEvent, key: string): boolean {
  if (key === ALL) return true;
  if (key.startsWith("S:")) return e.status === key.slice(2);
  if (key.startsWith("W:")) return e.workers.includes(key.slice(2));
  return true;
}

/** Title, client and address answer the search box — the desktop's own set. */
export function matchesQuery(e: CalEvent, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${e.title} ${e.client ?? ""} ${e.addr ?? ""}`.toLowerCase().includes(q);
}

export function filterCount(list: CalEvent[], key: string): number {
  return list.filter((e) => matchesFilter(e, key)).length;
}

/* ============================================================
   DATE / FORMAT HELPERS — the donor's formulas and format strings
   ============================================================ */

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
export function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}
export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function addMin(d: Date, m: number): Date {
  return new Date(d.getTime() + m * 60000);
}
/** Same calendar day as `day`, at `mins` minutes past midnight. */
export function atMins(day: Date, mins: number): Date {
  const x = new Date(day);
  x.setHours(0, 0, 0, 0);
  return new Date(x.getTime() + mins * 60000);
}
export function snapMins(mins: number): number {
  return Math.round(mins / SNAP_MIN) * SNAP_MIN;
}
export function fmtTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}${m ? ":" + String(m).padStart(2, "0") : ""} ${ap}`;
}
/** The clock half of the row's time plate: "7:00" / "11:30". */
export function fmtClock(d: Date): string {
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export function fmtMeridiem(d: Date): string {
  return d.getHours() >= 12 ? "PM" : "AM";
}
export function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);
}
export function fmtDayShort(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}
export function fmtMonthYear(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(d);
}
/** "Jul 19–25, 2026" — the week label, collapsed when the month is shared. */
export function fmtWeekRange(start: Date): string {
  const end = addDays(start, 6);
  const sMo = new Intl.DateTimeFormat("en-US", { month: "short" }).format(start);
  const eMo = new Intl.DateTimeFormat("en-US", { month: "short" }).format(end);
  return start.getMonth() === end.getMonth()
    ? `${sMo} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`
    : `${sMo} ${start.getDate()} – ${eMo} ${end.getDate()}, ${end.getFullYear()}`;
}
export function fmtRange(a: Date, b: Date): string {
  return `${fmtTime(a)} – ${fmtTime(b)}`;
}
export function durLabel(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
/**
 * Hours the masthead counts. A timed event contributes its clock span; an
 * all-day event has no clock span, so it contributes one 8-hour working day
 * per day it covers — otherwise blocking out a whole week would read as zero
 * booked hours.
 */
export function eventHours(e: CalEvent): number {
  if (e.allDay) {
    const days = Math.round((atMins(e.end, 0).getTime() - atMins(e.start, 0).getTime()) / 86400000) + 1;
    return Math.max(1, days) * 8;
  }
  return Math.max(0, e.end.getTime() - e.start.getTime()) / 3600000;
}

/**
 * Two letters, so a list of rows is scannable: "M. Henderson" → MH,
 * "Cascade PM" → CP, a single word → its first two letters. Punctuation is
 * stripped first, which is what keeps the "M." initial from becoming ".".
 */
export function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z ]/g, " ").split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function workerName(id: string): string {
  return workersData.find((w) => w.id === id)?.name ?? id;
}

/** Whoever owns the shop — an empty crew on a blocked event means "my time". */
export const OWNER = workersData.find((w) => w.role === "Owner") ?? workersData[workersData.length - 1];

/** "Marcus B. +1" — the whole crew never fits on a 320px row. */
export function crewLabel(e: CalEvent): string {
  if (e.kind === "blocked" && (e.selfOnly || !e.workers.length)) return "Just me";
  if (!e.workers.length) return "Unassigned";
  const first = workerName(e.workers[0]);
  return e.workers.length > 1 ? `${first} +${e.workers.length - 1}` : first;
}

/** Who / where, in the row's mono line. Blocked time has neither, so it falls
 *  back to naming what it is. */
export function whoWhere(e: CalEvent): string {
  const who = e.client ?? KIND_LABEL[e.kind];
  return e.addr ? `${who} · ${e.addr}` : who;
}

/**
 * The tone key for a status badge or a month-grid dot. Kind is NOT a status,
 * so appointments and blocked time get their own keys (sky / ink plate) and
 * only job events reach the four status tones — the same split the desktop's
 * `statusCls()` makes.
 */
export function toneKey(e: CalEvent): string {
  if (e.kind === "appointment") return "appt";
  if (e.kind === "blocked") return "blocked";
  return e.status.toLowerCase();
}

export function toneLabel(e: CalEvent): string {
  if (e.kind === "appointment") return "Appointment";
  if (e.kind === "blocked") return "Blocked";
  return JOB_STATUSES.find((s) => s.value === e.status)?.label ?? e.status;
}

export function byStart(a: CalEvent, b: CalEvent): number {
  return a.start.getTime() - b.start.getTime();
}

/** How many day chips a month cell shows before it prints "+N". */
export const MG_CAP = 3;

/** <input type="date"> / <input type="time"> wire format. */
export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function toTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
/** Rebuilds a Date from the two native inputs. Invalid text falls back to the
 *  day it was opened on, so a half-typed date can never produce Invalid Date. */
export function fromInputs(dateStr: string, timeStr: string, fallback: Date): Date {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  const tm = /^(\d{1,2}):(\d{2})$/.exec(timeStr);
  if (!dm) return new Date(fallback);
  const day = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]));
  const mins = tm ? snapMins(Number(tm[1]) * 60 + Number(tm[2])) : 8 * 60;
  return atMins(day, mins);
}
