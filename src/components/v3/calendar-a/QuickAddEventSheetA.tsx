"use client";
// V3 calendar-a — quick-add sheet redesign (v3).
//
// Major changes vs. v2:
//  - Linked-record picking moved to LinkedEntityPicker: one search field that
//    crosses sections, with quiet tabs. Job events link a Job OR a Proposal
//    (scheduling a proposal get-or-creates its Job server-side, so it shows up
//    in Jobs and under that client). Appointments link a Lead, Client, or
//    Proposal — at most one.
//  - Worker toggle badges replaced by WorkerMultiPicker (searchable roster
//    popover). Appointments can staff sales/workers the same way.
//  - Availability dots: while the sheet is open we ask the server who is busy
//    in the chosen window and thread the conflicts into the picker.
//
// Behaviour kept from v2: starts + ends (multi-day spans), custom
// DateTimePicker, client email + location encoded into notes.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/ui/Sheet";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { longDate } from "@/lib/format";
import { createJobEvent } from "@/actions/jobs";
import { assignWorker } from "@/actions/workers";
import { createAppointment } from "@/actions/appointments";
import { createBlockedTime } from "@/actions/blockedTime";
import { getWorkerConflicts } from "@/actions/availability";
import { reportPlanLimit, ensureWithinLimit } from "@/stores/usePlanLimitStore";
import { EventTypeTabs, type CalendarEventKind } from "@/components/calendar/EventTypeTabs";
import { Toggle } from "@/components/settings/Toggle";
import { DateTimePicker } from "./DateTimePicker";
import { LinkedEntityPicker, type EntityOption } from "./LinkedEntityPicker";
import { WorkerMultiPicker, type WorkerConflict } from "./WorkerMultiPicker";

export interface QuickAddJobOption {
  id: string;
  title: string;
  status: string;
  clientName: string | null;
}

export interface QuickAddLeadOption {
  id: string;
  name: string;
  email: string | null;
  projectType: string | null;
  aiCategory: string | null;
  status: string;
}

export interface QuickAddProposalOption {
  id: string;
  title: string;
  status: string;
  clientName: string | null;
  hasJob: boolean;
}

export interface QuickAddClientOption {
  id: string;
  name: string;
  email: string | null;
}

export interface QuickAddWorkerOption {
  id: string;
  name: string;
  specialties: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  jobs: QuickAddJobOption[];
  leads: QuickAddLeadOption[];
  proposals: QuickAddProposalOption[];
  clients: QuickAddClientOption[];
  workers: QuickAddWorkerOption[];
  defaultStart: Date | null;
  defaultEnd: Date | null;
  defaultKind?: CalendarEventKind;
  // Which event types this user may create. Managers get job + appointment;
  // sales/estimator get appointment only; installers get job only. "Blocked"
  // is never offered here (its workflow is paused).
  createKinds?: CalendarEventKind[];
}

const BLOCKED_REASONS = ["Vacation", "Sick day", "Holiday", "Office hours", "Other"];
const DEFAULT_DURATION_MIN = 30;
const ALL_KINDS: CalendarEventKind[] = ["job", "appointment", "blocked"];

function buildNotes(parts: Array<{ label: string; value: string }>, userNotes: string) {
  const structured = parts
    .filter((p) => p.value.trim().length > 0)
    .map((p) => `${p.label}: ${p.value.trim()}`)
    .join("\n");
  if (!structured) return userNotes.trim() || null;
  if (!userNotes.trim()) return structured;
  return `${structured}\n---\n${userNotes.trim()}`;
}

