"use client";
import Link from "next/link";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { JobStatusBadge } from "@/components/jobs/JobStatusBadge";
import { longDate } from "@/lib/format";
import type { CalendarEvent } from "./EventChip";
import { ExternalLink, Clock, MapPin, Trash2 } from "lucide-react";

interface EventDetailSheetProps {
  event: CalendarEvent | null;
  onClose: () => void;
  onDelete?: (eventId: string) => Promise<void> | void;
}

export function EventDetailSheet({ event, onClose, onDelete }: EventDetailSheetProps) {
  const open = !!event;
  const e = event;

  const timeRange = e
    ? `${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(e.startsAt))} – ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(e.endsAt))}`
    : "";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={e?.title ?? "Event"}
      description={e ? longDate(e.startsAt) : undefined}
      width="min(440px, 100vw)"
    >
      {e && (
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
            {e.notes && (
              <div className="pt-3 border-t border-[color:var(--ink-line)] whitespace-pre-wrap leading-relaxed">
                {e.notes}
              </div>
            )}
          </div>
          <div className="pt-4 border-t border-[color:var(--ink-line)] flex gap-2 flex-wrap">
            {e.jobId && (
              <Link href={`/dashboard/jobs/${e.jobId}` as any}>
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
      )}
    </Sheet>
  );
}
