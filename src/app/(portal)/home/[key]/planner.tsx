"use client";

// PLAN AHEAD (2026-10-03): the projects a homeowner means to do, with a month
// (or a day) and a note. Each one can be submitted in one tap (the intake
// opens prefilled), marked done, or dropped. The server (actions/homePortal)
// keeps them and sends the reminder when the month comes.

import * as React from "react";
import { useRouter } from "next/navigation";
import { addHomePlan, updateHomePlan } from "@/actions/homePortal";
import type { HomePlanView } from "@/lib/home/portal";
import s from "./home.module.css";

const IDEAS = ["Garage epoxy floor", "Exterior paint", "New gutters", "Kitchen backsplash", "Bathroom remodel", "Fence repair", "AC tune-up", "Hardwood floors"];

function nextMonths(n: number): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  const d = new Date();
  d.setUTCDate(1);
  for (let i = 0; i < n; i++) {
    const v = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push({ value: v, label: d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) });
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

export function Planner({ homeKey, plans }: { homeKey: string; plans: HomePlanView[] }) {
  const router = useRouter();
  const months = React.useMemo(() => nextMonths(18), []);
  const [title, setTitle] = React.useState("");
  const [when, setWhen] = React.useState(months[1]?.value ?? months[0].value);
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = React.useState(plans.length === 0);

  async function add() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await addHomePlan({ key: homeKey, title, when, notes: notes || undefined });
      setNote({ ok: r.ok, text: r.ok ? r.note : r.error });
      if (r.ok) {
        setTitle("");
        setNotes("");
        router.refresh();
      }
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : "Couldn't save that — try again." });
    } finally {
      setBusy(false);
    }
  }

  async function change(id: string, status: "DONE" | "DROPPED") {
    if (busy) return;
    setBusy(true);
    try {
      const r = await updateHomePlan({ key: homeKey, id, status });
      setNote({ ok: r.ok, text: r.ok ? r.note : r.error });
      if (r.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const planned = plans.filter((p) => p.status === "PLANNED");
  const submitted = plans.filter((p) => p.status === "SUBMITTED");

  return (
    <div className={s.planner}>
      {planned.length > 0 && (
        <ul className={s.planList}>
          {planned.map((p) => (
            <li key={p.id} className={s.plan}>
              <div className={s.rowMain}>
                <div className={s.rowTitle}>{p.title}</div>
                <div className={s.mono}>{p.when}{p.remindAt ? " · reminder by email" : ""}</div>
                {p.notes && <div className={s.planNote}>{p.notes}</div>}
              </div>
              <div className={s.actions}>
                <a className={s.btnPrimary} href={`/homeowner?home=${encodeURIComponent(homeKey)}&plan=${encodeURIComponent(p.id)}`}>Submit it now</a>
                <button type="button" className={s.btnText} disabled={busy} onClick={() => void change(p.id, "DONE")}>Done</button>
                <button type="button" className={s.btnText} disabled={busy} onClick={() => void change(p.id, "DROPPED")}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {submitted.length > 0 && (
        <p className={s.mono}>
          Submitted from here: {submitted.map((p) => (p.token ? <a key={p.id} className={s.link} href={`/request/${encodeURIComponent(p.token)}`}>{p.title}</a> : p.title)).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, ", ", el] : [el]), [])}
        </p>
      )}

      {!open ? (
        <div className={s.actions}>
          <button type="button" className={s.btnGhost} onClick={() => setOpen(true)}>Plan another project</button>
        </div>
      ) : (
        <form
          className={s.planForm}
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <label className={s.field}>
            <span>What</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={IDEAS[plans.length % IDEAS.length]} maxLength={120} required list="plan-ideas" name="plan-title" autoComplete="off" />
            <datalist id="plan-ideas">{IDEAS.map((x) => <option key={x} value={x} />)}</datalist>
          </label>
          <label className={s.field}>
            <span>When</span>
            <select value={when} onChange={(e) => setWhen(e.target.value)} name="plan-when">
              {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          <label className={`${s.field} ${s.fieldWide}`}>
            <span>Notes (optional)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Budget in mind, colours, what you've seen…" maxLength={1000} name="plan-notes" autoComplete="off" />
          </label>
          <div className={s.actions}>
            <button type="submit" className={s.btnPrimary} disabled={busy || title.trim().length < 2}>{busy ? "Saving…" : "Add to my plans"}</button>
            {planned.length > 0 && <button type="button" className={s.btnText} onClick={() => setOpen(false)}>Cancel</button>}
          </div>
        </form>
      )}
      {note && <p className={note.ok ? s.ok : s.err} role={note.ok ? "status" : "alert"}>{note.text}</p>}
    </div>
  );
}
