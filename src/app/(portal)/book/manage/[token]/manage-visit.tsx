"use client";

// MANAGE A BOOKED VISIT (2026-09-23) — the customer's own link: move it to
// another open time, or cancel it. The desk sees either at once.

import { useState, useTransition } from "react";
import { availabilityForToken, cancelBookingPublic, rescheduleBookingPublic, type PublicDay } from "@/actions/booking";

const BTN = "rounded-[10px] bg-[color:var(--ink,#111)] px-4 py-2.5 text-[13px] font-medium text-[color:var(--paper,#fff)] disabled:opacity-50";
const GHOST = "rounded-[10px] border border-[color:var(--ink,#111)] px-4 py-2.5 text-[13px] font-medium disabled:opacity-50";

export function ManageVisit({ token, status, when }: { token: string; status: string; when: string }) {
  const [days, setDays] = useState<PublicDay[] | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [state, setState] = useState<{ status: string; when: string }>({ status, when });
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const done = state.status === "CANCELED";

  const openTimes = () =>
    start(async () => {
      const r = await availabilityForToken(token);
      if (r.ok) {
        setDays(r.days);
        setDay(r.days[0]?.day ?? null);
      } else setMsg("Could not load open times.");
    });
  const move = (iso: string) =>
    start(async () => {
      const r = await rescheduleBookingPublic(token, iso);
      if (r.ok && r.when) {
        setState({ status: "RESCHEDULED", when: r.when });
        setDays(null);
        setMsg("Moved. A confirmation is on its way.");
      } else setMsg(r.error ?? "Could not move it.");
    });
  const cancel = () =>
    start(async () => {
      const r = await cancelBookingPublic(token);
      if (r.ok) setState((s) => ({ ...s, status: "CANCELED" }));
      else setMsg("Could not cancel.");
    });

  return (
    <div data-manage-status={state.status}>
      <div className="text-[18px] font-semibold">{done ? "Canceled" : state.when}</div>
      {msg && <p className="mt-2 text-[13px]">{msg}</p>}
      {!done && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={BTN} onClick={openTimes} disabled={pending} data-manage-move>Pick another time</button>
          <button type="button" className={GHOST} onClick={cancel} disabled={pending} data-manage-cancel>Cancel the visit</button>
        </div>
      )}
      {days && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2 mb-3">
            {days.map((d) => (
              <button key={d.day} type="button" onClick={() => setDay(d.day)} className={`rounded-[10px] border px-3 py-2 text-[13px] ${day === d.day ? "border-[color:var(--ink,#111)] bg-[color:var(--ink,#111)] text-white" : "border-[color:var(--ink-line,#ddd)]"}`}>{d.weekday.slice(0, 3)} {d.day.slice(5).replace("-", "/")}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-manage-slots>
            {(days.find((d) => d.day === day)?.slots ?? []).map((s) => (
              <button key={s.iso} type="button" onClick={() => move(s.iso)} disabled={pending} className="rounded-[10px] border border-[color:var(--ink-line,#ddd)] px-3 py-2 text-[13px] hover:border-[color:var(--ink,#111)]">{s.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
