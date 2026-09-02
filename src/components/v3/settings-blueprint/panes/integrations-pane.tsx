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
//   F15 — Meta > Connection: org text and the connect/disconnect button share
//         one row; `.prow-act--pair` keeps the buttons label-sized, pinned to
//         the RIGHT edge by the base `.prow-act`.
//   F18 — the "Email is not configured" `.note` lost its standalone
//         `<section class="sc">`; it now renders above the `.sub` bar while the
//         Email-templates subtab is active — and only when the transport really
//         is unconfigured.
//   F7  — inherited: `.btn-sm` centres its own label (CSS-side).
//
// REAL DATA:
//   Gmail  — connected iff Organization.gmailTokensJson exists; the rest of the
//            card reads gmailSettingsJson. Connect hands off to the live OAuth
//            route, Disconnect calls disconnectGmail, Save calls
//            updateGmailSettings. Permissions lists the scopes the OAuth route
//            actually requests, and only once a connection exists.
//   Meta   — metaSettingsJson (there is no Meta OAuth; "connected" is the org's
//            own forwarding flag, the same one the classic settings page owns).
//   Email  — the org's EmailTemplate rows.
//
// HONEST EMPTY STATES: no model records webhook deliveries and no
// /api/webhooks/meta route exists, so that card is always empty; the donor's
// invented callback URL is replaced by the app's real origin and its invented
// "Verify token" field is gone; the donor's "Test event" button had nothing
// behind it and is gone too.

import { useState } from "react";
import type { ReactNode } from "react";

import {
  disconnectGmail,
  updateGmailSettings,
  updateMetaSettings,
} from "@/actions/settings";
import type { Badge, CardHead, PaneProps, SubTabKey } from "../settings-data";
import {
  CONNECTED_BADGE,
  DEFAULT_SUBTAB,
  DISCONNECT_ACTION,
  EMAIL_TEMPLATES_CARD,
  EMAIL_TEMPLATES_EMPTY,
  EMAIL_TEMPLATES_NOTE,
  EMAIL_TEMPLATE_EDIT_LABEL,
  EMAIL_TEMPLATE_NEW_ACTION,
  GMAIL_BEHAVIOR_CARD,
  GMAIL_BEHAVIOR_TOGGLES,
  GMAIL_CONNECTION_CARD,
  GMAIL_CONNECT_ACTION,
  GMAIL_FROM_CARD,
  GMAIL_FROM_LABELS,
  GMAIL_PERMISSIONS_CARD,
  GMAIL_SCOPES_EMPTY,
  INTEGRATION_SUBTABS,
  META_CALLBACK_LABEL,
  META_CATEGORY_SELECT,
  META_CONNECTED_DESC,
  META_CONNECTION_CARD,
  META_CONNECTION_ICON,
  META_CONNECT_ACTION,
  META_DISCONNECTED_DESC,
  META_DISCONNECT_ACTION,
  META_LEAD_CARD,
  META_LEAD_TOGGLES,
  META_PAGE_LABEL,
  NOT_CONNECTED_BADGE,
  SCOPE_CHECK,
  SIGNATURE_SELECT,
  WEBHOOKS_CARD,
  WEBHOOKS_EMPTY,
  metaCategoryKeyFor,
  metaCategoryOptionFor,
  signatureKeyFor,
  signatureOptionFor,
} from "../settings-data";
import { CopyBox, Field, SaveBar, Sel, Toggle } from "../ui";

/* ─────────────────────────── local helpers ─────────────────────────── */

