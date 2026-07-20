"use client";
import * as React from "react";
import { useProposalDraftStore } from "@/stores/useProposalDraftStore";

export function ResetDraft({
  defaultTaxRate,
  materialMarkupPct = 0,
  laborMarkupPct = 0,
}: {
  defaultTaxRate: number;
  materialMarkupPct?: number;
  laborMarkupPct?: number;
}) {
  const reset = useProposalDraftStore((s) => s.reset);
  const set = useProposalDraftStore((s) => s.set);
  const didRun = React.useRef(false);

  React.useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;
    reset();
    // Seed the org defaults on top of a fresh draft. Markup defaults to 0, so an
    // org that hasn't set one keeps pricing at cost (current behaviour).
    set({ taxRate: defaultTaxRate, materialMarkupPct, laborMarkupPct });
  }, [reset, set, defaultTaxRate, materialMarkupPct, laborMarkupPct]);

  return null;
}
