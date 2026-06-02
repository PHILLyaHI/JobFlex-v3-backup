"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Save, Mail, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toast";
import {
  upsertEmailTemplate,
  deleteEmailTemplate,
} from "@/actions/emailTemplates";
import { renderTemplate } from "@/lib/email/render";

export interface EmailTemplateRow {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string | null;
}

interface EmailTemplateEditorProps {
  templates: EmailTemplateRow[];
  orgName: string;
}

const CATEGORIES = [
  { value: "", label: "Uncategorized" },
  { value: "proposal-send", label: "Proposal sent" },
  { value: "thank-you", label: "Thank you" },
  { value: "reminder", label: "Reminder" },
  { value: "welcome", label: "Welcome" },
  { value: "custom", label: "Custom" },
];

const NEW_TEMPLATE: EmailTemplateRow = {
  id: "",
  name: "Untitled template",
  subject: "Your proposal from {{org}}",
  body: `Hi {{client_name}},

Thanks for meeting with us. Here's the proposal we put together for your project — {{total}} in total.

View the full details and accept online:
{{link}}

Let us know if you have any questions.

— {{org}}`,
  category: "proposal-send",
};

const DEMO_VARS = {
  client_name: "Rohan Patel",
  total: "$18,444",
  link: "https://jobflex.app/portal/q/abc123",
  org: "Acme Contracting",
};

