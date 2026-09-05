"use client";
import { useEffect, useRef, useState } from "react";
import { dateInZone, shiftDate } from "@/lib/traffic-query";
import s from "./traffic.module.css";

export function TrafficDatePicker({ from, to, timezone, onChange }: { from: string; to: string; timezone: string; onChange: (from: string, to: string) => void }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(from.slice(0, 7) + "-01");
  const [choosingEnd, setChoosingEnd] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const today = dateInZone(new Date(), timezone);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); } };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  const first = shiftDate(month, -(new Date(month + "T12:00:00Z").getUTCDay() + 6) % 7);
  const move = (delta: number) => { const d = new Date(month + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + delta); setMonth(d.toISOString().slice(0, 10)); };
  function pick(day: string) {
    if (!choosingEnd || day < from) { onChange(day, day); setChoosingEnd(true); }
    else { onChange(from, day); setChoosingEnd(false); }
  }
  return <div className={s.dateRoot} ref={root}>
    <button ref={toggle} className={s.dateButton} aria-expanded={open} aria-label={`Date range ${from} to ${to}`} onClick={() => { setOpen(!open); setChoosingEnd(false); }}>{from} <span>to</span> {to}<span aria-hidden="true">+</span></button>
    {open && <div className={s.calendar} role="region" aria-label="Choose date range">
      <div className={s.calendarHead}><button type="button" aria-label="Previous month" onClick={() => move(-1)}>&lt;</button><strong>{new Date(month + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</strong><button type="button" aria-label="Next month" disabled={month.slice(0, 7) >= today.slice(0, 7)} onClick={() => move(1)}>&gt;</button></div>
      <p>{choosingEnd ? "Choose the end date" : "Choose the start date"}</p>
      <div className={s.calendarGrid}>{["M", "T", "W", "T", "F", "S", "S"].map((day, i) => <span key={i}>{day}</span>)}
        {Array.from({ length: 42 }, (_, i) => shiftDate(first, i)).map(day => <button type="button" key={day} aria-label={day} aria-pressed={day >= from && day <= to} disabled={day > today} data-outside={day.slice(0, 7) !== month.slice(0, 7)} onClick={() => pick(day)}>{Number(day.slice(8))}</button>)}
      </div>
      <div className={s.dateInputs}><label>From<input aria-label="Start date" placeholder="YYYY-MM-DD" maxLength={10} value={from} onChange={e => onChange(e.target.value, to)}/></label><label>To<input aria-label="End date" placeholder="YYYY-MM-DD" maxLength={10} value={to} onChange={e => onChange(from, e.target.value)}/></label></div>
      <button className={s.primary} type="button" onClick={() => { setOpen(false); toggle.current?.focus(); }}>Use these dates</button>
    </div>}
  </div>;
}
