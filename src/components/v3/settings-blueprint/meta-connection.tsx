"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  const primary = mobile ? "mst-btn mst-btn--primary" : "btn btn-primary";
  const secondary = mobile ? "mst-btn mst-btn--ghost" : "btn btn-ghost";

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
    <div className={styles.root}>
      {data.connected ? <>
        <div><strong>{data.pageName}</strong><p>Import the available lead-form submissions into this workspace. Existing imports are skipped; no messages are sent to prospects.</p></div>
        {data.lastImportAt && <p>Last import activity: {data.lastImportAt.slice(0, 10)}</p>}
        <div className={styles.actions}>
          <button type="button" className={primary} disabled={busy || !data.canManage || data.comingSoon} onClick={() => void startImport(false)}>{importing ? "Importing…" : "Import leads"}</button>
          {(data.canResume || paused) && !importing && <button type="button" className={secondary} disabled={busy || !data.canManage || data.comingSoon} onClick={() => void startImport(true)}>Resume import</button>}
          {importing && <button type="button" className={secondary} onClick={() => { running.current = false; setMessage("Pausing after the current batch…"); }}>Pause import</button>}
          <button type="button" className={secondary} disabled={busy || !data.canManage} onClick={() => void disconnect()}>Disconnect</button>
        </div>
        <p>Disconnect removes the stored Page token. To revoke Meta authorization too, remove JobFlex in your <a href="https://www.facebook.com/settings?tab=business_tools" target="_blank" rel="noopener noreferrer">Facebook Business Integrations</a>.</p>
      </> : <>
        <p>Connect the Facebook account with access to your business Page and its leads. Choose a Page, then click Import leads. This does not create ads or contact prospects.</p>
        {data.pages.length > 0 && <div className={styles.choice}>
          <label htmlFor={mobile ? "meta-page-mobile" : "meta-page-desktop"}>Facebook Page</label>
          <span className="bp-sel"><select id={mobile ? "meta-page-mobile" : "meta-page-desktop"} className="bp-sel-in" value={selected} disabled={busy || !data.canManage} onChange={event => setSelected(event.target.value)}><option value="">Choose a Page</option>{data.pages.map(page => <option key={page.id} value={page.id}>{page.name}</option>)}</select></span>
          <button type="button" className={primary} disabled={!selected || busy || !data.canManage} onClick={() => void choose()}>{busy ? "Connecting…" : "Connect selected Page"}</button>
        </div>}
        <div className={styles.actions}>
          <button type="button" className={data.pages.length ? secondary : primary} disabled={busy || data.comingSoon || !data.canManage} onClick={() => { window.location.assign("/api/integrations/meta/connect"); }}>{data.comingSoon ? "Coming soon" : data.pages.length ? "Choose a different Facebook account" : "Connect Meta Business account"}</button>
          {data.pages.length > 0 && <button type="button" className={secondary} disabled={busy || !data.canManage} onClick={() => void disconnect()}>Cancel connection</button>}
        </div>
        <p>JobFlex receives authorized Page information and stores an encrypted Page token. Imported contact details and form answers are visible to authorized workspace members. Read our <a href="/privacy#meta-leads" target="_blank" rel="noopener noreferrer">privacy policy</a> before connecting.</p>
      </>}
      {!data.canManage && <p>A workspace owner or manager must manage this connection.</p>}
      {(message || (!data.connected && notices[query.get("meta") || ""])) && <p role={error ? "alert" : "status"} aria-live="polite" className={error ? styles.error : styles.notice}>{message || notices[query.get("meta") || ""]}</p>}
    </div>
  );
}
