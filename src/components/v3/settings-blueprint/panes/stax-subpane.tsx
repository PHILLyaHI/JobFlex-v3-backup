"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, CreditCard, KeyRound } from "lucide-react";
import { disconnectStax, setProviderOffered } from "@/actions/paymentConnections";
import type { PaymentConnectionStatusView } from "@/lib/payments/connections";
import { KEY_FORMS, OFFER_TOGGLE, PROCESSOR_STATE_COPY, staxConnLine } from "../settings-data";
import { Toggle, actionError } from "../ui";
import { ProviderKeyForm } from "./stripe-key-form";
import styles from "../meta-connection.module.css";
import layout from "./integration-cards.module.css";

export function StaxSubpane({ conns, mobile = false }: { conns: PaymentConnectionStatusView; mobile?: boolean }) {
  const router = useRouter();
  const stax = conns.stax;
  const connected = stax.state === "connected";
  const hasRow = stax.state !== "disconnected" && stax.state !== "not_configured";
  const [keyOpen, setKeyOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [offered, setOffered] = useState(stax.offered);
  const keyId = `stax-credentials-${mobile ? "mobile" : "desktop"}`;

  async function disconnect() {
    setBusy(true);
    setErr("");
    try { await disconnectStax(); router.refresh(); }
    catch (error) { setErr(actionError(error)); }
    finally { setBusy(false); }
  }

  return <section className={`${styles.root} ${layout.surface} ${mobile ? `${styles.mobile} ${layout.mobile}` : ""}`} aria-label="Stax connection">
    <header className={styles.header}>
      <div className={styles.brand}><CreditCard size={22} aria-hidden="true" /><h2>Stax</h2></div>
      <span className={`${styles.status} ${connected ? styles.connected : ""}`}>{connected && <Check size={14} aria-hidden="true" />}{connected ? "Connected" : hasRow ? "Needs attention" : "Not connected"}</span>
    </header>
    <div className={styles.body}>
      {hasRow ? <div className={styles.page}><div><p className={styles.label}>Stax account</p><h3 className={layout.account}>{staxConnLine(stax)}</h3></div></div> : <div className={styles.intro}><h3>Take payments with Stax</h3><p>Connect your merchant account with a Stax API key.</p></div>}
      {!connected && stax.state !== "disconnected" && <p className={styles.error} role="status">{PROCESSOR_STATE_COPY[stax.state]}</p>}
      <div className={styles.actions}>
        {!connected && stax.keyOffered && <button type="button" className={`${styles.button} ${styles.primary}`} aria-expanded={keyOpen} aria-controls={keyId} onClick={() => setKeyOpen(value => !value)}><KeyRound size={18} aria-hidden="true" />{hasRow ? "Reconnect Stax" : "Connect Stax"}</button>}
        <a className={styles.button} href="https://app.staxpayments.com" target="_blank" rel="noreferrer"><ArrowUpRight size={18} aria-hidden="true" />Open Stax dashboard</a>
      </div>
      {keyOpen && !connected && <div className={layout.keyForm} id={keyId}><ProviderKeyForm provider="stax" variant={mobile ? "mobile" : "desk"} feePct={conns.platformFeePct} onCancel={() => setKeyOpen(false)} onDone={result => { if (result.webhook) setKeyOpen(false); }} /></div>}
      {hasRow && !stax.webhookRegistered && <p className={styles.error} role="status">{KEY_FORMS.stax.webhookMissing}</p>}
      {err && <p className={styles.error} role="alert">{err}</p>}
    </div>
    {hasRow && <>
      <div className={layout.section}><h3 className={layout.sectionTitle}>Payment options</h3><div className={layout.toggleRow}>
        <div><strong>{OFFER_TOGGLE.name}</strong><p>{OFFER_TOGGLE.desc}</p></div>
        <Toggle checked={offered} ariaLabel={OFFER_TOGGLE.name} onChange={next => { setOffered(next); void setProviderOffered({ provider: "stax", offered: next }).catch(error => { setOffered(!next); setErr(actionError(error)); }); }} />
      </div></div>
      <footer className={styles.footer}><button type="button" className={`${styles.textButton} ${styles.disconnect}`} disabled={busy} onClick={() => void disconnect()}>{busy ? "Disconnecting…" : "Disconnect Stax"}</button></footer>
    </>}
  </section>;
}
