"use client";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import type { TabKey } from "./types";

// Masthead headline. A two-row newspaper "dateline + figure" composition.
// The big number is the dopamine metric — count + secondary readout sit to
// its right, never above. The eyebrow is contextual to the active tab.
// Reduce-motion users see the figure pop without the cross-fade.

interface RevenueMastheadProps {
  tab: TabKey;
  primaryAmount: number;
  primaryLabel: string;
  count: number;
  countLabel: string;
  secondary?: Array<{ label: string; value: string | number; tone?: "ink" | "accent" | "muted" }>;
  trailing?: React.ReactNode;
}

export function RevenueMasthead({
  tab,
  primaryAmount,
  primaryLabel,
  count,
  countLabel,
  secondary,
  trailing,
}: RevenueMastheadProps) {
  return (
    <section className="relative pt-8 pb-7">
      <div className="flex items-start justify-between gap-12 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-3">
            {primaryLabel && (
              <>
                <span className="quiet-caps !mb-0 text-[color:var(--accent-ink)]">
                  {primaryLabel}
                </span>
                <span aria-hidden className="h-px w-10 bg-[color:var(--ink-line)]" />
              </>
            )}
            <span className="quiet-caps !mb-0 text-[color:var(--ink-faint)]">
              {countLabel}
              <span className="tabular ml-2 text-[color:var(--ink-soft)]">{count}</span>
            </span>
          </div>

          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={tab + ":" + primaryAmount}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="font-display tabular text-[clamp(48px,7vw,84px)] font-semibold leading-[0.95] tracking-[-0.035em] text-[color:var(--ink)]"
            >
              {money(primaryAmount)}
            </motion.div>
          </AnimatePresence>

          {secondary && secondary.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-x-7 gap-y-2">
              {secondary.map((s, i) => (
                <div key={i} className="flex items-baseline gap-2">
                  <span className="quiet-caps !mb-0 text-[color:var(--ink-faint)]">
                    {s.label}
                  </span>
                  <span
                    className={cn(
                      "tabular text-[14px] font-medium",
                      s.tone === "accent" && "text-[color:var(--accent-ink)]",
                      s.tone === "muted" && "text-[color:var(--ink-muted)]",
                      (!s.tone || s.tone === "ink") && "text-[color:var(--ink)]",
                    )}
                  >
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {trailing && <div className="flex items-center gap-2 shrink-0">{trailing}</div>}
      </div>

      <div className="divider-ink mt-7" />
    </section>
  );
}
