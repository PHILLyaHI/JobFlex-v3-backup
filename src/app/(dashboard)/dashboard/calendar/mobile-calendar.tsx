"use client";
import * as React from "react";
import { Inbox, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { BottomSheet } from "@/components/ui/BottomSheet";
import {
  MobileEventDetailSheet,
  type MobileCalendarEvent,
} from "@/components/calendar/MobileEventDetailSheet";
import { cn } from "@/lib/cn";
import { APPOINTMENT_BORDER, APPOINTMENT_TINT } from "@/components/calendar/EventChip";

interface WorkerLite {
  id: string;
  name: string;
}

interface PendingAssignment {
  id: string;
  workerName: string;
  jobTitle: string;
  jobStartsAt: Date | null;
}

interface MobileCalendarProps {
  events: MobileCalendarEvent[];
  workers: WorkerLite[];
  pendingAssignments: PendingAssignment[];
}

const DAY_COUNT = 21; // 3 weeks rolling
const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const SHORT_MONTH = new Intl.DateTimeFormat("en-US", { month: "short" });

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayKeyFromIso(iso: string): string {
  return dayKey(new Date(iso));
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function statusTone(s: string): "neutral" | "accent" | "success" | "warn" | "danger" {
  if (s === "COMPLETED") return "success";
  if (s === "IN_PROGRESS") return "accent";
  if (s === "CANCELLED") return "danger";
  return "neutral";
}

export function MobileCalendar({ events, workers, pendingAssignments }: MobileCalendarProps) {
  const today = React.useMemo(() => startOfDay(new Date()), []);
  const days = React.useMemo(() => {
    return Array.from({ length: DAY_COUNT }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  }, [today]);

  const [selectedKey, setSelectedKey] = React.useState<string>(dayKey(today));
  const [openEvent, setOpenEvent] = React.useState<MobileCalendarEvent | null>(null);
  const [inboxOpen, setInboxOpen] = React.useState(false);

  const eventsByDay = React.useMemo(() => {
    const map = new Map<string, MobileCalendarEvent[]>();
    for (const e of events) {
      const k = dayKeyFromIso(e.startsAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    }
    return map;
  }, [events]);

  const todayEvents = eventsByDay.get(selectedKey) ?? [];
  const todayKey = dayKey(today);
  const pendingCount = pendingAssignments.length;

  return (
    <div className="-mx-6 pt-safe">
      <header className="px-5 pt-1 pb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="quiet-caps">Delivery</div>
          <h1 className="font-display text-[26px] tracking-[-0.02em] leading-tight">Schedule</h1>
          <p className="mt-1 text-[12px] text-[color:var(--ink-muted)]">
            Day-by-day agenda. Tap any event for the details.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setInboxOpen(true)}
          aria-label={`Crew inbox, ${pendingCount} pending`}
          className="relative shrink-0 h-10 w-10 rounded-[var(--r-md)] hairline grid place-items-center text-[color:var(--ink-soft)] hover:bg-black/[0.04] focus-ring"
        >
          <Inbox className="h-4 w-4" />
          {pendingCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 min-w-[20px] rounded-full bg-[color:var(--accent)] text-[10px] font-medium text-white grid place-items-center px-1 tabular">
              {pendingCount}
            </span>
          )}
        </button>
      </header>

      <div className="overflow-x-auto snap-x snap-mandatory">
        <ul className="flex gap-2 px-5 pb-3">
          {days.map((d) => {
            const k = dayKey(d);
            const selected = k === selectedKey;
            const isToday = k === todayKey;
            const dayCount = eventsByDay.get(k)?.length ?? 0;
            return (
              <li key={k} className="snap-start shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedKey(k)}
                  className={cn(
                    "min-w-[56px] py-2 px-2.5 rounded-[var(--r-md)] flex flex-col items-center gap-0.5",
                    "focus-ring transition-colors",
                    selected
                      ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]"
                      : "text-[color:var(--ink-soft)] hover:bg-black/[0.04]",
                  )}
                >
                  <span className={cn("text-[10px] tracking-[0.08em] uppercase", selected ? "opacity-90" : "opacity-70")}>
                    {WEEKDAY.format(d)}
                  </span>
                  <span className="font-display tabular text-[18px] leading-none">{d.getDate()}</span>
                  <span className={cn("text-[10px] tabular mt-0.5", isToday && !selected && "text-[color:var(--accent)]")}>
                    {dayCount > 0 ? `${dayCount} ${dayCount === 1 ? "event" : "events"}` : isToday ? "today" : SHORT_MONTH.format(d)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <section className="px-5 mt-3">
        {todayEvents.length === 0 ? (
          <div className="paper-card px-5 py-8 grid place-items-center text-center">
            <CalendarDays className="h-6 w-6 text-[color:var(--ink-faint)]" />
            <div className="mt-3 text-[13px] font-medium">Nothing on this day</div>
            <div className="text-[11px] text-[color:var(--ink-muted)] mt-1">
              Pick another day, or schedule a new job from the &lsquo;+&rsquo; below.
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {todayEvents.map((e) => {
              const isBlocked = e.kind === "blocked";
              const isAppointment = e.kind === "appointment";
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setOpenEvent(e)}
                    style={
                      isAppointment
                        ? { borderLeft: `3px solid ${APPOINTMENT_BORDER}`, backgroundColor: APPOINTMENT_TINT }
                        : undefined
                    }
                    className={cn(
                      "w-full flex items-start gap-3 py-3 -mx-1 px-1 rounded-[var(--r-sm)] text-left",
                      "hover:bg-black/[0.02] focus-ring transition-colors",
                      isAppointment && "pl-2",
                      isBlocked && "opacity-70",
                    )}
                  >
                    <div className="shrink-0 w-14 pt-0.5">
                      <div className="tabular text-[12px] font-medium text-[color:var(--ink)]">
                        {formatTime(e.startsAt)}
                      </div>
                      <div className="tabular text-[10px] text-[color:var(--ink-muted)] mt-0.5">
                        {formatTime(e.endsAt)}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">
                        {e.title}
                      </div>
                      <div className="text-[11px] text-[color:var(--ink-muted)] truncate mt-0.5">
                        {e.clientName ?? (isBlocked ? "Blocked time" : e.kind === "appointment" ? "Lead appointment" : "Job")}
                      </div>
                    </div>
                    {!isBlocked ? (
                      <Badge tone={statusTone(e.status)}>{e.status.toLowerCase()}</Badge>
                    ) : (
                      <Badge tone="neutral">blocked</Badge>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <MobileEventDetailSheet
        event={openEvent}
        workers={workers}
        onClose={() => setOpenEvent(null)}
      />

      <BottomSheet
        open={inboxOpen}
        onClose={() => setInboxOpen(false)}
        title={`Crew inbox &middot; ${pendingCount} pending`}
      >
        {pendingAssignments.length === 0 ? (
          <p className="text-[13px] text-[color:var(--ink-muted)]">
            All assignments accepted. Nothing to follow up on.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {pendingAssignments.map((a) => (
              <li key={a.id} className="py-3">
                <div className="text-[13px] font-medium text-[color:var(--ink)]">
                  {a.workerName}
                </div>
                <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">
                  {a.jobTitle}
                  {a.jobStartsAt && (
                    <>
                      {" "}&middot;{" "}
                      <span className="tabular">
                        {new Intl.DateTimeFormat("en-US", {
                          month: "short",
                          day: "numeric",
                        }).format(a.jobStartsAt)}
                      </span>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </BottomSheet>
    </div>
  );
}
