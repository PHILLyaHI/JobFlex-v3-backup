"use client";

// ADMIN TRAFFIC — /admin/traffic, blueprint.
//
// Visitor and pageview numbers exist ONLY when PostHog is configured and
// answered (see src/lib/posthog.ts). Otherwise the page shows a connect card
// with the three env names and the local signals the database does know:
// organization signups by day and promo-link clicks. No visitor count is
// ever estimated from local data.

import type { Route } from "next";
import Link from "next/link";
import type { AdminTrafficData } from "@/actions/adminStats";
import s from "@/components/v3/admin-overview/admin-shared.module.css";
import { BarChart } from "@/components/v3/admin-overview/admin-charts";
import { useAdminMotion } from "@/components/v3/admin-overview/admin-motion";
import { Ic, mdLabel } from "@/components/v3/admin-overview/admin-ui";

const ADMIN = "/admin" as Route;
const INFLUENCERS = "/admin/influencers" as Route;

const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

export function AdminTrafficContent({ data }: { data: AdminTrafficData }) {
  useAdminMotion();

  const t = data.traffic;
  const live = t.status === "ok" ? t.data : null;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Platform · Last 30 days</div>
          <h1 className="page-title">Traffic</h1>
        </div>
        <div className={s.headSide}>
          {t.status === "ok" && <span className="chip ok">PostHog · Live</span>}
          {t.status === "error" && <span className={`chip ${s.chipDanger}`}>PostHog · Error</span>}
          {t.status === "disabled" && <span className={`chip ${s.chipMuted}`}>Not connected</span>}
          <Link className="btn btn-ghost" href={ADMIN}>
            <Ic id="i-grid" />
            Overview
          </Link>
        </div>
      </div>

      {live && (
        <div className="kpi-grid">
          <div className="kpi">
            <div className="kpi-lbl">Visitors · 24h</div>
            <div className="kpi-val accent">{live.visitors24h}</div>
          </div>
          <div className="kpi">
            <div className="kpi-lbl">Visitors · 7d</div>
            <div className="kpi-val">{live.visitors7d}</div>
          </div>
          <div className="kpi">
            <div className="kpi-lbl">Visitors · 30d</div>
            <div className="kpi-val">{live.visitors30d}</div>
          </div>
          <div className="kpi">
            <div className="kpi-lbl">Pageviews · 30d</div>
            <div className="kpi-val">{live.pageviews30d}</div>
          </div>
        </div>
      )}

      {live && (
        <div className="card card--chart">
          <div className="card-head">
            <div className="card-titles">
              <div className="card-title">Visitors &amp; pageviews · Daily</div>
            </div>
            <div className={s.legend}>
              <span>
                <i className={`${s.sw} ${s.solid}`} />
                Visitors
              </span>
              <span>
                <i className={s.sw} />
                Pageviews
              </span>
            </div>
          </div>
          <div className="chart-wrap">
            <BarChart
              days={live.daily.map((d) => ({
                label: mdLabel(d.date),
                a: d.pageviews,
                b: d.visitors,
              }))}
              ariaLabel="Unique visitors and pageviews per day for the last 30 days"
              classA={s.barPv}
              classB={s.barV}
              nameA="views"
              nameB="visitors"
            />
          </div>
          <div className={s.chartNote} suppressHydrationWarning>
            Fetched {TIME.format(new Date(live.fetchedAt))} · cached 5 min · days in the PostHog project timezone
          </div>
        </div>
      )}

      {live && (
        <div className="card">
          <div className="card-head">
            <div className="card-titles">
              <div className="card-title">Top pages · 30d</div>
            </div>
          </div>
          {live.topPaths.length === 0 ? (
            <div className="empty">No pageviews recorded in the last 30 days.</div>
          ) : (
            <table className={s.tbl}>
              <thead>
                <tr>
                  <th>Path</th>
                  <th className={s.num} style={{ width: "18%" }}>
                    Pageviews
                  </th>
                  <th className={s.num} style={{ width: "18%" }}>
                    Visitors
                  </th>
                </tr>
              </thead>
              <tbody>
                {live.topPaths.map((p) => (
                  <tr key={p.path}>
                    <td className={`${s.lead} ${s.mono} ${s.ell}`} title={p.path}>
                      {p.path}
                    </td>
                    <td className={s.num} data-l="Pageviews">
                      {p.pageviews}
                    </td>
                    <td className={s.num} data-l="Visitors">
                      {p.visitors}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!live && (
        <div className="card">
          <div className={s.connHead}>
            <div className="card-title">PostHog · Visitors</div>
            <span className={s.chipSlot}>
              {t.status === "error" ? (
                <span className={`chip ${s.chipDanger}`}>Error</span>
              ) : (
                <span className={`chip ${s.chipMuted}`}>Not connected</span>
              )}
            </span>
          </div>
          {t.status === "error" ? (
            <div className={s.connect}>
              PostHog is configured but the query did not answer. The page will retry in a minute.
              <div className={s.err}>{t.message}</div>
            </div>
          ) : (
            <div className={s.connect}>
              Visitor and pageview numbers come from PostHog. Set these in env:
              <ul className={s.connectList}>
                <li>
                  <span className={s.envk}>{data.env.key}</span> personal API key with <b>query:read</b>
                </li>
                <li>
                  <span className={s.envk}>{data.env.project}</span> the numeric project id
                </li>
                <li>
                  <span className={s.envk}>{data.env.host}</span> optional, defaults to {data.env.defaultHost}
                </li>
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="grid-11">
        <div className="card card--chart">
          <div className="card-head">
            <div className="card-titles">
              <div className="card-title">Local · Signups by day</div>
            </div>
            <div className={s.legend}>
              <span>
                <i className={`${s.sw} ${s.ink}`} />
                {data.signups30d} in 30 days
              </span>
            </div>
          </div>
          <div className="chart-wrap">
            <BarChart
              days={data.signupsByDay.map((d) => ({ label: mdLabel(d.date), a: d.count }))}
              ariaLabel="Organization signups per day for the last 30 days"
              classA={s.barInk}
              nameA="signups"
            />
          </div>
          <div className={s.chartNote}>From Organization records · server-local days</div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-titles">
              <div className="card-title">Local · Promo-link clicks</div>
            </div>
            <Link className="card-link" href={INFLUENCERS}>
              Influencers
              <Ic id="i-arrow" />
            </Link>
          </div>
          {data.promoClicks.length === 0 ? (
            <div className="empty">No promo-link visits recorded yet.</div>
          ) : (
            <table className={s.tbl}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Influencer</th>
                  <th className={s.num} style={{ width: "22%" }}>
                    Clicks
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.promoClicks.map((p) => (
                  <tr key={p.code}>
                    <td className={`${s.lead} ${s.mono}`}>{p.code}</td>
                    <td className={s.ell} data-l="Influencer" title={p.influencer}>
                      {p.influencer}
                    </td>
                    <td className={s.num} data-l="Clicks">
                      {p.clicks}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className={s.chartNote}>{data.promoClicksTotal} landing visits across all codes · all time</div>
        </div>
      </div>
    </>
  );
}
