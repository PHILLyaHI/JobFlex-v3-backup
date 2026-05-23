"use client";
// V3 calendar-a — week grid.
//
// Slot behaviour:
//  - Single click on empty space → fires onSelectSlot(start, start+30min).
//  - Click-and-drag downward → fires onSelectSlot(start, end) using the dragged
//    span. While dragging, an indigo outline previews the slot in real time.
//  - After release, the WeekGrid's own preview is cleared. The parent passes
//    `slotPreview` back so the outline stays pinned to the calendar while
//    the QuickAdd sheet is open. The parent clears it on sheet dismiss.
//
// Hover-over-during-tray-drag:
//  - `hoveredDayIso` lights up the cell currently under the dragged tray
//    card so the user sees where the drop will land before releasing.

import * as React from "react";
import { motion, type PanInfo } from "framer-motion";
import { cn } from "@/lib/cn";
import { statusAccent } from "@/components/jobs/JobStatusBadge";
import type { CalendarEvent } from "@/components/calendar/EventChip";

export interface SlotPreview {
  iso: string;
  startTotalMin: number; // minutes from local midnight
  endTotalMin: number;
}

interface WeekGridProps {
  cursor: Date;
  events: CalendarEvent[];
  onSelectEvent: (e: CalendarEvent) => void;
  onMoveEvent?: (eventId: string, newDate: Date) => void;
  onResizeEvent?: (eventId: string, newStartISO: string, newEndISO: string) => void;
  onSelectSlot?: (start: Date, end: Date) => void;
  slotPreview?: SlotPreview | null;
  hoveredDayIso?: string | null;
  startHour?: number;
  endHour?: number;
}

const HOUR_PX = 56;
const SNAP_MIN = 15;
const CLICK_THRESHOLD_PX = 5;
const CLICK_DEFAULT_DURATION_MIN = 30;

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
function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
function snapMinutes(min: number) {
  return Math.round(min / SNAP_MIN) * SNAP_MIN;
}

interface ActiveDrag {
  iso: string;
  startTotalMin: number;
  currentTotalMin: number;
  startY: number;
  cellRect: DOMRect;
}

