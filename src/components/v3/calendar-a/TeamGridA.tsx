"use client";
// V3 calendar-a — team-slots grid with alignment fix.
//
// Original bug: the body row's Worker cell carried `border-r` while the
// header's Worker cell did not. Combined with `border-l` on every day
// column, that produced a 2px line at the Worker|Sun boundary in body rows
// and only a 1px line in the header, so the day columns visibly drifted
// down the page. Fix: drop the redundant `border-r` on the worker cell so
// both header and body rely on the same `border-l` per day column.

import * as React from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/Avatar";
import { EventChip, type CalendarEvent } from "@/components/calendar/EventChip";

export interface TeamWorker {
  id: string;
  name: string;
  activeJobs: number;
}

export interface TeamEvent extends CalendarEvent {
  workerId: string | null;
  jobId: string | null;
}

// One expanded occurrence of a recurring unavailability rule (or any
// person-scoped "not working" window) shown as a striped cell wash.
export interface TeamUnavailability {
  personKey: string;
  startsAt: string;
  endsAt: string;
  /** Calendar date (YYYY-MM-DD) of the occurrence — timezone-stable, computed
   * at expansion time rather than re-derived from the UTC instant here. */
  dateKey: string;
  reason: string;
  /** Whole day off → full-cell wash; otherwise a striped time card. */
  fullDay?: boolean;
  /** e.g. "8a–12p" — shown on partial (non-full-day) cards. */
  timeLabel?: string | null;
  /** Set for recurring occurrences — enables "free up this day". */
  ruleId?: string | null;
}

interface Props {
  cursor: Date;
  workers: TeamWorker[];
  /** Non-assignable rows (owner / managers) rendered under the workers. */
  extras?: TeamWorker[];
  events: TeamEvent[];
  unavailability?: TeamUnavailability[];
  onSelectEvent: (e: CalendarEvent) => void;
  onAssignEvent: (eventId: string, workerId: string | null, newDate: Date) => void;
  onFreeInstance?: (ruleId: string, dateISO: string, reason: string) => void;
  /** Key shaped as `${workerId|_none_}|${iso}` highlighting the drop target while a tray card is being dragged. */
  hoveredCellKey?: string | null;
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

export function TeamGridA({
  cursor,
  workers,
  extras = [],
  events,
  unavailability = [],
  onSelectEvent,
  onAssignEvent,
  onFreeInstance,
  hoveredCellKey,
}: Props) {
  const cellRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());
  // Worker|day cell under a dragged event chip — lights up the drop target the
  // same way a tray-card drag does (hoveredCellKey), so a chip move previews
  // where it will land before release.
  const [dragOverKey, setDragOverKey] = React.useState<string | null>(null);
  // Drag guard: true during a chip drag so the browser's trailing click (which
  // can fire before framer-motion's async onDragEnd) doesn't open the detail sheet.
  const draggingRef = React.useRef(false);
  const lastDragEndAt = React.useRef(0);
  const weekStart = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  const personRow = (w: TeamWorker, subtitle: string) => ({
    id: w.id as string | null,
    label: w.name,
    node: (
      <div className="flex items-center gap-2.5 px-3">
        <Avatar name={w.name} size={28} />
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-medium text-[color:var(--ink)] truncate">
            {w.name}
          </div>
          <div className="text-[10px] text-[color:var(--ink-muted)] tabular">{subtitle}</div>
        </div>
      </div>
    ),
  });

  // The id set of rows a job can actually be dropped on. Extras (owner /
  // managers) show their schedule but can't take JobAssignments.
  const assignableIds = React.useMemo(() => new Set(workers.map((w) => w.id)), [workers]);

  const hasUnassigned = events.some((e) => e.workerId === null);
  const allRows: { id: string | null; label: string; node: React.ReactNode }[] = [
    ...workers.map((w) => personRow(w, `${w.activeJobs} active`)),
    ...extras.map((w) => personRow(w, "Office")),
    // Standalone / unassigned events need a home row, or they vanish from the
    // team view entirely (the old "scheduled but nobody looks busy" bug).
    ...(hasUnassigned
      ? [
          {
            id: null,
            label: "Unassigned",
            node: (
              <div className="px-3">
                <div className="text-[12.5px] font-medium text-[color:var(--ink-muted)]">
                  Unassigned
                </div>
                <div className="text-[10px] text-[color:var(--ink-faint)]">
                  Drag onto a worker to dispatch
                </div>
              </div>
            ),
          },
        ]
      : []),
  ];

