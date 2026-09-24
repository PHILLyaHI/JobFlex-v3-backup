"use client";

import { useState } from "react";
import { Check, ChevronDown, Link2, Mail, Send, ShieldCheck } from "lucide-react";
import { disconnectGmail, sendGmailTestEmail, updateGmailSettings } from "@/actions/settings";
import { toast } from "@/components/ui/Toast";
import {
  GMAIL_BEHAVIOR_TOGGLES, GMAIL_FROM_LABELS, GMAIL_OAUTH_NOTICE,
  GMAIL_PERMISSIONS_CARD, GMAIL_REVOKED_NOTE, GMAIL_SCOPES_EMPTY,
  type GmailData,
} from "../settings-data";
import { SaveBar, Toggle } from "../ui";
import styles from "../meta-connection.module.css";
import layout from "./integration-cards.module.css";

export function GmailConnection({ data, notice, mobile = false }: { data: GmailData; notice?: string; mobile?: boolean }) {
  const [displayName, setDisplayName] = useState(data.displayName);
  const [replyTo, setReplyTo] = useState(data.replyTo);
  const [sendFromUser, setSendFromUser] = useState(data.sendFromUser);
  const [busy, setBusy] = useState<"test" | "disconnect" | null>(null);
  const oauthNotice = notice ? GMAIL_OAUTH_NOTICE[notice] : undefined;
  const revoked = !data.connected && Boolean(data.revokedAt);
  const unavailable = data.comingSoon && !data.connected && !revoked;
  const status = data.connected ? "Connected" : revoked ? "Reconnect needed" : unavailable ? "Coming soon" : "Not connected";
  const primary = `${styles.button} ${styles.primary}`;
  const behavior = GMAIL_BEHAVIOR_TOGGLES[0];

  async function test() {
    setBusy("test");
    try {
      const result = await sendGmailTestEmail();
      toast.success("Test email sent", `To ${result.to}, ${result.via === "gmail" ? "from your Gmail" : "from the JobFlex address"}.`);
    } catch (error) {
      toast.error("Test email failed", error instanceof Error ? error.message : "Try again in a minute.");
    } finally { setBusy(null); }
  }

  async function disconnect() {
    setBusy("disconnect");
    try {
      await disconnectGmail();
      toast.success("Gmail disconnected", "Mail now leaves from the JobFlex address with you as reply-to.");
    } catch (error) {
      toast.error("Couldn't disconnect", error instanceof Error ? error.message : "Try again in a minute.");
    } finally { setBusy(null); }
  }

  return (
    <section className={`${styles.root} ${layout.surface} ${mobile ? `${styles.mobile} ${layout.mobile}` : ""}`} aria-label="Gmail connection">
      <header className={styles.header}>
        <div className={styles.brand}><Mail size={22} aria-hidden="true" /><h2>Gmail</h2></div>
        <span className={`${styles.status} ${data.connected ? styles.connected : ""}`}>
          {data.connected && <Check size={14} aria-hidden="true" />}{status}
        </span>
      </header>
      <div className={styles.body}>
        {oauthNotice && <div className={styles.notice} role="status"><strong>{oauthNotice.title}</strong><p>{oauthNotice.sub}</p></div>}
        {revoked && <div className={styles.error} role="alert"><strong>{GMAIL_REVOKED_NOTE.title}</strong><p>{GMAIL_REVOKED_NOTE.sub}</p></div>}
        {data.connected ? <div className={styles.page}>
          <div><p className={styles.label}>Connected email</p><h3 className={layout.account}>{data.connectedEmail || data.replyToPlaceholder}</h3></div>
          <div className={styles.actions}><button className={primary} type="button" disabled={busy !== null} onClick={() => void test()}><Send size={16} aria-hidden="true" />{busy === "test" ? "Sending…" : "Send test email"}</button></div>
        </div> : <div className={styles.intro}>
          <h3>Send from your Gmail</h3>
          <p>Send proposals and client emails from your connected address.</p>
          <div className={layout.connectActions}>
            {unavailable ? <button className={primary} type="button" disabled>Coming soon</button> : <a className={primary} href={data.connectHref}><Link2 size={18} aria-hidden="true" />{revoked ? "Reconnect Gmail" : "Connect Gmail"}</a>}
          </div>
        </div>}
      </div>
      <div className={layout.section}>
        <h3 className={layout.sectionTitle}>Sender settings</h3>
        <div className={layout.fields}>
          <label className={layout.field}><span>{GMAIL_FROM_LABELS.displayName}</span><input value={displayName} placeholder={data.displayNamePlaceholder} onChange={event => setDisplayName(event.target.value)} /></label>
          <label className={layout.field}><span>{GMAIL_FROM_LABELS.replyTo}</span><input value={replyTo} inputMode="email" autoCapitalize="none" placeholder={data.replyToPlaceholder} onChange={event => setReplyTo(event.target.value)} /></label>
        </div>
        <div className={layout.toggleRow}>
          <div><strong>{behavior.name}</strong><p>{behavior.desc}</p></div>
          <Toggle checked={sendFromUser} onChange={setSendFromUser} ariaLabel={behavior.name} />
        </div>
        <SaveBar onSave={() => updateGmailSettings({ connected: data.connected, displayName, replyTo, sendFromUser })} />
      </div>
      <footer className={styles.footer}>
        <details className={styles.details}>
          <summary><ShieldCheck size={18} aria-hidden="true" />Permissions<ChevronDown size={16} className={styles.chevron} aria-hidden="true" /></summary>
          <div className={styles.disclosure}>
            <p>{GMAIL_PERMISSIONS_CARD.sub}</p>
            {data.scopes.length ? <ul className={layout.scopes}>{data.scopes.map(scope => <li key={scope}><Check size={14} aria-hidden="true" /><code>{scope}</code></li>)}</ul> : <p>{GMAIL_SCOPES_EMPTY}</p>}
          </div>
        </details>
        {data.connected && <button className={`${styles.textButton} ${styles.disconnect}`} type="button" disabled={busy !== null} onClick={() => void disconnect()}>{busy === "disconnect" ? "Disconnecting…" : "Disconnect"}</button>}
      </footer>
    </section>
  );
}
