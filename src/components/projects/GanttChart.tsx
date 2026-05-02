"use client";
import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { statusAccent } from "@/components/jobs/JobStatusBadge";
import { shortDate } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface GanttJob {
  id: string;
  title: string;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
}

interface Props {
  jobs: GanttJob[];
  windowStart?: Date;
  windowEnd?: Date;
}

const DAY = 24 * 60 * 60 * 1000;

export function GanttChart({ jobs, windowStart, windowEnd }: Props) {
  const valid = jobs.filter((j) => j.startsAt && j.endsAt) as Array<
    GanttJob & { startsAt: Date; endsAt: Date }
  >;

  if (valid.length === 0) {
    return (
      <div className="paper-card p-10 text-center">
        <div className="font-medium text-[color:var(--ink)]">No scheduled jobs</div>
        <div className="text-[12px] text-[color:var(--ink-muted)] mt-1.5 leading-relaxed max-w-sm mx-auto">
          Add start and end dates to the project's jobs to render the timeline.
        </div>
      </div>
    );
  }

  const start =
    windowStart ?? new Date(Math.min(...valid.map((j) => j.startsAt.getTime())));
  const end = windowEnd ?? new Date(Math.max(...valid.map((j) => j.endsAt.getTime())));
  const span = Math.max(DAY, end.getTime() - start.getTime());
  const ticks = makeTicks(start, end);

  return (
    <div className="paper-card p-5 overflow-x-auto">
      <div className="min-w-[720px]">
        {/* Header — month ticks */}
        <div
          className="grid items-end relative h-9 border-b border-[color:var(--ink-line)] mb-3"
          style={{ gridTemplateColumns: "200px 1fr" }}
        >
          <div className="quiet-caps">Job</div>
          <div className="relative h-full">
            {ticks.map((t, i) => {
              const left = ((t.getTime() - start.getTime()) / span) * 100;
              return (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 flex flex-col justify-end pb-1.5"
                  style={{ left: `${left}%` }}
                >
                  <span className="absolute top-0 bottom-0 w-px bg-[color:var(--ink-line)]" />
                  <span className="text-[10px] tabular text-[color:var(--ink-muted)] tracking-[0.10em] uppercase pl-1.5">
                    {t.toLocaleDateString("en-US", { month: "short" })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rows */}
        <div className="space-y-1.5">
          {valid.map((j, i) => {
            const left =
              ((j.startsAt.getTime() - start.getTime()) / span) * 100;
            const width =
              ((j.endsAt.getTime() - j.startsAt.getTime()) / span) * 100;
            const accent = statusAccent(j.status);
            const colorVar =
              accent === "var(--accent)" ? "rgba(79,70,229,1)" : accent;
            return (
              <div
                key={j.id}
                className="grid items-center"
                style={{ gridTemplateColumns: "200px 1fr" }}
              >
                <Link
                  href={`/dashboard/jobs/${j.id}` as any}
                  className="text-[12.5px] font-medium text-[color:var(--ink)] hover:text-[color:var(--accent)] truncate pr-3"
                >
                  {j.title}
                </Link>
                <div className="relative h-7">
                  <motion.div
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    transition={{
                      duration: 0.45,
                      ease: [0.22, 1, 0.36, 1],
                      delay: 0.04 * i,
                    }}
                    style={{
                      left: `${left}%`,
                      width: `${Math.max(2, width)}%`,
                      transformOrigin: "left center",
                      borderLeftColor: colorVar,
                    }}
                    className={cn(
                      "absolute top-1 bottom-1 rounded-[var(--r-sm)] border-l-[3px] hairline",
                      "bg-white/70 dark:bg-white/[0.05] flex items-center px-2 text-[10.5px] truncate",
                      "shadow-[0_2px_8px_-4px_rgba(17,17,19,0.18)]",
                    )}
                    title={`${j.title} · ${shortDate(j.startsAt)} → ${shortDate(j.endsAt)}`}
                  >
                    <span className="truncate text-[color:var(--ink-soft)] tabular">
                      {shortDate(j.startsAt)} → {shortDate(j.endsAt)}
                    </span>
                  </motion.div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function makeTicks(start: Date, end: Date): Date[] {
  const ticks: Date[] = [];
  const d = new Date(start.getFullYear(), start.getMonth(), 1);
  while (d <= end) {
    ticks.push(new Date(d));
    d.setMonth(d.getMonth() + 1);
  }
  return ticks;
}
