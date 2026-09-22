"use client";

// PARTNER PORTAL — PAYOUTS · BLUEPRINT
// /influencer/payouts
//
// Where the money goes out: the Connect status, what can be requested now, the
// requests and the transfers. A rejection shows its reason and a failed transfer
// shows its failure — a partner reading "failed" with no sentence beside it
// writes in, and the reason is already on the record.

import { useRef } from "react";
import { Chip, Empty, KpiStrip, Meta, type Tone, cx, useReveal } from "@/components/v3/admin-influencers/admin-ui";
import ui from "@/components/v3/admin-influencers/admin-ui.module.css";
import { relative, shortDate } from "@/lib/format";
import { usd, type BalancesDTO, type PartnerDTO, type PayoutRequestDTO, type TransferDTO } from "./portal-data";
import { ConnectBanner, HoldNote, RequestPayoutButton } from "./portal-ui";
import styles from "./portal.module.css";

const REQUEST_TONE: Record<string, Tone> = {
  PENDING: "wait",
  APPROVED: "bp",
  PROCESSING: "mute",
  PAID: "ok",
  REJECTED: "bad",
  FAILED: "bad",
  REVERSED: "bad",
  RELEASED: "wait",
  WRITTEN_OFF: "mute",
};
const REQUEST_LABEL: Record<string, string> = {
  PENDING: "Waiting for review",
  APPROVED: "Approved",
  PROCESSING: "Sending",
  PAID: "Paid",
  REJECTED: "Declined",
  FAILED: "Failed",
  // The words carry the meaning; the date is in the sentence under the chip.
  REVERSED: "Transfer reversed",
  RELEASED: "Back in your balance",
  WRITTEN_OFF: "Written off",
};
const TRANSFER_TONE: Record<string, Tone> = {
  PENDING: "wait",
  PAID: "ok",
  FAILED: "bad",
  REVERSED: "bad",
};
const TRANSFER_LABEL: Record<string, string> = {
  PENDING: "Sending",
  PAID: "Paid",
  FAILED: "Failed",
  REVERSED: "Reversed",
};

const CONNECT_TONE: Record<string, Tone> = {
  ENABLED: "ok",
  ONBOARDING: "wait",
  RESTRICTED: "bad",
  DISABLED: "bad",
  NONE: "mute",
};
const CONNECT_LABEL: Record<string, string> = {
  ENABLED: "Ready",
  ONBOARDING: "Setup unfinished",
  RESTRICTED: "Stripe needs more",
  DISABLED: "Disabled by Stripe",
  NONE: "Not connected",
};

