"use client";
import * as React from "react";
import { File, Paperclip, Upload, X } from "lucide-react";
import { BuilderSection } from "./BuilderSection";
import { PreviewTag, PreviewNote } from "./PreviewTag";

interface StagedFile {
  id: string;
  name: string;
  size: number;
  type: string;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Bucket C — drop / pick UI fully wired locally. Nothing is uploaded or
// persisted because there is no Attachment model and no upload endpoint yet.
export function FilesBlock() {
  const [files, setFiles] = React.useState<StagedFile[]>([]);
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: StagedFile[] = Array.from(list).map((f, i) => ({
      id: `${Date.now()}-${i}-${f.name}`,
      name: f.name,
      size: f.size,
      type: f.type || "application/octet-stream",
    }));
    setFiles((prev) => [...prev, ...next]);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer?.files ?? null);
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }
  function onDragLeave() {
    setDragOver(false);
  }

  function remove(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  const totalSize = files.reduce((a, f) => a + f.size, 0);

  return (
    <BuilderSection
      index="07"
      title="Files & Documents"
      subtitle="Drop site photos, permits, spec sheets — everything the proposal needs alongside the quote."
      badge={<PreviewTag />}
    >
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={
          "rounded-[var(--r-md)] bg-white/40 px-6 py-8 text-center transition-colors hairline " +
          (dragOver ? "bg-[color:var(--accent-soft)]/40" : "")
        }
      >
        <Paperclip className="mx-auto h-5 w-5 text-[color:var(--ink-faint)]" />
        <p className="mt-2 text-[13px] text-[color:var(--ink-soft)]">
          Drop files here, or
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="ml-1 font-medium text-[color:var(--ink)] underline underline-offset-[3px] decoration-[color:var(--ink-faint)] hover:decoration-[color:var(--accent)] focus-ring"
          >
            browse
          </button>
        </p>
        <p className="mt-1 text-[11px] text-[color:var(--ink-faint)]">
          PDFs, images, CAD exports — anything that helps the client see the job.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <ul className="mt-4 divide-y divide-[color:var(--ink-line)]">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-3 py-2.5 text-[12.5px]"
            >
              <File className="h-3.5 w-3.5 shrink-0 text-[color:var(--ink-faint)]" />
              <span className="min-w-0 flex-1 truncate text-[color:var(--ink)]">
                {f.name}
              </span>
              <span className="shrink-0 tabular text-[11px] text-[color:var(--ink-muted)]">
                {humanSize(f.size)}
              </span>
              <button
                type="button"
                onClick={() => remove(f.id)}
                aria-label={`Remove ${f.name}`}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-rose-50 hover:text-[color:var(--rose)] focus-ring"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <div className="mt-3 flex items-center justify-between text-[11px] text-[color:var(--ink-muted)]">
          <span className="flex items-center gap-1.5">
            <Upload className="h-3 w-3" />
            <span>
              {files.length} file{files.length === 1 ? "" : "s"} staged ·{" "}
              {humanSize(totalSize)}
            </span>
          </span>
        </div>
      )}

      <PreviewNote>
        Persisting attachments needs an `Attachment` model and an upload
        endpoint (Vercel Blob is already wired for the rest of JobFlex). Until
        then files only live in this builder session.
      </PreviewNote>
    </BuilderSection>
  );
}
