"use client";

// Blueprint settings — page CONTENT only. The donor's `.content` children,
// verbatim (jobflex-settings-blueprint (6).html, lines 2005-2129); the sidebar,
// topbar, graph-paper field and the 50-symbol shared sprite come from the
// shared shell (components/v3/blueprint-shell), which persists across
// navigation.
//
// Returning a fragment keeps `.page-head` and `.set` as DIRECT children of
// `.content`, which the donor's grid and the shell's reveal cascade
// (`.content > *`) both depend on.
//
// This file owns the page's two page-level assets:
//   - `./settings-global.css` — the three keyframes (`settings_setIn`,
//     `settings_maskIn`, `settings_modalIn`). Lightning CSS refuses
//     `@keyframes` inside a CSS module, so they live in a plain stylesheet and
//     are imported here, arriving with the page and leaving with it.
//   - `<SettingsSprite/>` — the six symbols the shell sprite lacks (i-card,
//     i-download, i-eye-off, i-globe, i-google, i-receipt).
// It deliberately does NOT import settings.module.css: the shell imports that
// and puts its `.bp` class on the shell root (see blueprint-shell.tsx's
// PAGE_STYLES), which is what scopes every donor rule to this page.
//
// The donor's rail script (donor JS 2196-2202) is reproduced as React state
// rather than DOM class-toggling: `active` picks the `.pane.on` and rewrites
// the `.kicker`. The donor derives the kicker from the button's textContent
// with "NEW" stripped — here the label is read straight from RAIL_ITEMS, so
// the NEW badge is never part of the string to begin with.
//
// All five panes stay MOUNTED and are shown/hidden by the donor's
// `.pane` / `.pane.on` display rules, exactly as the donor does it. That is
// not just fidelity: the panes hold uncontrolled `Field` inputs and local
// dropdown/toggle state, and unmounting the inactive ones would silently
// discard whatever the user had typed on another tab.
//
// This page is presentational — the donor content ships as fixture data in
// ./settings-data.ts. No server actions, API routes or Prisma reads.

import { useState } from "react";
import type { ComponentType } from "react";

import "./settings-global.css";
import { SettingsSprite } from "./sprite";
import {
  DEFAULT_RAIL,
  HELP_ACTION,
  PAGE_TITLE,
  PANE_KICKER,
  RAIL_ITEMS,
  RAIL_NEW_BADGE,
  type RailKey,
} from "./settings-data";
import { AccountPane } from "./panes/account-pane";
import { PaymentsPane } from "./panes/payments-pane";
import { BillingPane } from "./panes/billing-pane";
import { IntegrationsPane } from "./panes/integrations-pane";
import { NotificationsPane } from "./panes/notifications-pane";

/**
 * Rail key → the pane body that follows the shared `.pane-h` header. Keyed by
 * `RailKey`, so adding a rail item without its pane is a type error rather
 * than an empty tab.
 */
const PANE_BODIES: Record<RailKey, ComponentType> = {
  account: AccountPane,
  payments: PaymentsPane,
  billing: BillingPane,
  integrations: IntegrationsPane,
  notifications: NotificationsPane,
};

export function SettingsContent() {
  const [active, setActive] = useState<RailKey>(DEFAULT_RAIL);

  // Donor JS 2201: the page kicker mirrors the active rail label. RAIL_ITEMS is
  // never empty and `active` is always one of its keys, so the fallback is only
  // there to keep the lookup total for TypeScript.
  const activeLabel = RAIL_ITEMS.find((item) => item.key === active)?.label ?? PAGE_TITLE;

  return (
    <>
      <SettingsSprite />

      <div className="page-head">
        <div>
          <div className="kicker">{activeLabel}</div>
          <h1 className="page-title">{PAGE_TITLE}</h1>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" type="button">
            {HELP_ACTION.icon ? (
              <svg className="ic">
                <use href={`#${HELP_ACTION.icon}`} />
              </svg>
            ) : null}
            {HELP_ACTION.label}
          </button>
        </div>
      </div>

      <div className="set">
        <aside className="rail">
          <nav className="rail-nav">
            {RAIL_ITEMS.map((item) => (
              <button
                key={item.key}
                className={`rail-a${item.key === active ? " on" : ""}`}
                type="button"
                data-p={item.key}
                // Purely assistive — the donor marks the active item with the
                // `.on` class alone, and this adds no visual change.
                aria-current={item.key === active ? "true" : undefined}
                onClick={() => setActive(item.key)}
              >
                <svg className="ic">
                  <use href={`#${item.icon}`} />
                </svg>
                {item.label}
                {item.isNew ? <span className="rail-new">{RAIL_NEW_BADGE}</span> : null}
              </button>
            ))}
          </nav>
          <div className="rail-sep"></div>
        </aside>

        <div className="panes">
          {RAIL_ITEMS.map((item) => {
            const PaneBody = PANE_BODIES[item.key];
            return (
              <div
                key={item.key}
                className={`pane${item.key === active ? " on" : ""}`}
                data-pane={item.key}
              >
                <div className="pane-h">
                  <div className="pane-k">{PANE_KICKER}</div>
                  <div className="pane-t">{item.label}</div>
                </div>
                <PaneBody />
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
