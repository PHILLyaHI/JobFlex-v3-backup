"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, Trash2, Save, Mail, Check, Sparkles, LayoutTemplate } from "lucide-react";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";
import { upsertEmailTemplate, deleteEmailTemplate } from "@/actions/emailTemplates";
import { renderTemplate } from "@/lib/email/render";
import { EMAIL_PRESETS, PRESET_PREVIEW_VARS, type EmailPreset } from "@/lib/email/presets";

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

Thanks for the opportunity. Here's the proposal we put together — totalling {{total}}.

Review and accept it online:
{{link}}

Let us know if you have any questions.

— {{org}}`,
  category: "proposal-send",
};

const VARS = ["client_name", "total", "link", "org", "title"];

export function EmailTemplateEditor({ templates, orgName }: EmailTemplateEditorProps) {
  const router = useRouter();
  const [activeId, setActiveId] = React.useState<string | null>(templates[0]?.id ?? null);
  const [draft, setDraft] = React.useState<EmailTemplateRow>(templates[0] ?? NEW_TEMPLATE);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState(false);
  const [presetOpen, setPresetOpen] = React.useState(false);

  const subjectRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  // Push content into contenteditable on mount
  React.useLayoutEffect(() => {
    if (subjectRef.current) subjectRef.current.innerText = draft.subject;
    if (bodyRef.current) bodyRef.current.innerText = draft.body;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push content into contenteditable when switching templates
  React.useEffect(() => {
    const t = templates.find((x) => x.id === activeId);
    const next = t ?? NEW_TEMPLATE;
    setDraft(next);
    setDirty(false);
    requestAnimationFrame(() => {
      if (subjectRef.current) subjectRef.current.innerText = next.subject;
      if (bodyRef.current) bodyRef.current.innerText = next.body;
    });
  }, [activeId, templates]);

  function patch(p: Partial<EmailTemplateRow>) {
    setDraft((d) => ({ ...d, ...p }));
    setDirty(true);
  }

  function applyPreset(p: EmailPreset) {
    setActiveId(null);
    const next = { id: "", name: p.name, subject: p.subject, body: p.body, category: p.category };
    setDraft(next);
    setDirty(true);
    setPresetOpen(false);
    requestAnimationFrame(() => {
      if (subjectRef.current) subjectRef.current.innerText = next.subject;
      if (bodyRef.current) bodyRef.current.innerText = next.body;
    });
  }

  // Insert variable token at cursor position inside the focused contenteditable
  function insertVar(name: string) {
    const token = `{{${name}}}`;
    const sel = window.getSelection();
    const active = document.activeElement;
    if (sel && sel.rangeCount > 0 && (active === bodyRef.current || active === subjectRef.current)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const node = document.createTextNode(token);
      range.insertNode(node);
      range.setStartAfter(node);
      range.setEndAfter(node);
      sel.removeAllRanges();
      sel.addRange(range);
      if (active === bodyRef.current && bodyRef.current) {
        patch({ body: bodyRef.current.innerText });
      } else if (active === subjectRef.current && subjectRef.current) {
        patch({ subject: subjectRef.current.innerText });
      }
    } else {
      // Fallback: append to body
      const updated = draft.body + token;
      patch({ body: updated });
      requestAnimationFrame(() => {
        if (bodyRef.current) bodyRef.current.innerText = updated;
      });
    }
  }

  async function save() {
    const subject = subjectRef.current?.innerText.trim() ?? draft.subject;
    const body = bodyRef.current?.innerText.trim() ?? draft.body;
    if (!draft.name.trim() || !subject || !body) {
      toast.error("Incomplete", "Name, subject, and body are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await upsertEmailTemplate({
        id: draft.id || undefined,
        name: draft.name.trim(),
        subject,
        body,
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
    const next = { ...NEW_TEMPLATE };
    setDraft(next);
    setDirty(true);
    requestAnimationFrame(() => {
      if (subjectRef.current) subjectRef.current.innerText = next.subject;
      if (bodyRef.current) bodyRef.current.innerText = next.body;
    });
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 items-start">
        {/* ── Sidebar: template list ── */}
        <aside className="paper-card p-0 overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-[color:var(--ink-line)]">
            <div className="quiet-caps">Templates</div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPresetOpen(true)}
                className="inline-flex items-center gap-1 rounded-[var(--r-sm)] px-2 h-7 text-[11px] font-medium text-[color:var(--accent-ink)] hover:bg-[color:var(--accent-soft)]"
              >
                <Sparkles className="h-3 w-3" />
                Presets
              </button>
              <button
                onClick={createNew}
                aria-label="New template"
                className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.04]"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="max-h-[620px] overflow-y-auto">
            {templates.length === 0 && (
              <div className="px-4 py-8 text-center text-[11px] text-[color:var(--ink-muted)]">
                No templates yet. Load a preset to get started.
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
                    <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">{t.name}</div>
                  </div>
                  <div className="flex items-center gap-1.5 pl-5">
                    {t.category && <Badge tone="neutral">{labelFor(t.category)}</Badge>}
                    <span className="text-[10px] text-[color:var(--ink-faint)] truncate">{t.subject}</span>
                  </div>
                </button>
              );
            })}
            {activeId === null && (
              <div className="relative px-4 py-3 border-b border-[color:var(--ink-line)] bg-[color:var(--accent-soft)]/60">
                <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-[color:var(--accent)]" />
                <div className="text-[13px] font-medium text-[color:var(--ink)]">New template</div>
              </div>
            )}
          </div>
        </aside>

        {/* ── Right: visual email editor ── */}
        <div className="space-y-3">
          {/* Metadata + actions row */}
          <div className="flex items-end gap-3">
            <div className="flex-1 grid grid-cols-2 gap-3">
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
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-0.5">
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
                Save
              </Button>
              {!dirty && draft.id && (
                <span className="inline-flex items-center gap-1 text-[11px] text-[color:var(--ink-muted)]">
                  <Check className="h-3 w-3" /> Saved
                </span>
              )}
              {dirty && <span className="text-[11px] text-amber-700">Unsaved</span>}
            </div>
          </div>

          {/* ── Visual email frame ── */}
          <div
            className="rounded-[var(--r-xl)] overflow-hidden"
            style={{ background: "#eeece8", boxShadow: "0 2px 16px rgba(0,0,0,0.08)" }}
          >
            {/* Envelope header — subject is editable here */}
            <div
              className="px-6 pt-5 pb-4 border-b border-black/[0.07]"
              style={{ background: "rgba(0,0,0,0.025)" }}
            >
              <div className="text-[10.5px] text-[color:var(--ink-muted)] mb-3">
                From:{" "}
                <span className="font-medium text-[color:var(--ink-soft)]">{orgName}</span>
                {" · "}via JobFlex
              </div>
              <div className="flex items-start gap-2.5">
                <span className="text-[10.5px] text-[color:var(--ink-muted)] mt-[5px] shrink-0 uppercase tracking-[0.06em] font-medium">
                  Subj
                </span>
                <div
                  ref={subjectRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={() => {
                    if (subjectRef.current) patch({ subject: subjectRef.current.innerText });
                  }}
                  className="flex-1 font-display text-[18px] leading-snug tracking-[-0.02em] text-[color:var(--ink)] outline-none cursor-text rounded-[var(--r-sm)] px-1.5 -mx-1.5 transition-colors focus:bg-white/50"
                />
              </div>
            </div>

            {/* Email card */}
            <div className="px-6 py-6">
              <div
                className="mx-auto overflow-hidden rounded-[var(--r-lg)]"
                style={{
                  maxWidth: 520,
                  background: "#ffffff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
                }}
              >
                {/* Sage header band */}
                <div
                  className="px-10 py-6 text-center"
                  style={{ background: "var(--accent)" }}
                >
                  <div
                    className="text-white/50 text-[9px] font-semibold tracking-[0.2em] mb-1.5"
                    style={{ textTransform: "uppercase" }}
                  >
                    message from
                  </div>
                  <div className="text-white font-display text-[22px] tracking-[-0.02em]">
                    {orgName}
                  </div>
                </div>

                {/* Editable body */}
                <div className="px-10 py-8 relative group">
                  <div
                    ref={bodyRef}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={() => {
                      if (bodyRef.current) patch({ body: bodyRef.current.innerText });
                    }}
                    className="min-h-[160px] text-[14px] leading-[1.8] text-[color:var(--ink-soft)] outline-none whitespace-pre-wrap cursor-text"
                  />
                  {!draft.body && (
                    <div className="absolute inset-0 px-10 py-8 pointer-events-none text-[14px] leading-[1.8] text-[color:var(--ink-faint)]">
                      {`Hi {{client_name}},\n\nWrite your message here...`}
                    </div>
                  )}
                  <div className="absolute top-3 right-3 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <span
                      className="text-[9px] font-semibold tracking-[0.08em] px-1.5 py-0.5 rounded text-[color:var(--accent-ink)]"
                      style={{ background: "var(--accent-soft)", textTransform: "uppercase" }}
                    >
                      Editing
                    </span>
                  </div>
                </div>

                {/* Footer */}
                <div
                  className="px-10 py-4 text-center border-t border-[color:var(--ink-line)]"
                  style={{ background: "#f6f5f3" }}
                >
                  <div
                    className="text-[9px] text-[color:var(--ink-faint)] font-medium tracking-[0.14em]"
                    style={{ textTransform: "uppercase" }}
                  >
                    JOBFLEX · Professional proposals made simple
                  </div>
                </div>
              </div>
            </div>

            {/* Variable insertion chips */}
            <div className="px-6 pb-5 flex flex-wrap items-center gap-2">
              <span
                className="text-[9.5px] text-[color:var(--ink-muted)] font-semibold tracking-[0.08em]"
                style={{ textTransform: "uppercase" }}
              >
                Insert:
              </span>
              {VARS.map((v) => (
                <button
                  key={v}
                  // preventDefault keeps focus in the contenteditable
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertVar(v);
                  }}
                  className="font-mono text-[10.5px] px-2 py-0.5 rounded-[var(--r-sm)] bg-white/70 hairline text-[color:var(--ink-soft)] hover:bg-[color:var(--accent-soft)] hover:text-[color:var(--accent-ink)] transition-colors"
                >
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Dialogs ── */}
      <Dialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title="Delete this template?"
        description="Future automations that reference it will fall back to the default reminder copy."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDel(false)}>Cancel</Button>
            <Button variant="danger" onClick={remove}>Delete</Button>
          </>
        }
      >
        <div />
      </Dialog>

      <Dialog
        open={presetOpen}
        onClose={() => setPresetOpen(false)}
        title="Start from a preset"
        description="Pick a starter with ready-made copy, then click into the email to edit it."
        footer={<Button variant="ghost" onClick={() => setPresetOpen(false)}>Close</Button>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {EMAIL_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p)}
              className="group text-left rounded-[var(--r-lg)] hairline bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-pop focus-ring"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-display text-[15px] tracking-[-0.01em]">
                  <LayoutTemplate className="h-3.5 w-3.5 text-[color:var(--accent)]" />
                  {p.name}
                </div>
                <Badge tone="neutral">{labelFor(p.category)}</Badge>
              </div>
              <div className="mt-1 text-[11px] leading-relaxed text-[color:var(--ink-muted)]">
                {p.description}
              </div>
              <div className="mt-3 rounded-[var(--r-md)] bg-[color:var(--paper-deep)] p-3">
                <div className="text-[12px] font-medium text-[color:var(--ink)]">
                  {renderTemplate(p.subject, PRESET_PREVIEW_VARS)}
                </div>
                <div className="mt-1 line-clamp-3 whitespace-pre-wrap text-[11px] leading-relaxed text-[color:var(--ink-soft)]">
                  {renderTemplate(p.body, PRESET_PREVIEW_VARS)}
                </div>
              </div>
              <div className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--accent-ink)] opacity-0 transition-opacity group-hover:opacity-100">
                Use this →
              </div>
            </button>
          ))}
        </div>
      </Dialog>
    </>
  );
}

function labelFor(cat: string) {
  const m = CATEGORIES.find((c) => c.value === cat);
  return m?.label ?? cat;
}
