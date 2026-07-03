"use client";

import { useState } from "react";
import { Mail, FileText, Eye, Check, CircleDashed, ChevronDown } from "lucide-react";
import { relative } from "@/lib/format";
import { cn } from "@/lib/cn";

const iconMap: Record<string, React.ReactNode> = {
  SENT: <Mail className="h-3.5 w-3.5" />,
  VIEWED: <Eye className="h-3.5 w-3.5" />,
  ACCEPTED: <Check className="h-3.5 w-3.5" />,
  CREATED: <FileText className="h-3.5 w-3.5" />,
  NOTE: <CircleDashed className="h-3.5 w-3.5" />,
};

const INITIAL_VISIBLE = 5;

type ActivityItem = { id: string; kind: string; summary: string; createdAt: Date };

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) {
    return <div className="text-[12px] text-[color:var(--ink-muted)]">No activity yet.</div>;
  }

  const visible = expanded ? items : items.slice(0, INITIAL_VISIBLE);
  const hidden = items.length - INITIAL_VISIBLE;

  return (
    <div>
      <ol>
        {visible.map((it, i) => {
          const isLast = i === visible.length - 1;
          const accent = it.kind === "ACCEPTED";
          return (
            <li key={it.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    accent
                      ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]"
                      : "bg-black/[0.04] text-[color:var(--ink-muted)]",
                  )}
                >
                  {iconMap[it.kind] ?? iconMap.NOTE}
                </span>
                {!isLast && <span className="mt-1 w-px flex-1 bg-[color:var(--ink-line)]" />}
              </div>
              <div className={cn("min-w-0 flex-1", isLast ? "pb-0.5" : "pb-4")}>
                <p className="text-[13px] leading-snug text-[color:var(--ink-soft)]">{it.summary}</p>
                <div className="mt-1 text-[11px] text-[color:var(--ink-faint)]">
                  {titleCase(it.kind)}
                  <span className="mx-1.5 text-[color:var(--ink-line)]">·</span>
                  <span className="tabular">{relative(it.createdAt)}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 flex w-full items-center justify-center gap-1.5 border-t border-[color:var(--ink-line)] pt-3 text-[12px] text-[color:var(--ink-muted)] transition-colors hover:text-[color:var(--ink)] motion-reduce:transition-none"
        >
          {expanded ? "Show less" : `Show ${hidden} more`}
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform motion-reduce:transition-none", expanded && "rotate-180")}
          />
        </button>
      )}
    </div>
  );
}

function titleCase(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
