"use client";
import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SelectMenu } from "./SelectMenu";
import { JobStatusBadge } from "@/components/jobs/JobStatusBadge";
import { longDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { CalendarEvent } from "./EventChip";
import { ExternalLink, Clock, Trash2, Save, Inbox, User, Users, Phone, MapPin, ClipboardList } from "lucide-react";

export interface EventEditPatch {
  title: string;
  startISO: string;
  endISO: string;
  notes: string;
  status: string;
  workerId: string | null;
}

interface EventDetailSheetProps {
  event: CalendarEvent | null;
  onClose: () => void;
  onDelete?: (eventId: string) => Promise<void> | void;
  // Remove the calendar event but keep the job (it returns to the tray). Job
  // events only — appointments/blocked time use onDelete.
  onUnschedule?: (eventId: string) => Promise<void> | void;
  // Inline edit — enabled only for job events when a save handler is provided.
  workers?: { id: string; name: string }[];
  currentWorkerId?: string | null;
  onSave?: (patch: EventEditPatch) => Promise<void> | void;
}

const JOB_STATUSES = [
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELED", label: "Canceled" },
];

function toLocalInput(iso: string | Date) {
  const d = iso instanceof Date ? iso : new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const fieldCls =
  "w-full h-9 px-3 rounded-[var(--r-md)] text-[13px] bg-white/70 hairline text-[color:var(--ink)] tabular focus:outline-none focus:shadow-[0_0_0_3px_rgba(31,122,82,0.18)]";

export function EventDetailSheet({
  event,
  onClose,
  onDelete,
  onUnschedule,
  workers,
  currentWorkerId,
  onSave,
}: EventDetailSheetProps) {
  const open = !!event;
  const e = event;
  const editable = !!onSave && !!e?.jobId;

  const [title, setTitle] = React.useState("");
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [status, setStatus] = React.useState("SCHEDULED");
  const [workerId, setWorkerId] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Reset the form whenever a different event opens.
  React.useEffect(() => {
    if (!e) return;
    setTitle(e.title ?? "");
    setStart(toLocalInput(e.startsAt));
    setEnd(toLocalInput(e.endsAt));
    setNotes(e.notes ?? "");
    setStatus(e.status ?? "SCHEDULED");
    setWorkerId(currentWorkerId ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e?.id, currentWorkerId]);

  const timeRange = e
    ? `${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(e.startsAt))} – ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(e.endsAt))}`
    : "";

  async function handleSave() {
    if (!onSave || !e) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim() || e.title,
        startISO: new Date(start).toISOString(),
        endISO: new Date(end).toISOString(),
        notes,
        status,
        workerId: workerId || null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={e?.title ?? "Event"}
      description={e ? longDate(e.startsAt) : undefined}
      width="min(440px, 100vw)"
    >
      {e &&
        (editable ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <JobStatusBadge status={status} />
              <Badge tone="neutral">Linked to job</Badge>
            </div>

            <ClientScopeInfo event={e} />

            <Field label="Title">
              <input className={fieldCls} value={title} onChange={(ev) => setTitle(ev.target.value)} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts">
                <input
                  type="datetime-local"
                  className={fieldCls}
                  value={start}
                  onChange={(ev) => setStart(ev.target.value)}
                />
              </Field>
              <Field label="Ends">
                <input
                  type="datetime-local"
                  className={fieldCls}
                  value={end}
                  onChange={(ev) => setEnd(ev.target.value)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Assigned to">
                <SelectMenu
                  value={workerId}
                  onChange={setWorkerId}
                  placeholder="Unassigned"
                  options={[
                    { value: "", label: "Unassigned" },
                    ...(workers ?? []).map((w) => ({ value: w.id, label: w.name })),
                  ]}
                />
              </Field>
              <Field label="Status">
                <SelectMenu value={status} onChange={setStatus} options={JOB_STATUSES} />
              </Field>
            </div>

            <Field label="Notes">
              <textarea
                rows={3}
                className={cn(fieldCls, "h-auto py-2 leading-relaxed resize-y")}
                value={notes}
                onChange={(ev) => setNotes(ev.target.value)}
                placeholder="Anything the crew should know."
              />
            </Field>

            <div className="pt-4 border-t border-[color:var(--ink-line)] flex items-center gap-2 flex-wrap">
              <Button size="sm" onClick={handleSave} loading={saving} icon={<Save className="h-3.5 w-3.5" />}>
                Save changes
              </Button>
              {e.jobId && (
                <Link href={`/dashboard/jobs/${e.jobId}` as Route}>
                  <Button variant="outline" size="sm" icon={<ExternalLink className="h-3 w-3" />}>
                    Open job
                  </Button>
                </Link>
              )}
              {onUnschedule && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onUnschedule(e.id)}
                  icon={<Inbox className="h-3 w-3" />}
                >
                  Unschedule
                </Button>
              )}
            </div>
          </div>
        ) : (
          // Read-only view — appointments, blocked time, or no save handler.
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <JobStatusBadge status={e.status} />
              {e.jobId && <Badge tone="neutral">Linked to job</Badge>}
            </div>
            <div className="space-y-3 text-[13px] text-[color:var(--ink-soft)]">
              <div className="flex items-center gap-2.5">
                <Clock className="h-3.5 w-3.5 text-[color:var(--ink-muted)]" />
                {timeRange}
              </div>
              {e.assigneeNames && e.assigneeNames.length > 0 && (
                <div className="flex items-center gap-2.5">
                  <Users className="h-3.5 w-3.5 text-[color:var(--ink-muted)]" />
                  <span>{e.assigneeNames.join(", ")}</span>
                </div>
              )}
              {e.notes && (
                <div className="pt-3 border-t border-[color:var(--ink-line)] whitespace-pre-wrap leading-relaxed">
                  {e.notes}
                </div>
              )}
            </div>

            <ClientScopeInfo event={e} />
            <div className="pt-4 border-t border-[color:var(--ink-line)] flex gap-2 flex-wrap">
              {e.jobId && (
                <Link href={`/dashboard/jobs/${e.jobId}` as Route}>
                  <Button variant="outline" size="sm" icon={<ExternalLink className="h-3 w-3" />}>
                    Open job
                  </Button>
                </Link>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await onDelete(e.id);
                    onClose();
                  }}
                  icon={<Trash2 className="h-3 w-3" />}
                >
                  Delete event
                </Button>
              )}
            </div>
          </div>
        ))}
    </Sheet>
  );
}

