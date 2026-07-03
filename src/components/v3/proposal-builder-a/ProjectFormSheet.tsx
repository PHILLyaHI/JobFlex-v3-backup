"use client";
import * as React from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { createProject } from "@/actions/projects";

export type ProjectRecord = { id: string; name: string; description?: string | null };

interface ProjectFormSheetProps {
  open: boolean;
  onClose: () => void;
  onSaved: (project: ProjectRecord) => void;
}

export function ProjectFormSheet({ open, onClose, onSaved }: ProjectFormSheetProps) {
  const [saving, setSaving] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) { setName(""); setDescription(""); }
  }, [open]);

  async function submit() {
    if (!name.trim()) {
      toast.error("Name required", "Give the project a name.");
      return;
    }
    setSaving(true);
    try {
      const saved = await createProject({ name: name.trim(), description: description.trim() || null });
      toast.success("Project created", `"${name.trim()}" added to your projects.`);
      onSaved({ id: saved.id, name: name.trim(), description: description.trim() || null });
      onClose();
    } catch (err: unknown) {
      toast.error("Couldn't create project", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New project"
      description="Saved to your projects list — you'll see it in the picker immediately."
      width="min(480px, 100vw)"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            Create project
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input
          label="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Patel Residence, Office Fit-out…"
          autoFocus
          required
        />
        <Textarea
          label="Description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief summary (optional)"
        />
      </div>
    </Sheet>
  );
}