export function WeekGridA({
  cursor,
  events,
  onSelectEvent,
  onMoveEvent,
  onResizeEvent,
  onSelectSlot,
  slotPreview,
  hoveredDayIso,
  startHour = 7,
  endHour = 19,
}: WeekGridProps) {
  const cellRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const weekStart = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const today = new Date();

  const [activeDrag, setActiveDrag] = React.useState<ActiveDrag | null>(null);

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
    // Use elementsFromPoint so the dragged chip itself doesn't mask the cell.
    const newDate = findDayAt(info.point);
    if (newDate && !sameDay(newDate, new Date(event.startsAt))) {
      onMoveEvent(event.id, newDate);
    }
  }

  function findDayAt(point: { x: number; y: number }): Date | null {
    if (typeof document === "undefined") return null;
    const els = document.elementsFromPoint(point.x, point.y);
    for (const el of els) {
      const cell = (el as HTMLElement).closest?.("[data-cal-day]") as HTMLElement | null;
      if (cell) {
        const iso = cell.getAttribute("data-cal-day");
        if (iso) return parseIso(iso);
      }
    }
    return null;
  }

  function yToTotalMin(y: number) {
    const min = startHour * 60 + (y / HOUR_PX) * 60;
    return clamp(snapMinutes(min), startHour * 60, endHour * 60);
  }

  function startSlotDrag(iso: string, e: React.PointerEvent<HTMLDivElement>) {
    if (!onSelectSlot) return;
    if (e.target !== e.currentTarget) return;
    if (e.button !== 0) return;
    const cellRect = e.currentTarget.getBoundingClientRect();
    const startY = e.clientY - cellRect.top;
    const startTotalMin = yToTotalMin(startY);
    setActiveDrag({
      iso,
      startTotalMin,
      currentTotalMin: startTotalMin,
      startY,
      cellRect,
    });
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function moveSlotDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!activeDrag) return;
    const currentY = clamp(
      e.clientY - activeDrag.cellRect.top,
      0,
      hours.length * HOUR_PX,
    );
    const currentTotalMin = yToTotalMin(currentY);
    if (currentTotalMin === activeDrag.currentTotalMin) return;
    setActiveDrag({ ...activeDrag, currentTotalMin });
  }

  function endSlotDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!activeDrag) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    const drag = activeDrag;
    setActiveDrag(null);
    if (!onSelectSlot) return;

    const day = parseIso(drag.iso);
    const dist = Math.abs(drag.currentTotalMin - drag.startTotalMin);

    const startMin = Math.min(drag.startTotalMin, drag.currentTotalMin);
    const endMinRaw = Math.max(drag.startTotalMin, drag.currentTotalMin);

    if (dist === 0) {
      // Pure click — use 30 minute default duration.
      const start = new Date(day);
      start.setHours(0, drag.startTotalMin, 0, 0);
      const end = new Date(start.getTime() + CLICK_DEFAULT_DURATION_MIN * 60_000);
      onSelectSlot(start, end);
      return;
    }

    const start = new Date(day);
    start.setHours(0, startMin, 0, 0);
    const end = new Date(day);
    end.setHours(0, Math.max(endMinRaw, startMin + SNAP_MIN), 0, 0);
    onSelectSlot(start, end);
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
          const dragActiveHere = activeDrag?.iso === iso;
          const isHovered = hoveredDayIso === iso;
          const pinnedHere = !activeDrag && slotPreview?.iso === iso ? slotPreview : null;

          return (
            <div
              key={d.toISOString()}
              data-cal-day={iso}
              ref={(el) => {
                if (el) cellRefs.current.set(iso, el);
                else cellRefs.current.delete(iso);
              }}
              onPointerDown={(e) => startSlotDrag(iso, e)}
              onPointerMove={dragActiveHere ? moveSlotDrag : undefined}
              onPointerUp={dragActiveHere ? endSlotDrag : undefined}
              onPointerCancel={dragActiveHere ? endSlotDrag : undefined}
              className={cn(
                "relative border-l border-[color:var(--ink-line)] select-none transition-colors",
                weekend && "bg-black/[0.008]",
                isToday && "bg-[color:var(--accent-soft)]/30",
                isHovered && "bg-[color:var(--accent-soft)]/70 ring-1 ring-inset ring-[color:var(--accent)]/40",
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

              {dragActiveHere && activeDrag && (
                <SlotOutline
                  startTotalMin={activeDrag.startTotalMin}
                  endTotalMin={activeDrag.currentTotalMin}
                  startHour={startHour}
                  live
                />
              )}
              {pinnedHere && (
                <SlotOutline
                  startTotalMin={pinnedHere.startTotalMin}
                  endTotalMin={pinnedHere.endTotalMin}
                  startHour={startHour}
                  live={false}
                />
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

interface SlotOutlineProps {
  startTotalMin: number;
  endTotalMin: number;
  startHour: number;
  live: boolean;
}

function SlotOutline({ startTotalMin, endTotalMin, startHour, live }: SlotOutlineProps) {
  const lo = Math.min(startTotalMin, endTotalMin);
  const hi = Math.max(startTotalMin, endTotalMin);
  const top = ((lo - startHour * 60) / 60) * HOUR_PX;
  const minSpan = Math.max(SNAP_MIN, hi - lo);
  const height = (minSpan / 60) * HOUR_PX;
  const durLabel = formatDuration(minSpan);

  return (
    <div
      className={cn(
        "absolute left-1 right-1 rounded-[var(--r-sm)] pointer-events-none flex items-start justify-between px-1.5 py-1 text-[10px] tabular text-[color:var(--accent)] transition-all",
        live
          ? "border-2 border-[color:var(--accent)] bg-[color:var(--accent-soft)]/60"
          : "border-2 border-dashed border-[color:var(--accent)]/70 bg-[color:var(--accent-soft)]/35",
      )}
      style={{ top, height }}
    >
      <span>{fmtTimeFromTotalMin(lo)}</span>
      <span className="font-medium">{durLabel}</span>
    </div>
  );
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtTimeFromTotalMin(total: number) {
  const hr = Math.floor(total / 60);
  const min = total % 60;
  const h12 = ((hr + 11) % 12) + 1;
  const ampm = hr < 12 ? "am" : "pm";
  return min === 0 ? `${h12}${ampm}` : `${h12}:${String(min).padStart(2, "0")}${ampm}`;
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
      <button type="button" onClick={onClick} className="text-left flex-1 min-w-0">
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
