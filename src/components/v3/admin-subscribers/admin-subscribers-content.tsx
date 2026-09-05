"use client";

// ADMIN SUBSCRIBERS — /admin/subscribers, blueprint.
//
// The list IS the set of subscriptions the platform can see: live Stripe when
// Stripe answers, the platform's own Subscription rows otherwise. Filters
// (plan / status / promo + text search) and a per-row detail with a live
// Stripe check, laid out on the blueprint sheet. The detail opens INLINE under
// its row instead of a side drawer, which also reads better one-handed.
//
// The KPI strip is recomputed over the FILTERED rows through the same
// computeMetrics() the server used — one MRR rule, never a second copy — so
// the numerals always describe the table under them.

import { useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { getSubscriberStripeStatus } from "@/actions/subscribers";
import { money, longDate } from "@/lib/format";
import s from "@/components/v3/admin-overview/admin-shared.module.css";
import { useAdminMotion } from "@/components/v3/admin-overview/admin-motion";
import { Ic, StatusChip, statusLabel } from "@/components/v3/admin-overview/admin-ui";
import {
  computeMetrics,
  changeKindLabel,
  matchedByLabel,
  pricedByLabel,
  MRR_RULE,
  PAYING_RULE,
  STRIPE_SCAN_CEILING_LABEL,
  type BillingFacts,
  type BillingMetrics,
  type ChangeKind,
} from "./billing-metrics";

export interface SubscriberRowDTO extends BillingFacts {
  id: string;
  source: "stripe" | "record";
  organizationId: string | null;
  orgName: string;
  ownerEmail: string | null;
  customerEmail: string | null;
  provider: string;
  stripeBacked: boolean;
  externalSubId: string | null;
  stripeCustomerId: string | null;
  influencerName: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  changedAt: string;
  changeKind: ChangeKind;
}

const ADMIN = "/admin" as Route;

type LiveStatus = Awaited<ReturnType<typeof getSubscriberStripeStatus>>;

export function AdminSubscribersContent({
  rows,
  metrics,
  stripeEnabled,
  stripeLive,
  stripeError,
  truncated,
}: {
  rows: SubscriberRowDTO[];
  metrics: BillingMetrics;
  stripeEnabled: boolean;
  stripeLive: boolean;
  stripeError: string | null;
  truncated: boolean;
}) {
  useAdminMotion();

  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("");
  const [promo, setPromo] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const plans = useMemo(() => Array.from(new Set(rows.map((r) => r.plan))).sort(), [rows]);
  const statuses = useMemo(() => Array.from(new Set(rows.map((r) => r.status))).sort(), [rows]);
  const promos = useMemo(
    () => Array.from(new Set(rows.map((r) => r.promoCode).filter(Boolean) as string[])).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (plan && r.plan !== plan) return false;
      if (status && r.status !== status) return false;
      if (promo && r.promoCode !== promo) return false;
      if (!q) return true;
      return (
        r.orgName.toLowerCase().includes(q) ||
        (r.ownerEmail ?? "").toLowerCase().includes(q) ||
        (r.customerEmail ?? "").toLowerCase().includes(q) ||
        (r.promoCode ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, plan, status, promo]);

  const filtersOn = Boolean(plan || status || promo || query);
  // Same rule, same function — applied to whichever set is on screen.
  const view = useMemo(
    () => (filtersOn ? computeMetrics(filtered, metrics.currency) : metrics),
    [filtersOn, filtered, metrics],
  );
  const cur = view.currency.toUpperCase();

  const pricingNotes: string[] = [];
  if (view.mrrFromCatalog > 0) {
    pricingNotes.push(`${view.mrrFromCatalog} priced from the plan catalog, not the subscription`);
  }
  if (view.mrrUnpriced > 0) pricingNotes.push(`${view.mrrUnpriced} carry no amount, counted as 0`);

  // Both of these leave the total BELOW what the subscriptions bill: an item
  // that prices at null is left out of the sum, and a coupon narrowed to some
  // products is subtracted from all of it.
  const floorNotes: string[] = [];
  if (view.mrrPartlyPriced > 0) {
    floorNotes.push(`${view.mrrPartlyPriced} priced from some items only`);
  }
  if (view.mrrRestrictedDiscount > 0) {
    floorNotes.push(
      `${view.mrrRestrictedDiscount} discounted by a coupon limited to some products`,
    );
  }

  const outsideMrr: string[] = [];
  if (view.compedCount > 0) {
    outsideMrr.push(`${view.compedCount} admin grant${view.compedCount === 1 ? "" : "s"}`);
  }
  if (view.pausedCount > 0) outsideMrr.push(`${view.pausedCount} paused`);
  if (view.unconfirmedCount > 0) {
    outsideMrr.push(`${view.unconfirmedCount} in the platform record Stripe did not return`);
  }
  if (view.otherCurrencyCount > 0) {
    outsideMrr.push(`${view.otherCurrencyCount} billed in ${view.otherCurrencies.join(", ")}`);
  }

  // "Stripe named nobody" and "Stripe named an id this database has no record
  // of" are different problems with different fixes. Never one number — and
  // when there is only one kind, "all" beats repeating the count.
  const namedNobody = view.mrrUnmatched - view.mrrNamedUnknown;
  const unlinkedWhy =
    view.mrrNamedUnknown > 0 && namedNobody > 0
      ? `${view.mrrNamedUnknown} name an id no account here holds · ${namedNobody} name nobody`
      : view.mrrNamedUnknown > 0
        ? "all name an id no account here holds"
        : "all name nobody";

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Platform · Billing</div>
          <h1 className="page-title">Subscribers</h1>
        </div>
        <div className={s.headSide}>
          {stripeLive ? (
            <span className="chip ok">Stripe · Live</span>
          ) : stripeEnabled ? (
            <span className={`chip ${s.chipDanger}`}>Stripe unreachable</span>
          ) : (
            <span className={`chip ${s.chipMuted}`}>Platform record</span>
          )}
          <Link className="btn btn-ghost" href={ADMIN}>
            <Ic id="i-grid" />
            Overview
          </Link>
        </div>
      </div>

      {/* The set the numerals below are the sum of. */}
      <div className={s.stripScope}>
        {filtersOn
          ? `${filtered.length} of ${rows.length} subscriptions · filtered`
          : `${rows.length} subscriptions`}
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-lbl">MRR</div>
          <div className="kpi-val accent">{money(view.mrrCents / 100, cur)}</div>
          <div className={s.kpiSrc}>{MRR_RULE}</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Paying</div>
          <div className="kpi-val">{view.payingCount}</div>
          <div className={s.kpiSrc}>{PAYING_RULE}</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Didn’t pay</div>
          <div className={view.notPaidCount > 0 ? "kpi-val accent" : "kpi-val"}>
            {view.notPaidCount}
          </div>
          <div className={s.kpiSrc}>Past due · unpaid · incomplete</div>
        </div>
      </div>

      <div className={s.mix}>
        {view.perPlan.map((p) => (
          <div key={p.plan} className={s.mixCell}>
            <div className={s.mixLbl} title={p.plan}>
              Plan · {p.plan}
            </div>
            <div className={s.mixVal}>{p.count}</div>
          </div>
        ))}
        <div className={s.mixCell}>
          <div className={s.mixLbl}>Used a promo code</div>
          <div className={`${s.mixVal} ${s.accent}`}>{view.promoTotal}</div>
        </div>
        {view.promoUsage.slice(0, 4).map((p) => (
          <div key={p.code} className={s.mixCell}>
            <div className={s.mixLbl} title={p.code}>
              Promo · {p.code}
            </div>
            <div className={s.mixVal}>{p.count}</div>
          </div>
        ))}
        {view.perPlan.length === 0 && (
          <div className={s.mixCell}>
            <div className={s.mixLbl}>Plans</div>
            <div className={s.mixVal}>0</div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-titles">
            <div className="card-title">All subscriptions</div>
          </div>
          <span className={s.count}>
            {filtered.length} / {rows.length}
          </span>
        </div>

        {truncated && (
          <div className={s.note}>
            <b>Partial.</b> The first {STRIPE_SCAN_CEILING_LABEL} Stripe subscriptions — every
            figure on this page covers only those.
          </div>
        )}
        {/* Configured-but-failing is not the same as not configured. */}
        {!stripeLive && stripeEnabled && (
          <div className={s.note}>
            <b>Stripe did not answer.</b> Showing the platform’s own record, which is written by the
            Stripe webhook.
            <div className={s.err}>{stripeError}</div>
          </div>
        )}
        {!stripeEnabled && (
          <div className={s.note}>
            Platform record — set <b>STRIPE_SECRET_KEY</b> for live Stripe data.
          </div>
        )}
        {/* An unmatched subscription is still real revenue, so it stays in the
            MRR total — but it is never allowed to inflate it silently. */}
        {view.mrrUnmatched > 0 && (
          <div className={s.note}>
            {view.mrrUnmatched} of {view.mrrSubCount} not linked to a JobFlex organization —{" "}
            {unlinkedWhy}.
          </div>
        )}
        {pricingNotes.length > 0 && (
          <div className={s.note}>
            Of the {view.mrrSubCount} in MRR: {pricingNotes.join(" · ")}.
          </div>
        )}
        {floorNotes.length > 0 && (
          <div className={s.note}>MRR is a floor: {floorNotes.join(" · ")}.</div>
        )}
        {outsideMrr.length > 0 && <div className={s.note}>Outside MRR: {outsideMrr.join(" · ")}.</div>}

        <div className={s.filters} style={{ marginBottom: 16 }}>
          <div className={s.fSearch}>
            <input
              className={s.search}
              type="search"
              placeholder="Search org, email or promo code"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search subscribers"
            />
          </div>
          {/* The console's one dropdown treatment, published once in
              blueprint-global.css: the `.bp-sel` wrapper draws the caret and
              carries the bar's width, `.bp-sel--admin` the admin metrics —
              the search field's exact axis. */}
          <span className={`bp-sel bp-sel--admin ${s.fSel}`}>
            <select
              className="bp-sel-in"
              value={plan}
              data-empty={plan ? undefined : "1"}
              onChange={(e) => setPlan(e.target.value)}
              aria-label="Plan"
            >
              <option value="">Any plan</option>
              {plans.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </span>
          <span className={`bp-sel bp-sel--admin ${s.fSel}`}>
            <select
              className="bp-sel-in"
              value={status}
              data-empty={status ? undefined : "1"}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Status"
            >
              <option value="">Any status</option>
              {statuses.map((st) => (
                <option key={st} value={st}>
                  {statusLabel(st)}
                </option>
              ))}
            </select>
          </span>
          {promos.length > 0 && (
            <span className={`bp-sel bp-sel--admin ${s.fSel}`}>
              <select
                className="bp-sel-in"
                value={promo}
                data-empty={promo ? undefined : "1"}
                onChange={(e) => setPromo(e.target.value)}
                aria-label="Promo code"
              >
                <option value="">Any promo</option>
                {promos.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </span>
          )}
          {filtersOn && (
            <button
              type="button"
              className={s.reset}
              data-press
              onClick={() => {
                setQuery("");
                setPlan("");
                setStatus("");
                setPromo("");
              }}
            >
              Reset
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="empty">
            {rows.length === 0 ? "No subscriptions yet." : "No subscribers match these filters."}
          </div>
        ) : (
          <table className={s.tbl}>
            <thead>
              <tr>
                <th>Subscriber</th>
                <th style={{ width: "14%" }}>Plan</th>
                <th className={s.num} style={{ width: "11%" }}>
                  Monthly
                </th>
                <th style={{ width: "14%" }}>Status</th>
                <th style={{ width: "14%" }}>Promo</th>
                <th className={s.num} style={{ width: "13%" }}>
                  Renews
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const open = openId === r.id;
                return (
                  <RowPair
                    key={r.id}
                    row={r}
                    open={open}
                    onToggle={() => setOpenId(open ? null : r.id)}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function RowPair({
  row: r,
  open,
  onToggle,
}: {
  row: SubscriberRowDTO;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={`${s.rowBtn} ${open ? s.open : ""}`}
        tabIndex={0}
        role="button"
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <td className={s.lead}>
          <div className={s.ell} title={r.orgName}>
            {r.orgName}
          </div>
          <div className={s.sub} title={r.ownerEmail ?? ""}>
            {r.ownerEmail ?? "—"}
          </div>
        </td>
        <td data-l="Plan">
          <span className={`chip ${s.chipInk}`}>{r.plan}</span>
        </td>
        <td className={s.num} data-l="Monthly" title={pricedByLabel(r.pricedBy)}>
          {r.amountCents > 0 ? (
            money(r.amountCents / 100, r.currency.toUpperCase())
          ) : (
            <span className={s.dash}>—</span>
          )}
        </td>
        <td data-l="Status">
          <StatusChip status={r.status} />
        </td>
        <td data-l="Promo">
          {r.promoCode ? (
            <span className={s.mono}>{r.promoCode}</span>
          ) : (
            <span className={s.dash}>—</span>
          )}
        </td>
        <td className={s.num} data-l="Renews">
          {r.currentPeriodEnd ? longDate(r.currentPeriodEnd) : <span className={s.dash}>—</span>}
        </td>
      </tr>
      {open && (
        <tr className={s.detail}>
          <td colSpan={6}>
            <Detail row={r} />
          </td>
        </tr>
      )}
    </>
  );
}

function Detail({ row }: { row: SubscriberRowDTO }) {
  // Stripe already answered about this id on the read behind the table and did
  // not return it. Asking again would only turn a known answer into "Stripe did
  // not answer", which is a different — and false — statement.
  const knownMissing = row.stripeConfirmed === false && Boolean(row.externalSubId);
  const subId = knownMissing ? null : row.externalSubId;
  // Live Stripe status — fetched on open, never assumed from the record.
  // Detail mounts fresh per opened row (it is conditionally rendered under a
  // keyed row), so one fetch per mount is the whole lifecycle.
  const [live, setLive] = useState<LiveStatus | "loading" | "failed">(subId ? "loading" : null);

  useEffect(() => {
    if (!subId) return;
    let cancelled = false;
    getSubscriberStripeStatus(subId)
      .then((r) => {
        if (!cancelled) setLive(r);
      })
      .catch(() => {
        if (!cancelled) setLive("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [subId]);

  return (
    <>
      <dl className={s.dl}>
        <div>
          <dt>Owner email</dt>
          <dd>{row.ownerEmail ?? "—"}</dd>
        </div>
        <div>
          <dt>Stripe customer</dt>
          <dd>{row.customerEmail ?? "—"}</dd>
        </div>
        <div>
          <dt>Linked by</dt>
          <dd>{matchedByLabel(row.matchedBy)}</dd>
        </div>
        <div>
          <dt>Amount from</dt>
          <dd>{pricedByLabel(row.pricedBy)}</dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd>{longDate(row.createdAt)}</dd>
        </div>
        <div>
          <dt>{changeKindLabel(row.changeKind)}</dt>
          <dd>{longDate(row.changedAt)}</dd>
        </div>
        <div>
          <dt>Renews</dt>
          <dd>{row.currentPeriodEnd ? longDate(row.currentPeriodEnd) : "—"}</dd>
        </div>
        <div>
          <dt>Referred by</dt>
          <dd>{row.influencerName ?? "—"}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{row.source === "stripe" ? "Stripe subscription" : "Platform record"}</dd>
        </div>
      </dl>
      {row.matchedBy === "none" && <div className={s.detailNote}>No matching JobFlex org.</div>}
      {row.comped && (
        <div className={s.detailNote}>Admin grant — provider MANUAL, never invoiced.</div>
      )}
      {row.paused && (
        <div className={s.detailNote}>Collection paused in Stripe — active, billing nothing.</div>
      )}
      {row.restrictedDiscount && (
        <div className={s.detailNote}>
          The coupon is limited to some products and is taken off the whole subscription — the
          amount above is a floor.
        </div>
      )}

      <div className={s.detailHead}>Live Stripe check</div>
      {!row.externalSubId ? (
        <div className={s.detailNote}>Not backed by a Stripe subscription.</div>
      ) : knownMissing ? (
        <div className={s.detailNote}>
          Stripe answered and holds no subscription with this id — the platform record is the only
          source, so it stays outside MRR.
        </div>
      ) : live === "loading" ? (
        <div className={s.detailNote}>Checking Stripe…</div>
      ) : live === "failed" ? (
        <div className={s.detailNote}>Stripe did not answer.</div>
      ) : live === null ? (
        <div className={s.detailNote}>Stripe is not configured.</div>
      ) : !live.found ? (
        <div className={s.detailNote}>Stripe holds no subscription with this id.</div>
      ) : (
        <dl className={s.dl}>
          <div>
            <dt>Stripe status</dt>
            <dd>
              <StatusChip status={live.status.toUpperCase()} />
            </dd>
          </div>
          <div>
            <dt>Collection</dt>
            <dd>{live.paused ? "Paused" : "Running"}</dd>
          </div>
          <div>
            <dt>Cancels at period end</dt>
            <dd>{live.cancelAtPeriodEnd ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt>Applied promo</dt>
            <dd>{live.promotionCode ?? live.couponId ?? "—"}</dd>
          </div>
          <div>
            <dt>Period end</dt>
            <dd>{live.currentPeriodEnd ? longDate(live.currentPeriodEnd) : "—"}</dd>
          </div>
        </dl>
      )}
    </>
  );
}