  const unavailByCell = React.useMemo(() => {
    const m = new Map<string, TeamUnavailability[]>();
    for (const u of unavailability) {
      const key = `${u.personKey}|${u.dateKey}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(u);
    }
    return m;
  }, [unavailability]);

  // Hit-test the worker|day cell under a point (chip drag-over + drop both use it).
  function cellKeyAt(point: { x: number; y: number }): string | null {
    let found: string | null = null;
    cellRefs.current.forEach((el, key) => {
      const r = el.getBoundingClientRect();
      if (point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom) {
        found = key;
      }
    });
    return found;
  }

  function handleDrag(info: PanInfo) {
    draggingRef.current = true;
    const key = cellKeyAt(info.point);
    setDragOverKey((prev) => (prev === key ? prev : key));
  }

  function handleDragEnd(event: TeamEvent, info: PanInfo) {
    setDragOverKey(null);
    lastDragEndAt.current = Date.now();
    // Release the flag after the trailing click has had its chance to fire.
    setTimeout(() => {
      draggingRef.current = false;
    }, 0);

    const key = cellKeyAt(info.point);
    if (!key) return;
    const [workerKey, isoDate] = key.split("|");
    const [yr, mo, da] = isoDate.split("-").map(Number);
    const dropWorkerId = workerKey === "_none_" ? null : workerKey;
    // Owner/manager rows show their schedule but can't take job assignments —
    // let the chip snap back rather than firing a doomed action.
    if (dropWorkerId && !assignableIds.has(dropWorkerId)) return;
    const dropDate = new Date(yr, mo - 1, da);

    const startDate = new Date(event.startsAt);
    const sameWorker = dropWorkerId === (event.workerId ?? null);
    if (sameWorker && sameDay(dropDate, startDate)) return;

    onAssignEvent(event.id, dropWorkerId, dropDate);
  }

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
      {/* Header row — Worker column has no border-r; day columns each get a single border-l. */}
      <div className="grid grid-cols-[180px_repeat(7,minmax(0,1fr))] border-b border-[color:var(--ink-line)]">
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

      {/* Rows — Worker cell drops the redundant border-r so column dividers line up with the header. */}
      {allRows.map((row) => {
        const isUnassigned = row.id === null;
        const wKey = row.id ?? "_none_";
        return (
          <div
            key={wKey}
            className={cn(
              "grid grid-cols-[180px_repeat(7,minmax(0,1fr))] border-b border-[color:var(--ink-line)] last:border-0 group",
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
            <div className="py-3 flex items-center min-h-[88px]">{row.node}</div>
            {days.map((d) => {
              const dKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              const cellKey = `${wKey}|${dKey}`;
              const allItems = byCell.get(cellKey) ?? [];
              const dayEnd = addDays(d, 1);
              // A blocked event covering the entire day joins the full-cell wash;
              // a partial one stays a striped chip (EventChip renders it striped).
              const isFullDayBlock = (e: TeamEvent) =>
                e.kind === "blocked" &&
                new Date(e.startsAt).getTime() <= d.getTime() &&
                // tolerate an all-day end stored as 23:59:59.999
                new Date(e.endsAt).getTime() >= dayEnd.getTime() - 60_000;
              const items = allItems.filter((e) => !isFullDayBlock(e));
              const unavail = unavailByCell.get(cellKey) ?? [];
              const fullDayRule = unavail.find((u) => u.fullDay);
              const partialRules = unavail.filter((u) => !u.fullDay);
              const fullDayBlockedEvent = allItems.find(isFullDayBlock);
              // Whole-day wash: reason + (for recurring) a free-up affordance.
              const wash = fullDayRule
                ? { reason: fullDayRule.reason, ruleId: fullDayRule.ruleId, date: fullDayRule.dateKey }
                : fullDayBlockedEvent
                  ? { reason: fullDayBlockedEvent.title, ruleId: null as string | null, date: dKey }
                  : null;
              const weekend = d.getDay() === 0 || d.getDay() === 6;
              const isToday = sameDay(d, today);
              const isHovered = hoveredCellKey === cellKey || dragOverKey === cellKey;
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
                    "relative min-w-0 border-l border-[color:var(--ink-line)] p-2 min-h-[88px] transition-colors group-hover:bg-black/[0.008]",
                    weekend && !isUnassigned && "bg-black/[0.005]",
                    // var()+opacity slash syntax emits no CSS in this project —
                    // color-mix is the working equivalent.
                    isToday && "bg-[color-mix(in_srgb,var(--accent-soft)_30%,transparent)]",
                    isHovered &&
                      "bg-[color-mix(in_srgb,var(--accent-soft)_70%,transparent)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--accent)_40%,transparent)]",
                  )}
                >
                  {/* Whole day off → full-cell rose wash (click a recurring one
                      to free just this date). */}
                  {wash && (
                    <button
                      type="button"
                      disabled={!(wash.ruleId && onFreeInstance)}
                      onClick={(evt) => {
                        evt.stopPropagation();
                        if (wash.ruleId && onFreeInstance)
                          onFreeInstance(wash.ruleId, wash.date, wash.reason);
                      }}
                      title={
                        wash.ruleId && onFreeInstance
                          ? `${wash.reason} — click to free up this day`
                          : wash.reason
                      }
                      className="absolute inset-0 z-0 text-left cursor-pointer disabled:cursor-default"
                      style={{
                        backgroundImage:
                          "repeating-linear-gradient(135deg, rgba(225,29,72,0.07) 0 6px, transparent 6px 12px)",
                        backgroundColor: "rgba(225,29,72,0.02)",
                        boxShadow: "inset 3px 0 0 var(--rose)",
                      }}
                    >
                      <span className="absolute bottom-1 left-2 right-2 truncate text-[9px] font-medium text-[color:var(--rose)]">
                        {wash.reason}
                      </span>
                    </button>
                  )}

                  {/* Certain hours off → striped time card (not a full wash). */}
                  {partialRules.map((u) => {
                    const canFree = Boolean(u.ruleId && onFreeInstance);
                    return (
                      <button
                        key={u.ruleId ?? u.reason}
                        type="button"
                        disabled={!canFree}
                        onClick={(evt) => {
                          evt.stopPropagation();
                          if (canFree) onFreeInstance!(u.ruleId!, u.dateKey, u.reason);
                        }}
                        title={
                          canFree ? `${u.reason} — click to free up this day` : u.reason
                        }
                        className="relative z-[1] mb-1 flex w-full items-center gap-1 rounded-[var(--r-sm)] border border-[color:var(--ink-line)] border-l-[3px] px-1.5 py-[3px] text-left text-[10px] leading-tight cursor-pointer disabled:cursor-default"
                        style={{
                          borderLeftColor: "var(--rose)",
                          backgroundImage:
                            "repeating-linear-gradient(135deg, rgba(225,29,72,0.08) 0 5px, transparent 5px 10px)",
                        }}
                      >
                        {u.timeLabel && (
                          <span className="tabular text-[color:var(--rose)] shrink-0">
                            {u.timeLabel}
                          </span>
                        )}
                        <span className="truncate text-[color:var(--ink-muted)]">{u.reason}</span>
                      </button>
                    );
                  })}

                  <AnimatePresence initial={false}>
                    {items.map((e) => (
                      <motion.div
                        key={e.id}
                        layout
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.94 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        className="relative z-[1] mb-1 min-w-0"
                      >
                        <EventChip
                          event={e}
                          draggable
                          compact
                          className="w-full"
                          onClick={(evt) => {
                            evt.stopPropagation();
                            // Suppress the click that trails a drag-to-reassign.
                            if (draggingRef.current || Date.now() - lastDragEndAt.current < 300)
                              return;
                            onSelectEvent(e);
                          }}
                          onDrag={(_, info) => handleDrag(info)}
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
