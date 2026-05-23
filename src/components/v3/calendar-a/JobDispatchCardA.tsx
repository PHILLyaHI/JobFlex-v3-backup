"use client";
// V3 calendar-a — dispatch card with z-index fix.
//
// Original bug: while dragging, the card visually disappeared "behind" the
// calendar because (a) it slipped beneath calendar chips in the stacking
// order and (b) the tray's overflow-hidden clipped the dragged transform.
//
// Fix:
//  - Bump `whileDrag.zIndex` to 60 so the card sits above anything in the
//    calendar grid (WeekGrid chips top out at z:10).
//  - Set `position: relative` so the z-index actually applies.
//  - Notify the parent tray via `onDragStateChange` so it can relax its
//    overflow constraints while a card is in flight.

import * as React from "react";
import { motion, type PanInfo } from "framer-motion";
import { JobStatusBadge, statusAccent } from "@/components/jobs/JobStatusBadge";
import { money } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface DispatchableJob {
  id: string;
  title: string;
  status: string;
  clientName: string | null;
  clientAddress: string | null;
  proposalTotal: number | null;
}

interface Props {
  job: DispatchableJob;
  onDragEnd: (info: PanInfo) => void;
  onDragStateChange?: (dragging: boolean) => void;
  onDragMove?: (point: { x: number; y: number }) => void;
  className?: string;
}

export function JobDispatchCardA({
  job,
  onDragEnd,
  onDragStateChange,
  onDragMove,
  className,
}: Props) {
  return (
    <motion.div
      layout
      drag
      dragSnapToOrigin
      dragElastic={0.12}
      whileHover={{ y: -2 }}
      whileDrag={{
        scale: 0.95,
        rotate: 0.5,
        zIndex: 60,
        boxShadow: "0 28px 56px -18px rgba(17,17,19,0.36)",
      }}
      onDragStart={() => onDragStateChange?.(true)}
      onDrag={(_, info) => onDragMove?.({ x: info.point.x, y: info.point.y })}
      onDragEnd={(_, info) => {
        onDragEnd(info);
        onDragStateChange?.(false);
      }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: "relative",
        borderLeftColor: statusAccent(job.status),
        touchAction: "none",
        zIndex: 1,
      }}
      className={cn(
        "paper-card border-l-[3px] p-3.5 cursor-grab active:cursor-grabbing select-none",
        className,
      )}
      title={`${job.title} — drag onto a date to schedule`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <JobStatusBadge status={job.status} dot={false} />
      </div>
      <div className="font-display text-[15px] leading-tight tracking-[-0.01em] text-[color:var(--ink)] line-clamp-2">
        {job.title}
      </div>
      {(job.clientName || job.clientAddress) && (
        <div className="mt-1.5 text-[11px] text-[color:var(--ink-muted)] truncate">
          {job.clientName}
          {job.clientName && job.clientAddress ? " · " : ""}
          {job.clientAddress}
        </div>
      )}
      {job.proposalTotal !== null && (
        <div className="mt-2 pt-2 border-t border-[color:var(--ink-line)] flex items-center justify-between">
          <span className="text-[10px] text-[color:var(--ink-faint)] tracking-[0.12em] uppercase">
            Drag to schedule
          </span>
          <span className="font-display tabular text-[14px] text-[color:var(--ink)]">
            {money(job.proposalTotal)}
          </span>
        </div>
      )}
    </motion.div>
  );
}
