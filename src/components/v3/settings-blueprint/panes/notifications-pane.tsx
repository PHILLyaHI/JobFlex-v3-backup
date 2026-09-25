"use client";

// Settings blueprint — Notifications pane.
//
// The matrix is REAL: three channels per event (In-app · Email · Text). The
// in-app column filters the bell feed (recentNotifications); the email
// column gates every office email to this member; the Text column
// (2026-09-24) gates the texts to their verified mobile. The event list is
// the one the app can actually produce — src/lib/notificationPrefsShared.ts
// — and an event nobody emails or texts carries a tag in that cell rather
// than a ghost checkbox that looks unticked.
//
// Under the matrix, the Text messages card: verify a mobile (the code is
// the consent), extra office numbers, quiet hours for texts, a test text.
// JobFlex owns the Twilio number; a contractor never sees a key.
//
// "Send test notification" writes a TEST row only this user's bell shows,
// and mails them if the saved prefs allow it.

import { useState } from "react";
import { useRouter } from "next/navigation";

import { updateNotificationPrefs } from "@/actions/accountSettings";
import { sendTestNotification } from "@/actions/notifications";
import {
  addNotificationPhone,
  claimOwnNumber,
  confirmPhoneVerification,
  releaseOwnNumber,
  removeNotificationPhone,
  removeSmsPhone,
  sendTestText,
  setClientTextsOn,
  setNotificationPhoneActive,
  startPhoneVerification,
  type SmsActionResult,
} from "@/actions/sms";
import { Cbx, Field, SaveBar, actionError } from "../ui";
import type { MatrixAction, PaneProps, PrefKey, SmsSettingsData } from "../settings-data";
import {
  EMAIL_COLUMN_INDEX,
  EMAIL_UNAVAILABLE_TAG,
  EMAIL_UNAVAILABLE_TITLE,
  NOTIFICATIONS_CARD,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_COLUMN_LABEL,
  NOTIFICATION_EVENT_COLUMN,
  NOTIFICATION_FOOTER_ACTIONS,
  NOTIFICATION_ICONS,
  PREF_EVENTS,
  SMS_COLUMN_INDEX,
  SMS_UNAVAILABLE_TAG,
  SMS_UNAVAILABLE_TITLE,
  TEST_RESULT_COPY,
  TEXTS_CARD,
  TEXTS_COPY,
} from "../settings-data";

type Cells = [boolean, boolean, boolean];

