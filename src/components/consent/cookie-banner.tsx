"use client";

import { useEffect, useState } from "react";
import { CONSENT_OPEN_EVENT, consentModeFor, readConsent, writeConsent, type Consent, type ConsentMode } from "@/lib/consent";

/* The cookie banner (2026-09-09, region-aware 2026-09-10). Essential
   cookies are always on; Analytics (PostHog) and Marketing (Meta Pixel and
   Conversions API) are the two choices. Two models (lib/consent):
     optin  — the card: nothing optional until "Accept all" / "Essential only"
              / Manage → Save.
     notice — US and Canada: both on by default, recorded as implied at first
              paint; a low strip says so with "Got it" and "Cookie settings".
   "Cookie settings" in the footer reopens the manage view either way.
   Blueprint tokens only — paper card, 1.5 px ink frame, mono caps. Type
   floors (2026-09-10): mono caps 11 px in ink-muted, text and buttons 14 px. */
export function CookieBanner() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ConsentMode>("optin");
  const [manage, setManage] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    let alive = true;
    // After paint, not during the effect: the cookie is a client-only fact and
    // the server rendered the banner closed.
    const id = requestAnimationFrame(() => {
      const current = readConsent();
      if (current) {
        setAnalytics(current.analytics);
        setMarketing(current.marketing);
        if (current.implied && !current.ack) {
          setMode("notice");
          setOpen(true);
        }
        return;
      }
      // No record yet: which model does this visitor get? One request, once.
      fetch("/api/consent/region", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
        .then((j: { country?: string | null } | null) => {
          if (!alive || readConsent()) return;
          const m = consentModeFor(j?.country ?? null);
          setMode(m);
          if (m === "notice") {
            // The defaults are the record; the strip only tells.
            writeConsent({ analytics: true, marketing: true, implied: true });
            setAnalytics(true);
            setMarketing(true);
          }
          setOpen(true);
        });
    });
    const reopen = () => {
      const c = readConsent();
      if (c) {
        setAnalytics(c.analytics);
        setMarketing(c.marketing);
      }
      setManage(true);
      setOpen(true);
    };
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    return () => {
      alive = false;
      cancelAnimationFrame(id);
      window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
    };
  }, []);

  if (!open) return null;

  // ── the notice strip (US / CA), until "Got it" or "Cookie settings" ──
  if (mode === "notice" && !manage) {
    return (
      <div
        role="region"
        aria-label="Cookie notice"
        className="fixed inset-x-0 bottom-0 z-40 border-t-[1.5px] border-[color:var(--ink)] bg-[color:var(--paper-deep)] px-4 py-2.5 text-[color:var(--ink)] sm:px-6"
        data-cookie-notice
      >
        {/* One line on a desk; on a phone the text, then the two buttons under
            it, and the long footer clause left out — a strip, not a card. */}
        <div className="mx-auto flex max-w-[86rem] flex-col gap-y-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6">
          <p className="min-w-0 flex-1 text-[14px] leading-[1.45] text-[color:var(--ink-soft)]">
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--ink-muted)]">Cookies · </span>
            We use analytics (PostHog) and marketing cookies (the Meta Pixel) to measure our pages and ads. Turn them off any time in
            Cookie settings<span className="hidden sm:inline">, or use &ldquo;Do not sell or share my personal information&rdquo; in the footer</span>.{" "}
            <a href="/privacy" className="underline underline-offset-2">Privacy policy</a>.
          </p>
          <div className="flex shrink-0 items-center justify-end gap-2">
            <button
              type="button"
              className="h-8 px-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--ink-muted)] underline-offset-2 hover:underline"
              onClick={() => setManage(true)}
              data-consent="manage"
            >
              Cookie settings
            </button>
            <button
              type="button"
              className="h-8 rounded-[var(--radius)] bg-[color:var(--ink)] px-3.5 text-[14px] font-semibold text-[color:var(--paper-deep)]"
              onClick={() => {
                const c = readConsent();
                writeConsent({ analytics: c?.analytics ?? true, marketing: c?.marketing ?? true, implied: true, ack: true });
                setOpen(false);
              }}
              data-consent="got-it"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    );
  }

  const decide = (choice: { analytics: boolean; marketing: boolean }): Consent => {
    const c = writeConsent({ ...choice, ack: true });
    setOpen(false);
    setManage(false);
    return c;
  };

  const toggle = (on: boolean) =>
    `relative inline-flex h-5 w-9 shrink-0 items-center rounded-[2px] border-[1.5px] transition-colors ${
      on ? "border-[color:var(--ink)] bg-[color:var(--ink)]" : "border-[color:var(--ink-line)] bg-transparent"
    }`;
  const knob = (on: boolean) =>
    `absolute top-[2px] h-3 w-3 rounded-[1px] transition-transform ${on ? "translate-x-[18px] bg-[color:var(--paper-deep)]" : "translate-x-[2px] bg-[color:var(--ink-muted)]"}`;

  return (
    <div
      role="dialog"
      aria-label="Cookie preferences"
      className="fixed inset-x-3 bottom-3 z-[95] mx-auto max-w-[36rem] rounded-[var(--radius)] border-[1.5px] border-[color:var(--ink)] bg-[color:var(--paper-deep)] p-4 text-[color:var(--ink)] shadow-[4px_4px_0_rgba(10,10,10,0.08)] sm:inset-x-auto sm:left-6 sm:bottom-6 sm:p-5"
      data-cookie-banner
    >
      <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--ink-muted)]">Cookies</div>
      <p className="mt-1.5 text-[14px] leading-[1.5] text-[color:var(--ink-soft)]">
        Essential cookies keep you signed in. With your OK we also use analytics (PostHog, first-party) and marketing
        cookies — the Meta Pixel — to measure our ads. Details in the{" "}
        <a href="/privacy" className="underline underline-offset-2">
          privacy policy
        </a>
        .
      </p>

      {manage && (
        <div className="mt-3 grid gap-2 border-t border-[color:var(--ink-line)] pt-3">
          <div className="flex items-center justify-between gap-3 text-[14px]">
            <span>
              <span className="font-semibold">Essential</span>
              <span className="text-[color:var(--ink-muted)]"> · sign-in, security, your cookie choice</span>
            </span>
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--ink-muted)]">Always on</span>
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-3 text-[14px]">
            <span>
              <span className="font-semibold">Analytics</span>
              <span className="text-[color:var(--ink-muted)]"> · PostHog page views and session replay on public pages</span>
            </span>
            <button type="button" role="switch" aria-checked={analytics} className={toggle(analytics)} onClick={() => setAnalytics((v) => !v)} data-consent-toggle="analytics">
              <span className={knob(analytics)} />
            </button>
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3 text-[14px]">
            <span>
              <span className="font-semibold">Marketing</span>
              <span className="text-[color:var(--ink-muted)]"> · Meta Pixel and Conversions API: advertising measurement (_fbp, _fbc)</span>
            </span>
            <button type="button" role="switch" aria-checked={marketing} className={toggle(marketing)} onClick={() => setMarketing((v) => !v)} data-consent-toggle="marketing">
              <span className={knob(marketing)} />
            </button>
          </label>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="h-9 rounded-[var(--radius)] bg-[color:var(--ink)] px-4 text-[14px] font-semibold text-[color:var(--paper-deep)]"
          onClick={() => decide({ analytics: true, marketing: true })}
          data-consent="accept-all"
        >
          Accept all
        </button>
        <button
          type="button"
          className="h-9 rounded-[var(--radius)] border-[1.5px] border-[color:var(--ink)] px-4 text-[14px] font-semibold"
          onClick={() => decide({ analytics: false, marketing: false })}
          data-consent="essential"
        >
          Essential only
        </button>
        {manage ? (
          <button
            type="button"
            className="h-9 rounded-[var(--radius)] border-[1.5px] border-[color:var(--ink-line)] px-4 text-[14px] font-semibold"
            onClick={() => decide({ analytics, marketing })}
            data-consent="save"
          >
            Save choices
          </button>
        ) : (
          <button
            type="button"
            className="h-9 px-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--ink-muted)] underline-offset-2 hover:underline"
            onClick={() => setManage(true)}
            data-consent="manage"
          >
            Manage
          </button>
        )}
      </div>
    </div>
  );
}
