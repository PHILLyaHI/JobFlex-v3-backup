// Availability math shared by the calendar pages, the team grid, and the
// worker-picker "is this person free?" dots. Pure functions only — data
// loading lives in src/actions/availability.ts.

export interface RuleLike {
  id: string;
  ownerId: string;
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  startMinute: number; // minutes from local midnight
  endMinute: number;
  reason: string;
  active: boolean;
}

export interface ExceptionLike {
  ruleId: string;
  date: Date;
  freed: boolean;
}

export interface BusyInterval {
  start: Date;
  end: Date;
  kind: "job" | "appointment" | "blocked" | "recurring";
  label: string;
  /** Present on recurring occurrences so the UI can offer "free up this day". */
  ruleId?: string;
  /** Calendar date (YYYY-MM-DD) of a recurring occurrence — timezone-stable,
   * unlike re-deriving the day from the UTC instant on the client. */
  dateKey?: string;
}

// Offset of `tz` from UTC at the given instant, in ms. Standard Intl trick:
// format the instant in the target zone and diff against its UTC fields.
function tzOffsetMs(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUTC - at.getTime();
}

// UTC instant for (calendar date, minutes-from-midnight) in `tz`. Without a
// tz, falls back to the server's local clock (fine in dev where server and
// user share a timezone; production passes the org timezone).
function zonedInstant(y: number, m: number, d: number, minutes: number, tz?: string): Date {
  if (!tz) {
    const local = new Date(y, m - 1, d);
    local.setMinutes(minutes);
    return local;
  }
  const guess = new Date(Date.UTC(y, m - 1, d, 0, minutes));
  return new Date(guess.getTime() - tzOffsetMs(tz, guess));
}

function localMidnight(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function dateKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Expand weekly rules into concrete busy intervals inside [from, to].
 * Occurrences whose date has a `freed` exception are skipped — that single
 * day is open while the rest of the series stays blocked.
 *
 * `timeZone` (IANA) anchors the minutes-from-midnight to that zone's wall
 * clock; pass the org timezone so a "Saturday 8 AM" rule means 8 AM where the
 * crew works, not wherever the server happens to run.
 */
export function expandRules(
  rules: RuleLike[],
  exceptions: ExceptionLike[],
  from: Date,
  to: Date,
  timeZone?: string,
): BusyInterval[] {
  // Exceptions are written as server-local midnight of the calendar date, so
  // reading the key back with the same server-local getters is stable.
  const freedByRule = new Map<string, Set<string>>();
  for (const ex of exceptions) {
    if (!ex.freed) continue;
    if (!freedByRule.has(ex.ruleId)) freedByRule.set(ex.ruleId, new Set());
    freedByRule.get(ex.ruleId)!.add(dateKeyOf(localMidnight(ex.date)));
  }

  const out: BusyInterval[] = [];
  for (const rule of rules) {
    if (!rule.active) continue;
    const cursor = localMidnight(from);
    // Walk to the first matching weekday, then step a week at a time. A
    // calendar date's weekday is timezone-independent, so the local walk is
    // correct regardless of where the instants get anchored below.
    while (cursor.getDay() !== rule.dayOfWeek) cursor.setDate(cursor.getDate() + 1);
    for (; cursor <= to; cursor.setDate(cursor.getDate() + 7)) {
      const dateKey = dateKeyOf(cursor);
      if (freedByRule.get(rule.id)?.has(dateKey)) continue;
      const y = cursor.getFullYear();
      const m = cursor.getMonth() + 1;
      const d = cursor.getDate();
      // Overnight window: an end at/before the start means it wraps past
      // midnight (e.g. 10pm→8am), so the end instant lands on the next day.
      const start = zonedInstant(y, m, d, rule.startMinute, timeZone);
      let end: Date;
      if (rule.endMinute > rule.startMinute) {
        end = zonedInstant(y, m, d, rule.endMinute, timeZone);
      } else {
        const nd = new Date(cursor);
        nd.setDate(nd.getDate() + 1);
        end = zonedInstant(nd.getFullYear(), nd.getMonth() + 1, nd.getDate(), rule.endMinute, timeZone);
      }
      out.push({ start, end, kind: "recurring", label: rule.reason, ruleId: rule.id, dateKey });
    }
  }
  return out;
}

/** First busy interval that overlaps [start, end], or null when free. */
export function busyAt(
  intervals: BusyInterval[],
  start: Date,
  end: Date,
): BusyInterval | null {
  for (const iv of intervals) {
    if (overlaps(iv.start, iv.end, start, end)) return iv;
  }
  return null;
}
