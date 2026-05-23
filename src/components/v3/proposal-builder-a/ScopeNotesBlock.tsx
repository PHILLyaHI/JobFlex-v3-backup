"use client";
import { Textarea } from "@/components/ui/Textarea";
import { useProposalDraftStore } from "@/stores/useProposalDraftStore";
import { BuilderSection } from "./BuilderSection";

export function ScopeNotesBlock() {
  const scopeOfWork = useProposalDraftStore((s) => s.draft.scopeOfWork);
  const notes = useProposalDraftStore((s) => s.draft.notes);
  const set = useProposalDraftStore((s) => s.set);

  return (
    <BuilderSection
      index="03"
      title="Scope & notes"
      subtitle="What's included, in plain English."
    >
      <Textarea
        label="Scope of work"
        rows={6}
        value={scopeOfWork}
        onChange={(e) => set({ scopeOfWork: e.target.value })}
        placeholder="Remove existing shingles, install underlayment…"
      />
      <div className="mt-4">
        <Textarea
          label="Notes"
          rows={3}
          value={notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Warranty, assumptions, exclusions…"
        />
      </div>
    </BuilderSection>
  );
}
