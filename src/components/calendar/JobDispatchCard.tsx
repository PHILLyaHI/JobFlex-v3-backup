"use client";
import * as React from "react";
import { motion, type PanInfo } from "framer-motion";
import { Badge } from "@/components/ui/Badge";
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
  className?: string;
}

export function JobDispatchCard({ job, onDragEnd, className }: Props) {
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
        zIndex: 30,
        boxShadow: "0 24px 48px -16px rgba(17,17,19,0.32)",
      }}
      onDragEnd={(_, info) => onDragEnd(info)}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      style={{
        borderLeftColor: statusAccent(job.status),
        touchAction: "none",
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
