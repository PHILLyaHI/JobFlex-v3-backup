"use client";

/**
 * Settings blueprint — PAYMENTS pane.
 *
 * Faithful port of donor `jobflex-settings-blueprint (6).html` lines 2035-2041,
 * with the owner fix list applied on top. Everything the pane renders (strings,
 * option lists, seed states) comes from `settings-data.ts`, which transcribes
 * the donor verbatim.
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
 * The pane wrapper (`.pane` / `.pane-h`) belongs to settings-content.tsx, and
 * the CSS module is applied by it too — every class name here is a plain global
 * string, matching the module's `.bp :global(.content SEL)` scoping.
 */

import { useState } from "react";

import { Field, Modal, SaveBar, Sel, Toggle } from "../ui";
import {
  ADD_PAYOUT_ACTION,
  ADD_PAYOUT_MODAL,
  COMPLIANCE_CARD,
  COMPLIANCE_NOTE,
  CURRENCY_SELECT,
  NET_TERMS_SELECT,
  PAYMENT_AUTOMATIONS,
  PAYMENT_AUTOMATIONS_CARD,
  PAYMENT_DEFAULTS_CARD,
  PAYMENT_DEFAULT_FIELDS,
  PAYOUT_ACCOUNT,
  PAYOUT_CARD,
  PAYOUT_SCHEDULE_SELECT,
  PROCESSORS,
  PROCESSORS_CARD,
  SEND_TEST_CHARGE_ACTION,
  type IconName,
} from "../settings-data";

/** `<svg class="ic"><use href="#i-…"/></svg>` — the page's only icon shape. */
function Ic({ name }: { name: IconName }) {
  return (
    <svg className="ic">
      <use href={`#${name}`} />
    </svg>
  );
}

const [DEPOSIT_FIELD, LATE_FEE_FIELD] = PAYMENT_DEFAULT_FIELDS;

export function PaymentsPane() {
  const [payoutSchedule, setPayoutSchedule] = useState<string>(
    PAYOUT_SCHEDULE_SELECT.defaultValue,
  );
  const [currency, setCurrency] = useState<string>(CURRENCY_SELECT.defaultValue);
  const [netTerms, setNetTerms] = useState<string>(NET_TERMS_SELECT.defaultValue);
  const [automations, setAutomations] = useState<readonly boolean[]>(() =>
    PAYMENT_AUTOMATIONS.map((row) => row.on),
  );
  const [accountType, setAccountType] = useState<string>(
    ADD_PAYOUT_MODAL.select.defaultValue,
  );
  const [payoutModalOpen, setPayoutModalOpen] = useState(false);

  const setAutomation = (index: number, next: boolean) => {
    setAutomations((prev) => prev.map((on, i) => (i === index ? next : on)));
  };

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
          {PROCESSORS.map((processor) => (
            <div className="prow" key={processor.name}>
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
                  F3 — ACH carries a Connect button like Square and PayPal. */}
              <span className="prow-act">
                <button
                  className={
                    processor.action.state
                      ? `btn btn-ghost btn-sm ${processor.action.state}`
                      : "btn btn-ghost btn-sm"
                  }
                  type="button"
                >
                  {processor.action.icon ? <Ic name={processor.action.icon} /> : null}
                  {processor.action.label}
                </button>
              </span>
            </div>
          ))}
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
          <div className="prow">
            <span className="prow-ic">
              <Ic name={PAYOUT_ACCOUNT.icon} />
            </span>
            <span className="prow-b">
              <span className="prow-n">{PAYOUT_ACCOUNT.name}</span>
              <span className="prow-d">{PAYOUT_ACCOUNT.desc}</span>
            </span>
            <span className="prow-act">
              <span className={`badge2 ${PAYOUT_ACCOUNT.badge.tone}`}>
                <i />
                {PAYOUT_ACCOUNT.badge.label}
              </span>
              <button className="btn btn-ghost btn-sm" type="button">
                {PAYOUT_ACCOUNT.action.icon ? (
                  <Ic name={PAYOUT_ACCOUNT.action.icon} />
                ) : null}
                {PAYOUT_ACCOUNT.action.label}
              </button>
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
            <Field label={DEPOSIT_FIELD.label} value={DEPOSIT_FIELD.value} />
            <Sel
              label={NET_TERMS_SELECT.label}
              value={netTerms}
              options={NET_TERMS_SELECT.options}
              onChange={setNetTerms}
            />
            <Field label={LATE_FEE_FIELD.label} value={LATE_FEE_FIELD.value} />
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
          {PAYMENT_AUTOMATIONS.map((row, index) => (
            <div className="trow" key={row.name}>
              <span className="trow-b">
                <span className="trow-n">{row.name}</span>
                <span className="trow-d">{row.desc}</span>
              </span>
              {/* F12 — no icons inside the switch. */}
              <Toggle
                checked={automations[index]}
                onChange={(next) => setAutomation(index, next)}
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
        <SaveBar
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
