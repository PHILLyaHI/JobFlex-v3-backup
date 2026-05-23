"use client";
import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronUp, Receipt } from "lucide-react";
import { cn } from "@/lib/cn";
import { useProposalDraftStore } from "@/stores/useProposalDraftStore";
import { money } from "@/lib/format";

// Compact running-total card pinned to the corner. Expands for the subtotal /
// tax breakdown. Auto-hidden by the editor once the full preview totals scroll
// into view — no point repeating them.
export function FloatingCostsCard({ hidden }: { hidden: boolean }) {
  const { subtotal, tax, total } = useProposalDraftStore((s) => s.computed)();
  const taxRate = useProposalDraftStore((s) => s.draft.taxRate);
  const [expanded, setExpanded] = React.useState(false);
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {!hidden && (
        <motion.div
          initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
          transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-5 right-5 z-40 w-[244px] overflow-hidden rounded-[var(--r-lg)] border border-[color:var(--ink-line)] bg-white shadow-[0_20px_48px_-24px_rgba(17,17,19,0.35)]"
        >
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  duration: reduceMotion ? 0 : 0.22,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="overflow-hidden"
              >
                <div className="space-y-1.5 px-4 pb-3 pt-3.5 text-[12.5px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[color:var(--ink-muted)]">
                      Subtotal
                    </span>
                    <span className="tabular text-[color:var(--ink)]">
                      {money(subtotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[color:var(--ink-muted)]">
                      Tax{taxRate > 0 ? ` · ${(taxRate * 100).toFixed(1)}%` : ""}
                    </span>
                    <span className="tabular text-[color:var(--ink)]">
                      {money(tax)}
                    </span>
                  </div>
                </div>
                <div className="mx-4 h-px bg-[color:var(--ink-line)]" />
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={() => setExpanded((x) => !x)}
            aria-expanded={expanded}
            aria-label={
              expanded ? "Collapse cost summary" : "Expand cost summary"
            }
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-black/[0.02] focus-ring"
          >
            <Receipt className="h-4 w-4 shrink-0 text-[color:var(--ink-faint)]" />
            <span className="min-w-0 flex-1">
              <span className="quiet-caps block">Proposal total</span>
              <span className="block font-display text-[19px] leading-tight tabular tracking-[-0.015em] text-[color:var(--ink)]">
                {money(total)}
              </span>
            </span>
            <ChevronUp
              className={cn(
                "h-4 w-4 shrink-0 text-[color:var(--ink-muted)] transition-transform duration-200",
                !expanded && "rotate-180",
              )}
            />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
