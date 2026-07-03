"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { StyledSelect } from "@/components/ui/StyledSelect";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { Avatar } from "@/components/ui/Avatar";
import { X } from "lucide-react";
import { ClientPicker } from "@/components/clients/ClientPicker";
import { DateTimePicker } from "@/components/v3/calendar-a/DateTimePicker";
import { createJob } from "@/actions/jobs";
import { reportPlanLimit, ensureWithinLimit } from "@/stores/usePlanLimitStore";
import { UsageMeter } from "@/components/billing/UsageMeter";

interface NewJobFormProps {
  clients: { id: string; name: string; email: string | null }[];
  proposals: { id: string; title: string; clientId: string | null; scopeOfWork: string | null }[];
  workers: { id: string; displayName: string }[];
}

const HOUR = 60 * 60 * 1000;

export function NewJobForm({ clients, proposals, workers }: NewJobFormProps) {
  const router = useRouter();
  const defaults = React.useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() + 7);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start);
    end.setHours(14, 0, 0, 0);
    return { start, end };
  }, []);

  const [title, setTitle] = React.useState("");
  const [clientId, setClientId] = React.useState("");
  const [proposalId, setProposalId] = React.useState("");
  const [scopeOfWork, setScopeOfWork] = React.useState("");
  const [startsAt, setStartsAt] = React.useState<Date>(defaults.start);
  const [endsAt, setEndsAt] = React.useState<Date>(defaults.end);
  const [workerIds, setWorkerIds] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);

  // Keep the span sane: moving Starts past Ends drags Ends along by the prior
  // duration; pulling Ends before Starts clamps it to a one-hour minimum.
  function updateStarts(next: Date) {
    const span = Math.max(HOUR, endsAt.getTime() - startsAt.getTime());
    setStartsAt(next);
    if (next.getTime() >= endsAt.getTime()) setEndsAt(new Date(next.getTime() + span));
  }
  function updateEnds(next: Date) {
    if (next.getTime() <= startsAt.getTime()) {
      setEndsAt(new Date(startsAt.getTime() + HOUR));
      return;
    }
    setEndsAt(next);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Missing title");
      return;
    }
    setBusy(true);
    // Pre-flight the plan limit so the upgrade dialog fires reliably (dev + prod).
    if (!(await ensureWithinLimit("jobs"))) {
      setBusy(false);
      return;
    }
    try {
      const res = await createJob({
        title: title.trim(),
        clientId: clientId || null,
        proposalId: proposalId || null,
        scopeOfWork: scopeOfWork || null,
        startsAt,
        endsAt,
        workerIds,
      });
      toast.success("Job created");
      router.push(`/dashboard/jobs/${res.id}` as any);
    } catch (err: any) {
      if (reportPlanLimit(err)) return;
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
            <ClientPicker label="Client" clients={clients} value={clientId} onChange={setClientId} />
            <StyledSelect
              label="Linked proposal"
              value={proposalId}
              onChange={(id) => {
                setProposalId(id);
                const p = proposals.find((x) => x.id === id);
                if (p?.clientId) setClientId(p.clientId);
                if (p) setTitle((t) => t || p.title);
                // Auto-fill Scope of Work from the linked proposal — empty when none.
                setScopeOfWork(p?.scopeOfWork ?? "");
              }}
              options={proposals.map((p) => ({ id: p.id, label: p.title }))}
              placeholder="— None —"
              noneLabel="— None —"
              searchPlaceholder="Search proposals…"
              emptyText="No proposals yet."
            />
          </div>
          <Textarea
            label="Scope of work"
            rows={5}
            value={scopeOfWork}
            onChange={(e) => setScopeOfWork(e.target.value)}
            placeholder="What the crew will do on site. Auto-filled from the linked proposal."
          />

          <div>
            <div className="quiet-caps mb-1.5 text-[color:var(--ink-faint)]">Crew</div>
            {workers.length === 0 ? (
              <p className="text-[12px] text-[color:var(--ink-muted)]">
                No crew yet. Add workers on the Team page, then assign them here.
              </p>
            ) : (
              <>
                <StyledSelect
                  value=""
                  onChange={(id) => {
                    if (id) setWorkerIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
                  }}
                  options={workers
                    .filter((w) => !workerIds.includes(w.id))
                    .map((w) => ({ id: w.id, label: w.displayName }))}
                  avatars
                  noneLabel={null}
                  placeholder={workerIds.length ? "Add another crew member…" : "Assign crew (optional)…"}
                  searchPlaceholder="Search crew…"
                  emptyText="Everyone's already assigned."
                />
                {workerIds.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {workerIds.map((id) => {
                      const w = workers.find((x) => x.id === id);
                      if (!w) return null;
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1.5 h-8 pl-1.5 pr-1 rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)] text-[12px] font-medium"
                        >
                          <Avatar name={w.displayName} size={20} />
                          {w.displayName}
                          <button
                            type="button"
                            aria-label={`Remove ${w.displayName}`}
                            onClick={() => setWorkerIds((prev) => prev.filter((x) => x !== id))}
                            className="grid h-5 w-5 place-items-center rounded-full hover:bg-black/[0.08]"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
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
          <DateTimePicker
            label="Starts"
            value={startsAt}
            onChange={updateStarts}
            fallbackDate={defaults.start}
            iconButton
          />
          <DateTimePicker
            label="Ends"
            value={endsAt}
            onChange={updateEnds}
            fallbackDate={defaults.end}
            iconButton
          />
        </div>
        <div className="mt-5">
          <UsageMeter resource="jobs" className="mb-3 max-w-full" />
          <Button type="submit" loading={busy} className="w-full">
            Create job
          </Button>
        </div>
      </Card>
    </form>
  );
}
