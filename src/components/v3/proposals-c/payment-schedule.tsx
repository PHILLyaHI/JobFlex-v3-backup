"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { Check, Bell, CircleDollarSign, Undo2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import type { InstallmentLine } from "./types";

// Payment lines laid out on the same flat, full-bleed divide-x grid as the
// Completed tear-sheet's dateline triplet: each cell is a quiet-caps label, a
// large font-display tabular amount, and a small sub-line. A paid cell takes an
// emerald tint + struck amount; line-level actions (Mark paid / Send reminder /
// Undo) fade in at the cell's bottom edge on hover. A thin progress meter sits
// below. Paid state is REAL: Installment.status from the server, frozen at
// the dollars that landed.

interface PaymentScheduleProps {
  installments: InstallmentLine[];
  total: number;
  onMarkPaid: (line: InstallmentLine) => void;
  onUnmark: (line: InstallmentLine) => void;
  onSendReminder: (lineId: string) => void;
  // Read-only rendering for filed (Completed) records: no hover actions, the
  // strip is a settled receipt rather than a workbench.
  readOnly?: boolean;
}

function viaLabel(v: string | null): string {
  if (v === "STRIPE") return "via Stripe";
  if (v === "SQUARE") return "via Square";
  if (v === "MANUAL") return "recorded";
  return "";
}

export function PaymentSchedule({
  installments,
  total,
  onMarkPaid,
  onUnmark,
  onSendReminder,
  readOnly = false,
}: PaymentScheduleProps) {
  // Paid lines are frozen at what landed; open lines compute against total.
  const resolved = installments.map((l) => ({
    ...l,
    isPaid: l.status === "PAID",
    isWaived: l.status === "WAIVED",
    isPending: l.status === "PENDING",
    dollars:
      l.status === "PAID" && l.paidAmount != null
        ? l.paidAmount
        : l.isPercent
          ? Math.round(total * (l.amount / 100))
          : l.amount,
  }));
  const scheduledTotal = resolved.reduce((a, l) => a + l.dollars, 0);
  const paidTotal = resolved.filter((l) => l.isPaid).reduce((a, l) => a + l.dollars, 0);
  const paidPct = total > 0 ? Math.min(100, (paidTotal / total) * 100) : 0;

  if (resolved.length === 0) {
    return (
      <div className="px-6 py-5">
        <div className="rounded-[var(--r-md)] border border-dashed border-[color:var(--ink-line)] px-4 py-4">
          <div className="flex items-center gap-2 text-[12px] text-[color:var(--ink-muted)]">
            <CircleDollarSign className="h-3.5 w-3.5 text-[color:var(--ink-faint)]" />
            <span>No installments on this proposal — the full amount is one stage.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        className="grid divide-x divide-[color:var(--ink-line)]"
        style={{ gridTemplateColumns: `repeat(${resolved.length}, minmax(0, 1fr))` }}
      >
        {resolved.map((line) => {
          const settled = line.isPaid || line.isWaived;
          return (
            <div
              key={line.id}
              className={cn(
                "group relative px-6 pt-3 pb-9 transition-colors",
                line.isPaid && "bg-emerald-50/50",
                line.isWaived && "bg-black/[0.02]",
              )}
            >
              <div className="quiet-caps text-[color:var(--ink-faint)] mb-1.5 flex items-center justify-between gap-2">
                <span className="truncate" title={line.label}>
                  {line.label}
                </span>
                {line.isPaid && (
                  <span className="h-4 w-4 rounded-full bg-emerald-600 grid place-items-center shrink-0">
                    <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                  </span>
                )}
              </div>

              <div
                className={cn(
                  "font-display tabular text-[18px] font-semibold leading-tight tracking-[-0.012em]",
                  line.isPaid ? "text-emerald-900" : line.isWaived ? "text-[color:var(--ink-faint)] line-through" : "text-[color:var(--ink)]",
                )}
              >
                {money(line.dollars)}
              </div>
              <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">
                {line.isPaid
                  ? `Paid ${viaLabel(line.paidVia)}`.trim()
                  : line.isWaived
                    ? "Closed"
                    : line.isPending
                      ? "Client is paying…"
                      : line.isPercent
                        ? `${line.amount}% of total`
                        : "Due"}
              </div>

              {!readOnly && !line.isWaived && (
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 px-3 pb-2.5 pt-4 bg-gradient-to-t from-white via-white to-transparent opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  {!settled && (
                    <button
                      type="button"
                      onClick={() => onMarkPaid(line)}
                      className="h-6 px-2 rounded-[var(--r-sm)] text-[10.5px] font-medium bg-white hairline shadow-[0_4px_16px_-8px_rgba(17,17,19,0.20)] hover:bg-[color:var(--paper)] focus-ring text-emerald-800"
                    >
                      Mark paid
                    </button>
                  )}
                  {line.isPaid && line.paidVia === "MANUAL" && (
                    <button
                      type="button"
                      onClick={() => onUnmark(line)}
                      className="h-6 px-2 rounded-[var(--r-sm)] text-[10.5px] font-medium bg-white hairline shadow-[0_4px_16px_-8px_rgba(17,17,19,0.20)] hover:bg-[color:var(--paper)] focus-ring text-[color:var(--ink-muted)] inline-flex items-center gap-1"
                    >
                      <Undo2 className="h-3 w-3" />
                      Undo
                    </button>
                  )}
                  {!settled && (
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
