"use client";

import { useState } from "react";
import { MetaConnection } from "../meta-connection";
import { GmailConnection } from "./gmail-connection";
import { ProcessorSubpane } from "./processor-subpane";
import {
  COMING_SOON_TAB, DEFAULT_SUBTAB, comingSoonNote, integrationSubTabs, isVisibleSubTab,
  type PaneProps, type SubTabKey,
} from "../settings-data";

// Keep each provider mounted so switching tabs retains unsaved fields.
export function IntegrationsPane({ data, sub: wanted, notice }: PaneProps) {
  const { gmail, meta, stripe, square, connections } = data.integrations;
  const tabs = integrationSubTabs({ gmail: !gmail.comingSoon || gmail.connected || Boolean(gmail.revokedAt) });
  const [sub, setSub] = useState<SubTabKey>(isVisibleSubTab(wanted, tabs) ? (wanted as SubTabKey) : DEFAULT_SUBTAB);
  const [seenWanted, setSeenWanted] = useState(wanted);
  if (wanted !== seenWanted) {
    setSeenWanted(wanted);
    if (wanted) setSub(wanted);
  }
  const soon: Record<SubTabKey, boolean> = { gmail: gmail.comingSoon, meta: meta.comingSoon, stripe: stripe.comingSoon, square: square.comingSoon };
  const names: Record<SubTabKey, string> = { gmail: "Gmail sending", meta: "Meta business", stripe: "Stripe", square: "Square" };

  return <>
    {soon[sub] && <div className="note note--soon" style={{ marginBottom: "14px" }}>
      <svg className="ic" aria-hidden="true"><use href="#i-bell" /></svg>
      <div><b>{`${names[sub]} — coming soon`}</b><span>{comingSoonNote(names[sub])}</span></div>
    </div>}
    <div className="sub">
      {tabs.map(tab => <button key={tab.key} className={tab.key === sub ? "sub-b on" : "sub-b"} type="button" aria-pressed={tab.key === sub} onClick={() => setSub(tab.key)}>
        {tab.label}{soon[tab.key] && <span className="sub-soon">{COMING_SOON_TAB}</span>}
      </button>)}
    </div>
    <div className={sub === "gmail" ? "subpane on" : "subpane"}><GmailConnection data={gmail} notice={notice?.gmail} /></div>
    <div className={sub === "meta" ? "subpane on" : "subpane"}><MetaConnection data={meta} /></div>
    <div className={sub === "stripe" ? "subpane on" : "subpane"}><ProcessorSubpane d={stripe} conns={connections} /></div>
    <div className={sub === "square" ? "subpane on" : "subpane"}><ProcessorSubpane d={square} conns={connections} /></div>
  </>;
}
