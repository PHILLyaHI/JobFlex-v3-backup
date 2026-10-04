"use client";

// THE JOB FOLDER ON A LEAD (2026-10-03, lib/home/files): what the homeowner
// added from their dashboard — pictures, videos, PDFs — with a way to ask for
// more and a way to put a picture on one of this client's proposals. The
// files come through /api/home-file/[id], which checks the session.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { attachHomeFileToProposal, requestHomeFiles } from "@/actions/homeFiles";
import type { FolderFileView, FolderRequestView } from "@/lib/home/files";
import { fileSize } from "@/lib/jobMediaShared";
import styles from "./lead-detail.module.css";

const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).map((n) => styles[n as string] ?? n).join(" ");

export type JobFolderProps = {
  leadId: string;
  homeownerFirstName: string;
  files: FolderFileView[];
  requests: FolderRequestView[];
  proposals: Array<{ id: string; title: string; status: string }>;
};

export function JobFolder({ leadId, homeownerFirstName, files, requests, proposals }: JobFolderProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [askNote, setAskNote] = useState("");
  const [pick, setPick] = useState<Record<string, string>>({});
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const open = requests.filter((r) => !r.fulfilledAt);

  const run = (fn: () => Promise<{ ok: boolean; note?: string; error?: string }>, after?: () => void) =>
    start(async () => {
      setNote(null);
      try {
        const r = await fn();
        setNote({ ok: r.ok, text: r.ok ? r.note ?? "Done." : r.error ?? "Something went wrong." });
        if (r.ok) {
          after?.();
          router.refresh();
        }
      } catch (e) {
        setNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
      }
    });

  return (
    <div className={cx("folder")} id="folder" data-lead-folder>
      <div className={cx("sec-h")}>Job folder</div>
      <p className={cx("folder-sub")}>
        {files.length ? `${files.length} ${files.length === 1 ? "file" : "files"} from ${homeownerFirstName}` : `Nothing from ${homeownerFirstName} yet`} · they add pictures, videos and PDFs from their home dashboard — or when you ask.
      </p>
      {open.length > 0 && <p className={cx("folder-open")}>You asked{open[0].note ? `: “${open[0].note}”` : ""} — waiting for them.</p>}
      {files.length > 0 && (
        <ul className={cx("folder-grid")}>
          {files.map((f) => (
            <li key={f.id} className={cx("folder-tile")} data-media={f.media}>
              <a className={cx("folder-pic")} href={f.href} target="_blank" rel="noopener noreferrer" title={f.name}>
                {f.media === "photo" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a private file through its own checked route, no loader
                  <img src={f.href} alt={f.note ?? f.name} loading="lazy" />
                ) : (
                  <span className={cx("folder-kind")}>{f.media === "video" ? "▶ Video" : "PDF"}</span>
                )}
              </a>
              <div className={cx("folder-meta")}>
                <b>{f.note || f.name}</b>
                <span>{fileSize(f.bytes)} · {new Date(f.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                <span className={cx("folder-acts")}>
                  <a href={`${f.href}${f.href.includes("?") ? "&" : "?"}download=1`}>Download</a>
                  {f.media === "photo" && proposals.length > 0 && (
                    <>
                      <select aria-label={`Proposal for ${f.name}`} value={pick[f.id] ?? proposals[0].id} onChange={(e) => setPick((p) => ({ ...p, [f.id]: e.target.value }))}>
                        {proposals.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                      </select>
                      <button type="button" disabled={pending} onClick={() => run(() => attachHomeFileToProposal({ fileId: f.id, proposalId: pick[f.id] ?? proposals[0].id }))}>Use on proposal</button>
                    </>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!asking ? (
        <div className={cx("folder-row")}>
          <button type="button" className={cx("btn", "btn-ghost")} disabled={pending} onClick={() => setAsking(true)}>Ask {homeownerFirstName} for pictures</button>
        </div>
      ) : (
        <form
          className={cx("folder-ask")}
          onSubmit={(e) => {
            e.preventDefault();
            run(() => requestHomeFiles({ leadId, note: askNote.trim() || undefined }), () => { setAskNote(""); setAsking(false); });
          }}
        >
          <label>
            <span>What would help you price it? (optional)</span>
            <textarea value={askNote} onChange={(e) => setAskNote(e.target.value)} rows={2} maxLength={500} placeholder="e.g. the attic under the leak, and the whole roof from the street" />
          </label>
          <div className={cx("folder-row")}>
            <button type="submit" className={cx("btn", "btn-primary")} disabled={pending}>{pending ? "Sending…" : "Send the ask"}</button>
            <button type="button" className={cx("btn", "btn-ghost")} disabled={pending} onClick={() => setAsking(false)}>Cancel</button>
          </div>
        </form>
      )}
      {note && <p className={cx(note.ok ? "folder-ok" : "folder-err")} role={note.ok ? "status" : "alert"}>{note.text}</p>}
    </div>
  );
}
