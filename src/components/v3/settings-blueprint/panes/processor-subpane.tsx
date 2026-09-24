"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, ChevronDown, CreditCard, KeyRound, LayoutGrid, Link2, ShieldCheck, Webhook } from "lucide-react";
import { disconnectSquare, disconnectStripeConnect, setProviderOffered, setStripeAchEnabled } from "@/actions/paymentConnections";
import type { PaymentConnectionStatusView } from "@/lib/payments/connections";
import {
  DASHBOARD_HREF, KEY_FORMS, KEY_WEBHOOK_REGISTERED, OFFER_TOGGLE, OPEN_DASHBOARD_LABEL,
  PROCESSOR_PERMISSIONS_CARD, PROCESSOR_SCOPES_EMPTY, PROCESSOR_STATE_COPY,
  SQUARE_TOKEN_PERMISSIONS_CARD, STRIPE_ACH_TOGGLE, STRIPE_KEY_PERMISSIONS_CARD,
  squareConnLine, stripeConnLine, type ProcessorIntegrationData,
} from "../settings-data";
import { CopyBox, Toggle, actionError } from "../ui";
import { ProviderKeyForm } from "./stripe-key-form";
import { ProviderKeyGuide } from "./provider-key-guide";
import styles from "../meta-connection.module.css";
import layout from "./integration-cards.module.css";