// Client contact + scope of work, shown when the event carries them (job events).
function ClientScopeInfo({ event }: { event: CalendarEvent }) {
  const hasClient = !!(event.clientName || event.clientPhone || event.clientAddress);
  if (!hasClient && !event.scopeOfWork) return null;
  return (
    <div className="space-y-4">
      {hasClient && (
        <div className="space-y-2 rounded-[var(--r-md)] bg-[color:var(--paper-deep)]/60 p-3.5">
          {event.clientName && (
            <div className="flex items-center gap-2.5 text-[13px] text-[color:var(--ink)]">
              <User className="h-3.5 w-3.5 shrink-0 text-[color:var(--ink-muted)]" />
              <span className="font-medium">{event.clientName}</span>
            </div>
          )}
          {event.clientPhone && (
            <a
              href={`tel:${event.clientPhone}`}
              className="flex items-center gap-2.5 text-[13px] text-[color:var(--ink-soft)] hover:text-[color:var(--accent-ink)]"
            >
              <Phone className="h-3.5 w-3.5 shrink-0 text-[color:var(--ink-muted)]" />
              <span className="tabular">{event.clientPhone}</span>
            </a>
          )}
          {event.clientAddress && (
            <div className="flex items-start gap-2.5 text-[12.5px] text-[color:var(--ink-soft)]">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--ink-muted)]" />
              <span className="leading-relaxed">{event.clientAddress}</span>
            </div>
          )}
        </div>
      )}
      {event.scopeOfWork && (
        <div>
          <div className="quiet-caps mb-1.5 flex items-center gap-1.5 text-[color:var(--ink-faint)]">
            <ClipboardList className="h-3 w-3" />
            Scope of work
          </div>
          <p className="max-h-52 overflow-y-auto whitespace-pre-wrap text-[12.5px] leading-relaxed text-[color:var(--ink-soft)]">
            {event.scopeOfWork}
          </p>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="quiet-caps block mb-1.5 text-[color:var(--ink-faint)]">{label}</span>
      {children}
    </label>
  );
}
