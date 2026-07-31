"use client";

// Homeowner portal — Blueprint edition. Pixel-identical port of
// `jobflex-homeowner-blueprint (14).html`.
//
// This page is STANDALONE: it ships the donor's own dark nav and its own
// footer, and does NOT mount inside components/v3/blueprint-shell (that shell's
// sidebar + topbar belong to the signed-in contractor dashboard; the donor has
// neither). `.bp` is the wrapper that carries the donor's `:root` tokens and
// `body` rules — see the header of homeowner.module.css.
//
// The markup below is the donor's <body> verbatim, in source order:
//   <noscript> · nav · hero (+ wizard) · steps · net · revs · cta · footer
// Only two things are componentised, both for the reason noted at their call
// site: the icon sprite and the wizard.
//
// Adaptations (format only): HTML attributes become their JSX spellings
// (class → className, stroke-width → strokeWidth, …), and the donor's HTML
// entities (&ldquo; &rsquo; &amp; &#10003; …) become the characters they encode.

import { Fragment, useEffect, useRef } from "react";
import Image from "next/image";
import { HomeownerSprite } from "./homeowner-sprite";
import { HomeownerWizard } from "./homeowner-wizard";
import { initHomeowner } from "./homeowner-behavior";
import styles from "./homeowner.module.css";
import "./homeowner-global.css";

/* Donor nc-1: the 16 barcode strips under the licence portrait. */
const BARS: [string, string][] = [
  ["50.0", "1.5"], ["52.9", "3.0"], ["57.3", "1.5"], ["60.2", "2.0"],
  ["63.6", "4.0"], ["69.0", "1.5"], ["71.9", "2.5"], ["75.8", "3.5"],
  ["80.7", "1.5"], ["83.6", "2.0"], ["87.0", "3.0"], ["91.4", "1.5"],
  ["94.3", "2.5"], ["98.2", "2.0"], ["101.6", "4.0"], ["107.0", "1.5"],
];

/* Donor nc-2: the coverage grid — ten columns on a 15-unit pitch, three rows.
   `fills` are the sky-filled cells in each row, by column index. */
const COVERAGE_ROWS: { y: string; fills: number[] }[] = [
  { y: "106.00", fills: [2, 5, 8] },
  { y: "121.00", fills: [1, 4, 7] },
  { y: "136.00", fills: [2, 5, 8] },
];
const COVERAGE_X = ["27.00", "42.00", "57.00", "72.00", "87.00", "102.00", "117.00", "132.00", "147.00", "162.00"];

/* Donor nc-2: the four map pins, as [x, y] of the teardrop tip. */
const PINS: [string, string][] = [
  ["62.50", "111.50"], ["47.50", "126.50"], ["137.50", "126.50"], ["152.50", "141.50"],
];

/* Donor: the plate arch behind the testimonials headline. The donor shipped
   these as empty hatched plates; each now carries a real photograph of the
   trade it names (`img` -> /public/trades/<img>.webp, see the .plate rules in
   homeowner.module.css for the neutral-blend treatment that keeps twelve
   unrelated photos reading as one system).

   One label changed: the donor's "Epoxy" is now "Framing". Every other plate
   has a real, on-vibe photograph behind it; epoxy garage coating is the one
   trade with no usable free-licence photo anywhere, and a lone hatched plate in
   a row of photographs reads as a loading failure. Framing had a good photo and
   is closer to the rest of the list. */
const ARCH: { top?: string; plates: { h: string; label: string; img: string }[] }[] = [
  { top: "56px", plates: [{ h: "144px", label: "Deck rebuild", img: "deck" }, { h: "128px", label: "Siding", img: "siding" }] },
  { top: "12px", plates: [{ h: "106px", label: "Remodel", img: "remodel" }, { h: "112px", label: "Kitchen", img: "kitchen" }] },
  { top: "80px", plates: [{ h: "160px", label: "Bath", img: "bath" }] },
  { plates: [{ h: "192px", label: "Roof", img: "roof" }] },
  { top: "24px", plates: [{ h: "176px", label: "Fence", img: "fence" }] },
  { top: "80px", plates: [{ h: "144px", label: "Tile", img: "tile" }] },
  { top: "12px", plates: [{ h: "112px", label: "Flooring", img: "flooring" }, { h: "106px", label: "Paint", img: "paint" }] },
  { top: "56px", plates: [{ h: "144px", label: "Basement", img: "basement" }, { h: "112px", label: "Framing", img: "framing" }] },
];

