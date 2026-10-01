/* In-app browsers (2026-10-01). An ad tapped in Instagram, Facebook,
   Messenger, LINE or TikTok opens the site inside that app's own webview.
   Google refuses OAuth there — "Error 403: disallowed_useragent" on its own
   page, the visitor stuck on it — and One Tap does not render in a webview.
   So in these browsers the Google entries are not offered; the email signup
   is, with one quiet way out to the system browser for whoever wants Google.

   This is the one user-agent read in the app, and it is deliberate (owner,
   2026-10-01): the webview is a fact about the APP, which no media query can
   see. It never chooses a layout — the ≤768px switch still does that.

   Pure functions, safe on the server and in the browser. */

export type InAppBrowser = "instagram" | "facebook" | "line" | "tiktok";
export type InAppPlatform = "ios" | "android" | "other";

/** Which app's webview this user agent is, or null for a real browser.
 *  Instagram first: its UA also carries FBAN on some builds. */
export function detectInAppBrowser(ua: string | null | undefined): InAppBrowser | null {
  const s = ua ?? "";
  if (!s) return null;
  if (/\bInstagram\b/i.test(s)) return "instagram";
  // FBAN/FBIOS (iOS), FBAV (both), FB_IAB/FB4A (Android), Messenger's FBAN/MessengerForiOS.
  if (/FBAN|FBAV|FB_IAB|FBIOS|FB4A/.test(s)) return "facebook";
  if (/\bLine\/\d/i.test(s)) return "line";
  if (/TikTok|musical_ly|BytedanceWebview|\btrill_/i.test(s)) return "tiktok";
  return null;
}

export function inAppPlatform(ua: string | null | undefined): InAppPlatform {
  const s = ua ?? "";
  if (/iPhone|iPad|iPod/.test(s)) return "ios";
  if (/Android/i.test(s)) return "android";
  return "other";
}

/** "CPU iPhone OS 17_4 like Mac OS X" → 17. */
export function iosMajor(ua: string | null | undefined): number | null {
  const m = /\bOS (\d+)[_.]\d+/.exec(ua ?? "");
  return m ? Number(m[1]) : null;
}

/** The browser the "open outside" button names. */
export function systemBrowserName(platform: InAppPlatform): string {
  return platform === "ios" ? "Safari" : platform === "android" ? "Chrome" : "your browser";
}

/** A link the webview hands to the system browser, or null when the only way
 *  out is the app's own menu.
 *   LINE      — its documented `openExternalBrowser=1` parameter.
 *   iOS 17+   — the `x-safari-https://` scheme (Safari's own; older iOS has none).
 *   Android   — an intent: URL for Chrome, falling back to the same address. */
export function externalBrowserUrl(href: string, ua: string, app: InAppBrowser): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (app === "line") {
    url.searchParams.set("openExternalBrowser", "1");
    return url.toString();
  }
  const platform = inAppPlatform(ua);
  if (platform === "ios") {
    const v = iosMajor(ua);
    return v !== null && v >= 17 ? `x-safari-${url.toString()}` : null;
  }
  if (platform === "android") {
    const scheme = url.protocol.replace(":", "");
    return (
      `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${scheme};` +
      `package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url.toString())};end`
    );
  }
  return null;
}
