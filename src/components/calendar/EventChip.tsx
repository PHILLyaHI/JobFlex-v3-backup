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
}

interface EventChipProps {
  event: CalendarEvent;
  onClick?: (e: React.MouseEvent) => void;
  onDragEnd?: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
  draggable?: boolean;
  compact?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

const KIND_ICONS: Record<CalendarEventKind, React.ReactNode> = {
  job: <Hammer className="h-2.5 w-2.5 shrink-0" />,
  appointment: <CalendarCheck className="h-2.5 w-2.5 shrink-0" />,
  blocked: <Ban className="h-2.5 w-2.5 shrink-0" />,
};

export function EventChip({
  event,
  onClick,
  onDragEnd,
  draggable,
  compact = true,
  style,
  className,
}: EventChipProps) {
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(event.startsAt));

  const kind: CalendarEventKind = event.kind ?? "job";
  const accent = kind === "blocked" ? "#6B6A64" : statusAccent(event.status);

  // Per-kind visual treatment for the left accent + chip background.
  const kindStyle: React.CSSProperties =
    kind === "appointment"
      ? { borderLeftColor: accent, borderLeftStyle: "dashed" }
      : kind === "blocked"
        ? {
            borderLeftColor: accent,
            backgroundImage:
              "repeating-linear-gradient(135deg, rgba(107,106,100,0.05) 0 4px, transparent 4px 8px)",
          }
        : { borderLeftColor: accent };

  return (
    <motion.button
      type="button"
      onClick={onClick}
      drag={draggable}
      dragSnapToOrigin
      dragElastic={0.15}
      whileDrag={{
        scale: 0.98,
        rotate: 0.3,
        boxShadow: "0 20px 48px -24px rgba(17,17,19,0.35)",
        zIndex: 30,
      }}
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
      title={`${event.title} · ${time}`}
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
    </motion.button>
  );
}
