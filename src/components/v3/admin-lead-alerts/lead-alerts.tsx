"use client";

// ADMIN · LEAD ALERTS — who hears that a homeowner request needs a person,
// and when (2026-10-03). Same card dress as /admin/integrations/twilio; the
// rules live in lib/leadCenter/alerts.

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  addLeadAlertPhone,
  confirmLeadAlertPhone,
  removeLeadAlertPhone,
  resendLeadAlertCode,
  saveLeadAlertEmails,
  sendLeadAlertTest,
  setLeadAlertTexts,
  setLeadAlertTiming,
  updateLeadAlertPhone,
  type LeadAlertsResult,
} from "@/actions/adminLeadAlerts";
import { ago } from "@/components/v3/admin-overview/admin-ui";
import { useAdminMotion } from "@/components/v3/admin-overview/admin-motion";
import s from "@/components/v3/admin-overview/admin-shared.module.css";
import i from "@/components/v3/admin-integrations/integrations.module.css";
import a from "./lead-alerts.module.css";

export type LeadAlertsPageData = {
  emails: string[];
  emailsInUse: string[];
  defaultEmails: string[];
  emailReady: boolean;
  textsOn: boolean;
  phones: { id: string; name: string; phone: string; confirmed: boolean; on: boolean; quietNights: boolean }[];
  /** off — no Twilio on this server; waiting — JobFlex's number not approved yet. */
  texting: "off" | "waiting" | "approved";
  sender: string | null;
  remindAfterMin: number;
  timeZone: string;
  quietNow: boolean;
  waiting: number;
  remindChoices: number[];
  zones: { value: string; label: string }[];
  recent: { id: string; to: string; kind: string; status: string; error: string | null; at: string }[];
};

const CENTER = "/admin/lead-center" as Route;

const remindLabel = (m: number) => (m === 0 ? "Never" : m < 60 ? `After ${m} minutes` : m === 60 ? "After 1 hour" : `After ${m / 60} hours`);

/** What a SKIPPED alert text's reason means. */
function whyWords(error: string | null): string | null {
  if (!error) return null;
  if (error === "no-number") return "JobFlex's number isn't approved yet";
  if (error === "not-configured") return "no Twilio on this server";
  if (error.startsWith("cap-")) return "daily limit reached";
  return error;
}

type Note = { ok: boolean; text: string; at: string };

