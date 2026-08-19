"use client";

// Settings blueprint — Billing pane.
//
// Faithful port of donor `jobflex-settings-blueprint (6).html` lines 2042-2043
// (the `[data-pane="billing"]` body), minus the `.pane` wrapper and `.pane-h`
// header, which settings-content.tsx owns.
//
// Cards, in donor order:
//   Your plan · Payment methods · Plans · Billing contact · Payment history
//
// Owner fixes applied here:
//   F13 — the Payment methods `.sc-b` is a `.prow` list, so it carries
//         `sc-b--rows` instead of the donor's ad-hoc inline padding.
//   F14 — both tables render through `.stab`, never `.ptab` (the proposals
//         tab-button collision is what broke them in the donor).
//   F7 — button label centring is CSS-side (`.btn-sm { justify-content: center }`);
//        this pane simply uses `btn-sm` inside `.prow-act` so the two action
//        buttons share the one 152px width.
// F10 / F12 do not apply: this pane has no `<select>` and no `.tg` toggle.

import { useState } from "react";

import {
  ADD_PAYMENT_METHOD_ACTION,
  BILLING_CONTACT_CARD,
  BILLING_CONTACT_FIELDS,
  BILLING_DETAILS_ACTION,
  PAYMENT_HISTORY,
  PAYMENT_HISTORY_CARD,
  PAYMENT_HISTORY_COLUMNS,
  PAYMENT_HISTORY_TABLE_MIN_WIDTH,
  PAYMENT_METHODS,
  PAYMENT_METHODS_CARD,
  PLAN_CARD,
  PLAN_SUMMARY,
  PLANS,
  PLANS_CARD,
  PLANS_COLUMNS,
  PLANS_TABLE_MIN_WIDTH,
} from "../settings-data";
import type { ActionSpec, Badge, CardHead, IconName } from "../settings-data";
import { Field, SaveBar } from "../ui";

/* ─────────────────────────── local helpers ─────────────────────────── */

function Icon({ name }: { name: IconName }) {
  return (
    <svg className="ic">
      <use href={`#${name}`} />
    </svg>
  );
}

function Badge2({ badge }: { badge: Badge }) {
  return (
    <span className={`badge2 ${badge.tone}`}>
      <i />
      {badge.label}
    </span>
  );
}

function CardHeader({ head }: { head: CardHead }) {
  return (
    <div className="sc-h">
      <div>
        <div className="sc-t">{head.title}</div>
        <div className="sc-s">{head.sub}</div>
      </div>
      {head.badge ? <Badge2 badge={head.badge} /> : null}
    </div>
  );
}

/** `.btn` with the donor's optional leading sprite icon. */
function Btn({
  action,
  variant,
  small = false,
  onClick,
}: {
  action: ActionSpec;
  variant: "btn-primary" | "btn-ghost";
  small?: boolean;
  onClick?: () => void;
}) {
  const cls = `btn ${variant}${small ? " btn-sm" : ""}${
    action.state ? ` ${action.state}` : ""
  }`;
  return (
    <button className={cls} type="button" onClick={onClick}>
      {action.icon ? <Icon name={action.icon} /> : null}
      {action.label}
    </button>
  );
}

/* Donor payment-method row actions, read out of the fixture rather than
   re-typed: the row that ships with the `Default` badge carries the `Edit`
   action, the other carries the `Make default` action. Every row now renders
   `Edit` (owner request), so the Edit buttons stack in one column; a
   non-default row adds `Make default` to the left of its Edit. Clicking
   `Make default` moves the badge and that extra button to the other row. */
const DEFAULT_METHOD = PAYMENT_METHODS.find((m) => m.badge !== undefined);
const OTHER_METHOD = PAYMENT_METHODS.find((m) => m.badge === undefined);
const DEFAULT_BADGE = DEFAULT_METHOD?.badge;
const DEFAULT_ACTION = DEFAULT_METHOD?.action;
const MAKE_DEFAULT_ACTION = OTHER_METHOD?.action;

/* ──────────────────────────── Billing pane ─────────────────────────── */