/** Donor `.sc-h`: title + sub in one `<div>`, then the badge or a trailing action. */
function CardHeader({
  card,
  badge,
  action,
}: {
  card: CardHead;
  badge?: Badge;
  action?: ReactNode;
}) {
  const shown = badge ?? card.badge;
  return (
    <div className="sc-h">
      <div>
        <div className="sc-t">{card.title}</div>
        <div className="sc-s">{card.sub}</div>
      </div>
      {shown ? (
        <span className={`badge2 ${shown.tone}`}>
          <i />
          {shown.label}
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

/* ──────────────────────────────── pane ─────────────────────────────── */

export function IntegrationsPane({ data }: PaneProps) {
  const { gmail, meta, templates, webhooks, emailConfigured } = data.integrations;

  const [sub, setSub] = useState<SubTabKey>(DEFAULT_SUBTAB);

  const [displayName, setDisplayName] = useState(gmail.displayName);
  const [replyTo, setReplyTo] = useState(gmail.replyTo);
  const [signature, setSignature] = useState<string>(signatureOptionFor(gmail.signature));
  const [sendFromUser, setSendFromUser] = useState(gmail.sendFromUser);
  const [trackOpens, setTrackOpens] = useState(gmail.trackOpens);
  const [autoSync, setAutoSync] = useState(gmail.autoSync);

  const gmailToggle: Record<string, [boolean, (next: boolean) => void]> = {
    sendFromUser: [sendFromUser, setSendFromUser],
    trackOpens: [trackOpens, setTrackOpens],
    autoSync: [autoSync, setAutoSync],
  };

  const saveGmail = () =>
    updateGmailSettings({
      // `connected` is owned by the OAuth callback — the action re-reads the
      // stored value and ignores whatever is passed here.
      connected: gmail.connected,
      sendFromUser,
      trackOpens,
      autoSync,
      displayName,
      replyTo,
      signature: signatureKeyFor(signature),
    });

  const [metaConnected, setMetaConnected] = useState(meta.connected);
  const [metaPage, setMetaPage] = useState<string>(meta.defaultPage);
  const [metaCategory, setMetaCategory] = useState<string>(
    metaCategoryOptionFor(meta.formCategory),
  );
  const [autoCreate, setAutoCreate] = useState(meta.autoCreate);
  const [autoText, setAutoText] = useState(meta.autoText);

  const metaToggle: Record<string, [boolean, (next: boolean) => void]> = {
    autoCreate: [autoCreate, setAutoCreate],
    autoText: [autoText, setAutoText],
  };

  const saveMeta = (connected: boolean) =>
    updateMetaSettings({
      connected,
      autoCreate,
      autoText,
      defaultPage: metaPage,
      formCategory: metaCategoryKeyFor(metaCategory),
    });

  return (
    <>
      {/* F18 (moved again) — the "Email is not configured" note now leads the
          Email-templates subtab: it renders ABOVE the subtab bar, between the
          pane title and the tabs, not inside the Templates card. It only shows
          when no transport is actually configured. */}
      {sub === "email" && !emailConfigured ? (
        <div className="note" style={{ marginBottom: "14px" }}>
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
      ) : null}

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
          <CardHeader
            card={GMAIL_CONNECTION_CARD}
            badge={gmail.connected ? CONNECTED_BADGE : NOT_CONNECTED_BADGE}
          />
          <div className="sc-b">
            {gmail.connected ? (
              /* Donor `style="padding-top:0"` — this row opens the card body. */
              <div className="prow" style={{ paddingTop: 0 }}>
                <span className="prow-ic">
                  <svg className="ic ic--brand">
                    <use href="#i-google" />
                  </svg>
                </span>
                <span className="prow-b">
                  <span className="prow-n">
                    {gmail.connectedEmail || gmail.replyToPlaceholder}
                  </span>
                  <span className="prow-d">{GMAIL_CONNECTION_CARD.sub}</span>
                </span>
                <span className="prow-act">
                  <button
                    className={`btn btn-ghost btn-sm ${DISCONNECT_ACTION.state}`}
                    type="button"
                    onClick={() => void disconnectGmail()}
                  >
                    {DISCONNECT_ACTION.icon ? (
                      <svg className="ic">
                        <use href={`#${DISCONNECT_ACTION.icon}`} />
                      </svg>
                    ) : null}
                    {DISCONNECT_ACTION.label}
                  </button>
                </span>
              </div>
            ) : (
              /* Real OAuth hand-off — same server route the classic settings
                 page uses; Google redirects back through
                 /api/integrations/gmail/callback. */
              <a className="btn btn-primary" href={gmail.connectHref}>
                {GMAIL_CONNECT_ACTION.icon ? (
                  <svg className="ic ic--brand">
                    <use href={`#${GMAIL_CONNECT_ACTION.icon}`} />
                  </svg>
                ) : null}
                {GMAIL_CONNECT_ACTION.label}
              </a>
            )}
          </div>
        </section>

        {/* ── From address ── */}
        <section className="sc">
          <CardHeader card={GMAIL_FROM_CARD} />
          <div className="sc-b">
            <div className="fgrid">
              <Field
                label={GMAIL_FROM_LABELS.displayName}
                value={displayName}
                placeholder={gmail.displayNamePlaceholder}
                onChange={setDisplayName}
              />
              <Field
                label={GMAIL_FROM_LABELS.replyTo}
                value={replyTo}
                placeholder={gmail.replyToPlaceholder}
                onChange={setReplyTo}
              />
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
            {GMAIL_BEHAVIOR_TOGGLES.map((t) => {
              const [on, set] = gmailToggle[t.key];
              return (
                <ToggleRowItem
                  key={t.key}
                  name={t.name}
                  desc={t.desc}
                  on={on}
                  onChange={set}
                />
              );
            })}
          </div>
          {/* The Gmail subtab's one Save bar: gmailSettingsJson is a single
              column, so this writes the From address and the behavior flags
              together. */}
          <SaveBar onSave={saveGmail} />
        </section>

        {/* ── Permissions ── */}
        <section className="sc">
          <CardHeader card={GMAIL_PERMISSIONS_CARD} />
          <div className="sc-b">
            {gmail.scopes.length === 0 ? (
              <div className="prow-d">{GMAIL_SCOPES_EMPTY}</div>
            ) : (
              <div className="scopes">
                {gmail.scopes.map((scope) => (
                  <div className="scope" key={scope}>
                    <i>{SCOPE_CHECK}</i>
                    <code>{scope}</code>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ═══════════════════════ Meta business ═══════════════════════ */}
      <div className={sub === "meta" ? "subpane on" : "subpane"}>
        {/* ── Connection (F15) ── */}
        <section className="sc">
          <CardHeader
            card={META_CONNECTION_CARD}
            badge={metaConnected ? CONNECTED_BADGE : NOT_CONNECTED_BADGE}
          />
          <div className="sc-b">
            {/* Donor `style="padding-top:0"` — this row opens the card body, so
                its own 14px would stack on the body's 18px. */}
            <div className="prow" style={{ paddingTop: 0 }}>
              <span className="prow-ic">
                <svg className="ic">
                  <use href={`#${META_CONNECTION_ICON}`} />
                </svg>
              </span>
              <span className="prow-b">
                <span className="prow-n">{meta.orgName}</span>
                <span className="prow-d">
                  {metaConnected ? META_CONNECTED_DESC : META_DISCONNECTED_DESC}
                </span>
              </span>
              <span className="prow-act prow-act--pair">
                <button
                  className={`btn btn-ghost btn-sm ${
                    metaConnected ? META_DISCONNECT_ACTION.state ?? "" : "is-on"
                  }`}
                  type="button"
                  onClick={() => {
                    const next = !metaConnected;
                    setMetaConnected(next);
                    void saveMeta(next);
                  }}
                >
                  {metaConnected
                    ? META_DISCONNECT_ACTION.label
                    : META_CONNECT_ACTION.label}
                </button>
              </span>
            </div>
            <div className="fld" style={{ margin: "14px 0 12px" }}>
              <span>{META_CALLBACK_LABEL}</span>
              <CopyBox value={meta.callbackUrl} />
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
                label={META_PAGE_LABEL}
                value={metaPage}
                options={meta.pageOptions}
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
              {META_LEAD_TOGGLES.map((t) => {
                const [on, set] = metaToggle[t.key];
                return (
                  <ToggleRowItem
                    key={t.key}
                    name={t.name}
                    desc={t.desc}
                    on={on}
                    onChange={set}
                  />
                );
              })}
            </div>
          </div>
          <SaveBar onSave={() => saveMeta(metaConnected)} />
        </section>

        {/* ── Recent webhook deliveries (F13) ── */}
        <section className="sc">
          <CardHeader card={WEBHOOKS_CARD} />
          <div className="sc-b sc-b--rows">
            {webhooks.length === 0 ? (
              <div className="prow-d">{WEBHOOKS_EMPTY}</div>
            ) : (
              webhooks.map((d) => (
                <div className="dlv" key={`${d.status}-${d.time}-${d.detail}`}>
                  <b className={d.error ? "err" : undefined}>{d.status}</b>
                  <span>{d.detail}</span>
                  <u>{d.time}</u>
                </div>
              ))
            )}
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
            {templates.length === 0 ? (
              <div className="prow-d">{EMAIL_TEMPLATES_EMPTY}</div>
            ) : (
              templates.map((t) => (
                <div className="dlv" key={t.id}>
                  <b>{t.kind}</b>
                  <span>{t.subject}</span>
                  <u>{t.trigger}</u>
                  <button
                    className="icon-sm"
                    type="button"
                    aria-label={EMAIL_TEMPLATE_EDIT_LABEL}
                  >
                    <svg className="ic">
                      <use href="#i-pen" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </>
  );
}
