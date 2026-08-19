"use client";

/* JOBFLEX MARKETING LANDING — HANDHELD BUILD
 * ==========================================================================
 * One implementation, two entry points:
 *   · /mobile-landing-v2                    — direct preview at any width
 *   · /landing at <= 768px                  — the live marketing URL, switched
 *     by a media query in src/app/(marketing)/landing/landing-responsive.tsx
 * Neither copies the other; both import this file, so they cannot drift.
 *
 * TRANSLATED, NOT SHRUNK. The design of record is the desktop port in
 * `src/components/v3/landing/` (itself a port of `jobflex-landing (21).html`).
 * Palette, type scale, border weights, shadow treatment, motion timings and
 * ALL BODY COPY are that page's, word for word — nothing is paraphrased,
 * retitled or "improved". What changes is composition, and only where a
 * desktop arrangement cannot survive a 320px column:
 *
 *   1. NAV. The desktop bar is brand | links | Sign in | Get started. At 320px
 *      that is five columns in 320px. Here it is brand | Get started | burger,
 *      with the three links and Sign in in a drawer that drops out of the
 *      sticky bar. "Get started" stays ON the bar rather than going into the
 *      drawer: it is the page's job, and a primary CTA that costs a tap to
 *      find is a primary CTA nobody presses. The width budget is computed in
 *      mobile-landing.css, not estimated.
 *
 *   2. HERO. The desktop's two side-by-side panes become two stacked bands
 *      that keep their identities — the paper pane with the pitch, then the
 *      recessed paper-deep pane with the drawing. Order is deliberate: the
 *      pitch and both CTAs are above the fold on a 320x568 phone; the drawing
 *      is the reward for the first scroll.
 *
 *   3. THE DRAWING. The desktop is one 640x300 sheet — plan on the left, an
 *      eight-row TITLE BLOCK on the right in 8.5–10.5px SVG <text>. Scaled to
 *      a phone column that title block lands near 3.5px: an unreadable smudge
 *      that also drags the plan down with it. So the sheet is CUT IN TWO, the
 *      way a draughtsman folds an A1 onto a clipboard. The plan keeps a
 *      viewBox of its own (`14 18 353 268` — plan plus both dimension strings,
 *      title block cropped out) and renders around 0.74; the title block is
 *      rebuilt below it as real HTML, at real type sizes, every string verbatim
 *      and every one of them now selectable and screen-reader reachable
 *      instead of being locked inside an aria-hidden graphic.
 *
 *   4. FEATURES. Four side-by-side columns become four stacked spec rows —
 *      46px icon plate in the margin, copy in the measure. At 320px the
 *      desktop grid gives each card 68px.
 *
 *   5. THE FIGURES. The 3-up stat block becomes three ledger rows: mono
 *      caption left, tabular numeral filed right against the column edge.
 *      That is DESIGN.md's estimate-line idiom, and it is also the only
 *      arrangement in which "Crews on JobFlex" does not wrap at 320px.
 *
 * CTA ROUTES ARE PRESERVED EXACTLY. Every one of the desktop port's eleven
 * real-route hrefs is carried over unchanged; see the table in the render.
 *
 * Behavior lives in use-mobile-landing-behavior.ts (reveal / estsec / scrollfx
 * / countup, with the pointer-tilt block deliberately not ported — see the
 * header there). The burger is React state, as it is on the desktop page.
 *
 * No data layer: every figure on this page is static copy, exactly as authored.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import "./mobile-landing.css";
import { MobileLandingSprite } from "./mobile-landing-sprite";
import { useMobileLandingBehavior } from "./use-mobile-landing-behavior";
import { lockScroll } from "@/lib/scrollLock";

export function MobileLanding() {
  const rootRef = useRef<HTMLDivElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useMobileLandingBehavior(rootRef);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    burgerRef.current?.focus();
  }, []);

  /* Drawer side effects, both scoped to the open state so nothing runs while
     the menu is shut. The scroll lock is the shared reference-counted one
     (src/lib/scrollLock) rather than a hand-rolled
     `document.body.style.overflow` save/restore — nested locks poison each
     other's saved value and leave the page permanently unscrollable. */
  useEffect(() => {
    if (!menuOpen) return;
    const release = lockScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      release();
    };
  }, [menuOpen, closeMenu]);

  return (
    <div className="jf-mobile-landing" ref={rootRef}>
      <MobileLandingSprite />

      {/* ══ NAV ══════════════════════════════════════════════════════════
          Sticky. 58px tall, so the brand block, the CTA and the burger are all
          full-height targets — no element on this bar is under 44px in either
          axis. The read-progress bar straddles the bottom frame. */}
      <nav className="ml-nav">
        <a className="ml-brand" href="#jfml-top" onClick={closeMenu}>
          {/* The 384px mark, cropped to its ink by an overflow window narrower
              than the image — the same lockup construction as the desktop
              sheet, using the same measured alpha fractions. Plain <img>, not
              next/image: the wrapper element next/image adds would change the
              containing block the crop is measured against.
              eslint-disable-next-line @next/next/no-img-element */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span className="ml-mark-box"><img className="ml-mark-img" alt="" src="/jobflex-mark-384.png" width={384} height={384} /></span>
          <span className="ml-brand-txt">
            <span className="ml-brand-name">JOBFLEX</span>
            <span className="ml-brand-sub">Contractor OS</span>
          </span>
        </a>

        {/* nav "Get started" -> /auth/register */}
        <Link className="ml-nav-cta" href="/auth/register" onClick={closeMenu}>
          Get started
          <svg className="ml-ic" aria-hidden="true"><use href="#jfml-i-arrow-r" /></svg>
        </Link>

        <button
          ref={burgerRef}
          className="ml-burger"
          type="button"
          aria-label={menuOpen ? "Close menu" : "Menu"}
          aria-expanded={menuOpen}
          aria-controls="jfml-menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <svg className="ml-ic" aria-hidden="true">
            <use href={menuOpen ? "#jfml-i-close" : "#jfml-i-menu"} />
          </svg>
        </button>

        <div className="ml-sprog" aria-hidden="true" />

        {/* The drawer. Hand-rolled, no Radix — a panel dropping out of the bar,
            not a modal dialog. It leaves the tab order when shut (visibility,
            not opacity), closes on Escape, on a backdrop tap and on any
            navigation, and returns focus to the burger.
              nav "Pricing"          -> /pricing
              nav "About"            -> /about
              nav "For homeowners"   -> /homeowner
              nav "Sign in"          -> /auth/login              */}
        <div id="jfml-menu" className={menuOpen ? "ml-menu on" : "ml-menu"}>
          <Link href="/pricing" onClick={closeMenu} tabIndex={menuOpen ? undefined : -1}>
            Pricing<svg className="ml-ic" aria-hidden="true"><use href="#jfml-i-arrow" /></svg>
          </Link>
          <Link href="/about" onClick={closeMenu} tabIndex={menuOpen ? undefined : -1}>
            About<svg className="ml-ic" aria-hidden="true"><use href="#jfml-i-arrow" /></svg>
          </Link>
          <Link href="/homeowner" onClick={closeMenu} tabIndex={menuOpen ? undefined : -1}>
            For homeowners<svg className="ml-ic" aria-hidden="true"><use href="#jfml-i-arrow" /></svg>
          </Link>
          <Link
            className="ml-menu-sign"
            href="/auth/login"
            onClick={closeMenu}
            tabIndex={menuOpen ? undefined : -1}
          >
            Sign in<svg className="ml-ic" aria-hidden="true"><use href="#jfml-i-arrow-r" /></svg>
          </Link>
        </div>
      </nav>

      <div
        className={menuOpen ? "ml-scrim on" : "ml-scrim"}
        aria-hidden="true"
        onClick={closeMenu}
      />

      {/* ══ HERO — the pitch ═════════════════════════════════════════════ */}
      <section className="ml-hero-l" id="jfml-top">
        <div className="ml-hero-in">
          <div className="ml-kicker ml-an ml-a1">An operating system for contractors</div>
          <h1 className="ml-h1">
            <span className="ml-an ml-a2">Quote.</span>
            <span className="ml-an ml-a3">Schedule.</span>
            <span className="ml-an ml-a4"><span className="ml-inv">Get paid.</span></span>
          </h1>
          <p className="ml-tagline ml-an ml-a5">
            CRM, smart estimating, proposals, scheduling, and payments — one workspace for{" "}
            <strong>contractors who ship</strong>.
          </p>
          <div className="ml-cta-row ml-an ml-a5">
            {/* hero "Start free trial"        -> /auth/register */}
            <Link className="ml-btn ml-btn-a" href="/auth/register">
              <svg className="ml-ic" aria-hidden="true"><use href="#jfml-i-bulb" /></svg>
              Start free trial
            </Link>
            {/* hero "Or request an estimate"  -> /homeowner */}
            <Link className="ml-btn ml-btn-b" href="/homeowner">
              Or request an estimate
              <svg className="ml-ic" aria-hidden="true"><use href="#jfml-i-arrow" /></svg>
            </Link>
          </div>
          <div className="ml-hero-note ml-an ml-a5">No card required · Set up in 10 minutes</div>
        </div>
      </section>

      {/* ══ HERO — the drawing ═══════════════════════════════════════════ */}
      <section className="ml-hero-r">
        <div className="ml-hero-r-inner ml-rv">
          <div className="ml-card-label">
            <span className="ml-card-label-line" />
            Live estimate
            <span className="ml-card-label-dot" />
          </div>

          <div className="ml-fh-card">
            <div className="ml-fh-head">
              <div className="ml-fh-head-l">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <span className="ml-mini-mark"><img className="ml-mini-mark-img" alt="" src="/jobflex-mark-384.png" width={384} height={384} /></span>
                <span>Kitchen Remodel · <em>Kirkland WA</em></span>
              </div>
              <span className="ml-fh-head-r">
                <span className="ml-fh-dot" />
                <b className="ml-fh-sec">47s</b>
              </span>
            </div>

            <div className="ml-schematic">
              {/* Plan only. The title block that sits at x >= 384 on the desktop
                  sheet is cropped out by this viewBox and rebuilt as HTML below.
                  All geometry is the desktop drawing's, coordinate for
                  coordinate — only the annotation font sizes are nudged (in the
                  stylesheet) so they land back at their desktop optical size
                  after the ~0.74 scale a phone column imposes. */}
              <svg
                className="ml-k-svg"
                viewBox="14 18 353 268"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <defs>
                  <pattern id="jfml-khatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="7" stroke="rgba(242,240,235,.30)" strokeWidth=".8" />
                  </pattern>
                </defs>
                <path className="ml-k-poche" fillRule="evenodd" d="M22 26H327V253H22Z M31 35H318V244H31Z" />
                <rect className="ml-k-cut" x="144" y="26" width="75" height="9" />
                <rect className="ml-k-cut" x="22" y="175" width="9" height="50" />
                <rect className="ml-k-cut" x="181" y="244" width="112" height="9" />
                <path className="ml-k-wall" d="M144 26H22V175 M22 225V253H181 M293 253H327V26H219" />
                <path className="ml-k-wall" d="M144 35H31V175 M31 225V244H181 M293 244H318V35H219" />
                <line className="ml-k-glass" x1="144" y1="28.8" x2="219" y2="28.8" />
                <line className="ml-k-glass" x1="144" y1="32.2" x2="219" y2="32.2" />
                <line className="ml-k-jamb" x1="144" y1="26" x2="144" y2="35" />
                <line className="ml-k-jamb" x1="219" y1="26" x2="219" y2="35" />
                <line className="ml-k-jamb" x1="22" y1="175" x2="31" y2="175" />
                <line className="ml-k-jamb" x1="22" y1="225" x2="31" y2="225" />
                <line className="ml-k-leaf" x1="31" y1="175" x2="81" y2="175" />
                <path className="ml-k-swing" d="M81 175 A50 50 0 0 1 31 225" />
                <line className="ml-k-jamb" x1="181" y1="244" x2="181" y2="253" />
                <line className="ml-k-jamb" x1="293" y1="244" x2="293" y2="253" />
                <rect className="ml-k-cab" x="31" y="35" width="231" height="37" />
                <line className="ml-k-hair" x1="78" y1="35" x2="78" y2="72" />
                <line className="ml-k-hair" x1="125" y1="35" x2="125" y2="72" />
                <line className="ml-k-hair" x1="156" y1="35" x2="156" y2="72" />
                <line className="ml-k-hair" x1="207" y1="35" x2="207" y2="72" />
                <line className="ml-k-hair" x1="244" y1="35" x2="244" y2="72" />
                <rect className="ml-k-app" x="78" y="37" width="47" height="33" />
                <circle className="ml-k-hair" cx="90" cy="46" r="4.2" />
                <circle className="ml-k-hair" cx="90" cy="61" r="4.2" />
                <circle className="ml-k-hair" cx="113" cy="46" r="4.2" />
                <circle className="ml-k-hair" cx="113" cy="61" r="4.2" />
                <rect className="ml-k-app" x="156" y="37" width="51" height="33" />
                <rect className="ml-k-hair" x="161" y="43" width="18" height="21" rx="2.5" />
                <rect className="ml-k-hair" x="183" y="43" width="18" height="21" rx="2.5" />
                <circle className="ml-k-hair" cx="182" cy="40.5" r="2.4" />
                <line className="ml-k-hair" x1="210" y1="69" x2="241" y2="38" />
                <text className="ml-k-lab" x="225.5" y="53.5" textAnchor="middle" dy=".34em">DW</text>
                <rect className="ml-k-app" x="262" y="35" width="56" height="47" />
                <line className="ml-k-hair" x1="290" y1="35" x2="290" y2="82" />
                <line className="ml-k-hair" x1="284" y1="74" x2="284" y2="62" />
                <line className="ml-k-hair" x1="296" y1="74" x2="296" y2="62" />
                <text className="ml-k-lab" x="290" y="91" textAnchor="middle">REF</text>
                <rect className="ml-k-isl" x="123" y="138" width="103" height="56" />
                <rect className="ml-k-hair" x="129" y="144" width="91" height="44" />
                <text className="ml-k-room-t" x="174.5" y="166" textAnchor="middle" dy=".34em">ISLAND</text>
                <path className="ml-k-lead" d="M226 105 L188 76" />
                <circle className="ml-k-mk" cx="234" cy="110" r="9" />
                <text className="ml-k-mk-t" x="234" y="110" textAnchor="middle" dy=".34em">B1</text>
                <path className="ml-k-lead" d="M70 106 L88 75" />
                <circle className="ml-k-mk" cx="64" cy="112" r="9" />
                <text className="ml-k-mk-t" x="64" y="112" textAnchor="middle" dy=".34em">B2</text>
                <line className="ml-k-ext" x1="22" y1="257" x2="22" y2="282" />
                <line className="ml-k-ext" x1="327" y1="257" x2="327" y2="282" />
                <line className="ml-k-dim" x1="22" y1="274" x2="327" y2="274" />
                <line className="ml-k-tick" x1="17" y1="279" x2="27" y2="269" />
                <line className="ml-k-tick" x1="322" y1="279" x2="332" y2="269" />
                <rect className="ml-k-dim-bg" x="141" y="265" width="66" height="18" />
                <text className="ml-k-dim-t" x="174" y="274" textAnchor="middle" dy=".36em">15′-4″</text>
                <line className="ml-k-ext" x1="331" y1="26" x2="356" y2="26" />
                <line className="ml-k-ext" x1="331" y1="253" x2="356" y2="253" />
                <line className="ml-k-dim" x1="348" y1="26" x2="348" y2="253" />
                <line className="ml-k-tick" x1="343" y1="31" x2="353" y2="21" />
                <line className="ml-k-tick" x1="343" y1="258" x2="353" y2="248" />
                <rect className="ml-k-dim-bg" x="332" y="108" width="32" height="62" />
                <text className="ml-k-dim-t" x="348" y="139" textAnchor="middle" dy=".36em" transform="rotate(-90 348 139)">11′-2″</text>
              </svg>
            </div>

            {/* The title block, rebuilt as HTML at legible sizes. Every string
                is the desktop sheet's SVG <text>, verbatim. */}
            <div className="ml-tb">
              <div className="ml-tb-h">
                <span>FLOOR PLAN · A-101</span>
                <span className="ml-tb-n">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M12 4.6 L15.6 13 L12 10.9 L8.4 13 Z" />
                    <path d="M12 13 V19" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                  N
                </span>
              </div>
              <div className="ml-tb-row"><span className="ml-tb-l">PROJECT</span><span className="ml-tb-v">KITCHEN REMODEL</span></div>
              <div className="ml-tb-row"><span className="ml-tb-l">CLIENT</span><span className="ml-tb-v">R. ALVAREZ</span></div>
              <div className="ml-tb-row"><span className="ml-tb-l">SCALE</span><span className="ml-tb-v">1/4″ = 1′-0″</span></div>
              <div className="ml-tb-row"><span className="ml-tb-l">AREA</span><span className="ml-tb-v">171 SQ FT</span></div>
              <div className="ml-tb-key"><span className="ml-tb-mk">B1</span><span className="ml-tb-v">SINK · PLUMBING ROUGH-IN</span></div>
              <div className="ml-tb-key"><span className="ml-tb-mk">B2</span><span className="ml-tb-v">RANGE · GAS + 240V</span></div>
              <div className="ml-tb-rev">REV 02 · 08/03</div>
            </div>

            <div className="ml-fh-lines">
              <div className="ml-fh-line-label"><span>Line items</span><span>USD</span></div>
              <div className="ml-fh-line ml-fh-l1">
                <span className="ml-fh-line-num">01</span>
                <span className="ml-fh-line-name">Cabinets · shaker white</span>
                <span className="ml-fh-line-price">$4,100</span>
              </div>
              <div className="ml-fh-line ml-fh-l2">
                <span className="ml-fh-line-num">02</span>
                <span className="ml-fh-line-name">Quartz countertop · 42 sqft</span>
                <span className="ml-fh-line-price">$2,800</span>
              </div>
              <div className="ml-fh-line ml-fh-l3">
                <span className="ml-fh-line-num">03</span>
                <span className="ml-fh-line-name">Electrical + plumbing</span>
                <span className="ml-fh-line-price">$2,010</span>
              </div>
              <div className="ml-fh-line ml-fh-l4">
                <span className="ml-fh-line-num">..</span>
                <span className="ml-fh-line-name">+ 20 more items (labor, demo, tile)</span>
                <span className="ml-fh-line-price">$5,940</span>
              </div>
            </div>

            <div className="ml-fh-total">
              <span className="ml-fh-total-lbl">Total estimate</span>
              <span className="ml-fh-total-val">$14,850</span>
            </div>

            <div className="ml-fh-foot">
              <div className="ml-fh-foot-l">
                <span className="ml-fh-check">✓</span>
                <span>Ready to send</span>
              </div>
              <div className="ml-fh-stamp">Approved</div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ MARQUEE ══════════════════════════════════════════════════════ */}
      <div className="ml-mq" aria-hidden="true">
        <div className="ml-mq-track">
          <div className="ml-mq-in">
            <span>Quote</span><span className="ml-mq-dot" />
            <span>Schedule</span><span className="ml-mq-dot" />
            <span>Get paid</span><span className="ml-mq-dot" />
            <span>An operating system for contractors</span><span className="ml-mq-dot" />
            <span>No card required</span><span className="ml-mq-dot" />
            <span>Set up in 10 minutes</span><span className="ml-mq-dot" />
          </div>
          <div className="ml-mq-in">
            <span>Quote</span><span className="ml-mq-dot" />
            <span>Schedule</span><span className="ml-mq-dot" />
            <span>Get paid</span><span className="ml-mq-dot" />
            <span>An operating system for contractors</span><span className="ml-mq-dot" />
            <span>No card required</span><span className="ml-mq-dot" />
            <span>Set up in 10 minutes</span><span className="ml-mq-dot" />
          </div>
        </div>
      </div>

      {/* ══ FEATURES ═════════════════════════════════════════════════════ */}
      <section className="ml-feat" id="jfml-features">
        <div className="ml-wrap">
          <div className="ml-feat-head ml-rv">
            <div className="ml-kicker ml-kicker-sky">What&apos;s inside</div>
            <h2 className="ml-h2">One workspace.<br /><em>Every job.</em></h2>
          </div>
          <div className="ml-grid">
            <article className="ml-f ml-rv">
              <div className="ml-f-ic"><svg className="ml-ic" aria-hidden="true"><use href="#jfml-i-bulb" /></svg></div>
              <div>
                <div className="ml-f-n">01</div>
                <h3 className="ml-f-t">Smart proposals</h3>
                <p className="ml-f-b">Describe the job in plain English. Line items, measurements, scope, timeline — drafted in seconds.</p>
              </div>
            </article>
            <article className="ml-f ml-rv">
              <div className="ml-f-ic"><svg className="ml-ic" aria-hidden="true"><use href="#jfml-i-users" /></svg></div>
              <div>
                <div className="ml-f-n">02</div>
                <h3 className="ml-f-t">Client CRM</h3>
                <p className="ml-f-b">A real client profile. Timeline, proposals, payments, notes — all one click from every job.</p>
              </div>
            </article>
            <article className="ml-f ml-rv">
              <div className="ml-f-ic"><svg className="ml-ic" aria-hidden="true"><use href="#jfml-i-file" /></svg></div>
              <div>
                <div className="ml-f-n">03</div>
                <h3 className="ml-f-t">Polished portal</h3>
                <p className="ml-f-b">Clients view, sign, and pay on a full-bleed page that looks like a gallery, not a form.</p>
              </div>
            </article>
            <article className="ml-f ml-rv">
              <div className="ml-f-ic"><svg className="ml-ic" aria-hidden="true"><use href="#jfml-i-cal" /></svg></div>
              <div>
                <div className="ml-f-n">04</div>
                <h3 className="ml-f-t">Scheduling</h3>
                <p className="ml-f-b">Assign installers, confirm availability, post before/after photos. No spreadsheet tab required.</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ══ EDGE ═════════════════════════════════════════════════════════ */}
      <section className="ml-edge" id="jfml-edge">
        <div className="ml-wrap">
          <div className="ml-kicker ml-rv">The operator&apos;s edge</div>
          <div className="ml-edge-box ml-rv">
            <div className="ml-edge-l">
              <p className="ml-edge-q">
                Your tools should feel like a well-kept shop —{" "}
                <em>calm, precise, ready for the next job.</em>
              </p>
            </div>
            <div className="ml-edge-r">
              <div className="ml-stat"><b>43</b><span>States covered</span></div>
              <div className="ml-stat"><b>2,100</b><span>Crews on JobFlex</span></div>
              <div className="ml-stat"><b>47 sec</b><span>Average proposal</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ FOOTER ═══════════════════════════════════════════════════════ */}
      <footer className="ml-ft">
        <div className="ml-wrap">
          <div className="ml-ft-cta">
            <h2 className="ml-ft-h">Quote the next job<br /><em>before lunch.</em></h2>
            {/* footer "Start free trial" -> /auth/register */}
            <Link className="ml-btn ml-btn-a ml-btn-on-ink" href="/auth/register">
              Start free trial
              <svg className="ml-ic" aria-hidden="true"><use href="#jfml-i-arrow-r" /></svg>
            </Link>
          </div>
          <div className="ml-ft-bar">
            <span>© 2026 JobFlex</span>
            <div className="ml-ft-links">
              {/* footer "Privacy" -> /privacy · "Terms" -> /terms · "Login" -> /auth/login */}
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/auth/login">Login</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
