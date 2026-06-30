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
import { cn } from "@/lib/cn";
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
  updateJob,
  updateJobEvent,
} from "@/actions/jobs";
import type { EventEditPatch } from "@/components/calendar/EventDetailSheet";
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
  // Field-worker view: hides every create/dispatch/edit affordance and ignores
  // mutation gestures. The worker can browse their schedule but not change it.
  readOnly?: boolean;
}

interface HoverTarget {
  iso: string;
  workerKey: string | null;
  // Minutes from local midnight for the hovered time row (week grid only).
  // Null for day-based grids (month / team).
  totalMin: number | null;
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
}): { date: Date; workerKey: string | null; iso: string; totalMin: number | null } | null {
  if (typeof document === "undefined") return null;
  const els = document.elementsFromPoint(point.x, point.y);
  for (const el of els) {
    const cell = (el as HTMLElement).closest?.("[data-cal-day]") as HTMLElement | null;
    if (!cell) continue;
    const iso = cell.getAttribute("data-cal-day");
    if (!iso) continue;
    const [y, m, d] = iso.split("-").map(Number);
    // Timed grids (week) tag the cell with its hour range, so we can read the
    // drop time off the vertical position. Day grids (month/team) don't — those
    // resolve to a date only and fall back to the action's default time.
    let totalMin: number | null = null;
    const sh = Number(cell.getAttribute("data-cal-start-hour"));
    const eh = Number(cell.getAttribute("data-cal-end-hour"));
    if (Number.isFinite(sh) && Number.isFinite(eh) && eh > sh) {
      const rect = cell.getBoundingClientRect();
      if (rect.height > 0) {
        const frac = Math.max(0, Math.min(1, (point.y - rect.top) / rect.height));
        const raw = sh * 60 + frac * (eh - sh) * 60;
        totalMin = Math.max(sh * 60, Math.min(eh * 60, Math.round(raw / 15) * 15));
      }
    }
    return {
      date: new Date(y, m - 1, d),
      workerKey: cell.getAttribute("data-cal-worker"),
      iso,
      totalMin,
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
  readOnly = false,
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

  // --- Optimistic drag overlay --------------------------------------------
  // Drags should land where they're dropped instantly, instead of snapping the
  // card back to its origin (or the tray list) and waiting for the server
  // round-trip to re-render it elsewhere. We patch positions / inject a temp
  // event locally; the overlay is reconciled away once fresh server data
  // arrives (the temp is dropped as soon as the real event shows up).
  const [optimisticMoves, setOptimisticMoves] = React.useState<
    Record<string, { startsAt: string; endsAt: string; workerIds?: string[] }>
  >({});
  const [optimisticScheduled, setOptimisticScheduled] = React.useState<RawEvent[]>([]);
  const [hiddenTrayJobIds, setHiddenTrayJobIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    // Fresh server data is authoritative — clear the overlay so it can't drift.
    setOptimisticMoves({});
    setOptimisticScheduled([]);
    setHiddenTrayJobIds([]);
  }, [events, unscheduledJobs]);

  const effectiveEvents = React.useMemo<RawEvent[]>(() => {
    const patched = events.map((e) => {
      const m = optimisticMoves[e.id];
      return m
        ? { ...e, startsAt: m.startsAt, endsAt: m.endsAt, workerIds: m.workerIds ?? e.workerIds }
        : e;
    });
    if (optimisticScheduled.length === 0) return patched;
    // Drop a temp event the moment its real counterpart (same job) lands.
    const realJobIds = new Set(events.map((e) => e.jobId).filter(Boolean));
    const pending = optimisticScheduled.filter((t) => !t.jobId || !realJobIds.has(t.jobId));
    return [...patched, ...pending];
  }, [events, optimisticMoves, optimisticScheduled]);

  const effectiveUnscheduled = React.useMemo(
    () =>
      hiddenTrayJobIds.length
        ? unscheduledJobs.filter((j) => !hiddenTrayJobIds.includes(j.id))
        : unscheduledJobs,
    [unscheduledJobs, hiddenTrayJobIds],
  );

  // The unscheduled job list is open every time the calendar is opened. The
  // toolbar's panel button hides it (and the tray fully disappears).
  React.useEffect(() => {
    setTrayOpen(true);
  }, [setTrayOpen]);

  const cursor = new Date(cursorISO);

  const filteredEvents = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return effectiveEvents.filter((e) => {
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
  }, [effectiveEvents, selectedStatuses, selectedWorkerIds, query]);

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

  async function handleReschedule(eventId: string, newDate: Date) {
    if (readOnly) return;
    const { kind, dbId } = parseEventId(eventId);
    // Day-move keeps the time-of-day; shift only the date for the optimistic patch.
    const raw = events.find((e) => e.id === eventId);
    if (raw) {
      const os = new Date(raw.startsAt);
      const oe = new Date(raw.endsAt);
      const ns = new Date(newDate);
      ns.setHours(os.getHours(), os.getMinutes(), 0, 0);
      const ne = new Date(ns.getTime() + (oe.getTime() - os.getTime()));
      setOptimisticMoves((prev) => ({
        ...prev,
        [eventId]: { startsAt: ns.toISOString(), endsAt: ne.toISOString() },
      }));
    }
    try {
      if (kind === "job") {
        await rescheduleJobEvent(dbId, newDate.toISOString());
      } else if (kind === "appointment") {
        await rescheduleAppointment(dbId, newDate.toISOString());
      } else {
        await rescheduleBlockedTime(dbId, newDate.toISOString());
      }
      router.refresh();
      toast.success("Rescheduled");
    } catch (err: any) {
      setOptimisticMoves((prev) => {
        const next = { ...prev };
        delete next[eventId];
        return next;
      });
      toast.error("Couldn't reschedule", err?.message);
    }
  }

  // Inline edit from the detail sheet (job events only). Diff against the raw
  // event so each field's action only fires when that field actually changed —
  // avoids re-running assignment side effects on an unchanged worker.
  async function handleSaveEventEdits(patch: EventEditPatch) {
    if (!selected) return;
    const { kind, dbId } = parseEventId(selected.id);
    if (kind !== "job") return;
    const raw = events.find((e) => e.id === selected.id);
    try {
      const origStartISO = new Date(selected.startsAt).toISOString();
      const origEndISO = new Date(selected.endsAt).toISOString();
      if (patch.startISO !== origStartISO || patch.endISO !== origEndISO) {
        await rescheduleJobEventTime(dbId, patch.startISO, patch.endISO);
      }
      const currentWorker = raw?.workerIds[0] ?? null;
      if (patch.workerId !== currentWorker) {
        await assignEventWorker(dbId, patch.workerId);
      }
      if (raw?.jobId && patch.status !== selected.status) {
        await updateJob(raw.jobId, {
          status: patch.status as "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELED",
        });
      }
      if (patch.title !== selected.title || (patch.notes ?? "") !== (selected.notes ?? "")) {
        await updateJobEvent(dbId, { title: patch.title, notes: patch.notes });
      }
      toast.success("Saved");
      router.refresh();
      setSelected(null);
    } catch (err: any) {
      toast.error("Couldn't save", err?.message);
    }
  }

  // Drag an already-scheduled chip to a new week slot. Jobs accept an explicit
  // drop time (rescheduleJobEventTime); appointments and blocked time only have
  // a day-move action that preserves their time-of-day server-side.
  async function handleMoveEventToSlot(eventId: string, newStart: Date) {
    if (readOnly) return;
    const { kind, dbId } = parseEventId(eventId);
    const raw = events.find((e) => e.id === eventId);
    if (!raw) return;
    const origStart = new Date(raw.startsAt);
    const dur = Math.max(15 * 60_000, new Date(raw.endsAt).getTime() - origStart.getTime());
    // Jobs honor the exact drop time; appointments/blocked keep their original
    // time-of-day on the new day.
    const effectiveStart =
      kind === "job"
        ? newStart
        : (() => {
            const d = new Date(newStart);
            d.setHours(origStart.getHours(), origStart.getMinutes(), 0, 0);
            return d;
          })();
    const effectiveEnd = new Date(effectiveStart.getTime() + dur);
    // Land the chip at the new slot immediately; reconcile on refresh.
    setOptimisticMoves((prev) => ({
      ...prev,
      [eventId]: { startsAt: effectiveStart.toISOString(), endsAt: effectiveEnd.toISOString() },
    }));
    try {
      if (kind === "job") {
        await rescheduleJobEventTime(dbId, effectiveStart.toISOString(), effectiveEnd.toISOString());
      } else if (kind === "appointment") {
        await rescheduleAppointment(dbId, newStart.toISOString());
      } else {
        await rescheduleBlockedTime(dbId, newStart.toISOString());
      }
      router.refresh();
      toast.success("Rescheduled");
    } catch (err: any) {
      setOptimisticMoves((prev) => {
        const next = { ...prev };
        delete next[eventId];
        return next;
      });
      toast.error("Couldn't reschedule", err?.message);
    }
  }

  async function handleResize(eventId: string, startISO: string, endISO: string) {
    if (readOnly) return;
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
    // Optimistically place the event where it was dropped and pull the card out
    // of the tray, so it doesn't bounce back to the list mid-flight.
    const job = unscheduledJobs.find((j) => j.id === jobId);
    const startMin = target.totalMin ?? 9 * 60;
    const tempStart = new Date(target.date);
    tempStart.setHours(0, startMin, 0, 0);
    const tempEnd = new Date(tempStart.getTime() + 5 * 60 * 60 * 1000);
    const tempEvent: RawEvent = {
      id: `temp:${jobId}`,
      kind: "job",
      jobId,
      leadId: null,
      title: job?.title ?? "Job",
      startsAt: tempStart.toISOString(),
      endsAt: tempEnd.toISOString(),
      status: job?.status ?? "SCHEDULED",
      notes: null,
      workerIds:
        target.workerKey && target.workerKey !== "_none_" ? [target.workerKey] : [],
      clientName: job?.clientName ?? null,
    };
    setOptimisticScheduled((prev) => [...prev, tempEvent]);
    setHiddenTrayJobIds((prev) => [...prev, jobId]);
    try {
      const res = await scheduleJobFromTray(jobId, target.date.toISOString());
      // The tray action defaults to 9am. If the job was dropped on a timed week
      // cell, move the freshly-created event to the exact drop time (keeping the
      // action's default block length) so it lands where the user released it.
      if (target.totalMin != null && res?.id) {
        const start = new Date(target.date);
        start.setHours(0, target.totalMin, 0, 0);
        const end = new Date(start.getTime() + 5 * 60 * 60 * 1000);
        try {
          await rescheduleJobEventTime(res.id, start.toISOString(), end.toISOString());
        } catch {
          /* keep the 9am fallback if the precise move fails */
        }
      }
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
      // Undo the optimistic placement — the card returns to the tray.
      setOptimisticScheduled((prev) => prev.filter((e) => e.id !== `temp:${jobId}`));
      setHiddenTrayJobIds((prev) => prev.filter((id) => id !== jobId));
      toast.error("Couldn't schedule", err?.message);
    }
  }

  function handleTrayDragMove(_jobId: string, point: { x: number; y: number }) {
    const target = findDropTarget(point);
    if (!target) {
      if (hoverTarget !== null) setHoverTarget(null);
      return;
    }
    const next: HoverTarget = {
      iso: target.iso,
      workerKey: target.workerKey,
      totalMin: target.totalMin,
    };
    if (
      hoverTarget?.iso !== next.iso ||
      hoverTarget?.workerKey !== next.workerKey ||
      hoverTarget?.totalMin !== next.totalMin
    ) {
      setHoverTarget(next);
    }
  }

  async function handleAssignEvent(
    eventId: string,
    workerId: string | null,
    newDate: Date,
  ) {
    if (readOnly) return;
    const { kind, dbId } = parseEventId(eventId);
    if (kind !== "job") {
      toast.info("Only job events can be assigned to a worker");
      return;
    }
    try {
      await assignEventWorker(dbId, workerId, newDate.toISOString());
      router.refresh();
      toast.success(workerId ? "Assigned" : "Unassigned");
    } catch (err: any) {
      toast.error("Couldn't assign", err?.message);
    }
  }

  // Unschedule a job: remove its calendar event but keep the job, so it drops
  // back into the unscheduled tray (vs. deleting the work entirely).
  async function handleUnscheduleEvent(eventId: string) {
    const { kind, dbId } = parseEventId(eventId);
    if (kind !== "job") return;
    setSelected(null);
    try {
      await deleteJobEvent(dbId);
      router.refresh();
      toast.success("Moved to unscheduled", "The job is back in the tray to reschedule.");
    } catch (err: any) {
      toast.error("Couldn't unschedule", err?.message);
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
    if (readOnly) return;
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

  // Week grid wants the hovered slot (day + minutes) so it can draw a crosshair
  // and schedule at the dropped time. Team grid only needs worker|iso.
  const hoveredSlot =
    hoverTarget && hoverTarget.totalMin != null
      ? { iso: hoverTarget.iso, totalMin: hoverTarget.totalMin }
      : null;

  // Month/Team day grids don't carry a time row, so the hovered drop target is
  // just the day. Feed it to MonthGrid so the cell lights up under a tray card.
  const hoveredDayIso = view === "month" && hoverTarget ? hoverTarget.iso : null;
  const hoveredTeamCellKey = hoverTarget
    ? `${hoverTarget.workerKey ?? "_none_"}|${hoverTarget.iso}`
    : null;

  return (
    <>
      <PageHeader
        eyebrow={readOnly ? "Delivery" : "Delivery · v3"}
        title={readOnly ? "My schedule" : "Calendar"}
        description={
          readOnly
            ? "The events for the jobs you're assigned to. Tap an event for the details."
            : "Job events, appointments, and blocked time in one timeline. Drag from the tray onto a date or a worker row to dispatch instantly."
        }
      />
      <CalendarToolbar
        cursor={cursor}
        view={view}
        onView={setView}
        onPrev={prev}
        onNext={next}
        onToday={today}
        onNew={readOnly ? undefined : () => openQuickAddForDate(cursor)}
        trayOpen={trayOpen}
        onToggleTray={readOnly ? undefined : () => setTrayOpen(!trayOpen)}
        unscheduledCount={readOnly ? 0 : effectiveUnscheduled.length}
        onOpenInbox={readOnly ? undefined : () => setInboxOpen(true)}
        inboxCount={readOnly ? 0 : pendingAssignments.length}
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

      <div
        className={cn(
          "grid gap-5 items-start isolate",
          trayOpen ? "grid-cols-1 lg:grid-cols-[1fr_auto]" : "grid-cols-1",
        )}
      >
        <div className="min-w-0 relative z-0">
          {view === "month" && (
            <MonthGrid
              cursor={cursor}
              events={calendarEvents}
              onSelectEvent={setSelected}
              onReschedule={handleReschedule}
              onSelectDate={openQuickAddForDate}
              previewIso={slotPreview?.iso ?? null}
              hoveredDayIso={hoveredDayIso}
            />
          )}
          {view === "week" && (
            <WeekGridA
              cursor={cursor}
              events={calendarEvents}
              onSelectEvent={setSelected}
              onMoveEvent={handleMoveEventToSlot}
              onResizeEvent={handleResize}
              onSelectSlot={openQuickAddForSlot}
              slotPreview={slotPreview}
              hoveredSlot={hoveredSlot}
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

        {!readOnly && trayOpen && (
          <div className="relative z-10">
            <UnscheduledTrayA
              jobs={effectiveUnscheduled}
              open={trayOpen}
              onToggle={() => setTrayOpen(!trayOpen)}
              onJobDragEnd={handleTrayDrop}
              onJobDragMove={handleTrayDragMove}
            />
          </div>
        )}
      </div>

      <EventDetailSheet
        event={selected}
        onClose={() => setSelected(null)}
        onDelete={readOnly ? undefined : handleDeleteEvent}
        onUnschedule={readOnly ? undefined : handleUnscheduleEvent}
        workers={workers.map((w) => ({ id: w.id, name: w.name }))}
        currentWorkerId={
          selected ? events.find((e) => e.id === selected.id)?.workerIds[0] ?? null : null
        }
        onSave={readOnly ? undefined : handleSaveEventEdits}
      />

      {!readOnly && (
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
      )}

      {!readOnly && (
        <InboxSheet
          open={inboxOpen}
          onClose={() => setInboxOpen(false)}
          pending={pendingAssignments}
        />
      )}
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
