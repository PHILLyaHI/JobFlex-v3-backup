"use client";
// V3 calendar-a — orchestrator.
//
// Notable wiring vs. the original calendar-view:
//  - Tray-card drop uses elementsFromPoint so the high-z dragged card no
//    longer masks the drop target.
//  - Tray-card drag fires `onJobDragMove`, which we use to light up the
//    currently-hovered cell in WeekGridA / TeamGridA before release.
//  - Slot creation lifts the preview to this component so the dashed
//    outline stays pinned to the calendar while the QuickAdd sheet is
//    open, and clears when the sheet closes.
//  - QuickAdd consumes start + end (no more `duration`) and supports
//    multi-day spans.

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PanInfo } from "framer-motion";
import { PageHeader } from "@/components/ui/PageHeader";
import { CalendarToolbar } from "@/components/calendar/CalendarToolbar";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { WeekGridA, type SlotPreview } from "@/components/v3/calendar-a/WeekGridA";
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

interface HoverTarget {
  iso: string;
  workerKey: string | null;
}

const DEFAULT_DURATION_MIN = 30;

function parseEventId(id: string): { kind: CalendarEventKind; dbId: string } {
  if (id.startsWith("apt:")) return { kind: "appointment", dbId: id.slice(4) };
  if (id.startsWith("block:")) return { kind: "blocked", dbId: id.slice(6) };
  return { kind: "job", dbId: id };
}

// Walk the elements at the pointer (top-down) and return the first one that's
// a calendar cell. The plural form is essential — the dragged card itself sits
// at z-60 on top, so elementFromPoint (singular) would hand us the card and
// we'd never see the cell beneath.
function findDropTarget(point: {
  x: number;
  y: number;
}): { date: Date; workerKey: string | null; iso: string } | null {
  if (typeof document === "undefined") return null;
  const els = document.elementsFromPoint(point.x, point.y);
  for (const el of els) {
    const cell = (el as HTMLElement).closest?.("[data-cal-day]") as HTMLElement | null;
    if (!cell) continue;
    const iso = cell.getAttribute("data-cal-day");
    if (!iso) continue;
    const [y, m, d] = iso.split("-").map(Number);
    return {
      date: new Date(y, m - 1, d),
      workerKey: cell.getAttribute("data-cal-worker"),
      iso,
    };
  }
  return null;
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
  const [quickAddStart, setQuickAddStart] = React.useState<Date | null>(null);
  const [quickAddEnd, setQuickAddEnd] = React.useState<Date | null>(null);
  const [quickAddKind, setQuickAddKind] = React.useState<CalendarEventKind>("job");
  const [inboxOpen, setInboxOpen] = React.useState(false);

  // Pinned slot outline shown in the week grid while the QuickAdd sheet is
  // open. Cleared when the sheet closes.
  const [slotPreview, setSlotPreview] = React.useState<SlotPreview | null>(null);

  // Cell currently under a dragged tray card. Cleared on drop/cancel.
  const [hoverTarget, setHoverTarget] = React.useState<HoverTarget | null>(null);

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
      if (
        q &&
        !((e.clientName ?? "").toLowerCase().includes(q) || e.title.toLowerCase().includes(q))
      )
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

  function buildMovedSelection(eventId: string, newStart: Date): CalendarEvent | null {
    const raw = events.find((e) => e.id === eventId);
    if (!raw) return null;
    const origStart = new Date(raw.startsAt);
    const origEnd = new Date(raw.endsAt);
    const dur = origEnd.getTime() - origStart.getTime();
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
    setHoverTarget(null);
    const target = findDropTarget(info.point);
    if (!target) {
      toast.info("Drop on a calendar date to schedule");
      return;
    }
    try {
      const res = await scheduleJobFromTray(jobId, target.date.toISOString());
      if (target.workerKey && target.workerKey !== "_none_" && res.id) {
        try {
          await assignWorker(jobId, target.workerKey);
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

  function handleTrayDragMove(_jobId: string, point: { x: number; y: number }) {
    const target = findDropTarget(point);
    if (!target) {
      if (hoverTarget !== null) setHoverTarget(null);
      return;
    }
    const next: HoverTarget = { iso: target.iso, workerKey: target.workerKey };
    if (
      hoverTarget?.iso !== next.iso ||
      hoverTarget?.workerKey !== next.workerKey
    ) {
      setHoverTarget(next);
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

  function openQuickAddForSlot(start: Date, end: Date) {
    setQuickAddStart(start);
    setQuickAddEnd(end);
    setQuickAddKind("job");
    const iso = isoKey(start);
    setSlotPreview({
      iso,
      startTotalMin: start.getHours() * 60 + start.getMinutes(),
      // If the event spans days, cap the in-grid outline at end-of-day.
      endTotalMin:
        sameLocalDay(start, end) ? end.getHours() * 60 + end.getMinutes() : 24 * 60,
    });
    setQuickAddOpen(true);
  }

  function openQuickAddForDate(d: Date) {
    const start = new Date(d);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + DEFAULT_DURATION_MIN * 60_000);
    openQuickAddForSlot(start, end);
  }

  function closeQuickAdd() {
    setQuickAddOpen(false);
    setSlotPreview(null);
  }

  // ISO key for the week grid's hover highlight. Team grid expects worker|iso.
  const hoveredDayIso = hoverTarget?.iso ?? null;
  const hoveredTeamCellKey = hoverTarget
    ? `${hoverTarget.workerKey ?? "_none_"}|${hoverTarget.iso}`
    : null;

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
        onNew={() => openQuickAddForDate(cursor)}
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

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-5 items-start isolate">
        <div className="min-w-0 relative z-0">
          {view === "month" && (
            <MonthGrid
              cursor={cursor}
              events={calendarEvents}
              onSelectEvent={setSelected}
              onReschedule={handleReschedule}
              onSelectDate={openQuickAddForDate}
            />
          )}
          {view === "week" && (
            <WeekGridA
              cursor={cursor}
              events={calendarEvents}
              onSelectEvent={setSelected}
              onMoveEvent={handleReschedule}
              onResizeEvent={handleResize}
              onSelectSlot={openQuickAddForSlot}
              slotPreview={slotPreview}
              hoveredDayIso={hoveredDayIso}
            />
          )}
          {view === "team" && (
            <TeamGridA
              cursor={cursor}
              workers={workers}
              events={teamEvents}
              onSelectEvent={setSelected}
              onAssignEvent={handleAssignEvent}
              hoveredCellKey={hoveredTeamCellKey}
            />
          )}
        </div>

        <div className="relative z-10">
          <UnscheduledTrayA
            jobs={unscheduledJobs}
            open={trayOpen}
            onToggle={() => setTrayOpen(!trayOpen)}
            onJobDragEnd={handleTrayDrop}
            onJobDragMove={handleTrayDragMove}
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
        onClose={closeQuickAdd}
        jobs={pickerJobs}
        leads={pickerLeads}
        workers={pickerWorkers}
        defaultStart={quickAddStart}
        defaultEnd={quickAddEnd}
        defaultKind={quickAddKind}
      />

      <InboxSheet
        open={inboxOpen}
        onClose={() => setInboxOpen(false)}
        pending={pendingAssignments}
      />
    </>
  );
}

function isoKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
