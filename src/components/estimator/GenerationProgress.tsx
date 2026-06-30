"use client";
import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export interface ProgressStep {
  key: string;
  label: string;
  /** Sub-detail shown under the active step. */
  detail?: string;
  /**
   * How long this step stays active before auto-advancing, in ms. Graduated to
   * the real pipeline cost (live price search is the slow part) so the dots
   * don't all rush past in equal beats. The final step has no dwell — it holds
   * until the actual result lands.
   */
  dwellMs?: number;
}

// The phases mirror the real backend pipeline (plan → price → assemble) so the
// stepper reads honestly even though the server call is a single round trip.
export const ESTIMATE_STEPS: ProgressStep[] = [
  { key: "read", label: "Reading the job", detail: "Parsing scope, size, and conditions", dwellMs: 1400 },
  { key: "plan", label: "Engineering the scope of work", detail: "Listing the bill of materials", dwellMs: 2800 },
  { key: "price", label: "Pricing live products", detail: "Searching real retail prices", dwellMs: 5600 },
  { key: "assemble", label: "Assembling the estimate", detail: "Waste factors, packaging, labor" },
];

/**
 * Generation progress — a vertical stepper with a sage progress bar. `activeIndex`
 * advances on a realistic cadence while the estimate generates; `done` lights
 * every step. Memorable anchor: each step's status dot animates (spinner while
 * active, sage check when complete) and the active step reveals its sub-detail.
 */
export function GenerationProgress({
  steps,
  activeIndex,
  done,
}: {
  steps: ProgressStep[];
  activeIndex: number;
  done: boolean;
}) {
  const reduce = useReducedMotion();
  const total = steps.length;
  const completed = done ? total : Math.min(activeIndex, total);
  const pct = Math.round((completed / total) * 100);

  // One concise spoken update per change. Announcing the whole <ol> via
  // aria-live re-reads all four lines on every tick; a screen reader only needs
  // the step it just reached.
  const announcement = done
    ? "Estimate ready."
    : `Step ${Math.min(activeIndex + 1, total)} of ${total}: ${steps[Math.min(activeIndex, total - 1)]?.label ?? ""}`;

  return (
    <div className="paper-card shadow-pop p-6 max-w-xl mx-auto">
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <div className="quiet-caps">Smart Proposal</div>
          <div className="font-display text-[19px] tracking-[-0.015em] text-[color:var(--ink)]">
            {done ? "Estimate ready" : "Building your estimate…"}
          </div>
        </div>
        <div className="font-display tabular text-[26px] leading-none text-[color:var(--accent)]">
          {pct}%
        </div>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--ink-line)] mb-6">
        <motion.div
          className="h-full w-full origin-left rounded-full bg-[color:var(--accent)]"
          initial={false}
          animate={{ scaleX: pct / 100 }}
          transition={{ ease: [0.22, 1, 0.36, 1], duration: reduce ? 0 : 0.55 }}
        />
      </div>

      {/* Spoken status, kept out of the visual tree. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <ol className="space-y-3.5" aria-hidden>
        {steps.map((s, i) => {
          const status = done || i < activeIndex ? "done" : i === activeIndex ? "active" : "pending";
          return (
            <li key={s.key} className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors duration-300",
                  status === "done"
                    ? "bg-[color:var(--accent)] text-white"
                    : status === "active"
                      ? "bg-[color:var(--accent-soft)] text-[color:var(--accent)] ring-2 ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                      : "bg-[color:var(--ink-line)] text-[color:var(--ink-faint)]",
                )}
              >
                {status === "done" ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                ) : status === "active" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>
              <div className="min-w-0 pt-0.5">
                <div
                  className={cn(
                    "text-[13.5px] transition-colors",
                    status === "pending"
                      ? "text-[color:var(--ink-faint)]"
                      : status === "active"
                        ? "font-medium text-[color:var(--ink)]"
                        : "text-[color:var(--ink-soft)]",
                  )}
                >
                  {s.label}
                </div>
                <AnimatePresence initial={false}>
                  {status === "active" && s.detail && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22 }}
                      className="overflow-hidden text-[11.5px] text-[color:var(--ink-muted)]"
                    >
                      {s.detail}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
