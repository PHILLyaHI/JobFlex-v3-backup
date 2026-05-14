"use client";
import * as React from "react";
import { relative } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface ActivityRow {
  id: string;
  kind: string;
  summary: string;
  createdAt: Date;
}

interface WhatHappenedFeedProps {
  activities: ActivityRow[];
}

type DotTone = "success" | "danger" | "neutral";

function dotToneFor(kind: string): DotTone {
  const k = kind.toLowerCase();
  if (
    k.includes("accepted") ||
    k.includes("paid") ||
    k.includes("payment") ||
    k.includes("completed") ||
    k.includes("won")
  ) {
    return "success";
  }
  if (k.includes("declined") || k.includes("expired") || k.includes("failed") || k.includes("cancelled")) {
    return "danger";
  }
  return "neutral";
}

const DOT_CLASS: Record<DotTone, string> = {
  success: "bg-[color:var(--emerald)]",
  danger: "bg-[color:var(--rose)]",
  neutral: "bg-[color:var(--ink-faint)]",
};

export function WhatHappenedFeed({ activities }: WhatHappenedFeedProps) {
  if (activities.length === 0) return null;

  return (
    <section className="px-5">
      <div className="quiet-caps mb-2.5">What happened</div>
      <ul className="divide-y divide-[color:var(--ink-line)]">
        {activities.map((a) => {
          const tone = dotToneFor(a.kind);
          return (
            <li key={a.id} className="flex items-start gap-3 py-3">
              <div className="shrink-0 w-12 pt-1">
                <span className="tabular text-[11px] text-[color:var(--ink-muted)]">
                  {relative(a.createdAt)}
                </span>
              </div>
              <span
                aria-hidden="true"
                className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", DOT_CLASS[tone])}
              />
              <p className="flex-1 min-w-0 text-[13px] text-[color:var(--ink-soft)] leading-snug">
                {a.summary}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
