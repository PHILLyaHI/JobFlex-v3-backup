"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { UploadCloud, Receipt, AlertCircle, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { scanReceipt, type OcrResult } from "@/actions/receiptOcr";
import { addJobExpense } from "@/actions/expenses";

interface JobOption {
  id: string;
  title: string;
}

interface Props {
  jobs: JobOption[];
}

interface StagedReceipt {
  jobId: string;
  dataUrl: string;
  ocr: OcrResult;
  disabled: boolean;
  vendor: string;
  total: number;
  category: string;
  note: string;
}

export function ReceiptDropzone({ jobs }: Props) {
  const router = useRouter();
  const [dragOver, setDragOver] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);
  const [savingExpense, setSavingExpense] = React.useState(false);
  const [jobId, setJobId] = React.useState<string>(jobs[0]?.id ?? "");
  const [staged, setStaged] = React.useState<StagedReceipt | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!jobId) {
      toast.error("Pick a job first");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Image files only", "JPG, PNG, HEIC, etc.");
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    setScanning(true);
    try {
      const res = await scanReceipt({ jobId, dataUrl });
      if (!res.ok) {
        toast.error("Couldn't scan", res.error);
        return;
      }
      setStaged({
        jobId,
        dataUrl,
        ocr: res.ocr,
        disabled: !!res.disabled,
        vendor: res.ocr.vendor ?? "",
        total: res.ocr.total ?? 0,
        category: res.ocr.category ?? "Materials",
        note: res.ocr.note ?? "",
      });
    } catch (err: any) {
      toast.error("Scan failed", err?.message);
    } finally {
      setScanning(false);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  async function commitExpense() {
    if (!staged) return;
    setSavingExpense(true);
    try {
      await addJobExpense({
        jobId: staged.jobId,
        category: staged.category || "Materials",
        amount: staged.total,
        note: staged.note,
        receiptUrl: null,
        ocrJson: JSON.stringify(staged.ocr),
      });
      toast.success("Expense saved", `${money(staged.total)} logged on the job.`);
      setStaged(null);
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't save", err?.message);
    } finally {
      setSavingExpense(false);
    }
  }

  return (
    <div className="paper-card p-5 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute -top-20 -right-16 h-44 w-44 rounded-full bg-[color:var(--accent)]/[0.06] blur-3xl pointer-events-none"
      />

      <div className="relative">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <div className="quiet-caps">Receipt OCR</div>
            <div className="text-[12px] text-[color:var(--ink-muted)] mt-1">
              Drop a receipt image. We parse vendor, total, and category and stage an expense for
              your review.
            </div>
          </div>
          <Receipt className="h-4 w-4 text-[color:var(--ink-muted)]" />
        </div>

        <div className="grid md:grid-cols-[200px_1fr] gap-3 mb-3">
          <Select
            label="Charge to job"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            disabled={jobs.length === 0}
          >
            {jobs.length === 0 ? (
              <option value="">No active jobs</option>
            ) : (
              jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))
            )}
          </Select>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "rounded-[var(--r-md)] hairline border-dashed cursor-pointer transition-colors",
              "h-full min-h-[88px] flex flex-col items-center justify-center px-4 text-center",
              dragOver
                ? "bg-[color:var(--accent-soft)]/40 border-[color:var(--accent)]/40"
                : "bg-white/40 hover:bg-white/60 border-[color:var(--ink-line)]",
            )}
          >
            {scanning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-[color:var(--accent)] mb-1.5" />
                <div className="text-[12px] text-[color:var(--ink-soft)]">Reading receipt…</div>
              </>
            ) : (
              <>
                <UploadCloud className="h-4 w-4 text-[color:var(--ink-muted)] mb-1.5" />
                <div className="text-[12px] font-medium text-[color:var(--ink)]">
                  Drop a receipt or click to upload
                </div>
                <div className="text-[10.5px] text-[color:var(--ink-muted)] mt-0.5">
                  JPG · PNG · HEIC up to 10 MB
                </div>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onInputChange}
            />
          </div>
        </div>

        <AnimatePresence>
          {staged && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="paper-card !shadow-none p-4 mt-2 border-l-[3px] border-l-[color:var(--accent)]">
                {staged.disabled && (
                  <div className="flex items-start gap-2 mb-3 text-[11px] leading-relaxed text-[color:var(--ink-soft)]">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-700 shrink-0 mt-0.5" />
                    <span>
                      OpenAI not configured — values below are a sample. Add{" "}
                      <code className="font-mono text-[10.5px]">OPENAI_API_KEY</code> for real
                      OCR.
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-12 gap-3 items-end">
                  <div className="col-span-3">
                    <Input
                      label="Vendor"
                      value={staged.vendor}
                      onChange={(e) =>
                        setStaged({ ...staged, vendor: e.target.value, note: e.target.value })
                      }
                    />
                  </div>
                  <div className="col-span-3">
                    <Select
                      label="Category"
                      value={staged.category}
                      onChange={(e) => setStaged({ ...staged, category: e.target.value })}
                    >
                      <option>Materials</option>
                      <option>Labor</option>
                      <option>Permits</option>
                      <option>Equipment</option>
                      <option>Fuel</option>
                      <option>Subcontractor</option>
                      <option>Other</option>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    <Input
                      label="Total"
                      type="number"
                      step="0.01"
                      prefix={<span className="text-[11px]">$</span>}
                      value={staged.total}
                      onChange={(e) =>
                        setStaged({ ...staged, total: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="col-span-3 flex gap-2 justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<X className="h-3 w-3" />}
                      onClick={() => setStaged(null)}
                    >
                      Discard
                    </Button>
                    <Button
                      size="sm"
                      icon={<Check className="h-3 w-3" />}
                      loading={savingExpense}
                      onClick={commitExpense}
                    >
                      Save
                    </Button>
                  </div>
                </div>
                {staged.ocr.lineItems && staged.ocr.lineItems.length > 0 && (
                  <ul className="mt-3 pt-3 border-t border-[color:var(--ink-line)] text-[11px] text-[color:var(--ink-muted)] tabular space-y-0.5">
                    {staged.ocr.lineItems.slice(0, 6).map((li, i) => (
                      <li key={i} className="flex items-baseline justify-between">
                        <span className="truncate pr-2">{li.name}</span>
                        <span>{money(li.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
