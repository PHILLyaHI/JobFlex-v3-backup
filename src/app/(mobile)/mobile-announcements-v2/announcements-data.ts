// Mobile announcements (mobile-announcements-v2) — demo fixture.
//
// The five records are carried over VERBATIM from the desktop donor fixture
// (src/components/v3/announcements-blueprint/announcements-data.ts): same ids,
// same titles, same bodies, same priorities, same dates, same expired flags —
// so the handheld composition is judged against exactly the board the desktop
// sheet shows. `PRIORITY` and `ANN_SEQ_START` come across unchanged too.
//
// Seattle-area contractor texture: a shop closure, a heat advisory, a supplier
// change, plus two retired notices. Every state the surface can draw is
// reachable in it:
//  · all three priorities live at once (High a1 / Warn a3 / Normal a2)
//  · one active record with NO expiry (a2) — that is what makes the row
//    sheet's disabled "Change expiry" row reachable
//  · one expiry inside the two-day window (a3, Jul 24 against a Jul 22 today)
//  · two archived records (a4, a5), so the Archive tab is never born empty,
//    and neither of them is High or Warn — filtering the archive by either is
//    the reachable "No matches" state
//
// This is a design surface: the data layer is out of scope, so nothing here
// touches Prisma or a server action. The array is mutated at runtime (archive /
// restore / delete / publish), so the component clones this seed per mount.

export type Announcement = {
  id: string;
  title: string;
  priority: number;
  created: string | null;
  expires: string | null;
  expired: boolean;
  body: string;
};

/** Donor: `const PRIORITY = { 0: 'Normal', 1: 'Warn', 2: 'High' };` */
export const PRIORITY: Record<number, string> = { 0: "Normal", 1: "Warn", 2: "High" };

/** Donor: `let annSeq = 30;` — the id counter new announcements draw from. */
export const ANN_SEQ_START: number = 30;

export const ANN_SEED: Announcement[] = [
  { id: 'a1', title: 'Shop closed Friday', priority: 2, created: 'Jul 21, 2026', expires: 'Jul 25, 2026', expired: false,
    body: 'Annual equipment service — no crews dispatched Friday. Move any scheduled work to Thursday or Monday.' },
  { id: 'a2', title: 'New material supplier', priority: 0, created: 'Jul 18, 2026', expires: null, expired: false,
    body: 'Shingles now come from Bothell Building Supply. Use the new account number on all pickups.' },
  { id: 'a3', title: 'Heat advisory — start early', priority: 1, created: 'Jul 20, 2026', expires: 'Jul 24, 2026', expired: false,
    body: 'Highs above 95°F through Thursday. Shift roof work to 6 AM starts and pack extra water.' },
  { id: 'a4', title: 'Timesheets due Monday', priority: 0, created: 'Jul 06, 2026', expires: 'Jul 14, 2026', expired: true,
    body: 'Submit last week hours in the worker portal before Monday noon.' },
  { id: 'a5', title: 'Parking change at the yard', priority: 0, created: 'Jun 24, 2026', expires: 'Jul 02, 2026', expired: true,
    body: 'Trailers park along the north fence while the lot is resurfaced.' }
];

/**
 * The board's "now". The donor hardcodes this same string in two places — the
 * `created` stamp a publish writes, and the `expires` fallback a retire writes —
 * so it is the fixture's own today, not a second invented value. Every relative
 * label on the page (TODAY / YESTERDAY / days left) is measured against it,
 * which also keeps the page deterministic between server and client render.
 */
export const TODAY_LABEL = "Jul 22, 2026";

/* ------------------------------------------------------------------ tabs */

export type TabKey = "active" | "archive";

export const TABS: { key: TabKey; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "archive", label: "Archive" },
];

/* --------------------------------------------------------------- filter */

/**
 * Priority is the only segment the fixture actually carries — there is no
 * audience/list field on an Announcement, and inventing one would break the
 * verbatim-fixture rule. So priority takes the dropdown, and the desktop's
 * Active-card / Archive-card split takes the two tabs. One control per
 * dimension.
 */
export type PriorityKey = "ALL" | "P2" | "P1" | "P0";

export const PRIORITY_FILTERS: { key: PriorityKey; label: string; priority?: number }[] = [
  { key: "ALL", label: "All" },
  { key: "P2", label: "High", priority: 2 },
  { key: "P1", label: "Warn", priority: 1 },
  { key: "P0", label: "Normal", priority: 0 },
];

export function matchesPriority(a: Announcement, key: PriorityKey): boolean {
  const f = PRIORITY_FILTERS.find((x) => x.key === key);
  if (!f || f.priority === undefined) return true;
  return a.priority === f.priority;
}

export function priorityCount(list: Announcement[], key: PriorityKey): number {
  return list.filter((a) => matchesPriority(a, key)).length;
}

/* ----------------------------------------------------------------- dates */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86400000;

/**
 * "Jul 21, 2026" → a sortable UTC timestamp. Parsed by hand rather than through
 * `new Date(str)`: that constructor's handling of non-ISO strings is
 * implementation-defined and timezone-sensitive, and a date that shifts by a day
 * between the server render and the client one would flip a TODAY divider.
 * Returns 0 for anything unparseable, which sorts such records last.
 */
export function parseDay(s: string | null): number {
  if (!s) return 0;
  const m = /^([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})$/.exec(s.trim());
  if (!m) return 0;
  const mi = MONTHS.indexOf(m[1]);
  if (mi < 0) return 0;
  return Date.UTC(Number(m[3]), mi, Number(m[2]));
}

/** "2026-07-28" (what an `<input type="date">` yields) → "Jul 28, 2026", so a
 *  published record reads in the fixture's own format and nothing downstream
 *  has to know two date shapes. */
export function formatDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  const mi = Number(m[2]) - 1;
  if (mi < 0 || mi > 11) return iso;
  return `${MONTHS[mi]} ${m[3]}, ${m[1]}`;
}

/** "Jul 14, 2026" → "Jul 14". The year is noise on a row that already sits
 *  under a dated divider. */
export function shortDay(s: string | null): string {
  if (!s) return "—";
  return s.split(",")[0].trim();
}

/** Whole days from today to `expires`. Negative once it is past. */
export function daysLeft(expires: string | null, today: string = TODAY_LABEL): number | null {
  const e = parseDay(expires);
  const t = parseDay(today);
  if (!e || !t) return null;
  return Math.round((e - t) / DAY_MS);
}

/** The date-divider label: TODAY / YESTERDAY for the two days a contractor
 *  actually thinks in, the literal date beyond that. */
export function dayLabel(created: string | null, today: string = TODAY_LABEL): string {
  if (!created) return "Undated";
  const d = parseDay(created);
  const t = parseDay(today);
  if (!d || !t) return created;
  const diff = Math.round((t - d) / DAY_MS);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return created;
}

export type DayGroup = { key: string; label: string; items: Announcement[] };

/** Newest first, then bucketed by the day it was posted. Sort is stable, so two
 *  announcements posted the same day keep the order the array holds them in —
 *  which for a freshly published one means top of its own group. */
export function groupByDay(list: Announcement[]): DayGroup[] {
  const sorted = [...list].sort((a, b) => parseDay(b.created) - parseDay(a.created));
  const out: DayGroup[] = [];
  sorted.forEach((a) => {
    const key = a.created ?? "undated";
    const last = out[out.length - 1];
    if (last && last.key === key) last.items.push(a);
    else out.push({ key, label: dayLabel(a.created), items: [a] });
  });
  return out;
}
