"use client";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardSubtitle,
} from "@/components/ui/Card";
import {
  useProposalDraftStore,
  type DraftInstallment,
} from "@/stores/useProposalDraftStore";
import { cn } from "@/lib/cn";

// Borderless register: each installment is a hairline-divided row, not a boxed
// card with three more boxes inside it. Fields are quiet at rest (a sage focus
// ring + subtle hover wash give the affordance), and the %/$ choice is a tonal
// toggle rather than a bordered dropdown.
const FIELD =
  "rounded-[var(--r-sm)] bg-transparent px-2.5 py-1.5 text-[14px] text-[color:var(--ink)] outline-none transition-colors placeholder:text-[color:var(--ink-faint)] hover:bg-black/[0.02] focus:bg-white/70 focus:shadow-[0_0_0_2px_rgba(31,122,82,0.18)]";

function InstallmentRow({
  installment,
  position,
}: {
  installment: DraftInstallment;
  position: number;
}) {
  const update = useProposalDraftStore((s) => s.updateInstallment);
  const remove = useProposalDraftStore((s) => s.removeInstallment);

  return (
    <div className="flex items-center gap-2 py-3">
      <span className="w-5 shrink-0 text-center text-[11px] tabular text-[color:var(--ink-faint)]">
        {position}
      </span>
      <input
        aria-label="Installment label"
        placeholder="Deposit / Materials delivered / Completion"
        value={installment.label}
        onChange={(e) => update(installment.id, { label: e.target.value })}
        className={cn(FIELD, "min-w-0 flex-1")}
      />
      <input
        type="number"
        step="0.01"
        aria-label="Installment amount"
        value={installment.amount}
        onChange={(e) => update(installment.id, { amount: Number(e.target.value) })}
        className={cn(
          FIELD,
          "w-[88px] text-right tabular [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        )}
      />
      <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Amount type">
        <button
          type="button"
          aria-pressed={installment.isPercent}
          onClick={() => update(installment.id, { isPercent: true })}
          className={cn(
            "grid h-7 w-7 place-items-center rounded-[var(--r-sm)] text-[13px] font-medium transition-colors focus-ring",
            installment.isPercent
              ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]"
              : "text-[color:var(--ink-faint)] hover:bg-black/[0.04] hover:text-[color:var(--ink)]",
          )}
        >
          %
        </button>
        <button
          type="button"
          aria-pressed={!installment.isPercent}
          onClick={() => update(installment.id, { isPercent: false })}
          className={cn(
            "grid h-7 w-7 place-items-center rounded-[var(--r-sm)] text-[13px] font-medium transition-colors focus-ring",
            !installment.isPercent
              ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]"
              : "text-[color:var(--ink-faint)] hover:bg-black/[0.04] hover:text-[color:var(--ink)]",
          )}
        >
          $
        </button>
      </div>
      <button
        type="button"
        onClick={() => remove(installment.id)}
        aria-label="Remove installment"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] transition-colors hover:bg-rose-50 hover:text-[color:var(--rose)] focus-ring"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function PaymentScheduleBlock() {
  const installments = useProposalDraftStore((s) => s.draft.installments);
  const addInstallment = useProposalDraftStore((s) => s.addInstallment);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Payment schedule</CardTitle>
          <CardSubtitle>One or more installments, fixed or percent.</CardSubtitle>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={addInstallment}
          icon={<Plus className="h-3 w-3" />}
        >
          Add installment
        </Button>
      </CardHeader>
      {installments.length === 0 ? (
        <p className="text-[12.5px] text-[color:var(--ink-muted)]">
          No payment schedule yet. The full amount is treated as due on completion.
        </p>
      ) : (
        <div className="divide-y divide-[color:var(--ink-line)]">
          {installments.map((i, idx) => (
            <InstallmentRow key={i.id} installment={i} position={idx + 1} />
          ))}
        </div>
      )}
    </Card>
  );
}
