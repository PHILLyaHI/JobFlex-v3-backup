"use client";

// PARTNER PORTAL — EARNINGS · BLUEPRINT
// /influencer/earnings
//
// The ledger by month, with the reversal column visible rather than netted away.
// A partner who sees only the net number writes in to ask why March was smaller
// than they counted; showing what was accrued and what a refund took back
// answers it on the page.

import { useRef } from "react";
import { Empty, KpiStrip, Meta, cx, useReveal } from "@/components/v3/admin-influencers/admin-ui";
import ui from "@/components/v3/admin-influencers/admin-ui.module.css";
import { usd, type BalancesDTO, type MonthEarningsDTO, type PartnerDTO } from "./portal-data";
import { HoldNote } from "./portal-ui";
import styles from "./portal.module.css";

export function InfluencerEarningsContent({
  partner,
  balances,
  months,
}: {
  partner: PartnerDTO;
  balances: BalancesDTO;
  months: MonthEarningsDTO[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useReveal(rootRef);

  const reversedTotal = months.reduce((n, m) => n + m.reversedCents, 0);
  const netTotal = months.reduce((n, m) => n + m.netCents, 0);

  return (
    <div ref={rootRef} className={styles.root}>
      <div className={cx("page-head", "rv")}>
        <div className={styles.headTxt}>
          <div className="kicker">Partner</div>
          <h1 className={cx("page-title", styles.title)}>Earnings</h1>
        </div>
      </div>

      <KpiStrip
        cols={4}
        cells={[
          { label: "Gross accrued", value: usd(balances.lifetimeEarnedCents) },
          {
            label: "Taken back by refunds",
            value: usd(reversedTotal),
            tone: reversedTotal > 0 ? "warn" : undefined,
          },
          { label: "Net earned", value: usd(netTotal), accent: true },
          { label: "Owed to you now", value: usd(balances.balanceCents), tone: "ok" },
        ]}
      />
      <div className="rv">
        <HoldNote holdDays={partner.holdDays} />
      </div>

      <section className="card rv">
        <div className={cx("card-head", ui.cardHead)}>
          <div className="card-titles">
            <div className="card-title">By month</div>
            <div className="card-sub">
              Only Stripe-confirmed payments count. A refund shows as a deduction in the month the
              refund landed, not the month the payment did.
            </div>
          </div>
          <span className={ui.cardCount}>
            {months.length} {months.length === 1 ? "month" : "months"}
          </span>
        </div>

        {months.length === 0 ? (
          <Empty>Nothing earned yet. Your first commission appears here the month a referral pays.</Empty>
        ) : (
          <div className={ui.tbl} role="table" aria-label="Earnings by month">
            <div className={cx(ui.tr, ui.th, styles.monthCols)} role="row">
              <span>Month</span>
              <span className={ui.thR}>Accrued</span>
              <span className={ui.thR}>Refunded</span>
              <span className={ui.thR}>Net</span>
            </div>
            {months.map((m) => (
              <div key={m.key} className={cx(ui.tr, styles.monthCols)} role="row">
                <div className={ui.tdWide}>
                  <span className={ui.tdName}>{m.label}</span>
                </div>
                <div className={ui.tdNum}>
                  <span className={ui.tdLbl}>Accrued</span>
                  {usd(m.accruedCents)}
                </div>
                <div className={cx(ui.tdNum, m.reversedCents === 0 && ui.tdNumMute)}>
                  <span className={ui.tdLbl}>Refunded</span>
                  {m.reversedCents === 0 ? "—" : usd(-m.reversedCents)}
                </div>
                <div className={cx(ui.tdAmt, m.netCents > 0 && ui.tdAmtBp)}>
                  <span className={ui.tdLbl}>Net</span>
                  {usd(m.netCents)}
                </div>
              </div>
            ))}
            <div className={cx(ui.tr, styles.monthCols, styles.totalRow)} role="row">
              <div className={ui.tdWide}>
                <Meta>Total</Meta>
              </div>
              <div className={ui.tdNum}>
                <span className={ui.tdLbl}>Accrued</span>
                {usd(months.reduce((n, m) => n + m.accruedCents, 0))}
              </div>
              <div className={cx(ui.tdNum, reversedTotal === 0 && ui.tdNumMute)}>
                <span className={ui.tdLbl}>Refunded</span>
                {reversedTotal === 0 ? "—" : usd(-reversedTotal)}
              </div>
              <div className={cx(ui.tdAmt, ui.tdAmtBp)}>
                <span className={ui.tdLbl}>Net</span>
                {usd(netTotal)}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
