"use client";
/**
 * AD → MONEY (2026-10-04), under the analyst's ads table: for each ad and
 * campaign, the accounts it brought since the ad launch and what they are
 * now — on a trial, paying, lapsed (lib/traffic-money, from the database).
 */
import type { AdMoney, MoneyRow } from "@/lib/traffic-money";
import s from "./traffic.module.css";

const sinceLabel = (iso: string, timezone: string) => { try { return new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric" }).format(new Date(iso)); } catch { return iso.slice(0, 10); } };
const visits = (r: MoneyRow) => (r.visits === null ? "—" : r.visits);

function Table({ caption, first, rows }: { caption: string; first: string; rows: MoneyRow[] }) {
  return <div className={s.tableScroll}>
    <table className={`${s.table} ${s.analystTable}`}>
      <caption className={s.analystCaption}>{caption}</caption>
      <thead><tr><th>{first}</th><th>Visits (window)</th><th>Signups</th><th>Trial</th><th>Paying</th><th>Lapsed</th><th>Other</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.key}><td>{r.name}{r.campaign && r.campaign !== r.key ? <small> · campaign {r.campaign}</small> : null}</td><td>{visits(r)}</td><td><b>{r.signups}</b></td><td>{r.trial}</td><td><b>{r.paying}</b></td><td>{r.lapsed}</td><td>{r.other}</td></tr>)}</tbody>
    </table>
  </div>;
}

export function AnalystMoney({ money, timezone }: { money: AdMoney | undefined; timezone: string }) {
  if (!money) return null;
  const since = sinceLabel(money.since, timezone);
  const t = money.total, u = money.untagged;
  if (!t.signups) return <div className={s.analystEmpty}>Ads → money: no account made since {since} yet.</div>;
  return <>
    {money.ads.length > 0
      ? <Table caption={`Ads → money · accounts since ${since}, what they are now`} first="Ad" rows={money.ads}/>
      : <div className={s.analystEmpty}>No account since {since} carries an ad tag yet.</div>}
    {money.campaigns.length > 0 && <Table caption="Campaigns → money" first="Campaign" rows={money.campaigns}/>}
    <p className={s.footnote}>{t.signups} {t.signups === 1 ? "account" : "accounts"} since {since}: {t.trial} on a trial, {t.paying} paying, {t.lapsed} lapsed, {t.other} other{u.signups ? `; ${u.signups} carry no ad tag` : ""}. From the database — the tags the landing kept on each organization and its subscription now; visits are the analyst&apos;s window.</p>
  </>;
}
