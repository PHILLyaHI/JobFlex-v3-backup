"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Play } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";
import {
  setFollowUpRuleEnabled,
  deleteFollowUpRule,
  runFollowUpNow,
} from "@/actions/followUps";
import { cn } from "@/lib/cn";
import { relative } from "@/lib/format";

export interface FollowUpRuleRow {
  id: string;
  name: string;
  triggerStatus: string;
  delayMinutes: number;
  enabled: boolean;
  templateName: string | null;
}

export interface PendingFollowUp {
  id: string;
  proposalTitle: string | null;
  runAt: Date;
  note: string | null;
}

interface FollowUpRulesTableProps {
  rules: FollowUpRuleRow[];
  pending: PendingFollowUp[];
  onEdit: (ruleId: string) => void;
}

export function FollowUpRulesTable({ rules, pending, onEdit }: FollowUpRulesTableProps) {
  const router = useRouter();
  const [confirmDel, setConfirmDel] = React.useState<FollowUpRuleRow | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function toggle(rule: FollowUpRuleRow) {
    try {
      setBusy(rule.id);
      await setFollowUpRuleEnabled(rule.id, !rule.enabled);
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't update", err?.message);
    } finally {
      setBusy(null);
    }
  }

  async function doDelete() {
    if (!confirmDel) return;
    try {
      await deleteFollowUpRule(confirmDel.id);
      setConfirmDel(null);
      toast.success("Rule removed");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't delete", err?.message);
    }
  }

  async function runNow(followUpId: string) {
    try {
      setBusy(followUpId);
      await runFollowUpNow(followUpId);
      toast.success("Dispatched");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't dispatch", err?.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="paper-card overflow-hidden">
        {rules.length === 0 ? (
          <div className="p-10 text-center text-[12px] text-[color:var(--ink-muted)]">
            No follow-up rules yet. Create one to automate reminders.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[color:var(--ink-line)]">
                <th className="quiet-caps text-left px-5 py-3">Rule</th>
                <th className="quiet-caps text-left px-5 py-3">Trigger</th>
                <th className="quiet-caps text-left px-5 py-3">Template</th>
                <th className="quiet-caps text-right px-5 py-3 w-[220px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-[color:var(--ink-line)] last:border-0 hover:bg-black/[0.015] transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <div className="text-[13px] font-medium text-[color:var(--ink)]">{r.name}</div>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge tone="accent">{formatTrigger(r.triggerStatus, r.delayMinutes)}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-[12.5px] text-[color:var(--ink-soft)]">
                    {r.templateName ?? (
                      <span className="text-[color:var(--ink-faint)]">— no template —</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Switch
                        enabled={r.enabled}
                        onToggle={() => toggle(r)}
                        busy={busy === r.id}
                      />
                      <button
                        onClick={() => onEdit(r.id)}
                        aria-label="Edit rule"
                        className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.05]"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => setConfirmDel(r)}
                        aria-label="Delete rule"
                        className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-rose-50 hover:text-rose-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-6 paper-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="quiet-caps">Pending queue</div>
          <span className="text-[11px] text-[color:var(--ink-muted)] tabular">{pending.length}</span>
        </div>
        {pending.length === 0 ? (
          <p className="text-[12px] text-[color:var(--ink-muted)]">Nothing scheduled right now.</p>
        ) : (
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {pending.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">
                    {p.proposalTitle ?? "Follow-up"}
                  </div>
                  <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">
                    Runs {relative(p.runAt)}
                    {p.note ? ` · ${p.note}` : ""}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  loading={busy === p.id}
                  icon={<Play className="h-3 w-3" />}
                  onClick={() => runNow(p.id)}
                >
                  Run now
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title={`Delete "${confirmDel?.name}"?`}
        description="Pending follow-ups scheduled under this rule will stay until their run time (or you can clear the queue manually)."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDel(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={doDelete}>
              Delete rule
            </Button>
          </>
        }
      >
        <div />
      </Dialog>
    </>
  );
}

function formatTrigger(status: string, minutes: number) {
  let label: string;
  if (minutes < 60) label = `${minutes}m`;
  else if (minutes < 60 * 24) label = `${Math.round(minutes / 60)}h`;
  else label = `${Math.round(minutes / 60 / 24)}d`;
  return `${status} + ${label}`;
}

function Switch({
  enabled,
  onToggle,
  busy,
}: {
  enabled: boolean;
  onToggle: () => void;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={busy}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-5 w-9 rounded-full transition-colors shrink-0",
        enabled ? "bg-[color:var(--accent)]" : "bg-[color:var(--ink-line)]",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
          enabled ? "left-[18px]" : "left-0.5",
        )}
      />
    </button>
  );
}
