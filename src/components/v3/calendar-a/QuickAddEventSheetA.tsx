"use client";
// V3 calendar-a — quick-add sheet redesign (v2).
//
// Major changes vs. the previous iteration:
//  - Starts + Ends instead of starts + duration. Events can now span multiple
//    days. A simple click on an empty slot pre-fills ends = start + 30 min;
//    a click-and-drag in the week grid pre-fills the dragged span.
//  - Both date fields use a custom DateTimePicker so the trigger icon stays
//    anchored inside the field, the entire field opens the picker, and the
//    calendar popover matches our design language instead of the native
//    browser surface.
//
// Other behaviour kept from v1:
//  - Title above the linked-job / linked-lead picker.
//  - Latest-2 + search-reveal pickers.
//  - Client email + location encoded into notes.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { longDate } from "@/lib/format";
import { createJobEvent } from "@/actions/jobs";
import { assignWorker } from "@/actions/workers";
import { createAppointment } from "@/actions/appointments";
import { createBlockedTime } from "@/actions/blockedTime";
import { reportPlanLimit, ensureWithinLimit } from "@/stores/usePlanLimitStore";
import { EventTypeTabs, type CalendarEventKind } from "@/components/calendar/EventTypeTabs";
import { DateTimePicker } from "./DateTimePicker";

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
  workers: QuickAddWorkerOption[];
  defaultStart: Date | null;
  defaultEnd: Date | null;
  defaultKind?: CalendarEventKind;
}

const BLOCKED_REASONS = ["Vacation", "Sick day", "Holiday", "Office hours", "Other"];

