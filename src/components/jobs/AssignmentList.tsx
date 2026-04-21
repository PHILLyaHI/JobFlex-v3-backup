"use client";
import * as React from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { X } from "lucide-react";

export interface AssignmentRow {
  id: string;
  workerId: string;
  workerName: string;
  workerEmail?: string | null;
  status: string;
  assignedAt: string | Date;
}

interface AssignmentListProps {
  rows: AssignmentRow[];
  onRemove?: (assignmentId: string) => Promise<void> | void;
  emptyLabel?: string;
}

const tone = (s: string) =>
  s === "ACCEPTED"
    ? "success"
    : s === "DECLINED"
      ? "danger"
      : s === "COMPLETED"
        ? "neutral"
        : "accent";

export function AssignmentList({
  rows,
  onRemove,
  emptyLabel = "No crew assigned yet.",
}: AssignmentListProps) {
  if (rows.length === 0) {
    return <div className="text-[12px] text-[color:var(--ink-muted)] py-4">{emptyLabel}</div>;
  }
  return (
    <ul className="divide-y divide-[color:var(--ink-line)]">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center gap-3 py-3">
          <Avatar name={r.workerName} size={32} />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">
              {r.workerName}
            </div>
            {r.workerEmail && (
              <div className="text-[11px] text-[color:var(--ink-muted)] truncate">
                {r.workerEmail}
              </div>
            )}
          </div>
          <Badge tone={tone(r.status) as any}>{r.status.toLowerCase().replace("_", " ")}</Badge>
          {onRemove && (
            <button
              onClick={() => onRemove(r.id)}
              className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-rose-50 hover:text-rose-700"
              aria-label="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
