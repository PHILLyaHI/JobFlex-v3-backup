"use client";
import * as React from "react";
import { motion, type PanInfo } from "framer-motion";
import { Hammer, CalendarCheck, Ban } from "lucide-react";
import { cn } from "@/lib/cn";
import { statusAccent } from "@/components/jobs/JobStatusBadge";

export type CalendarEventKind = "job" | "appointment" | "blocked";

export interface CalendarEvent {
  id: string;
  title: string;
  startsAt: string | Date;
  endsAt: string | Date;
  status: string;
  jobId?: string | null;
  notes?: string | null;
  kind?: CalendarEventKind;
  // Optional context shown in the detail sheet (job events carry these).
  clientName?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  scopeOfWork?: string | null;
  // Display names of the staff assigned to this event (jobs + appointments).
  assigneeNames?: string[];
}

interface EventChipProps {
  event: CalendarEvent;
  onClick?: (e: React.MouseEvent) => void;
  onDragEnd?: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
  onDrag?: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
  draggable?: boolean;
  compact?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

// Appointments read as a distinct, non-work event type — a blue tint (the one
// blue in the calendar, mirroring how blocked time owns rose). Shared so the
// week/month/team chips stay in sync.
export const APPOINTMENT_BORDER = "#2563eb";
export const APPOINTMENT_TINT = "rgba(37,99,235,0.08)";

const KIND_ICONS: Record<CalendarEventKind, React.ReactNode> = {
  job: <Hammer className="h-2.5 w-2.5 shrink-0" />,
  appointment: <CalendarCheck className="h-2.5 w-2.5 shrink-0" />,
  blocked: <Ban className="h-2.5 w-2.5 shrink-0" />,
};

export function EventChip({
  event,
  onClick,
  onDragEnd,
  onDrag,
  draggable,
  compact = true,
  style,
  className,
}: EventChipProps) {
  // Suppress the trailing click after a drag so a move doesn't open the sheet.
  const movedRef = React.useRef(false);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(event.startsAt));

  const kind: CalendarEventKind = event.kind ?? "job";
  const accent = kind === "blocked" ? "var(--rose)" : statusAccent(event.status);
  const assignees = event.assigneeNames?.length ? event.assigneeNames.join(", ") : null;

  // Per-kind visual treatment for the left accent + chip background. Blocked
  // time reads as "unavailable" at a glance: rose diagonal stripes (the one
  // non-sage hue, reserved for danger/unavailable states).
  const kindStyle: React.CSSProperties =
    kind === "appointment"
      ? {
          borderLeftColor: APPOINTMENT_BORDER,
          borderLeftStyle: "dashed",
          backgroundColor: APPOINTMENT_TINT,
        }
      : kind === "blocked"
        ? {
            borderLeftColor: accent,
            backgroundImage:
              "repeating-linear-gradient(135deg, rgba(225,29,72,0.08) 0 5px, transparent 5px 10px)",
          }
        : { borderLeftColor: accent };

  return (
    <motion.button
      type="button"
      onClick={(e) => {
        if (movedRef.current) {
          movedRef.current = false;
          return;
        }
        onClick?.(e);
      }}
      drag={draggable}
      dragSnapToOrigin
      dragElastic={0.15}
      onPointerDown={() => {
        movedRef.current = false;
      }}
      onDragStart={() => {
        movedRef.current = true;
      }}
      whileDrag={{
        scale: 0.98,
        rotate: 0.3,
        boxShadow: "0 20px 48px -24px rgba(17,17,19,0.35)",
        zIndex: 30,
      }}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      style={{
        touchAction: "none",
        ...kindStyle,
        ...style,
      }}
      className={cn(
        "group relative flex items-center gap-1.5 rounded-[var(--r-sm)] bg-white/80 dark:bg-white/[0.05] border border-[color:var(--ink-line)] border-l-[3px] px-1.5 py-[3px] text-left text-[11px] leading-tight truncate shadow-[0_1px_0_rgba(17,17,19,0.03)] hover:shadow-[0_2px_8px_-4px_rgba(17,17,19,0.12)] transition-shadow cursor-pointer",
        compact ? "min-h-[22px]" : "min-h-[32px] text-[12px] px-2 py-1",
        kind === "blocked" && "text-[color:var(--ink-muted)]",
        className,
      )}
      title={`${event.title} · ${time}${assignees ? ` · ${assignees}` : ""}`}
    >
      <span
        className={cn(
          "shrink-0",
          kind === "blocked"
            ? "text-[color:var(--ink-muted)]"
            : "text-[color:var(--ink-faint)]",
        )}
        aria-hidden
      >
        {KIND_ICONS[kind]}
      </span>
      <span className="text-[color:var(--ink-muted)] tabular shrink-0 text-[10px]">{time}</span>
      <span className="text-[color:var(--ink)] font-medium truncate">{event.title}</span>
      {assignees && (
        <span className="ml-auto max-w-[45%] shrink-0 truncate text-[10px] text-[color:var(--ink-muted)]">
          {assignees}
        </span>
      )}
    </motion.button>
  );
}
