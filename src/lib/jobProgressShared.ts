// THE CREW ON SITE (2026-09-27) — pure, client-safe.
//
// Owner: "make a Job started button, a Continue job button if it's a few days
// of work, and Complete job; a text goes to the owner and the manager." One
// rule for both doors (the worker portal's token route and the dashboard's
// server action): a job's days on site are the distinct local days a crew
// pressed Start or Back on site, read off the STARTED rows of the trail.

/** A press on the crew's buttons; "closed" (stage A, 2026-09-30) closes a day on site. */
export type ProgressWhat = "started" | "continued" | "completed" | "closed";

export interface ProgressRow {
  kind: string;
  createdAt: Date | string;
  meta?: string | null;
}

/** "2026-09-27" for `d` in the company's timezone. */
export function localDayKey(d: Date | string, tz: string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
    return parts;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** The days a crew was on site so far, oldest first — one per local day
 *  with a Start or a Back-on-site row. */
export function siteDays(rows: ProgressRow[], tz: string): string[] {
  const days = new Set<string>();
  for (const r of rows) if (r.kind === "STARTED") days.add(localDayKey(r.createdAt, tz));
  return [...days].sort();
}

/** What a press means now: the day number it lands on, and whether today
 *  already has a start (so "Back on site" is not offered twice). */
export function nextDay(rows: ProgressRow[], tz: string, now = new Date()): { day: number; startedToday: boolean; daysSoFar: number } {
  const days = siteDays(rows, tz);
  const today = localDayKey(now, tz);
  const startedToday = days.includes(today);
  return { day: startedToday ? days.indexOf(today) + 1 : days.length + 1, startedToday, daysSoFar: days.length };
}

/** The trail sentence for a press. */
export function progressSummary(worker: string | null, job: string, what: ProgressWhat, day: number): string {
  const who = worker ?? "The crew";
  if (what === "started") return `${who} started ${job}`;
  if (what === "continued") return `${who} is back on ${job} — day ${day}`;
  if (what === "closed") return `${who} closed day ${day} of ${job}`;
  return day > 1 ? `${who} completed ${job} after ${day} days` : `${who} completed ${job}`;
}

/** The short line under the status on the crew's pages. */
export function onSiteLine(info: { day: number; startedToday: boolean; daysSoFar: number }, status: string): string | null {
  if (status === "COMPLETED") return info.daysSoFar > 1 ? `Done after ${info.daysSoFar} days on site` : info.daysSoFar === 1 ? "Done in a day" : null;
  if (status !== "IN_PROGRESS") return null;
  if (info.startedToday) return info.day > 1 ? `On site today · day ${info.day}` : "On site today";
  return info.daysSoFar > 0 ? `${info.daysSoFar} ${info.daysSoFar === 1 ? "day" : "days"} on site so far` : null;
}
