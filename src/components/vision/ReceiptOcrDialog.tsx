"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload, RotateCcw, AlertCircle } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/ui/Toast";
import { money } from "@/lib/format";
import { cn } from "@/lib/cn";

interface OcrResult {
  vendor?: string;
  total?: number;
  category?: string;
  note?: string;
  lineItems?: { name: string; amount: number }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  jobId: string;
  aiEnabled: boolean;
}

const CATEGORIES = ["Materials", "Labor", "Fuel", "Tools", "Subcontractor", "Other"];

export function ReceiptOcrDialog({ open, onClose, jobId, aiEnabled }: Props) {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<OcrResult | null>(null);
  const [vendor, setVendor] = React.useState("");
  const [total, setTotal] = React.useState("");
  const [category, setCategory] = React.useState("Materials");
  const [note, setNote] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setDataUrl(null);
    setResult(null);
    setVendor("");
    setTotal("");
    setCategory("Materials");
    setNote("");
  }

  async function pick(f: File) {
    setFile(f);
    const reader = new FileReader();
    const dataUrl_: string = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });
    setDataUrl(dataUrl_);
    await scan(dataUrl_, f.name);
  }

  async function scan(url: string, filename: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/vision/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, dataUrl: url, filename, preview: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "OCR failed");
      setResult(data.ocr ?? null);
      setVendor(data.ocr?.vendor ?? "");
      setTotal(data.ocr?.total ? String(data.ocr.total) : "");
      setCategory(data.ocr?.category ?? "Materials");
      setNote(data.ocr?.note ?? "");
    } catch (err: any) {
      toast.error("Couldn't scan", err?.message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!dataUrl || !file) return;
    const amt = Number(total);
    if (!(amt > 0)) {
      toast.error("Amount required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/vision/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          dataUrl,
          filename: file.name,
          preview: false,
          override: { vendor, total: amt, category, note },
          ocrJson: result ?? null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error ?? "Save failed");
      }
      toast.success("Expense logged");
      reset();
      onClose();
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't save", err?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Scan a receipt"
      description="Drop in a photo — AI will extract vendor, total, and categorize it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {file && dataUrl && (
            <Button
              variant="outline"
              loading={busy}
              onClick={() => scan(dataUrl, file.name)}
              icon={<RotateCcw className="h-3 w-3" />}
            >
              Retry OCR
            </Button>
          )}
          <Button loading={busy} disabled={!dataUrl || !total} onClick={save}>
            Save expense
          </Button>
        </>
      }
    >
      <div>
        {!aiEnabled && (
          <div className="paper-card p-3 mb-4 flex items-start gap-3 border-l-[3px] border-l-amber-400">
            <AlertCircle className="h-4 w-4 mt-0.5 text-amber-700 shrink-0" />
            <div className="text-[12px] leading-relaxed">
              OpenAI isn't configured. You can still fill the fields manually after picking a file.
            </div>
          </div>
        )}

        {!dataUrl ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) pick(f);
            }}
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer rounded-[var(--r-lg)] border-2 border-dashed border-[color:var(--ink-line)] hover:border-[color:var(--ink-faint)] hover:bg-black/[0.02] transition-colors py-12 text-center"
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) pick(f);
              }}
            />
            <Upload className="h-5 w-5 mx-auto text-[color:var(--ink-muted)] mb-2" />
            <div className="text-[13px] font-medium">Drop a receipt photo or click to pick</div>
            <div className="text-[11px] text-[color:var(--ink-muted)] mt-1">
              JPG or PNG · under 10MB
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-4">
            <div className="aspect-[3/4] rounded-[var(--r-md)] overflow-hidden hairline bg-black/[0.03]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={dataUrl} alt="Receipt" className="w-full h-full object-cover" />
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Vendor"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  placeholder="Home Depot"
                />
                <Input
                  label="Total"
                  type="number"
                  step="0.01"
                  prefix={<span className="text-[11px]">$</span>}
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                />
              </div>
              <Select
                label="Category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
              <Textarea
                label="Note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Invoice # or SKU notes"
              />
            </div>
          </div>
        )}

        {result?.lineItems && result.lineItems.length > 0 && (
          <div className="mt-5 pt-4 border-t border-[color:var(--ink-line)]">
            <div className="quiet-caps mb-2">Extracted line items</div>
            <ul className="text-[11.5px] text-[color:var(--ink-muted)] space-y-0.5 tabular">
              {result.lineItems.slice(0, 8).map((l, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span className="truncate">{l.name}</span>
                  <span className="ml-2">{money(l.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}
