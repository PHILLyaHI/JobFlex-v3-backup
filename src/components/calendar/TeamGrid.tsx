"use client";
import * as React from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/Avatar";
import { EventChip, type CalendarEvent } from "./EventChip";

export interface TeamWorker {
  id: string;
  name: string;
  activeJobs: number;
}

export interface TeamEvent extends CalendarEvent {
  workerId: string | null; // null = unassigned
  jobId: string | null;
}

interface Props {
  cursor: Date;
  workers: TeamWorker[];
  events: TeamEvent[];
  onSelectEvent: (e: CalendarEvent) => void;
  onAssignEvent: (eventId: string, workerId: string | null, newDate: Date) => void;
}

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

export function TeamGrid({
  cursor,
  workers,
  events,
  onSelectEvent,
  onAssignEvent,
}: Props) {
  const cellRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const weekStart = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  const allRows: { id: string | null; label: string; node: React.ReactNode }[] = [
    {
      id: null,
      label: "Unassigned",
      node: (
        <div className="flex items-center gap-2.5 px-3">
          <div className="h-7 w-7 rounded-full bg-[color:var(--accent-soft)]/60 grid place-items-center text-[color:var(--accent)] text-[10px] font-semibold">
            UN
          </div>
          <div className="min-w-0">
            <div className="text-[12.5px] font-medium text-[color:var(--ink)]">
              Unassigned
            </div>
            <div className="text-[10px] text-[color:var(--ink-muted)] tabular">
              Drag onto a worker to assign
            </div>
          </div>
        </div>
      ),
    },
    ...workers.map((w) => ({
      id: w.id,
      label: w.name,
      node: (
        <div className="flex items-center gap-2.5 px-3">
          <Avatar name={w.name} size={28} />
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-medium text-[color:var(--ink)] truncate">
              {w.name}
            </div>
            <div className="text-[10px] text-[color:var(--ink-muted)] tabular">
              {w.activeJobs} active
            </div>
          </div>
        </div>
      ),
    })),
  ];

  function handleDragEnd(event: TeamEvent, info: PanInfo) {
    const { x, y } = info.point;
    let dropWorkerId: string | null = null;
    let dropDate: Date | null = null;
    cellRefs.current.forEach((el, key) => {
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        const [workerKey, isoDate] = key.split("|");
        const [yr, mo, da] = isoDate.split("-").map(Number);
        dropWorkerId = workerKey === "_none_" ? null : workerKey;
        dropDate = new Date(yr, mo - 1, da);
      }
    });
    if (!dropDate) return;

    const startDate = new Date(event.startsAt);
    const sameWorker = dropWorkerId === (event.workerId ?? null);
    const sameCell = sameWorker && sameDay(dropDate, startDate);
    if (sameCell) return;

    onAssignEvent(event.id, dropWorkerId, dropDate);
  }

  // Bucket events by row+day
  const byCell = React.useMemo(() => {
    const m = new Map<string, TeamEvent[]>();
    for (const e of events) {
      const start = new Date(e.startsAt);
      const day = days.find((d) => sameDay(d, start));
      if (!day) continue;
      const wKey = e.workerId ?? "_none_";
      const dKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      const key = `${wKey}|${dKey}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(e);
    }
    return m;
  }, [events, days]);

  return (
    <div className="paper-card p-0 overflow-hidden">
      {/* Header row */}
      <div className="grid grid-cols-[180px_repeat(7,1fr)] border-b border-[color:var(--ink-line)]">
        <div className="quiet-caps px-3 py-3">Worker</div>
        {days.map((d) => {
          const isToday = sameDay(d, today);
          const weekend = d.getDay() === 0 || d.getDay() === 6;
          return (
            <div
              key={d.toISOString()}
              className={cn(
                "border-l border-[color:var(--ink-line)] px-3 py-2",
                weekend && "bg-black/[0.008]",
              )}
            >
              <div className="quiet-caps">
                {new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(d)}
              </div>
              <div
                className={cn(
                  "font-display text-[16px] tabular leading-none mt-1",
                  isToday ? "text-[color:var(--accent)]" : "text-[color:var(--ink)]",
                )}
              >
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Rows */}
      {allRows.map((row, rowIdx) => {
        const isUnassigned = row.id === null;
        const wKey = row.id ?? "_none_";
        return (
          <div
            key={wKey}
            className={cn(
              "grid grid-cols-[180px_repeat(7,1fr)] border-b border-[color:var(--ink-line)] last:border-0 group",
              isUnassigned && "bg-black/[0.012]",
            )}
            style={
              isUnassigned
                ? {
                    backgroundImage:
                      "repeating-linear-gradient(45deg, transparent 0 8px, rgba(17,17,19,0.018) 8px 16px)",
                  }
                : undefined
            }
          >
            {/* Worker cell */}
            <div className="py-3 border-r border-[color:var(--ink-line)] flex items-center min-h-[88px]">
              {row.node}
            </div>
            {days.map((d) => {
              const dKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              const cellKey = `${wKey}|${dKey}`;
              const items = byCell.get(cellKey) ?? [];
              const weekend = d.getDay() === 0 || d.getDay() === 6;
              const isToday = sameDay(d, today);
              return (
                <div
                  key={cellKey}
                  data-cal-day={dKey}
                  data-cal-worker={wKey}
                  ref={(el) => {
                    if (el) cellRefs.current.set(cellKey, el);
                    else cellRefs.current.delete(cellKey);
                  }}
                  className={cn(
                    "relative border-l border-[color:var(--ink-line)] p-2 min-h-[88px] transition-colors group-hover:bg-black/[0.008]",
                    weekend && !isUnassigned && "bg-black/[0.005]",
                    isToday && "bg-[color:var(--accent-soft)]/30",
                  )}
                >
                  <AnimatePresence initial={false}>
                    {items.map((e) => (
                      <motion.div
                        key={e.id}
                        layout
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.94 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        className="mb-1"
                      >
                        <EventChip
                          event={e}
                          draggable
                          compact
                          onClick={(evt) => {
                            evt.stopPropagation();
                            onSelectEvent(e);
                          }}
                          onDragEnd={(_, info) => handleDragEnd(e, info)}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
