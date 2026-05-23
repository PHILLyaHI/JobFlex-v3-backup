"use client";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import {
  useProposalDraftStore,
  type DraftInstallment,
} from "@/stores/useProposalDraftStore";
import { BuilderSection } from "./BuilderSection";

// Flattened from the live builder: installments are a hairline-ruled register,
// not a stack of bordered boxes inside a card. (DESIGN.md: No-Decorative-Card.)
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
    <div className="flex items-center gap-2.5 py-2.5">
      <span className="w-6 shrink-0 text-[11px] tabular text-[color:var(--ink-faint)]">
        #{position}
      </span>
      <div className="min-w-0 flex-1">
        <Input
          aria-label="Installment label"
          placeholder="Deposit / Materials delivered / Completion"
          value={installment.label}
          onChange={(e) => update(installment.id, { label: e.target.value })}
        />
      </div>
      <div className="w-[116px] shrink-0">
        <Input
          type="number"
          step="0.01"
          aria-label="Installment amount"
          value={installment.amount}
          onChange={(e) =>
            update(installment.id, { amount: Number(e.target.value) })
          }
        />
      </div>
      <div className="w-[84px] shrink-0">
        <Select
          aria-label="Amount type"
          value={installment.isPercent ? "pct" : "flat"}
          onChange={(e) =>
            update(installment.id, { isPercent: e.target.value === "pct" })
          }
        >
          <option value="pct">%</option>
          <option value="flat">$</option>
        </Select>
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
    <BuilderSection
      index="06"
      title="Payment schedule"
      subtitle="One or more installments, fixed or percent of the total."
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={addInstallment}
          icon={<Plus className="h-3 w-3" />}
        >
          Add installment
        </Button>
      }
    >
      {installments.length === 0 ? (
        <div className="rounded-[var(--r-md)] bg-white/40 px-5 py-8 text-center hairline">
          <p className="text-[13px] text-[color:var(--ink-muted)]">
            No payment schedule.
          </p>
          <p className="mt-1 text-[12px] text-[color:var(--ink-faint)]">
            The full amount is treated as due on completion.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[color:var(--ink-line)]">
          {installments.map((i, idx) => (
            <InstallmentRow key={i.id} installment={i} position={idx + 1} />
          ))}
        </div>
      )}
    </BuilderSection>
  );
}
