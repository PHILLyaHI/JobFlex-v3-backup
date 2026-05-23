"use client";
// V3 calendar-a — frontend-design orchestrator. Mirrors the original
// calendar-view but wires the modified WeekGridA / TeamGridA / UnscheduledTrayA
// / JobDispatchCardA / QuickAddEventSheetA, and auto-opens the detail sheet
// after a reschedule.

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PanInfo } from "framer-motion";
import { PageHeader } from "@/components/ui/PageHeader";
import { CalendarToolbar } from "@/components/calendar/CalendarToolbar";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { WeekGridA } from "@/components/v3/calendar-a/WeekGridA";
import { TeamGridA, type TeamWorker, type TeamEvent } from "@/components/v3/calendar-a/TeamGridA";
import { EventDetailSheet } from "@/components/calendar/EventDetailSheet";
import { UnscheduledTrayA } from "@/components/v3/calendar-a/UnscheduledTrayA";
import { CalendarFilters } from "@/components/calendar/CalendarFilters";
import {
  QuickAddEventSheetA,
  type QuickAddJobOption,
  type QuickAddLeadOption,
  type QuickAddWorkerOption,
} from "@/components/v3/calendar-a/QuickAddEventSheetA";
import { InboxSheet, type InboxAssignment } from "@/components/calendar/InboxSheet";
import { useCalendarStore } from "@/stores/useCalendarStore";
import { toast } from "@/components/ui/Toast";
import {
  rescheduleJobEvent,
  rescheduleJobEventTime,
  deleteJobEvent,
  scheduleJobFromTray,
  assignEventWorker,
} from "@/actions/jobs";
import { rescheduleAppointment, deleteAppointment } from "@/actions/appointments";
import { rescheduleBlockedTime, deleteBlockedTime } from "@/actions/blockedTime";
import { assignWorker } from "@/actions/workers";
import type { CalendarEvent, CalendarEventKind } from "@/components/calendar/EventChip";
import type { DispatchableJob } from "@/components/v3/calendar-a/JobDispatchCardA";

interface RawEvent {
  id: string;
  kind: CalendarEventKind;
  jobId: string | null;
  leadId: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
  notes: string | null;
  workerIds: string[];
  clientName: string | null;
}

interface Props {
  events: RawEvent[];
  unscheduledJobs: DispatchableJob[];
  workers: TeamWorker[];
  pickerJobs: QuickAddJobOption[];
  pickerLeads: QuickAddLeadOption[];
  pickerWorkers: QuickAddWorkerOption[];
  pendingAssignments: InboxAssignment[];
}

function parseEventId(id: string): { kind: CalendarEventKind; dbId: string } {
  if (id.startsWith("apt:")) return { kind: "appointment", dbId: id.slice(4) };
  if (id.startsWith("block:")) return { kind: "blocked", dbId: id.slice(6) };
  return { kind: "job", dbId: id };
}

