"use client";

// Settings blueprint — INTEGRATIONS pane (donor lines 2044-2101).
//
// Owns the `.sub` subtab bar and its three `.subpane` blocks:
//   Gmail          — Connection · From address · Behavior · Permissions
//   Meta business  — Connection · Default lead handling · Recent webhook deliveries
//   Email templates— Templates (with the F18 note folded in)
//
// The pane wrapper (`.pane`) and its `.pane-h` header belong to
// settings-content.tsx; this file starts at the `.sub` bar. Class names are
// plain global strings — the stylesheet scopes every rule as
// `.bp :global(.content SEL)`, so the module is never imported here.
//
// All three `.subpane` blocks stay mounted and are switched by the donor's
// `.subpane` / `.subpane.on` display rules, so field text and dropdown state
// survive a trip through another subtab.
//
// Owner fixes applied in this file:
//   F10 — the donor's three `<select class="fin">` (Default signature, Default
//         page, Form to lead category) are `Sel` dropdowns. No `<select>` left.
//   F12 — every `.tg` is the `Toggle` primitive: no child check/cross svg.
//   F13 — `sc-b--rows` on the three row-list bodies (Behavior, Recent webhook
//         deliveries, Templates); the donor's ad-hoc inline
//         `padding-top:4px;padding-bottom:4px` is gone.
//   F15 — Meta > Connection: org text and the Test event / Disconnect pair share
//         one row, buttons held toward the LEFT via `.prow-act--pair`.
//   F18 — the "Email is not configured" `.note` lost its standalone
//         `<section class="sc">` and now closes the Templates card `.sc-b`.
//   F7  — inherited: `.btn-sm` centres its own label (CSS-side).

import { useState } from "react";
import type { ReactNode } from "react";

import type { CardHead, SubTabKey } from "../settings-data";
import {
  DEFAULT_SUBTAB,
  EMAIL_TEMPLATES,
  EMAIL_TEMPLATES_CARD,
  EMAIL_TEMPLATES_NOTE,
  EMAIL_TEMPLATE_NEW_ACTION,
  GMAIL_BEHAVIOR_CARD,
  GMAIL_BEHAVIOR_TOGGLES,
  GMAIL_CONNECTION_CARD,
  GMAIL_CONNECT_ACTION,
  GMAIL_FROM_CARD,
  GMAIL_FROM_FIELDS,
  GMAIL_PERMISSIONS_CARD,
  GMAIL_SCOPES,
  INTEGRATION_SUBTABS,
  META_CALLBACK_URL,
  META_CATEGORY_SELECT,
  META_CONNECTION,
  META_CONNECTION_CARD,
  META_LEAD_CARD,
  META_LEAD_TOGGLES,
  META_PAGE_SELECT,
  META_VERIFY_TOKEN,
  SCOPE_CHECK,
  SIGNATURE_SELECT,
  WEBHOOKS_CARD,
  WEBHOOK_DELIVERIES,
} from "../settings-data";
import { CopyBox, Field, Sel, Toggle } from "../ui";

/* ─────────────────────────── local helpers ─────────────────────────── */

/** Donor `.sc-h`: title + sub in one `<div>`, then the badge or a trailing action. */
function CardHeader({ card, action }: { card: CardHead; action?: ReactNode }) {
  return (
    <div className="sc-h">
      <div>
        <div className="sc-t">{card.title}</div>
        <div className="sc-s">{card.sub}</div>
      </div>
      {card.badge ? (
        <span className={`badge2 ${card.badge.tone}`}>
          <i />
          {card.badge.label}
        </span>
      ) : null}
      {action}
    </div>
  );
}

/** Donor `.trow` — label + description on the left, a `.tg` switch on the right. */
function ToggleRowItem({
  name,
  desc,
  on,
  onChange,
}: {
  name: string;
  desc: string;
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="trow">
      <span className="trow-b">
        <span className="trow-n">{name}</span>
        <span className="trow-d">{desc}</span>
      </span>
      <Toggle checked={on} onChange={onChange} ariaLabel={name} />
    </div>
  );
}

/** Flip one index of a boolean row-state array. */
function flipAt(state: readonly boolean[], index: number, next: boolean): boolean[] {
  return state.map((v, i) => (i === index ? next : v));
}