export function LeadAlertsContent({ data }: { data: LeadAlertsPageData }) {
  useAdminMotion();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<Note | null>(null);
  const [emails, setEmails] = useState(data.emails.join(", "));
  const [remind, setRemind] = useState(data.remindAfterMin);
  const [zone, setZone] = useState(data.timeZone);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [busyAt, setBusyAt] = useState<string | null>(null);
  const now = new Date().toISOString();
  // The switches move the moment they are clicked and hold until the page has
  // re-read the saved settings; a refused save puts them back.
  type Flip = { textsOn?: boolean; phone?: { id: string; on?: boolean; quietNights?: boolean } };
  const [view, flip] = useOptimistic({ textsOn: data.textsOn, phones: data.phones }, (cur, f: Flip) => ({
    textsOn: f.textsOn ?? cur.textsOn,
    phones: f.phone ? cur.phones.map((p) => (p.id === f.phone?.id ? { ...p, ...f.phone } : p)) : cur.phones,
  }));

  /** Run one action; its answer shows in the card it came from. */
  const run = (at: string, fn: () => Promise<LeadAlertsResult>, after?: () => void, optimistic?: Flip) =>
    start(async () => {
      setNote(null);
      setBusyAt(at);
      if (optimistic) flip(optimistic);
      try {
        const r = await fn();
        setNote(r.ok ? { ok: true, text: r.note, at } : { ok: false, text: r.error, at });
        if (r.ok) {
          after?.();
          router.refresh();
        }
      } catch (e) {
        setNote({ ok: false, text: e instanceof Error ? e.message : String(e), at });
      } finally {
        setBusyAt(null);
      }
    });

  const said = (at: string) =>
    note && note.at === at ? (
      <p className={note.ok ? a.ok : i.modeErr} role={note.ok ? "status" : "alert"}>
        {note.text}
      </p>
    ) : null;

  const textingChip =
    data.texting === "approved"
      ? { cls: "chip ok", label: "JobFlex number approved" }
      : data.texting === "waiting"
        ? { cls: `chip ${s.chipMuted}`, label: "Waiting for Twilio's approval" }
        : { cls: `chip ${s.chipMuted}`, label: "No Twilio on this server" };
  const ready = view.phones.filter((p) => p.confirmed && p.on).length;
  const zoneLabel = data.zones.find((z) => z.value === data.timeZone)?.label ?? data.timeZone;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Lead Center</div>
          <h1 className="page-title">Lead alerts</h1>
        </div>
        <div className="page-actions">
          <Link className="btn btn-ghost" href={CENTER}>
            Lead Center
          </Link>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run("test", sendLeadAlertTest)}>
            {busyAt === "test" ? "Sending…" : "Send a test alert"}
          </button>
        </div>
      </div>
      <p className={a.intro}>
        Every homeowner request that needs a person — new, back in the queue or still waiting — reaches the people below.{" "}
        {data.waiting ? `${data.waiting} ${data.waiting === 1 ? "request is" : "requests are"} waiting right now.` : "Nothing is waiting right now."}
      </p>
      {said("test")}

      {/* ── when ── */}
      <div className="card">
        <div className={`card-head ${a.head}`}>
          <div className="card-titles">
            <div className="card-title">When</div>
            <div className="card-sub">Test leads never alert — use Send a test alert.</div>
          </div>
        </div>
        <hr className="card-rule" />
        <dl className={a.when}>
          <div>
            <dt>New request</dt>
            <dd>Right away — says whether it waits for you or was offered to a shop automatically.</dd>
          </div>
          <div>
            <dt>Back in the queue</dt>
            <dd>Right away — the homeowner asked for another contractor, a shop passed, or an offer&apos;s 24 hours ran out.</dd>
          </div>
          <div>
            <dt>Still waiting</dt>
            <dd>
              <select className={a.select} value={remind} onChange={(e) => setRemind(Number(e.target.value))} aria-label="Remind about a waiting request">
                {data.remindChoices.map((m) => (
                  <option key={m} value={m}>
                    {remindLabel(m)}
                  </option>
                ))}
              </select>
              <span> in the queue — once per wait, everything still waiting in one message.</span>
            </dd>
          </div>
          <div>
            <dt>Quiet nights</dt>
            <dd>
              <span>9 PM–7 AM, </span>
              <select className={a.select} value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Time zone for quiet nights">
                {data.zones.map((z) => (
                  <option key={z.value} value={z.value}>
                    {z.label} time
                  </option>
                ))}
              </select>
              <span>: a phone with quiet nights gets no texts, then one summary at 7 AM if anything is waiting. Email always arrives.</span>
            </dd>
          </div>
        </dl>
        <div className={i.actions}>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={pending || (remind === data.remindAfterMin && zone === data.timeZone)}
            onClick={() => run("when", () => setLeadAlertTiming({ remindAfterMin: remind, timeZone: zone }))}
          >
            Save
          </button>
          {data.quietNow ? <span className={i.modeNote}>Quiet hours now ({zoneLabel})</span> : null}
        </div>
        {said("when")}
      </div>

      {/* ── email ── */}
      <div className="card">
        <div className={`card-head ${a.head}`}>
          <div className="card-titles">
            <div className="card-title">Email</div>
            <div className="card-sub">Every alert. Now going to {data.emailsInUse.join(", ") || "nobody"}.</div>
          </div>
          <span className={data.emailReady ? "chip ok" : `chip ${s.chipMuted}`}>{data.emailReady ? "Email on" : "No email transport here"}</span>
        </div>
        <hr className="card-rule" />
        <div className={i.form}>
          <label className={i.field}>
            <span>Send alerts to (commas between addresses)</span>
            <input
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder={data.defaultEmails.join(", ")}
              spellCheck={false}
              autoComplete="off"
              name="lead-alert-emails"
              inputMode="email"
            />
          </label>
        </div>
        <div className={i.actions}>
          <button type="button" className="btn btn-ghost" disabled={pending || emails.trim() === data.emails.join(", ")} onClick={() => run("email", () => saveLeadAlertEmails(emails))}>
            Save
          </button>
          <span className={i.modeNote}>Empty = {data.defaultEmails.join(", ")}</span>
        </div>
        {said("email")}
      </div>

      {/* ── texts ── */}
      <div className="card">
        <div className={`card-head ${a.head}`}>
          <div className="card-titles">
            <div className="card-title">Texts</div>
            <div className="card-sub">
              {view.textsOn ? `On — ${ready} ${ready === 1 ? "phone gets" : "phones get"} them.` : "Off — only email goes."}
            </div>
          </div>
          <span className={textingChip.cls}>{textingChip.label}</span>
        </div>
        <hr className="card-rule" />
        <label className={`${i.check} ${a.switch}`}>
          <input
            type="checkbox"
            checked={view.textsOn}
            disabled={pending}
            onChange={(e) => {
              const on = e.target.checked;
              run("texts", () => setLeadAlertTexts(on), undefined, { textsOn: on });
            }}
          />
          <span>Text the phones below</span>
        </label>
        <p className={a.fine}>
          Texts leave from JobFlex&apos;s own number{data.sender ? `, ${data.sender}` : ""}. Its Twilio application covers lead texts to contractors, not
          texts to JobFlex&apos;s own team — turning this on is the owner&apos;s call.
          {data.texting === "waiting" ? " Until Twilio approves the number, no text goes out; the email still does." : ""}
          {data.texting === "off" ? " Texting isn't set up on this server, so no text goes out here." : ""}
        </p>
        {said("texts")}

        <div className={a.phones}>
          {view.phones.length === 0 ? <p className={i.modeNote}>No phones yet.</p> : null}
          {view.phones.map((p) => (
            <div className={a.phone} key={p.id}>
              <div className={a.who}>
                <b>{p.name || p.phone}</b>
                <span className={s.envk}>{p.phone}</span>
              </div>
              <span className={p.confirmed ? "chip ok" : `chip ${s.chipMuted}`}>{p.confirmed ? "Confirmed" : "Needs the code"}</span>
              {p.confirmed ? (
                <div className={a.toggles}>
                  <label className={i.check}>
                    <input
                      type="checkbox"
                      checked={p.on}
                      disabled={pending}
                      onChange={(e) => {
                        const on = e.target.checked;
                        run(`phone:${p.id}`, () => updateLeadAlertPhone(p.id, { on }), undefined, { phone: { id: p.id, on } });
                      }}
                    />
                    <span>Gets alerts</span>
                  </label>
                  <label className={i.check}>
                    <input
                      type="checkbox"
                      checked={p.quietNights}
                      disabled={pending}
                      onChange={(e) => {
                        const quietNights = e.target.checked;
                        run(`phone:${p.id}`, () => updateLeadAlertPhone(p.id, { quietNights }), undefined, { phone: { id: p.id, quietNights } });
                      }}
                    />
                    <span>Quiet nights</span>
                  </label>
                </div>
              ) : (
                <div className={a.code}>
                  <input
                    value={codes[p.id] ?? ""}
                    onChange={(e) => setCodes((c) => ({ ...c, [p.id]: e.target.value }))}
                    placeholder="Code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    aria-label={`Code texted to ${p.phone}`}
                    name={`lead-alert-code-${p.id}`}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={pending || (codes[p.id] ?? "").replace(/\D/g, "").length < 4}
                    onClick={() => run(`phone:${p.id}`, () => confirmLeadAlertPhone(p.id, codes[p.id] ?? ""), () => setCodes((c) => ({ ...c, [p.id]: "" })))}
                  >
                    Confirm
                  </button>
                  <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => run(`phone:${p.id}`, () => resendLeadAlertCode(p.id))}>
                    New code
                  </button>
                </div>
              )}
              <button type="button" className={`btn btn-ghost ${a.remove}`} disabled={pending} onClick={() => run("texts", () => removeLeadAlertPhone(p.id))}>
                Remove
              </button>
              {said(`phone:${p.id}`)}
            </div>
          ))}
        </div>

        <div className={a.add}>
          <label className={i.field}>
            <span>Name</span>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Who carries it — e.g. Office" autoComplete="off" name="lead-alert-name" maxLength={60} />
          </label>
          <label className={i.field}>
            <span>Mobile number</span>
            <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="(425) 555-0100" inputMode="tel" autoComplete="off" name="lead-alert-phone" />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || newPhone.replace(/\D/g, "").length < 10}
            onClick={() =>
              run("add", () => addLeadAlertPhone({ name: newName, phone: newPhone }), () => {
                setNewName("");
                setNewPhone("");
              })
            }
          >
            {busyAt === "add" ? "Texting…" : "Text a code"}
          </button>
        </div>
        {said("add")}
        <p className={a.fine}>A phone gets alerts only after the code texted to it is typed back here. Up to 25 JobFlex texts a day reach one phone.</p>
      </div>

      {/* ── what went out ── */}
      <div className="card">
        <div className={`card-head ${a.head}`}>
          <div className="card-titles">
            <div className="card-title">Recent alert texts</div>
            <div className="card-sub">What happened to each one.</div>
          </div>
        </div>
        <hr className="card-rule" />
        {data.recent.length === 0 ? (
          <p className={i.modeNote}>No alert texts yet.</p>
        ) : (
          data.recent.map((r) => (
            <div className={`${s.row} ${i.iRow}`} key={r.id}>
              <div className={s.rowMain}>
                <div className={s.rowTitle}>
                  {r.kind || "alert"} → {r.to}
                </div>
              </div>
              <span
                className={
                  r.status === "DELIVERED" || r.status === "SENT"
                    ? "chip ok"
                    : `chip ${r.status === "FAILED" || r.status === "UNDELIVERED" ? s.chipDanger : s.chipMuted}`
                }
              >
                {r.status.toLowerCase()}
              </span>
              <div className={i.keys}>
                <span className={s.envk}>{ago(r.at, now)}</span>
                {whyWords(r.error) ? <span className={s.envk}>{whyWords(r.error)}</span> : null}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
