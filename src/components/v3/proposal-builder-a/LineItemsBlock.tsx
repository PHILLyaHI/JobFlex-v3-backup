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
          <LineItemRow
            key={l.id}
            item={l}
            proposalTitle={title}
            clientName={clientName}
          />
        ))}
      </div>
      <div className="mt-5">
        <TaxRateField />
      </div>
    </Card>
  );
}
