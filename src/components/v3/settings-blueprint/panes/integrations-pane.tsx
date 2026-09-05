"use client";

// Settings blueprint — INTEGRATIONS pane.
//
// Owns the `.sub` subtab bar and four `.subpane` blocks:
//   Gmail          — Connection · From address · Behavior · Permissions
//   Meta business  — Connection (one button; the Default lead handling card
//                    is gone — owner's call, 2026-09-03 — a connected account
//                    auto-creates leads and never auto-texts the prospect)
//   Stripe         — Connection · Behavior · Permissions · Webhook
//   Square         — Connection · Behavior · Permissions · Webhook
//
// The pane wrapper (`.pane`) and its `.pane-h` header belong to
// settings-content.tsx; this file starts at the `.sub` bar. All four
// `.subpane` blocks stay mounted and are switched by `.subpane` / `.subpane.on`,
// so field text and dropdown state survive a trip through another subtab.
// The page can steer the subtab (`sub` prop): Payments → "Manage", or
// `?tab=integrations&sub=stripe` after an OAuth callback.
//
// REAL DATA:
//   Gmail  — connected iff Organization.gmailTokensJson exists; Connect hands
//            off to the OAuth route, Disconnect calls disconnectGmail, Save
//            calls updateGmailSettings.
//   Meta   — metaSettingsJson (the org's own forwarding flag). No callback
//            URL is shown: the platform's webhook is not the user's business.
//   Stripe / Square — the org's PaymentConnection rows, through
//            getPaymentConnectionStatus (see ./processor-subpane.tsx).
//
// GONE: the Email-templates subtab (its rows and legacy route are untouched,
// just not surfaced here) and the always-empty "Recent webhook deliveries"
// card — the real webhook state is on the Stripe / Square tabs.

import { useState } from "react";
import type { ReactNode } from "react";
import { ProcessorSubpane } from "./processor-subpane";

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
  GMAIL_BEHAVIOR_CARD,
  GMAIL_BEHAVIOR_TOGGLES,
  GMAIL_CONNECTION_CARD,
  GMAIL_CONNECT_ACTION,
  GMAIL_FROM_CARD,
  GMAIL_FROM_LABELS,
  GMAIL_PERMISSIONS_CARD,
  GMAIL_SCOPES_EMPTY,
  COMING_SOON_BADGE,
  COMING_SOON_TAB,
  INTEGRATION_SUBTABS,
  comingSoonNote,
  META_CONNECTED_DESC,
  META_CONNECTION_CARD,
  META_CONNECTION_ICON,
  META_CONNECT_ACTION,
  META_DISCONNECT_ACTION,
  NOT_CONNECTED_BADGE,
  SCOPE_CHECK,
  SIGNATURE_SELECT,
  signatureKeyFor,
  signatureOptionFor,
} from "../settings-data";
import { Field, SaveBar, Sel, Toggle } from "../ui";

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

