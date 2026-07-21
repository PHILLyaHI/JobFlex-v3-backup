"use client";
import * as React from "react";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardSubtitle,
} from "@/components/ui/Card";
import { useProposalDraftStore } from "@/stores/useProposalDraftStore";
import { PlacesAutocomplete } from "@/components/estimator/roof/PlacesAutocomplete";
import { ClientField, type ClientLite } from "./ClientField";
import { ProjectField } from "./ProjectField";

export type ProjectLite = { id: string; name: string; description?: string | null };

export function BasicsBlock({
  clients,
  projects,
}: {
  clients: ClientLite[];
  projects: ProjectLite[];
}) {
  const title = useProposalDraftStore((s) => s.draft.title);
  const description = useProposalDraftStore((s) => s.draft.description);
  const address = useProposalDraftStore((s) => s.draft.address);
  const set = useProposalDraftStore((s) => s.set);
  const setAddress = useProposalDraftStore((s) => s.setAddress);

  // Project selection is local-only — the Proposal model has no projectId column yet.
  const [projectId, setProjectId] = React.useState("");

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Basics</CardTitle>
          <CardSubtitle>Who it&apos;s for and what it&apos;s about</CardSubtitle>
        </div>
      </CardHeader>
      <div className="grid md:grid-cols-2 gap-4">
        <Input
          label="Proposal title"
          value={title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Patel Residence — Roof Replacement"
        />
        <ProjectField
          projects={projects}
          value={projectId}
          onChange={setProjectId}
        />
      </div>
      <div className="mt-4">
        <ClientField clients={clients} />
      </div>
      <div className="mt-4">
        <span className="quiet-caps">
          Job address <span className="text-[color:var(--ink-faint)]">· Optional</span>
        </span>
        <div className="mt-1.5">
          <PlacesAutocomplete
            value={address ?? ""}
            onTextChange={(v) => setAddress(v)}
            onPick={(a) => setAddress(a.formatted || a.address, a.state || null)}
            enableFind
            placeholder="Search the job address…"
          />
        </div>
        <p className="mt-1.5 text-[11.5px] text-[color:var(--ink-muted)]">
          Fills from the chosen client and sets the tax-rate estimate — edit it freely.
        </p>
      </div>
      <div className="mt-4">
        <Textarea
          label="Description"
          rows={3}
          value={description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="One-paragraph overview your client will see first."
        />
      </div>
    </Card>
  );
}
