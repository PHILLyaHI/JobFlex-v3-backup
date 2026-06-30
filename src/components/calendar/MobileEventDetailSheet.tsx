"use client";
import * as React from "react";
import Link from "next/link";
import { ExternalLink, Clock, MapPin, FileText, User, Phone, ClipboardList } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { BottomSheet } from "@/components/ui/BottomSheet";

export interface MobileCalendarEvent {
  id: string;
  kind: "job" | "appointment" | "blocked";
  jobId: string | null;
  leadId: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
  notes: string | null;
  workerIds: string[];
  clientName: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  scopeOfWork?: string | null;
}

interface WorkerLite {
  id: string;
  name: string;
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function formatLongDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date(iso));
}

function statusTone(s: string): "neutral" | "accent" | "success" | "warn" | "danger" {
  if (s === "COMPLETED") return "success";
  if (s === "IN_PROGRESS") return "accent";
  if (s === "CANCELLED") return "danger";
  if (s === "SCHEDULED") return "neutral";
  return "neutral";
}

function kindLabel(k: MobileCalendarEvent["kind"]) {
  if (k === "appointment") return "Appointment";
  if (k === "blocked") return "Blocked";
  return "Job";
}

interface Props {
  event: MobileCalendarEvent | null;
  workers: WorkerLite[];
  onClose: () => void;
}

export function MobileEventDetailSheet({ event, workers, onClose }: Props) {
  const crew = event
    ? event.workerIds.map((wid) => workers.find((w) => w.id === wid)).filter(Boolean) as WorkerLite[]
    : [];

  return (
    <BottomSheet open={!!event} onClose={onClose} title={event?.title ?? "Event"}>
      {event && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge tone="neutral">{kindLabel(event.kind)}</Badge>
            {event.kind !== "blocked" && (
              <Badge tone={statusTone(event.status)}>{event.status.toLowerCase()}</Badge>
            )}
          </div>

          <dl className="space-y-2.5 text-[13px]">
            <Row icon={<Clock className="h-4 w-4" />} label="When">
              <span className="tabular">{formatTime(event.startsAt)} &ndash; {formatTime(event.endsAt)}</span>
              <span className="text-[color:var(--ink-muted)]"> &middot; {formatLongDate(event.startsAt)}</span>
            </Row>

            {event.clientName && (
              <Row icon={<User className="h-4 w-4" />} label="Client">
                <span className="font-medium text-[color:var(--ink)]">{event.clientName}</span>
              </Row>
            )}

            {event.clientPhone && (
              <Row icon={<Phone className="h-4 w-4" />} label="Phone">
                <a href={`tel:${event.clientPhone}`} className="tabular text-[color:var(--accent-ink)]">
                  {event.clientPhone}
                </a>
              </Row>
            )}

            {event.clientAddress && (
              <Row icon={<MapPin className="h-4 w-4" />} label="Address">
                <span className="text-[color:var(--ink-soft)] leading-relaxed">{event.clientAddress}</span>
              </Row>
            )}

            {event.scopeOfWork && (
              <Row icon={<ClipboardList className="h-4 w-4" />} label="Scope of work">
                <span className="block max-h-44 overflow-y-auto whitespace-pre-wrap leading-relaxed text-[color:var(--ink-soft)]">
                  {event.scopeOfWork}
                </span>
              </Row>
            )}

            {event.notes && (
              <Row icon={<FileText className="h-4 w-4" />} label="Notes">
                <span className="text-[color:var(--ink-soft)] leading-relaxed">{event.notes}</span>
              </Row>
            )}
          </dl>

          {crew.length > 0 && (
            <div>
              <div className="quiet-caps !mb-2">Crew</div>
              <ul className="space-y-2">
                {crew.map((w) => (
                  <li key={w.id} className="flex items-center gap-2.5">
                    <Avatar name={w.name} size={28} />
                    <span className="text-[13px]">{w.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(event.jobId || event.leadId) && (
            <div className="pt-3 border-t border-[color:var(--ink-line)]">
              {event.jobId && (
                <Link
                  href={`/dashboard/jobs/${event.jobId}` as never}
                  onClick={onClose}
                  className="flex items-center justify-between gap-3 py-2 text-[13px] text-[color:var(--ink)]"
                >
                  <span className="font-medium">Open job</span>
                  <ExternalLink className="h-4 w-4 text-[color:var(--ink-muted)]" />
                </Link>
              )}
              {event.leadId && (
                <Link
                  href={`/dashboard/leads/${event.leadId}` as never}
                  onClick={onClose}
                  className="flex items-center justify-between gap-3 py-2 text-[13px] text-[color:var(--ink)]"
                >
                  <span className="font-medium">View lead</span>
                  <ExternalLink className="h-4 w-4 text-[color:var(--ink-muted)]" />
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-[color:var(--ink-muted)]">{icon}</span>
      <div className="min-w-0">
        <dt className="sr-only">{label}</dt>
        <dd>{children}</dd>
      </div>
    </div>
  );
}