export function NotificationsPane({ data }: PaneProps) {
  const { prefs, sms } = data.notifications;
  const router = useRouter();

  const [matrix, setMatrix] = useState<Cells[]>(() =>
    PREF_EVENTS.map((event) => {
      const stored = prefs.matrix[event.key];
      return stored ? ([stored[0], stored[1], stored[2] ?? event.seed[2]] as Cells) : ([event.seed[0], event.seed[1], event.seed[2]] as Cells);
    }),
  );
  const [quietFrom, setQuietFrom] = useState(prefs.quietFrom);
  const [quietTo, setQuietTo] = useState(prefs.quietTo);

  const available = (ri: number, ci: number) =>
    ci === EMAIL_COLUMN_INDEX ? PREF_EVENTS[ri].emailAvailable : ci === SMS_COLUMN_INDEX ? PREF_EVENTS[ri].smsAvailable : true;

  const setCell = (row: number, col: number, next: boolean) => {
    if (!available(row, col)) return;
    setMatrix((prev) => prev.map((cells, ri) => (ri === row ? (cells.map((on, ci) => (ci === col ? next : on)) as Cells) : cells)));
  };
  const setColumn = (col: number, next: boolean) => {
    setMatrix((prev) =>
      prev.map((cells, ri) => cells.map((on, ci) => (ci === col ? (available(ri, ci) ? next : false) : on)) as Cells),
    );
  };
  const columnAllOn = (col: number) =>
    matrix.every((cells, ri) => !available(ri, col) || cells[col] === true);

  const enableAll = () =>
    setMatrix((prev) => prev.map((cells, ri) => cells.map((_, ci) => available(ri, ci)) as Cells));
  const emailOnly = () =>
    setMatrix((prev) =>
      prev.map((cells, ri) => cells.map((_, ci) => ci === EMAIL_COLUMN_INDEX && available(ri, ci)) as Cells),
    );

  const [testNote, setTestNote] = useState("");
  const [testing, setTesting] = useState(false);
  async function test() {
    setTesting(true);
    setTestNote("");
    try {
      const res = await sendTestNotification();
      setTestNote(TEST_RESULT_COPY[res.email]);
      router.refresh();
    } catch (e) {
      setTestNote(actionError(e));
    } finally {
      setTesting(false);
    }
  }

  const footerHandler = (action: MatrixAction): (() => void) => {
    if (action === "enable-all") return enableAll;
    if (action === "email-only") return emailOnly;
    return () => void test();
  };

  const save = () => {
    const next: Record<string, Cells> = {};
    PREF_EVENTS.forEach((event, ri) => {
      next[event.key] = matrix[ri] ?? ([event.seed[0], event.seed[1], event.seed[2]] as Cells);
    });
    return updateNotificationPrefs({ matrix: next, quietFrom, quietTo });
  };

  const cellTag = (ci: number) =>
    ci === SMS_COLUMN_INDEX ? (
      <span className="ncell-off" title={SMS_UNAVAILABLE_TITLE}>
        {SMS_UNAVAILABLE_TAG}
      </span>
    ) : (
      <span className="ncell-off" title={EMAIL_UNAVAILABLE_TITLE}>
        {EMAIL_UNAVAILABLE_TAG}
      </span>
    );

  return (
    <>
      <section className="sc">
        <div className="sc-h">
          <div>
            <div className="sc-t">{NOTIFICATIONS_CARD.title}</div>
            <div className="sc-s">{NOTIFICATIONS_CARD.sub}</div>
          </div>
        </div>

        {/* The matrix runs wall to wall: every row rule and the header band
            meet the card frame, like a ledger. */}
        <div className="sc-b sc-b--matrix">
          <div className="nwrap">
            <table className="ntab" id="nmatrix">
              <colgroup>
                <col />
                {NOTIFICATION_CHANNELS.map((channel) => (
                  <col className="nc" key={channel} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th>
                    <span className="nhead">{NOTIFICATION_EVENT_COLUMN}</span>
                  </th>
                  {NOTIFICATION_CHANNELS.map((channel, ci) => (
                    <th key={channel}>
                      <span className="nhead">{channel}</span>
                      <span className="colw">
                        <Cbx
                          checked={columnAllOn(ci)}
                          onChange={(next) => setColumn(ci, next)}
                          ariaLabel={`${NOTIFICATION_COLUMN_LABEL} ${channel}`}
                        />
                        <span className="colw-l">{NOTIFICATION_COLUMN_LABEL}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PREF_EVENTS.map((event, ri) => (
                  <tr key={event.key}>
                    <td>
                      <span className="nrow">
                        <span className="nev-ic">
                          <svg className="ic">
                            <use href={`#${NOTIFICATION_ICONS[event.key as PrefKey]}`} />
                          </svg>
                        </span>
                        <span className="nrow-t">
                          <span className="nev">{event.name}</span>
                          <span className="nsub">{event.sub}</span>
                        </span>
                      </span>
                    </td>
                    {NOTIFICATION_CHANNELS.map((channel, ci) => (
                      <td key={channel}>
                        {available(ri, ci) ? (
                          <Cbx
                            checked={matrix[ri]?.[ci] ?? false}
                            onChange={(next) => setCell(ri, ci, next)}
                            ariaLabel={`${channel} — ${event.name}`}
                          />
                        ) : (
                          cellTag(ci)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="nfoot">
            {NOTIFICATION_FOOTER_ACTIONS.map((action) => (
              <button
                key={action.action}
                className="btn btn-ghost btn-sm nfoot-b"
                type="button"
                disabled={action.action === "test" && testing}
                onClick={footerHandler(action.action)}
              >
                <svg className="ic">
                  <use href={`#${action.icon}`} />
                </svg>
                {action.label}
              </button>
            ))}
            {testNote ? (
              <span className="nfoot-note" role="status">
                {testNote}
              </span>
            ) : null}
          </div>
        </div>
        <SaveBar onSave={save} />
      </section>

      <TextsCard sms={sms} quietFrom={quietFrom} quietTo={quietTo} onQuiet={(from, to) => { setQuietFrom(from); setQuietTo(to); }} />
    </>
  );
}

/* ──────────────────────────── Text messages ──────────────────────────── */

function TextsCard({ sms, quietFrom, quietTo, onQuiet }: { sms: SmsSettingsData; quietFrom: string; quietTo: string; onQuiet: (from: string, to: string) => void }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"idle" | "code">("idle");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [extraName, setExtraName] = useState("");
  const [extraPhone, setExtraPhone] = useState("");

  async function run(label: string, fn: () => Promise<SmsActionResult>, after?: () => void) {
    setBusy(label);
    setNote("");
    setErr("");
    try {
      const r = await fn();
      if (r.ok) {
        setNote(r.note ?? "Done.");
        after?.();
        router.refresh();
      } else setErr(r.error);
    } catch (e) {
      setErr(actionError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="sc" id="texts">
      <div className="sc-h">
        <div>
          <div className="sc-t">{TEXTS_CARD.title}</div>
          <div className="sc-s">{TEXTS_CARD.sub}</div>
        </div>
        <span className="sc-badge" title={TEXTS_COPY.overage}>{TEXTS_COPY.usage(sms.monthCount, sms.allowance)}</span>
      </div>
      <div className="sc-b">
        {!sms.configured ? <p className="tx-note tx-note--warn">{TEXTS_COPY.notConfigured}</p> : null}

        {/* ── my mobile ── */}
        {sms.phone && stage === "idle" ? (
          <div className="tx-row">
            <div className="tx-row-t">
              <b>{sms.phone}</b>
              <span className={`tx-tag${sms.stopped ? " tx-tag--warn" : ""}`}>{sms.stopped ? TEXTS_COPY.stopped : TEXTS_COPY.verified}</span>
            </div>
            <div className="tx-row-a">
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => run("test", sendTestText)}>
                {TEXTS_COPY.testText}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => run("remove", removeSmsPhone)}>
                {TEXTS_COPY.remove}
              </button>
            </div>
          </div>
        ) : (
          <div className="tx-verify">
            {!sms.phone ? <p className="tx-note">{TEXTS_COPY.noPhone}</p> : null}
            <div className="fgrid">
              <Field label={TEXTS_COPY.mobileLabel} value={phone} placeholder={TEXTS_COPY.mobilePlaceholder} onChange={setPhone} disabled={stage === "code"} />
              {stage === "code" ? <Field label={TEXTS_COPY.codeLabel} value={code} placeholder="482913" onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} /> : null}
            </div>
            <div className="tx-row-a">
              {stage === "idle" ? (
                <button type="button" className="btn btn-primary btn-sm" disabled={busy !== null || phone.replace(/\D/g, "").length < 10} onClick={() => run("code", () => startPhoneVerification(phone), () => setStage("code"))}>
                  {busy === "code" ? "Sending…" : TEXTS_COPY.sendCode}
                </button>
              ) : (
                <>
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy !== null || code.length !== 6} onClick={() => run("verify", () => confirmPhoneVerification(code), () => { setStage("idle"); setCode(""); setPhone(""); })}>
                    {busy === "verify" ? "Checking…" : TEXTS_COPY.verify}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => { setStage("idle"); setCode(""); }}>
                    {TEXTS_COPY.change}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── quiet hours for texts ── */}
        <div className="tx-sub">
          <div className="tx-sub-h">
            <b>{TEXTS_COPY.quietTitle}</b>
            <span>{TEXTS_COPY.quietSub}</span>
          </div>
          <div className="tx-quiet">
            <label>
              <span>{TEXTS_COPY.quietFrom}</span>
              <input type="time" value={quietFrom} onChange={(e) => onQuiet(e.target.value || quietFrom, quietTo)} />
            </label>
            <label>
              <span>{TEXTS_COPY.quietTo}</span>
              <input type="time" value={quietTo} onChange={(e) => onQuiet(quietFrom, e.target.value || quietTo)} />
            </label>
          </div>
        </div>

        {/* ── clients, and the company's own number ── */}
        {sms.canManage ? (
          <div className="tx-sub">
            <div className="tx-sub-h">
              <b>{TEXTS_COPY.clientsTitle}</b>
              <span>{TEXTS_COPY.clientsSub}</span>
            </div>
            <div className="tx-row-a tx-row-a--left">
              <button type="button" className={`btn btn-sm ${sms.clientsOn ? "btn-primary" : "btn-ghost"}`} disabled={busy !== null || sms.clientsOn} onClick={() => run("clients", () => setClientTextsOn(true))}>
                {TEXTS_COPY.clientsOn}
              </button>
              <button type="button" className={`btn btn-sm ${sms.clientsOn ? "btn-ghost" : "btn-primary"}`} disabled={busy !== null || !sms.clientsOn} onClick={() => run("clients", () => setClientTextsOn(false))}>
                {TEXTS_COPY.clientsOff}
              </button>
            </div>
          </div>
        ) : null}
        {sms.canManage ? (
          <div className="tx-sub">
            <div className="tx-sub-h">
              <b>{TEXTS_COPY.ownTitle}</b>
              <span>{TEXTS_COPY.ownSub}</span>
            </div>
            {sms.ownNumber ? (
              <div className="tx-row">
                <div className="tx-row-t">
                  <b>{sms.ownNumber}</b>
                  <span className="tx-tag">yours</span>
                </div>
                <div className="tx-row-a">
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => run("release", releaseOwnNumber)}>
                    {TEXTS_COPY.ownRelease}
                  </button>
                </div>
              </div>
            ) : (
              <div className="tx-row-a tx-row-a--left">
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null || !sms.configured} onClick={() => run("claim", claimOwnNumber)}>
                  {busy === "claim" ? "Finding a number…" : TEXTS_COPY.ownGet}
                </button>
                <span className="tx-note" style={{ margin: 0, alignSelf: "center" }}>{TEXTS_COPY.ownCost}</span>
              </div>
            )}
          </div>
        ) : null}

        {/* ── extra office numbers ── */}
        {sms.canManage ? (
          <div className="tx-sub">
            <div className="tx-sub-h">
              <b>{TEXTS_COPY.extrasTitle}</b>
              <span>{TEXTS_COPY.extrasSub}</span>
            </div>
            {sms.extras.length ? (
              <ul className="tx-list">
                {sms.extras.map((x) => (
                  <li key={x.id} className={x.active ? "" : "is-paused"}>
                    <span className="tx-list-n">{x.name}</span>
                    <span className="tx-list-p">{x.phone}</span>
                    {x.stopped ? <span className="tx-tag tx-tag--warn">{TEXTS_COPY.stopped}</span> : !x.active ? <span className="tx-tag">paused</span> : null}
                    <span className="tx-list-a">
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => run("toggle", () => setNotificationPhoneActive(x.id, !x.active))}>
                        {x.active ? TEXTS_COPY.pause : TEXTS_COPY.resume}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => run("drop", () => removeNotificationPhone(x.id))}>
                        {TEXTS_COPY.removeExtra}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="fgrid">
              <Field label={TEXTS_COPY.extraName} value={extraName} placeholder="Dispatch" onChange={setExtraName} />
              <Field label={TEXTS_COPY.extraPhone} value={extraPhone} placeholder={TEXTS_COPY.mobilePlaceholder} onChange={setExtraPhone} />
            </div>
            <div className="tx-row-a">
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null || !extraName.trim() || extraPhone.replace(/\D/g, "").length < 10} onClick={() => run("add", () => addNotificationPhone({ name: extraName, phone: extraPhone }), () => { setExtraName(""); setExtraPhone(""); })}>
                {busy === "add" ? "Adding…" : TEXTS_COPY.addExtra}
              </button>
            </div>
          </div>
        ) : null}

        {note ? <p className="tx-note" role="status">{note}</p> : null}
        {err ? <p className="tx-note tx-note--err" role="alert">{err}</p> : null}
      </div>
    </section>
  );
}
