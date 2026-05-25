"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Calendar as CalendarIcon,
  Package,
  FileSignature,
  Mail,
  CheckCircle2,
  ExternalLink,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { money, longDate, relative } from "@/lib/format";
import { updateProposalStatus } from "@/actions/proposals";
import { PaymentSchedule } from "./payment-schedule";
import type { ProposalCRow } from "./types";

// Stack of accepted proposals. Each card is a self-contained "work in motion"
// dossier: title + total + accepted-on, the payment schedule strip, then a
// row of editorial-style action chips. Hairline-led, flat by default — the
// only filled surface is the paper card.

interface AcceptedStackProps {
  rows: ProposalCRow[];
}

export function AcceptedStack({ rows }: AcceptedStackProps) {
  if (rows.length === 0) {
    return <EmptyAccepted />;
  }

  return (
    <div className="pt-8 space-y-5">
      {rows.map((r, i) => (
        <AcceptedCard key={r.id} row={r} index={i} />
      ))}
    </div>
  );
}

function AcceptedCard({ row, index }: { row: ProposalCRow; index: number }) {
  const router = useRouter();
  const [paidLines, setPaidLines] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);

  function togglePaid(lineId: string) {
    setPaidLines((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
    toast.success(
      paidLines.has(lineId) ? "Marked unpaid" : "Marked paid",
      "Tracked locally. Mark the proposal completed to lock in the record.",
    );
  }

  function sendReminder(lineId: string) {
    const line = row.installments.find((l) => l.id === lineId);
    toast.success(
      "Reminder queued",
      line ? `We'll nudge ${row.clientName} about "${line.label}."` : "We'll follow up with the client.",
    );
  }

  async function markCompleted() {
    setBusy(true);
    try {
      await updateProposalStatus(row.id, "PAID");
      toast.success("Marked completed", `${row.title} moved to the Completed tab.`);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Try again.";
      toast.error("Couldn't mark completed", msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: Math.min(index * 0.04, 0.24), ease: [0.22, 1, 0.36, 1] }}
      className="paper-card p-0 overflow-hidden"
    >
      {/* Header strip */}
      <header className="px-6 pt-5 pb-4 flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge tone="success" dot>
              Accepted
            </Badge>
            <span className="quiet-caps !mb-0 text-[color:var(--ink-faint)]">
              {row.acceptedAtISO
                ? `accepted ${relative(new Date(row.acceptedAtISO))}`
                : `updated ${relative(new Date(row.updatedAtISO))}`}
            </span>
          </div>
          <Link
            href={`/dashboard/proposals/${row.id}` as never}
            className="block focus-ring rounded-[var(--r-xs)] -mx-1 px-1 group"
          >
            <h3 className="font-display text-[22px] font-semibold leading-tight tracking-[-0.015em] text-[color:var(--ink)] group-hover:text-[color:var(--accent-ink)] transition-colors flex items-center gap-2">
              <span className="truncate">{row.title}</span>
              <ArrowUpRight className="h-4 w-4 text-[color:var(--ink-faint)] group-hover:text-[color:var(--accent)] transition-colors shrink-0" />
            </h3>
            <p className="mt-1 text-[12.5px] text-[color:var(--ink-muted)]">
              {row.clientName}
              {row.clientEmail && (
                <>
                  <span className="mx-1.5 text-[color:var(--ink-faint)]">·</span>
                  <span className="text-[color:var(--ink-muted)]">{row.clientEmail}</span>
                </>
              )}
            </p>
          </Link>
        </div>

        <div className="text-right shrink-0">
          <div className="quiet-caps !mb-0 text-[color:var(--ink-faint)]">Contract value</div>
          <div className="font-display tabular text-[28px] font-semibold leading-none tracking-[-0.02em] text-[color:var(--ink)] mt-1">
            {money(row.total)}
          </div>
        </div>
      </header>

      {/* Payment schedule */}
      <div className="px-6 pt-1 pb-4">
        <PaymentSchedule
          installments={row.installments}
          total={row.total}
          paidLineIds={paidLines}
          onTogglePaid={togglePaid}
          onSendReminder={sendReminder}
        />
      </div>

      {/* Action bar — hairline-divided */}
      <div className="border-t border-[color:var(--ink-line)] px-6 py-3 flex items-center justify-between gap-3 flex-wrap bg-[color:var(--paper)]/40">
        <div className="flex items-center gap-1.5 flex-wrap">
          <ActionChip
            icon={<CalendarIcon className="h-3.5 w-3.5" />}
            label="Schedule"
            href={"/dashboard/calendar" as never}
            tone="ink"
          />
          <ActionChip
            icon={<Mail className="h-3.5 w-3.5" />}
            label="Request payment"
            onClick={() => toast.success("Payment request queued", `Sending link to ${row.clientName}.`)}
            tone="accent"
          />
          <ActionChip
            icon={<Package className="h-3.5 w-3.5" />}
            label={`Materials${row.materials.length ? ` · ${row.materials.length}` : ""}`}
            href={`/dashboard/proposals/${row.id}` as never}
            tone="muted"
          />
          <ActionChip
            icon={<FileSignature className="h-3.5 w-3.5" />}
            label="Change order"
            onClick={() => toast.success("Change order draft started")}
            tone="muted"
          />
          <ActionChip
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            label="View public"
            onClick={() => window.open(`/portal/q/${row.publicId}`, "_blank", "noopener,noreferrer")}
            tone="muted"
          />
        </div>

        <Button
          size="sm"
          variant="outline"
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          onClick={markCompleted}
          loading={busy}
        >
          Mark completed
        </Button>
      </div>
    </motion.article>
  );
}

function ActionChip({
  icon,
  label,
  onClick,
  href,
  tone = "ink",
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  tone?: "ink" | "accent" | "muted";
}) {
  const base = cn(
    "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[var(--r-sm)] text-[11.5px] font-medium tracking-[-0.005em]",
    "transition-colors focus-ring",
    tone === "ink" && "text-[color:var(--ink-soft)] hover:text-[color:var(--ink)] hover:bg-black/[0.04]",
    tone === "accent" &&
      "text-[color:var(--accent-ink)] bg-[color:var(--accent-soft)] hover:brightness-[0.97]",
    tone === "muted" && "text-[color:var(--ink-muted)] hover:text-[color:var(--ink)] hover:bg-black/[0.04]",
  );

  if (href) {
    return (
      <Link href={href as never} className={base}>
        <span className="opacity-80">{icon}</span>
        <span>{label}</span>
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={base}>
      <span className="opacity-80">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function EmptyAccepted() {
  return (
    <div className="pt-8">
      <div className="paper-card text-center py-16 px-6">
        <div className="quiet-caps text-[color:var(--ink-faint)] mb-3">Nothing accepted yet</div>
        <h3 className="font-display text-[22px] font-semibold tracking-[-0.015em] text-[color:var(--ink)] mb-1">
          Once a client signs, work lands here
        </h3>
        <p className="text-[13px] text-[color:var(--ink-muted)] max-w-md mx-auto">
          Accepted proposals become workspaces — payment schedule, materials, change orders, schedule.
          Everything you do mid-job lives in this tab.
        </p>
      </div>
    </div>
  );
}
