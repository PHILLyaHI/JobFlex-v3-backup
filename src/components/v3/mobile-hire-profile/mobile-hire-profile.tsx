"use client";

// MANAGE YOUR PROFILE · HANDHELD.  Route: /dashboard/hire/profile at ≤768px.
//
// A handheld re-cut of the desktop listing editor
// (../hire-profile-blueprint/hire-profile-content.tsx): the listed / not-listed
// state band with its switch, the live directory-row mirror, the drawn trade
// picker, the specialty tag field and the Places service area — with the ONE
// primary ("Save listing") moved out of the document and into a thumb-zone bar,
// where it is always reachable and where its busy, failure and confirmed states
// sit directly under the press that caused them.
//
// It is served from the same URL as the desktop page through
// ../hire-profile-blueprint/hire-profile-viewport-switch.tsx, whose route is
// listed in the shell's PAGE_OWNED_STATIC set (this page needs server data, so
// the switch cannot live in the shell's props-less map).
//
// ── WHERE THE LOGIC LIVES ──────────────────────────────────────────────────
// ../hire-profile-blueprint/use-hire-profile.ts owns the whole state machine
// and is shared with the desktop build; this file is the HANDHELD RENDERING of
// it and holds no save logic of its own. Two renderers of one contract cannot
// drift on what "listed" means or when a write is confirmed.
//
// ── WHAT IS RE-DECIDED, AND WHAT IS NOT ────────────────────────────────────
// Only the COMPOSITION. Desktop is two columns — the form beside the mirror;
// here the document is one column and the ORDER changes to put the mirror
// second, straight under the state band: on a phone the preview is the thing
// worth seeing before you scroll into a 21-item picker, because it is what
// makes "listed" concrete. Every colour, weight, radius and shadow is the
// desktop module's, value for value.
//
// ── CHROME ─────────────────────────────────────────────────────────────────
// The shared <MobileNav /> — dark topbar, slide-out drawer, icon sprite — as
// the first child of this page's own grid, the arrangement the rest of the
// handheld fleet uses. This page still owns its `.mhp-scroll` and
// `.mhp-content`, because those carry the padding, the graph-paper parallax and
// the reveal cascade, and `.mhp-content > *` is what the cascade measures.
//
// ── STATE, NOT innerHTML ───────────────────────────────────────────────────
// A repaint is not a re-render: rebuilding a container's markup would steal
// focus from the specialty field mid-word. There is no MutationObserver here.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import { TRADE_TYPES } from "@/lib/tradeTypes";
import { attachPlacesSuggest } from "@/components/v3/blueprint-shell/places-suggest";
import type { TradeNetworkProfileDTO } from "@/app/(mobile)/trade-services/trade-data";
import {
  LIMITS,
  directorySubline,
  useHireProfile,
} from "@/components/v3/hire-profile-blueprint/use-hire-profile";
import "./mobile-hire-profile.css";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Icons come from the shared MobileNav sprite mounted above. */
function Icon({ id }: { id: string }) {
  return (
    <svg className="mhp-ic" aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

export function MobileHireProfile({
  profile,
  displayName,
  company,
}: {
  profile: TradeNetworkProfileDTO;
  displayName: string;
  company: string | null;
}) {
  const hp = useHireProfile(profile);
  const { form, saved } = hp;

  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // ── SERVICE AREA — Google Places, city-only ───────────────────────────────
  // Uncontrolled: `attachPlacesSuggest` writes the field itself on a pick, and
  // with no browser key its whole implementation is an `input` listener that
  // reports what was typed. One writer — its `onPick`, which fires on both
  // paths — so the two can never fight over the caret.
  const areaRef = useRef<HTMLInputElement>(null);
  const onArea = useRef(hp.setServiceArea);
  useEffect(() => {
    onArea.current = hp.setServiceArea;
  }, [hp.setServiceArea]);
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    return attachPlacesSuggest(el, {
      // No `className`: the list is appended to <body>, OUTSIDE this tree, and
      // this page's stylesheet is a plain .css whose every selector carries the
      // root class — a body-level rule could not live in it. The module's own
      // `.bp-sug` is the right default here: it is a body-level global in
      // blueprint-global.css, and that sheet loads on this route regardless,
      // because the responsive shell imports BlueprintShell statically.
      cityOnly: true,
      onPick: (p) => {
        const city = p.city && p.state ? `${p.city}, ${p.state}` : p.formatted || p.address;
        onArea.current(city);
      },
    });
  }, []);
  useEffect(() => {
    const el = areaRef.current;
    if (el && el.value !== form.serviceArea) el.value = form.serviceArea;
    // Only on a server-confirmed re-seed / revert, never per keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  // ── SPECIALTIES — a tag field ─────────────────────────────────────────────
  const [draft, setDraft] = useState("");
  const commitDraft = useCallback(() => {
    if (hp.addSpecialty(draft)) setDraft("");
  }, [draft, hp]);

  /* ---------- Motion: reveal on load / on scroll --------------------------
     The donor's Balanced reveal at its own numbers: the first screen's blocks
     cascade at 60ms; anything below the fold waits 200ms and gets a duration
     that follows scroll speed — slow ≈ 900ms, fast never shorter than 550ms. */
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const content = contentRef.current;
    const host = scrollRef.current;
    if (!content || !host) return;

    let lastY = host.scrollTop;
    let lastT = performance.now();
    let vel = 0; // px/ms
    const onScroll = () => {
      const now = performance.now();
      vel = Math.abs(host.scrollTop - lastY) / Math.max(1, now - lastT);
      lastY = host.scrollTop;
      lastT = now;
    };
    host.addEventListener("scroll", onScroll, { passive: true });

    const vpH = window.innerHeight;
    const blocks = Array.from(content.children) as HTMLElement[];
    blocks.forEach((el, i) => {
      el.classList.add("mhp-rv");
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? `${i * 60}ms` : "200ms";
    });

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const t = en.target as HTMLElement;
          if (t.dataset.rvScroll) {
            t.style.transitionDuration = `${Math.round(Math.max(550, 900 - vel * 160))}ms`;
          }
          t.classList.add("mhp-rv-in");
          io.unobserve(t);
          const done = () => {
            t.style.transitionDelay = "";
            t.style.transitionDuration = "";
            t.removeEventListener("transitionend", done);
          };
          t.addEventListener("transitionend", done);
        });
      },
      { threshold: 0, rootMargin: "0px 0px 60px 0px" },
    );
    blocks.forEach((el) => io.observe(el));

    return () => {
      io.disconnect();
      host.removeEventListener("scroll", onScroll);
    };
  }, []);

  /* ---------- Motion: graph-paper parallax (scrollTop × 0.06) ------------- */
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const host = scrollRef.current;
    if (!host) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        host.style.setProperty("--gy", `${(-(host.scrollTop * 0.06)).toFixed(1)}px`);
        ticking = false;
      });
    };
    host.addEventListener("scroll", onScroll, { passive: true });
    return () => host.removeEventListener("scroll", onScroll);
  }, []);

  /* ---------- Motion: press stamp, delegated from the root ---------------- */
  const onRootClick = useCallback((e: React.MouseEvent) => {
    if (prefersReducedMotion()) return;
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(".mhp-btn, .mhp-chip");
    if (!el) return;
    el.classList.remove("mhp-pressed");
    void el.offsetWidth;
    el.classList.add("mhp-pressed");
  }, []);
  const onRootAnimEnd = useCallback((e: React.AnimationEvent) => {
    const el = e.target as HTMLElement;
    if (el.classList?.contains("mhp-pressed")) el.classList.remove("mhp-pressed");
  }, []);

  const previewSub = directorySubline(form.trades, form.specialties);
  const headline = company || displayName;
  const listed = saved.optIn;

  return (
    <div
      className="jf-mobile-hire-profile"
      onClick={onRootClick}
      onAnimationEnd={onRootAnimEnd}
    >
      {/* Shared handheld chrome: dark topbar + slide-out drawer + icon sprite.
          It owns its own state and reads its token contract off this root. */}
      <MobileNav />

      <main className="mhp-scroll" ref={scrollRef}>
        <div className="mhp-content" ref={contentRef}>
          {/* ============ PAGE HEAD ============ */}
          <div className="mhp-head">
            <div className="mhp-kick">Hire &amp; Work</div>
            <h1 className="mhp-title">Your listing</h1>
            <Link className="mhp-back" href="/dashboard/hire">
              <Icon id="i-arrow" />
              Back to Hire
            </Link>
          </div>

          {/* ============ THE STATE BAND ============ */}
          <section className={`mhp-band${form.optIn ? " is-on" : ""}`} aria-labelledby="mhpState">
            <div className="mhp-band-top">
              <span className={`mhp-stamp ${listed ? "is-listed" : "is-off"}`}>
                {listed ? "Listed" : "Not listed"}
              </span>
              <button
                className={`mhp-sw${form.optIn ? " is-on" : ""}`}
                type="button"
                role="switch"
                aria-checked={form.optIn}
                aria-label="List me in the talent directory"
                onClick={() => hp.setOptIn(!form.optIn)}
                disabled={hp.busy}
              >
                <span className="mhp-sw-track">
                  <span className="mhp-sw-knob" />
                </span>
                <span className="mhp-sw-lbl">{form.optIn ? "Open" : "Off"}</span>
              </button>
            </div>

            <h2 className="mhp-band-t" id="mhpState">
              {listed
                ? "You are in other companies' talent directories"
                : "Nobody can find you yet"}
            </h2>
            <p className="mhp-band-m">
              {listed
                ? "Any company outside your own can see the row below and reach out."
                : "Your details are saved, but no directory shows them and no job reaches you."}
            </p>
            {hp.optInPending ? (
              <p className="mhp-pending">
                {form.optIn ? "Goes live when you save" : "Comes down when you save"}
              </p>
            ) : null}

            {/* Honest copy: exactly the two things the record does, no more. */}
            <ul className="mhp-facts">
              <li className="mhp-fact">
                <Icon id="i-send" />
                <span>
                  <b>Matching trade jobs reach you.</b> When another company posts work in a
                  trade you list, the post is broadcast to you.
                </span>
              </li>
              <li className="mhp-fact">
                <Icon id="i-msg" />
                <span>
                  <b>Other companies can contact you.</b> They see your name, company, trades
                  and service area — never your email.
                </span>
              </li>
            </ul>
          </section>

          {/* ============ THE MIRROR — your own directory row ============ */}
          <section className="mhp-mirror">
            <header className="mhp-mirror-head">
              <span>What hirers see</span>
              <span className="mhp-mirror-no">DIRECTORY ROW</span>
            </header>
            <div className="mhp-mirror-body">
              <div className={`mhp-tal-row${form.optIn ? "" : " is-off"}`}>
                <span className="mhp-tal-ic">
                  <Icon id="i-hardhat" />
                </span>
                <span className="mhp-tal-main">
                  <span className="mhp-tal-name">{headline}</span>
                  {company && displayName !== company ? (
                    <span className="mhp-tal-who">{displayName}</span>
                  ) : null}
                  {previewSub ? (
                    <span className="mhp-tal-sub">{previewSub}</span>
                  ) : (
                    <span className="mhp-tal-sub is-empty">No trades or specialties yet</span>
                  )}
                  {form.serviceArea.trim() ? (
                    <span className="mhp-tal-area">{form.serviceArea.trim()}</span>
                  ) : null}
                </span>
                <span className="mhp-tal-btn" aria-hidden="true">
                  <Icon id="i-send" />
                </span>
              </div>
              {form.optIn ? null : (
                <div className="mhp-off-plate">
                  <b>Not in the directory</b>
                  Switch &ldquo;Open&rdquo; on and save, and this row appears for every other
                  company.
                </div>
              )}
            </div>
          </section>

          {/* ============ TRADES ============ */}
          <section className="mhp-card">
            <div className="mhp-lbl-row">
              <h2 className="mhp-lbl">Trades</h2>
              <span className="mhp-count">
                {form.trades.length} / {LIMITS.trades}
              </span>
            </div>
            <div className="mhp-chips" role="group" aria-label="Trades you work in">
              {TRADE_TYPES.map((t) => {
                const on = form.trades.includes(t);
                return (
                  <button
                    className={`mhp-chip${on ? " is-on" : ""}`}
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => hp.toggleTrade(t)}
                    disabled={hp.busy}
                  >
                    <span className="mhp-chip-box" aria-hidden="true">
                      <Icon id="i-check" />
                    </span>
                    {t}
                  </button>
                );
              })}
            </div>
            {form.trades.length === 0 ? (
              <p className="mhp-hint is-warn">
                Pick at least one — a listing with no trade matches nothing.
              </p>
            ) : null}

            {/* "Leads with" — not a new field: the directory prints
                `tradeTypes.join(" · ")`, so this rotates index 0. */}
            {form.trades.length > 1 ? (
              <label className="mhp-field">
                <span className="mhp-lbl">Leads with</span>
                <span className="mhp-sel">
                  <select
                    className="mhp-sel-in"
                    value={form.trades[0]}
                    onChange={(e) => hp.setPrimaryTrade(e.target.value)}
                    disabled={hp.busy}
                  >
                    {form.trades.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </span>
                <span className="mhp-hint">The trade printed first on your row.</span>
              </label>
            ) : null}
          </section>

          {/* ============ SPECIALTIES ============ */}
          <section className="mhp-card">
            <div className="mhp-lbl-row">
              <h2 className="mhp-lbl">Specialties</h2>
              <span className="mhp-count">
                {form.specialties.length} / {LIMITS.specialties}
              </span>
            </div>
            <div className="mhp-tagbox">
              {form.specialties.map((sp) => (
                <span className="mhp-tag" key={sp}>
                  {sp}
                  <button
                    className="mhp-tag-x"
                    type="button"
                    aria-label={`Remove ${sp}`}
                    onClick={() => hp.removeSpecialty(sp)}
                    disabled={hp.busy}
                  >
                    <Icon id="i-x" />
                  </button>
                </span>
              ))}
              <input
                className="mhp-tag-in"
                value={draft}
                maxLength={LIMITS.entry}
                placeholder={form.specialties.length ? "Add another…" : "Metal roofs, decks…"}
                aria-label="Add a specialty"
                enterKeyHint="done"
                disabled={hp.busy}
                onChange={(e) => {
                  if (e.target.value.includes(",")) {
                    const parts = e.target.value.split(",");
                    parts.slice(0, -1).forEach((p) => hp.addSpecialty(p));
                    setDraft(parts[parts.length - 1].trimStart());
                    return;
                  }
                  setDraft(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitDraft();
                  } else if (e.key === "Backspace" && !draft && form.specialties.length) {
                    hp.removeSpecialty(form.specialties[form.specialties.length - 1]);
                  }
                }}
                onBlur={commitDraft}
              />
            </div>
            <p className="mhp-hint">
              Enter or a comma adds one. These are the words a hirer scans for.
            </p>
          </section>

          {/* ============ SERVICE AREA ============ */}
          <section className="mhp-card">
            <label className="mhp-field">
              <span className="mhp-lbl">Service area</span>
              <input
                className="mhp-in"
                ref={areaRef}
                defaultValue={form.serviceArea}
                maxLength={LIMITS.serviceArea}
                placeholder="King County, WA"
                autoComplete="off"
                disabled={hp.busy}
              />
              <span className="mhp-hint">
                Where you will travel. Printed on your row.
              </span>
            </label>
            {hp.dirty && !hp.busy ? (
              <button className="mhp-btn mhp-btn-ghost mhp-discard" type="button" onClick={hp.revert}>
                Discard changes
              </button>
            ) : null}
          </section>
        </div>
      </main>

      {/* ============ THE ACTION BAR — thumb zone ============
          A grid ROW of the shell, not `position: sticky` inside the scroller: a
          row is deterministic at every viewport, cannot be outrun by an
          overscroll, and reserves its own space so the last card is never
          covered. The failure line and the confirmation ride WITH the button,
          because on a phone the card that produced the press has been scrolled
          past by the time the answer lands. */}
      <div className="mhp-bar">
        <div className="mhp-bar-in">
          {hp.error ? (
            <p className="mhp-err" role="alert">
              {hp.error}
            </p>
          ) : null}
          {hp.saveState === "saved" ? (
            <p className="mhp-ok" role="status">
              <Icon id="i-check" />
              Saved — the directory has it
            </p>
          ) : null}
          <button
            className="mhp-btn mhp-btn-primary mhp-btn-block"
            type="button"
            onClick={() => void hp.save()}
            disabled={hp.busy || !hp.dirty}
          >
            {hp.busy ? <span className="mhp-dot" aria-hidden="true" /> : <Icon id="i-check" />}
            {hp.busy ? "Saving…" : hp.dirty ? "Save listing" : "Saved"}
          </button>
        </div>
      </div>
    </div>
  );
}
