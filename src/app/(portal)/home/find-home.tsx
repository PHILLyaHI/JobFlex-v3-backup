"use client";

import * as React from "react";
import { emailHomeLink } from "@/actions/homePortal";
import s from "./[key]/home.module.css";

export function FindHome() {
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await emailHomeLink(email);
      setNote({ ok: r.ok, text: r.ok ? r.note : r.error });
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error && !/^\[/.test(err.message) ? err.message : "That doesn't look like an email address." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className={s.findForm}
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <label className={s.field}>
        <span>Your email</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" inputMode="email" required name="home-email" />
      </label>
      <div className={s.actions}>
        <button type="submit" className={s.btnPrimary} disabled={busy || !email.includes("@")}>{busy ? "Sending…" : "Email me the link"}</button>
      </div>
      {note && <p className={note.ok ? s.ok : s.err} role={note.ok ? "status" : "alert"}>{note.text}</p>}
    </form>
  );
}
