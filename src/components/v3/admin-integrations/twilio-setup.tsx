"use client";

// ADMIN · TWILIO — the form, the check, the test, the log (2026-09-24).
// Same card dress as /admin/integrations. The Auth Token field is
// write-only: the page shows its last four characters and a blank keeps it.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { checkTwilioCredentials, clearTwilioSettings, saveTwilioSettings, sendAdminTestText, type AdminTwilioResult } from "@/actions/adminTwilio";
import { ago } from "@/components/v3/admin-overview/admin-ui";
import { useAdminMotion } from "@/components/v3/admin-overview/admin-motion";
import s from "@/components/v3/admin-overview/admin-shared.module.css";
import i from "./integrations.module.css";

export type TwilioPageData = {
  canStore: boolean;
  stored: { accountSid: string; tokenTail: string; messagingServiceSid: string; fromNumber: string; enabled: boolean } | null;
  savedAt: string | null;
  running: { source: "admin" | "env"; accountSid: string; messagingServiceSid: string | null; fromNumber: string | null } | null;
  envPresent: boolean;
  webhooks: { inbound: string; status: string; voice: string };
  counts: { today: number; month: number; failed: number; optOuts: number; ownNumbers: number };
  recent: { id: string; to: string; kind: string; status: string; error: string | null; at: string; org: string }[];
};

const BACK = "/admin/integrations" as Route;

