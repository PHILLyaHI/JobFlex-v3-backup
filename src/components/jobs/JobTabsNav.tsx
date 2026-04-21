"use client";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

interface Tab {
  key: string;
  label: string;
  count?: number;
}

interface JobTabsNavProps {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
}

export function JobTabsNav({ tabs, active, onChange }: JobTabsNavProps) {
  return (
    <div className="relative border-b border-[color:var(--ink-line)] mb-6">
      <div className="flex items-center gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              className={cn(
                "relative px-4 h-11 text-[13px] font-medium transition-colors whitespace-nowrap",
                isActive
                  ? "text-[color:var(--ink)]"
                  : "text-[color:var(--ink-muted)] hover:text-[color:var(--ink-soft)]",
              )}
            >
              <span className="inline-flex items-center gap-2">
                {t.label}
                {typeof t.count === "number" && (
                  <span
                    className={cn(
                      "inline-flex items-center justify-center rounded-full px-1.5 h-[18px] min-w-[18px] text-[10px] tabular",
                      isActive
                        ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
                        : "bg-black/[0.05] text-[color:var(--ink-muted)]",
                    )}
                  >
                    {t.count}
                  </span>
                )}
              </span>
              {isActive && (
                <motion.span
                  layoutId="job-tabs-underline"
                  className="absolute left-2 right-2 -bottom-px h-[2px] bg-[color:var(--ink)]"
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
