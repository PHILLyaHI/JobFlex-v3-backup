"use client";

/**
 * Settings blueprint — PAYMENTS pane.
 *
 * Faithful port of donor `jobflex-settings-blueprint (6).html` lines 2035-2041,
 * with the owner fix list applied on top. Every label, card title and option
 * list still comes from `settings-data.ts`; the VALUES come from the org's
 * `paymentSettingsJson` (src/lib/settings.ts → `PaymentSettings`).
 *
 * Owner fixes applied in this file:
 *   F3  ACH bank transfer gains the same Connect button as Square / PayPal.
 *   F4  every `.tg` toggle is gone from the processor rows — no `<span>`
 *       placeholders survive either, so `.prow-act` holds only the real button.
 *   F5  the "Add a processor" `.sactions` block is removed entirely.
 *   F8  the `bg-ok` "Verified" badge is gone from the Payout account header.
 *   F9  the `bg-ok` "Verified" badge is gone from the Compliance header.
 *   F10 every donor `<select class="fin">` is the custom `Sel` dropdown
 *       (payout schedule, currency, net terms) — no `<select>` remains.
 *   F11 "Add payout account" opens the animated `Modal` form.
 *   F12 `Toggle` renders no child icons; the `.tg` colour states carry it.
 *   F13 `.sc-b--rows` on every card body whose direct children are row lists
 *       (Processors, Automations), replacing the donor's ad-hoc inline padding.
 *
 * ONE WRITE, ONE SAVE BAR. `updatePaymentSettings` stores the whole payment
 * blob in a single column, so the pane's only `.sactions` — on the Compliance
 * card, exactly where the donor put it — saves processors, defaults and
 * automations together.
 *
 * NOT REAL, and honest about it: no payout-account model exists, so that card
 * shows an empty state and its schedule dropdown, Add-payout modal and the
 * Compliance card's "Send test charge" button stay inert affordances.
 */

import { useState } from "react";

import { updatePaymentSettings } from "@/actions/settings";
import { Field, Modal, SaveBar, Sel, Toggle } from "../ui";
import {
  ADD_PAYOUT_ACTION,
  ADD_PAYOUT_MODAL,
  COMPLIANCE_CARD,
  COMPLIANCE_NOTE,
  CONNECT_ACTION,
  CURRENCY_SELECT,
  DISCONNECT_ACTION,
  NET_TERMS_SELECT,
  PAYMENT_AUTOMATIONS,
  PAYMENT_AUTOMATIONS_CARD,
  PAYMENT_DEFAULTS_CARD,
  PAYMENT_DEFAULT_LABELS,
  PAYOUT_CARD,
  PAYOUT_EMPTY,
  PAYOUT_SCHEDULE_SELECT,
  PROCESSORS,
  PROCESSORS_CARD,
  SEND_TEST_CHARGE_ACTION,
  currencyCodeFor,
  currencyOptionFor,
  type IconName,
  type PaneProps,
  type PaymentAutomationKey,
  type ProcessorKey,
} from "../settings-data";

/** `<svg class="ic"><use href="#i-…"/></svg>` — the page's only icon shape. */
function Ic({ name }: { name: IconName }) {
  return (
    <svg className="ic">
      <use href={`#${name}`} />
    </svg>
  );
}

