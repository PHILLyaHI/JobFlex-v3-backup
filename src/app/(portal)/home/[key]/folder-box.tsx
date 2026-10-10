"use client";

// PHOTOS & FILES ON A PROJECT (2026-10-03): the job folder as the homeowner
// sees it — what they added (pictures, videos, PDFs), the contractor's asks,
// a button that takes several files at once with progress. The bytes go the
// way the server names (lib/home/uploadClient); the contractor hears once per
// batch and sees the folder on their lead.

import * as React from "react";
import { useRouter } from "next/navigation";
import { deleteHomeFile } from "@/actions/homeFiles";
import type { FolderFileView, FolderRequestView } from "@/lib/home/files";
import { uploadHomeFile } from "@/lib/home/uploadClient";
import { MediaUploadError } from "@/lib/media/uploadJobMedia";
import { fileSize } from "@/lib/jobMediaShared";
import { LocalTime } from "@/components/portal/live-time";
import s from "./home.module.css";

const ACCEPT = "image/*,video/*,application/pdf";
type Progress = { name: string; pct: number; error: string | null };

export function FolderBox({ homeKey, token, orgName, files, requests, storage, timeZone }: { homeKey: string; token: string; orgName: string | null; files: FolderFileView[]; requests: FolderRequestView[]; storage: "blob" | "local" | "inline"; timeZone: string }) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<Progress[]>([]);
  const [done, setDone] = React.useState<string | null>(null);
  const open = requests.filter((r) => !r.fulfilledAt);

  async function send(list: FileList | null) {
    if (!list || !list.length || busy) return;
    const picked = Array.from(list).slice(0, 12);
    setBusy(true);
    setDone(null);
    setProgress(picked.map((f) => ({ name: f.name, pct: 0, error: null })));
    let added = 0;
    for (let i = 0; i < picked.length; i++) {
      const file = picked[i];
      const last = i === picked.length - 1;
      try {
        const r = await uploadHomeFile({
          homeKey,
          token,
          file,
          note: note.trim() || null,
          notify: last ? { count: added + 1 } : null,
          onProgress: (pct) => setProgress((p) => p.map((x, j) => (j === i ? { ...x, pct } : x))),
        });
        if (r.ok) {
          added += 1;
          setProgress((p) => p.map((x, j) => (j === i ? { ...x, pct: 100 } : x)));
        } else setProgress((p) => p.map((x, j) => (j === i ? { ...x, error: r.error } : x)));
      } catch (err) {
        const msg = err instanceof MediaUploadError ? err.message : "The upload failed — try again.";
        setProgress((p) => p.map((x, j) => (j === i ? { ...x, error: msg } : x)));
      }
    }
    setBusy(false);
    if (added) {
      setDone(added === 1 ? `Added — ${orgName ? `${orgName} can see it.` : "it's in the folder for whoever takes the project."}` : `${added} files added${orgName ? ` — ${orgName} can see them.` : "."}`);
      setNote("");
      router.refresh();
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await deleteHomeFile({ key: homeKey, id });
      if (r.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.folder} id={`folder-${token}`}>
      <div className={s.folderHead}>
        <h4 className={s.subLabel}>Photos & files</h4>
        <span className={s.mono}>{files.length ? `${files.length} ${files.length === 1 ? "file" : "files"}` : "Nothing yet"}{orgName ? ` · ${orgName} sees this folder` : ""}</span>
      </div>
      {open.map((r) => (
        <p key={r.id} className={s.ask} role="status">
          <b>{r.orgName} asks for pictures</b>
          {r.note ? <> — “{r.note}”</> : null}
          <span className={s.mono}> · <LocalTime iso={r.at} tz={timeZone} /></span>
        </p>
      ))}
      {files.length > 0 && (
        <ul className={s.tiles} aria-label="Files on this project">
          {files.map((f) => (
            <li key={f.id} className={s.tile} data-media={f.media}>
              <a className={s.tileLink} href={f.href} target="_blank" rel="noopener noreferrer" title={f.note ?? f.name}>
                {f.media === "photo" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a private file through its own checked route, no loader
                  <img src={f.href} alt={f.note ?? f.name} loading="lazy" />
                ) : (
                  <span className={s.tileKind}>{f.media === "video" ? "▶ Video" : "PDF"}</span>
                )}
              </a>
              <span className={s.tileMeta}>
                <span className={s.tileName}>{f.note || f.name}</span>
                <span className={s.mono}>{fileSize(f.bytes)}</span>
              </span>
              <button type="button" className={s.tileRemove} aria-label={`Remove ${f.name}`} disabled={busy} onClick={() => void remove(f.id)}>×</button>
            </li>
          ))}
        </ul>
      )}
      <div className={s.folderAdd}>
        <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => void send(e.target.files)} />
        <input className={s.folderNote} value={note} onChange={(e) => setNote(e.target.value)} placeholder="A note for the contractor (optional) — “the leak is above the window”" maxLength={500} name={`folder-note-${token}`} />
        <button type="button" className={s.btnGhost} disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? "Uploading…" : "Add photos or a video"}</button>
      </div>
      {progress.length > 0 && (
        <ul className={s.progress} aria-live="polite">
          {progress.map((p, i) => (
            <li key={i}>
              <span className={s.tileName}>{p.name}</span>
              {p.error ? <span className={s.err}>{p.error}</span> : <span className={s.meter}><i style={{ width: `${p.pct}%` }} /></span>}
            </li>
          ))}
        </ul>
      )}
      {done && <p className={s.ok} role="status">{done}</p>}
      <p className={s.fine}>
        {storage === "inline"
          ? "Pictures up to 4 MB for now — videos need JobFlex's file storage, which is being switched on."
          : "Pictures, videos and PDFs up to 100 MB each. They go into the contractor's folder for this job — only you and the contractor can see them."}
      </p>
    </div>
  );
}
