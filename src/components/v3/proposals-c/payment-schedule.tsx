"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { Check, Bell, CircleDollarSign } from "lucide-react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import type { InstallmentLine } from "./types";

// A horizontal "ledger strip" of payment lines. Each segment shows a label,
// an amount, and (on hover) line-level actions: Mark paid + Send reminder.
// A paid segment crosses with an emerald tick. Below the strip sits a thin
// progress meter showing paid amount vs total. Per-line paid state is held
// locally — server-side schema only tracks proposal-level `paidAt`, so when
// the user marks the final unpaid line, the optional `onAllPaid` callback
// can flip the whole proposal to PAID.

interface PaymentScheduleProps {
  installments: InstallmentLine[];
  total: number;
  paidLineIds: Set<string>;
  onTogglePaid: (lineId: string) => void;
  onSendReminder: (lineId: string) => void;
}

export function PaymentSchedule({
  installments,
  total,
  paidLineIds,
  onTogglePaid,
  onSendReminder,
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
      <div className="rounded-[var(--r-md)] border border-dashed border-[color:var(--ink-line)] px-4 py-4">
        <div className="flex items-center gap-2 text-[12px] text-[color:var(--ink-muted)]">
          <CircleDollarSign className="h-3.5 w-3.5 text-[color:var(--ink-faint)]" />
          <span>No payment schedule on this proposal. Add installments in the editor.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="quiet-caps text-[color:var(--ink-faint)]">Payment schedule</span>
        <div className="flex items-baseline gap-2">
          <span className="tabular text-[12px] text-[color:var(--ink-muted)]">
            {money(paidTotal)} <span className="text-[color:var(--ink-faint)]">/ {money(scheduledTotal)}</span>
          </span>
          <span className="tabular text-[10.5px] text-[color:var(--ink-faint)]">
            {Math.round(paidPct)}%
          </span>
        </div>
      </div>

      <div className="grid gap-px overflow-hidden rounded-[var(--r-md)] hairline bg-[color:var(--ink-line)]"
           style={{ gridTemplateColumns: `repeat(${resolved.length}, minmax(0, 1fr))` }}>
        {resolved.map((line) => {
          const isPaid = paidLineIds.has(line.id);
          return (
            <div
              key={line.id}
              className={cn(
                "group relative bg-white px-3.5 py-3 flex flex-col gap-1.5",
                "transition-colors",
                isPaid && "bg-emerald-50/60",
              )}
            >
              <div className="flex items-center justify-between gap-2 min-h-[18px]">
                <span
                  className={cn(
                    "text-[11px] font-medium tracking-[-0.005em] truncate",
                    isPaid ? "text-emerald-800" : "text-[color:var(--ink-soft)]",
                  )}
                  title={line.label}
                >
                  {line.label}
                </span>
                {isPaid && (
                  <span className="h-4 w-4 rounded-full bg-emerald-600 grid place-items-center shrink-0">
                    <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                  </span>
                )}
              </div>

              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={cn(
                    "font-display tabular text-[16px] font-semibold tracking-[-0.015em]",
                    isPaid
                      ? "text-emerald-900 line-through decoration-emerald-700/40"
                      : "text-[color:var(--ink)]",
                  )}
                >
                  {money(line.dollars)}
                </span>
                {line.isPercent && (
                  <span className="tabular text-[10px] text-[color:var(--ink-faint)]">
                    {line.amount}%
                  </span>
                )}
              </div>

              {/* Hover actions */}
              <div
                className={cn(
                  "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
                  "absolute inset-x-0 -bottom-px translate-y-full pt-1.5 px-1 z-10",
                )}
              >
                <button
                  type="button"
                  onClick={() => onTogglePaid(line.id)}
                  className={cn(
                    "h-6 px-2 rounded-[var(--r-sm)] text-[10.5px] font-medium",
                    "bg-white hairline shadow-[0_4px_16px_-8px_rgba(17,17,19,0.20)]",
                    "hover:bg-[color:var(--paper)] focus-ring",
                    isPaid ? "text-[color:var(--ink-muted)]" : "text-emerald-800",
                  )}
                >
                  {isPaid ? "Mark unpaid" : "Mark paid"}
                </button>
                {!isPaid && (
                  <button
                    type="button"
                    onClick={() => onSendReminder(line.id)}
                    className={cn(
                      "h-6 px-2 rounded-[var(--r-sm)] text-[10.5px] font-medium",
                      "bg-white hairline shadow-[0_4px_16px_-8px_rgba(17,17,19,0.20)]",
                      "hover:bg-[color:var(--paper)] focus-ring text-[color:var(--ink-soft)]",
                      "inline-flex items-center gap-1",
                    )}
                  >
                    <Bell className="h-3 w-3" />
                    Remind
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress meter */}
      <div className="h-[3px] w-full overflow-hidden rounded-full bg-[color:var(--ink-line)]/60">
        <motion.div
          className="h-full bg-emerald-600"
          initial={false}
          animate={{ width: `${paidPct}%` }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}
