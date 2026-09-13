"use client";

// Settings blueprint — INTEGRATIONS → Stripe / Square subpane.
//
// The deep view of one payment connection, laid out like the Gmail subtab:
// Connection · Behavior · Permissions · Webhook. Everything here is the org's
// real PaymentConnection row (via getPaymentConnectionStatus) — the Payments
// pane's short row links here with "Manage". Stripe offers two ways in:
// Connect (OAuth) and "Use API key" (stripe-key-form.tsx); a key-joined row
// shows the key's permissions and whether our webhook got registered.

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  disconnectSquare,
  disconnectStripeConnect,
  setProviderOffered,
  setStripeAchEnabled,
} from "@/actions/paymentConnections";
import type { Badge, CardHead, ProcessorIntegrationData } from "../settings-data";
import {
  COMING_SOON_BADGE,
  CONNECTED_BADGE,
  CONNECT_ACTION,
  DASHBOARD_HREF,
  DISCONNECT_ACTION,
  NOT_CONNECTED_BADGE,
  OFFER_TOGGLE,
  OPEN_DASHBOARD_LABEL,
  PROCESSOR_BEHAVIOR_CARD,
  PROCESSOR_CONNECTION_CARD,
  PROCESSOR_LAST_EVENT_PREFIX,
  PROCESSOR_NO_EVENTS,
  PROCESSOR_PERMISSIONS_CARD,
  PROCESSOR_SCOPES_EMPTY,
  PROCESSOR_STATE_COPY,
  PROCESSOR_WEBHOOK_CARD,
  RECONNECT_ACTION,
  SCOPE_CHECK,
  STRIPE_ACH_TOGGLE,
  STRIPE_KEY_ACTION,
  STRIPE_KEY_FORM,
  STRIPE_KEY_PERMISSIONS_CARD,
  STRIPE_WEBHOOK_REGISTERED,
  squareConnLine,
  stripeConnLine,
} from "../settings-data";
import { StripeKeyForm } from "./stripe-key-form";
import type { PaymentConnectionStatusView } from "@/lib/payments/connections";
import { CopyBox, Toggle, actionError } from "../ui";

function CardHeader({ card, badge }: { card: CardHead; badge?: Badge }) {
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
    </div>
  );
}

