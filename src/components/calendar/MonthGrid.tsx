"use client";
import * as React from "react";
import { cn } from "@/lib/cn";
import { EventChip, type CalendarEvent } from "./EventChip";

interface MonthGridProps {
  cursor: Date;
  events: CalendarEvent[];
  onSelectEvent: (e: CalendarEvent) => void;
  onReschedule: (eventId: string, newDate: Date) => void;
  onSelectDate?: (date: Date) => void;
  // Day to outline while an event is being created (the chosen start date).
  previewIso?: string | null;
  // Day currently under a dragged tray card (resolved by the parent). Highlights
  // the drop target the same way an in-grid event-chip drag does.
  hoveredDayIso?: string | null;
}

function startOfMonth(d: Date) {
  const x = new Date(d);
  x.setDate(1);
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
function isoKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function MonthGrid({
  cursor,
  events,
  onSelectEvent,
  onReschedule,
  onSelectDate,
  previewIso,
  hoveredDayIso,
}: MonthGridProps) {
  const cellRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());
  // Day currently under a dragged event chip (outline only).
  const [dragOverIso, setDragOverIso] = React.useState<string | null>(null);
  // Timestamp of the last drag release. The browser fires a trailing `click`
  // after a drag, and a rescheduled chip remounts into its new day cell (losing
  // any per-chip "did I move" flag), so the click guard lives here in the parent
  // — which survives the remount — instead of on the chip.
  const lastDragEndAt = React.useRef(0);
  // True from the moment a real drag starts (set in handleEventDrag, which fires
  // before pointer-up) until just after it ends. The browser's trailing click can
  // fire BEFORE framer-motion's async onDragEnd updates lastDragEndAt, so the
  // timestamp alone misses it; this boolean — already set during the drag —
  // catches the click regardless of ordering, and survives the chip's remount.
  const draggingRef = React.useRef(false);

  const first = startOfMonth(cursor);
  const gridStart = addDays(first, -first.getDay());
  const days: Date[] = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = new Date();

  const eventsByDay = React.useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const key = isoKey(new Date(e.startsAt));
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(e);
    }
    return m;
  }, [events]);

  function dayIsoAt(point: { x: number; y: number }): string | null {
    let found: string | null = null;
    cellRefs.current.forEach((el, iso) => {
      const r = el.getBoundingClientRect();
      if (point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom) {
        found = iso;
      }
    });
    return found;
  }

  function handleEventDrag(point: { x: number; y: number }) {
    draggingRef.current = true;
    const iso = dayIsoAt(point);
    setDragOverIso((prev) => (prev === iso ? prev : iso));
  }

  function handleEventDragEnd(event: CalendarEvent, point: { x: number; y: number }) {
    setDragOverIso(null);
    lastDragEndAt.current = Date.now();
    // Release the flag after the trailing click has had its chance to fire.
    setTimeout(() => {
      draggingRef.current = false;
    }, 0);
    const iso = dayIsoAt(point);
    if (!iso) return;
    const [y, m, d] = iso.split("-").map(Number);
    const dropDate = new Date(y, m - 1, d);
    if (!sameDay(dropDate, new Date(event.startsAt))) {
      onReschedule(event.id, dropDate);
    }
  }

  return (
    <div className="paper-card p-0 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-[color:var(--ink-line)]">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
          <div
            key={d}
            className={cn(
              "quiet-caps px-3 py-2.5 text-center",
              (i === 0 || i === 6) && "bg-black/[0.02]",
            )}
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 auto-rows-fr" style={{ minHeight: 624 }}>
        {days.map((d, i) => {
          const iso = isoKey(d);
          const list = eventsByDay.get(iso) ?? [];
          const inMonth = d.getMonth() === first.getMonth();
          const isToday = sameDay(d, today);
          const weekend = d.getDay() === 0 || d.getDay() === 6;
          const endOfRow = (i + 1) % 7 === 0;
          const lastRow = i >= 35;
          return (
            <div
              key={iso}
              data-cal-day={iso}
              ref={(el) => {
                if (el) cellRefs.current.set(iso, el);
                else cellRefs.current.delete(iso);
              }}
              onClick={() => {
                // Don't treat the click that trails a drag as a "create on this day".
                if (draggingRef.current || Date.now() - lastDragEndAt.current < 300) return;
                onSelectDate?.(d);
              }}
              className={cn(
                "relative p-2 min-h-[104px] transition-colors cursor-pointer",
                "border-r border-b border-[color:var(--ink-line)]",
                endOfRow && "border-r-0",
                lastRow && "border-b-0",
                !inMonth && "bg-black/[0.02]",
                weekend && inMonth && "bg-black/[0.008]",
                isToday && "bg-[color:var(--accent-soft)]/50",
                previewIso === iso &&
                  "ring-1 ring-inset ring-[color-mix(in_srgb,var(--accent)_45%,transparent)]",
                (dragOverIso === iso || hoveredDayIso === iso) &&
                  "bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--accent)_60%,transparent)]",
              )}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={cn(
                    "text-[11px] tabular font-medium",
                    isToday
                      ? "inline-flex items-center justify-center h-[22px] w-[22px] rounded-full bg-[color:var(--accent)] text-[color:var(--paper)]"
                      : inMonth
                        ? "text-[color:var(--ink-soft)]"
                        : "text-[color:var(--ink-faint)]",
                  )}
                >
                  {d.getDate()}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {list.slice(0, 3).map((e) => (
                  <EventChip
                    key={e.id}
                    event={e}
                    onClick={(evt) => {
                      evt.stopPropagation();
                      // Ignore the click that trails a drag-to-reschedule; only a
                      // real click (no preceding drag) opens the edit sheet.
                      if (draggingRef.current || Date.now() - lastDragEndAt.current < 300) return;
                      onSelectEvent(e);
                    }}
                    onDrag={(_, info) => handleEventDrag(info.point)}
                    onDragEnd={(_, info) => handleEventDragEnd(e, info.point)}
                    draggable
                    compact
                  />
                ))}
                {list.length > 3 && (
                  <span className="text-[10px] text-[color:var(--ink-muted)] px-1 tabular">
                    +{list.length - 3} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
