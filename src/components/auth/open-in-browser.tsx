"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import {
  externalBrowserUrl,
  inAppPlatform,
  systemBrowserName,
  type InAppBrowser,
} from "@/lib/inAppBrowser";
import s from "./open-in-browser.module.css";

/* The quiet way out of an in-app browser, under the email signup / sign-in
   (lib/inAppBrowser). One tap tries to hand the current address to the
   system browser; when the page is still on screen a moment later — the app
   swallowed the link, or iOS is older than 17 — it says where the app's own
   menu item is, and offers the address to copy. The address keeps its query,
   so the trade, the utm_* and the fbclid survive the move; the webview's
   cookies do not (a separate cookie jar), which is why they ride in the URL. */

/** How long the page may stay visible before the hand-off counts as refused. */
const HANDOFF_MS = 1400;

const noop = () => () => {};
const readPlatform = () => inAppPlatform(navigator.userAgent);

export function OpenInBrowser({ app, className }: { app: InAppBrowser; className?: string }) {
  const [help, setHelp] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  const platform = useSyncExternalStore(noop, readPlatform, () => "other" as const);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const browser = systemBrowserName(platform);
  // iOS apps draw the menu as ⋯, Android ones as ⋮.
  const menu = platform === "android" ? "⋮" : "⋯";

  function open() {
    const href = window.location.href;
    const target = externalBrowserUrl(href, navigator.userAgent, app);
    if (!target) {
      setHelp(true);
      return;
    }
    let left = false;
    const away = () => {
      if (document.visibilityState === "hidden") left = true;
    };
    document.addEventListener("visibilitychange", away);
    window.addEventListener("pagehide", away);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      document.removeEventListener("visibilitychange", away);
      window.removeEventListener("pagehide", away);
      if (!left && document.visibilityState === "visible") setHelp(true);
    }, HANDOFF_MS);
    window.location.href = target;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard refused — the instruction above still works */
    }
  }

  return (
    <div className={className ? `${s.wrap} ${className}` : s.wrap} data-open-in-browser={app}>
      <button type="button" className={s.row} onClick={open}>
        <ExternalLink className={s.ic} aria-hidden="true" />
        <span>
          Open in <b>{browser}</b> for Google sign-in
        </span>
      </button>
      {help ? (
        <div className={s.help} role="status">
          <p>
            Tap <b className={s.glyph}>{menu}</b> in the top corner of this screen, then <b>Open in browser</b>.
          </p>
          <button type="button" className={s.copy} onClick={() => void copy()}>
            {copied ? <Check className={s.ic} aria-hidden="true" /> : <Copy className={s.ic} aria-hidden="true" />}
            {copied ? "Link copied" : "Copy link"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
