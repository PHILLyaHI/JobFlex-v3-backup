// The home dashboard's pure date rules (2026-10-03): when a plan is, when its
// reminder lands, how it reads — no database, so the check can import them.

/** The hour (local) a plan's reminder lands. */
export const REMIND_HOUR = 9;
/** A plan whose month has already begun is reminded about after a week. */
export const LATE_PLAN_REMIND_MS = 7 * 24 * 60 * 60_000;

/** "2026-11" or "2026-11-01" with a whole month → the first of November; a day → that day. UTC midnight marks the date. */
export function planDate(ymd: string, wholeMonth: boolean): Date | null {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = wholeMonth || !m[3] ? 1 : Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
}

/** The UTC instant of `hour`:00 on that calendar day in `tz`. */
export function localHourAt(ymd: Date, hour: number, tz: string): Date {
  const y = ymd.getUTCFullYear();
  const m = ymd.getUTCMonth();
  const d = ymd.getUTCDate();
  let guess = Date.UTC(y, m, d, hour);
  // Two passes catch a DST edge: read the zone's offset at the guess, correct, read again.
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(guess));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const localAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    const offset = localAsUtc - guess;
    guess = Date.UTC(y, m, d, hour) - offset;
  }
  return new Date(guess);
}

/** How the homeowner wants to be reminded about a plan (the form's choice). */
export type RemindMode = "start" | "2w" | "1w" | "none";
export const REMIND_MODES: ReadonlyArray<{ value: RemindMode; label: string; daysBefore: number | null }> = [
  { value: "start", label: "When the month starts", daysBefore: 0 },
  { value: "2w", label: "Two weeks before", daysBefore: 14 },
  { value: "1w", label: "A week before", daysBefore: 7 },
  { value: "none", label: "Don't remind me", daysBefore: null },
];
/** The nudge after a reminder nobody acted on; then it stops. */
export const FOLLOW_UP_MS = 14 * 24 * 60 * 60_000;

/** When to remind about a plan: 9 AM local, `daysBefore` days ahead of its
 *  day (or its month's first day) — the day itself when that lead time has
 *  already passed, and a week from now when the plan's time has come too.
 *  Null for "don't remind me". */
export function reminderFor(plannedFor: Date, tz: string, now = new Date(), mode: RemindMode = "start"): Date | null {
  const choice = REMIND_MODES.find((m) => m.value === mode);
  // null means "don't remind me" — not a missing choice, which falls back to the start.
  const days = choice ? choice.daysBefore : 0;
  if (days === null) return null;
  const ahead = new Date(plannedFor.getTime() - days * 24 * 60 * 60_000);
  for (const d of days > 0 ? [ahead, plannedFor] : [plannedFor]) {
    const at = localHourAt(d, REMIND_HOUR, tz);
    if (at.getTime() > now.getTime()) return at;
  }
  return new Date(now.getTime() + LATE_PLAN_REMIND_MS);
}

/** The mode a stored reminder time stands for, read back for the form. */
export function remindModeOf(plannedFor: Date, remindAt: Date | null): RemindMode {
  if (!remindAt) return "none";
  const days = Math.round((plannedFor.getTime() - remindAt.getTime()) / (24 * 60 * 60_000));
  return days >= 12 ? "2w" : days >= 5 ? "1w" : "start";
}

/** "November 2026" or "Nov 14, 2026". */
export function planWhen(plannedFor: Date, wholeMonth: boolean): string {
  return wholeMonth
    ? plannedFor.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    : plannedFor.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function validTimeZone(tz: string | null | undefined): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Whether the dashboard key may be shown on screen right after a submission
 *  (lib/home/portal's header): a first-timer with nothing older, or a request
 *  made from the dashboard itself. Everyone else gets it by email. */
export function mayShowHomeKey(f: { isNew: boolean; older: number; fromDashboard: boolean }): boolean {
  return f.fromDashboard || (f.isNew && f.older === 0);
}