export function InfluencerPayoutsContent({
  partner,
  balances,
  requests,
  transfers,
  payoutReason,
}: {
  partner: PartnerDTO;
  balances: BalancesDTO;
  requests: PayoutRequestDTO[];
  transfers: TransferDTO[];
  payoutReason: string | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useReveal(rootRef);

  const paidCents = transfers.filter((t) => t.status === "PAID").reduce((n, t) => n + t.amountCents, 0);
  const inFlight = requests.filter((r) => ["PENDING", "APPROVED", "PROCESSING"].includes(r.status));

  return (
    <div ref={rootRef} className={styles.root}>
      <div className={cx("page-head", "rv")}>
        <div className={styles.headTxt}>
          <div className="kicker">Partner</div>
          <h1 className={cx("page-title", styles.title)}>Payouts</h1>
        </div>
        <div className="page-actions">
          <RequestPayoutButton reason={payoutReason} />
        </div>
      </div>

      <KpiStrip
        cols={4}
        cells={[
          { label: "Ready to withdraw", value: usd(balances.clearedCents), accent: true },
          { label: "Still clearing", value: usd(balances.pendingCents) },
          { label: "Paid out", value: usd(paidCents), tone: "ok" },
          { label: "Your minimum", value: usd(partner.minPayoutCents) },
        ]}
      />
      <div className="rv">
        <HoldNote holdDays={partner.holdDays} />
      </div>

      <ConnectBanner connect={partner.connect} />

      {balances.reversedTransferCents > 0 ? (
        <div className={cx(ui.bannerErr, "rv")} role="status">
          <span>
            {usd(balances.reversedTransferCents)} was sent to your Stripe account and then reversed by Stripe,
            so it did not reach you. It is still yours — JobFlex will resend it or contact you. You do not
            need to request it again.
          </span>
        </div>
      ) : null}

      <section className="card rv">
        <div className={cx("card-head", ui.cardHead)}>
          <div className="card-titles">
            <div className="card-title">Where the money goes</div>
            <div className="card-sub">The Stripe account every transfer is sent to.</div>
          </div>
          <Chip tone={CONNECT_TONE[partner.connect.status] ?? "mute"}>
            {CONNECT_LABEL[partner.connect.status] ?? partner.connect.status}
          </Chip>
        </div>
        <div className={cx(ui.facts, ui.facts4, styles.connectFacts)}>
          <div className={ui.fact}>
            <div className={ui.factL}>Payouts</div>
            <div className={cx(ui.factV, partner.connect.payoutsEnabled ? ui.factOk : undefined)}>
              {partner.connect.payoutsEnabled ? "On" : "Off"}
            </div>
          </div>
          <div className={ui.fact}>
            <div className={ui.factL}>Minimum</div>
            <div className={ui.factV}>{usd(partner.minPayoutCents)}</div>
          </div>
          <div className={ui.fact}>
            <div className={ui.factL}>Hold</div>
            <div className={ui.factV}>{partner.holdDays}d</div>
          </div>
          <div className={ui.fact}>
            <div className={ui.factL}>Currency</div>
            <div className={ui.factV}>{partner.currency.toUpperCase()}</div>
          </div>
        </div>
      </section>

      <section className="card rv">
        <div className={cx("card-head", ui.cardHead)}>
          <div className="card-titles">
            <div className="card-title">Requests</div>
            <div className="card-sub">
              {inFlight.length > 0
                ? "An approved request is sent on the next daily run."
                : "Ask for your cleared balance whenever it is above your minimum."}
            </div>
          </div>
          <span className={ui.cardCount}>
            {requests.length} {requests.length === 1 ? "request" : "requests"}
          </span>
        </div>

        {requests.length === 0 ? (
          <Empty>No requests yet.</Empty>
        ) : (
          <div className={ui.tbl} role="table" aria-label="Payout requests">
            <div className={cx(ui.tr, ui.th, styles.reqCols)} role="row">
              <span className={ui.thR}>Amount</span>
              <span>Asked</span>
              <span>Status</span>
            </div>
            {requests.map((r) => (
              <div key={r.id} className={cx(ui.tr, styles.reqCols)} role="row">
                <div className={cx(ui.tdAmt, r.status === "PAID" && styles.amtOk)}>
                  <span className={ui.tdLbl}>Amount</span>
                  {usd(r.amountCents)}
                </div>
                <div className={ui.tdNum}>
                  <span className={ui.tdLbl}>Asked</span>
                  <span title={shortDate(r.createdAt)}>{relative(r.createdAt)}</span>
                </div>
                <div className={ui.tdWide}>
                  <span className={ui.tdLbl}>Status</span>
                  <Chip tone={REQUEST_TONE[r.status] ?? "mute"}>{REQUEST_LABEL[r.status] ?? r.status}</Chip>
                  {r.rejectedReason ? <Meta className={styles.reason}>{r.rejectedReason}</Meta> : null}
                  {r.status === "APPROVED" && r.approvedAt ? (
                    <Meta className={styles.reason}>approved {relative(r.approvedAt)}</Meta>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card rv">
        <div className={cx("card-head", ui.cardHead)}>
          <div className="card-titles">
            <div className="card-title">Transfers</div>
            <div className="card-sub">What actually left for your Stripe account.</div>
          </div>
          <span className={ui.cardCount}>
            {transfers.length} {transfers.length === 1 ? "transfer" : "transfers"}
          </span>
        </div>

        {transfers.length === 0 ? (
          <Empty>No transfers yet.</Empty>
        ) : (
          <div className={ui.tbl} role="table" aria-label="Transfers">
            <div className={cx(ui.tr, ui.th, styles.trCols)} role="row">
              <span className={ui.thR}>Amount</span>
              <span>When</span>
              <span>Status</span>
            </div>
            {transfers.map((t) => (
              <div key={t.id} className={cx(ui.tr, styles.trCols)} role="row">
                <div className={cx(ui.tdAmt, t.status === "PAID" && styles.amtOk)}>
                  <span className={ui.tdLbl}>Amount</span>
                  {usd(t.amountCents)}
                </div>
                <div className={ui.tdNum}>
                  <span className={ui.tdLbl}>When</span>
                  <span title={shortDate(t.paidAt ?? t.createdAt)}>{relative(t.paidAt ?? t.createdAt)}</span>
                </div>
                <div className={ui.tdWide}>
                  <span className={ui.tdLbl}>Status</span>
                  <Chip tone={TRANSFER_TONE[t.status] ?? "mute"}>{TRANSFER_LABEL[t.status] ?? t.status}</Chip>
                  {t.failureReason ? <Meta className={styles.reason}>{t.failureReason}</Meta> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
