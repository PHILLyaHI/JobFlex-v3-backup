"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import type { TabKey } from "./types";

// Medium-sized segmented tab strip with a sliding 2px Pressed Sage
// underline. The strip itself sits on a hairline baseline so the indicator
// reads as a printer's rule, not a chunky button block. Width is content-led:
// each tab is sized to its label, no stretching.
interface SegmentedTabsProps {
  active: TabKey;
  counts: Record<TabKey, number>;
  onChange: (next: TabKey) => void;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "accepted", label: "Accepted" },
  { key: "completed", label: "Completed" },
];

export function SegmentedTabs({ active, counts, onChange }: SegmentedTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Proposals view"
      className="relative flex items-end gap-8 border-b border-[color:var(--ink-line)]"
    >
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              "group relative -mb-px flex items-end gap-2 pb-3 pt-1 px-0.5 focus-ring rounded-[var(--r-xs)]",
              "transition-colors duration-200",
              isActive
                ? "text-[color:var(--ink)]"
                : "text-[color:var(--ink-muted)] hover:text-[color:var(--ink-soft)]",
            )}
          >
            <span className="flex items-baseline gap-2">
              <span className="font-display text-[18px] font-semibold tracking-[-0.015em]">
                {t.label}
              </span>
              <span
                className={cn(
                  "tabular text-[12px] transition-colors",
                  isActive
                    ? "text-[color:var(--ink-soft)]"
                    : "text-[color:var(--ink-faint)]",
                )}
              >
                {counts[t.key].toString().padStart(2, "0")}
              </span>
            </span>

            {isActive && (
              <motion.span
                layoutId="proposals-c-tab-indicator"
                aria-hidden
                transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.7 }}
                className="absolute -bottom-px left-0 right-0 h-[2px] bg-[color:var(--accent)]"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
