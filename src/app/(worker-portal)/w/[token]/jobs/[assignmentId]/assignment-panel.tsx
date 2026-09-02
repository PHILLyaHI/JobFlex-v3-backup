"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { safeHref } from "@/lib/safeHref";
import { PhotoUploadDrawer, type PhotoDraft } from "@/components/jobs/PhotoUploadDrawer";
import { JobStatusBadge } from "@/components/jobs/JobStatusBadge";
import { toast } from "@/components/ui/Toast";
import { money } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Play, Check, Upload, Receipt, Camera, Plus } from "lucide-react";

interface JobReceipt {
  id: string;
  category: string;
  amount: number;
  note: string | null;
  receiptUrl: string | null;
  createdAt: string;
}

interface WorkerJobPanelProps {
  jobId: string;
  token: string;
  jobStatus: string;
  photos: PhotoDraft[];
  receipts: JobReceipt[];
}

const CATEGORIES = ["Materials", "Fuel", "Tools", "Subcontractor", "Other"];

// Everything interactive below the fold: move the job forward, log receipts,
// and post site photos. Workers can only push status forward (start / complete);
// reschedule and reassignment stay with the office.
export function WorkerJobPanel({ jobId, token, jobStatus, photos, receipts }: WorkerJobPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [drawer, setDrawer] = React.useState(false);
  const [receiptOpen, setReceiptOpen] = React.useState(false);

  async function updateJobStatus(newStatus: "IN_PROGRESS" | "COMPLETED") {
    try {
      setBusy(newStatus);
      const res = await fetch(`/api/worker/job/${jobId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, status: newStatus }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(newStatus === "COMPLETED" ? "Marked complete" : "Work started");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't update", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  async function uploadPhoto(file: File, kind: "BEFORE" | "PROGRESS" | "AFTER") {
    const reader = new FileReader();
    const dataUrl: string = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await fetch("/api/worker/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, jobId, dataUrl, filename: file.name, kind }),
    });
    if (!res.ok) throw new Error(await res.text());
    router.refresh();
  }

  return (
    <>
      {/* Job status ─────────────────────────────────────────────── */}
      <section className="mt-4 paper-card p-5">
        <div className="flex items-center justify-between">
          <SectionLabel>Job status</SectionLabel>
          <JobStatusBadge status={jobStatus} />
        </div>
        <div className="mt-3.5">
          {jobStatus === "SCHEDULED" && (
            <Button
              size="lg"
              className="w-full"
              loading={busy === "IN_PROGRESS"}
              onClick={() => updateJobStatus("IN_PROGRESS")}
              icon={<Play className="h-4 w-4" />}
            >
              Start work
            </Button>
          )}
          {jobStatus === "IN_PROGRESS" && (
            <Button
              size="lg"
              className="w-full"
              loading={busy === "COMPLETED"}
              onClick={() => updateJobStatus("COMPLETED")}
              icon={<Check className="h-4 w-4" />}
            >
              Mark completed
            </Button>
          )}
          {jobStatus === "COMPLETED" && (
            <p className="text-[13px] text-[color:var(--ink-muted)]">
              This job is marked complete. Thanks for the work.
            </p>
          )}
          {jobStatus === "CANCELED" && (
            <p className="text-[13px] text-[color:var(--ink-muted)]">
              This job was canceled by the office.
            </p>
          )}
        </div>
      </section>

      {/* Receipts ───────────────────────────────────────────────── */}
      <section className="mt-4 paper-card p-5">
        <div className="flex items-center justify-between">
          <SectionLabel icon={<Receipt className="h-3.5 w-3.5" />}>
            Receipts{" "}
            <span className="tabular text-[color:var(--ink-faint)]">{receipts.length}</span>
          </SectionLabel>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setReceiptOpen(true)}
            icon={<Plus className="h-3.5 w-3.5" />}
          >
            Add
          </Button>
        </div>
        {receipts.length === 0 ? (
          <p className="mt-3 text-[13px] leading-relaxed text-[color:var(--ink-muted)]">
            No receipts yet. Snap a photo of any materials or fuel receipt to log it straight to the
            office.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[color:var(--ink-line)]">
            {receipts.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                {safeHref(r.receiptUrl) ? (
                  <a
                    href={safeHref(r.receiptUrl) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-11 w-11 shrink-0 overflow-hidden rounded-[var(--r-sm)] hairline"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={safeHref(r.receiptUrl) ?? undefined} alt={r.category} className="h-full w-full object-cover" />
                  </a>
                ) : (
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-sm)] bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]">
                    <Receipt className="h-5 w-5" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold text-[color:var(--ink)]">
                    {r.category}
                  </div>
                  {r.note && (
                    <div className="truncate text-[12px] text-[color:var(--ink-muted)]">{r.note}</div>
                  )}
                </div>
                <div className="stat-numeric text-[15px] text-[color:var(--ink)]">
                  {money(r.amount)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Site photos ────────────────────────────────────────────── */}
      <section className="mt-4 paper-card p-5">
        <div className="flex items-center justify-between">
          <SectionLabel>
            Site photos{" "}
            <span className="tabular text-[color:var(--ink-faint)]">{photos.length}</span>
          </SectionLabel>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDrawer(true)}
            icon={<Upload className="h-3.5 w-3.5" />}
          >
            Upload
          </Button>
        </div>
        {photos.length === 0 ? (
          <p className="mt-3 text-[13px] text-[color:var(--ink-muted)]">No photos yet.</p>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <div
                key={p.id}
                className="relative aspect-square overflow-hidden rounded-[var(--r-sm)] hairline bg-black/[0.03]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.kind} className="h-full w-full object-cover" />
                <div className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] text-white">
                  {p.kind.toLowerCase()}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <ReceiptSheet
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        jobId={jobId}
        token={token}
        onSaved={() => {
          setReceiptOpen(false);
          router.refresh();
        }}
      />
      <PhotoUploadDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        existing={photos}
        onUpload={uploadPhoto}
      />
    </>
  );
}

function SectionLabel({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-faint)]">
      {icon}
      {children}
    </div>
  );
}

function ReceiptSheet({
  open,
  onClose,
  jobId,
  token,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  jobId: string;
  token: string;
  onSaved: () => void;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [amount, setAmount] = React.useState("");
  const [category, setCategory] = React.useState("Materials");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function pick(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result));
    reader.readAsDataURL(f);
  }

  async function save() {
    if (!file || !preview) {
      toast.error("Add a photo", "Snap or choose a receipt image first.");
      return;
    }
    try {
      setSaving(true);
      const res = await fetch("/api/worker/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          jobId,
          dataUrl: preview,
          filename: file.name,
          amount: parseFloat(amount) || 0,
          category,
          note: note.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Receipt added");
      setFile(null);
      setPreview(null);
      setAmount("");
      setNote("");
      setCategory("Materials");
      onSaved();
    } catch (err) {
      toast.error("Couldn't save receipt", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a receipt"
      description="Snap a photo and log the amount — it goes straight to the office."
      footer={
        <Button size="lg" className="w-full" loading={saving} onClick={save} icon={<Check className="h-4 w-4" />}>
          Save receipt
        </Button>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => pick(e.target.files)}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="w-full rounded-[var(--r-lg)] border-2 border-dashed border-[color:var(--ink-line)] p-6 text-center transition-colors hover:border-[color:var(--ink-faint)] hover:bg-black/[0.02] focus-ring"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Receipt" className="mx-auto max-h-52 rounded-[var(--r-md)] object-contain" />
        ) : (
          <span className="flex flex-col items-center gap-2 text-[color:var(--ink-muted)]">
            <Camera className="h-6 w-6" />
            <span className="text-[13px] font-medium text-[color:var(--ink)]">
              Take a photo or choose a file
            </span>
          </span>
        )}
      </button>

      <div className="mt-5 space-y-4">
        <div>
          <label className="quiet-caps">Amount</label>
          <div className="mt-1.5 flex items-center rounded-[var(--r-md)] hairline bg-white/60 px-3">
            <span className="text-[15px] text-[color:var(--ink-muted)]">$</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="h-11 w-full bg-transparent px-2 text-[15px] tabular outline-none"
            />
          </div>
        </div>
        <div>
          <label className="quiet-caps">Category</label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={cn(
                  "h-9 rounded-[var(--r-md)] px-3.5 text-[13px] font-medium transition-colors",
                  category === c
                    ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
                    : "hairline text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="quiet-caps">
            Note <span className="text-[color:var(--ink-faint)]">optional</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="e.g. Lumber for the back fence"
            className="mt-1.5 w-full resize-none rounded-[var(--r-md)] hairline bg-white/60 p-3 text-[13.5px] outline-none focus-ring"
          />
        </div>
      </div>
    </Sheet>
  );
}