export function PaymentsPane({ data }: PaneProps) {
  const p = data.payments;

  const [processors, setProcessors] = useState<Record<ProcessorKey, boolean>>(p.processors);
  const [payoutSchedule, setPayoutSchedule] = useState<string>(
    PAYOUT_SCHEDULE_SELECT.defaultValue,
  );
  const [currency, setCurrency] = useState<string>(currencyOptionFor(p.currency));
  const [netTerms, setNetTerms] = useState<string>(p.netTerms);
  const [depositPct, setDepositPct] = useState<string>(p.depositPct);
  const [lateFeePct, setLateFeePct] = useState<string>(p.lateFeePct);
  const [automations, setAutomations] =
    useState<Record<PaymentAutomationKey, boolean>>(p.automations);
  const [accountType, setAccountType] = useState<string>(
    ADD_PAYOUT_MODAL.select.defaultValue,
  );
  const [payoutModalOpen, setPayoutModalOpen] = useState(false);

  const save = () =>
    updatePaymentSettings({
      ...processors,
      ...automations,
      currency: currencyCodeFor(currency),
      // The donor's Deposit % box is free text; a blank or non-numeric entry
      // stores 0 rather than failing the whole save.
      depositPct: Number.parseFloat(depositPct) || 0,
      netTerms,
      lateFeePct,
    });

  return (
    <>
      {/* ── Processors ───────────────────────────────────────────────── */}
      <section className="sc">
        <div className="sc-h">
          <div>
            <div className="sc-t">{PROCESSORS_CARD.title}</div>
            <div className="sc-s">{PROCESSORS_CARD.sub}</div>
          </div>
          {PROCESSORS_CARD.badge ? (
            <span className={`badge2 ${PROCESSORS_CARD.badge.tone}`}>
              <i />
              {PROCESSORS_CARD.badge.label}
            </span>
          ) : null}
        </div>
        {/* F13 — row list, so the body drops to 4px top/bottom. */}
        <div className="sc-b sc-b--rows">
          {PROCESSORS.map((processor) => {
            const on = processors[processor.key];
            const action = on ? DISCONNECT_ACTION : CONNECT_ACTION;
            return (
              <div className="prow" key={processor.key}>
                <span className="prow-ic">
                  <Ic name={processor.icon} />
                </span>
                <span className="prow-b">
                  <span className="prow-n">{processor.name}</span>
                  <span className="prow-d">{processor.desc}</span>
                  {processor.conn ? (
                    <span className="prow-conn">{processor.conn}</span>
                  ) : null}
                </span>
                {/* F4 — no `.tg` here, and no empty `<span>` standing in for one.
                    F3 — ACH carries a Connect button like Square and PayPal.
                    The button IS the control: it flips the org's stored flag,
                    which the pane's Save bar writes. */}
                <span className="prow-act">
                  <button
                    className={`btn btn-ghost btn-sm ${action.state}`}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setProcessors((prev) => ({ ...prev, [processor.key]: !on }))
                    }
                  >
                    {action.icon ? <Ic name={action.icon} /> : null}
                    {action.label}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
        {/* F5 — the donor's "Add a processor" `.sactions` block is removed. */}
      </section>

      {/* ── Payout account ───────────────────────────────────────────── */}
      <section className="sc">
        {/* F8 — the donor's `bg-ok` "Verified" badge is deleted. */}
        <div className="sc-h">
          <div>
            <div className="sc-t">{PAYOUT_CARD.title}</div>
            <div className="sc-s">{PAYOUT_CARD.sub}</div>
          </div>
        </div>
        <div className="sc-b">
          {/* No payout-account model exists yet, so this is the empty state —
              never the donor's invented "checking •••• 3391" row. */}
          <div className="prow">
            <span className="prow-ic">
              <Ic name={PAYOUT_EMPTY.icon} />
            </span>
            <span className="prow-b">
              <span className="prow-n">{PAYOUT_EMPTY.name}</span>
              <span className="prow-d">{PAYOUT_EMPTY.desc}</span>
            </span>
          </div>
          {/* Donor `<div style="margin-top:14px">` — the gap between the account
              row and the schedule field. F10 turns the field into `Sel`. */}
          <div style={{ marginTop: "14px" }}>
            <Sel
              label={PAYOUT_SCHEDULE_SELECT.label}
              value={payoutSchedule}
              options={PAYOUT_SCHEDULE_SELECT.options}
              onChange={setPayoutSchedule}
            />
          </div>
        </div>
        <div className="sactions">
          {/* F11 — this is the modal trigger. */}
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setPayoutModalOpen(true)}
          >
            {ADD_PAYOUT_ACTION.icon ? <Ic name={ADD_PAYOUT_ACTION.icon} /> : null}
            {ADD_PAYOUT_ACTION.label}
          </button>
        </div>
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
          {/* Donor order: Currency · Deposit % · Net terms · Late fee. */}
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
            <Sel
              label={NET_TERMS_SELECT.label}
              value={netTerms}
              options={NET_TERMS_SELECT.options}
              onChange={setNetTerms}
            />
            <Field
              label={PAYMENT_DEFAULT_LABELS.lateFeePct}
              value={lateFeePct}
              onChange={setLateFeePct}
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
        {/* F13 — row list. */}
        <div className="sc-b sc-b--rows">
          {PAYMENT_AUTOMATIONS.map((row) => (
            <div className="trow" key={row.key}>
              <span className="trow-b">
                <span className="trow-n">{row.name}</span>
                <span className="trow-d">{row.desc}</span>
              </span>
              {/* F12 — no icons inside the switch. */}
              <Toggle
                checked={automations[row.key]}
                onChange={(next) =>
                  setAutomations((prev) => ({ ...prev, [row.key]: next }))
                }
                ariaLabel={row.name}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── Compliance ───────────────────────────────────────────────── */}
      <section className="sc">
        {/* F9 — the donor's `bg-ok` "Verified" badge is deleted. */}
        <div className="sc-h">
          <div>
            <div className="sc-t">{COMPLIANCE_CARD.title}</div>
            <div className="sc-s">{COMPLIANCE_CARD.sub}</div>
          </div>
        </div>
        <div className="sc-b">
          {/* Donor writes this `.mono-box` with no `.copy` button — it is a
              standing note, not a value you copy. */}
          <div className="mono-box">
            <code>{COMPLIANCE_NOTE}</code>
          </div>
        </div>
        {/* The pane's one Save bar: `paymentSettingsJson` is a single column, so
            this writes processors + defaults + automations in one call. */}
        <SaveBar
          onSave={save}
          extra={
            <button className="btn btn-ghost" type="button">
              {SEND_TEST_CHARGE_ACTION.icon ? (
                <Ic name={SEND_TEST_CHARGE_ACTION.icon} />
              ) : null}
              {SEND_TEST_CHARGE_ACTION.label}
            </button>
          }
        />
      </section>

      {/* ── F11 — Add payout account ─────────────────────────────────── */}
      {payoutModalOpen ? (
        <Modal
          title={ADD_PAYOUT_MODAL.title}
          sub={ADD_PAYOUT_MODAL.sub}
          onClose={() => setPayoutModalOpen(false)}
          footer={
            <>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setPayoutModalOpen(false)}
              >
                <Ic name="i-plus" />
                {ADD_PAYOUT_MODAL.submitLabel}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setPayoutModalOpen(false)}
              >
                {ADD_PAYOUT_MODAL.cancelLabel}
              </button>
            </>
          }
        >
          {ADD_PAYOUT_MODAL.fields.map((field) => (
            <Field
              key={field.label}
              label={field.label}
              value={field.value}
              placeholder={field.placeholder}
              disabled={field.disabled}
            />
          ))}
          <Sel
            label={ADD_PAYOUT_MODAL.select.label}
            value={accountType}
            options={ADD_PAYOUT_MODAL.select.options}
            onChange={setAccountType}
          />
        </Modal>
      ) : null}
    </>
  );
}
