// A DAY ON SITE (stage A, 2026-09-30) — pure, client-safe.
//
// Owner: days, not hours. One WorkDay row per job and local date; several
// crew on one job share it and any of them closes it for all. Closing needs
// a note or at least one photo / video of the day. A day left open past its
// date is PENDING — "passed, needs closing" — and can be closed later.

import { localDayKey } from "@/lib/jobProgressShared";

export type WorkDayStatus = "OPEN" | "CLOSED" | "PENDING";

export interface WorkDayLike {
  id?: string;
  date: string;
  dayNumber: number;
  status: string;
  note?: string | null;
  closedAt?: Date | string | null;
}

/** What the row means now: an OPEN day whose date has passed reads PENDING. */
export function effectiveDayStatus(day: Pick<WorkDayLike, "date" | "status">, todayKey: string): WorkDayStatus {
  if (day.status === "CLOSED") return "CLOSED";
  if (day.status === "PENDING") return "PENDING";
  return day.date < todayKey ? "PENDING" : "OPEN";
}

/** The rule for closing a day: a note, or at least one file of the day. */
export function canCloseDay(input: { note?: string | null; mediaCount: number }): { ok: true } | { ok: false; error: string } {
  const note = (input.note ?? "").trim();
  if (note || input.mediaCount > 0) return { ok: true };
  return { ok: false, error: "Write a note or add at least one photo or video of the day before closing it." };
}

/** What the crew's buttons read off the WorkDay rows: the same three numbers
 *  `nextDay` gave from the trail, plus the day open today and the days that
 *  passed unclosed. */
export function dayCount(days: readonly WorkDayLike[], tz: string, now = new Date()): {
  day: number;
  startedToday: boolean;
  daysSoFar: number;
  openDay: WorkDayLike | null;
  pendingDays: WorkDayLike[];
} {
  const today = localDayKey(now, tz);
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const todays = sorted.find((d) => d.date === today) ?? null;
  const pendingDays = sorted.filter((d) => effectiveDayStatus(d, today) === "PENDING");
  return {
    day: todays ? todays.dayNumber : sorted.length + 1,
    startedToday: !!todays,
    daysSoFar: sorted.length,
    openDay: todays && todays.status !== "CLOSED" ? todays : null,
    pendingDays,
  };
}

/** The trail sentence for a closed day. */
export function closeDaySummary(worker: string | null, job: string, dayNumber: number, mediaCount: number, hasNote: boolean): string {
  const who = worker ?? "The crew";
  const what = mediaCount > 0 ? `${mediaCount} ${mediaCount === 1 ? "file" : "files"}${hasNote ? " and a note" : ""}` : "a note";
  return `${who} closed day ${dayNumber} of ${job} — ${what}`;
}
