"use client";

// Settings blueprint — PAYMENTS pane.
//
// Cards: Get paid (Stripe · Square · Bank transfer) · Defaults · Automations.
//
// REAL, all of it. Stripe and Square rows read the org's PaymentConnection
// rows (getPaymentConnectionStatus); Connect is the OAuth hand-off, Disconnect
// deauthorizes at the provider and drops the row, Manage jumps to the deep
// view under Integrations. Bank transfer is the manual path: instructions the
// client sees on an accepted proposal. Defaults and the one automation write
// `paymentSettingsJson` through updatePaymentSettings (merge, not replace).
//
// LEDGER LAYOUT (visual critique, 2026-09-03): the three processor rows run
// wall to wall as `.prow-grp` groups — each group owns the rule beneath it,
// so a row's sub-block (the ACH toggle, the bank-details field) sits INSIDE
// the group above that rule instead of floating between two rules. A
// processor the platform has not enabled carries an "Unavailable" badge in
// the action column (every row now ends at the same right edge) and no
// green status line — the success tone was being spent on a negative state.
// The payout / fee copy is a two-line footnote band, not a stray paragraph.
//
// GONE, on purpose: the Payout-account card (payouts happen in the
// contractor's own Stripe / Square dashboard), the Compliance card and its
// test charge, PayPal, net terms and late fees (nothing consumed them).

import { useState } from "react";
import { useRouter } from "next/navigation";

import { updatePaymentSettings } from "@/actions/settings";
import {
  disconnectSquare,
  disconnectStripeConnect,
  saveBankTransferSettings,
  setStripeAchEnabled,
} from "@/actions/paymentConnections";
import { Field, SaveBar, Sel, TextArea, Toggle, actionError } from "../ui";
import {
  BANK_TRANSFER_LABELS,
  CONNECT_ACTION,
  CURRENCY_SELECT,
  DISCONNECT_ACTION,
  FEE_NOTE_KICKER,
  MANAGE_ACTION,
  PAYMENT_AUTOMATIONS,
  PAYMENT_AUTOMATIONS_CARD,
  PAYMENT_DEFAULTS_CARD,
  PAYMENT_DEFAULT_LABELS,
  PAYOUT_NOTE,
  PAYOUT_NOTE_KICKER,
  PROCESSORS,
  PROCESSORS_CARD,
  PROCESSOR_STATE_COPY,
  PROCESSOR_UNAVAILABLE_BADGE,
  RECONNECT_ACTION,
  STRIPE_ACH_TOGGLE,
  currencyCodeFor,
  currencyOptionFor,
  platformFeeLine,
  squareConnLine,
  stripeConnLine,
  type IconName,
  type PaneProps,
  type PaymentAutomationKey,
  type Processor,
} from "../settings-data";
import type { PaymentConnectionStatusView } from "@/lib/payments/connections";

function Ic({ name }: { name: IconName }) {
  return (
    <svg className="ic">
      <use href={`#${name}`} />
    </svg>
  );
}

type ProcState = PaymentConnectionStatusView["stripe"]["state"] | PaymentConnectionStatusView["square"]["state"];

