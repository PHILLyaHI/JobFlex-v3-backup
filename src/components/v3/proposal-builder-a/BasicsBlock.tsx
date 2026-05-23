"use client";
import * as React from "react";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import {
  Card,
  CardHeader,
  CardTitle,
  CardSubtitle,
} from "@/components/ui/Card";
import { useProposalDraftStore } from "@/stores/useProposalDraftStore";
import { ClientField, type ClientLite } from "./ClientField";
import { PreviewTag, PreviewNote } from "./PreviewTag";

export type ProjectLite = { id: string; name: string };

export function BasicsBlock({
  clients,
  projects,
}: {
  clients: ClientLite[];
  projects: ProjectLite[];
}) {
  const title = useProposalDraftStore((s) => s.draft.title);
  const description = useProposalDraftStore((s) => s.draft.description);
  const set = useProposalDraftStore((s) => s.set);

  // Bucket C — inert. The Proposal model has no projectId column, so the
  // chosen project is held locally and not persisted.
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
        <div>
          <div className="flex items-center gap-2">
            <span className="quiet-caps">Project</span>
            <PreviewTag />
          </div>
          <div className="mt-1.5">
            <Select
              aria-label="Project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">— No project —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <ClientField clients={clients} />
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
      <PreviewNote>
        Associating a proposal with a project needs a `projectId` column on the
        Proposal model — not added yet, so the project picker above does not
        persist.
      </PreviewNote>
    </Card>
  );
}
