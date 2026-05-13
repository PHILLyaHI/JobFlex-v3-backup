"use client";
import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface TodayAgendaEvent {
  id: string;
  jobId: string | null;
  title: string;
  startsAt: Date;
  notes: string | null;
}

interface TodayAgendaProps {
  /** Future-only events from the dashboard server fetch (Prisma `gte: now`, ordered asc). */
  events: TodayAgendaEvent[];
  /** Reference moment so "today" is deterministic. */
  now: Date;
}

const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const WEEKDAY_SHORT = new Intl.DateTimeFormat("en-US", { weekday: "short" });

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function TodayAgenda({ events, now }: TodayAgendaProps) {
  const today = events.filter((e) => isSameDay(e.startsAt, now));
  const nextAfterToday = events.find((e) => !isSameDay(e.startsAt, now) && e.startsAt > now);

  return (
    <section className="px-5">
      <div className="quiet-caps mb-2.5">Today</div>

      {today.length > 0 ? (
        <ul className="divide-y divide-[color:var(--ink-line)]">
          {today.map((e) => (
            <li key={e.id}>
              <Row href={hrefFor(e)} startsAt={e.startsAt} title={e.title} notes={e.notes} />
            </li>
          ))}
        </ul>
      ) : nextAfterToday ? (
        <div className="text-[13px] text-[color:var(--ink-soft)] leading-relaxed">
          <span className="text-[color:var(--ink-muted)]">Nothing on today. Next up </span>
          <Link
            href={hrefFor(nextAfterToday) as never}
            className="font-medium text-[color:var(--ink)] underline decoration-[color:var(--ink-faint)] underline-offset-[4px] hover:decoration-[color:var(--accent)]"
          >
            <span className="tabular">{WEEKDAY_SHORT.format(nextAfterToday.startsAt)}</span>
            <span className="text-[color:var(--ink-muted)]"> at </span>
            <span className="tabular">{TIME.format(nextAfterToday.startsAt)}</span>
            <span className="text-[color:var(--ink-muted)]"> &middot; </span>
            {nextAfterToday.title}
          </Link>
          <span className="text-[color:var(--ink-muted)]">.</span>
        </div>
      ) : (
        <div className="text-[13px] text-[color:var(--ink-muted)]">Nothing scheduled.</div>
      )}
    </section>
  );
}

function hrefFor(e: TodayAgendaEvent): string {
  return e.jobId ? `/dashboard/jobs/${e.jobId}` : "/dashboard/calendar";
}

interface RowProps {
  href: string;
  startsAt: Date;
  title: string;
  notes: string | null;
}

function Row({ href, startsAt, title, notes }: RowProps) {
  return (
    <Link
      href={href as never}
      className="flex items-start gap-4 py-3.5 -mx-1 px-1 rounded-[var(--r-sm)] hover:bg-black/[0.02] focus-ring"
    >
      <div className="shrink-0 w-14 pt-0.5">
        <div className="tabular text-[13px] font-medium text-[color:var(--ink)] leading-none">
          {TIME.format(startsAt)}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-[color:var(--ink)] leading-snug">{title}</div>
        {notes && (
          <div className="mt-0.5 text-[11px] text-[color:var(--ink-muted)] line-clamp-1">
            {notes}
          </div>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-[color:var(--ink-faint)] mt-1 shrink-0" />
    </Link>
  );
}
