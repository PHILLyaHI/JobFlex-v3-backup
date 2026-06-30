"use client";
import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";
import { TABS, type TabKey } from "./trade-data";

interface TradeTabsProps {
  active: TabKey;
  counts: Record<TabKey, number>;
  onChange: (next: TabKey) => void;
}

export function TradeTabs({ active, counts, onChange }: TradeTabsProps) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="relative">
    <div
      role="tablist"
      aria-label="Trade & Services views"
      className="flex items-stretch gap-5 overflow-x-auto border-b border-[color:var(--ink-line)] px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {TABS.map((t) => {
        const isActive = t.key === active;
        const count = counts[t.key];
        return (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(t.key)}
            className={cn(
              "group relative -mb-px flex min-h-[44px] shrink-0 items-center gap-1.5 pb-3 pt-2 focus-ring rounded-[var(--r-xs)]",
              "transition-colors duration-200",
              isActive
                ? "text-[color:var(--ink)]"
                : "text-[color:var(--ink-muted)] hover:text-[color:var(--ink-soft)]",
            )}
          >
            <span className="text-[14px] font-medium tracking-[-0.01em] whitespace-nowrap">
              {t.label}
            </span>
            {count > 0 && (
              <span
                className={cn(
                  "tabular rounded-full px-1.5 text-[11px] leading-[18px] transition-colors",
                  isActive
                    ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]"
                    : "bg-black/[0.05] text-[color:var(--ink-muted)]",
                )}
              >
                {count}
              </span>
            )}
            {isActive && (
              <motion.span
                layoutId="trade-tab-indicator"
                aria-hidden
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 420, damping: 38, mass: 0.7 }
                }
                className="absolute -bottom-px left-0 right-0 h-[2px] bg-[color:var(--accent)]"
              />
            )}
          </button>
        );
      })}
    </div>
      {/* Right edge fade signals the strip scrolls when tabs overflow. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[var(--paper)] to-transparent"
      />
    </div>
  );
}
