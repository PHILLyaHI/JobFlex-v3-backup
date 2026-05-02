"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Check } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { shortDate } from "@/lib/format";
import { attachJob } from "@/actions/projects";

interface AvailableJob {
  id: string;
  title: string;
  status: string;
  startsAt: Date | null;
  clientName: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  availableJobs: AvailableJob[];
}

export function AssignJobDrawer({ open, onClose, projectId, availableJobs }: Props) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setPicked(new Set());
      setQuery("");
    }
  }, [open]);

  const filtered = availableJobs.filter((j) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      j.title.toLowerCase().includes(q) ||
      (j.clientName ?? "").toLowerCase().includes(q)
    );
  });

  function toggle(id: string) {
    setPicked((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function commit() {
    if (picked.size === 0) return;
    setBusy(true);
    try {
      for (const id of picked) {
        await attachJob(projectId, id);
      }
      toast.success(`Attached ${picked.size} job${picked.size === 1 ? "" : "s"}`);
      onClose();
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't attach", err?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Attach jobs"
      description="Add existing jobs to this project. They keep their schedules and assignments."
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-[color:var(--ink-muted)] tabular">
            {picked.size} selected
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={picked.size === 0}
              onClick={commit}
              icon={<Plus className="h-3.5 w-3.5" />}
            >
              Attach
            </Button>
          </div>
        </div>
      }
    >
      <Input
        placeholder="Search by job or client name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {filtered.length === 0 ? (
        <div className="text-[12px] text-[color:var(--ink-muted)] mt-6">
          No unassigned jobs available.
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {filtered.map((j) => {
            const on = picked.has(j.id);
            return (
              <li key={j.id}>
                <button
                  type="button"
                  onClick={() => toggle(j.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-[var(--r-md)] hairline transition-all flex items-center justify-between gap-3",
                    on
                      ? "bg-[color:var(--accent-soft)]/50 border-[color:var(--accent)]/30"
                      : "bg-white/40 hover:bg-white/60",
                  )}
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">
                      {j.title}
                    </div>
                    <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">
                      {j.clientName ?? "Unassigned"}
                      {j.startsAt && ` · ${shortDate(j.startsAt)}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge tone="neutral">{j.status.toLowerCase()}</Badge>
                    <span
                      className={cn(
                        "h-4 w-4 rounded-[4px] grid place-items-center transition-colors",
                        on
                          ? "bg-[color:var(--accent)] border-transparent"
                          : "bg-white hairline",
                      )}
                    >
                      {on && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