export function ProcessorSubpane({
  d,
  conns,
}: {
  d: ProcessorIntegrationData;
  conns: PaymentConnectionStatusView;
}) {
  const router = useRouter();
  const isStripe = d.key === "stripe";
  const s = conns.stripe;
  const q = conns.square;
  const state = isStripe ? s.state : q.state;
  const connected = state === "connected";
  const hasRow = state !== "not_configured" && state !== "disconnected";
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ach, setAch] = useState(s.achEnabled);
  const [offered, setOffered] = useState(isStripe ? s.offered : q.offered);
  // Stripe's two ways in: OAuth (when the platform offers it) and a pasted
  // key. A row joined by key reconnects through the form, not the OAuth link.
  const [keyOpen, setKeyOpen] = useState(false);
  const viaKey = isStripe && s.auth === "key";
  const keyOffered = isStripe && s.keyOffered;
  const connectHref: string | null = isStripe
    ? s.oauthOffered
      ? conns.connectHref.stripe
      : null
    : conns.connectHref.square;

  async function disconnect() {
    setBusy(true);
    setErr("");
    try {
      if (isStripe) await disconnectStripeConnect();
      else await disconnectSquare();
      router.refresh();
    } catch (e) {
      setErr(actionError(e));
    } finally {
      setBusy(false);
    }
  }

  const modeBadge: Badge | null = hasRow
    ? isStripe
      ? { label: s.livemode === false ? "Test mode" : "Live", tone: s.livemode === false ? "bg-off" : "bg-live" }
      : { label: q.env === "sandbox" ? "Sandbox" : "Production", tone: q.env === "sandbox" ? "bg-off" : "bg-live" }
    : null;

  return (
    <>
      {/* ── Connection ── */}
      <section className="sc">
        <CardHeader
          card={PROCESSOR_CONNECTION_CARD}
          badge={d.comingSoon && !connected ? COMING_SOON_BADGE : connected ? CONNECTED_BADGE : NOT_CONNECTED_BADGE}
        />
        <div className={hasRow ? "sc-b sc-b--rows" : "sc-b"}>
          {hasRow ? (
            <div className="prow">
              <span className="prow-ic">
                <svg className="ic">
                  <use href={isStripe ? "#i-card" : "#i-grid"} />
                </svg>
              </span>
              <span className="prow-b">
                <span className="prow-n">
                  {isStripe ? stripeConnLine(s) : squareConnLine(q)}
                  {modeBadge ? (
                    <span className={`badge2 ${modeBadge.tone}`} style={{ marginLeft: 8 }}>
                      <i />
                      {modeBadge.label}
                    </span>
                  ) : null}
                </span>
                <span className={`prow-d${connected ? "" : " prow-warn"}`}>
                  {connected
                    ? `Connected ${isStripe ? (s.connectedAt ? new Date(s.connectedAt).toLocaleDateString() : "") : q.connectedAt ? new Date(q.connectedAt).toLocaleDateString() : ""}`
                    : PROCESSOR_STATE_COPY[state]}
                </span>
              </span>
              <span className="prow-act prow-act--pair">
                {!connected ? (
                  viaKey || !connectHref ? (
                    keyOffered ? (
                      <button
                        className={`btn btn-ghost btn-sm ${RECONNECT_ACTION.state}`}
                        type="button"
                        onClick={() => setKeyOpen((v) => !v)}
                      >
                        {RECONNECT_ACTION.label}
                      </button>
                    ) : null
                  ) : (
                    <a className={`btn btn-ghost btn-sm ${RECONNECT_ACTION.state}`} href={connectHref}>
                      {RECONNECT_ACTION.label}
                    </a>
                  )
                ) : null}
                <button
                  className={`btn btn-ghost btn-sm ${DISCONNECT_ACTION.state}`}
                  type="button"
                  disabled={busy}
                  onClick={() => void disconnect()}
                >
                  {DISCONNECT_ACTION.label}
                </button>
              </span>
            </div>
          ) : (
            <div>
              <div className="prow-d" style={{ marginBottom: 12 }}>
                {PROCESSOR_STATE_COPY[state]}
              </div>
              {state === "disconnected" ? (
                <div className="skf-ways">
                  {connectHref ? (
                    <a className={`btn btn-primary`} href={connectHref}>
                      <svg className="ic">
                        <use href={`#${CONNECT_ACTION.icon}`} />
                      </svg>
                      {`Connect ${isStripe ? "Stripe" : "Square"}`}
                    </a>
                  ) : null}
                  {keyOffered ? (
                    <>
                      {connectHref ? <span className="skf-or">{STRIPE_KEY_FORM.or}</span> : null}
                      <button
                        className={`btn ${connectHref ? "btn-ghost" : "btn-primary"}`}
                        type="button"
                        aria-expanded={keyOpen}
                        onClick={() => setKeyOpen((v) => !v)}
                      >
                        <svg className="ic">
                          <use href={`#${STRIPE_KEY_ACTION.icon ?? "i-card"}`} />
                        </svg>
                        {STRIPE_KEY_ACTION.label}
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
          {keyOpen && !connected ? (
            <div style={{ marginTop: 14 }}>
              <StripeKeyForm
                feePct={conns.platformFeePct}
                onCancel={() => setKeyOpen(false)}
                onDone={(r) => {
                  if (r.webhook) setKeyOpen(false); // else the form shows the webhook note
                }}
              />
            </div>
          ) : null}
          {err ? <div className="prow-d prow-warn" style={{ marginTop: 10 }}>{err}</div> : null}
          {hasRow ? (
            <div style={{ marginTop: 14 }}>
              <a className="btn btn-ghost btn-sm" href={DASHBOARD_HREF[d.key]} target="_blank" rel="noreferrer">
                <svg className="ic">
                  <use href="#i-ext" />
                </svg>
                {OPEN_DASHBOARD_LABEL[d.key]}
              </a>
            </div>
          ) : null}
        </div>
      </section>

      {/* ── Behavior ── */}
      {hasRow ? (
        <section className="sc">
          <CardHeader card={PROCESSOR_BEHAVIOR_CARD} />
          <div className="sc-b sc-b--rows">
            <div className="trow">
              <span className="trow-b">
                <span className="trow-n">{OFFER_TOGGLE.name}</span>
                <span className="trow-d">{OFFER_TOGGLE.desc}</span>
              </span>
              <Toggle
                checked={offered}
                onChange={(next) => {
                  setOffered(next);
                  void setProviderOffered({ provider: d.key, offered: next }).catch((e) => setErr(actionError(e)));
                }}
                ariaLabel={OFFER_TOGGLE.name}
              />
            </div>
            {isStripe ? (
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
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ── Permissions ── */}
      <section className="sc">
        <CardHeader card={viaKey ? STRIPE_KEY_PERMISSIONS_CARD : PROCESSOR_PERMISSIONS_CARD} />
        <div className="sc-b">
          {(isStripe ? s.scopes : q.scopes).length === 0 ? (
            <div className="prow-d">{PROCESSOR_SCOPES_EMPTY}</div>
          ) : (
            <div className="scopes">
              {(isStripe ? s.scopes : q.scopes).map((scope) => (
                <div className="scope" key={scope}>
                  <i>{SCOPE_CHECK}</i>
                  <code>{scope}</code>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Webhook ── */}
      <section className="sc">
        <CardHeader card={PROCESSOR_WEBHOOK_CARD} />
        <div className="sc-b">
          {viaKey ? (
            <div className={s.webhookRegistered ? "prow-d" : "prow-d prow-warn"} style={{ marginBottom: 10 }}>
              {s.webhookRegistered ? STRIPE_WEBHOOK_REGISTERED : STRIPE_KEY_FORM.webhookMissing}
            </div>
          ) : null}
          <div className="fld">
            <span>Endpoint</span>
            <CopyBox value={d.webhookUrl} />
          </div>
          <div className="prow-d" style={{ marginTop: 10 }}>
            {d.lastEventAt ? `${PROCESSOR_LAST_EVENT_PREFIX}${d.lastEventAt}` : PROCESSOR_NO_EVENTS}
          </div>
        </div>
      </section>
    </>
  );
}
