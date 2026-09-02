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
//
// REAL DATA:
//   Your plan       — Subscription + the PricingPlan catalog (getOrgPlanContext);
//                     seats come from the plan's own teamSeats limit.
//   Plans           — the whole catalog. /admin/plans is the single source of
//                     truth, so nothing here is hardcoded.
//   Billing contact — Organization.billingEmail, saved through updateBusiness.
//   Payment history — real Stripe subscription invoices.
//
// HONEST EMPTY STATES: nothing in this codebase reads the customer's stored
// cards off Stripe, so Payment methods shows "No card on file" and both of its
// buttons lead to the real checkout instead of inventing a Visa row. Payment
// history is empty whenever Stripe is off or the org has no Stripe customer.
// "Cancel" has no action behind it anywhere in the app and stays inert.

import { updateBusiness } from "@/actions/accountSettings";
import {
  ADD_PAYMENT_METHOD_ACTION,
  BILLING_CONTACT_CARD,
  BILLING_CONTACT_LABELS,
  BILLING_DETAILS_ACTION,
  PAYMENT_HISTORY_CARD,
  PAYMENT_HISTORY_COLUMNS,
  PAYMENT_HISTORY_EMPTY,
  PAYMENT_HISTORY_TABLE_MIN_WIDTH,
  PAYMENT_METHODS_CARD,
  PAYMENT_METHOD_EMPTY,
  PLANS_CARD,
  PLANS_COLUMNS,
  PLANS_EMPTY,
  PLANS_TABLE_MIN_WIDTH,
  PLAN_CARD,
  PLAN_META_PREFIX,
  PLAN_PRIMARY_ACTION,
  PLAN_SECONDARY_ACTION,
} from "../settings-data";
import type { ActionSpec, Badge, CardHead, IconName, PaneProps } from "../settings-data";
import { Field, SaveBar } from "../ui";
import { useState } from "react";

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

function CardHeader({ head, badge }: { head: CardHead; badge?: Badge | null }) {
  const shown = badge ?? head.badge;
  return (
    <div className="sc-h">
      <div>
        <div className="sc-t">{head.title}</div>
        <div className="sc-s">{head.sub}</div>
      </div>
      {shown ? <Badge2 badge={shown} /> : null}
    </div>
  );
}

/** `.btn` with the donor's optional leading sprite icon. */
function Btn({
  action,
  variant,
  small = false,
  href,
}: {
  action: ActionSpec;
  variant: "btn-primary" | "btn-ghost";
  small?: boolean;
  href?: string;
}) {
  const cls = `btn ${variant}${small ? " btn-sm" : ""}${
    action.state ? ` ${action.state}` : ""
  }`;
  const body = (
    <>
      {action.icon ? <Icon name={action.icon} /> : null}
      {action.label}
    </>
  );
  if (href) {
    return (
      <a className={cls} href={href}>
        {body}
      </a>
    );
  }
  return (
    <button className={cls} type="button">
      {body}
    </button>
  );
}

/* ──────────────────────────── Billing pane ─────────────────────────── */

export function BillingPane({ data }: PaneProps) {
  const b = data.billing;
  const [billingEmail, setBillingEmail] = useState(b.billingEmail);

  return (
    <>
      {/* ── Your plan ─────────────────────────────────────────────── */}
      <section className="sc">
        <CardHeader head={PLAN_CARD} badge={b.planBadge} />
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
              <div className="plan-big">{b.planName}</div>
              <div className="plan-meta">
                {b.nextBill ? `${PLAN_META_PREFIX.nextBill}${b.nextBill}` : null}
                <span>{`${PLAN_META_PREFIX.seats}${b.seats}`}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <Btn action={PLAN_PRIMARY_ACTION} variant="btn-primary" href={b.upgradeHref} />
              {/* No cancel action exists in the app — the button stays inert. */}
              <Btn action={PLAN_SECONDARY_ACTION} variant="btn-ghost" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Payment methods ───────────────────────────────────────── */}
      <section className="sc">
        <CardHeader head={PAYMENT_METHODS_CARD} />
        {/* F13 — `.prow` list body, so the 18px card padding drops to 4px. */}
        <div className="sc-b sc-b--rows">
          <div className="prow">
            <span className="prow-ic">
              <Icon name={PAYMENT_METHOD_EMPTY.icon} />
            </span>
            <span className="prow-b">
              <span className="prow-n">{PAYMENT_METHOD_EMPTY.name}</span>
              <span className="prow-d">{PAYMENT_METHOD_EMPTY.desc}</span>
            </span>
          </div>
        </div>
        <div className="sactions">
          <Btn
            action={ADD_PAYMENT_METHOD_ACTION}
            variant="btn-primary"
            href={b.upgradeHref}
          />
          <Btn action={BILLING_DETAILS_ACTION} variant="btn-ghost" href={b.upgradeHref} />
        </div>
      </section>

      {/* ── Plans (F14: `.stab`, not `.ptab`) ─────────────────────── */}
      <section className="sc">
        <CardHeader head={PLANS_CARD} />
        <div className="sc-b">
          {b.plans.length === 0 ? (
            <div className="prow-d">{PLANS_EMPTY}</div>
          ) : (
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
                  {b.plans.map((p) => (
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
          )}
        </div>
      </section>

      {/* ── Billing contact ───────────────────────────────────────── */}
      <section className="sc">
        <CardHeader head={BILLING_CONTACT_CARD} />
        <div className="sc-b">
          <div className="fgrid">
            <Field
              label={BILLING_CONTACT_LABELS.billingEmail}
              value={billingEmail}
              onChange={setBillingEmail}
            />
          </div>
        </div>
        <SaveBar onSave={() => updateBusiness({ billingEmail })} />
      </section>

      {/* ── Payment history (F14: `.stab`, not `.ptab`) ───────────── */}
      <section className="sc">
        <CardHeader head={PAYMENT_HISTORY_CARD} />
        <div className="sc-b">
          {b.history.length === 0 ? (
            <div className="prow-d">{PAYMENT_HISTORY_EMPTY}</div>
          ) : (
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
                  {b.history.map((r) => (
                    <tr key={r.id}>
                      <td>{r.date}</td>
                      <td>{r.description}</td>
                      <td>{r.amount}</td>
                      <td>
                        {r.invoiceHref ? (
                          <a
                            className="dl"
                            href={r.invoiceHref}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Icon name={r.invoiceIcon} />
                            {r.invoiceLabel}
                          </a>
                        ) : (
                          <span className="dl">{r.invoiceLabel}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
