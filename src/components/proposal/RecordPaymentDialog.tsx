"use client";
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/Button";

// Hand-rolled sheet (no Radix — see InboxSheet) for recording a payment that
// arrived OUTSIDE JobFlex: bank transfer, cash, check. Used for one stage
// ("Mark paid") and for the whole remaining balance ("Record payment" when
// Mark completed finds money still owed).

export type ManualMethod = "BANK_TRANSFER" | "CASH" | "CHECK" | "OTHER";

const METHODS: { key: ManualMethod; label: string }[] = [
  { key: "BANK_TRANSFER", label: "Bank transfer" },
  { key: "CASH", label: "Cash" },
  { key: "CHECK", label: "Check" },
  { key: "OTHER", label: "Other" },
];

export interface RecordPaymentDialogProps {
  open: boolean;
  title: string;
  /** Stage label or "Remaining balance". */
  stageLabel: string;
  /** Default dollars (the stage amount / what is owed). */
  defaultAmount: number;
  onClose: () => void;
  onSubmit: (input: { method: ManualMethod; amount: number; note?: string }) => Promise<void>;
}

export function RecordPaymentDialog(props: RecordPaymentDialogProps) {
  // Mount the sheet only while open, so its form state starts fresh on every
  // open without a setState-in-effect reset.
  if (!props.open) return null;
  return <RecordPaymentSheet {...props} />;
}

function RecordPaymentSheet({
  title,
  stageLabel,
  defaultAmount,
  onClose,
  onSubmit,
}: RecordPaymentDialogProps) {
  const [method, setMethod] = React.useState<ManualMethod>("BANK_TRANSFER");
  const [amount, setAmount] = React.useState<string>(defaultAmount.toFixed(2));
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const n = Number.parseFloat(amount);
  const valid = Number.isFinite(n) && n > 0;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await onSubmit({ method, amount: Math.round(n * 100) / 100, note: note.trim() || undefined });
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Couldn't record the payment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-[440px] rounded-t-[var(--r-lg)] bg-white p-5 shadow-[0_24px_60px_-20px_rgba(17,17,19,0.35)] sm:rounded-[var(--r-lg)]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="font-display text-[17px] font-semibold text-[color:var(--ink)]">{title}</div>
            <div className="text-[12.5px] text-[color:var(--ink-muted)]">{stageLabel}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.04] focus-ring">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-1.5" role="group" aria-label="How was it paid">
          {METHODS.map((m) => (
            <button
              key={m.key}
              type="button"
              aria-pressed={method === m.key}
              onClick={() => setMethod(m.key)}
              className={cn(
                "h-11 rounded-[var(--r-sm)] text-[13px] font-medium transition-colors focus-ring",
                method === m.key
                  ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]"
                  : "hairline text-[color:var(--ink-soft)] hover:bg-black/[0.03]",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        <label className="mb-3 block">
          <span className="quiet-caps mb-1 block text-[color:var(--ink-faint)]">Amount received</span>
          <span className="flex items-center rounded-[var(--r-sm)] hairline px-3">
            <span className="text-[13px] text-[color:var(--ink-faint)]">$</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-11 w-full bg-transparent px-2 text-[15px] tabular text-[color:var(--ink)] outline-none"
              aria-label="Amount received"
            />
          </span>
          {valid && Math.abs(n - defaultAmount) > 0.005 ? (
            <span className="mt-1 block text-[11.5px] text-[color:var(--ink-muted)]">
              Stage is {money(defaultAmount)} — a different amount is applied in order and any shortfall stays due.
            </span>
          ) : null}
        </label>

        <label className="mb-4 block">
          <span className="quiet-caps mb-1 block text-[color:var(--ink-faint)]">Note (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="Check #1042, wire ref…"
            className="h-11 w-full rounded-[var(--r-sm)] hairline bg-transparent px-3 text-[13.5px] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--ink-faint)]"
          />
        </label>

        {err ? <div className="mb-3 text-[12.5px] text-[color:var(--rose)]">{err}</div> : null}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} loading={busy} disabled={!valid}>
            Record {valid ? money(n) : "payment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
