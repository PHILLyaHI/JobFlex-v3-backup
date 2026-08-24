"use client";

// ADMIN OVERVIEW — /admin, blueprint.
//
// Renders inside the admin blueprint shell as `.content` children. The page
// head, KPI strip, cards and chart marks use the dashboard donor's literal
// classes (published globally by the shell's dashboard module); everything
// page-specific comes from admin-shared.module.css.
//
// Every number is a count the server returned. The two "Connected data"
// cards say LIVE only when their env is configured AND the source answered.

import Link from "next/link";
import type { Route } from "next";
import type { AdminOverviewData } from "@/actions/adminStats";
import { money } from "@/lib/format";
import s from "./admin-shared.module.css";
import { LineChart } from "./admin-charts";
import { useAdminMotion } from "./admin-motion";
import { Ic, StatusChip, ago, shortDay } from "./admin-ui";
import {
  changeKindLabel,
  unlinkedShort,
  MRR_RULE,
  PAYING_RULE,
  STRIPE_SCAN_CEILING_LABEL,
} from "@/components/v3/admin-subscribers/billing-metrics";

const TRAFFIC = "/admin/traffic" as Route;
const SUBSCRIBERS = "/admin/subscribers" as Route;
const SUPPORT = "/admin/support" as Route;

export function AdminOverviewContent({ data }: { data: AdminOverviewData }) {
  useAdminMotion();

  const total12w = data.weeks.reduce((a, w) => a + w.count, 0);
  const billingSrc = data.stripeLive
    ? "Stripe · live"
    : data.stripeEnabled
      ? "Stripe unreachable"
      : "Platform record";
  const mrrCurrency = data.mrrCurrency.toUpperCase();

  // Two ways to be unlinked, and the operator has to tell them apart: Stripe
  // named an id this database has no record of, or Stripe named nobody at all.
  const namedNobody = data.mrrUnmatched - data.mrrNamedUnknown;
  const unlinkedWhy =
    data.mrrNamedUnknown > 0 && namedNobody > 0
      ? `${data.mrrNamedUnknown} name an id no account here holds · ${namedNobody} name nobody`
      : data.mrrNamedUnknown > 0
        ? "all name an id no account here holds"
        : "all name nobody";

  // Both of these subtract more, or add less, than the subscription really
  // bills — so the total under them is a floor, and it says so.
  const floorNotes = [
    data.mrrPartlyPriced > 0 ? `${data.mrrPartlyPriced} priced from some items only` : "",
    data.mrrRestrictedDiscount > 0
      ? `${data.mrrRestrictedDiscount} discounted by a coupon limited to some products`
      : "",
  ].filter(Boolean);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Admin</h1>
        </div>
        <div className="page-actions">
          <Link className="btn btn-ghost" href={TRAFFIC}>
            <Ic id="i-chart" />
            Traffic
          </Link>
          <Link className="btn btn-primary" href={SUBSCRIBERS}>
            <Ic id="i-card" />
            Subscribers
          </Link>
        </div>
      </div>

      <div className={`kpi-grid ${s.kpi6}`}>
        <div className={`kpi ${s.kpiCell}`}>
          <div className="kpi-lbl">Organizations</div>
          <div className="kpi-val">{data.organizations}</div>
        </div>
        <div className={`kpi ${s.kpiCell}`}>
          <div className="kpi-lbl">People</div>
          <div className="kpi-val">{data.users}</div>
          <div className={s.kpiSrc}>In an organization</div>
        </div>
        <div className={`kpi ${s.kpiCell}`}>
          <div className="kpi-lbl">Paying</div>
          <div className="kpi-val accent">{data.payingCount}</div>
          <div className={s.kpiSrc}>{PAYING_RULE}</div>
          <div className={`${s.kpiSrc} ${data.stripeLive ? s.live : ""}`}>{billingSrc}</div>
        </div>
        <div className={`kpi ${s.kpiCell}`}>
          <div className="kpi-lbl">MRR</div>
          <div className="kpi-val">{money(data.mrrCents / 100, mrrCurrency)}</div>
          <div className={s.kpiSrc}>{MRR_RULE}</div>
          <div className={`${s.kpiSrc} ${data.stripeLive ? s.live : ""}`}>{billingSrc}</div>
        </div>
        <div className={`kpi ${s.kpiCell}`}>
          {/* Organizations created since the 1st — the count is
              db.organization.count, so the label names organizations. */}
          <div className="kpi-lbl">New orgs · This month</div>
          <div className="kpi-val">{data.orgsThisMonth}</div>
        </div>
        <div className={`kpi ${s.kpiCell}`}>
          <div className="kpi-lbl">Support · Unread</div>
          <div className={data.supportUnread > 0 ? "kpi-val accent" : "kpi-val"}>{data.supportUnread}</div>
        </div>
      </div>

      <div className="grid-23">
        <div className="card card--chart">
          <div className="card-head">
            <div className="card-titles">
              <div className="card-title">Signups · 12 weeks</div>
            </div>
            <div className={s.legend}>
              <span>
                <i className={`${s.sw} ${s.solid}`} />
                {total12w} organizations
              </span>
            </div>
          </div>
          <div className="chart-wrap">
            <LineChart
              points={data.weeks.map((w) => ({ label: w.label, value: w.count }))}
              ariaLabel="Organization signups per week for the last 12 weeks"
            />
          </div>
        </div>

        <div className="card card--flex">
          <div className="card-head">
            <div className="card-titles">
              <div className="card-title">Recent organizations</div>
            </div>
          </div>
          <hr className={`card-rule ${s.ruleBleed}`} />
          <div>
            {data.recentOrgs.length === 0 && <div className="empty">No organizations yet.</div>}
            {data.recentOrgs.map((o) => (
              <div key={o.id} className={s.row}>
                <div className={s.rowMain}>
                  <div className={s.rowTitle} title={o.name}>
                    {o.name}
                  </div>
                  <div className={s.rowSub}>
                    {o.members} member{o.members === 1 ? "" : "s"} · {ago(o.createdAt, data.generatedAt)}
                  </div>
                </div>
                <span className={s.rowTag}>{shortDay(o.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid-11">
        <div className="card">
          <div className={s.connHead}>
            <div className="card-title">PostHog · Visitors</div>
            <span className={s.chipSlot}>
              {data.posthog.enabled ? (
                data.posthog.error ? (
                  <span className={`chip ${s.chipDanger}`}>Error</span>
                ) : (
                  <span className="chip ok">Live</span>
                )
              ) : (
                <span className={`chip ${s.chipMuted}`}>Not connected</span>
              )}
            </span>
          </div>
          {data.posthog.enabled && data.posthog.visitors24h !== null ? (
            <div className={s.connPair}>
              <div className={s.connCell}>
                <div className={s.connLbl}>Unique visitors · 24h</div>
                <div className={`${s.connVal} ${s.accent}`}>{data.posthog.visitors24h}</div>
              </div>
            </div>
          ) : data.posthog.enabled ? (
            <div className={s.connect}>
              PostHog is configured but the query did not answer.
              <div className={s.err}>{data.posthog.error}</div>
            </div>
          ) : (
            <div className={s.connect}>
              Not connected — set <span className={s.envk}>{data.env.posthogKey}</span> and{" "}
              <span className={s.envk}>{data.env.posthogProject}</span> in env.
            </div>
          )}
        </div>

        <div className="card">
          <div className={s.connHead}>
            <div className="card-title">Stripe · Subscribers</div>
            <span className={s.chipSlot}>
              {data.stripeLive ? (
                <span className="chip ok">Live</span>
              ) : data.stripeEnabled ? (
                <span className={`chip ${s.chipDanger}`}>Unreachable</span>
              ) : (
                <span className={`chip ${s.chipMuted}`}>Not connected</span>
              )}
            </span>
          </div>
          {data.stripeEnabled ? (
            <div className={s.connPair}>
              <div className={s.connCell}>
                <div className={s.connLbl}>Paying subscribers</div>
                <div className={`${s.connVal} ${s.accent}`}>{data.payingCount}</div>
              </div>
              <div className={s.connCell}>
                <div className={s.connLbl}>MRR</div>
                <div className={s.connVal}>{money(data.mrrCents / 100, mrrCurrency)}</div>
              </div>
            </div>
          ) : (
            <div className={s.connect}>
              Not connected — set <span className={s.envk}>{data.env.stripe}</span> in env. The two
              billing figures above come from the platform’s own record.
            </div>
          )}
          {/* An unmatched subscription is still real revenue, so it stays in the
              total — but it is never allowed to inflate it silently. */}
          {data.mrrUnmatched > 0 && (
            <div className={s.noteTop}>
              {data.mrrUnmatched} of {data.mrrSubCount} not linked to a JobFlex organization —{" "}
              {unlinkedWhy}.
            </div>
          )}
          {data.mrrUnpriced > 0 && (
            <div className={s.noteTop}>
              {data.mrrUnpriced} of {data.mrrSubCount} carry no amount, counted as 0.
            </div>
          )}
          {floorNotes.length > 0 && (
            <div className={s.noteTop}>MRR is a floor: {floorNotes.join(" · ")}.</div>
          )}
          {/* A row the platform stores that Stripe answered about and did not
              return. It stays on the list; it is never money this account bills. */}
          {data.unconfirmedCount > 0 && (
            <div className={s.noteTop}>
              {data.unconfirmedCount} in the platform record Stripe did not return — listed, never
              added.
            </div>
          )}
          {data.otherCurrencyCount > 0 && (
            <div className={s.noteTop}>
              {data.otherCurrencyCount} billed in {data.otherCurrencies.join(", ")} — beside this
              total, not in it.
            </div>
          )}
          {/* With more subscriptions than one read returns, the figure above is
              a floor. Saying so is the difference between partial and wrong. */}
          {data.billingTruncated && (
            <div className={s.noteTop}>
              First {STRIPE_SCAN_CEILING_LABEL} subscriptions only — both figures above are partial.
            </div>
          )}
          {data.stripeEnabled && !data.stripeLive && (
            <div className={s.noteTop}>
              Live Stripe call failed — showing the platform’s own record.
              <div className={s.err}>{data.stripeError}</div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-titles">
            <div className="card-title">Subscription activity</div>
          </div>
          <span className={`${s.count} ${data.stripeLive ? s.live : ""}`}>{data.activitySource}</span>
        </div>
        {data.recentSubs.length === 0 ? (
          <div className="empty">No subscriptions yet.</div>
        ) : (
          <table className={`${s.tbl} ${s.tblBleed}`}>
            <thead>
              <tr>
                <th>Subscriber</th>
                <th style={{ width: "18%" }}>Plan</th>
                <th style={{ width: "18%" }}>Status</th>
                {/* Stripe carries no "updated" timestamp, so the cell names the
                    event it is showing rather than calling a start a change. */}
                <th className={s.num} style={{ width: "22%" }}>
                  Last event
                </th>
              </tr>
            </thead>
            <tbody>
              {data.recentSubs.map((r) => (
                <tr key={r.id}>
                  <td className={s.lead}>
                    <div className={s.ell} title={r.subscriber}>
                      {r.subscriber}
                    </div>
                    {!r.linked && <div className={s.sub}>{unlinkedShort(r.matchedBy)}</div>}
                  </td>
                  <td data-l="Plan">
                    <span className={`chip ${s.chipInk}`}>{r.plan}</span>
                  </td>
                  <td data-l="Status">
                    <StatusChip status={r.status.toUpperCase()} />
                  </td>
                  <td className={s.num} data-l="Last event">
                    {changeKindLabel(r.changeKind)} {ago(r.changedAt, data.generatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data.supportUnread > 0 && (
        <div className="card">
          <div className={s.connBody}>
            <div>
              <div className={s.connLbl}>Support tickets unread</div>
              <div className={`${s.connVal} ${s.accent}`}>{data.supportUnread}</div>
            </div>
            <Link className="btn btn-ghost" href={SUPPORT}>
              <Ic id="i-msg" />
              Open inbox
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
