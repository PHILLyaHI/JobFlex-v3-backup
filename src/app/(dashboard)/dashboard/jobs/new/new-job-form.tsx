"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { createJob } from "@/actions/jobs";

interface NewJobFormProps {
  clients: { id: string; name: string }[];
  proposals: { id: string; title: string; clientId: string | null }[];
}

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NewJobForm({ clients, proposals }: NewJobFormProps) {
  const router = useRouter();
  const inOneWeek = new Date();
  inOneWeek.setDate(inOneWeek.getDate() + 7);
  inOneWeek.setHours(9, 0, 0, 0);
  const inOneWeekEnd = new Date(inOneWeek);
  inOneWeekEnd.setHours(14, 0, 0, 0);

  const [title, setTitle] = React.useState("");
  const [clientId, setClientId] = React.useState("");
  const [proposalId, setProposalId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [startsAt, setStartsAt] = React.useState(toLocalInputValue(inOneWeek));
  const [endsAt, setEndsAt] = React.useState(toLocalInputValue(inOneWeekEnd));
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Missing title");
      return;
    }
    setBusy(true);
    try {
      const res = await createJob({
        title: title.trim(),
        clientId: clientId || null,
        proposalId: proposalId || null,
        notes: notes || null,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
      });
      toast.success("Job created");
      router.push(`/dashboard/jobs/${res.id}` as any);
    } catch (err: any) {
      toast.error("Couldn't create", err?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-5 max-w-4xl">
      <Card className="lg:col-span-2">
        <CardHeader>
          <div>
            <CardTitle>Job details</CardTitle>
            <CardSubtitle>What it's called and what it involves.</CardSubtitle>
          </div>
        </CardHeader>
        <div className="space-y-4">
          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Patel — Roof replacement install"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— None —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              label="Linked proposal"
              value={proposalId}
              onChange={(e) => {
                const id = e.target.value;
                setProposalId(id);
                const p = proposals.find((x) => x.id === id);
                if (p?.clientId) setClientId(p.clientId);
                if (p) setTitle((t) => t || p.title);
              }}
            >
              <option value="">— None —</option>
              {proposals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
          </div>
          <Textarea
            label="Notes"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Crew notes, materials delivery timing, access instructions…"
          />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Schedule</CardTitle>
            <CardSubtitle>Default is next week, 9am–2pm.</CardSubtitle>
          </div>
        </CardHeader>
        <div className="space-y-3">
          <Input
            label="Starts"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
          <Input
            label="Ends"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </div>
        <Button type="submit" loading={busy} className="w-full mt-5">
          Create job
        </Button>
      </Card>
    </form>
  );
}
