/* Cookie consent — the one record every optional tracker reads (2026-09-09).
   Two categories on top of the essential cookies:
     analytics  — PostHog (page views, session replay on public pages)
     marketing  — Meta Pixel + Conversions API (advertising measurement)
   Stored as a first-party cookie so the server can read it too (the
   Conversions API sends fbp/fbc/IP/UA only with marketing consent).

   TWO MODELS BY REGION (2026-09-10), decided from Vercel's country header
   through /api/consent/region:
     notice  — US and Canada: both categories on by default, a strip at the
               bottom says so ("Got it" / "Cookie settings"), and the footer
               carries "Do not sell or share my personal information", which
               turns marketing off. The record is written at first paint with
               `implied: true`; "Got it" only sets `ack`.
     optin   — everywhere else and an unknown country: nothing optional runs
               until the visitor chooses in the banner.

   Client-safe: nothing touches `document` until a function is called. */

export const CONSENT_COOKIE = "jf_consent";
export const CONSENT_VERSION = 1;
export const CONSENT_MAX_AGE_S = 60 * 60 * 24 * 180; // 180 days
/** Fired on `window` after every write; detail is the new Consent. */
export const CONSENT_EVENT = "jf:consent";
/** Fired on `window` to open the banner's manage view (footer "Cookie settings"). */
export const CONSENT_OPEN_EVENT = "jf:consent-open";

export interface Consent {
  v: number;
  /** ISO time of the decision. */
  at: string;
  analytics: boolean;
  marketing: boolean;
  /** Notice model: defaults recorded without an explicit choice. */
  implied?: boolean;
  /** Notice model: the strip was dismissed with "Got it". */
  ack?: boolean;
}

export type ConsentMode = "notice" | "optin";

/** US and Canada get the notice model; everyone else, and unknown, opt in. */
export function consentModeFor(country: string | null | undefined): ConsentMode {
  const c = (country ?? "").toUpperCase();
  return c === "US" || c === "CA" ? "notice" : "optin";
}

export function parseConsentCookie(value: string | undefined | null): Consent | null {
  if (!value) return null;
  try {
    const c = JSON.parse(decodeURIComponent(value)) as Partial<Consent>;
    if (typeof c !== "object" || c === null || c.v !== CONSENT_VERSION) return null;
    return {
      v: CONSENT_VERSION,
      at: typeof c.at === "string" ? c.at : "",
      analytics: c.analytics === true,
      marketing: c.marketing === true,
      ...(c.implied ? { implied: true } : {}),
      ...(c.ack ? { ack: true } : {}),
    };
  } catch {
    return null;
  }
}

function cookieValue(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(name + "="));
  return hit ? hit.slice(name.length + 1) : undefined;
}

export function readConsent(): Consent | null {
  return parseConsentCookie(cookieValue(CONSENT_COOKIE));
}

export function writeConsent(choice: { analytics: boolean; marketing: boolean; implied?: boolean; ack?: boolean }): Consent {
  const consent: Consent = {
    v: CONSENT_VERSION,
    at: new Date().toISOString(),
    analytics: choice.analytics,
    marketing: choice.marketing,
    ...(choice.implied ? { implied: true } : {}),
    ...(choice.ack ? { ack: true } : {}),
  };
  try {
    document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(consent))}; path=/; max-age=${CONSENT_MAX_AGE_S}; samesite=lax`;
  } catch {
    /* cookies blocked — the choice lasts for this page only */
  }
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: consent }));
  } catch {
    /* no window */
  }
  return consent;
}

/** Subscribe to consent changes; returns the unsubscribe. */
export function onConsent(cb: (c: Consent) => void): () => void {
  const handler = (ev: Event) => cb((ev as CustomEvent<Consent>).detail);
  window.addEventListener(CONSENT_EVENT, handler);
  return () => window.removeEventListener(CONSENT_EVENT, handler);
}

/** "Do not sell or share my personal information": marketing off, the rest kept. */
export function withdrawMarketing(): Consent {
  const current = readConsent();
  return writeConsent({ analytics: current?.analytics ?? true, marketing: false, ack: true });
}

export function openConsentManager(): void {
  try {
    window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
  } catch {
    /* no window */
  }
}