/* ──────────────────────────────── pane ─────────────────────────────── */

export function IntegrationsPane() {
  const [sub, setSub] = useState<SubTabKey>(DEFAULT_SUBTAB);

  const [signature, setSignature] = useState<string>(SIGNATURE_SELECT.defaultValue);
  const [gmailBehavior, setGmailBehavior] = useState<boolean[]>(() =>
    GMAIL_BEHAVIOR_TOGGLES.map((t) => t.on),
  );

  const [metaPage, setMetaPage] = useState<string>(META_PAGE_SELECT.defaultValue);
  const [metaCategory, setMetaCategory] = useState<string>(META_CATEGORY_SELECT.defaultValue);
  const [metaLead, setMetaLead] = useState<boolean[]>(() => META_LEAD_TOGGLES.map((t) => t.on));

  return (
    <>
      {/* ── subtab bar ── */}
      <div className="sub">
        {INTEGRATION_SUBTABS.map((t) => (
          <button
            key={t.key}
            className={t.key === sub ? "sub-b on" : "sub-b"}
            type="button"
            aria-pressed={t.key === sub}
            onClick={() => setSub(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════ Gmail ══════════════════════════ */}
      <div className={sub === "gmail" ? "subpane on" : "subpane"}>
        {/* ── Connection ── */}
        <section className="sc">
          <CardHeader card={GMAIL_CONNECTION_CARD} />
          <div className="sc-b">
            <button className="btn btn-primary" type="button">
              {GMAIL_CONNECT_ACTION.icon ? (
                <svg className="ic">
                  <use href={`#${GMAIL_CONNECT_ACTION.icon}`} />
                </svg>
              ) : null}
              {GMAIL_CONNECT_ACTION.label}
            </button>
          </div>
        </section>

        {/* ── From address ── */}
        <section className="sc">
          <CardHeader card={GMAIL_FROM_CARD} />
          <div className="sc-b">
            <div className="fgrid">
              {GMAIL_FROM_FIELDS.map((f) => (
                <Field
                  key={f.label}
                  label={f.label}
                  value={f.value}
                  placeholder={f.placeholder}
                  disabled={f.disabled}
                />
              ))}
            </div>
            <div style={{ marginTop: "14px" }}>
              {/* F10 — donor `<select class="fin">` */}
              <Sel
                label={SIGNATURE_SELECT.label}
                value={signature}
                options={SIGNATURE_SELECT.options}
                onChange={setSignature}
              />
            </div>
          </div>
        </section>

        {/* ── Behavior (F13) ── */}
        <section className="sc">
          <CardHeader card={GMAIL_BEHAVIOR_CARD} />
          <div className="sc-b sc-b--rows">
            {GMAIL_BEHAVIOR_TOGGLES.map((t, i) => (
              <ToggleRowItem
                key={t.name}
                name={t.name}
                desc={t.desc}
                on={gmailBehavior[i] ?? t.on}
                onChange={(next) => setGmailBehavior((s) => flipAt(s, i, next))}
              />
            ))}
          </div>
        </section>

        {/* ── Permissions ── */}
        <section className="sc">
          <CardHeader card={GMAIL_PERMISSIONS_CARD} />
          <div className="sc-b">
            <div className="scopes">
              {GMAIL_SCOPES.map((scope) => (
                <div className="scope" key={scope}>
                  <i>{SCOPE_CHECK}</i>
                  <code>{scope}</code>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ═══════════════════════ Meta business ═══════════════════════ */}
      <div className={sub === "meta" ? "subpane on" : "subpane"}>
        {/* ── Connection (F15) ── */}
        <section className="sc">
          <CardHeader card={META_CONNECTION_CARD} />
          <div className="sc-b">
            {/* Donor `style="padding-top:0"` — this row opens the card body, so
                its own 14px would stack on the body's 18px. */}
            <div className="prow" style={{ paddingTop: 0 }}>
              <span className="prow-ic">
                <svg className="ic">
                  <use href={`#${META_CONNECTION.icon}`} />
                </svg>
              </span>
              <span className="prow-b">
                <span className="prow-n">{META_CONNECTION.name}</span>
                <span className="prow-d">{META_CONNECTION.desc}</span>
              </span>
              <span className="prow-act prow-act--pair">
                {META_CONNECTION.actions.map((a) => (
                  <button
                    key={a.label}
                    className={a.state ? `btn btn-ghost btn-sm ${a.state}` : "btn btn-ghost btn-sm"}
                    type="button"
                  >
                    {a.icon ? (
                      <svg className="ic">
                        <use href={`#${a.icon}`} />
                      </svg>
                    ) : null}
                    {a.label}
                  </button>
                ))}
              </span>
            </div>
            <div className="fld" style={{ margin: "14px 0 12px" }}>
              <span>{META_CALLBACK_URL.label}</span>
              <CopyBox value={META_CALLBACK_URL.value} />
            </div>
            <div className="fld">
              <span>{META_VERIFY_TOKEN.label}</span>
              <CopyBox value={META_VERIFY_TOKEN.value} />
            </div>
          </div>
        </section>

        {/* ── Default lead handling ── */}
        <section className="sc">
          <CardHeader card={META_LEAD_CARD} />
          <div className="sc-b">
            <div className="fgrid">
              {/* F10 — both were donor `<select class="fin">` */}
              <Sel
                label={META_PAGE_SELECT.label}
                value={metaPage}
                options={META_PAGE_SELECT.options}
                onChange={setMetaPage}
              />
              <Sel
                label={META_CATEGORY_SELECT.label}
                value={metaCategory}
                options={META_CATEGORY_SELECT.options}
                onChange={setMetaCategory}
              />
            </div>
            <div style={{ marginTop: "6px" }}>
              {META_LEAD_TOGGLES.map((t, i) => (
                <ToggleRowItem
                  key={t.name}
                  name={t.name}
                  desc={t.desc}
                  on={metaLead[i] ?? t.on}
                  onChange={(next) => setMetaLead((s) => flipAt(s, i, next))}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ── Recent webhook deliveries (F13) ── */}
        <section className="sc">
          <CardHeader card={WEBHOOKS_CARD} />
          <div className="sc-b sc-b--rows">
            {WEBHOOK_DELIVERIES.map((d) => (
              <div className="dlv" key={`${d.status}-${d.time}-${d.detail}`}>
                <b className={d.error ? "err" : undefined}>{d.status}</b>
                <span>{d.detail}</span>
                <u>{d.time}</u>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ═════════════════════ Email templates ═════════════════════ */}
      <div className={sub === "email" ? "subpane on" : "subpane"}>
        {/* ── Templates (F13 + F18) ── */}
        <section className="sc">
          <CardHeader
            card={EMAIL_TEMPLATES_CARD}
            action={
              <button
                className="btn btn-ghost"
                type="button"
                style={{ marginLeft: "auto", height: "36px", padding: "0 12px" }}
              >
                {EMAIL_TEMPLATE_NEW_ACTION.icon ? (
                  <svg className="ic">
                    <use href={`#${EMAIL_TEMPLATE_NEW_ACTION.icon}`} />
                  </svg>
                ) : null}
                {EMAIL_TEMPLATE_NEW_ACTION.label}
              </button>
            }
          />
          <div className="sc-b sc-b--rows">
            {EMAIL_TEMPLATES.map((t) => (
              <div className="dlv" key={t.kind}>
                <b>{t.kind}</b>
                <span>{t.subject}</span>
                <u>{t.trigger}</u>
                <button className="icon-sm" type="button" aria-label={t.editLabel}>
                  <svg className="ic">
                    <use href="#i-pen" />
                  </svg>
                </button>
              </div>
            ))}

            {/* F18 — was its own `<section class="sc">` in the donor; it now
                closes this card body. */}
            <div className="note" style={{ marginTop: "14px" }}>
              <svg className="ic">
                <use href={`#${EMAIL_TEMPLATES_NOTE.icon}`} />
              </svg>
              <div>
                <b>{EMAIL_TEMPLATES_NOTE.title}</b>
                <span>
                  {EMAIL_TEMPLATES_NOTE.bodyStart}
                  <code>{EMAIL_TEMPLATES_NOTE.code1}</code>
                  {EMAIL_TEMPLATES_NOTE.bodyMid}
                  <code>{EMAIL_TEMPLATES_NOTE.code2}</code>
                  {EMAIL_TEMPLATES_NOTE.bodyEnd}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
