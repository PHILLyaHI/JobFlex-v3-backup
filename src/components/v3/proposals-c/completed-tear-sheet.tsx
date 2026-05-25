"use client";
import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ImagePlus,
  Send,
  Camera,
  Check,
  Circle,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { money, longDate } from "@/lib/format";
import type { ProposalCRow } from "./types";

// Tear-sheet view of completed jobs. Each card is a "filed" record:
// completed date masthead, three dateline columns (deposit / start / done),
// a tiny schedule-status list (done / not done from the installments),
// before-and-after photo placeholders, and a receipt sender with the
// client email auto-filled.
//
// Photo upload + per-installment "done" status are not in the data layer
// today — these are visual placeholders; sending a receipt is local-toast.

interface CompletedTearSheetProps {
  rows: ProposalCRow[];
}

export function CompletedTearSheet({ rows }: CompletedTearSheetProps) {
  if (rows.length === 0) {
    return <EmptyCompleted />;
  }

  return (
    <div className="pt-8 space-y-6">
      {rows.map((r, i) => (
        <CompletedCard key={r.id} row={r} index={i} />
      ))}
    </div>
  );
}

function CompletedCard({ row, index }: { row: ProposalCRow; index: number }) {
  const [recipient, setRecipient] = React.useState(row.clientEmail ?? "");
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  async function sendReceipt() {
    if (!recipient.trim()) {
      toast.error("Add an email", "We need a recipient address.");
      return;
    }
    setSending(true);
    // No receipt API yet — local optimistic confirmation.
    setTimeout(() => {
      setSending(false);
      setSent(true);
      toast.success("Receipt sent", `Paid invoice for "${row.title}" went to ${recipient}.`);
    }, 420);
  }

  // Use installment line as a proxy for schedule items. For visual purposes,
  // treat all of them as "done" since the proposal is PAID.
  const scheduleItems = row.installments.length > 0
    ? row.installments
    : [{ id: "deposit", label: "Deposit", amount: 0, isPercent: false, dueDate: null, position: 0 }];

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: Math.min(index * 0.04, 0.24), ease: [0.22, 1, 0.36, 1] }}
      className="paper-card p-0 overflow-hidden"
    >
      {/* Tear-sheet masthead */}
      <div className="px-6 pt-5 pb-5 border-b border-[color:var(--ink-line)]">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="quiet-caps !mb-0 text-emerald-800">Completed</span>
              <span aria-hidden className="h-px w-6 bg-[color:var(--ink-line)]" />
              <span className="quiet-caps !mb-0 text-[color:var(--ink-faint)]">
                {row.paidAtISO ? longDate(row.paidAtISO) : "—"}
              </span>
            </div>
            <Link
              href={`/dashboard/proposals/${row.id}` as never}
              className="block focus-ring rounded-[var(--r-xs)] -mx-1 px-1 group"
            >
              <h3 className="font-display text-[24px] font-semibold leading-tight tracking-[-0.018em] text-[color:var(--ink)] group-hover:text-[color:var(--accent-ink)] transition-colors flex items-center gap-2">
                <span className="truncate">{row.title}</span>
                <ArrowUpRight className="h-4 w-4 text-[color:var(--ink-faint)] group-hover:text-[color:var(--accent)] transition-colors shrink-0" />
              </h3>
              <p className="mt-1 text-[12.5px] text-[color:var(--ink-muted)]">{row.clientName}</p>
            </Link>
          </div>

          <div className="text-right shrink-0">
            <div className="quiet-caps !mb-0 text-[color:var(--ink-faint)]">Banked</div>
            <div className="font-display tabular text-[26px] font-semibold leading-none tracking-[-0.02em] text-emerald-900 mt-1">
              {money(row.total)}
            </div>
          </div>
        </div>
      </div>

      {/* Dateline triplet */}
      <div className="grid grid-cols-3 divide-x divide-[color:var(--ink-line)]">
        <DateCell label="Deposit" value={money(estimateDeposit(row))} sub="Locked in" />
        <DateCell label="Start" value={dateOrDash(row.acceptedAtISO ?? row.sentAtISO)} sub="Work began" />
        <DateCell label="Completed" value={dateOrDash(row.paidAtISO ?? row.updatedAtISO)} sub="Paid in full" emphasis />
      </div>

      {/* Schedule items + photo strip */}
      <div className="grid grid-cols-[1.1fr_1fr] gap-0 border-t border-[color:var(--ink-line)]">
        <div className="px-6 py-5 border-r border-[color:var(--ink-line)]">
          <div className="quiet-caps text-[color:var(--ink-faint)] mb-3">Schedule</div>
          <ul className="space-y-2">
            {scheduleItems.map((line) => (
              <li key={line.id} className="flex items-center gap-2.5">
                <span className="h-4 w-4 rounded-full bg-emerald-100 grid place-items-center shrink-0">
                  <Check className="h-2.5 w-2.5 text-emerald-700" strokeWidth={3} />
                </span>
                <span className="text-[13px] text-[color:var(--ink-soft)] truncate flex-1">
                  {line.label}
                </span>
                <span className="tabular text-[11px] text-[color:var(--ink-muted)]">
                  done
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="px-6 py-5">
          <div className="quiet-caps text-[color:var(--ink-faint)] mb-3 flex items-center justify-between">
            <span>Before · After</span>
            <button
              type="button"
              onClick={() => toast.success("Photo upload coming soon", "Wire to /api/upload when ready.")}
              className="quiet-caps !mb-0 text-[color:var(--accent-ink)] hover:underline underline-offset-2 focus-ring rounded-[var(--r-xs)] px-1"
            >
              + Add
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <PhotoSlot label="Before" />
            <PhotoSlot label="After" />
          </div>
        </div>
      </div>

      {/* Receipt sender — auto-filled email */}
      <div className="border-t border-[color:var(--ink-line)] px-6 py-4 bg-[color:var(--paper)]/40">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[240px]">
            <label className="quiet-caps block mb-1.5 text-[color:var(--ink-faint)]">
              Send paid receipt to
            </label>
            <input
              type="email"
              value={recipient}
              onChange={(e) => {
                setRecipient(e.target.value);
                if (sent) setSent(false);
              }}
              placeholder="client@example.com"
              className={cn(
                "h-9 w-full px-3 rounded-[var(--r-md)] text-[13px]",
                "bg-white/60 hairline text-[color:var(--ink)]",
                "focus:outline-none focus:shadow-[0_0_0_3px_rgba(79,70,229,0.18)]",
                "tabular",
              )}
            />
          </div>
          <Button
            size="md"
            variant={sent ? "outline" : "primary"}
            icon={sent ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
            onClick={sendReceipt}
            loading={sending}
          >
            {sent ? "Sent" : "Send receipt"}
          </Button>
        </div>
      </div>
    </motion.article>
  );
}

function DateCell({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string;
  value: string;
  sub: string;
  emphasis?: boolean;
}) {
  return (
    <div className="px-6 py-4">
      <div className="quiet-caps text-[color:var(--ink-faint)] mb-1.5">{label}</div>
      <div
        className={cn(
          "font-display tabular text-[18px] font-semibold leading-tight tracking-[-0.012em]",
          emphasis ? "text-emerald-900" : "text-[color:var(--ink)]",
        )}
      >
        {value}
      </div>
      <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">{sub}</div>
    </div>
  );
}

function PhotoSlot({ label }: { label: string }) {
  return (
    <div className="aspect-[4/3] rounded-[var(--r-md)] hairline bg-[color:var(--paper-deep)]/50 grid place-items-center text-center">
      <div className="flex flex-col items-center gap-1">
        <Camera className="h-4 w-4 text-[color:var(--ink-faint)]" />
        <span className="quiet-caps !mb-0 text-[color:var(--ink-faint)]">{label}</span>
      </div>
    </div>
  );
}

function dateOrDash(iso: string | null): string {
  if (!iso) return "—";
  return longDate(iso);
}

function estimateDeposit(row: ProposalCRow): number {
  const first = row.installments.find((l) => l.position === 0) ?? row.installments[0];
  if (!first) return 0;
  return first.isPercent ? Math.round(row.total * (first.amount / 100)) : first.amount;
}

function EmptyCompleted() {
  return (
    <div className="pt-8">
      <div className="paper-card text-center py-16 px-6">
        <div className="quiet-caps text-[color:var(--ink-faint)] mb-3">Nothing filed yet</div>
        <h3 className="font-display text-[22px] font-semibold tracking-[-0.015em] text-[color:var(--ink)] mb-1">
          Finished jobs settle here
        </h3>
        <p className="text-[13px] text-[color:var(--ink-muted)] max-w-md mx-auto">
          Mark an accepted proposal completed and it'll move to this tab — receipts, dates, and
          before-and-after photos all in one tear sheet.
        </p>
      </div>
    </div>
  );
}
