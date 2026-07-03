"use client";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  SquarePen,
  Mail,
  Upload,
  Megaphone,
  Plus,
  Trash2,
  ArrowRight,
  FileText,
  Lock,
} from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { type ImportLeadPayload, sourceLabel } from "./leads-shared";

type Method = "manual" | "email" | "file";

interface StagedLead {
  tempId: string;
  name: string;
  email: string | null;
  phone: string | null;
  projectType: string | null;
  description: string | null;
  source: string; // MANUAL | EMAIL | IMPORT
}

interface Props {
  /** Persists staged leads as real NEW-status rows via the importLeads server action, then refreshes. */
  onTransfer: (leads: ImportLeadPayload[]) => Promise<void>;
}

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `imp_${Date.now()}_${Math.round(Math.random() * 1e6)}`;
}

// --- lightweight parsing heuristics (no server round-trip) -------------------
function extractEmail(text: string): string | null {
  return text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? null;
}
function extractPhone(text: string): string | null {
  const m = text.match(/(\+?\d[\d\s().-]{7,}\d)/);
  return m ? m[0].trim() : null;
}
function guessName(text: string, email: string | null): string {
  const fromLine = text.match(/^\s*(?:from|name)\s*:\s*([^<\n]+)/im);
  if (fromLine) return fromLine[1].trim();
  const firstLine = text.split("\n").map((l) => l.trim()).find(Boolean);
  if (firstLine && !firstLine.includes("@") && firstLine.length <= 60) return firstLine;
  if (email) {
    return email
      .split("@")[0]
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return "Unknown sender";
}

// Split a CSV line respecting simple double-quoted fields.
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (ch === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function parseCsv(text: string): StagedLead[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const first = splitCsvLine(lines[0]).map((c) => c.toLowerCase());
  const hasHeader = first.some((c) => /name|email|phone|project|description/.test(c));
  const idx = {
    name: hasHeader ? first.findIndex((c) => c.includes("name")) : 0,
    email: hasHeader ? first.findIndex((c) => c.includes("email")) : 1,
    phone: hasHeader ? first.findIndex((c) => c.includes("phone")) : 2,
    project: hasHeader ? first.findIndex((c) => c.includes("project")) : 3,
    description: hasHeader ? first.findIndex((c) => c.includes("desc")) : 4,
  };
  const rows = hasHeader ? lines.slice(1) : lines;
  const pick = (cells: string[], i: number) => (i >= 0 && cells[i] ? cells[i] : null);
  return rows
    .map((line) => splitCsvLine(line))
    .filter((cells) => cells.some(Boolean))
    .map((cells) => ({
      tempId: uid(),
      name: pick(cells, idx.name) ?? "Unnamed lead",
      email: pick(cells, idx.email),
      phone: pick(cells, idx.phone),
      projectType: pick(cells, idx.project),
      description: pick(cells, idx.description),
      source: "IMPORT",
    }));
}

const METHODS: { key: Method; label: string; icon: React.ReactNode }[] = [
  { key: "manual", label: "Manual entry", icon: <SquarePen className="h-4 w-4" /> },
  { key: "email", label: "Paste email", icon: <Mail className="h-4 w-4" /> },
  { key: "file", label: "Upload file", icon: <Upload className="h-4 w-4" /> },
];

export function ImportLeads({ onTransfer }: Props) {
  const [method, setMethod] = React.useState<Method>("manual");
  const [staged, setStaged] = React.useState<StagedLead[]>([]);
  const [transferring, setTransferring] = React.useState(false);

  function addStaged(...leads: StagedLead[]) {
    setStaged((prev) => [...leads, ...prev]);
  }
  function removeStaged(tempId: string) {
    setStaged((prev) => prev.filter((s) => s.tempId !== tempId));
  }

  async function transfer() {
    if (staged.length === 0 || transferring) return;
    const payload: ImportLeadPayload[] = staged.map((s) => ({
      name: s.name,
      email: s.email,
      phone: s.phone,
      projectType: s.projectType,
      description: s.description,
      source: s.source,
    }));
    const n = payload.length;
    setTransferring(true);
    try {
      await onTransfer(payload);
      setStaged([]);
      toast.success(
        `Transferred ${n} lead${n === 1 ? "" : "s"}`,
        "They're in All Leads and Incoming now, ready to route.",
      );
    } catch (err: unknown) {
      toast.error("Couldn't transfer leads", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setTransferring(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
      {/* Left: source picker + active input */}
      <div className="space-y-5">
        <div>
          <div className="quiet-caps mb-2.5">Bring leads in from</div>
          <div className="flex flex-wrap gap-2">
            {METHODS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMethod(m.key)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-[var(--r-md)] px-3.5 h-10 text-[13px] font-medium transition-all",
                  method === m.key
                    ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)] hairline"
                    : "text-[color:var(--ink-soft)] hairline hover:bg-black/[0.03]",
                )}
              >
                <span className="opacity-80">{m.icon}</span>
                {m.label}
              </button>
            ))}
            {/* Facebook — scaffolded, lands later */}
            <div
              className="inline-flex items-center gap-2 rounded-[var(--r-md)] px-3.5 h-10 text-[13px] font-medium text-[color:var(--ink-faint)] hairline opacity-70 cursor-not-allowed"
              title="Facebook Lead Ads import is coming soon"
              aria-disabled
            >
              <Megaphone className="h-4 w-4" />
              Facebook
              <Badge tone="neutral" className="ml-0.5">
                <Lock className="h-2.5 w-2.5" /> Soon
              </Badge>
            </div>
          </div>
        </div>

        <div className="paper-card p-5">
          {method === "manual" && <ManualForm onAdd={addStaged} />}
          {method === "email" && <EmailPaste onAdd={addStaged} />}
          {method === "file" && <FileImport onAdd={addStaged} />}
        </div>
      </div>

      {/* Right: staging tray */}
      <ImportTray staged={staged} onRemove={removeStaged} onTransfer={transfer} transferring={transferring} />
    </div>
  );
}