export function AdminTwilioContent({ data }: { data: TwilioPageData }) {
  useAdminMotion();
  const router = useRouter();
  const [accountSid, setAccountSid] = useState(data.stored?.accountSid ?? "");
  const [authToken, setAuthToken] = useState("");
  const [messagingServiceSid, setMessagingServiceSid] = useState(data.stored?.messagingServiceSid ?? "");
  const [fromNumber, setFromNumber] = useState(data.stored?.fromNumber ?? "");
  const [enabled, setEnabled] = useState(data.stored?.enabled ?? true);
  const [testTo, setTestTo] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const now = new Date().toISOString();

  const run = (fn: () => Promise<AdminTwilioResult>) =>
    start(async () => {
      setNote(null);
      try {
        const r = await fn();
        setNote(r.ok ? { ok: true, text: r.note } : { ok: false, text: r.error });
        if (r.ok) router.refresh();
      } catch (e) {
        setNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
      }
    });

  const running = data.running;
  const state = !running ? { cls: `chip ${s.chipMuted}`, label: "Not set up" } : running.source === "admin" ? { cls: "chip ok", label: "Running on these settings" } : { cls: `chip ${s.chipInk}`, label: "Running on the server's env" };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Admin · Integrations</div>
          <h1 className="page-title">Twilio</h1>
        </div>
        <div className="page-actions">
          <Link className="btn btn-ghost" href={BACK}>All integrations</Link>
        </div>
      </div>
      <p className={s.lead}>The platform&apos;s texting account, set up once for every contractor. They only add phone numbers.</p>

      {/* ── the account ── */}
      <div className="card">
        <div className="card-head">
          <div className="card-titles">
            <div className="card-title">Account</div>
            <div className="card-sub">Twilio console → Account Info. The token is stored encrypted and never shown back.</div>
          </div>
          <span className={state.cls}>{state.label}</span>
        </div>
        <hr className="card-rule" />
        {!data.canStore ? (
          <p className={i.modeErr} role="alert">
            Set <code>TOKEN_ENCRYPTION_KEY</code> on the server first (<code>openssl rand -base64 32</code>) — the token is stored encrypted.
            {data.envPresent ? " Texting runs on the server's TWILIO_* keys meanwhile." : ""}
          </p>
        ) : null}
        <div className={i.form}>
          <label className={i.field}>
            <span>Account SID</span>
            <input value={accountSid} onChange={(e) => setAccountSid(e.target.value)} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" spellCheck={false} />
          </label>
          <label className={i.field}>
            <span>Auth Token{data.stored ? ` — saved, ends in ${data.stored.tokenTail}; blank keeps it` : ""}</span>
            <input value={authToken} onChange={(e) => setAuthToken(e.target.value)} placeholder={data.stored ? "••••••••" : "the 32-character token"} type="password" autoComplete="off" spellCheck={false} />
          </label>
          <label className={i.field}>
            <span>Messaging Service SID (preferred — carries the A2P registration)</span>
            <input value={messagingServiceSid} onChange={(e) => setMessagingServiceSid(e.target.value)} placeholder="MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" spellCheck={false} />
          </label>
          <label className={i.field}>
            <span>Sending number (only without a Messaging Service, or as its default)</span>
            <input value={fromNumber} onChange={(e) => setFromNumber(e.target.value)} placeholder="+12065550100" spellCheck={false} />
          </label>
          <label className={i.check}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span>Texting on for everyone</span>
          </label>
        </div>
        <div className={i.actions}>
          <button type="button" className="btn btn-primary" disabled={pending || !data.canStore} onClick={() => run(() => saveTwilioSettings({ accountSid, authToken, messagingServiceSid, fromNumber, enabled }))}>
            {pending ? "Working…" : "Save for everyone"}
          </button>
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => run(checkTwilioCredentials)}>
            Check with Twilio
          </button>
          {data.stored ? (
            <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => run(clearTwilioSettings)}>
              Clear
            </button>
          ) : null}
          {data.savedAt ? <span className={i.modeNote}>saved {ago(data.savedAt, now)}</span> : null}
        </div>
        {note ? (
          <p className={note.ok ? i.modeNote : i.modeErr} role={note.ok ? "status" : "alert"}>
            {note.text}
          </p>
        ) : null}
      </div>

      {/* ── the console side ── */}
      <div className="card">
        <div className="card-head">
          <div className="card-titles">
            <div className="card-title">In the Twilio console</div>
            <div className="card-sub">Messaging Service → Integration: paste the inbound URL, turn on Advanced Opt-Out. The status URL is set per message; the voice URL is the AI phone line.</div>
          </div>
        </div>
        <hr className="card-rule" />
        <div className={i.form}>
          {(["inbound", "status", "voice"] as const).map((k) => (
            <label className={i.field} key={k}>
              <span>{k === "inbound" ? "A message comes in (POST)" : k === "status" ? "Delivery status (POST)" : "A call comes in (POST)"}</span>
              <input value={data.webhooks[k]} readOnly onFocus={(e) => e.currentTarget.select()} />
            </label>
          ))}
          <label className={i.field}>
            <span>Send a test text to</span>
            <span className={i.inline}>
              <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="+12065550100" spellCheck={false} />
              <button type="button" className="btn btn-ghost" disabled={pending || testTo.replace(/\D/g, "").length < 10} onClick={() => run(() => sendAdminTestText(testTo))}>
                Send test
              </button>
            </span>
          </label>
        </div>
      </div>

      {/* ── what went out ── */}
      <div className="card">
        <div className="card-head">
          <div className="card-titles">
            <div className="card-title">Texts</div>
            <div className="card-sub">
              {data.counts.today} today · {data.counts.month} this month · {data.counts.failed} failed or undelivered this month · {data.counts.optOuts} replied STOP · {data.counts.ownNumbers} {data.counts.ownNumbers === 1 ? "company has" : "companies have"} their own number
            </div>
          </div>
        </div>
        <hr className="card-rule" />
        {data.recent.length === 0 ? (
          <p className={i.modeNote}>Nothing sent yet.</p>
        ) : (
          data.recent.map((r) => (
            <div className={`${s.row} ${i.iRow}`} key={r.id}>
              <div className={s.rowMain}>
                <div className={s.rowTitle}>
                  {r.kind || "text"} → {r.to}
                </div>
              </div>
              <span className={r.status === "DELIVERED" || r.status === "SENT" ? "chip ok" : `chip ${r.status === "FAILED" || r.status === "UNDELIVERED" ? s.chipDanger : s.chipMuted}`}>{r.status.toLowerCase()}</span>
              <div className={i.keys}>
                <span className={s.envk}>{ago(r.at, now)}</span>
                <span className={s.envk}>org {r.org}</span>
                {r.error ? <span className={s.envk}>{r.error}</span> : null}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