export function IntegrationsPane({ data, sub: wanted }: PaneProps) {
  const { gmail, meta, stripe, square, connections } = data.integrations;

  const [sub, setSub] = useState<SubTabKey>(wanted ?? DEFAULT_SUBTAB);
  // The page can steer the subtab (Payments → Manage, or ?sub= after OAuth):
  // derive from the prop when it changes, without an effect.
  const [seenWanted, setSeenWanted] = useState(wanted);
  if (wanted !== seenWanted) {
    setSeenWanted(wanted);
    if (wanted) setSub(wanted);
  }

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
  const [metaBusy, setMetaBusy] = useState(false);

  // The one Meta write. Lead handling is fixed policy now: every form
  // submission becomes a lead, nobody gets auto-texted.
  async function setMeta(connected: boolean) {
    setMetaBusy(true);
    setMetaConnected(connected);
    try {
      await updateMetaSettings({
        connected,
        autoCreate: true,
        autoText: false,
        defaultPage: meta.defaultPage,
        formCategory: meta.formCategory,
      });
    } catch {
      setMetaConnected(!connected);
    } finally {
      setMetaBusy(false);
    }
  }

  /** Which tabs the platform has not switched on yet. */
  const soon: Record<SubTabKey, boolean> = {
    gmail: gmail.comingSoon,
    meta: meta.comingSoon,
    stripe: stripe.comingSoon,
    square: square.comingSoon,
  };
  const SOON_NAME: Record<SubTabKey, string> = {
    gmail: "Gmail sending",
    meta: "Meta business",
    stripe: "Stripe",
    square: "Square",
  };

  return (
    <>
      {/* The one banner, above the tabs, for whichever tab is open. */}
      {soon[sub] ? (
        <div className="note note--soon" style={{ marginBottom: "14px" }}>
          <svg className="ic">
            <use href="#i-bell" />
          </svg>
          <div>
            <b>{`${SOON_NAME[sub]} — coming soon`}</b>
            <span>{comingSoonNote(SOON_NAME[sub])}</span>
          </div>
        </div>
      ) : null}

      {/* ── subtab bar ──
          A tab whose integration the platform has not switched on yet carries
          a "Soon" tag, so the state is visible before the tab is opened. */}
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
            {soon[t.key] ? <span className="sub-soon">{COMING_SOON_TAB}</span> : null}
          </button>
        ))}
      </div>

      {/* ══════════════════════════ Gmail ══════════════════════════ */}
      <div className={sub === "gmail" ? "subpane on" : "subpane"}>
        {/* ── Connection ── */}
        <section className="sc">
          <CardHeader
            card={GMAIL_CONNECTION_CARD}
            badge={
              gmail.comingSoon && !gmail.connected
                ? COMING_SOON_BADGE
                : gmail.connected
                  ? CONNECTED_BADGE
                  : NOT_CONNECTED_BADGE
            }
          />
          <div className={gmail.connected ? "sc-b sc-b--rows" : "sc-b"}>
            {gmail.connected ? (
              <div className="prow">
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
        {/* ── Connection ── */}
        <section className="sc">
          <CardHeader
            card={META_CONNECTION_CARD}
            badge={metaConnected ? CONNECTED_BADGE : NOT_CONNECTED_BADGE}
          />
          <div className={metaConnected ? "sc-b sc-b--rows" : "sc-b"}>
            {metaConnected ? (
              <div className="prow">
                <span className="prow-ic">
                  <svg className="ic">
                    <use href={`#${META_CONNECTION_ICON}`} />
                  </svg>
                </span>
                <span className="prow-b">
                  <span className="prow-n">{meta.orgName}</span>
                  <span className="prow-d">{META_CONNECTED_DESC}</span>
                </span>
                <span className="prow-act prow-act--pair">
                  <button
                    className={`btn btn-ghost btn-sm ${META_DISCONNECT_ACTION.state ?? ""}`}
                    type="button"
                    disabled={metaBusy}
                    onClick={() => void setMeta(false)}
                  >
                    {META_DISCONNECT_ACTION.label}
                  </button>
                </span>
              </div>
            ) : (
              /* Same shape as the Gmail Connect button: one primary action,
                 nothing else in the body. */
              <button
                className="btn btn-primary"
                type="button"
                disabled={metaBusy}
                onClick={() => void setMeta(true)}
              >
                <svg className="ic">
                  <use href={`#${META_CONNECTION_ICON}`} />
                </svg>
                {metaBusy ? "Connecting…" : META_CONNECT_ACTION.label}
              </button>
            )}
          </div>
        </section>
      </div>

      {/* ═══════════════════════ Stripe / Square ═══════════════════════ */}
      <div className={sub === "stripe" ? "subpane on" : "subpane"}>
        <ProcessorSubpane d={stripe} conns={connections} />
      </div>
      <div className={sub === "square" ? "subpane on" : "subpane"}>
        <ProcessorSubpane d={square} conns={connections} />
      </div>
    </>
  );
}
