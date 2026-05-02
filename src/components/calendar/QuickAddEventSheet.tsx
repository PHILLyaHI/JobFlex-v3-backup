"use client";
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
import { EventTypeTabs, type CalendarEventKind } from "./EventTypeTabs";

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
}

const DURATIONS = [
  { value: "30", label: "30 min" },
  { value: "60", label: "1h" },
  { value: "120", label: "2h" },
  { value: "240", label: "Half day · 4h" },
  { value: "480", label: "Full day · 8h" },
];

const BLOCKED_REASONS = ["Vacation", "Sick day", "Holiday", "Office hours", "Other"];

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function QuickAddEventSheet({
  open,
  onClose,
  jobs,
  leads,
  workers,
  defaultStart,
  defaultKind = "job",
}: Props) {
  const router = useRouter();

  const initialStart = React.useMemo(() => {
    const base = defaultStart ?? new Date();
    if (!defaultStart) base.setHours(9, 0, 0, 0);
    return toLocalInput(base);
  }, [defaultStart]);

  const [kind, setKind] = React.useState<CalendarEventKind>(defaultKind);
  const [startsAt, setStartsAt] = React.useState(initialStart);
  const [duration, setDuration] = React.useState("120");
  const [title, setTitle] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // job-event state
  const [jobId, setJobId] = React.useState<string>("");
  const [jobQuery, setJobQuery] = React.useState("");
  const [selectedWorkerIds, setSelectedWorkerIds] = React.useState<string[]>([]);

  // appointment state
  const [leadId, setLeadId] = React.useState<string>("");
  const [leadQuery, setLeadQuery] = React.useState("");

  // blocked-time state
  const [blockReason, setBlockReason] = React.useState("Vacation");

  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setKind(defaultKind);
      setStartsAt(initialStart);
      setDuration("120");
      setJobId("");
      setJobQuery("");
      setLeadId("");
      setLeadQuery("");
      setSelectedWorkerIds([]);
      setTitle("");
      setNotes("");
      setBlockReason("Vacation");
    }
  }, [open, initialStart, defaultKind]);

  const filteredJobs = React.useMemo(() => {
    const q = jobQuery.trim().toLowerCase();
    if (!q) return jobs.slice(0, 8);
    return jobs
      .filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          (j.clientName ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [jobs, jobQuery]);

  const filteredLeads = React.useMemo(() => {
    const q = leadQuery.trim().toLowerCase();
    if (!q) return leads.slice(0, 8);
    return leads
      .filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          (l.email ?? "").toLowerCase().includes(q) ||
          (l.projectType ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [leads, leadQuery]);

  const selectedJob = jobs.find((j) => j.id === jobId);
  const selectedLead = leads.find((l) => l.id === leadId);

  async function submit() {
    setBusy(true);
    try {
      const start = new Date(startsAt);
      const end = new Date(start.getTime() + Number(duration) * 60 * 1000);

      if (kind === "job") {
        const finalTitle = title.trim() || selectedJob?.title || "Event";
        await createJobEvent({
          title: finalTitle,
          jobId: jobId || null,
          startsAt: start,
          endsAt: end,
          notes: notes.trim() || null,
        });
        if (jobId && selectedWorkerIds.length > 0) {
          for (const wId of selectedWorkerIds) {
            try {
              await assignWorker(jobId, wId);
            } catch (err) {
              console.warn("[QuickAdd] assign failed:", err);
            }
          }
        }
        toast.success("Event created");
      } else if (kind === "appointment") {
        const finalTitle = title.trim() || selectedLead?.name
          ? `${selectedLead?.projectType ?? "Appointment"} · ${selectedLead?.name ?? ""}`.trim()
          : "Appointment";
        await createAppointment({
          title: finalTitle,
          leadId: leadId || null,
          startsAt: start,
          endsAt: end,
          notes: notes.trim() || null,
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
            {kind === "blocked" ? "Block time" : kind === "appointment" ? "Book appointment" : "Create event"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <EventTypeTabs value={kind} onChange={setKind} />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Starts"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
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
            <div>
              <div className="quiet-caps mb-1.5">Linked job (optional)</div>
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
              ) : (
                <>
                  <Input
                    value={jobQuery}
                    onChange={(e) => setJobQuery(e.target.value)}
                    placeholder="Search jobs by title or client…"
                    prefix={<Search className="h-3 w-3" />}
                  />
                  {filteredJobs.length > 0 && (
                    <ul className="mt-2 paper-card overflow-hidden">
                      {filteredJobs.map((j) => (
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
                    </ul>
                  )}
                </>
              )}
            </div>

            <Input
              label="Title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={selectedJob ? selectedJob.title : "Material delivery"}
            />

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
            <div>
              <div className="quiet-caps mb-1.5">Linked lead (optional)</div>
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
              ) : (
                <>
                  <Input
                    value={leadQuery}
                    onChange={(e) => setLeadQuery(e.target.value)}
                    placeholder="Search leads by name or project…"
                    prefix={<Search className="h-3 w-3" />}
                  />
                  {filteredLeads.length > 0 && (
                    <ul className="mt-2 paper-card overflow-hidden">
                      {filteredLeads.map((l) => (
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
              )}
            </div>

            <Input
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="On-site estimate · Patel residence"
            />
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

function formatTime(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}