/** One OAuth processor row: icon · name + desc (+ connection line) · actions. */
function ProcessorRow({
  row,
  state,
  connLine,
  connectHref,
  busy,
  onManage,
  onDisconnect,
}: {
  row: Processor;
  state: ProcState;
  connLine: string;
  connectHref: string;
  busy: boolean;
  onManage: () => void;
  onDisconnect: () => void;
}) {
  const connected = state === "connected";
  const unavailable = state === "not_configured";
  const hasRow = !unavailable && state !== "disconnected";
  return (
    <div className={`prow${unavailable ? " prow--off" : ""}`}>
      <span className="prow-ic">
        <Ic name={row.icon} />
      </span>
      <span className="prow-b">
        <span className="prow-n">{row.name}</span>
        <span className="prow-d">{row.desc}</span>
        {hasRow ? (
          <span className={`prow-conn${connected ? " prow-ok" : " prow-warn"}`}>
            {connected ? connLine : PROCESSOR_STATE_COPY[state]}
          </span>
        ) : null}
      </span>
      <span className="prow-act prow-act--pair">
        {unavailable ? (
          <span className={`badge2 ${PROCESSOR_UNAVAILABLE_BADGE.tone}`}>
            <i />
            {PROCESSOR_UNAVAILABLE_BADGE.label}
          </span>
        ) : null}
        {state === "disconnected" ? (
          <a className={`btn btn-ghost btn-sm ${CONNECT_ACTION.state}`} href={connectHref}>
            <Ic name="i-plus" />
            {CONNECT_ACTION.label}
          </a>
        ) : null}
        {hasRow && !connected ? (
          <a className={`btn btn-ghost btn-sm ${RECONNECT_ACTION.state}`} href={connectHref}>
            {RECONNECT_ACTION.label}
          </a>
        ) : null}
        {hasRow ? (
          <>
            <button className="btn btn-ghost btn-sm" type="button" onClick={onManage}>
              {MANAGE_ACTION.label}
            </button>
            <button
              className={`btn btn-ghost btn-sm ${DISCONNECT_ACTION.state}`}
              type="button"
              disabled={busy}
              onClick={onDisconnect}
            >
              {DISCONNECT_ACTION.label}
            </button>
          </>
        ) : null}
      </span>
    </div>
  );
}