export function BillingPane() {
  const [defaultMethod, setDefaultMethod] = useState<string>(
    DEFAULT_METHOD?.name ?? "",
  );
  const [removed, setRemoved] = useState<readonly string[]>([]);

  const methods = PAYMENT_METHODS.filter((m) => !removed.includes(m.name));

  return (
    <>
      {/* ── Your plan ─────────────────────────────────────────────── */}
      <section className="sc">
        <CardHeader head={PLAN_CARD} />
        <div className="sc-b">
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: "20px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div className="plan-big">{PLAN_SUMMARY.name}</div>
              <div className="plan-meta">
                {PLAN_SUMMARY.nextBill}
                <span>{PLAN_SUMMARY.seats}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <Btn action={PLAN_SUMMARY.primaryAction} variant="btn-primary" />
              <Btn action={PLAN_SUMMARY.secondaryAction} variant="btn-ghost" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Payment methods ───────────────────────────────────────── */}
      <section className="sc">
        <CardHeader head={PAYMENT_METHODS_CARD} />
        {/* F13 — `.prow` list body, so the 18px card padding drops to 4px. */}
        <div className="sc-b sc-b--rows">
          {methods.map((m) => {
            const isDefault = m.name === defaultMethod;
            return (
              <div className="prow" key={m.name}>
                <span className="prow-ic">
                  <Icon name={m.icon} />
                </span>
                <span className="prow-b">
                  <span className="prow-n">{m.name}</span>
                  <span className="prow-d">{m.desc}</span>
                </span>
                {isDefault && DEFAULT_BADGE ? (
                  <Badge2 badge={DEFAULT_BADGE} />
                ) : null}
                <span className="prow-act">
                  {!isDefault && MAKE_DEFAULT_ACTION ? (
                    <Btn
                      action={MAKE_DEFAULT_ACTION}
                      variant="btn-ghost"
                      small
                      onClick={() => setDefaultMethod(m.name)}
                    />
                  ) : null}
                  {DEFAULT_ACTION ? (
                    <Btn action={DEFAULT_ACTION} variant="btn-ghost" small />
                  ) : null}
                  <button
                    className="icon-sm"
                    type="button"
                    aria-label={m.removeLabel}
                    onClick={() => setRemoved((prev) => [...prev, m.name])}
                  >
                    <Icon name="i-trash" />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
        <div className="sactions">
          <Btn action={ADD_PAYMENT_METHOD_ACTION} variant="btn-primary" />
          <Btn action={BILLING_DETAILS_ACTION} variant="btn-ghost" />
        </div>
      </section>

      {/* ── Plans (F14: `.stab`, not `.ptab`) ─────────────────────── */}
      <section className="sc">
        <CardHeader head={PLANS_CARD} />
        <div className="sc-b">
          <div className="nwrap">
            <table className="stab" style={{ minWidth: PLANS_TABLE_MIN_WIDTH }}>
              <thead>
                <tr>
                  {PLANS_COLUMNS.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PLANS.map((p) => (
                  <tr key={p.plan} className={p.current ? "cur" : undefined}>
                    <td className="cur">{p.plan}</td>
                    <td>{p.seats}</td>
                    <td>{p.proposals}</td>
                    <td>{p.estimators}</td>
                    <td>{p.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Billing contact ───────────────────────────────────────── */}
      <section className="sc">
        <CardHeader head={BILLING_CONTACT_CARD} />
        <div className="sc-b">
          <div className="fgrid">
            {BILLING_CONTACT_FIELDS.map((f) => (
              <Field
                key={f.label}
                label={f.label}
                value={f.value}
                placeholder={f.placeholder}
                disabled={f.disabled}
              />
            ))}
          </div>
        </div>
        <SaveBar />
      </section>

      {/* ── Payment history (F14: `.stab`, not `.ptab`) ───────────── */}
      <section className="sc">
        <CardHeader head={PAYMENT_HISTORY_CARD} />
        <div className="sc-b">
          <div className="nwrap">
            <table
              className="stab"
              style={{ minWidth: PAYMENT_HISTORY_TABLE_MIN_WIDTH }}
            >
              <thead>
                <tr>
                  {PAYMENT_HISTORY_COLUMNS.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PAYMENT_HISTORY.map((r) => (
                  <tr key={r.date}>
                    <td>{r.date}</td>
                    <td>{r.description}</td>
                    <td>{r.amount}</td>
                    <td>
                      <a className="dl" href="#">
                        <Icon name={r.invoiceIcon} />
                        {r.invoiceLabel}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
