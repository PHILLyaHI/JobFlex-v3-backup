"use client";
import { Textarea } from "@/components/ui/Textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardSubtitle,
} from "@/components/ui/Card";
import { useProposalDraftStore } from "@/stores/useProposalDraftStore";

export function ScopeNotesBlock() {
  const scopeOfWork = useProposalDraftStore((s) => s.draft.scopeOfWork);
  const notes = useProposalDraftStore((s) => s.draft.notes);
  const set = useProposalDraftStore((s) => s.set);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Scope &amp; notes</CardTitle>
          <CardSubtitle>What&apos;s included, in plain English.</CardSubtitle>
        </div>
      </CardHeader>
      <Textarea
        label="Scope of work"
        rows={6}
        value={scopeOfWork}
        onChange={(e) => set({ scopeOfWork: e.target.value })}
        placeholder="Remove existing shingles, install underlayment…"
      />
      <div className="mt-6">
        <Textarea
          label="Notes"
          rows={3}
          value={notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Warranty, assumptions, exclusions…"
        />
      </div>
    </Card>
  );
}
