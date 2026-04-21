"use client";
import * as React from "react";
import { cn } from "@/lib/cn";
import { statusAccent } from "@/components/jobs/JobStatusBadge";
import type { CalendarEvent } from "./EventChip";

interface WeekGridProps {
  cursor: Date;
  events: CalendarEvent[];
  onSelectEvent: (e: CalendarEvent) => void;
  startHour?: number;
  endHour?: number;
}

const HOUR_PX = 52;

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function WeekGrid({
  cursor,
  events,
  onSelectEvent,
  startHour = 7,
  endHour = 19,
}: WeekGridProps) {
  const weekStart = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const today = new Date();

  function positionFor(e: CalendarEvent, day: Date) {
    const start = new Date(e.startsAt);
    const end = new Date(e.endsAt);
    if (!sameDay(start, day)) return null;
    const top =
      (start.getHours() - startHour) * HOUR_PX + (start.getMinutes() / 60) * HOUR_PX;
    const durMs = end.getTime() - start.getTime();
    const height = Math.max(22, (durMs / (1000 * 60 * 60)) * HOUR_PX);
    return { top, height };
  }

  const currentTimeOffset =
    today.getHours() >= startHour && today.getHours() < endHour
      ? (today.getHours() - startHour) * HOUR_PX + (today.getMinutes() / 60) * HOUR_PX
      : null;

  return (
    <div className="paper-card p-0 overflow-hidden">
      {/* Header row */}
      <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-[color:var(--ink-line)]">
        <div className="quiet-caps px-2 py-2.5 text-right">GMT</div>
        {days.map((d) => {
          const isToday = sameDay(d, today);
          const weekend = d.getDay() === 0 || d.getDay() === 6;
          return (
            <div
              key={d.toISOString()}
              className={cn(
                "border-l border-[color:var(--ink-line)] px-2 py-2",
                weekend && "bg-black/[0.008]",
              )}
            >
              <div className="quiet-caps">
                {new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(d)}
              </div>
              <div
                className={cn(
                  "font-display text-[18px] tabular leading-none mt-1",
                  isToday ? "text-[color:var(--accent)]" : "text-[color:var(--ink)]",
                )}
              >
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="relative grid grid-cols-[56px_repeat(7,1fr)]">
        {/* Hours column */}
        <div>
          {hours.map((h) => (
            <div
              key={h}
              style={{ height: HOUR_PX }}
              className="text-[10px] text-[color:var(--ink-faint)] text-right pr-2 pt-1 tabular border-t border-[color:var(--ink-line)]"
            >
              {h === 12 ? "Noon" : h > 12 ? `${h - 12} pm` : `${h} am`}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((d) => {
          const weekend = d.getDay() === 0 || d.getDay() === 6;
          const isToday = sameDay(d, today);
          return (
            <div
              key={d.toISOString()}
              className={cn(
                "relative border-l border-[color:var(--ink-line)]",
                weekend && "bg-black/[0.008]",
                isToday && "bg-[color:var(--accent-soft)]/30",
              )}
              style={{ height: hours.length * HOUR_PX }}
            >
              {hours.map((h) => (
                <div
                  key={h}
                  className="border-t border-[color:var(--ink-line)]"
                  style={{ height: HOUR_PX }}
                />
              ))}
              {isToday && currentTimeOffset !== null && (
                <div
                  className="absolute left-0 right-0 pointer-events-none"
                  style={{ top: currentTimeOffset }}
                >
                  <div className="relative h-px bg-[color:var(--accent)]">
                    <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-[color:var(--accent)]" />
                  </div>
                </div>
              )}
              {events
                .filter((e) => sameDay(new Date(e.startsAt), d))
                .map((e) => {
                  const pos = positionFor(e, d);
                  if (!pos) return null;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onSelectEvent(e)}
                      style={{
                        position: "absolute",
                        top: pos.top,
                        height: pos.height,
                        left: 4,
                        right: 4,
                        borderLeftColor: statusAccent(e.status),
                      }}
                      className="flex flex-col justify-start rounded-[var(--r-sm)] bg-white dark:bg-white/[0.08] border border-[color:var(--ink-line)] border-l-[3px] px-2 py-1 text-left text-[11px] leading-tight truncate shadow-[0_1px_0_rgba(17,17,19,0.04)] hover:shadow-[0_4px_14px_-6px_rgba(17,17,19,0.18)] transition-shadow"
                    >
                      <div className="font-medium text-[color:var(--ink)] truncate">{e.title}</div>
                      <div className="text-[10px] text-[color:var(--ink-muted)] tabular">
                        {new Intl.DateTimeFormat("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        }).format(new Date(e.startsAt))}
                      </div>
                    </button>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
