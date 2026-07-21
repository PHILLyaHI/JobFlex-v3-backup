"use client";
import * as React from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardSubtitle,
} from "@/components/ui/Card";
import { useProposalDraftStore } from "@/stores/useProposalDraftStore";
import {
  stateTaxRate,
  resolveStateCode,
  stateDisplayName,
  stateFromAddress,
} from "@/lib/pricing/salesTax";
import { LineItemRow } from "./LineItemRow";
import type { ClientLite } from "./ClientField";

// Decimal (0–1) → display percentage string. Module-scope: pure, no closure.
const toPctString = (dec: number) =>
  dec ? String(+(dec * 100).toFixed(4)) : "";

// Tax rate is stored as a decimal (0–1). This field is a percentage wrapper
// only: the contractor types 7.5, we persist 0.075. Local string state keeps
// mid-edit values like "7." intact; the store stays the source of truth.
//
// Auto-estimate: whenever the builder learns the job address (typed/picked in
// the Basics block, filled from a chosen client, or carried from the AI
// estimator), useProposalDraftStore.setAddress/applyAddressTax seed this field
// from a state-level sales-tax table — see src/lib/pricing/salesTax.ts.
// Typing here marks the rate manual (taxRateAuto: false) so it's never silently
// overwritten by a later address change. The snap-back estimate resolves from
// the draft's job address first; `clientState` is the fallback for proposals
// that predate the address field.
function TaxRateField({ clientState }: { clientState: string | null | undefined }) {
  const taxRate = useProposalDraftStore((s) => s.draft.taxRate);
  const taxRateAuto = useProposalDraftStore((s) => s.draft.taxRateAuto);
  const taxRateState = useProposalDraftStore((s) => s.draft.taxRateState);
  const address = useProposalDraftStore((s) => s.draft.address);
  const set = useProposalDraftStore((s) => s.set);

  const lastDecimal = React.useRef(taxRate);
  const [str, setStr] = React.useState(() => toPctString(taxRate));

  // Resync when the store's taxRate changes from outside this field
  // (draft reset on /new, hydrate on an existing proposal, or an address-based
  // auto-estimate landing after a client select/save).
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
    set({ taxRate: dec, taxRateAuto: false });
  }

  const estimateCode = stateFromAddress(address) ?? resolveStateCode(clientState);
  const estimateRate = estimateCode ? stateTaxRate(estimateCode) : null;
  // Offer the snap-back only when it would actually change something — i.e. the
  // field isn't already showing that exact address-derived estimate.
  const showSnapBack =
    estimateCode !== null &&
    estimateRate !== null &&
    !(taxRateAuto && taxRateState === estimateCode);

  function useEstimate() {
    if (estimateCode === null || estimateRate === null) return;
    lastDecimal.current = estimateRate;
    setStr(toPctString(estimateRate));
    set({ taxRate: estimateRate, taxRateAuto: true, taxRateState: estimateCode });
  }

  return (
    <div className="w-[260px]">
      <Input
        label="Tax rate"
        type="text"
        inputMode="decimal"
        suffix={<span className="text-[12px]">%</span>}
        value={str}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        hint={
          taxRateAuto && taxRateState
            ? `Estimated from ${stateDisplayName(taxRateState)}'s state sales tax — edit anytime.`
            : "A percentage — type 7.5 for 7.5%"
        }
      />
      {showSnapBack && (
        <button
          type="button"
          onClick={useEstimate}
          className="mt-1.5 text-[11.5px] font-medium text-[color:var(--accent-ink)] hover:underline focus-ring rounded-[var(--r-sm)]"
        >
          Use {stateDisplayName(estimateCode)} estimate ({(estimateRate * 100).toFixed(2)}%)
        </button>
      )}
    </div>
  );
}

export function LineItemsBlock({ clients }: { clients: ClientLite[] }) {
  const lineItems = useProposalDraftStore((s) => s.draft.lineItems);
  const clientId = useProposalDraftStore((s) => s.draft.clientId);
  const addLine = useProposalDraftStore((s) => s.addLine);

  const selectedClient = clients.find((c) => c.id === clientId);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Line items</CardTitle>
          <CardSubtitle>
            Separate materials and labor per line. Measurement unit is up to
            you.
          </CardSubtitle>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={addLine}
          icon={<Plus className="h-3 w-3" />}
        >
          Add line
        </Button>
      </CardHeader>
      <div className="space-y-2">
        {lineItems.map((l) => (
          <LineItemRow key={l.id} item={l} />
        ))}
      </div>
      <div className="mt-5">
        <TaxRateField clientState={selectedClient?.state} />
      </div>
    </Card>
  );
}
