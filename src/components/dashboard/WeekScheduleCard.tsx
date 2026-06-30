import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

export interface WeekEvent {
  id: string;
  title: string;
  startsAt: Date;
}

interface WeekScheduleCardProps {
  /** Sunday 00:00 of the week to render. Computed server-side so the "today"
   *  highlight is stable and never depends on the client clock. */
  weekStart: Date;
  /** Server "now" — used only to mark which column is today. */
  now: Date;
  events: WeekEvent[];
  calendarHref: string;
}

// Two letters reads cleaner than one in a ~70px column (Su/Sa won't collide).
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Glanceable time for a narrow cell: 9:00 -> "9a", 14:30 -> "2:30p".
function compactTime(d: Date) {
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h < 12 ? "a" : "p";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hr}${period}` : `${hr}:${String(m).padStart(2, "0")}${period}`;
}

export function WeekScheduleCard({ weekStart, now, events, calendarHref }: WeekScheduleCardProps) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const byDay = new Map<string, WeekEvent[]>();
  for (const e of events) {
    const k = dayKey(new Date(e.startsAt));
    const arr = byDay.get(k);
    if (arr) arr.push(e);
    else byDay.set(k, [e]);
  }

  const todayKey = dayKey(now);
  const last = days[6];
  const fmtMD = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  const rangeLabel =
    weekStart.getMonth() === last.getMonth()
      ? `${fmtMD.format(weekStart)} – ${last.getDate()}`
      : `${fmtMD.format(weekStart)} – ${fmtMD.format(last)}`;

  return (
    <>
      <CardHeader>
        <div>
          <CardTitle>This week</CardTitle>
          <CardSubtitle>
            <span className="tabular">{rangeLabel}</span>
            {" · "}
            <span className="tabular font-medium text-[color:var(--accent-ink)]">
              {events.length}
            </span>{" "}
            scheduled
          </CardSubtitle>
        </div>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Link href={calendarHref as any} className="inline-flex items-center gap-1 text-[12px] text-[color:var(--ink-muted)] transition-colors hover:text-[color:var(--ink)]">
          Calendar <ArrowUpRight className="h-3 w-3" />
        </Link>
      </CardHeader>

      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const k = dayKey(d);
          const isToday = k === todayKey;
          const list = (byDay.get(k) ?? [])
            .slice()
            .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
          const shown = list.slice(0, 3);
          const extra = list.length - shown.length;
          return (
            <div
              key={k}
              className={cn(
                "flex flex-col rounded-[var(--r-sm)] px-1 pb-2 pt-1.5 min-h-[92px]",
                isToday && "bg-[color:var(--accent-soft)]/60",
              )}
            >
              <div className="mb-1.5 flex flex-col items-center gap-1">
                <span className="quiet-caps text-[color:var(--ink-muted)]">
                  {WEEKDAYS[d.getDay()]}
                </span>
                <span
                  className={cn(
                    "tabular text-[12px] leading-none",
                    isToday
                      ? "inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[color:var(--accent)] font-semibold text-[color:var(--paper)]"
                      : "pt-0.5 font-medium text-[color:var(--ink-soft)]",
                  )}
                >
                  {d.getDate()}
                </span>
              </div>
              <div className="flex flex-col items-stretch gap-1">
                {shown.map((e) => (
                  <span
                    key={e.id}
                    title={`${compactTime(new Date(e.startsAt))} · ${e.title}`}
                    className={cn(
                      "truncate rounded-[var(--r-sm)] px-1 py-0.5 text-center text-[10px] font-medium tabular",
                      // Today's events go solid sage; other days use the soft
                      // chip — the same accent-soft/accent-ink pair the
                      // "Upcoming jobs" card beside this one uses.
                      isToday
                        ? "bg-[color:var(--accent)] text-[color:var(--paper)]"
                        : "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]",
                    )}
                  >
                    {compactTime(new Date(e.startsAt))}
                  </span>
                ))}
                {extra > 0 && (
                  <span className="text-center text-[9px] tabular text-[color:var(--ink-muted)]">
                    +{extra}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {events.length === 0 && (
        <p className="mt-3 text-center text-[12px] text-[color:var(--ink-muted)]">
          Nothing scheduled this week.
        </p>
      )}
    </>
  );
}
