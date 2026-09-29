"use client";

// WHO GETS TEXTED — person by person (2026-09-29). One component for the
// desk's Settings → Texting and the handheld settings page.
//
// Owner: "if I have managers I just add their name and phone number and the
// list of what they will receive — proposal accepted, job started,
// scheduled, something cancelled… for sales most of it is appointments or
// their proposal sold, for installers when they get the job or we
// reschedule it". Three rosters by role (office, sales, crew); each person is
// a line with their mobile and their own switches; under each roster, the
// texts as they will read. The actions are actions/sms (setMemberMobile,
// clearMemberMobile, setMemberTextEvents); the events and their example
// texts are lib/notificationPrefsShared.

import { useState } from "react";
import { useRouter } from "next/navigation";

import { clearMemberMobile, setMemberMobile, setMemberTextEvents, type SmsActionResult } from "@/actions/sms";
import { textEventsFor, type PrefEventMeta, type TextAudience } from "@/lib/notificationPrefsShared";
import { roleLabel } from "@/lib/team/who";
import type { SmsRosterRow } from "@/components/v3/settings-blueprint/settings-data";
import { TEXTING_COPY, TEXTS_COPY } from "@/components/v3/settings-blueprint/settings-data";
import s from "./texting-people.module.css";

const AUDIENCES: readonly TextAudience[] = ["office", "sales", "crew"];

type Run = (label: string, fn: () => Promise<SmsActionResult>, after?: () => void) => Promise<void>;

