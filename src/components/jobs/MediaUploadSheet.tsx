"use client";
// PHOTOS AND VIDEOS OF THE WORK — the crew's upload sheet (2026-09-27).
//
// Owner: "at the workers' dashboard, an option to upload videos and pictures
// of how the job was done." One sheet for the worker portal: pick what the
// shot is of (Before · Progress · After — After is the default, it is the
// finished work the office wants), take or choose any number of photos and
// videos, watch each one go up. Photos are shrunk on the phone; a video goes
// straight to the store (lib/media/uploadJobMedia). Everything lands on the
// job, in its proposal's Files, and on the office's trail with a text.
import * as React from "react";
import { Camera, Check, Film, Upload } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { IMAGE_ACCEPT, MEDIA_ACCEPT, MEDIA_KINDS, fileSize, type MediaKind } from "@/lib/jobMediaShared";
import { MediaUploadError, uploadJobMedia, type UploadDoor } from "@/lib/media/uploadJobMedia";

interface QueueItem {
  id: string;
  name: string;
  size: number;
  video: boolean;
  pct: number;
  state: "waiting" | "up" | "done" | "failed";
  error?: string;
}

const KIND_LABEL: Record<MediaKind, string> = { BEFORE: "Before", PROGRESS: "Progress", AFTER: "After" };

export function MediaUploadSheet({
  open,
  onClose,
  jobId,
  door,
  blobEnabled,
  defaultKind = "AFTER",
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  jobId: string;
  door: UploadDoor;
  blobEnabled: boolean;
  defaultKind?: MediaKind;
  /** Called once per file that landed. */
  onUploaded?: (media: "photo" | "video") => void;
}) {
  const [kind, setKind] = React.useState<MediaKind>(defaultKind);
  const [queue, setQueue] = React.useState<QueueItem[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const busy = queue.some((q) => q.state === "waiting" || q.state === "up");

  const patch = (id: string, next: Partial<QueueItem>) => setQueue((qs) => qs.map((q) => (q.id === id ? { ...q, ...next } : q)));

  async function take(files: FileList | null) {
    if (!files || !files.length) return;
    const items: Array<{ item: QueueItem; file: File }> = Array.from(files).map((file, i) => ({
      file,
      item: { id: `${Date.now()}-${i}`, name: file.name, size: file.size, video: file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|3gp)$/i.test(file.name), pct: 0, state: "waiting" as const },
    }));
    setQueue((qs) => [...qs, ...items.map((x) => x.item)]);
    // One at a time: a phone on a jobsite does better with one stream.
    for (const { item, file } of items) {
      patch(item.id, { state: "up", pct: 1 });
      try {
        const rec = await uploadJobMedia({ jobId, door, file, kind, blobEnabled, onProgress: (pct) => patch(item.id, { pct }) });
        patch(item.id, { state: "done", pct: 100 });
        onUploaded?.(rec.media);
      } catch (err) {
        patch(item.id, { state: "failed", error: err instanceof MediaUploadError ? err.message : err instanceof Error && err.message ? err.message : "Couldn't upload this one." });
      }
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Photos & videos of the work"
      description="They go to the job and its proposal, and the office hears about them."
      footer={
        <Button size="lg" className="w-full" onClick={onClose} disabled={busy} icon={<Check className="h-4 w-4" />}>
          {busy ? "Uploading…" : "Done"}
        </Button>
      }
    >
      <div className="inline-flex rounded-[var(--r-md)] hairline p-0.5 bg-white/60 mb-4" role="radiogroup" aria-label="What the shot is of">
        {MEDIA_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={cn("h-9 px-3.5 rounded-[var(--r-sm)] text-[12px] font-semibold transition-colors", kind === k ? "bg-[color:var(--ink)] text-[color:var(--paper)]" : "text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]")}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <input ref={inputRef} type="file" accept={blobEnabled ? MEDIA_ACCEPT : IMAGE_ACCEPT} multiple className="hidden" onChange={(e) => { void take(e.target.files); e.target.value = ""; }} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full rounded-[var(--r-lg)] border-2 border-dashed border-[color:var(--ink-line)] p-6 text-center transition-colors hover:border-[color:var(--ink-faint)] hover:bg-black/[0.02] focus-ring"
      >
        <span className="flex flex-col items-center gap-2 text-[color:var(--ink-muted)]">
          <span className="flex items-center gap-2">
            <Camera className="h-6 w-6" />
            {blobEnabled ? <Film className="h-6 w-6" /> : null}
          </span>
          <span className="text-[13.5px] font-semibold text-[color:var(--ink)]">{blobEnabled ? "Take or choose photos and videos" : "Take or choose photos"}</span>
          <span className="text-[12px]">Tagged as <b className="text-[color:var(--ink-soft)]">{KIND_LABEL[kind].toLowerCase()}</b> · as many as you like</span>
        </span>
      </button>
      {!blobEnabled ? (
        <p className="mt-3 text-[12px] leading-relaxed text-[color:var(--ink-muted)]">
          Videos need the company&apos;s file storage, which is not switched on yet — the office can turn it on. Photos go through.
        </p>
      ) : null}

      {queue.length > 0 ? (
        <ul className="mt-5 divide-y divide-[color:var(--ink-line)]" aria-live="polite">
          {queue.map((q) => (
            <li key={q.id} className="py-2.5 first:pt-0">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-sm)] bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]">
                  {q.video ? <Film className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-[color:var(--ink)]">{q.name}</div>
                  <div className="text-[11.5px] text-[color:var(--ink-muted)]">
                    {q.state === "done" ? "Uploaded" : q.state === "failed" ? q.error : q.state === "up" ? `${q.pct}% · ${fileSize(q.size)}` : `Waiting · ${fileSize(q.size)}`}
                  </div>
                </div>
                {q.state === "done" ? <Check className="h-4 w-4 text-[color:var(--emerald)]" /> : q.state === "up" ? <Upload className="h-4 w-4 animate-pulse text-[color:var(--ink-muted)]" /> : null}
              </div>
              {q.state === "up" ? (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-black/[0.06]">
                  <div className="h-full bg-[color:var(--accent)] transition-[width]" style={{ width: `${q.pct}%` }} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Sheet>
  );
}
