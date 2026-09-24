"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownToLine, ArrowUpRight, Check, ChevronDown, Facebook, Link2, Pause, ShieldCheck } from "lucide-react";
import { chooseMetaPage, disconnectMeta, importMetaLeads } from "@/actions/metaLeads";
import type { MetaData } from "./settings-data";
import styles from "./meta-connection.module.css";

const notices: Record<string, string> = {
  denied: "Meta authorization was canceled. You can connect again when ready.",
  invalid_state: "The connection request expired or your workspace changed. Please connect again.",
  no_pages: "Meta returned no Pages. Check Page access, your Business Login configuration, and Leads Access in Meta Business settings.",
  failed: "Meta could not authorize this connection. Check that the app role invitation is accepted, all required permissions are granted, and the configuration uses a User access token. Then try again.",
  choose_page: "Authorization received. Choose the Page whose leads belong in this workspace.",
};

export function MetaConnection({ data, mobile = false }: { data: MetaData; mobile?: boolean }) {
  const router = useRouter();
  const query = useSearchParams();
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [paused, setPaused] = useState(false);
  const running = useRef(false);
  useEffect(() => () => { running.current = false; }, []);
  const primary = `${styles.button} ${styles.primary}`;
  const secondary = styles.button;
  const hasPages = data.pages.length > 0;
  const status = data.connected ? "Connected" : data.comingSoon ? "Coming soon" : hasPages ? "Choose a Page" : "Not connected";
  const feedback = message || (!data.connected ? notices[query.get("meta") || ""] : "");

  async function choose() {
    if (!selected || busy) return;
    setBusy(true); setError(false);
    try {
      const result = await chooseMetaPage(selected);
      if (!result.ok) { setError(true); setMessage(result.error); }
      else { setMessage("Page connected. Click Import leads when you are ready."); router.refresh(); }
    } catch { setError(true); setMessage("Connection interrupted. Please try again."); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    setBusy(true); setError(false);
    try {
      const result = await disconnectMeta();
      if (!result.ok) { setError(true); setMessage(result.error); }
      else { setMessage("Disconnected. Existing imported leads remain in your workspace."); router.refresh(); }
    } catch { setError(true); setMessage("Could not disconnect. Please try again."); }
    finally { setBusy(false); }
  }
  async function startImport(resume: boolean) {
    if (running.current) return;
    running.current = true;
    setBusy(true); setImporting(true); setPaused(false); setError(false);
    setMessage("Checking the Page's lead forms…");
    let done = false;
    try {
      let restart = !resume;
      while (running.current) {
        const result = await importMetaLeads(restart);
        restart = false;
        if (!result.ok) { setError(true); setMessage(result.error); break; }
        setMessage(`${result.imported} imported · ${result.skipped} already imported${result.done ? " · Finished" : ""}`);
        if (result.done) { done = true; break; }
      }
    } catch { setError(true); setMessage("Import interrupted. Resume to continue without duplicates."); }
    finally {
      running.current = false;
      setBusy(false); setImporting(false); setPaused(!done);
      router.refresh();
    }
  }

  return (
    <section className={`${styles.root} ${mobile ? styles.mobile : ""}`} aria-label="Meta Business connection">
      <header className={styles.header}>
        <div className={styles.brand}><Facebook size={22} aria-hidden="true" /><h2>Meta Business</h2></div>
        <span className={`${styles.status} ${data.connected ? styles.connected : ""}`}>
          {data.connected && <Check size={14} aria-hidden="true" />}{status}
        </span>
      </header>
      <div className={styles.body}>
        {data.connected ? <>
          <div className={styles.page}>
            <div><p className={styles.label}>Connected Facebook Page</p><h3>{data.pageName || "Facebook Page"}</h3></div>
            <div className={styles.activity}><span className={styles.label}>Last import activity</span>{data.lastImportAt ? <time dateTime={data.lastImportAt}>{new Date(data.lastImportAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</time> : <span>No imports yet</span>}</div>
          </div>
          <div className={styles.task}>
            <div className={styles.taskCopy}>
              <h4>Lead forms</h4>
              <p>Import submissions into Leads. Duplicates are skipped.</p>
            </div>
            <div className={styles.actions}>
              <button type="button" className={primary} disabled={busy || !data.canManage || data.comingSoon} onClick={() => void startImport(false)}><ArrowDownToLine size={18} aria-hidden="true" />{importing ? "Importing…" : "Import leads"}</button>
              {(data.canResume || paused) && !importing && <button type="button" className={secondary} disabled={busy || !data.canManage || data.comingSoon} onClick={() => void startImport(true)}>Resume import</button>}
              {importing && <button type="button" className={secondary} onClick={() => { running.current = false; setMessage("Pausing after the current batch…"); }}><Pause size={16} aria-hidden="true" />Pause import</button>}
            </div>
          </div>
        </> : <>
          <div className={styles.intro}>
            <h3>{hasPages ? "Choose a Page" : "Connect your lead forms"}</h3>
            <p>{hasPages ? "Connect the Page whose leads belong in this workspace." : "Import Facebook and Instagram lead-form submissions into JobFlex."}</p>
          </div>
          {hasPages ? <div className={styles.choice}>
            <div className={styles.field}>
              <label htmlFor={mobile ? "meta-page-mobile" : "meta-page-desktop"}>Facebook Page</label>
              <select id={mobile ? "meta-page-mobile" : "meta-page-desktop"} value={selected} disabled={busy || !data.canManage} onChange={event => setSelected(event.target.value)}><option value="">Choose a Page</option>{data.pages.map(page => <option key={page.id} value={page.id}>{page.name}</option>)}</select>
            </div>
            <button type="button" className={primary} disabled={!selected || busy || !data.canManage || data.comingSoon} onClick={() => void choose()}><Link2 size={18} aria-hidden="true" />{busy ? "Connecting…" : "Connect Page"}</button>
          </div> : <div className={styles.connectAction}>
            <button type="button" className={primary} disabled={busy || data.comingSoon || !data.canManage} onClick={() => { window.location.assign("/api/integrations/meta/connect"); }}><Link2 size={18} aria-hidden="true" />{data.comingSoon ? "Coming soon" : "Connect Meta Business"}</button>
            <p>Use the Facebook account with access to your Page’s leads.</p>
          </div>}
          {hasPages && <div className={styles.actions}>
            <button type="button" className={styles.textButton} disabled={busy || data.comingSoon || !data.canManage} onClick={() => { window.location.assign("/api/integrations/meta/connect"); }}>Use another Facebook account<ArrowUpRight size={16} aria-hidden="true" /></button>
            <button type="button" className={styles.textButton} disabled={busy || !data.canManage} onClick={() => void disconnect()}>Cancel connection</button>
          </div>}
        </>}
        {!data.canManage && <p className={styles.notice}>Only workspace owners and managers can manage this connection.</p>}
        {feedback && <p role={error ? "alert" : "status"} aria-live="polite" className={error ? styles.error : styles.notice}>{feedback}</p>}
      </div>
      <footer className={styles.footer}>
        <details className={styles.details}>
          <summary><ShieldCheck size={17} aria-hidden="true" />Access & privacy<ChevronDown size={16} className={styles.chevron} aria-hidden="true" /></summary>
          <div className={styles.disclosure}>
            <p>JobFlex stores an encrypted Page token. Imported contact details and form answers are visible to authorized workspace members. No ads are created or messages sent.</p>
            <a href="/privacy#meta-leads" target="_blank" rel="noopener noreferrer">Privacy policy<ArrowUpRight size={14} aria-hidden="true" /></a>
            {data.connected && <p>Disconnect removes the stored token; imported leads stay in JobFlex. To also revoke Meta access, open <a href="https://www.facebook.com/settings?tab=business_tools" target="_blank" rel="noopener noreferrer">Facebook Business Integrations</a>.</p>}
          </div>
        </details>
        {data.connected && <button type="button" className={`${styles.textButton} ${styles.disconnect}`} disabled={busy || !data.canManage} onClick={() => void disconnect()}>Disconnect</button>}
      </footer>
    </section>
  );
}
