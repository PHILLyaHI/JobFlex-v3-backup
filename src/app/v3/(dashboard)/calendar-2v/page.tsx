// Variant-2v parallel build — Calendar page.
// Faithful port of c:/jobflex-variants/variant-2v-neutral/src/pages/Calendar.jsx,
// wired to real Prisma data (appointments + jobs). Lives at /v3/calendar-2v
// alongside the live /dashboard/calendar (calendar-a editorial).
//
// Month view only — no nav state, shows the current month. Today is a green disc
// on the date number. Out-of-month cells are dimmed. Each cell shows up to 3
// events; overflow becomes "+N more".

import "@/styles/variant-2v.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { V3_PORTED_ROUTES } from "@/lib/v3/routes";

export const dynamic = "force-dynamic";

type EventKind = "accent" | "ink" | "warm";
interface CalEvent {
  kind: EventKind;
  time: string;
  title: string;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE = 3;

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default async function Calendar2vPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/login?next=${encodeURIComponent(V3_PORTED_ROUTES.calendar2v)}`);
  }

  const { organizationId } = await requireOrg();

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-indexed

  // Grid: 6 rows × 7 cols = 42 cells, starting from Sunday on/before the 1st
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());
  const gridEnd = new Date(gridStart);
  gridEnd.setDate(gridStart.getDate() + 42);

  // Fetch events within the grid window. Appointments and jobs (with startsAt).
  const [appointments, jobs] = await Promise.all([
    db.appointment.findMany({
      where: {
        organizationId,
        startsAt: { gte: gridStart, lt: gridEnd },
      },
      orderBy: { startsAt: "asc" },
    }),
    db.job.findMany({
      where: {
        organizationId,
        startsAt: { gte: gridStart, lt: gridEnd, not: null },
      },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  // Group events by date key
  const eventsByDate = new Map<string, CalEvent[]>();
  const push = (k: string, e: CalEvent) => {
    const arr = eventsByDate.get(k) ?? [];
    arr.push(e);
    eventsByDate.set(k, arr);
  };

  for (const a of appointments) {
    push(dateKey(a.startsAt), {
      kind: "ink",
      time: fmtTime(a.startsAt),
      title: a.title,
    });
  }
  for (const j of jobs) {
    if (!j.startsAt) continue;
    push(dateKey(j.startsAt), {
      kind: "accent",
      time: fmtTime(j.startsAt),
      title: j.title,
    });
  }

  // Build the 42 cells
  const cells: { date: Date; out: boolean; isToday: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push({
      date: d,
      out: d.getMonth() !== month,
      isToday:
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate(),
    });
  }

  const totalEvents = appointments.length + jobs.length;
  const monthLabel = today.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="v2v-page">
      <header className="v2v-page__head">
        <div>
          <h1 className="v2v-page__title">Calendar</h1>
          <p className="v2v-page__subtitle">
            Site visits, kickoffs, milestones, and review windows for the active month.
          </p>
        </div>
        <div className="v2v-page__actions">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Link href={"/dashboard/calendar" as any} className="v2v-btn v2v-btn--ghost">
            Day
          </Link>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Link href={"/dashboard/calendar" as any} className="v2v-btn v2v-btn--ghost">
            Week
          </Link>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Link href={"/dashboard/calendar" as any} className="v2v-btn v2v-btn--primary">
            <Plus size={14} strokeWidth={1.8} />
            New event
          </Link>
        </div>
      </header>

      <div className="v2v-cal-toolbar">
        <div>
          <span className="v2v-cal-month">{monthLabel}</span>
          <span className="v2v-cal-month__sub">
            — {appointments.length} appointment{appointments.length === 1 ? "" : "s"} ·{" "}
            {jobs.length} job{jobs.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="v2v-cal-nav" role="group" aria-label="Calendar navigation">
          <button aria-label="Previous month" type="button" disabled>
            <ChevronLeft size={14} strokeWidth={1.8} />
          </button>
          <button className="v2v-cal-today" type="button">
            Today
          </button>
          <button aria-label="Next month" type="button" disabled>
            <ChevronRight size={14} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      <div className="v2v-cal-grid">
        <div className="v2v-cal-dow">
          {DOW.map((d) => (
            <div className="v2v-cal-dow__cell" key={d}>
              {d}
            </div>
          ))}
        </div>
        <div className="v2v-cal-days">
          {cells.map((cell) => {
            const events = eventsByDate.get(dateKey(cell.date)) ?? [];
            const visible = events.slice(0, MAX_VISIBLE);
            const overflow = events.length - visible.length;
            return (
              <div
                key={cell.date.toISOString()}
                className={[
                  "v2v-cal-day",
                  cell.out ? "v2v-cal-day--out" : "",
                  cell.isToday ? "v2v-cal-day--today" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="v2v-cal-day__num">{cell.date.getDate()}</span>
                <div className="v2v-cal-events">
                  {visible.map((e, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`v2v-cal-event v2v-cal-event--${e.kind}`}
                      title={`${e.time} · ${e.title}`}
                    >
                      <span className="v2v-cal-event__time">{e.time}</span>
                      <span className="v2v-cal-event__title">{e.title}</span>
                    </button>
                  ))}
                  {overflow > 0 && (
                    <button type="button" className="v2v-cal-event__overflow">
                      +{overflow} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p style={{ marginTop: 16, fontSize: 12, color: "var(--ink-faint)" }}>
        {totalEvents} event{totalEvents === 1 ? "" : "s"} this month. Month navigation is
        view-only here; use{" "}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Link
          href={"/dashboard/calendar" as any}
          style={{ color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 2 }}
        >
          /dashboard/calendar
        </Link>{" "}
        for the full editorial month/week/day view.
      </p>
    </div>
  );
}
