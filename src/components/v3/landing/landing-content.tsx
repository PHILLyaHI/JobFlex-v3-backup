"use client";

/* JobFlex landing — PORT of `jobflex-landing (21).html` (design of record).
 *
 * Markup is the donor's, element for element, class for class, string for
 * string. Class names stay LITERAL (`className="nav"`, never
 * `className={styles.nav}`) because landing.css is a plain scoped stylesheet,
 * not a CSS module — see the header of landing.css for why hashing would break
 * this page. `<div className="jf-landing">` is the single scope root every
 * ported rule hangs off.
 *
 * `nav.nav` is KEPT. The app-shell chrome rule does not apply here: this is a
 * public marketing route that never mounts blueprint-shell, so there is no
 * sidebar or topbar to inherit — stripping the nav would leave a headless page.
 *
 * HREFS ARE THE ONE CONTENT DEVIATION. Every href in the donor is a dead
 * same-page anchor (#top / #features / #edge) — the mockup had no app to link
 * into. Eleven of the twelve are now pointed at the real routes they name (the
 * mapping table below); nothing else about those anchors changes, so the
 * rendered DOM is the donor's element with a different href value. They use
 * next/link — which renders the same <a class=… href=…> — so an in-app CTA is
 * a client-side navigation, matching forgot-content.tsx / dashboard-content.tsx.
 *
 *   nav "Pricing"               #features -> /pricing
 *   nav "About"                 #edge     -> /about
 *   nav "For homeowners"        #features -> /homeowner
 *   nav "Sign in"               #top      -> /auth/login
 *   nav "Start free"            #top      -> /auth/register
 *   hero "Start free trial"     #top      -> /auth/register
 *   hero "Or request an estimate" #top    -> /homeowner
 *   footer "Start free trial"   #top      -> /auth/register
 *   footer "Privacy"            #top      -> /privacy
 *   footer "Terms"              #top      -> /terms
 *   footer "Login"              #top      -> /auth/login
 *
 * The brand mark keeps href="#top": on the landing page itself that is a
 * scroll to the hero, which is what the donor meant and what it should do.
 * `id="top"`, `id="features"` and `id="edge"` stay on their sections — they are
 * donor markup, and #top is still a live target.
 *
 * The mobile burger is the one behavioral rewrite. The donor toggled seven
 * inline styles on `.nav-links`; that is React state now plus the
 * `.nav-links.open` rule at the bottom of landing.css, which carries the same
 * seven declarations. Everything else lives in use-landing-behavior.ts.
 *
 * Figures are static copy, exactly as authored — no data layer touches this
 * page.
 */

import { useRef, useState } from "react";
import Link from "next/link";
import "./landing.css";
import { LandingSprite } from "./landing-sprite";
import { useLandingBehavior } from "./use-landing-behavior";