// --- Manual entry -----------------------------------------------------------
function ManualForm({ onAdd }: { onAdd: (lead: StagedLead) => void }) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [projectType, setProjectType] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  const valid = name.trim().length > 0;

  function add() {
    if (!valid) {
      setTouched(true);
      return;
    }
    onAdd({
      tempId: uid(),
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      projectType: projectType.trim() || null,
      description: description.trim() || null,
      source: "MANUAL",
    });
    setName("");
    setEmail("");
    setPhone("");
    setProjectType("");
    setDescription("");
    setTouched(false);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Name"
          placeholder="Jordan Avery"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={touched && !valid ? "A name is required" : undefined}
        />
        <Input
          label="Project type"
          placeholder="Kitchen remodel"
          value={projectType}
          onChange={(e) => setProjectType(e.target.value)}
        />
        <Input
          label="Email"
          type="email"
          placeholder="jordan@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Phone"
          placeholder="(555) 010-2233"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      <Textarea
        label="What they need"
        placeholder="A short note about the job…"
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="flex justify-end">
        <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={add}>
          Add to tray
        </Button>
      </div>
    </div>
  );
}

// --- Paste from email -------------------------------------------------------
function EmailPaste({ onAdd }: { onAdd: (lead: StagedLead) => void }) {
  const [text, setText] = React.useState("");

  function parse() {
    const t = text.trim();
    if (!t) return;
    const email = extractEmail(t);
    const phone = extractPhone(t);
    onAdd({
      tempId: uid(),
      name: guessName(t, email),
      email,
      phone,
      projectType: null,
      description: t.length > 320 ? `${t.slice(0, 320)}…` : t,
      source: "EMAIL",
    });
    setText("");
    toast.success("Email staged", "Check the name and contact we pulled out.");
  }

  return (
    <div className="space-y-3">
      <Textarea
        label="Paste the email"
        placeholder={"Paste the full email here — we'll pull out the name, email, and phone we can find."}
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-[color:var(--ink-muted)]">
          Heuristic parse — edit anything in the tray before transferring.
        </p>
        <Button size="sm" variant="outline" icon={<ArrowRight className="h-3.5 w-3.5" />} onClick={parse} disabled={!text.trim()}>
          Parse &amp; stage
        </Button>
      </div>
    </div>
  );
}