export function QuickAddEventSheetA({
  open,
  onClose,
  jobs,
  leads,
  proposals,
  clients,
  workers,
  defaultStart,
  defaultEnd,
  defaultKind = "job",
  createKinds = ["job", "appointment"],
}: Props) {
  const router = useRouter();

  // Tabs to hide = everything not creatable by this user. Coerce a default/
  // active kind that isn't allowed to the first allowed one.
  const hiddenKinds = React.useMemo(
    () => ALL_KINDS.filter((k) => !createKinds.includes(k)),
    [createKinds],
  );
  const coerceKind = React.useCallback(
    (k: CalendarEventKind): CalendarEventKind =>
      createKinds.includes(k) ? k : createKinds[0] ?? "appointment",
    [createKinds],
  );

  const initialStart = React.useMemo<Date>(() => {
    if (defaultStart) return new Date(defaultStart);
    const base = new Date();
    base.setHours(9, 0, 0, 0);
    return base;
  }, [defaultStart]);

  const initialEnd = React.useMemo<Date>(() => {
    if (defaultEnd) return new Date(defaultEnd);
    return new Date(initialStart.getTime() + DEFAULT_DURATION_MIN * 60_000);
  }, [defaultEnd, initialStart]);

  const [kind, setKind] = React.useState<CalendarEventKind>(coerceKind(defaultKind));
  const [startsAt, setStartsAt] = React.useState<Date>(initialStart);
  const [endsAt, setEndsAt] = React.useState<Date>(initialEnd);
  const [title, setTitle] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // Job event: linked Job or Proposal (one), plus crew.
  const [jobLink, setJobLink] = React.useState<EntityOption | null>(null);
  const [selectedWorkerIds, setSelectedWorkerIds] = React.useState<string[]>([]);
  const [jobClientEmail, setJobClientEmail] = React.useState("");
  const [jobLocation, setJobLocation] = React.useState("");

  // Appointment: linked Lead, Client, or Proposal (one), plus staff.
  const [aptLink, setAptLink] = React.useState<EntityOption | null>(null);
  const [aptWorkerIds, setAptWorkerIds] = React.useState<string[]>([]);
  const [aptClientName, setAptClientName] = React.useState("");
  const [aptLocation, setAptLocation] = React.useState("");

  const [blockReason, setBlockReason] = React.useState("Vacation");
  // Whole-day: normalizes the span to cover the full day(s) on submit. For
  // blocked time the month view then shows a full-cell rose wash; for job
  // events / appointments it marks the day rather than a timed slot.
  const [allDay, setAllDay] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  // Who's busy in the chosen window — feeds the picker availability dots.
  const [conflicts, setConflicts] = React.useState<Record<string, WorkerConflict>>({});

  React.useEffect(() => {
    if (!open) return;
    setKind(coerceKind(defaultKind));
    setStartsAt(initialStart);
    setEndsAt(initialEnd);
    setJobLink(null);
    setAptLink(null);
    setSelectedWorkerIds([]);
    setAptWorkerIds([]);
    setTitle("");
    setNotes("");
    setBlockReason("Vacation");
    setAllDay(false);
    setJobClientEmail("");
    setJobLocation("");
    setAptClientName("");
    setAptLocation("");
    // coerceKind depends on createKinds (a fresh array each render); including
    // it would re-run this reset every render. defaultKind is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialStart, initialEnd, defaultKind]);

  React.useEffect(() => {
    if (!open || workers.length === 0) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const map = await getWorkerConflicts(startsAt.toISOString(), endsAt.toISOString());
        if (!cancelled) setConflicts(map);
      } catch {
        if (!cancelled) setConflicts({});
      }
    }, 250); // debounce time-field scrubbing
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, startsAt, endsAt, workers.length]);

  // When user moves Starts past Ends, push Ends forward by the previous span
  // (or default to 30 min). When user pulls Ends before Starts, clamp to
  // Starts + 30 min so we never submit a negative duration.
  function updateStarts(next: Date) {
    setStartsAt(next);
    if (next.getTime() >= endsAt.getTime()) {
      const span = Math.max(
        DEFAULT_DURATION_MIN * 60_000,
        endsAt.getTime() - startsAt.getTime(),
      );
      setEndsAt(new Date(next.getTime() + span));
    }
  }
  function updateEnds(next: Date) {
    if (next.getTime() <= startsAt.getTime()) {
      setEndsAt(new Date(startsAt.getTime() + DEFAULT_DURATION_MIN * 60_000));
      return;
    }
    setEndsAt(next);
  }

  const jobOptions = React.useMemo<EntityOption[]>(
    () => [
      ...jobs.map((j) => ({
        id: j.id,
        kind: "job",
        primary: j.title,
        secondary: j.clientName,
        badge: { label: j.status.toLowerCase(), tone: "neutral" as const },
      })),
      // Proposals that already have a job schedule through the job itself.
      ...proposals
        .filter((p) => !p.hasJob)
        .map((p) => ({
          id: p.id,
          kind: "proposal",
          primary: p.title,
          secondary: p.clientName,
          badge: { label: p.status.toLowerCase(), tone: "accent" as const },
        })),
    ],
    [jobs, proposals],
  );

  const aptOptions = React.useMemo<EntityOption[]>(
    () => [
      ...leads.map((l) => ({
        id: l.id,
        kind: "lead",
        primary: l.name,
        secondary: l.projectType ?? l.email,
        badge: l.aiCategory ? { label: l.aiCategory, tone: "accent" as const } : null,
      })),
      ...clients.map((c) => ({
        id: c.id,
        kind: "client",
        primary: c.name,
        secondary: c.email,
      })),
      ...proposals.map((p) => ({
        id: p.id,
        kind: "proposal",
        primary: p.title,
        secondary: p.clientName,
        badge: { label: p.status.toLowerCase(), tone: "neutral" as const },
      })),
    ],
    [leads, clients, proposals],
  );

  function pickJobLink(o: EntityOption | null) {
    setJobLink(o);
    if (o && !title) setTitle(o.primary);
  }

  function pickAptLink(o: EntityOption | null) {
    setAptLink(o);
    if (!o) return;
    if (!title) {
      if (o.kind === "lead") {
        const lead = leads.find((l) => l.id === o.id);
        setTitle(
          lead?.projectType ? `${lead.projectType} · ${lead.name}` : `Appointment · ${o.primary}`,
        );
      } else {
        setTitle(`Appointment · ${o.primary}`);
      }
    }
    if (!aptClientName) setAptClientName(o.kind === "proposal" ? o.secondary ?? "" : o.primary);
  }

  async function submit() {
    setBusy(true);
    // Pre-flight the matching plan limit (job event → calendarEvents,
    // appointment → calendarCards; blocked time is not metered).
    const limitKey = kind === "job" ? "calendarEvents" : kind === "appointment" ? "calendarCards" : null;
    if (limitKey && !(await ensureWithinLimit(limitKey))) {
      setBusy(false);
      return;
    }
    try {
      let start = new Date(startsAt);
      let end = new Date(endsAt);
      // All day → cover the full day(s): the picked times only choose the span.
      // End at 23:59:59.999 (not next-midnight) so a single all-day item stays
      // one day and the month/team full-day detectors still recognize it.
      if (allDay) {
        start = new Date(start);
        start.setHours(0, 0, 0, 0);
        end = new Date(end < start ? start : end);
        end.setHours(23, 59, 59, 999);
      }

      if (kind === "job") {
        const finalTitle = title.trim() || jobLink?.primary || "Event";
        const finalNotes = buildNotes(
          [
            { label: "Client email", value: jobClientEmail },
            { label: "Location", value: jobLocation },
          ],
          notes,
        );
        const res = await createJobEvent({
          title: finalTitle,
          jobId: jobLink?.kind === "job" ? jobLink.id : null,
          proposalId: jobLink?.kind === "proposal" ? jobLink.id : null,
          startsAt: start,
          endsAt: end,
          notes: finalNotes,
        });
        // The action returns the job it linked or created (proposal path), so
        // crew assignment works for both.
        if (res.jobId && selectedWorkerIds.length > 0) {
          for (const wId of selectedWorkerIds) {
            try {
              await assignWorker(res.jobId, wId);
            } catch (err) {
              console.warn("[QuickAddA] assign failed:", err);
            }
          }
        }
        toast.success(
          jobLink?.kind === "proposal" ? "Event created — job added to Jobs" : "Event created",
        );
      } else if (kind === "appointment") {
        const finalTitle = title.trim() || (aptLink ? `Appointment · ${aptLink.primary}` : "Appointment");
        const finalNotes = buildNotes(
          [
            { label: "Client name", value: aptClientName },
            { label: "Location", value: aptLocation },
          ],
          notes,
        );
        await createAppointment({
          title: finalTitle,
          leadId: aptLink?.kind === "lead" ? aptLink.id : null,
          clientId: aptLink?.kind === "client" ? aptLink.id : null,
          proposalId: aptLink?.kind === "proposal" ? aptLink.id : null,
          startsAt: start,
          endsAt: end,
          notes: finalNotes,
          workerIds: aptWorkerIds,
        });
        toast.success("Appointment booked");
      } else {
        await createBlockedTime({
          reason: blockReason,
          startsAt: start,
          endsAt: end,
        });
        toast.success("Time blocked");
      }
      router.refresh();
      onClose();
    } catch (err: any) {
      if (reportPlanLimit(err)) return;
      toast.error("Couldn't save", err?.message);
    } finally {
      setBusy(false);
    }
  }

  const subtitle = formatSpan(startsAt, endsAt);

  // Gate creation on a title. Blocked time is named by its reason, so it's always
  // ready; a job or appointment needs a typed title — or one transferred in from
  // a linked job / proposal / lead (see pickJobLink / pickAptLink).
  const canSubmit = kind === "blocked" ? true : title.trim().length > 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New event"
      description={subtitle}
      width="min(480px, 100vw)"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] leading-snug text-[color:var(--ink-muted)]">
            {!canSubmit &&
              (kind === "appointment"
                ? "Add a title, or link a lead, client, or proposal to name it."
                : "Add a title, or link a job or proposal to name it.")}
          </span>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={busy} disabled={busy || !canSubmit} onClick={submit}>
              {kind === "blocked"
                ? "Block time"
                : kind === "appointment"
                  ? "Book appointment"
                  : "Create event"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <EventTypeTabs value={kind} onChange={setKind} hiddenKinds={hiddenKinds} />

        <div className="grid grid-cols-2 gap-3">
          <DateTimePicker
            label="Starts"
            value={startsAt}
            onChange={updateStarts}
            fallbackDate={initialStart}
          />
          <DateTimePicker
            label="Ends"
            value={endsAt}
            onChange={updateEnds}
            fallbackDate={initialEnd}
            align="right"
          />
        </div>

        {/* Whole-day toggle — the times above then only pick which day(s) it
            spans. Blocked all-day renders as a full-cell wash on the month view. */}
        <div className="rounded-[var(--r-md)] hairline px-3">
          <Toggle
            checked={allDay}
            onChange={setAllDay}
            label="All day"
            description={
              kind === "blocked"
                ? "Blocks the entire day — a full-day striped card on the month view."
                : "Marks the whole day rather than a timed slot."
            }
          />
        </div>

        {kind === "job" && (
          <>
            <Input
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={jobLink ? jobLink.primary : "Material delivery"}
            />

            <LinkedEntityPicker
              label="Link"
              tabs={[
                { key: "job", label: "Job" },
                { key: "proposal", label: "Proposal" },
              ]}
              options={jobOptions}
              value={jobLink?.id ?? ""}
              onChange={pickJobLink}
              placeholder="Search or choose a job / proposal…"
            />
            {jobLink?.kind === "proposal" && (
              <p className="text-[10px] text-[color:var(--ink-muted)] -mt-2">
                No job exists for this proposal yet — scheduling it creates one in Jobs
                automatically.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Client email"
                type="email"
                value={jobClientEmail}
                onChange={(e) => setJobClientEmail(e.target.value)}
                placeholder="patel@example.com"
              />
              <Input
                label="Location"
                value={jobLocation}
                onChange={(e) => setJobLocation(e.target.value)}
                placeholder="412 Walnut St"
              />
            </div>

            <WorkerMultiPicker
              label="Assign workers (optional)"
              workers={workers}
              selectedIds={selectedWorkerIds}
              onChange={setSelectedWorkerIds}
              conflicts={conflicts}
              hint={
                selectedWorkerIds.length > 0
                  ? !jobLink
                    ? "Worker assignments require a linked job or proposal."
                    : "Workers will receive an invite — they confirm via the worker portal."
                  : null
              }
            />
          </>
        )}

        {kind === "appointment" && (
          <>
            <Input
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="On-site estimate · Patel residence"
            />

            <LinkedEntityPicker
              label="Link"
              tabs={[
                { key: "lead", label: "Lead" },
                { key: "client", label: "Client" },
                { key: "proposal", label: "Proposal" },
              ]}
              options={aptOptions}
              value={aptLink?.id ?? ""}
              onChange={pickAptLink}
              placeholder="Search or choose a lead / client / proposal…"
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Client name"
                value={aptClientName}
                onChange={(e) => setAptClientName(e.target.value)}
                placeholder="Patel family"
              />
              <Input
                label="Location"
                value={aptLocation}
                onChange={(e) => setAptLocation(e.target.value)}
                placeholder="412 Walnut St"
              />
            </div>

            <WorkerMultiPicker
              label="Sales staff / workers (optional)"
              workers={workers}
              selectedIds={aptWorkerIds}
              onChange={setAptWorkerIds}
              conflicts={conflicts}
              placeholder="Add staff…"
            />
          </>
        )}

        {kind === "blocked" && (
          <Select
            label="Reason"
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
          >
            {BLOCKED_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        )}

        <Textarea
          label={kind === "blocked" ? "Notes (optional)" : "Notes"}
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={
            kind === "appointment"
              ? "Confirmation details, questions to ask…"
              : kind === "blocked"
                ? "Optional context"
                : "Crew gear, access instructions, reminders…"
          }
        />
      </div>
    </Sheet>
  );
}

function formatSpan(start: Date, end: Date): string {
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return "";
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (sameDay) {
    return `${longDate(start)} · ${formatTime(start)}–${formatTime(end)}`;
  }
  return `${longDate(start)} ${formatTime(start)} → ${longDate(end)} ${formatTime(end)}`;
}

function formatTime(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}
