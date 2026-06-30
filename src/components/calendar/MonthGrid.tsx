"use client";
import * as React from "react";
import { cn } from "@/lib/cn";
import { EventChip, type CalendarEvent } from "./EventChip";
import { statusAccent } from "@/components/jobs/JobStatusBadge";

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
function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function diffDays(a: Date, b: Date) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}
// Spans more than one calendar day → drawn as a continuous bar across the days
// it covers (month) and hidden from the week time grid, where a days-long block
// would overflow the column.
function isMultiDay(e: CalendarEvent) {
  const s = new Date(e.startsAt);
  const en = new Date(e.endsAt);
  return en.getTime() > s.getTime() && !sameDay(s, en);
}

const BAR_H = 16; // multi-day bar height
const BAR_GAP = 3; // gap between stacked bar lanes
const NUM_BAND = 26; // space above the bars reserved for the day number

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
      if (isMultiDay(e)) continue; // multi-day events render as spanning bars below
      const key = isoKey(new Date(e.startsAt));
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(e);
    }
    return m;
  }, [events]);

  // Multi-day events → continuous bars. Per week, assign lanes (so overlapping
  // spans stack) and record which segment covers each day, where the true
  // start/end falls (for rounding), and where to show the title.
  const { spanByDay, lanesByWeek } = React.useMemo(() => {
    const multi = events.filter(isMultiDay);
    const spanByDay = new Map<
      string,
      { event: CalendarEvent; lane: number; roundLeft: boolean; roundRight: boolean; label: boolean }[]
    >();
    const lanesByWeek = new Map<number, number>();
    for (let w = 0; w < 6; w++) {
      const week = days.slice(w * 7, w * 7 + 7);
      const weekStart = startOfDay(week[0]);
      const weekEnd = startOfDay(week[6]);
      const segs = multi
        .map((e) => {
          const s = startOfDay(new Date(e.startsAt));
          const en = startOfDay(new Date(e.endsAt));
          if (en < weekStart || s > weekEnd) return null;
          return {
            event: e,
            s,
            en,
            startCol: Math.max(0, diffDays(weekStart, s)),
            endCol: Math.min(6, diffDays(weekStart, en)),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => a.startCol - b.startCol || b.endCol - a.endCol);

      const laneEnds: number[] = []; // last column occupied in each lane
      for (const seg of segs) {
        let lane = laneEnds.findIndex((end) => end < seg.startCol);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(seg.endCol);
        } else {
          laneEnds[lane] = seg.endCol;
        }
        for (let c = seg.startCol; c <= seg.endCol; c++) {
          const key = isoKey(week[c]);
          if (!spanByDay.has(key)) spanByDay.set(key, []);
          spanByDay.get(key)!.push({
            event: seg.event,
            lane,
            roundLeft: c === seg.startCol && sameDay(week[c], seg.s),
            roundRight: c === seg.endCol && sameDay(week[c], seg.en),
            label: c === seg.startCol,
          });
        }
      }
      lanesByWeek.set(w, laneEnds.length);
    }
    return { spanByDay, lanesByWeek };
  }, [events, days]);

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
          const spans = spanByDay.get(iso) ?? [];
          const barReserve = (lanesByWeek.get(Math.floor(i / 7)) ?? 0) * (BAR_H + BAR_GAP);
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

              {/* Multi-day events — continuous bars spanning the days they cover,
                  stacked by lane. Rounded only at the true start/end day; flush
                  with the neighbour where the event continues. */}
              {spans.map((b) => (
                <button
                  key={b.event.id}
                  type="button"
                  title={b.event.title}
                  onClick={(evt) => {
                    evt.stopPropagation();
                    if (draggingRef.current || Date.now() - lastDragEndAt.current < 300) return;
                    onSelectEvent(b.event);
                  }}
                  className={cn(
                    "absolute z-[1] flex items-center overflow-hidden text-[10px] font-medium leading-none text-white transition-opacity hover:opacity-90",
                    b.roundLeft && "rounded-l-[var(--r-sm)]",
                    b.roundRight && "rounded-r-[var(--r-sm)]",
                  )}
                  style={{
                    top: NUM_BAND + b.lane * (BAR_H + BAR_GAP),
                    left: b.roundLeft ? 4 : 0,
                    right: b.roundRight ? 4 : 0,
                    height: BAR_H,
                    background:
                      b.event.kind === "blocked" ? "#6B6A64" : statusAccent(b.event.status),
                  }}
                >
                  {b.label && <span className="truncate px-1.5">{b.event.title}</span>}
                </button>
              ))}

              <div className="flex flex-col gap-1" style={{ marginTop: barReserve }}>
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
