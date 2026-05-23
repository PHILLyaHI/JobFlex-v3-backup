"use client";
// V3 calendar-a — week grid with click-and-drag slot creation.
//
// New behavior: pointer-down on an empty slot starts a drag region. As the
// user drags downward (or upward), an indigo outline previews the duration.
// Releasing fires `onSelectSlot(start, durationMin)` so the quick-add sheet
// opens pre-filled with both the start time and the drawn duration. A simple
// click (no drag) still works — it opens the sheet with the clicked hour and
// no duration override, matching the original behaviour.

import * as React from "react";
import { motion, type PanInfo } from "framer-motion";
import { cn } from "@/lib/cn";
import { statusAccent } from "@/components/jobs/JobStatusBadge";
import type { CalendarEvent } from "@/components/calendar/EventChip";

interface WeekGridProps {
  cursor: Date;
  events: CalendarEvent[];
  onSelectEvent: (e: CalendarEvent) => void;
  onMoveEvent?: (eventId: string, newDate: Date) => void;
  onResizeEvent?: (eventId: string, newStartISO: string, newEndISO: string) => void;
  onSelectSlot?: (start: Date, durationMin?: number) => void;
  startHour?: number;
  endHour?: number;
}

const HOUR_PX = 56;
const SNAP_MIN = 15;
const CLICK_THRESHOLD_PX = 5;

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
function isoKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function yToHourMin(y: number, startHour: number, snapMin = SNAP_MIN) {
  const hourFloat = startHour + y / HOUR_PX;
  const totalMinutes = Math.round(hourFloat * 60 / snapMin) * snapMin;
  const hr = Math.floor(totalMinutes / 60);
  const min = totalMinutes % 60;
  return { hr, min, totalMinutes };
}

interface SlotDrag {
  iso: string;
  startY: number;
  currentY: number;
  cellRect: DOMRect;
}