export function ProcessorSubpane({ d, conns, mobile = false }: {
  d: ProcessorIntegrationData;
  conns: PaymentConnectionStatusView;
  mobile?: boolean;
}) {
  const router = useRouter();
  const isStripe = d.key === "stripe";
  const name = isStripe ? "Stripe" : "Square";
  const s = conns.stripe;
  const q = conns.square;
  const state = isStripe ? s.state : q.state;
  const connected = state === "connected";
  const hasRow = state !== "not_configured" && state !== "disconnected";
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ach, setAch] = useState(s.achEnabled);
  const [offered, setOffered] = useState(isStripe ? s.offered : q.offered);
  const [keyOpen, setKeyOpen] = useState(false);
  const viaKey = isStripe ? s.auth === "key" : q.auth === "token";
  const keyOffered = isStripe ? s.keyOffered : q.keyOffered;
  const webhookRegistered = isStripe ? s.webhookRegistered : q.webhookRegistered;
  const keyCopy = KEY_FORMS[d.key];
  const connectHref = (isStripe ? s.oauthOffered : q.oauthOffered) ? conns.connectHref[d.key] : null;
  const connectedAt = isStripe ? s.connectedAt : q.connectedAt;
  const mode = isStripe ? (s.livemode === false ? "Test mode" : "Live") : (q.env === "sandbox" ? "Sandbox" : "Production");
  const permissions = viaKey ? (isStripe ? STRIPE_KEY_PERMISSIONS_CARD : SQUARE_TOKEN_PERMISSIONS_CARD) : PROCESSOR_PERMISSIONS_CARD;
  const scopes = isStripe ? s.scopes : q.scopes;
  const status = connected ? "Connected" : hasRow ? "Needs attention" : d.comingSoon ? "Coming soon" : "Not connected";
  const primary = `${styles.button} ${styles.primary}`;
  const keyId = `${d.key}-credentials-${mobile ? "mobile" : "desktop"}`;

  async function disconnect() {
    setBusy(true);
    setErr("");
    try {
      if (isStripe) await disconnectStripeConnect();
      else await disconnectSquare();
      router.refresh();
    } catch (error) { setErr(actionError(error)); }
    finally { setBusy(false); }
  }

  return (
    <section className={`${styles.root} ${layout.surface} ${mobile ? `${styles.mobile} ${layout.mobile}` : ""}`} aria-label={`${name} connection`}>
      <header className={styles.header}>
        <div className={styles.brand}>{isStripe ? <CreditCard size={22} aria-hidden="true" /> : <LayoutGrid size={22} aria-hidden="true" />}<h2>{name}</h2></div>
        <span className={`${styles.status} ${connected ? styles.connected : ""}`}>{connected && <Check size={14} aria-hidden="true" />}{status}</span>
      </header>
      <div className={styles.body}>
        {hasRow ? <>
          <div className={styles.page}>
            <div>
              <p className={styles.label}>{name} account</p>
              <h3 className={layout.account}>{isStripe ? stripeConnLine(s) : squareConnLine(q)}</h3>
              <div className={layout.meta}>
                <span className={styles.status}>{mode}</span>
                {connectedAt && <span>Connected <time dateTime={connectedAt}>{new Date(connectedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</time></span>}
              </div>
            </div>
          </div>
          {!connected && <p className={styles.error} role="status">{PROCESSOR_STATE_COPY[state]}</p>}
          <div className={styles.actions}>
            {!connected && (viaKey || !connectHref ? keyOffered && <button className={primary} type="button" aria-expanded={keyOpen} aria-controls={keyId} onClick={() => setKeyOpen(value => !value)}><KeyRound size={18} aria-hidden="true" />Reconnect {name}</button> : <a className={primary} href={connectHref}><Link2 size={18} aria-hidden="true" />Reconnect {name}</a>)}
            <a className={connected ? primary : styles.button} href={DASHBOARD_HREF[d.key]} target="_blank" rel="noreferrer"><ArrowUpRight size={18} aria-hidden="true" />{OPEN_DASHBOARD_LABEL[d.key]}</a>
          </div>
        </> : <div className={styles.intro}>
          <h3>Take payments with {name}</h3>
          <p>{state === "not_configured" ? PROCESSOR_STATE_COPY[state] : "Connect your account to collect client payments in JobFlex."}</p>
          {state === "disconnected" && <div className={layout.connectActions}>
            {connectHref && <a className={primary} href={connectHref}><Link2 size={18} aria-hidden="true" />Connect {name}</a>}
            {keyOffered && <button className={connectHref ? styles.button : primary} type="button" aria-expanded={keyOpen} aria-controls={keyId} onClick={() => setKeyOpen(value => !value)}><KeyRound size={18} aria-hidden="true" />{keyCopy.action.label}</button>}
          </div>}
        </div>}
        {!connected && keyOffered && <ProviderKeyGuide provider={d.key} expanded={keyOpen} oauthAvailable={Boolean(connectHref)} />}
        {keyOpen && !connected && <div className={layout.keyForm} id={keyId}>
          <ProviderKeyForm provider={d.key} showDescription={false} variant={mobile ? "mobile" : "desk"} feePct={conns.platformFeePct} onCancel={() => setKeyOpen(false)} onDone={result => { if (result.webhook) setKeyOpen(false); }} />
        </div>}
        {viaKey && !webhookRegistered && <p className={styles.error} role="status">{keyCopy.webhookMissing}</p>}
        {err && <p className={styles.error} role="alert">{err}</p>}
      </div>
      {hasRow && <div className={layout.section}>
        <h3 className={layout.sectionTitle}>Payment options</h3>
        <div className={layout.toggleRow}>
          <div><strong>{OFFER_TOGGLE.name}</strong><p>{OFFER_TOGGLE.desc}</p></div>
          <Toggle checked={offered} ariaLabel={OFFER_TOGGLE.name} onChange={next => {
            setOffered(next);
            void setProviderOffered({ provider: d.key, offered: next }).catch(error => { setOffered(!next); setErr(actionError(error)); });
          }} />
        </div>
        {isStripe && <div className={layout.toggleRow}>
          <div><strong>{STRIPE_ACH_TOGGLE.name}</strong><p>{STRIPE_ACH_TOGGLE.desc}</p></div>
          <Toggle checked={ach} ariaLabel={STRIPE_ACH_TOGGLE.name} onChange={next => {
            setAch(next);
            void setStripeAchEnabled(next).catch(error => { setAch(!next); setErr(actionError(error)); });
          }} />
        </div>}
      </div>}
      <div className={layout.technical}>
        <details className={styles.details}>
          <summary><span className={layout.summaryTitle}><ShieldCheck size={18} aria-hidden="true" />Permissions</span><ChevronDown size={16} className={styles.chevron} aria-hidden="true" /></summary>
          <div className={styles.disclosure}>
            <p>{permissions.sub}</p>
            {scopes.length ? <ul className={layout.scopes}>{scopes.map(scope => <li key={scope}><Check size={14} aria-hidden="true" /><code>{scope}</code></li>)}</ul> : <p>{PROCESSOR_SCOPES_EMPTY}</p>}
          </div>
        </details>
      </div>
      <div className={layout.technical}>
        <details className={styles.details}>
          <summary><span className={layout.summaryTitle}><Webhook size={18} aria-hidden="true" />Webhook</span><ChevronDown size={16} className={styles.chevron} aria-hidden="true" /></summary>
          <div className={styles.disclosure}>
            <p>Payment updates from {name}.</p>
            {viaKey && <p>{webhookRegistered ? KEY_WEBHOOK_REGISTERED : keyCopy.webhookMissing}</p>}
            <div><p className={styles.label}>Endpoint</p><CopyBox value={d.webhookUrl} /></div>
            <p>{d.lastEventAt ? `Last event received · ${d.lastEventAt}` : "No events yet."}</p>
          </div>
        </details>
      </div>
      {hasRow && <footer className={styles.footer}>
        <button className={`${styles.textButton} ${styles.disconnect}`} type="button" disabled={busy} onClick={() => void disconnect()}>{busy ? "Disconnecting…" : `Disconnect ${name}`}</button>
      </footer>}
    </section>
  );
}
