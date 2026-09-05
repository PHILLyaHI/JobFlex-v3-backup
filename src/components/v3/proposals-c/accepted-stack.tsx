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
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { money, relative } from "@/lib/format";
import { updateProposalStatus } from "@/actions/proposals";
import { notifyPaymentReminder } from "@/actions/notify";
import {
  markInstallmentPaid,
  recordRemainingPayment,
  unmarkInstallmentPaid,
} from "@/actions/installments";
import { RecordPaymentDialog } from "@/components/proposal/RecordPaymentDialog";
import { Pagination } from "@/components/ui/Pagination";
import { usePagedList } from "@/lib/usePagedList";
import { PaymentSchedule } from "./payment-schedule";
import { MaterialsSheet } from "@/components/proposal/MaterialsSheet";
import type { InstallmentLine, ProposalCRow } from "./types";

// Stack of accepted proposals. Each card is a self-contained "work in motion"
// dossier: title + total + accepted-on, the payment schedule strip, then a
// row of editorial-style action chips. Hairline-led, flat by default — the
// only filled surface is the paper card.

interface AcceptedStackProps {
  rows: ProposalCRow[];
}

export function AcceptedStack({ rows }: AcceptedStackProps) {
  const { page, pageCount, setPage, pageItems } = usePagedList(rows, 20);

  if (rows.length === 0) {
    return <EmptyAccepted />;
  }

  return (
    <div className="pt-8">
      <div className="space-y-5">
        {pageItems.map((r, i) => (
          <AcceptedCard key={r.id} row={r} index={i} />
        ))}
      </div>
      <Pagination page={page} pageCount={pageCount} onPage={setPage} />
    </div>
  );
}

function AcceptedCard({ row, index }: { row: ProposalCRow; index: number }) {
  const router = useRouter();
  // Record-payment sheet: one stage ("Mark paid") or the remaining balance
  // (when Mark completed finds money still owed).
  const [recording, setRecording] = React.useState<
    | { kind: "stage"; line: InstallmentLine; amount: number }
    | { kind: "remaining"; amount: number }
    | null
  >(null);
  const [busy, setBusy] = React.useState(false);
  const [busyUnaccept, setBusyUnaccept] = React.useState(false);
  const [materialsOpen, setMaterialsOpen] = React.useState(false);

  // Count of purchasable material lines — matches what the module shows.
  const materialCount = row.materials.filter((m) => (m.materialCost ?? 0) > 0).length;

  function stageDollars(line: InstallmentLine) {
    return line.isPercent ? Math.round(row.total * (line.amount / 100)) : line.amount;
  }

  function openMarkPaid(line: InstallmentLine) {
    setRecording({ kind: "stage", line, amount: stageDollars(line) });
  }

  async function unmark(line: InstallmentLine) {
    try {
      const res = await unmarkInstallmentPaid(line.id);
      if (!res.ok) {
        toast.error("Can't undo here", res.message);
        return;
      }
      toast.success("Undone", `"${line.label}" is open again.`);
      router.refresh();
    } catch (err: unknown) {
      toast.error("Couldn't undo", err instanceof Error ? err.message : "Try again.");
    }
  }

  async function submitRecording(input: { method: "BANK_TRANSFER" | "CASH" | "CHECK" | "OTHER"; amount: number; note?: string }) {
    if (!recording) return;
    if (recording.kind === "stage") {
      await markInstallmentPaid({ installmentId: recording.line.id, ...input });
      toast.success("Payment recorded", `"${recording.line.label}" marked paid.`);
    } else {
      const res = await recordRemainingPayment({ proposalId: row.id, ...input });
      toast.success(
        "Payment recorded",
        res.outcome === "settled" && res.proposalPaid
          ? `${row.title} is paid in full and moved to Completed.`
          : "Applied to the open stages.",
      );
    }
    router.refresh();
  }

  async function sendReminder(lineId: string) {
    const line = row.installments.find((l) => l.id === lineId);
    try {
      await notifyPaymentReminder({ proposalId: row.id, installmentId: lineId });
      toast.success(
        "Reminder sent",
        line && row.clientEmail
          ? `Email sent to ${row.clientEmail} about "${line.label}."`
          : `Reminder sent to ${row.clientName}.`,
      );
    } catch {
      toast.error("Couldn't send reminder", "Check that the client has an email on file.");
    }
  }

  async function markCompleted() {
    setBusy(true);
    try {
      const res = await updateProposalStatus(row.id, "PAID");
      if (!res.ok) {
        // Completion no longer waits on the money (updateProposalStatus);
        // the only refusals left are provider / draft rules.
        toast.error("Couldn't mark completed", "This proposal can't be marked completed right now.");
        return;
      }
      toast.success("Marked completed", `${row.title} moved to the Completed tab.`);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Try again.";
      toast.error("Couldn't mark completed", msg);
    } finally {
      setBusy(false);
    }
  }

  async function unaccept() {
    setBusyUnaccept(true);
    try {
      const res = await updateProposalStatus(row.id, "DRAFT");
      if (!res.ok) {
        toast.error("Can't un-accept", "A proposal with paid stages can't go back to draft.");
        return;
      }
      toast.success("Proposal un-accepted", `${row.title} is back in draft — you can edit and re-send it.`);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Try again.";
      toast.error("Couldn't un-accept", msg);
    } finally {
      setBusyUnaccept(false);
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
      <header className="px-6 pt-5 pb-5 flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 mb-2">
            <Badge tone="success">
              Accepted
            </Badge>
            <span className="quiet-caps !mb-0 text-[color:var(--ink-faint)]">
              {row.acceptedAtISO
                ? `signed ${relative(new Date(row.acceptedAtISO))}`
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
      <div className="border-t border-[color:var(--ink-line)]">
        <PaymentSchedule
          installments={row.installments}
          total={row.total}
          onMarkPaid={openMarkPaid}
          onUnmark={unmark}
          onSendReminder={sendReminder}
        />
      </div>
      <RecordPaymentDialog
        open={recording !== null}
        title={recording?.kind === "remaining" ? "Record payment" : "Mark paid"}
        stageLabel={
          recording?.kind === "stage"
            ? `${recording.line.label} · ${row.title}`
            : `Remaining balance · ${row.title}`
        }
        defaultAmount={recording?.amount ?? 0}
        onClose={() => setRecording(null)}
        onSubmit={submitRecording}
      />

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
            label={`Materials${materialCount ? ` · ${materialCount}` : ""}`}
            onClick={() => setMaterialsOpen(true)}
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

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            onClick={unaccept}
            loading={busyUnaccept}
          >
            Un-accept
          </Button>
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
      </div>

      <MaterialsSheet
        open={materialsOpen}
        onClose={() => setMaterialsOpen(false)}
        proposalTitle={row.title}
        clientName={row.clientName}
        items={row.materials}
      />
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
