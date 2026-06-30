"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Save, Trash2, Workflow } from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/settings/Toggle";
import { toast } from "@/components/ui/Toast";
import {
  upsertFollowUpRule,
  setFollowUpRuleEnabled,
  deleteFollowUpRule,
} from "@/actions/followUps";

export interface RuleRow {
  id: string;
  name: string;
  triggerStatus: string;
  delayMinutes: number;
  enabled: boolean;
  template: string | null;
}

const TRIGGER_OPTIONS = [
  { value: "SENT", label: "Proposal sent" },
  { value: "VIEWED", label: "Proposal viewed" },
  { value: "ACCEPTED", label: "Proposal accepted" },
  { value: "PAID", label: "Proposal paid" },
  { value: "DECLINED", label: "Proposal declined" },
];

export function FollowUpRulesEditor({ rules }: { rules: RuleRow[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<RuleRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  async function toggle(id: string, next: boolean) {
    setBusy(id);
    try {
      await setFollowUpRuleEnabled(id, next);
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't update", err?.message);
    } finally {
      setBusy(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setBusy(pendingDelete.id);
    try {
      await deleteFollowUpRule(pendingDelete.id);
      toast.success("Rule deleted");
      setPendingDelete(null);
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't delete", err?.message);
    } finally {
      setDeleting(false);
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Follow-up rules</CardTitle>
          <CardSubtitle>
            Auto-schedule a follow-up when a proposal hits a status. Variables like{" "}
            <code className="font-mono text-[10.5px]">{"{{client_name}}"}</code> and{" "}
            <code className="font-mono text-[10.5px]">{"{{link}}"}</code> are substituted at send.
          </CardSubtitle>
        </div>
        <Button
          size="sm"
          variant="outline"
          icon={<Plus className="h-3.5 w-3.5" />}
          onClick={() => {
            setCreating(true);
            setEditingId(null);
          }}
        >
          New rule
        </Button>
      </CardHeader>

      {rules.length === 0 && !creating && (
        <div className="paper-card !shadow-none p-6 text-center">
          <Workflow className="h-5 w-5 text-[color:var(--ink-faint)] mx-auto mb-2" />
          <div className="text-[12.5px] font-medium text-[color:var(--ink)]">
            No rules yet
          </div>
          <div className="text-[11px] text-[color:var(--ink-muted)] mt-1">
            Create one to start automating reminders.
          </div>
        </div>
      )}

      <AnimatePresence>
        {creating && (
          <RuleForm
            key="new"
            rule={null}
            onCancel={() => setCreating(false)}
            onSaved={() => {
              setCreating(false);
              router.refresh();
            }}
          />
        )}
      </AnimatePresence>

      <ul className="divide-y divide-[color:var(--ink-line)]">
        <AnimatePresence initial={false}>
          {rules.map((r) => (
            <motion.li
              key={r.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-4"
            >
              {editingId === r.id ? (
                <RuleForm
                  rule={r}
                  onCancel={() => setEditingId(null)}
                  onSaved={() => {
                    setEditingId(null);
                    router.refresh();
                  }}
                />
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[color:var(--ink)]">{r.name}</span>
                      <Badge tone={r.enabled ? "success" : "neutral"} dot>
                        {r.enabled ? "active" : "off"}
                      </Badge>
                    </div>
                    <div className="text-[11.5px] text-[color:var(--ink-muted)] mt-1.5 tabular">
                      Trigger:{" "}
                      <span className="text-[color:var(--ink-soft)]">{r.triggerStatus}</span> · Delay:{" "}
                      <span className="text-[color:var(--ink-soft)]">
                        {humanDelay(r.delayMinutes)}
                      </span>
                    </div>
                    {r.template && (
                      <div className="text-[10.5px] text-[color:var(--ink-muted)] mt-1">
                        Template: <code className="font-mono">{r.template}</code>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Toggle
                      checked={r.enabled}
                      onChange={(v) => toggle(r.id, v)}
                      disabled={busy === r.id}
                    />
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(r.id)}>
                      Edit
                    </Button>
                    <button
                      type="button"
                      disabled={busy === r.id}
                      onClick={() => setPendingDelete(r)}
                      aria-label="Delete rule"
                      className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <Dialog
        open={!!pendingDelete}
        onClose={() => { if (!deleting) setPendingDelete(null); }}
        title="Delete rule?"
        description={
          pendingDelete
            ? `"${pendingDelete.name}" will be removed. Existing scheduled follow-ups will keep running.`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleting} onClick={confirmDelete}>
              Delete rule
            </Button>
          </>
        }
      />
    </Card>
  );
}

function humanDelay(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 60 / 24)}d`;
}

function RuleForm({
  rule,
  onCancel,
  onSaved,
}: {
  rule: RuleRow | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState(rule?.name ?? "");
  const [trigger, setTrigger] = React.useState(rule?.triggerStatus ?? "SENT");
  const [delayDays, setDelayDays] = React.useState(
    rule ? Math.max(1, Math.round(rule.delayMinutes / 60 / 24)) : 2,
  );
  const [enabled, setEnabled] = React.useState(rule?.enabled ?? true);
  const [template, setTemplate] = React.useState(rule?.template ?? "");
  const [busy, setBusy] = React.useState(false);

  async function save() {
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    setBusy(true);
    try {
      await upsertFollowUpRule({
        id: rule?.id,
        name,
        triggerStatus: trigger,
        delayMinutes: delayDays * 60 * 24,
        enabled,
        templateId: template.trim() || null,
      });
      toast.success(rule ? "Rule updated" : "Rule created");
      onSaved();
    } catch (err: any) {
      toast.error("Couldn't save", err?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
    >
      <div className="paper-card !shadow-none p-4 my-2 border-l-[3px] border-l-[color:var(--accent)]">
        <div className="grid md:grid-cols-12 gap-3">
          <div className="md:col-span-5">
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Day-2 nudge"
            />
          </div>
          <div className="md:col-span-4">
            <Select label="Trigger" value={trigger} onChange={(e) => setTrigger(e.target.value)}>
              {TRIGGER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="md:col-span-3">
            <Input
              label="Delay (days)"
              type="number"
              min={1}
              value={delayDays}
              onChange={(e) => setDelayDays(Math.max(1, Number(e.target.value) || 1))}
              hint="From the trigger event"
            />
          </div>
          <div className="md:col-span-12">
            <Input
              label="Template ID"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="(optional) link to a saved EmailTemplate"
              hint="Leave blank to use the default reminder template."
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <Toggle
            checked={enabled}
            onChange={setEnabled}
            label="Active"
            description="Inactive rules don't schedule new follow-ups."
          />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy} icon={<Save className="h-3.5 w-3.5" />}>
              {rule ? "Save changes" : "Create rule"}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
