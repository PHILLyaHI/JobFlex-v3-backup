"use client";
import * as React from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useProposalDraftStore } from "@/stores/useProposalDraftStore";
import { BuilderSection } from "./BuilderSection";
import { LineItemRow } from "./LineItemRow";
import type { ClientLite } from "./ClientField";

// Decimal (0–1) → display percentage string. Module-scope: pure, no closure.
const toPctString = (dec: number) =>
  dec ? String(+(dec * 100).toFixed(4)) : "";

// Tax rate is stored as a decimal (0–1). This field is a percentage wrapper
// only: the contractor types 7.5, we persist 0.075. Local string state keeps
// mid-edit values like "7." intact; the store stays the source of truth.
function TaxRateField() {
  const taxRate = useProposalDraftStore((s) => s.draft.taxRate);
  const set = useProposalDraftStore((s) => s.set);

  const lastDecimal = React.useRef(taxRate);
  const [str, setStr] = React.useState(() => toPctString(taxRate));

  // Resync when the store's taxRate changes from outside this field
  // (draft reset on /new, or hydrate on an existing proposal).
  React.useEffect(() => {
    if (taxRate !== lastDecimal.current) {
      lastDecimal.current = taxRate;
      setStr(toPctString(taxRate));
    }
  }, [taxRate]);

  function onChange(v: string) {
    if (v !== "" && !/^\d*\.?\d*$/.test(v)) return;
    setStr(v);
    const pct = v.trim() === "" ? 0 : parseFloat(v);
    const dec = isNaN(pct) ? 0 : pct / 100;
    lastDecimal.current = dec;
    set({ taxRate: dec });
  }

  return (
    <div className="w-[184px]">
      <Input
        label="Tax rate"
        type="text"
        inputMode="decimal"
        suffix={<span className="text-[12px]">%</span>}
        value={str}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        hint="A percentage — type 7.5 for 7.5%"
      />
    </div>
  );
}

export function LineItemsBlock({ clients }: { clients: ClientLite[] }) {
  const lineItems = useProposalDraftStore((s) => s.draft.lineItems);
  const title = useProposalDraftStore((s) => s.draft.title);
  const clientId = useProposalDraftStore((s) => s.draft.clientId);
  const addLine = useProposalDraftStore((s) => s.addLine);

  const clientName =
    clients.find((c) => c.id === clientId)?.name ?? "No client yet";

  return (
    <BuilderSection
      index="02"
      title="Line items"
      subtitle="Each line carries its own measurement unit and material / labor split."
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={addLine}
          icon={<Plus className="h-3 w-3" />}
        >
          Add line
        </Button>
      }
    >
      {lineItems.length === 0 ? (
        <div className="rounded-[var(--r-md)] bg-white/40 px-5 py-9 text-center hairline">
          <p className="text-[13px] text-[color:var(--ink-muted)]">
            No line items yet.
          </p>
          <p className="mx-auto mt-1 max-w-[42ch] text-[12px] leading-relaxed text-[color:var(--ink-faint)]">
            Add a line for each material or labor item. The live preview and
            estimate update as you go.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {lineItems.map((l) => (
            <LineItemRow
              key={l.id}
              item={l}
              proposalTitle={title}
              clientName={clientName}
            />
          ))}
        </div>
      )}

      <div className="mt-6 border-t border-[color:var(--ink-line)] pt-5">
        <TaxRateField />
      </div>
    </BuilderSection>
  );
}
