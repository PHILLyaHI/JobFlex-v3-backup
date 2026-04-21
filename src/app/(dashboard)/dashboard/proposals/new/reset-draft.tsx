"use client";
import * as React from "react";
import { useProposalDraftStore } from "@/stores/useProposalDraftStore";

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
