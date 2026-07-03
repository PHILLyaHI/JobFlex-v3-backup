"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { createProject } from "@/actions/projects";
import { reportPlanLimit, ensureWithinLimit } from "@/stores/usePlanLimitStore";
import { UsageMeter } from "@/components/billing/UsageMeter";

export function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [status, setStatus] = React.useState<"ACTIVE" | "ON_HOLD" | "COMPLETED" | "ARCHIVED">("ACTIVE");
  const [startsAt, setStartsAt] = React.useState("");
  const [endsAt, setEndsAt] = React.useState("");
  const [budget, setBudget] = React.useState(0);
  const [busy, setBusy] = React.useState(false);

  async function save() {
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    setBusy(true);
    if (!(await ensureWithinLimit("projects"))) {
      setBusy(false);
      return;
    }
    try {
      const res = await createProject({
        name,
        description: description || null,
        status,
        startsAt: startsAt ? new Date(startsAt) : null,
        endsAt: endsAt ? new Date(endsAt) : null,
        budget,
      });
      toast.success("Project created");
      router.push(`/dashboard/projects/${res.id}` as any);
    } catch (err: any) {
      if (reportPlanLimit(err)) return;
      toast.error("Couldn't create", err?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Basics</CardTitle>
          <CardSubtitle>Name it now, attach jobs after.</CardSubtitle>
        </div>
      </CardHeader>
      <div className="space-y-4">
        <Input
          label="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Lakeside Heights — Phase 1"
        />
        <Textarea
          label="Description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this project covers, who it's for."
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Starts"
            type="date"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
          <Input
            label="Ends"
            type="date"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <option value="ACTIVE">Active</option>
            <option value="ON_HOLD">On hold</option>
            <option value="COMPLETED">Completed</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
          <Input
            label="Budget"
            type="number"
            step="100"
            prefix={<span className="text-[11px]">$</span>}
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value) || 0)}
          />
        </div>
      </div>
      <UsageMeter resource="projects" className="mt-5 max-w-full" />
      <div className="mt-3 flex gap-2">
        <Button loading={busy} onClick={save} icon={<Save className="h-3.5 w-3.5" />}>
          Create project
        </Button>
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
