"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { Check, Bell, CircleDollarSign } from "lucide-react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import type { InstallmentLine } from "./types";

// Payment lines laid out on the same flat, full-bleed divide-x grid as the
// Completed tear-sheet's dateline triplet: each cell is a quiet-caps label, a
// large font-display tabular amount, and a small sub-line. A paid cell takes an
// emerald tint + struck amount; line-level actions (Mark paid / Send reminder)
// fade in at the cell's bottom edge on hover. A thin progress meter sits below.
// Per-line paid state is held by the parent (server schema tracks only
// proposal-level paidAt).

interface PaymentScheduleProps {
  installments: InstallmentLine[];
  total: number;
  paidLineIds: Set<string>;
  onTogglePaid: (lineId: string) => void;
  onSendReminder: (lineId: string) => void;
  // Read-only rendering for filed (Completed) records: no hover actions, the
  // strip is a settled receipt rather than a workbench.
  readOnly?: boolean;
}

export function PaymentSchedule({
  installments,
  total,
  paidLineIds,
  onTogglePaid,
  onSendReminder,
  readOnly = false,
}: PaymentScheduleProps) {
  // Resolve dollar amounts (percent installments compute against total).
  const resolved = installments.map((l) => ({
    ...l,
    dollars: l.isPercent ? Math.round(total * (l.amount / 100)) : l.amount,
  }));
  const scheduledTotal = resolved.reduce((a, l) => a + l.dollars, 0);
  const paidTotal = resolved
    .filter((l) => paidLineIds.has(l.id))
    .reduce((a, l) => a + l.dollars, 0);
  const paidPct = scheduledTotal > 0 ? Math.min(100, (paidTotal / scheduledTotal) * 100) : 0;

  if (resolved.length === 0) {
    return (
      <div className="px-6 py-5">
        <div className="rounded-[var(--r-md)] border border-dashed border-[color:var(--ink-line)] px-4 py-4">
          <div className="flex items-center gap-2 text-[12px] text-[color:var(--ink-muted)]">
            <CircleDollarSign className="h-3.5 w-3.5 text-[color:var(--ink-faint)]" />
            <span>No installments on this proposal. Add them in the editor.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Ledger grid — flat, full-bleed, divide-x, matching the Completed dateline */}
      <div
        className="grid divide-x divide-[color:var(--ink-line)]"
        style={{ gridTemplateColumns: `repeat(${resolved.length}, minmax(0, 1fr))` }}
      >
        {resolved.map((line) => {
          const isPaid = paidLineIds.has(line.id);
          return (
            <div
              key={line.id}
              className={cn(
                // pb reserves a bottom band for the hover action row so its
                // buttons never overlap the amount above (the "line over the
                // number" bug). pt stays tight.
                "group relative px-6 pt-3 pb-9 transition-colors",
                isPaid && "bg-emerald-50/50",
              )}
            >
              <div className="quiet-caps text-[color:var(--ink-faint)] mb-1.5 flex items-center justify-between gap-2">
                <span className="truncate" title={line.label}>
                  {line.label}
                </span>
                {isPaid && (
                  <span className="h-4 w-4 rounded-full bg-emerald-600 grid place-items-center shrink-0">
                    <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                  </span>
                )}
              </div>

              <div
                className={cn(
                  "font-display tabular text-[18px] font-semibold leading-tight tracking-[-0.012em]",
                  isPaid
                    ? "text-emerald-900 line-through decoration-emerald-700/40"
                    : "text-[color:var(--ink)]",
                )}
              >
                {money(line.dollars)}
              </div>
              <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">
                {isPaid ? "Paid" : line.isPercent ? `${line.amount}% of total` : "Due"}
              </div>

              {/* Hover actions — fade in pinned to the cell's bottom edge */}
              {!readOnly && (
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 px-3 pb-2.5 pt-4 bg-gradient-to-t from-white via-white to-transparent opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onTogglePaid(line.id)}
                  className={cn(
                    "h-6 px-2 rounded-[var(--r-sm)] text-[10.5px] font-medium bg-white hairline shadow-[0_4px_16px_-8px_rgba(17,17,19,0.20)] hover:bg-[color:var(--paper)] focus-ring",
                    isPaid ? "text-[color:var(--ink-muted)]" : "text-emerald-800",
                  )}
                >
                  {isPaid ? "Mark unpaid" : "Mark paid"}
                </button>
                {!isPaid && (
                  <button
                    type="button"
                    onClick={() => onSendReminder(line.id)}
                    className="h-6 px-2 rounded-[var(--r-sm)] text-[10.5px] font-medium bg-white hairline shadow-[0_4px_16px_-8px_rgba(17,17,19,0.20)] hover:bg-[color:var(--paper)] focus-ring text-[color:var(--ink-soft)] inline-flex items-center gap-1"
                  >
                    <Bell className="h-3 w-3" />
                    Remind
                  </button>
                )}
              </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress meter — only when there's a real total to fill. Hugs the
          figures above as a snug baseline fill-rule rather than floating in a
          padded void (which read as dead space at 0% paid). */}
      {scheduledTotal > 0 && (
        <div className="px-6 pt-1 pb-2">
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-[color:var(--ink-line)]/60">
            <motion.div
              className="h-full bg-emerald-600"
              initial={false}
              animate={{ width: `${paidPct}%` }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