export function WeekGridA({
  cursor,
  events,
  onSelectEvent,
  onMoveEvent,
  onResizeEvent,
  onSelectSlot,
  startHour = 7,
  endHour = 19,
}: WeekGridProps) {
  const cellRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const weekStart = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const today = new Date();

  const [slotDrag, setSlotDrag] = React.useState<SlotDrag | null>(null);

  function positionFor(e: CalendarEvent, day: Date) {
    const start = new Date(e.startsAt);
    const end = new Date(e.endsAt);
    if (!sameDay(start, day)) return null;
    const top =
      (start.getHours() - startHour) * HOUR_PX + (start.getMinutes() / 60) * HOUR_PX;
    const durMs = end.getTime() - start.getTime();
    const height = Math.max(28, (durMs / (1000 * 60 * 60)) * HOUR_PX);
    return { top, height };
  }

  const currentTimeOffset =
    today.getHours() >= startHour && today.getHours() < endHour
      ? (today.getHours() - startHour) * HOUR_PX + (today.getMinutes() / 60) * HOUR_PX
      : null;

  function handleMoveEnd(event: CalendarEvent, info: PanInfo) {
    if (!onMoveEvent) return;
    let newDate: Date | null = null;
    cellRefs.current.forEach((el, iso) => {
      const r = el.getBoundingClientRect();
      if (
        info.point.x >= r.left &&
        info.point.x <= r.right &&
        info.point.y >= r.top &&
        info.point.y <= r.bottom
      ) {
        const [y, m, d] = iso.split("-").map(Number);
        newDate = new Date(y, m - 1, d);
      }
    });
    if (newDate && !sameDay(newDate, new Date(event.startsAt))) {
      onMoveEvent(event.id, newDate);
    }
  }

  function startSlotDrag(day: Date, iso: string, e: React.PointerEvent<HTMLDivElement>) {
    if (!onSelectSlot) return;
    if (e.target !== e.currentTarget) return; // ignore clicks on chips/children
    if (e.button !== 0) return; // primary button only
    const cellRect = e.currentTarget.getBoundingClientRect();
    const startY = e.clientY - cellRect.top;
    setSlotDrag({ iso, startY, currentY: startY, cellRect });
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function moveSlotDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!slotDrag) return;
    const { cellRect } = slotDrag;
    const currentY = clamp(e.clientY - cellRect.top, 0, hours.length * HOUR_PX);
    setSlotDrag({ ...slotDrag, currentY });
  }

  function endSlotDrag(e: React.PointerEvent<HTMLDivElement>) {
    const drag = slotDrag;
    if (!drag) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* no-op if not captured */
    }
    setSlotDrag(null);
    if (!onSelectSlot) return;

    const [y, m, d] = drag.iso.split("-").map(Number);
    const day = new Date(y, m - 1, d);
    const dist = Math.abs(drag.currentY - drag.startY);

    if (dist < CLICK_THRESHOLD_PX) {
      const { hr, min } = yToHourMin(drag.startY, startHour);
      const start = new Date(day);
      start.setHours(hr, min, 0, 0);
      onSelectSlot(start);
      return;
    }

    const lowY = Math.min(drag.startY, drag.currentY);
    const highY = Math.max(drag.startY, drag.currentY);
    const startInfo = yToHourMin(lowY, startHour);
    const endInfo = yToHourMin(highY, startHour);
    const start = new Date(day);
    start.setHours(startInfo.hr, startInfo.min, 0, 0);
    const durationMin = Math.max(SNAP_MIN, endInfo.totalMinutes - startInfo.totalMinutes);
    onSelectSlot(start, durationMin);
  }

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
        <div>
          {hours.map((h) => (
            <div
              key={h}
              style={{ height: HOUR_PX }}
              className="text-[10px] text-[color:var(--ink-muted)] text-right pr-2 pt-1 tabular border-t border-[color:var(--ink-line)]"
            >
              {h === 12 ? "Noon" : h > 12 ? `${h - 12} pm` : `${h} am`}
            </div>
          ))}
        </div>

        {days.map((d) => {
          const weekend = d.getDay() === 0 || d.getDay() === 6;
          const isToday = sameDay(d, today);
          const iso = isoKey(d);
          const dragActiveHere = slotDrag?.iso === iso;
          return (
            <div
              key={d.toISOString()}
              data-cal-day={iso}
              ref={(el) => {
                if (el) cellRefs.current.set(iso, el);
                else cellRefs.current.delete(iso);
              }}
              onPointerDown={(e) => startSlotDrag(d, iso, e)}
              onPointerMove={dragActiveHere ? moveSlotDrag : undefined}
              onPointerUp={dragActiveHere ? endSlotDrag : undefined}
              onPointerCancel={dragActiveHere ? endSlotDrag : undefined}
              className={cn(
                "relative border-l border-[color:var(--ink-line)] select-none",
                weekend && "bg-black/[0.008]",
                isToday && "bg-[color:var(--accent-soft)]/30",
                onSelectSlot && "cursor-pointer",
              )}
              style={{ height: hours.length * HOUR_PX }}
            >
              {hours.map((h) => (
                <div
                  key={h}
                  className="border-t border-[color:var(--ink-line)] pointer-events-none"
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

              {dragActiveHere && slotDrag && (
                <SlotPreview drag={slotDrag} startHour={startHour} />
              )}

              {events
                .filter((e) => sameDay(new Date(e.startsAt), d))
                .map((e) => {
                  const pos = positionFor(e, d);
                  if (!pos) return null;
                  return (
                    <WeekEventChip
                      key={e.id}
                      event={e}
                      top={pos.top}
                      height={pos.height}
                      hourPx={HOUR_PX}
                      onClick={() => onSelectEvent(e)}
                      onMoveEnd={(info) => handleMoveEnd(e, info)}
                      onResize={(deltaPx) => {
                        if (!onResizeEvent) return;
                        const deltaMin = Math.round((deltaPx / HOUR_PX) * 60 / 15) * 15;
                        const start = new Date(e.startsAt);
                        const end = new Date(e.endsAt);
                        const newEnd = new Date(end.getTime() + deltaMin * 60 * 1000);
                        if (newEnd.getTime() - start.getTime() < 15 * 60 * 1000) return;
                        onResizeEvent(e.id, start.toISOString(), newEnd.toISOString());
                      }}
                    />
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SlotPreview({ drag, startHour }: { drag: SlotDrag; startHour: number }) {
  const top = Math.min(drag.startY, drag.currentY);
  const bottom = Math.max(drag.startY, drag.currentY);
  const height = Math.max(SNAP_MIN / 60 * HOUR_PX, bottom - top);
  const startInfo = yToHourMin(top, startHour);
  const endInfo = yToHourMin(top + height, startHour);
  const durationMin = endInfo.totalMinutes - startInfo.totalMinutes;
  const durLabel =
    durationMin >= 60
      ? `${Math.floor(durationMin / 60)}h${durationMin % 60 ? ` ${durationMin % 60}m` : ""}`
      : `${durationMin}m`;

  return (
    <div
      className="absolute left-1 right-1 rounded-[var(--r-sm)] border-2 border-[color:var(--accent)] bg-[color:var(--accent-soft)]/60 pointer-events-none flex items-start justify-between px-1.5 py-1 text-[10px] tabular text-[color:var(--accent)]"
      style={{ top, height }}
    >
      <span>{fmtTime(startInfo)}</span>
      <span className="font-medium">{durLabel}</span>
    </div>
  );
}

function fmtTime({ hr, min }: { hr: number; min: number }) {
  const h12 = ((hr + 11) % 12) + 1;
  const ampm = hr < 12 ? "am" : "pm";
  return min === 0 ? `${h12}${ampm}` : `${h12}:${String(min).padStart(2, "0")}${ampm}`;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

interface WeekEventChipProps {
  event: CalendarEvent;
  top: number;
  height: number;
  hourPx: number;
  onClick: () => void;
  onMoveEnd: (info: PanInfo) => void;
  onResize: (deltaPx: number) => void;
}

function WeekEventChip({
  event,
  top,
  height,
  hourPx,
  onClick,
  onMoveEnd,
  onResize,
}: WeekEventChipProps) {
  const [resizing, setResizing] = React.useState(false);
  const [resizeDelta, setResizeDelta] = React.useState(0);
  const startTime = new Date(event.startsAt);
  const endTime = new Date(event.endsAt);

  const previewEnd = new Date(
    endTime.getTime() + Math.round((resizeDelta / hourPx) * 60 / 15) * 15 * 60 * 1000,
  );
  const previewDurationMin = Math.max(
    15,
    Math.round((previewEnd.getTime() - startTime.getTime()) / 60000),
  );
  const liveHeight = Math.max(28, (previewDurationMin / 60) * hourPx);

  return (
    <motion.div
      drag={!resizing}
      dragSnapToOrigin
      dragElastic={0.12}
      whileDrag={{
        scale: 0.97,
        rotate: 0.3,
        boxShadow: "0 18px 40px -16px rgba(17,17,19,0.32)",
        zIndex: 30,
      }}
      onDragEnd={(_, info) => onMoveEnd(info)}
      onPointerDown={(e) => e.stopPropagation()}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: "absolute",
        top,
        height: resizing ? liveHeight : height,
        left: 4,
        right: 4,
        borderLeftColor: statusAccent(event.status),
        touchAction: "none",
        zIndex: resizing ? 20 : 10,
      }}
      className="group flex flex-col justify-start rounded-[var(--r-sm)] bg-white dark:bg-white/[0.08] border border-[color:var(--ink-line)] border-l-[3px] px-2 py-1 text-left text-[11px] leading-tight overflow-hidden shadow-[0_1px_0_rgba(17,17,19,0.04)] hover:shadow-[0_4px_14px_-6px_rgba(17,17,19,0.18)] transition-shadow cursor-grab active:cursor-grabbing"
    >
      <button
        type="button"
        onClick={onClick}
        className="text-left flex-1 min-w-0"
      >
        <div className="font-medium text-[color:var(--ink)] truncate">{event.title}</div>
        <div className="text-[10px] text-[color:var(--ink-muted)] tabular">
          {formatTime(startTime)}
        </div>
      </button>

      <motion.div
        drag="y"
        dragMomentum={false}
        dragElastic={0}
        onDragStart={() => {
          setResizing(true);
          setResizeDelta(0);
        }}
        onDrag={(_, info) => setResizeDelta(info.offset.y)}
        onDragEnd={(_, info) => {
          onResize(info.offset.y);
          setResizing(false);
          setResizeDelta(0);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute left-0 right-0 bottom-0 h-2 cursor-ns-resize flex items-center justify-center group/handle"
        style={{ touchAction: "none" }}
      >
        <span
          className="flex items-center gap-[3px] opacity-30 group-hover/handle:opacity-0 transition-opacity"
          aria-hidden
        >
          <span className="h-[2px] w-[2px] rounded-full bg-[color:var(--ink)]" />
          <span className="h-[2px] w-[2px] rounded-full bg-[color:var(--ink)]" />
          <span className="h-[2px] w-[2px] rounded-full bg-[color:var(--ink)]" />
        </span>
        <span className="absolute left-1.5 right-1.5 bottom-0 h-[3px] bg-[color:var(--accent)] opacity-0 group-hover/handle:opacity-100 transition-opacity rounded-full" />
      </motion.div>

      {resizing && (
        <div className="absolute -right-1 translate-x-full top-1/2 -translate-y-1/2 ml-2 paper-card px-2 py-1 text-[10px] tabular shadow-pop pointer-events-none whitespace-nowrap">
          {formatTime(previewEnd)} · {Math.floor(previewDurationMin / 60)}h
          {previewDurationMin % 60 ? `${previewDurationMin % 60}m` : ""}
        </div>
      )}
    </motion.div>
  );
}

function formatTime(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}