export function CalendarViewA({
  events,
  unscheduledJobs,
  workers,
  pickerJobs,
  pickerLeads,
  pickerWorkers,
  pendingAssignments,
}: Props) {
  const router = useRouter();
  const view = useCalendarStore((s) => s.view);
  const setView = useCalendarStore((s) => s.setView);
  const cursorISO = useCalendarStore((s) => s.cursorISO);
  const prev = useCalendarStore((s) => s.prev);
  const next = useCalendarStore((s) => s.next);
  const today = useCalendarStore((s) => s.today);
  const trayOpen = useCalendarStore((s) => s.trayOpen);
  const setTrayOpen = useCalendarStore((s) => s.setTrayOpen);
  const selectedWorkerIds = useCalendarStore((s) => s.selectedWorkerIds);
  const selectedStatuses = useCalendarStore((s) => s.selectedStatuses);
  const query = useCalendarStore((s) => s.query);
  const setSelectedWorkerIds = useCalendarStore((s) => s.setSelectedWorkerIds);
  const setSelectedStatuses = useCalendarStore((s) => s.setSelectedStatuses);
  const setQuery = useCalendarStore((s) => s.setQuery);
  const clearFilters = useCalendarStore((s) => s.clearFilters);

  const [selected, setSelected] = React.useState<CalendarEvent | null>(null);
  const [quickAddOpen, setQuickAddOpen] = React.useState(false);
  const [quickAddDate, setQuickAddDate] = React.useState<Date | null>(null);
  const [quickAddDuration, setQuickAddDuration] = React.useState<number | null>(null);
  const [quickAddKind, setQuickAddKind] = React.useState<CalendarEventKind>("job");
  const [inboxOpen, setInboxOpen] = React.useState(false);

  const cursor = new Date(cursorISO);

  const filteredEvents = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(e.status)) return false;
      if (
        selectedWorkerIds.length > 0 &&
        !e.workerIds.some((w) => selectedWorkerIds.includes(w))
      )
        return false;
      if (q && !((e.clientName ?? "").toLowerCase().includes(q) || e.title.toLowerCase().includes(q)))
        return false;
      return true;
    });
  }, [events, selectedStatuses, selectedWorkerIds, query]);

  const calendarEvents: CalendarEvent[] = filteredEvents.map((e) => ({
    id: e.id,
    jobId: e.jobId,
    title: e.title,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    status: e.status,
    notes: e.notes,
    kind: e.kind,
  }));

  const teamEvents: TeamEvent[] = filteredEvents
    .filter((e) => e.kind === "job")
    .flatMap<TeamEvent>((e) => {
      if (e.workerIds.length === 0) {
        return [{ ...e, workerId: null as string | null, kind: e.kind }];
      }
      return e.workerIds.map<TeamEvent>((workerId) => ({ ...e, workerId, kind: e.kind }));
    });

  // Find the calendar-shaped view of a raw event id, so we can pop the detail
  // sheet open after a move with the freshly-updated startsAt.
  function buildMovedSelection(eventId: string, newStart: Date, durationMs?: number): CalendarEvent | null {
    const raw = events.find((e) => e.id === eventId);
    if (!raw) return null;
    const origStart = new Date(raw.startsAt);
    const origEnd = new Date(raw.endsAt);
    const dur = durationMs ?? (origEnd.getTime() - origStart.getTime());
    const newEnd = new Date(newStart.getTime() + dur);
    return {
      id: raw.id,
      jobId: raw.jobId,
      title: raw.title,
      startsAt: newStart.toISOString(),
      endsAt: newEnd.toISOString(),
      status: raw.status,
      notes: raw.notes,
      kind: raw.kind,
    };
  }

  async function handleReschedule(eventId: string, newDate: Date) {
    const { kind, dbId } = parseEventId(eventId);
    try {
      if (kind === "job") {
        await rescheduleJobEvent(dbId, newDate.toISOString());
      } else if (kind === "appointment") {
        await rescheduleAppointment(dbId, newDate.toISOString());
      } else {
        await rescheduleBlockedTime(dbId, newDate.toISOString());
      }
      const moved = buildMovedSelection(eventId, newDate);
      router.refresh();
      toast.success("Rescheduled");
      if (moved) setSelected(moved);
    } catch (err: any) {
      toast.error("Couldn't reschedule", err?.message);
    }
  }

  async function handleResize(eventId: string, startISO: string, endISO: string) {
    const { kind, dbId } = parseEventId(eventId);
    if (kind !== "job") {
      toast.info("Edit appointments and blocked time from the detail sheet");
      return;
    }
    try {
      await rescheduleJobEventTime(dbId, startISO, endISO);
      router.refresh();
      toast.success("Duration updated");
    } catch (err: any) {
      toast.error("Couldn't resize", err?.message);
    }
  }

  async function handleTrayDrop(jobId: string, info: PanInfo) {
    const target = findDropTarget(info.point);
    if (!target) {
      toast.info("Drop on a calendar date to schedule");
      return;
    }
    try {
      const res = await scheduleJobFromTray(jobId, target.date.toISOString());
      if (target.workerId && res.id) {
        try {
          await assignWorker(jobId, target.workerId);
          toast.success("Scheduled & assigned");
        } catch {
          toast.success("Scheduled (assign failed)");
        }
      } else {
        toast.success("Job scheduled");
      }
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't schedule", err?.message);
    }
  }

  async function handleAssignEvent(
    eventId: string,
    workerId: string | null,
    newDate: Date,
  ) {
    const { kind, dbId } = parseEventId(eventId);
    if (kind !== "job") {
      toast.info("Only job events can be assigned to a worker");
      return;
    }
    try {
      await assignEventWorker(dbId, workerId, newDate.toISOString());
      const moved = buildMovedSelection(eventId, newDate);
      router.refresh();
      toast.success(workerId ? "Assigned" : "Unassigned");
      if (moved) setSelected(moved);
    } catch (err: any) {
      toast.error("Couldn't assign", err?.message);
    }
  }

  async function handleDeleteEvent(eventId: string) {
    const { kind, dbId } = parseEventId(eventId);
    try {
      if (kind === "job") await deleteJobEvent(dbId);
      else if (kind === "appointment") await deleteAppointment(dbId);
      else await deleteBlockedTime(dbId);
      router.refresh();
      toast.success("Deleted");
    } catch (err: any) {
      toast.error("Couldn't delete", err?.message);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Delivery · v3"
        title="Calendar"
        description="Job events, appointments, and blocked time in one timeline. Drag from the tray onto a date or a worker row to dispatch instantly."
      />
      <CalendarToolbar
        cursor={cursor}
        view={view}
        onView={setView}
        onPrev={prev}
        onNext={next}
        onToday={today}
        onNew={() => {
          setQuickAddDate(cursor);
          setQuickAddDuration(null);
          setQuickAddKind("job");
          setQuickAddOpen(true);
        }}
        trayOpen={trayOpen}
        onToggleTray={() => setTrayOpen(!trayOpen)}
        unscheduledCount={unscheduledJobs.length}
        onOpenInbox={() => setInboxOpen(true)}
        inboxCount={pendingAssignments.length}
      />

      <CalendarFilters
        workers={workers}
        selectedWorkerIds={selectedWorkerIds}
        selectedStatuses={selectedStatuses}
        query={query}
        onWorkersChange={setSelectedWorkerIds}
        onStatusesChange={setSelectedStatuses}
        onQueryChange={setQuery}
        onClear={clearFilters}
      />

      {/* `isolate` creates a stacking context on the grid so the tray's
          dragged card (z-index 60) can always sit above the calendar even
          when the grid contains absolutely-positioned event chips. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-5 items-start isolate">
        <div className="min-w-0 relative z-0">
          {view === "month" && (
            <MonthGrid
              cursor={cursor}
              events={calendarEvents}
              onSelectEvent={setSelected}
              onReschedule={handleReschedule}
              onSelectDate={(d) => {
                setQuickAddDate(d);
                setQuickAddDuration(null);
                setQuickAddKind("job");
                setQuickAddOpen(true);
              }}
            />
          )}
          {view === "week" && (
            <WeekGridA
              cursor={cursor}
              events={calendarEvents}
              onSelectEvent={setSelected}
              onMoveEvent={handleReschedule}
              onResizeEvent={handleResize}
              onSelectSlot={(start, durationMin) => {
                setQuickAddDate(start);
                setQuickAddDuration(durationMin ?? null);
                setQuickAddKind("job");
                setQuickAddOpen(true);
              }}
            />
          )}
          {view === "team" && (
            <TeamGridA
              cursor={cursor}
              workers={workers}
              events={teamEvents}
              onSelectEvent={setSelected}
              onAssignEvent={handleAssignEvent}
            />
          )}
        </div>

        <div className="relative z-10">
          <UnscheduledTrayA
            jobs={unscheduledJobs}
            open={trayOpen}
            onToggle={() => setTrayOpen(!trayOpen)}
            onJobDragEnd={handleTrayDrop}
          />
        </div>
      </div>

      <EventDetailSheet
        event={selected}
        onClose={() => setSelected(null)}
        onDelete={handleDeleteEvent}
      />

      <QuickAddEventSheetA
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        jobs={pickerJobs}
        leads={pickerLeads}
        workers={pickerWorkers}
        defaultStart={quickAddDate}
        defaultKind={quickAddKind}
        defaultDurationMin={quickAddDuration ?? undefined}
      />

      <InboxSheet
        open={inboxOpen}
        onClose={() => setInboxOpen(false)}
        pending={pendingAssignments}
      />
    </>
  );
}

function findDropTarget(
  point: { x: number; y: number },
): { date: Date; workerId: string | null } | null {
  if (typeof document === "undefined") return null;
  const el = document.elementFromPoint(point.x, point.y);
  if (!el) return null;
  const cell = (el as HTMLElement).closest("[data-cal-day]") as HTMLElement | null;
  if (!cell) return null;
  const iso = cell.getAttribute("data-cal-day");
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const workerKey = cell.getAttribute("data-cal-worker");
  return {
    date: new Date(y, m - 1, d),
    workerId: workerKey && workerKey !== "_none_" ? workerKey : null,
  };
}