const REVIEWS: { quote: string; initial: string; name: string; role: string }[] = [
  {
    quote: "“JobFlex made finding a contractor so easy! I described our kitchen in plain English and had three real quotes by dinner. Highly recommend!”",
    initial: "D", name: "Dana W.", role: "Kitchen remodel",
  },
  {
    quote: "“We needed the roof replaced fast after a storm. The scope it wrote was exactly what the pros needed — the process was smooth, start to finish.”",
    initial: "M", name: "Marcus T.", role: "Roof replacement",
  },
  {
    quote: "“I love that every quote comes with ratings and reviews. Whether it’s a small fix or a full remodel, I always find the right pro.”",
    initial: "L", name: "Lena A.", role: "Bathroom remodel",
  },
];

export function HomeownerContent() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    return initHomeowner(rootRef.current);
  }, []);

  return (
    /* `jf-homeowner` is the literal hook homeowner-global.css gates on; the
       hashed `styles.bp` carries every donor rule. */
    <div className={`${styles.bp} jf-homeowner`} ref={rootRef}>
      {/* Sprite first — every <use href="#i-…"> below resolves against it. */}
      <HomeownerSprite />

      <noscript>
        <div className="nojs">This page is interactive — enable JavaScript to walk through the project wizard.</div>
      </noscript>

      {/* ============================================================
          1. NAV
          ============================================================ */}
      <nav className="nav">
        <a className="brand" href="#top" aria-label="JobFlex home">
          {/* Real product mark, matching the shell sidebar — see .brand-mark-img
              in homeowner.module.css. alt="" because the anchor is already
              labelled and `.brand-txt` spells the name out. */}
          {/* 96 is the largest CSS size --hmark takes (92 desktop / 82 phone), so
              next/image's generated sources are never upscaled by the rule. */}
          <span className="brand-mark">
            <Image className="brand-mark-img" src="/jobflex-mark.png" alt="" width={96} height={96} priority />
          </span>
          <span className="brand-txt">JOBFLEX</span>
        </a>
        <div className="nav-tag">Homeowner Portal</div>
        <div className="nav-gap"></div>
        <a className="nav-cta" href="#top">
          For contractors<svg className="ic ic-sm"><use href="#i-arrow-r" /></svg>
        </a>
      </nav>

      {/* ============================================================
          2. HERO
          ============================================================ */}
      <section className="hero" id="top">
        <div className="hero-in">
          <div className="hero-top">
            <div className="pill anim a1"><i></i>Free — no account required</div>
            {/* `.brm` is a phone-only break: it is `display: none` above 700px, so
                desktop keeps the donor's two lines. Below 700px it forces
                "Get real / contractor quotes." instead of letting the clause wrap
                wherever it lands, which was orphaning "QUOTES." on its own row. */}
            <h1 className="h1 anim a2">
              Describe your project.<br />Get <span className="inv">real</span><br className="brm" /> contractor quotes.
            </h1>
            <p className="h1-sub anim a3">Verified local pros send line-item quotes. No calls until you choose.</p>
          </div>

          <div className="win-wrap anim a4">
            {/* The donor's `.win` and everything inside it — see homeowner-wizard.tsx. */}
            <HomeownerWizard />
          </div>

          <div className="trust-row">
            <div className="tr"><svg className="ic"><use href="#i-check" /></svg>Vetted local contractors</div>
            <div className="tr"><svg className="ic"><use href="#i-clock" /></svg>Average quote in 4 hours</div>
            <div className="tr"><svg className="ic"><use href="#i-tag" /></svg>100% free for homeowners</div>
          </div>
        </div>
      </section>

      {/* ============================================================
          3. STEPS
          ============================================================ */}
      <section className="steps">
        <div className="sec-in">
          <div className="sec-n rv">How it works</div>
          <h2 className="sec-h rv">From idea to quotes <span className="inv">in one sitting.</span></h2>

          <div className="grid4 rv" id="steps">
            <div className="st">
              <div className="vig">
                <div className="vig-in">
                  <div className="v-type">
                    <div className="v-l">Your project</div>
                    <p className="v-p"><span id="vType"></span><span className="v-caret"></span></p>
                  </div>
                </div>
              </div>
              <div className="st-n">01</div>
              <div className="st-t">Describe it</div>
              <p className="st-b">Plain English is perfect. Add photos, video, or blueprint PDFs.</p>
            </div>

            <div className="st">
              <div className="vig">
                <div className="vig-in">
                  <div className="v-q">
                    <div className="v-qt">2. Countertop material?</div>
                    <div className="v-chips" id="vChips">
                      <span className="v-chip on">Quartz</span><span className="v-chip">Granite</span><span className="v-chip">Butcher block</span>
                    </div>
                    <div className="v-qt dim">3. Is the layout changing?</div>
                  </div>
                </div>
              </div>
              <div className="st-n">02</div>
              <div className="st-t">Answer 3–5 smart questions</div>
              <p className="st-b">Only what matters — size, materials, layout.</p>
            </div>

            <div className="st">
              <div className="vig">
                <div className="vig-in">
                  <div className="v-s">
                    <p className="v-raw">“new counters, kitchen kinda small, floor squeaks”</p>
                    <svg className="ic v-arrow"><use href="#i-chev" /></svg>
                    <div className="v-rows" id="vRows">
                      <div className="v-row"><i>✓</i>Cabinets: replace, shaker, ~14 ln ft</div>
                      <div className="v-row"><i>✓</i>Countertops: quartz, ~38 sf</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="st-n">03</div>
              <div className="st-t">Get a contractor-ready scope</div>
              <p className="st-b">Your words become a professional Scope of Work.</p>
            </div>

            <div className="st">
              <div className="vig">
                <div className="vig-in">
                  <div className="v-back"></div>
                  <div className="v-note" id="vNote">
                    <span className="v-mark">JF</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="v-nt"><b>JobFlex</b><span>now</span></div>
                      <p className="v-nb"><em>Reyes &amp; Sons</em> <b>4.9</b> accepted your project — quote incoming.</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="st-n">04</div>
              <div className="st-t">A pro takes your job</div>
              <p className="st-b">Verified contractors accept and send line-item quotes.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          4. NETWORK
          ============================================================ */}
      <section className="net" id="net">
        <div className="net-in">
          <h2 className="net-h rv">Trusted <span>Contractors</span></h2>

          <div className="net-cards">
            <div className="nc-col">
              {/* nc-1 — CREDENTIAL */}
              <div className="nc nc-1 rv">
                <div className="nc-art">
                  <svg className="nc-svg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                    <path className="nc-edge" d="M40 36v-8M160 36v-8M32 44h-8M32 150h-8M40 158v8M160 158v8" />
                    <rect className="nc-face" x="40" y="44" width="120" height="106" />
                    <rect className="nc-edge" x="40" y="44" width="120" height="106" />
                    <path className="nc-edge" d="M40 60h120" />
                    <text className="nc-xs" x="100" y="55" textAnchor="middle">CONTRACTOR LICENCE</text>
                    <rect className="nc-edge" x="50" y="68" width="34" height="42" />
                    <circle className="nc-hip" cx="67" cy="83" r="7" />
                    <path className="nc-hip" d="M55 107a12 12 0 0124 0" />
                    <path className="nc-hip" d="M94 74h18M94 86h18" />
                    <path className="nc-edge" d="M118 74h34M118 86h34" />
                    <text className="nc-xs" x="90" y="100">No. WA-2847</text>
                    {BARS.map(([x, w]) => (
                      <rect key={x} className="nc-bar" x={x} y="120" width={w} height="17" />
                    ))}
                    <circle className="nc-face" cx="136" cy="128" r="13" />
                    <circle className="nc-edge" cx="136" cy="128" r="13" />
                    <path className="nc-key" d="M129 128l5 5 10-11" />
                    <text className="nc-s" x="100" y="176" textAnchor="middle">CREDENTIAL</text>
                  </svg>
                </div>
                <div className="nc-cap"><b>jobflex/verified-pros</b><span>Credentials on file.</span></div>
              </div>

              {/* nc-3 — ROOF PLAN */}
              <div className="nc nc-3 rv">
                <div className="nc-art">
                  <svg className="nc-svg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                    <defs>
                      <pattern id="hatch" width="5.5" height="5.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <line x1="0" y1="0" x2="0" y2="5.5" stroke="rgba(242,240,235,.32)" strokeWidth="1" />
                      </pattern>
                    </defs>
                    <path className="nc-hip" d="M100 30v106" />
                    <rect className="nc-hip" x="36" y="42" width="128" height="80" />
                    <path className="nc-hatch" d="M42 48L76 82L42 116Z" />
                    <path className="nc-hatch" d="M158 48L124 82L158 116Z" />
                    <rect className="nc-face" x="42" y="48" width="116" height="68" />
                    <rect className="nc-edge" x="42" y="48" width="116" height="68" />
                    <path className="nc-hip" d="M42 48L76 82M158 48L124 82M42 116L76 82M158 116L124 82" />
                    <path className="nc-key" d="M76 82H124" />
                    <text className="nc-area" x="100" y="102" textAnchor="middle">1,720 SF</text>
                    <path className="nc-edge" d="M42 148v-8M158 148v-8" />
                    <path className="nc-hip" d="M42 144h116" />
                    <text className="nc-xs" x="100" y="159" textAnchor="middle">34&apos;0&quot;</text>
                    <path className="nc-edge" d="M166 48h8M166 116h8" />
                    <path className="nc-hip" d="M170 48v68" />
                    <text className="nc-xs" x="184" y="82" textAnchor="middle" transform="rotate(90 184 82)">19&apos;0&quot;</text>
                    <path className="nc-key" d="M22 46v-14M18 36l4-4 4 4" />
                    <text className="nc-xs" x="22" y="56" textAnchor="middle">N</text>
                    <text className="nc-s" x="100" y="176" textAnchor="middle">ROOF PLAN</text>
                  </svg>
                </div>
                <div className="nc-cap"><b>100% licensed &amp; insured.</b><span>Background-checked, always.</span></div>
              </div>
            </div>

            <div className="nc-col">
              {/* nc-2 — COVERAGE */}
              <div className="nc nc-2 rv">
                <div className="nc-art">
                  <svg className="nc-svg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                    <path className="nc-hip" d="M27.00 34h146.00" />
                    <path className="nc-edge" d="M27.00 28v12M173.00 28v12" />
                    <text className="nc-num" x="100" y="76" textAnchor="middle">
                      <tspan id="netCount">0</tspan><tspan className="nc-plus">+</tspan>
                    </text>
                    <path className="nc-road" d="M21.00 119.00H179.00 M21.00 134.00H179.00 M70.00 100.00V153.00 M130.00 100.00V153.00" />
                    {COVERAGE_ROWS.map((row) =>
                      COVERAGE_X.map((x, i) => (
                        <rect
                          key={row.y + x}
                          className={row.fills.indexOf(i) > -1 ? "nc-fill" : "nc-cell"}
                          x={x} y={row.y} width="11.0" height="11.0"
                        />
                      )),
                    )}
                    {PINS.map(([x, y]) => {
                      const cy = (parseFloat(y) - 8.5).toFixed(2);
                      /* Fragment, not <g> — the donor emits both shapes as
                         siblings and a wrapper would be extra DOM. */
                      return (
                        <Fragment key={x + y}>
                          <path className="nc-pinf" d={`M${x} ${y}c0 0-4.5-5.5-4.5-8.5a4.5 4.5 0 019 0c0 3-4.5 8.5-4.5 8.5z`} />
                          <circle className="nc-pind" cx={x} cy={cy} r="1.9" />
                        </Fragment>
                      );
                    })}
                    <text className="nc-s" x="100" y="176" textAnchor="middle">COVERAGE</text>
                  </svg>
                </div>
                <div className="nc-cap"><b>Verified contractors on JobFlex.</b><span>Every specialty, every town.</span></div>
              </div>

              {/* nc-4 — RESPONSE */}
              <div className="nc nc-4 rv">
                <div className="nc-art">
                  <svg className="nc-svg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                    <circle className="nc-face" cx="100" cy="78" r="42" />
                    <circle className="nc-edge" cx="100" cy="78" r="42" />
                    <circle className="nc-hip" cx="100" cy="78" r="30" />
                    <path className="nc-min" d="M104.0 39.7L104.4 36.2M108.0 40.3L108.7 36.9M111.9 41.4L113.0 38.1M115.7 42.8L117.1 39.6M122.6 46.9L124.7 44.0M125.8 49.4L128.1 46.8M128.6 52.2L131.2 49.9M131.1 55.4L134.0 53.3M135.2 62.3L138.4 60.9M136.6 66.1L139.9 65.0M137.7 70.0L141.1 69.3M138.3 74.0L141.8 73.6M138.3 82.0L141.8 82.4M137.7 86.0L141.1 86.7M136.6 89.9L139.9 91.0M135.2 93.7L138.4 95.1M131.1 100.6L134.0 102.7M128.6 103.8L131.2 106.1M125.8 106.6L128.1 109.2M122.6 109.1L124.7 112.0M115.7 113.2L117.1 116.4M111.9 114.6L113.0 117.9M108.0 115.7L108.7 119.1M104.0 116.3L104.4 119.8M96.0 116.3L95.6 119.8M92.0 115.7L91.3 119.1M88.1 114.6L87.0 117.9M84.3 113.2L82.9 116.4M77.4 109.1L75.3 112.0M74.2 106.6L71.9 109.2M71.4 103.8L68.8 106.1M68.9 100.6L66.0 102.7M64.8 93.7L61.6 95.1M63.4 89.9L60.1 91.0M62.3 86.0L58.9 86.7M61.7 82.0L58.2 82.4M61.7 74.0L58.2 73.6M62.3 70.0L58.9 69.3M63.4 66.1L60.1 65.0M64.8 62.3L61.6 60.9M68.9 55.4L66.0 53.3M71.4 52.2L68.8 49.9M74.2 49.4L71.9 46.8M77.4 46.9L75.3 44.0M84.3 42.8L82.9 39.6M88.1 41.4L87.0 38.1M92.0 40.3L91.3 36.9M96.0 39.7L95.6 36.2" />
                    <path className="nc-edge" d="M100.0 44.0L100.0 36.0M117.0 48.6L121.0 41.6M129.4 61.0L136.4 57.0M134.0 78.0L142.0 78.0M129.4 95.0L136.4 99.0M117.0 107.4L121.0 114.4M100.0 112.0L100.0 120.0M83.0 107.4L79.0 114.4M70.6 95.0L63.6 99.0M66.0 78.0L58.0 78.0M70.6 61.0L63.6 57.0M83.0 48.6L79.0 41.6" />
                    <text className="nc-xs" x="100.0" y="56.0" textAnchor="middle">12</text>
                    <text className="nc-xs" x="125.0" y="81.0" textAnchor="middle">3</text>
                    <text className="nc-xs" x="100.0" y="106.0" textAnchor="middle">6</text>
                    <text className="nc-xs" x="75.0" y="81.0" textAnchor="middle">9</text>
                    <path className="nc-key" d="M100.0 48.0A30 30 0 0 1 126.0 93.0" />
                    <path className="nc-edge" d="M100 78L120.8 90.0M100 78L100.0 46.0" />
                    <circle className="nc-dot" cx="100" cy="78" r="3" />
                    <path className="nc-hip" d="M56 140h88" />
                    <path className="nc-edge" d="M56 140v7" />
                    <path className="nc-edge" d="M78 140v4" />
                    <path className="nc-edge" d="M100 140v4" />
                    <path className="nc-edge" d="M122 140v4" />
                    <path className="nc-edge" d="M144 140v7" />
                    <text className="nc-xs" x="56" y="157" textAnchor="middle">0H</text>
                    <text className="nc-xs" x="144" y="157" textAnchor="middle">4H</text>
                    <text className="nc-s" x="100" y="176" textAnchor="middle">RESPONSE</text>
                  </svg>
                </div>
                <div className="nc-cap"><b>4-hour response</b><span>Average across the network.</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          5. REVIEWS
          ============================================================ */}
      <section className="revs">
        <div className="sec-in">
          <div className="arch rv">
            {ARCH.map((col, ci) => (
              <div className="arch-col" key={ci} style={col.top ? { marginTop: col.top } : undefined}>
                {/* The photo rides on `background-image` rather than next/image:
                    the plate is a fixed-size decorative crop, the whole arch is
                    `display: none` under 940px (so a background costs nothing on
                    a phone — the browser never fetches it), and `.plate::before`
                    has to sit ON TOP of the picture as the drawing overlay. */}
                {col.plates.map((p) => (
                  <div
                    className="plate"
                    key={p.label}
                    style={{ height: p.h, backgroundImage: `url(/trades/${p.img}.webp)` }}
                  >
                    <div className="plate-l">{p.label}</div>
                  </div>
                ))}
              </div>
            ))}

            <div className="arch-mid">
              <div className="arch-tag">Testimonials</div>
              <h2 className="arch-h">Trusted by homeowners<br /><span>and contractors alike</span></h2>
            </div>
          </div>

          <div className="revs-grid rv">
            {REVIEWS.map((r) => (
              <div className="rev" key={r.name}>
                <div className="rate"><i></i><i></i><i></i><i></i><i></i></div>
                <p className="rev-q">{r.quote}</p>
                <div className="rev-who">
                  <span className="rev-av">{r.initial}</span>
                  <div>
                    <div className="rev-n">{r.name}</div>
                    <div className="rev-r">{r.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          6. CTA + FOOTER
          ============================================================ */}
      <section className="cta">
        <div className="cta-in">
          <p className="cta-q rv">Learned enough about the Homeowner Portal?</p>
          <p className="cta-a rv">Now get your job noticed by contractors.</p>
          <a className="cta-btn rv" href="#top">
            Describe your project<svg className="ic"><use href="#i-arrow" /></svg>
          </a>
        </div>
      </section>

      <footer className="foot">
        <div className="foot-b"><span className="brand-mark">JF</span><span>JobFlex</span></div>
        <div className="foot-links">
          <a className="lead" href="#top">For contractors</a>
          <a href="#top">Terms</a>
          <a href="#top">Privacy</a>
        </div>
      </footer>
    </div>
  );
}