export function EmailTemplateEditor({ templates, orgName }: EmailTemplateEditorProps) {
  const router = useRouter();
  const [activeId, setActiveId] = React.useState<string | null>(templates[0]?.id ?? null);
  const [draft, setDraft] = React.useState<EmailTemplateRow>(
    templates[0] ?? NEW_TEMPLATE,
  );
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState(false);

  React.useEffect(() => {
    const t = templates.find((x) => x.id === activeId);
    setDraft(t ?? NEW_TEMPLATE);
    setDirty(false);
  }, [activeId, templates]);

  function patch(p: Partial<EmailTemplateRow>) {
    setDraft((d) => ({ ...d, ...p }));
    setDirty(true);
  }

  async function save() {
    if (!draft.name.trim() || !draft.subject.trim() || !draft.body.trim()) {
      toast.error("Incomplete", "Name, subject, and body are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await upsertEmailTemplate({
        id: draft.id || undefined,
        name: draft.name.trim(),
        subject: draft.subject.trim(),
        body: draft.body,
        category: draft.category,
      });
      toast.success("Saved");
      setDirty(false);
      router.refresh();
      setActiveId(res.id);
    } catch (err: any) {
      toast.error("Save failed", err?.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!draft.id) {
      setConfirmDel(false);
      setActiveId(templates[0]?.id ?? null);
      return;
    }
    try {
      await deleteEmailTemplate(draft.id);
      toast.success("Deleted");
      setConfirmDel(false);
      router.refresh();
      setActiveId(templates.find((t) => t.id !== draft.id)?.id ?? null);
    } catch (err: any) {
      toast.error("Delete failed", err?.message);
    }
  }

  function createNew() {
    setActiveId(null);
    setDraft({ ...NEW_TEMPLATE });
    setDirty(true);
  }

  const renderedSubject = renderTemplate(draft.subject, { ...DEMO_VARS, org: orgName });
  const renderedBody = renderTemplate(draft.body, { ...DEMO_VARS, org: orgName });

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 items-start">
        <aside className="paper-card p-0 overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-[color:var(--ink-line)]">
            <div className="quiet-caps">Templates</div>
            <button
              onClick={createNew}
              aria-label="New template"
              className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.04]"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="max-h-[620px] overflow-y-auto">
            {templates.length === 0 && (
              <div className="px-4 py-8 text-center text-[11px] text-[color:var(--ink-muted)]">
                No templates yet.
              </div>
            )}
            {templates.map((t) => {
              const active = activeId === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  className={cn(
                    "relative w-full text-left px-4 py-3 border-b border-[color:var(--ink-line)] last:border-0 transition-colors flex flex-col gap-1",
                    active ? "bg-[color:var(--accent-soft)]/60" : "hover:bg-black/[0.02]",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="tpl-active"
                      className="absolute left-0 top-0 bottom-0 w-[3px] bg-[color:var(--accent)]"
                    />
                  )}
                  <div className="flex items-center gap-2 min-w-0">
                    <Mail className="h-3 w-3 text-[color:var(--ink-muted)] shrink-0" />
                    <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">
                      {t.name}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 pl-5">
                    {t.category && <Badge tone="neutral">{labelFor(t.category)}</Badge>}
                    <span className="text-[10px] text-[color:var(--ink-faint)] truncate">
                      {t.subject}
                    </span>
                  </div>
                </button>
              );
            })}
            {!templates.find((t) => t.id === activeId) && activeId === null && (
              <div className="relative px-4 py-3 border-b border-[color:var(--ink-line)] bg-[color:var(--accent-soft)]/60">
                <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-[color:var(--accent)]" />
                <div className="text-[13px] font-medium text-[color:var(--ink)]">
                  New template
                </div>
              </div>
            )}
          </div>
        </aside>

        <Card>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Name"
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
              <Select
                label="Category"
                value={draft.category ?? ""}
                onChange={(e) => patch({ category: e.target.value || null })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Input
                label="Subject"
                value={draft.subject}
                onChange={(e) => patch({ subject: e.target.value })}
              />
              <div className="text-[10.5px] text-[color:var(--ink-muted)] mt-1 pl-0.5">
                Variables available:{" "}
                {["client_name", "total", "link", "org"].map((v, i, arr) => (
                  <React.Fragment key={v}>
                    <code className="font-mono text-[10px] text-[color:var(--ink-soft)]">
                      {"{{" + v + "}}"}
                    </code>
                    {i < arr.length - 1 ? " · " : ""}
                  </React.Fragment>
                ))}
              </div>
            </div>
            <div>
              <div className="quiet-caps mb-1.5">Body</div>
              <div className="rounded-[var(--r-md)] bg-white/60 dark:bg-white/[0.03] hairline">
                <textarea
                  value={draft.body}
                  onChange={(e) => patch({ body: e.target.value })}
                  rows={12}
                  className="w-full bg-transparent outline-none text-[12.5px] font-mono leading-relaxed text-[color:var(--ink-soft)] p-3 resize-y"
                />
              </div>
            </div>

            <div className="pt-5 border-t border-[color:var(--ink-line)]">
              <div className="quiet-caps mb-3">Preview · with demo variables</div>
              <div className="rounded-[var(--r-lg)] hairline bg-white dark:bg-white/[0.02] overflow-hidden">
                <div
                  className="px-5 py-3 border-b border-[color:var(--ink-line)]"
                  style={{
                    background:
                      "linear-gradient(90deg, rgba(31,122,82,0.05), rgba(200,148,80,0.03) 50%, transparent)",
                  }}
                >
                  <div className="flex items-center gap-2 text-[11px] text-[color:var(--ink-muted)]">
                    <span className="font-medium text-[color:var(--ink-soft)]">From</span>
                    <span>{orgName} via JobFlex</span>
                  </div>
                  <div className="mt-1 font-display text-[17px] tracking-[-0.01em] text-[color:var(--ink)]">
                    {renderedSubject}
                  </div>
                </div>
                <div className="px-5 py-5 text-[13px] leading-relaxed text-[color:var(--ink-soft)] whitespace-pre-wrap">
                  {renderedBody}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[color:var(--ink-line)] flex items-center justify-between">
              <div className="text-[11px] text-[color:var(--ink-muted)]">
                {dirty ? (
                  <span className="text-amber-700">Unsaved changes</span>
                ) : draft.id ? (
                  <span className="inline-flex items-center gap-1">
                    <Check className="h-3 w-3" /> Saved
                  </span>
                ) : (
                  "New template"
                )}
              </div>
              <div className="flex items-center gap-2">
                {draft.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDel(true)}
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    className="!text-rose-700 hover:!bg-rose-50"
                  >
                    Delete
                  </Button>
                )}
                <Button
                  onClick={save}
                  loading={saving}
                  disabled={!dirty}
                  icon={<Save className="h-3.5 w-3.5" />}
                >
                  Save template
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Dialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title="Delete this template?"
        description="It won't affect emails already sent, but future automations referencing it will skip the email."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDel(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={remove}>
              Delete
            </Button>
          </>
        }
      >
        <div />
      </Dialog>
    </>
  );
}

function labelFor(cat: string) {
  const m = CATEGORIES.find((c) => c.value === cat);
  return m?.label ?? cat;
}