export function LandingContent() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useLandingBehavior(rootRef);

  return (
    <div className="jf-landing" ref={rootRef}>
      <LandingSprite />

      <nav className="nav">
        <a className="nav-brand" href="#top">
          {/* The donor inlined this mark twice as the same 18,105-byte base64
              PNG. Extracted once to /jobflex-mark-384.png. The pre-existing
              public/jobflex-mark.png is the 2048x2048 / 552KB master and is
              deliberately NOT reused — same artwork (verified: identical after
              downscale), 30x the bytes for a 60px mark. Plain <img> with the
              intrinsic size, not next/image: the wrapper element and sizing
              behaviour would change the layout, and .sb-mark-box crops this
              image by absolute offset. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span className="sb-mark-box"><img className="sb-mark-img" alt="" src="/jobflex-mark-384.png" width={384} height={384} /></span>
          <span className="sb-head-txt"><span className="sb-head-name">JOBFLEX</span><span className="sb-head-sub">Contractor OS</span></span>
        </a>
        <div className={menuOpen ? "nav-links open" : "nav-links"}>
          <Link href="/pricing">Pricing</Link>
          <Link href="/about">About</Link>
          <Link href="/homeowner">For homeowners</Link>
        </div>
        <Link className="nav-sign" href="/auth/login">Sign in</Link>
        <Link className="nav-cta" href="/auth/register">Start free<svg className="ic"><use href="#i-arrow-r" /></svg></Link>
        <button className="burger" type="button" aria-label="Menu" onClick={() => setMenuOpen((v) => !v)}><svg className="ic"><use href="#i-menu" /></svg></button>
        <div className="sprog" aria-hidden="true" />
      </nav>

      <section className="hero" id="top">
        <div className="hero-l">
          <div className="hero-in">
            <div className="kicker an a1">An operating system for contractors</div>
            <h1 className="h1">
              <span className="an a2" style={{ display: "block" }}>Quote.</span>
              <span className="an a3" style={{ display: "block" }}>Schedule.</span>
              <span className="an a4" style={{ display: "block" }}><span className="inv">Get paid.</span></span>
            </h1>
            <p className="tagline an a5">CRM, smart estimating, proposals, scheduling, and payments —
              one workspace for <strong>contractors who ship</strong>.</p>
            <div className="cta-row an a5">
              <Link className="cta-a" href="/auth/register"><svg className="ic"><use href="#i-bulb" /></svg>Start free trial</Link>
              <Link className="cta-b" href="/homeowner">Or request an estimate<svg className="ic"><use href="#i-arrow" /></svg></Link>
            </div>
            <div className="hero-note an a5">No card required · Set up in 10 minutes</div>
          </div>
        </div>

        <div className="hero-r">
          <div className="hero-r-inner an a4">
            <div className="fh-card-label"><span className="fh-card-label-line" />Live estimate<span className="fh-card-label-dot" /></div>
            <div className="fh-card">
              <div className="fh-card-head">
                <div className="fh-card-head-l">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <div className="fh-card-head-logo"><span className="mini-mark"><img className="mini-mark-img" alt="" src="/jobflex-mark-384.png" width={384} height={384} /></span></div>
                  <span>Kitchen Remodel · <em>Kirkland WA</em></span>
                </div>
                <span className="fh-card-head-r"><span className="fh-card-dot" /><b className="fh-sec">47s</b></span>
              </div>

              <div className="fh-schematic-wrap">
                <svg className="k-svg" viewBox="0 0 640 300" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <defs>
                    <pattern id="khatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                      <line x1="0" y1="0" x2="0" y2="7" stroke="rgba(242,240,235,.30)" strokeWidth=".8"/>
                    </pattern>
                  </defs>
                  <path className="k-poche" fillRule="evenodd" d="M22 26H327V253H22Z M31 35H318V244H31Z"/>
                  <rect className="k-cut" x="144" y="26" width="75" height="9"/>
                  <rect className="k-cut" x="22" y="175" width="9" height="50"/>
                  <rect className="k-cut" x="181" y="244" width="112" height="9"/>
                  <path className="k-wall" d="M144 26H22V175 M22 225V253H181 M293 253H327V26H219"/>
                  <path className="k-wall" d="M144 35H31V175 M31 225V244H181 M293 244H318V35H219"/>
                  <line className="k-glass" x1="144" y1="28.8" x2="219" y2="28.8"/>
                  <line className="k-glass" x1="144" y1="32.2" x2="219" y2="32.2"/>
                  <line className="k-jamb" x1="144" y1="26" x2="144" y2="35"/>
                  <line className="k-jamb" x1="219" y1="26" x2="219" y2="35"/>
                  <line className="k-jamb" x1="22" y1="175" x2="31" y2="175"/>
                  <line className="k-jamb" x1="22" y1="225" x2="31" y2="225"/>
                  <line className="k-leaf" x1="31" y1="175" x2="81" y2="175"/>
                  <path className="k-swing" d="M81 175 A50 50 0 0 1 31 225"/>
                  <line className="k-jamb" x1="181" y1="244" x2="181" y2="253"/>
                  <line className="k-jamb" x1="293" y1="244" x2="293" y2="253"/>
                  <rect className="k-cab" x="31" y="35" width="231" height="37"/>
                  <line className="k-hair" x1="78" y1="35" x2="78" y2="72"/>
                  <line className="k-hair" x1="125" y1="35" x2="125" y2="72"/>
                  <line className="k-hair" x1="156" y1="35" x2="156" y2="72"/>
                  <line className="k-hair" x1="207" y1="35" x2="207" y2="72"/>
                  <line className="k-hair" x1="244" y1="35" x2="244" y2="72"/>
                  <rect className="k-app" x="78" y="37" width="47" height="33"/>
                  <circle className="k-hair" cx="90" cy="46" r="4.2"/>
                  <circle className="k-hair" cx="90" cy="61" r="4.2"/>
                  <circle className="k-hair" cx="113" cy="46" r="4.2"/>
                  <circle className="k-hair" cx="113" cy="61" r="4.2"/>
                  <rect className="k-app" x="156" y="37" width="51" height="33"/>
                  <rect className="k-hair" x="161" y="43" width="18" height="21" rx="2.5"/>
                  <rect className="k-hair" x="183" y="43" width="18" height="21" rx="2.5"/>
                  <circle className="k-hair" cx="182" cy="40.5" r="2.4"/>
                  <line className="k-hair" x1="210" y1="69" x2="241" y2="38"/>
                  <text className="k-lab" x="225.5" y="53.5" textAnchor="middle" dy=".34em">DW</text>
                  <rect className="k-app" x="262" y="35" width="56" height="47"/>
                  <line className="k-hair" x1="290" y1="35" x2="290" y2="82"/>
                  <line className="k-hair" x1="284" y1="74" x2="284" y2="62"/>
                  <line className="k-hair" x1="296" y1="74" x2="296" y2="62"/>
                  <text className="k-lab" x="290.0" y="91" textAnchor="middle">REF</text>
                  <rect className="k-isl" x="123" y="138" width="103" height="56"/>
                  <rect className="k-hair" x="129" y="144" width="91" height="44"/>
                  <text className="k-room-t" x="174.5" y="166.0" textAnchor="middle" dy=".34em">ISLAND</text>
                  <path className="k-lead" d="M226 105 L188 76"/>
                  <circle className="k-mk" cx="234" cy="110" r="9"/>
                  <text className="k-mk-t" x="234" y="110" textAnchor="middle" dy=".34em">B1</text>
                  <path className="k-lead" d="M70 106 L88 75"/>
                  <circle className="k-mk" cx="64" cy="112" r="9"/>
                  <text className="k-mk-t" x="64" y="112" textAnchor="middle" dy=".34em">B2</text>
                  <line className="k-ext" x1="22" y1="257" x2="22" y2="282"/>
                  <line className="k-ext" x1="327" y1="257" x2="327" y2="282"/>
                  <line className="k-dim" x1="22" y1="274" x2="327" y2="274"/>
                  <line className="k-tick" x1="17" y1="279" x2="27" y2="269"/>
                  <line className="k-tick" x1="322" y1="279" x2="332" y2="269"/>
                  <rect className="k-dim-bg" x="141" y="265" width="66" height="18"/>
                  <text className="k-dim-t" x="174" y="274" textAnchor="middle" dy=".36em">15′-4″</text>
                  <line className="k-ext" x1="331" y1="26" x2="356" y2="26"/>
                  <line className="k-ext" x1="331" y1="253" x2="356" y2="253"/>
                  <line className="k-dim" x1="348" y1="26" x2="348" y2="253"/>
                  <line className="k-tick" x1="343" y1="31" x2="353" y2="21"/>
                  <line className="k-tick" x1="343" y1="258" x2="353" y2="248"/>
                  <rect className="k-dim-bg" x="332" y="108" width="32" height="62"/>
                  <text className="k-dim-t" x="348" y="139" textAnchor="middle" dy=".36em" transform="rotate(-90 348 139)">11′-2″</text>
                  <rect className="k-tb" x="384" y="26" width="234" height="227"/>
                  <text className="k-tb-h" x="398" y="50">FLOOR PLAN · A-101</text>
                  <line className="k-hair" x1="384" y1="64" x2="618" y2="64"/>
                  <text className="k-tb-l" x="398" y="86">PROJECT</text>
                  <text className="k-tb-v" x="604" y="86" textAnchor="end">KITCHEN REMODEL</text>
                  <text className="k-tb-l" x="398" y="108">CLIENT</text>
                  <text className="k-tb-v" x="604" y="108" textAnchor="end">R. ALVAREZ</text>
                  <text className="k-tb-l" x="398" y="130">SCALE</text>
                  <text className="k-tb-v" x="604" y="130" textAnchor="end">1/4″ = 1′-0″</text>
                  <text className="k-tb-l" x="398" y="152">AREA</text>
                  <text className="k-tb-v" x="604" y="152" textAnchor="end">171 SQ FT</text>
                  <line className="k-hair" x1="384" y1="166" x2="618" y2="166"/>
                  <circle className="k-mk" cx="406" cy="190" r="8"/>
                  <text className="k-mk-t" x="406" y="190" textAnchor="middle" dy=".34em">B1</text>
                  <text className="k-tb-v" x="424" y="193.5">SINK · PLUMBING ROUGH-IN</text>
                  <circle className="k-mk" cx="406" cy="216" r="8"/>
                  <text className="k-mk-t" x="406" y="216" textAnchor="middle" dy=".34em">B2</text>
                  <text className="k-tb-v" x="424" y="219.5">RANGE · GAS + 240V</text>
                  <text className="k-tb-l" x="398" y="243">REV 02 · 08/03</text>
                  <circle className="k-tb" cx="590" cy="230" r="11"/>
                  <line className="k-dim" x1="590" y1="237" x2="590" y2="227"/>
                  <path className="k-north" d="M586 228 L590 222 L594 228 Z"/>
                  <text className="k-tb-l" x="573" y="234" textAnchor="end">N</text>
                </svg>
              </div>

              <div className="fh-card-lines">
                <div className="fh-line-label"><span>Line items</span><span>USD</span></div>
                <div className="fh-line fh-l1">
                  <span className="fh-line-num">01</span>
                  <span className="fh-line-name">Cabinets · shaker white</span>
                  <span className="fh-line-price">$4,100</span>
                </div>
                <div className="fh-line fh-l2">
                  <span className="fh-line-num">02</span>
                  <span className="fh-line-name">Quartz countertop · 42 sqft</span>
                  <span className="fh-line-price">$2,800</span>
                </div>
                <div className="fh-line fh-l3">
                  <span className="fh-line-num">03</span>
                  <span className="fh-line-name">Electrical + plumbing</span>
                  <span className="fh-line-price">$2,010</span>
                </div>
                <div className="fh-line fh-l4">
                  <span className="fh-line-num">..</span>
                  <span className="fh-line-name">+ 20 more items (labor, demo, tile)</span>
                  <span className="fh-line-price">$5,940</span>
                </div>
              </div>

              <div className="fh-total">
                <span className="fh-total-lbl">Total estimate</span>
                <span className="fh-total-val">$14,850</span>
              </div>

              <div className="fh-card-footer">
                <div className="fh-footer-left">
                  <span className="fh-footer-check">✓</span>
                  <span>Ready to send</span>
                </div>
                <div className="fh-footer-stamp">Approved</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mq" aria-hidden="true"><div className="mq-track"><div className="mq-in"><span>Quote</span><span className="mq-dot" /><span>Schedule</span><span className="mq-dot" /><span>Get paid</span><span className="mq-dot" /><span>An operating system for contractors</span><span className="mq-dot" /><span>No card required</span><span className="mq-dot" /><span>Set up in 10 minutes</span><span className="mq-dot" /></div><div className="mq-in"><span>Quote</span><span className="mq-dot" /><span>Schedule</span><span className="mq-dot" /><span>Get paid</span><span className="mq-dot" /><span>An operating system for contractors</span><span className="mq-dot" /><span>No card required</span><span className="mq-dot" /><span>Set up in 10 minutes</span><span className="mq-dot" /></div></div></div>

      <section className="feat" id="features">
        <div className="wrap">
          <div className="feat-head rv">
            <div className="kicker kicker-sky">What&apos;s inside</div>
            <h2 className="h2">One workspace.<br /><em>Every job.</em></h2>
          </div>
          <div className="grid4 rv"><article className="f"><div className="f-n">01</div><div className="f-ic"><svg className="ic"><use href="#i-bulb" /></svg></div><h3 className="f-t">Smart proposals</h3><p className="f-b">Describe the job in plain English. Line items, measurements, scope, timeline — drafted in seconds.</p></article><article className="f"><div className="f-n">02</div><div className="f-ic"><svg className="ic"><use href="#i-users" /></svg></div><h3 className="f-t">Client CRM</h3><p className="f-b">A real client profile. Timeline, proposals, payments, notes — all one click from every job.</p></article><article className="f"><div className="f-n">03</div><div className="f-ic"><svg className="ic"><use href="#i-file" /></svg></div><h3 className="f-t">Polished portal</h3><p className="f-b">Clients view, sign, and pay on a full-bleed page that looks like a gallery, not a form.</p></article><article className="f"><div className="f-n">04</div><div className="f-ic"><svg className="ic"><use href="#i-cal" /></svg></div><h3 className="f-t">Scheduling</h3><p className="f-b">Assign installers, confirm availability, post before/after photos. No spreadsheet tab required.</p></article></div>
        </div>
      </section>

      <section className="edge" id="edge">
        <div className="wrap">
          <div className="kicker rv">The operator&apos;s edge</div>
          <div className="edge-box rv">
            <div className="edge-l">
              <p className="edge-q">Your tools should feel like a well-kept shop —{" "}
                <em>calm, precise, ready for the next job.</em></p>
            </div>
            <div className="edge-r">
              <div className="stat"><b>43</b><span>States covered</span></div>
              <div className="stat"><b>2,100</b><span>Crews on JobFlex</span></div>
              <div className="stat"><b>47 sec</b><span>Average proposal</span></div>
            </div>
          </div>
        </div>
      </section>

      <footer className="ft">
        <div className="wrap">
          <div className="ft-cta">
            <h2 className="ft-h">Quote the next job<br /><em>before lunch.</em></h2>
            <Link className="ft-btn" href="/auth/register">Start free trial<svg className="ic"><use href="#i-arrow-r" /></svg></Link>
          </div>
          <div className="ft-bar">
            <span>© 2026 JobFlex</span>
            <div className="ft-links"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/auth/login">Login</Link></div>
          </div>
        </div>
      </footer>
    </div>
  );
}