export function PaymentsPane({ data, navigate }: PaneProps) {
  const p = data.payments;
  const c = p.connections;
  const router = useRouter();

  const [currency, setCurrency] = useState<string>(currencyOptionFor(p.currency));
  const [depositPct, setDepositPct] = useState<string>(p.depositPct);
  const [automations, setAutomations] = useState<Record<PaymentAutomationKey, boolean>>({
    receiptsOnPayment: p.receiptsOnPayment,
  });
  const [ach, setAch] = useState(c.stripe.achEnabled);
  const [bankOn, setBankOn] = useState(c.bankTransfer.enabled);
  const [bankText, setBankText] = useState(c.bankTransfer.instructions);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const saveDefaults = () =>
    updatePaymentSettings({
      currency: currencyCodeFor(currency),
      depositPct: Math.min(100, Math.max(0, Number.parseFloat(depositPct) || 0)),
      receiptsOnPayment: automations.receiptsOnPayment,
    });

  async function disconnect(which: "stripe" | "square") {
    setBusy(which);
    setErr("");
    try {
      if (which === "stripe") await disconnectStripeConnect();
      else await disconnectSquare();
      router.refresh();
    } catch (e) {
      setErr(actionError(e));
    } finally {
      setBusy(null);
    }
  }

  const [stripeRow, squareRow, bankRow] = PROCESSORS;

  return (
    <>
      {/* ── Get paid ─────────────────────────────────────────────────── */}
      <section className="sc">
        <div className="sc-h">
          <div>
            <div className="sc-t">{PROCESSORS_CARD.title}</div>
            <div className="sc-s">{PROCESSORS_CARD.sub}</div>
          </div>
        </div>
        <div className="sc-b sc-b--rows">
          {/* Stripe */}
          <div className="prow-grp">
            <ProcessorRow
              row={stripeRow}
              state={c.stripe.state}
              connLine={stripeConnLine(c.stripe)}
              connectHref={c.connectHref.stripe}
              busy={busy !== null}
              onManage={() => navigate("integrations", "stripe")}
              onDisconnect={() => void disconnect("stripe")}
            />
            {c.stripe.state === "connected" ? (
              <div className="prow-sub">
                <div className="trow">
                  <span className="trow-b">
                    <span className="trow-n">{STRIPE_ACH_TOGGLE.name}</span>
                    <span className="trow-d">{STRIPE_ACH_TOGGLE.desc}</span>
                  </span>
                  <Toggle
                    checked={ach}
                    onChange={(next) => {
                      setAch(next);
                      void setStripeAchEnabled(next).catch((e) => setErr(actionError(e)));
                    }}
                    ariaLabel={STRIPE_ACH_TOGGLE.name}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {/* Square */}
          <div className="prow-grp">
            <ProcessorRow
              row={squareRow}
              state={c.square.state}
              connLine={squareConnLine(c.square)}
              connectHref={c.connectHref.square}
              busy={busy !== null}
              onManage={() => navigate("integrations", "square")}
              onDisconnect={() => void disconnect("square")}
            />
          </div>

          {/* Bank transfer — manual path */}
          <div className="prow-grp">
            <div className="prow">
              <span className="prow-ic">
                <Ic name={bankRow.icon} />
              </span>
              <span className="prow-b">
                <span className="prow-n">{bankRow.name}</span>
                <span className="prow-d">{bankRow.desc}</span>
              </span>
              <Toggle checked={bankOn} onChange={setBankOn} ariaLabel={BANK_TRANSFER_LABELS.enabled} />
            </div>
            {bankOn ? (
              <div className="prow-sub">
                <TextArea
                  label={BANK_TRANSFER_LABELS.instructions}
                  value={bankText}
                  placeholder={BANK_TRANSFER_LABELS.placeholder}
                  maxLength={1000}
                  rows={3}
                  onChange={setBankText}
                />
              </div>
            ) : null}
          </div>

          {/* Footnote band — two drawing annotations, kicker + line. */}
          <div className="sc-note">
            <span className="sc-note-k">{PAYOUT_NOTE_KICKER}</span>
            <span>{PAYOUT_NOTE}</span>
            <span className="sc-note-k">{FEE_NOTE_KICKER}</span>
            <span>{platformFeeLine(p.platformFeePct)}</span>
            {err ? (
              <>
                <span className="sc-note-k prow-warn">Error</span>
                <span className="prow-warn">{err}</span>
              </>
            ) : null}
          </div>
        </div>
        <SaveBar
          onSave={() => saveBankTransferSettings({ enabled: bankOn, instructions: bankText })}
        />
      </section>

      {/* ── Defaults ─────────────────────────────────────────────────── */}
      <section className="sc">
        <div className="sc-h">
          <div>
            <div className="sc-t">{PAYMENT_DEFAULTS_CARD.title}</div>
            <div className="sc-s">{PAYMENT_DEFAULTS_CARD.sub}</div>
          </div>
        </div>
        <div className="sc-b">
          <div className="fgrid">
            <Sel
              label={CURRENCY_SELECT.label}
              value={currency}
              options={CURRENCY_SELECT.options}
              onChange={setCurrency}
            />
            <Field
              label={PAYMENT_DEFAULT_LABELS.depositPct}
              value={depositPct}
              onChange={setDepositPct}
            />
          </div>
        </div>
      </section>

      {/* ── Automations ──────────────────────────────────────────────── */}
      <section className="sc">
        <div className="sc-h">
          <div>
            <div className="sc-t">{PAYMENT_AUTOMATIONS_CARD.title}</div>
            <div className="sc-s">{PAYMENT_AUTOMATIONS_CARD.sub}</div>
          </div>
        </div>
        <div className="sc-b sc-b--rows">
          {PAYMENT_AUTOMATIONS.map((row) => (
            <div className="trow" key={row.key}>
              <span className="trow-b">
                <span className="trow-n">{row.name}</span>
                <span className="trow-d">{row.desc}</span>
              </span>
              <Toggle
                checked={automations[row.key]}
                onChange={(next) => setAutomations((prev) => ({ ...prev, [row.key]: next }))}
                ariaLabel={row.name}
              />
            </div>
          ))}
        </div>
        {/* One Save bar for Defaults + Automations: both live in paymentSettingsJson. */}
        <SaveBar onSave={saveDefaults} />
      </section>
    </>
  );
}
