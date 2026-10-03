"use client";

// A MESSAGE TO THE CONTRACTOR (2026-10-03): typed on the project, emailed to
// the shop with the homeowner as reply-to (actions/homePortal), kept here.
// Honest about what it is: an email the shop answers to the homeowner's inbox.

import * as React from "react";
import { useRouter } from "next/navigation";
import { sendHomeMessage } from "@/actions/homePortal";
import type { HomeMessageView } from "@/lib/home/portal";
import { LocalTime } from "@/components/portal/live-time";
import s from "./home.module.css";

export function MessageBox({ homeKey, token, orgName, sent, timeZone }: { homeKey: string; token: string; orgName: string; sent: HomeMessageView[]; timeZone: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await sendHomeMessage({ key: homeKey, token, body });
      setNote({ ok: r.ok, text: r.ok ? r.note : r.error });
      if (r.ok) {
        setBody("");
        setOpen(false);
        router.refresh();
      }
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : "Couldn't send that — try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.messages}>
      {sent.length > 0 && (
        <ul className={s.messageList} aria-label={`Your messages to ${orgName}`}>
          {sent.slice(0, 3).map((m) => (
            <li key={m.id}>
              <span className={s.mono}><LocalTime iso={m.at} tz={timeZone} />{m.emailed ? ` · emailed to ${orgName}` : " · on their lead"}</span>
              <p>{m.body}</p>
            </li>
          ))}
        </ul>
      )}
      {!open ? (
        <div className={s.actions}>
          <button type="button" className={s.btnGhost} onClick={() => setOpen(true)}>Message {orgName}</button>
        </div>
      ) : (
        <form
          className={s.messageForm}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label className={s.field}>
            <span>To {orgName} — they reply to your email</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={1500} placeholder="A question, a date that works, something you forgot to mention…" required name="message-body" />
          </label>
          <div className={s.actions}>
            <button type="submit" className={s.btnPrimary} disabled={busy || body.trim().length < 2}>{busy ? "Sending…" : "Send"}</button>
            <button type="button" className={s.btnText} disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
      {note && <p className={note.ok ? s.ok : s.err} role={note.ok ? "status" : "alert"}>{note.text}</p>}
    </div>
  );
}