const LATEST_VISIBLE = 2;
const SEARCH_LIMIT = 8;
const DEFAULT_DURATION_MIN = 30;

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
  workers,
  defaultStart,
  defaultEnd,
  defaultKind = "job",
}: Props) {
  const router = useRouter();

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

  const [kind, setKind] = React.useState<CalendarEventKind>(defaultKind);
  const [startsAt, setStartsAt] = React.useState<Date>(initialStart);
  const [endsAt, setEndsAt] = React.useState<Date>(initialEnd);
  const [title, setTitle] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const [jobId, setJobId] = React.useState<string>("");
  const [jobQuery, setJobQuery] = React.useState("");
  const [jobSearchOpen, setJobSearchOpen] = React.useState(false);
  const [selectedWorkerIds, setSelectedWorkerIds] = React.useState<string[]>([]);
  const [jobClientEmail, setJobClientEmail] = React.useState("");
  const [jobLocation, setJobLocation] = React.useState("");

  const [leadId, setLeadId] = React.useState<string>("");
  const [leadQuery, setLeadQuery] = React.useState("");
  const [leadSearchOpen, setLeadSearchOpen] = React.useState(false);
  const [aptClientName, setAptClientName] = React.useState("");
  const [aptLocation, setAptLocation] = React.useState("");

  const [blockReason, setBlockReason] = React.useState("Vacation");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setKind(defaultKind);
    setStartsAt(initialStart);
    setEndsAt(initialEnd);
    setJobId("");
    setJobQuery("");
    setJobSearchOpen(false);
    setLeadId("");
    setLeadQuery("");
    setLeadSearchOpen(false);
    setSelectedWorkerIds([]);
    setTitle("");
    setNotes("");
    setBlockReason("Vacation");
    setJobClientEmail("");
    setJobLocation("");
    setAptClientName("");
    setAptLocation("");
  }, [open, initialStart, initialEnd, defaultKind]);

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

  const filteredJobs = React.useMemo(() => {
    const q = jobQuery.trim().toLowerCase();
    if (!q) return jobs.slice(0, SEARCH_LIMIT);
    return jobs
      .filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          (j.clientName ?? "").toLowerCase().includes(q),
      )
      .slice(0, SEARCH_LIMIT);
  }, [jobs, jobQuery]);

  const latestJobs = React.useMemo(() => jobs.slice(0, LATEST_VISIBLE), [jobs]);

  const filteredLeads = React.useMemo(() => {
    const q = leadQuery.trim().toLowerCase();
    if (!q) return leads.slice(0, SEARCH_LIMIT);
    return leads
      .filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          (l.email ?? "").toLowerCase().includes(q) ||
          (l.projectType ?? "").toLowerCase().includes(q),
      )
      .slice(0, SEARCH_LIMIT);
  }, [leads, leadQuery]);

  const latestLeads = React.useMemo(() => leads.slice(0, LATEST_VISIBLE), [leads]);

  const selectedJob = jobs.find((j) => j.id === jobId);
  const selectedLead = leads.find((l) => l.id === leadId);

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
      const start = new Date(startsAt);
      const end = new Date(endsAt);

      if (kind === "job") {
        const finalTitle = title.trim() || selectedJob?.title || "Event";
        const finalNotes = buildNotes(
          [
            { label: "Client email", value: jobClientEmail },
            { label: "Location", value: jobLocation },
          ],
          notes,
        );
        await createJobEvent({
          title: finalTitle,
          jobId: jobId || null,
          startsAt: start,
          endsAt: end,
          notes: finalNotes,
        });
        if (jobId && selectedWorkerIds.length > 0) {
          for (const wId of selectedWorkerIds) {
            try {
              await assignWorker(jobId, wId);
            } catch (err) {
              console.warn("[QuickAddA] assign failed:", err);
            }
          }
        }
        toast.success("Event created");
      } else if (kind === "appointment") {
        const finalTitle = title.trim()
          ? title.trim()
          : selectedLead?.name
            ? `${selectedLead?.projectType ?? "Appointment"} · ${selectedLead?.name ?? ""}`.trim()
            : "Appointment";
        const finalNotes = buildNotes(
          [
            { label: "Client name", value: aptClientName },
            { label: "Location", value: aptLocation },
          ],
          notes,
        );
        await createAppointment({
          title: finalTitle,
          leadId: leadId || null,
          startsAt: start,
          endsAt: end,
          notes: finalNotes,
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

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New event"
      description={subtitle}
      width="min(480px, 100vw)"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            {kind === "blocked"
              ? "Block time"
              : kind === "appointment"
                ? "Book appointment"
                : "Create event"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <EventTypeTabs value={kind} onChange={setKind} />

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

        {kind === "job" && (
          <>
            <Input
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={selectedJob ? selectedJob.title : "Material delivery"}
            />

            <PickerSection
              label="Linked job (optional)"
              searchOpen={jobSearchOpen}
              onSearchToggle={() => setJobSearchOpen((v) => !v)}
              searchLabel={jobSearchOpen ? "Hide search" : "Search jobs"}
            >
              {selectedJob ? (
                <div className="flex items-center gap-2 paper-card px-3 py-2">
                  <Avatar name={selectedJob.clientName ?? selectedJob.title} size={26} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">
                      {selectedJob.title}
                    </div>
                    {selectedJob.clientName && (
                      <div className="text-[11px] text-[color:var(--ink-muted)]">
                        {selectedJob.clientName}
                      </div>
                    )}
                  </div>
                  <Badge tone="neutral">{selectedJob.status.toLowerCase()}</Badge>
                  <button
                    onClick={() => setJobId("")}
                    className="h-6 w-6 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.05]"
                    aria-label="Clear job"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : jobSearchOpen ? (
                <>
                  <Input
                    value={jobQuery}
                    onChange={(e) => setJobQuery(e.target.value)}
                    placeholder="Search jobs by title or client…"
                    prefix={<Search className="h-3 w-3" />}
                    autoFocus
                  />
                  {filteredJobs.length > 0 && (
                    <ul className="mt-2 paper-card overflow-hidden">
                      {filteredJobs.map((j) => (
                        <li key={j.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setJobId(j.id);
                              setJobSearchOpen(false);
                              if (!title) setTitle(j.title);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-black/[0.02] transition-colors"
                          >
                            <Avatar name={j.clientName ?? j.title} size={22} />
                            <div className="flex-1 min-w-0">
                              <div className="text-[12.5px] font-medium text-[color:var(--ink)] truncate">
                                {j.title}
                              </div>
                              {j.clientName && (
                                <div className="text-[10px] text-[color:var(--ink-muted)] truncate">
                                  {j.clientName}
                                </div>
                              )}
                            </div>
                            <Badge tone="neutral">{j.status.toLowerCase()}</Badge>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <LatestList>
                  {latestJobs.length === 0 && (
                    <EmptyHint>No jobs yet. Click search to look further.</EmptyHint>
                  )}
                  {latestJobs.map((j) => (
                    <li key={j.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setJobId(j.id);
                          if (!title) setTitle(j.title);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-black/[0.02] transition-colors"
                      >
                        <Avatar name={j.clientName ?? j.title} size={22} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] font-medium text-[color:var(--ink)] truncate">
                            {j.title}
                          </div>
                          {j.clientName && (
                            <div className="text-[10px] text-[color:var(--ink-muted)] truncate">
                              {j.clientName}
                            </div>
                          )}
                        </div>
                        <Badge tone="neutral">{j.status.toLowerCase()}</Badge>
                      </button>
                    </li>
                  ))}
                  {jobs.length > LATEST_VISIBLE && (
                    <MoreRow
                      onClick={() => setJobSearchOpen(true)}
                      label={`More jobs (${jobs.length - LATEST_VISIBLE})…`}
                    />
                  )}
                </LatestList>
              )}
            </PickerSection>

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

            <div>
              <div className="quiet-caps mb-1.5">Assign workers (optional)</div>
              <div className="flex flex-wrap gap-1.5">
                {workers.length === 0 && (
                  <span className="text-[11px] text-[color:var(--ink-muted)]">
                    No workers in your roster yet.
                  </span>
                )}
                {workers.map((w) => {
                  const on = selectedWorkerIds.includes(w.id);
                  return (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() =>
                        setSelectedWorkerIds(
                          on
                            ? selectedWorkerIds.filter((x) => x !== w.id)
                            : [...selectedWorkerIds, w.id],
                        )
                      }
                      className={cn(
                        "inline-flex items-center gap-1.5 h-7 px-2 rounded-full text-[11px] transition-colors hairline",
                        on
                          ? "bg-[color:var(--accent)] text-[color:var(--paper)] border-transparent"
                          : "text-[color:var(--ink-muted)] hover:bg-black/[0.04]",
                      )}
                    >
                      <Avatar name={w.name} size={16} />
                      <span>{w.name.split(" ")[0]}</span>
                    </button>
                  );
                })}
              </div>
              {!jobId && selectedWorkerIds.length > 0 && (
                <p className="text-[10px] text-[color:var(--ink-muted)] mt-2">
                  Worker assignments require a linked job.
                </p>
              )}
              {jobId && selectedWorkerIds.length > 0 && (
                <p className="text-[10px] text-[color:var(--ink-muted)] mt-2">
                  Workers will receive an invite — they confirm via the worker portal.
                </p>
              )}
            </div>
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

            <PickerSection
              label="Linked lead (optional)"
              searchOpen={leadSearchOpen}
              onSearchToggle={() => setLeadSearchOpen((v) => !v)}
              searchLabel={leadSearchOpen ? "Hide search" : "Search leads"}
            >
              {selectedLead ? (
                <div className="flex items-center gap-2 paper-card px-3 py-2">
                  <Avatar name={selectedLead.name} size={26} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">
                      {selectedLead.name}
                    </div>
                    <div className="text-[11px] text-[color:var(--ink-muted)] truncate">
                      {selectedLead.projectType ?? selectedLead.email ?? "—"}
                    </div>
                  </div>
                  {selectedLead.aiCategory && (
                    <Badge tone="accent">{selectedLead.aiCategory}</Badge>
                  )}
                  <button
                    onClick={() => setLeadId("")}
                    className="h-6 w-6 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.05]"
                    aria-label="Clear lead"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : leadSearchOpen ? (
                <>
                  <Input
                    value={leadQuery}
                    onChange={(e) => setLeadQuery(e.target.value)}
                    placeholder="Search leads by name or project…"
                    prefix={<Search className="h-3 w-3" />}
                    autoFocus
                  />
                  {filteredLeads.length > 0 && (
                    <ul className="mt-2 paper-card overflow-hidden">
                      {filteredLeads.map((l) => (
                        <li key={l.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setLeadId(l.id);
                              setLeadSearchOpen(false);
                              if (!title) {
                                setTitle(
                                  l.projectType
                                    ? `${l.projectType} · ${l.name}`
                                    : `Appointment · ${l.name}`,
                                );
                              }
                              if (!aptClientName) setAptClientName(l.name);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-black/[0.02] transition-colors"
                          >
                            <Avatar name={l.name} size={22} />
                            <div className="flex-1 min-w-0">
                              <div className="text-[12.5px] font-medium text-[color:var(--ink)] truncate">
                                {l.name}
                              </div>
                              <div className="text-[10px] text-[color:var(--ink-muted)] truncate">
                                {l.projectType ?? l.email ?? "—"}
                              </div>
                            </div>
                            {l.aiCategory && <Badge tone="accent">{l.aiCategory}</Badge>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <LatestList>
                  {latestLeads.length === 0 && (
                    <EmptyHint>No leads yet. Click search to look further.</EmptyHint>
                  )}
                  {latestLeads.map((l) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setLeadId(l.id);
                          if (!title) {
                            setTitle(
                              l.projectType
                                ? `${l.projectType} · ${l.name}`
                                : `Appointment · ${l.name}`,
                            );
                          }
                          if (!aptClientName) setAptClientName(l.name);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-black/[0.02] transition-colors"
                      >
                        <Avatar name={l.name} size={22} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] font-medium text-[color:var(--ink)] truncate">
                            {l.name}
                          </div>
                          <div className="text-[10px] text-[color:var(--ink-muted)] truncate">
                            {l.projectType ?? l.email ?? "—"}
                          </div>
                        </div>
                        {l.aiCategory && <Badge tone="accent">{l.aiCategory}</Badge>}
                      </button>
                    </li>
                  ))}
                  {leads.length > LATEST_VISIBLE && (
                    <MoreRow
                      onClick={() => setLeadSearchOpen(true)}
                      label={`More leads (${leads.length - LATEST_VISIBLE})…`}
                    />
                  )}
                </LatestList>
              )}
            </PickerSection>

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
          </>
        )}

        {kind === "blocked" && (
          <>
            <Select
              label="Reason"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
            >
              {BLOCKED_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
            <p className="text-[11px] text-[color:var(--ink-muted)] leading-relaxed">
              Blocked time hides this slot from worker dispatch and shows a hatched chip on the
              calendar. Use it for vacation, holidays, or unavailable office hours.
            </p>
          </>
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

interface PickerSectionProps {
  label: string;
  searchOpen: boolean;
  onSearchToggle: () => void;
  searchLabel: string;
  children: React.ReactNode;
}

function PickerSection({
  label,
  searchOpen,
  onSearchToggle,
  searchLabel,
  children,
}: PickerSectionProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="quiet-caps !mb-0">{label}</div>
        <button
          type="button"
          onClick={onSearchToggle}
          className={cn(
            "inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] transition-colors",
            searchOpen
              ? "text-[color:var(--ink)]"
              : "text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]",
          )}
        >
          <Search className="h-3 w-3" />
          {searchLabel}
        </button>
      </div>
      {children}
    </div>
  );
}

function LatestList({ children }: { children: React.ReactNode }) {
  return (
    <ul className="paper-card overflow-hidden divide-y divide-[color:var(--ink-line)]">
      {children}
    </ul>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <li className="px-3 py-3 text-[11px] text-[color:var(--ink-muted)]">{children}</li>;
}

function MoreRow({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[11px] font-medium text-[color:var(--ink-muted)] transition-colors hover:bg-black/[0.02] hover:text-[color:var(--ink)]"
      >
        <Search className="h-3 w-3" />
        {label}
      </button>
    </li>
  );
}