export function TextingPeople({ roster }: { roster: SmsRosterRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<SmsRosterRow[]>(roster);
  // A saved mobile comes back through router.refresh() as new props: take them.
  const [seen, setSeen] = useState(roster);
  if (seen !== roster) {
    setSeen(roster);
    setRows(roster);
  }
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const run: Run = async (label, fn, after) => {
    setBusy(label);
    setNote("");
    setErr("");
    try {
      const r = await fn();
      if (r.ok) {
        setNote(r.note ?? "Saved.");
        after?.();
        router.refresh();
      } else setErr(r.error);
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : "Couldn't save. Try again.");
    } finally {
      setBusy(null);
    }
  };
  const flip = (row: SmsRosterRow, keys: string[], on: boolean) => {
    const patch = Object.fromEntries(keys.map((k) => [k, on]));
    setRows((rs) => rs.map((r) => (r.userId === row.userId ? { ...r, cells: { ...r.cells, ...patch } } : r)));
    void run(`${row.userId}:ev`, () => setMemberTextEvents(row.userId, patch));
  };
  return (
    <div className={s.root} data-texting-people>
      {AUDIENCES.map((aud) => {
        const events = textEventsFor(aud);
        const people = rows.filter((r) => r.audience === aud);
        const copy = TEXTING_COPY.sections[aud];
        return (
          <div key={aud} className={s.sec} data-audience={aud}>
            <div className={s.secH}>
              <b>{copy.title}</b>
              <span>{copy.sub}</span>
            </div>
            {people.length ? (
              <div className={s.people}>
                {people.map((r) => (
                  <PersonRow key={r.userId} row={r} events={events} busy={busy} run={run} onFlip={flip} />
                ))}
              </div>
            ) : (
              <p className={s.note}>{TEXTING_COPY.emptySection}</p>
            )}
            <details className={s.ex}>
              <summary>{TEXTING_COPY.examplesTitle}</summary>
              <ul>
                {events.map((e) => (
                  <li key={e.key}>
                    <b>{e.name}</b>
                    <q>{e.example}</q>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        );
      })}
      {note ? <p className={s.note} role="status">{note}</p> : null}
      {err ? <p className={`${s.note} ${s.noteErr}`} role="alert">{err}</p> : null}
    </div>
  );
}

function PersonRow({
  row,
  events,
  busy,
  run,
  onFlip,
}: {
  row: SmsRosterRow;
  events: readonly PrefEventMeta[];
  busy: string | null;
  run: Run;
  onFlip: (row: SmsRosterRow, keys: string[], on: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState("");
  const texting = Boolean(row.phone) && !row.stopped;
  const onCount = events.filter((e) => row.cells[e.key]).length;
  const inputId = `tx-mobile-${row.userId}`;
  return (
    <div className={`${s.person}${texting ? "" : ` ${s.quiet}`}`} data-member={row.userId}>
      <div className={s.head}>
        <span className={s.who}>
          <b>{row.name}</b>
          <em>
            {roleLabel(row.role)}
            {row.isMe ? ` · ${TEXTING_COPY.whoMe}` : ""}
          </em>
        </span>
        <span className={s.phone}>
          {row.phone ? (
            <>
              <b>{row.phone}</b>
              <span className={`${s.tag}${row.stopped ? ` ${s.tagWarn}` : ""}`}>{row.stopped ? TEXTS_COPY.stopped : row.phoneBy === "office" ? TEXTING_COPY.byOffice : TEXTING_COPY.bySelf}</span>
            </>
          ) : row.phoneOnFile ? (
            <>
              <b>{row.phoneOnFile}</b>
              <span className={`${s.tag} ${s.tagWarn}`}>{TEXTING_COPY.onFileOff}</span>
            </>
          ) : (
            <span className={`${s.tag} ${s.tagWarn}`}>{TEXTING_COPY.noMobileLong}</span>
          )}
        </span>
        {!editing ? (
          <span className={s.acts}>
            {row.phoneOnFile && !row.phone ? (
              <button type="button" className={`${s.btn} ${s.btnPrimary}`} disabled={busy !== null} onClick={() => run(`${row.userId}:on`, () => setMemberMobile(row.userId, row.phoneOnFile!))}>
                {TEXTING_COPY.turnOn}
              </button>
            ) : null}
            <button
              type="button"
              className={`${s.btn}${row.phone || row.phoneOnFile ? "" : ` ${s.btnPrimary}`}`}
              disabled={busy !== null}
              onClick={() => {
                setEditing(true);
                setPhone("");
              }}
            >
              {row.phone || row.phoneOnFile ? TEXTING_COPY.changeMobile : TEXTING_COPY.addMobile}
            </button>
            {row.phone ? (
              <button type="button" className={s.btn} disabled={busy !== null} onClick={() => run(`${row.userId}:off`, () => clearMemberMobile(row.userId))}>
                {TEXTING_COPY.stopTexts}
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      {editing ? (
        <div className={s.edit}>
          <label htmlFor={inputId}>{TEXTS_COPY.mobileLabel}</label>
          <input
            id={inputId}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={phone}
            placeholder={TEXTS_COPY.mobilePlaceholder}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && phone.replace(/\D/g, "").length >= 10) void run(`${row.userId}:mobile`, () => setMemberMobile(row.userId, phone), () => setEditing(false));
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <button type="button" className={`${s.btn} ${s.btnPrimary}`} disabled={busy !== null || phone.replace(/\D/g, "").length < 10} onClick={() => run(`${row.userId}:mobile`, () => setMemberMobile(row.userId, phone), () => setEditing(false))}>
            {busy === `${row.userId}:mobile` ? "Saving…" : TEXTING_COPY.saveMobile}
          </button>
          <button type="button" className={s.btn} disabled={busy !== null} onClick={() => setEditing(false)}>
            {TEXTING_COPY.cancel}
          </button>
        </div>
      ) : null}
      <div className={s.evs} role="group" aria-label={`Texts to ${row.name}`}>
        {events.map((e) => {
          const on = Boolean(row.cells[e.key]);
          return (
            <button key={e.key} type="button" className={`${s.ev}${on ? ` ${s.evOn}` : ""}`} aria-pressed={on} title={e.sub} data-event={e.key} onClick={() => onFlip(row, [e.key], !on)}>
              <i aria-hidden="true" />
              {e.name}
            </button>
          );
        })}
        <span className={s.allNone}>
          <button type="button" className={s.link} disabled={onCount === events.length} onClick={() => onFlip(row, events.map((e) => e.key), true)}>
            {TEXTING_COPY.all}
          </button>
          <button type="button" className={s.link} disabled={onCount === 0} onClick={() => onFlip(row, events.map((e) => e.key), false)}>
            {TEXTING_COPY.none}
          </button>
        </span>
      </div>
    </div>
  );
}
