"use client";
import * as React from "react";
import { useProposalDraftStore } from "@/stores/useProposalDraftStore";

// Initialise the draft store with the org default tax rate. Runs once per
// mount — guarded by a ref so navigations between v1 and v3 builders don't
// clobber an in-progress draft on re-render.
export function ResetDraft({ defaultTaxRate }: { defaultTaxRate: number }) {
  const reset = useProposalDraftStore((s) => s.reset);
  const set = useProposalDraftStore((s) => s.set);
  const didRun = React.useRef(false);

  React.useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;
    reset();
    set({ taxRate: defaultTaxRate });
  }, [reset, set, defaultTaxRate]);

  return null;
}
