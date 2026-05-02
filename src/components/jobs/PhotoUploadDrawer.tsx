"use client";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, ImageIcon, X } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

type PhotoKind = "BEFORE" | "PROGRESS" | "AFTER";

export interface PhotoDraft {
  id: string;
  url: string;
  kind: PhotoKind;
  caption?: string;
  analysis?: string | null;
}

interface PhotoUploadDrawerProps {
  open: boolean;
  onClose: () => void;
  existing: PhotoDraft[];
  onUpload: (file: File, kind: PhotoKind) => Promise<void>;
  onDelete?: (photoId: string) => Promise<void> | void;
  busy?: boolean;
  blobDisabled?: boolean;
}

const KINDS: PhotoKind[] = ["BEFORE", "PROGRESS", "AFTER"];

export function PhotoUploadDrawer({
  open,
  onClose,
  existing,
  onUpload,
  onDelete,
  busy,
  blobDisabled,
}: PhotoUploadDrawerProps) {
  const [kind, setKind] = React.useState<PhotoKind>("BEFORE");
  const [drag, setDrag] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      await onUpload(file, kind);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Project photos"
      description="Upload before, progress, or after shots."
      width="min(520px, 100vw)"
    >
      <div className="inline-flex rounded-[var(--r-md)] hairline p-0.5 bg-white/60 dark:bg-white/[0.03] mb-5">
        {KINDS.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={cn(
              "h-8 px-3 rounded-[var(--r-sm)] text-[11px] font-medium capitalize transition-colors",
              kind === k
                ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
                : "text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]",
            )}
          >
            {k.toLowerCase()}
          </button>
        ))}
      </div>

      {blobDisabled && (
        <div className="mb-4 text-[11px] text-[color:var(--ink-muted)] paper-card p-3 leading-relaxed">
          Vercel Blob isn't configured. Uploads will save placeholder URLs for now — add{" "}
          <code className="font-mono text-[10px]">BLOB_READ_WRITE_TOKEN</code> to enable real
          uploads.
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "cursor-pointer rounded-[var(--r-lg)] border-2 border-dashed transition-colors py-10 px-6 text-center",
          drag
            ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)]"
            : "border-[color:var(--ink-line)] hover:border-[color:var(--ink-faint)] hover:bg-black/[0.02]",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Upload className="h-5 w-5 mx-auto text-[color:var(--ink-muted)] mb-2" />
        <div className="text-[13px] font-medium text-[color:var(--ink)]">
          Drop photos here or click to browse
        </div>
        <div className="text-[11px] text-[color:var(--ink-muted)] mt-1">
          Tagging as <span className="font-medium text-[color:var(--ink-soft)]">{kind.toLowerCase()}</span>
        </div>
      </div>

      <div className="mt-6">
        <div className="quiet-caps mb-3">
          {existing.length} photo{existing.length === 1 ? "" : "s"}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <AnimatePresence initial={false}>
            {existing.map((p) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="relative group aspect-square rounded-[var(--r-sm)] overflow-hidden hairline bg-black/[0.02]"
              >
                {p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt={p.caption ?? p.kind} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-[color:var(--ink-faint)]">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                )}
                <div className="absolute top-1 left-1 text-[9px] uppercase tracking-[0.1em] bg-black/60 text-white rounded px-1.5 py-0.5">
                  {p.kind.toLowerCase()}
                </div>
                {onDelete && (
                  <button
                    onClick={() => onDelete(p.id)}
                    className="absolute top-1 right-1 h-5 w-5 grid place-items-center rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </Sheet>
  );
}
