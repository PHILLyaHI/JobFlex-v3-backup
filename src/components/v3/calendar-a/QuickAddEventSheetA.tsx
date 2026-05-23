"use client";
// V3 calendar-a — quick-add sheet redesign.
//
// Changes vs. the original sheet:
//  - Title moved above the linked-job / linked-lead picker (so the user can
//    name the event before deciding what to link, instead of after).
//  - Picker list shows only the 2 most recent jobs/leads by default. The full
//    list is hidden behind a "Search jobs" / "Search leads" toggle — the
//    list is not noise in the common case, but is one click away.
//  - Added client email + location (job mode) and client name + location
//    (appointment mode). These are persisted by encoding them into the
//    existing `notes` field so we do not touch server actions or schema.
//  - Fixed the "Starts" date field: the native datetime picker indicator
//    is replaced with an in-field Calendar button that calls showPicker().
//  - Honors `defaultDurationMin` from the WeekGridA click-and-drag preview.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, X, Calendar as CalendarIcon } from "lucide-react";
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
import { EventTypeTabs, type CalendarEventKind } from "@/components/calendar/EventTypeTabs";

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
  defaultKind?: CalendarEventKind;
  defaultDurationMin?: number;
}

const DURATIONS = [
  { value: "30", label: "30 min" },
  { value: "60", label: "1h" },
  { value: "120", label: "2h" },
  { value: "240", label: "Half day · 4h" },
  { value: "480", label: "Full day · 8h" },
];

const BLOCKED_REASONS = ["Vacation", "Sick day", "Holiday", "Office hours", "Other"];

const LATEST_VISIBLE = 2;
const SEARCH_LIMIT = 8;

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pickClosestDurationValue(min: number | undefined): string {
  if (!min || !Number.isFinite(min)) return "120";
  let best = DURATIONS[0];
  let bestDelta = Math.abs(Number(best.value) - min);
  for (const d of DURATIONS) {
    const delta = Math.abs(Number(d.value) - min);
    if (delta < bestDelta) {
      best = d;
      bestDelta = delta;
    }
  }
  return best.value;
}

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
  defaultKind = "job",
  defaultDurationMin,
}: Props) {
  const router = useRouter();

  const initialStart = React.useMemo(() => {
    const base = defaultStart ?? new Date();
    if (!defaultStart) base.setHours(9, 0, 0, 0);
    return toLocalInput(base);
  }, [defaultStart]);

  const initialDuration = React.useMemo(
    () => pickClosestDurationValue(defaultDurationMin),
    [defaultDurationMin],
  );

  const [kind, setKind] = React.useState<CalendarEventKind>(defaultKind);
  const [startsAt, setStartsAt] = React.useState(initialStart);
  const [duration, setDuration] = React.useState(initialDuration);
  const [title, setTitle] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // job-event state
  const [jobId, setJobId] = React.useState<string>("");
  const [jobQuery, setJobQuery] = React.useState("");
  const [jobSearchOpen, setJobSearchOpen] = React.useState(false);
  const [selectedWorkerIds, setSelectedWorkerIds] = React.useState<string[]>([]);
  const [jobClientEmail, setJobClientEmail] = React.useState("");
  const [jobLocation, setJobLocation] = React.useState("");

  // appointment state
  const [leadId, setLeadId] = React.useState<string>("");
  const [leadQuery, setLeadQuery] = React.useState("");
  const [leadSearchOpen, setLeadSearchOpen] = React.useState(false);
  const [aptClientName, setAptClientName] = React.useState("");
  const [aptLocation, setAptLocation] = React.useState("");

  // blocked-time state
  const [blockReason, setBlockReason] = React.useState("Vacation");

  const [busy, setBusy] = React.useState(false);

  const startsInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setKind(defaultKind);
    setStartsAt(initialStart);
    setDuration(initialDuration);
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
  }, [open, initialStart, initialDuration, defaultKind]);

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
    try {
      const start = new Date(startsAt);
      const end = new Date(start.getTime() + Number(duration) * 60 * 1000);

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
      toast.error("Couldn't save", err?.message);
    } finally {
      setBusy(false);
    }
  }

  const startDate = new Date(startsAt);
  const endDate = new Date(startDate.getTime() + Number(duration) * 60 * 1000);
  const subtitle = isNaN(startDate.getTime())
    ? undefined
    : `${longDate(startDate)} · ${formatTime(startDate)}–${formatTime(endDate)}`;

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
          <StartsField
            value={startsAt}
            onChange={setStartsAt}
            inputRef={startsInputRef}
          />
          <Select
            label="Duration"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          >
            {DURATIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
        </div>

        {kind === "job" && (
          <>
            {/* Title sits above the linked-job picker. */}
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
            {/* Title sits above the linked-lead picker. */}
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

interface StartsFieldProps {
  value: string;
  onChange: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

// Custom Starts field. The native datetime-local picker indicator is hidden
// and replaced with a Calendar button that stays anchored inside the field.
function StartsField({ value, onChange, inputRef }: StartsFieldProps) {
  const id = React.useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="quiet-caps">
        Starts
      </label>
      <div className="flex h-10 items-center gap-2 rounded-[var(--r-md)] bg-white/60 dark:bg-white/[0.03] pl-3 pr-2 transition-all hairline focus-within:shadow-[0_0_0_3px_rgba(79,70,229,0.18)]">
        <input
          ref={inputRef}
          id={id}
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "peer flex-1 bg-transparent text-sm text-[color:var(--ink)] outline-none",
            // Hide the native picker indicator so our own icon owns the right edge.
            "[&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:w-0 [&::-webkit-calendar-picker-indicator]:h-0 [&::-webkit-calendar-picker-indicator]:p-0 [&::-webkit-calendar-picker-indicator]:m-0",
          )}
        />
        <button
          type="button"
          onClick={() => {
            const el = inputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
            if (el && typeof el.showPicker === "function") {
              try {
                el.showPicker();
              } catch {
                el.focus();
              }
            } else {
              inputRef.current?.focus();
            }
          }}
          className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.05] hover:text-[color:var(--ink)] transition-colors shrink-0"
          aria-label="Open date picker"
        >
          <CalendarIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
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
  return <ul className="paper-card overflow-hidden divide-y divide-[color:var(--ink-line)]">{children}</ul>;
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <li className="px-3 py-3 text-[11px] text-[color:var(--ink-muted)]">{children}</li>
  );
}

function formatTime(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}