// --- File upload ------------------------------------------------------------
function FileImport({ onAdd }: { onAdd: (...leads: StagedLead[]) => void }) {
  const [dragging, setDragging] = React.useState(false);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const isCsv = file.name.toLowerCase().endsWith(".csv") || text.includes(",");
      if (isCsv) {
        const leads = parseCsv(text);
        if (leads.length === 0) {
          toast.error("Nothing to import", "Couldn't find any rows in that file.");
          return;
        }
        onAdd(...leads);
        toast.success(`Staged ${leads.length} from ${file.name}`, "Review them in the tray.");
      } else {
        // Plain text → one lead
        const email = extractEmail(text);
        onAdd({
          tempId: uid(),
          name: guessName(text, email),
          email,
          phone: extractPhone(text),
          projectType: null,
          description: text.length > 320 ? `${text.slice(0, 320)}…` : text.trim(),
          source: "IMPORT",
        });
        toast.success("Staged 1 lead", `From ${file.name}.`);
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="space-y-3">
      <div className="quiet-caps">Upload a file</div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-[var(--r-lg)] border border-dashed px-6 py-10 text-center cursor-pointer transition-colors",
          dragging
            ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)]/50"
            : "border-[color:var(--ink-line)] hover:bg-black/[0.02]",
        )}
      >
        <span className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
          <Upload className="h-4 w-4" />
        </span>
        <span className="text-[13px] font-medium text-[color:var(--ink)]">
          {fileName ?? "Drop a CSV or text file, or click to choose"}
        </span>
        <span className="text-[11px] text-[color:var(--ink-muted)]">
          CSV with name, email, phone columns — or a plain .txt we&apos;ll read as one lead.
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}

// --- Staging tray -----------------------------------------------------------
function ImportTray({
  staged,
  onRemove,
  onTransfer,
  transferring,
}: {
  staged: StagedLead[];
  onRemove: (tempId: string) => void;
  onTransfer: () => void;
  transferring: boolean;
}) {
  return (
    <div className="paper-card !p-0 overflow-hidden lg:sticky lg:top-6">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[color:var(--ink-line)]">
        <div>
          <div className="font-display text-[17px] leading-tight tracking-[-0.015em]">Import tray</div>
          <div className="text-[11px] text-[color:var(--ink-muted)] tabular">
            {staged.length} ready to transfer
          </div>
        </div>
      </div>

      {staged.length === 0 ? (
        <div className="px-5 py-10 text-center text-[12px] text-[color:var(--ink-muted)] leading-relaxed">
          Leads you add land here first. Review them, then transfer the batch into your leads list.
        </div>
      ) : (
        <ul className="max-h-[52vh] overflow-y-auto divide-y divide-[color:var(--ink-line)]">
          <AnimatePresence initial={false}>
            {staged.map((s) => (
              <motion.li
                key={s.tempId}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-start gap-3 px-5 py-3"
              >
                <FileText className="h-3.5 w-3.5 mt-1 text-[color:var(--ink-faint)] shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">{s.name}</div>
                  <div className="text-[11px] text-[color:var(--ink-muted)] truncate">
                    {s.email ?? s.phone ?? "No contact"}
                    {s.projectType && (
                      <>
                        <span className="mx-1.5 text-[color:var(--ink-faint)]">·</span>
                        {s.projectType}
                      </>
                    )}
                  </div>
                  <Badge tone="neutral" className="mt-1.5">{sourceLabel(s.source)}</Badge>
                </div>
                <button
                  onClick={() => onRemove(s.tempId)}
                  aria-label={`Remove ${s.name}`}
                  className="shrink-0 h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-rose-50 hover:text-rose-700 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <div className="border-t border-[color:var(--ink-line)] p-4">
        <Button
          className="w-full"
          icon={<ArrowRight className="h-4 w-4" />}
          disabled={staged.length === 0 || transferring}
          loading={transferring}
          onClick={onTransfer}
        >
          Transfer {staged.length > 0 ? staged.length : ""} to Leads
        </Button>
      </div>
    </div>
  );
}
