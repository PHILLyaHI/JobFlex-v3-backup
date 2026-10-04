// THE CALENDAR (2026-10-03): this month and the next two, drawn on the server
// — planned projects, contractors' visits, the requests sent, proposals and
// hires on their days. A link hands the same to the phone's own calendar.
import type { HomeCalendarItem } from "@/lib/home/portal";
import s from "./home.module.css";

const KIND: Record<HomeCalendarItem["kind"], string> = { plan: s.dotPlan, visit: s.dotVisit, request: s.dotRequest, proposal: s.dotProposal, hired: s.dotHired };
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

function monthGrid(year: number, month: number): Array<string | null> {
  const first = new Date(Date.UTC(year, month, 1));
  const lead = first.getUTCDay();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: Array<string | null> = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function Calendar({ items, timeZone, icsHref, months: count = 3 }: { items: HomeCalendarItem[]; timeZone: string; icsHref: string; months?: number }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1];
  const byDay = new Map<string, HomeCalendarItem[]>();
  for (const it of items) byDay.set(it.date, [...(byDay.get(it.date) ?? []), it]);
  const months = Array.from({ length: count }, (_, i) => i).map((i) => {
    const d = new Date(Date.UTC(ty, tm + i, 1));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), label: d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) };
  });
  const upcoming = items.filter((it) => it.date >= today).slice(0, 8);
  return (
    <div className={s.calendar}>
      <div className={s.calHead}>
        <a className={s.link} href={icsHref}>Add to my phone&apos;s calendar</a>
      </div>
      <div className={s.months}>
        {months.map((mo) => (
          <div key={mo.label} className={s.month}>
            <div className={s.monthName}>{mo.label}</div>
            <div className={s.grid} role="grid" aria-label={mo.label}>
              {DAYS.map((d, i) => <span key={i} className={s.dow} aria-hidden="true">{d}</span>)}
              {monthGrid(mo.y, mo.m).map((ymd, i) => {
                const list = ymd ? byDay.get(ymd) ?? [] : [];
                return (
                  <span key={i} className={`${s.day} ${ymd === today ? s.today : ""} ${!ymd ? s.pad : ""}`} title={list.map((x) => x.label).join("\n") || undefined}>
                    {ymd ? Number(ymd.slice(8, 10)) : ""}
                    {list.length > 0 && (
                      <span className={s.dots} aria-hidden="true">
                        {list.slice(0, 3).map((x, j) => <i key={j} className={KIND[x.kind]} />)}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className={s.legend}>
        <span><i className={s.dotPlan} /> planned</span>
        <span><i className={s.dotVisit} /> visit</span>
        <span><i className={s.dotProposal} /> proposal</span>
        <span><i className={s.dotHired} /> hired</span>
        <span><i className={s.dotRequest} /> request sent</span>
      </div>
      {upcoming.length > 0 && (
        <ul className={s.upcoming} aria-label="Coming up">
          {upcoming.map((it, i) => (
            <li key={i}>
              <span className={s.mono}>{new Date(`${it.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</span>
              <i className={KIND[it.kind]} aria-hidden="true" />
              {it.href ? <a className={s.link} href={it.href}>{it.label}</a> : <span>{it.label}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
