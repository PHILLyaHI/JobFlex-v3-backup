"use client";
import * as React from "react";
import { useProposalDraftStore } from "@/stores/useProposalDraftStore";

export function HydrateDraft({ value }: { value: Parameters<ReturnType<typeof useProposalDraftStore.getState>["hydrate"]>[0] }) {
  const hydrate = useProposalDraftStore((s) => s.hydrate);
  React.useEffect(() => {
    hydrate(value);
  }, [hydrate, value]);
  return null;
}
