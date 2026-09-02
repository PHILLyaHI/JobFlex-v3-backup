"use client";

/**
 * JobFlex — LANDING C · "THE DRAWING SET"
 *
 * Concept. cal.com reads calm because it is a stack of white sheets floating
 * on a quiet field, opened the same way every time and separated by a huge
 * amount of nothing. Landing C takes that rhythm and inverts the materials:
 * the field is drafting PAPER and the sheets are white, framed in 2px ink —
 * white is the drawing area, paper is the table it lies on. The blueprint
 * identity is spent on exactly two devices (a hairline registration gutter
 * with drawn crosses at each bay joint, and a JetBrains Mono annotation layer)
 * plus one inverse band; everything else is white space, heavy Inter caps and
 * one blue.
 *
 * Class names are literal strings, not `styles.x`, because landing-c.css is a
 * plain scoped stylesheet and not a CSS Module — its header argues that in
 * full. Anything renamed here must be renamed there by hand.
 *
 * Static marketing surface: no Prisma, no server actions, no auth. Every
 * figure below is copy. The estimate in the hero is arithmetically consistent
 * (1,462 + 4,272 + 2,914 + 351 + 5,120 + 701 = 14,820) and labelled as an
 * illustrative document, because a marketing page that quietly fabricates a
 * total is a marketing page a contractor will catch.
 *
 * Nothing here is attributed to a named company. The trusted-by strip is the
 * six TRADES the product serves rather than borrowed logos, and the quotes
 * carry a visible ILLUSTRATIVE mark. Both are cal.com's shapes with honest
 * content in them.
 */

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import "./landing-c.css";
import { useLandingCReveal } from "./use-landing-c-reveal";
import {
  LC_GLYPHS,
  LcArrow,
  LcArtDescribe,
  LcArtFence,
  LcArtPrice,
  LcArtRoof,
  LcArtSend,
  LcArtVideo,
  LcBurger,
  LcGlyph,
  LcMark,
  LcPlanDrawing,
  LcPlay,
} from "./landing-c-sprite";

const NAV: { href: Route; label: string; n: string }[] = [
  { href: "#how", label: "How it works", n: "01" },
  { href: "#tools", label: "Estimators", n: "02" },
  { href: "#features", label: "Features", n: "03" },
  { href: "/pricing", label: "Pricing", n: "04" },
];

const TRADES = ["Roofing", "Fencing", "Decks", "Siding", "Kitchen & bath", "Remodel"];

const STEPS = [
  {
    n: "§ 01 — DESCRIBE",
    title: "Describe it the way you'd say it",
    body:
      "Type a sentence, or record a walkthrough on your phone. No templates to fill in, no assembly codes, no unit-cost database to keep current.",
    art: <LcArtDescribe />,
  },
  {
    n: "§ 02 — PRICE",
    title: "Get it back priced, line by line",
    body:
      "Quantities, labour and materials, itemised. Material lines carry live retail pricing — real products, at real stores, with the links attached.",
    art: <LcArtPrice />,
  },
  {
    n: "§ 03 — SEND",
    title: "Send it before you pull away",
    body:
      "The client opens it in their own portal, accepts and signs. You get the notification and the job lands on the calendar.",
    art: <LcArtSend />,
  },
];

const TOOLS = [
  {
    kicker: "ROOF ESTIMATOR",
    title: "Measure a roof from above",
    body:
      "Drop a pin on the address and pull facets, pitch and squares off aerial imagery. No ladder, no chalk line, no second trip out.",
    tags: ["Aerial", "Pitch", "Squares"],
    art: <LcArtRoof />,
  },
  {
    kicker: "FENCE ESTIMATOR",
    title: "Trace the fence on a map",
    body:
      "Load the real parcel boundary, drop the street side, and the run comes back in linear feet — with post counts and gates already in it.",
    tags: ["Parcel", "Linear feet", "Gates"],
    art: <LcArtFence />,
  },
  {
    kicker: "VIDEO ESTIMATOR",
    title: "Walk the job on video",
    body:
      "Record the walkthrough and talk through it the way you'd talk to a crew. JobFlex reads the footage and what you said out loud, and turns both into line items.",
    tags: ["Footage", "What you said", "Line items"],
    art: <LcArtVideo />,
  },
];

const BENEFITS = [
  {
    glyph: LC_GLYPHS.proposal,
    title: "Proposals & client portal",
    body:
      "Send something that holds up in a homeowner's kitchen. Clients read, accept and sign in a portal of their own — no PDF attachments going stale in an inbox.",
  },
  {
    glyph: LC_GLYPHS.pipeline,
    title: "Lead pipeline & CRM",
    body:
      "Every lead on one board, from first call to signed. Drag the card when the job moves; nothing quietly falls off the bottom of a notepad.",
  },
  {
    glyph: LC_GLYPHS.calendar,
    title: "Scheduling & dispatch",
    body:
      "One calendar for crews, jobs and appointments. Assign the work, see who is actually free, and send the address to the person doing it.",
  },
  {
    glyph: LC_GLYPHS.progress,
    title: "Jobs & progress",
    body:
      "Track a job from deposit through punch list. Everyone is looking at the same status, so nobody has to phone you to ask where it stands.",
  },
  {
    glyph: LC_GLYPHS.invoice,
    title: "Invoicing & payments",
    body:
      "Invoice straight off the accepted proposal. Card or bank transfer, with deposits and progress payments handled the way you already bill.",
  },
  {
    glyph: LC_GLYPHS.network,
    title: "Trade network",
    body:
      "More work than crew this month? Hand the overflow to another shop on the network, keep the client, and keep the relationship.",
  },
];

const QUOTES = [
  {
    initials: "RF",
    quote:
      "I used to price at the kitchen table at nine at night. Now the homeowner has the proposal before I'm off their street.",
    who: "Roofer",
    where: "4-person shop",
  },
  {
    initials: "FC",
    quote:
      "The fence tool pulls the actual property line. I stopped arguing with people about where the run ends.",
    who: "Fence contractor",
    where: "2-person shop",
  },
  {
    initials: "RM",
    quote:
      "I talk through the walkthrough on video like I'm talking to my foreman, and the line items are already sitting there.",
    who: "Remodeler",
    where: "7-person shop",
  },
];

const FACTS = [
  { n: "1–10", body: "The shop size this is built for. Not an enterprise rollout with a six-week onboarding." },
  { n: "6", body: "Estimators and tools in one workspace, covering first call through final payment." },
  { n: "14", body: "Days free, no card required. Nothing to uninstall if it turns out not to be for you." },
];

const FOOTER: { head: string; links: { href: Route; label: string }[] }[] = [
  {
    head: "Product",
    links: [
      { href: "#how", label: "Smart Proposal" },
      { href: "#tools", label: "Roof estimator" },
      { href: "#tools", label: "Fence estimator" },
      { href: "#tools", label: "Video estimator" },
      { href: "#features", label: "Client portal" },
    ],
  },
  {
    head: "Workflow",
    links: [
      { href: "#features", label: "Lead pipeline" },
      { href: "#features", label: "Scheduling" },
      { href: "#features", label: "Jobs & progress" },
      { href: "#features", label: "Invoicing" },
      { href: "#features", label: "Trade network" },
    ],
  },
  {
    head: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/pricing", label: "Pricing" },
      { href: "/homeowner", label: "For homeowners" },
      { href: "/auth/login", label: "Sign in" },
      { href: "/auth/register", label: "Create account" },
    ],
  },
  {
    head: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

const LEDGER: { h: string; s: string; n: string; live?: boolean; muted?: boolean }[] = [
  { h: "Deck framing", s: "PT 2×8 joists · 16\" o.c. · 34 pcs", n: "1,462.00" },
  { h: "Composite decking", s: "Grooved · 480 sf", n: "4,272.00", live: true },
  { h: "Aluminum railing", s: "Black · 62 lf · 4 ft stair run", n: "2,914.00", live: true },
  { h: "Footings & posts", s: "Concrete, frost depth · 9 ea", n: "351.00" },
  { h: "Labor", s: "Framing, deck, railing · 64 hr", n: "5,120.00" },
  { h: "+ 2 more line items", s: "Fasteners & clips, permit", n: "701.00", muted: true },
];

export function LandingC() {
  const [menu, setMenu] = useState(false);
  useLandingCReveal();

  const close = useCallback(() => setMenu(false), []);

  // Escape closes the menu. The scroll lock itself is CSS (`body:has(...)`),
  // so there is no body class to strand if this effect is ever torn down mid-
  // transition.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  return (
    <div className="jf-landing-c">
      <div className="lc-rules" aria-hidden="true" />

      {/* ── NAV ───────────────────────────────────────────────────────── */}
      <header className="lc-nav">
        <div className="lc-nav-bar">
          <Link href="/landing-c" className="lc-brand" aria-label="JobFlex — home">
            <LcMark />
            <b>JobFlex</b>
          </Link>
          <nav className="lc-nav-links" aria-label="Primary">
            {NAV.map((l) => (
              <Link key={l.label} href={l.href}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="lc-nav-end">
            <Link href="/auth/login" className="lc-nav-signin">
              Sign in
            </Link>
            <Link href="/auth/register" className="lc-btn" data-lc-v="fill">
              Start free
              <LcArrow />
            </Link>
            <button
              type="button"
              className="lc-burger"
              aria-label="Open menu"
              aria-expanded={menu}
              onClick={() => setMenu(true)}
            >
              <LcBurger />
            </button>
          </div>
        </div>
      </header>

      {menu && (
        <div className="lc-menu" data-lc-menu="open" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="lc-menu-top">
            <span className="lc-brand">
              <LcMark />
              <b>JobFlex</b>
            </span>
            <button type="button" className="lc-burger" aria-label="Close menu" onClick={close}>
              <LcBurger open />
            </button>
          </div>
          <nav aria-label="Mobile">
            {NAV.map((l) => (
              <Link key={l.label} href={l.href} onClick={close}>
                <span>{l.n}</span>
                {l.label}
              </Link>
            ))}
            <Link href="/auth/login" onClick={close}>
              <span>05</span>
              Sign in
            </Link>
          </nav>
          <div className="lc-menu-foot">
            <Link href="/auth/register" className="lc-btn" data-lc-v="fill" onClick={close}>
              Start free
              <LcArrow />
            </Link>
            <p className="lc-mono">No card required · 14-day trial</p>
          </div>
        </div>
      )}

      <main>
        {/* ── HERO ────────────────────────────────────────────────────── */}
        <section className="lc-sec lc-hero">
          <div className="lc-wrap">
            <div className="lc-hero-copy" data-rv>
              <p className="lc-kick">
                <i />
                The operating system for contractors
              </p>
              <h1 className="lc-h1">
                Quote the job before you leave the driveway
              </h1>
              <p className="lc-lead">
                Describe the work in plain English — or walk it on video — and get back a
                line-itemed proposal with real material prices, ready to send while you are
                still parked outside.
              </p>
              <div className="lc-ctas">
                <Link href="/auth/register" className="lc-btn" data-lc-v="fill">
                  Start free
                  <LcArrow />
                </Link>
                <Link href="#how" className="lc-btn">
                  <LcPlay />
                  See how it works
                </Link>
              </div>
              <p className="lc-hero-note">No card required · 14-day trial</p>
            </div>

            {/* The hero figure IS the pitch: a Smart Proposal drawn as the
                estimate sheet it produces, plan on the left, priced ledger on
                the right, arithmetic that adds up. */}
            <figure className="lc-sheet lc-hero-figure" data-rv data-rv-d="1">
              <figcaption className="lc-sheet-top">
                <span className="lc-mono">Proposal · 14 Maple St · Deck build</span>
                <span className="lc-chip lc-push">
                  <i />
                  Live retail pricing
                </span>
              </figcaption>

              <div className="lc-figure-body">
                <div className="lc-figure-plan">
                  <LcPlanDrawing />
                  <p className="lc-mono lc-plan-label">Scope of work</p>
                  <ul className="lc-scope">
                    <li>Tear out the existing 12 × 16 deck and haul off</li>
                    <li>New footings to frost depth, 9 locations</li>
                    <li>Composite surface, hidden fasteners, no face screws</li>
                    <li>Aluminum rail with a 4-riser stair to grade</li>
                  </ul>
                  <p className="lc-mono lc-plan-note">
                    Plan · not to scale · dimensions field-verified
                  </p>
                </div>

                <div className="lc-ledger">
                  {LEDGER.map((r) => (
                    <div className="lc-row" key={r.h} data-lc-muted={r.muted ? "" : undefined}>
                      <div>
                        <div className="lc-row-h">{r.h}</div>
                        <div className="lc-row-s">{r.s}</div>
                        {r.live && (
                          <div className="lc-row-tags">
                            <span className="lc-chip">
                              <i />
                              Live price
                            </span>
                            <span className="lc-chip">In stock · store link</span>
                          </div>
                        )}
                      </div>
                      <div className="lc-row-n">{r.n}</div>
                    </div>
                  ))}
                  <div className="lc-total">
                    <span className="lc-mono">Total estimate</span>
                    <span className="lc-total-n">$14,820.00</span>
                  </div>
                </div>
              </div>

              <div className="lc-sheet-foot">
                <span className="lc-mono">Materials 9,700.00</span>
                <span className="lc-mono">Labor 5,120.00</span>
                <span className="lc-mono lc-push">
                  Dwg 2847 · Rev C · Illustrative document, example figures
                </span>
              </div>
            </figure>
          </div>
        </section>

        {/* ── TRADE STRIP ─────────────────────────────────────────────── */}
        <section className="lc-sec lc-trades" data-lc-tight>
          <div className="lc-wrap" data-rv>
            <p className="lc-mono">Built for the trades that run one to ten people</p>
            <ul className="lc-trade-row">
              {TRADES.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── HOW IT WORKS ────────────────────────────────────────────── */}
        <section className="lc-sec" id="how" data-lc-mark>
          <div className="lc-wrap">
            <div className="lc-head" data-rv>
              <p className="lc-kick">
                <i />
                How it works
              </p>
              <h2 className="lc-h2">Three steps, and no estimating software to learn</h2>
              <p className="lc-lead">
                You already know the job. JobFlex handles the paperwork between knowing it and
                getting paid for it.
              </p>
              <div className="lc-ctas">
                <Link href="/auth/register" className="lc-btn" data-lc-v="fill">
                  Start free
                  <LcArrow />
                </Link>
                <Link href="/pricing" className="lc-btn">
                  See pricing
                </Link>
              </div>
            </div>

            <div className="lc-grid-3">
              {STEPS.map((s, i) => (
                <article
                  className="lc-sheet lc-step"
                  key={s.title}
                  data-rv
                  data-rv-d={String(i)}
                >
                  <div className="lc-step-copy">
                    <span className="lc-num">{s.n}</span>
                    <h3 className="lc-h3">{s.title}</h3>
                    <p className="lc-body">{s.body}</p>
                  </div>
                  <div className="lc-step-art">{s.art}</div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── ESTIMATORS (the page's one inverse band) ────────────────── */}
        <section className="lc-sec lc-band" id="tools" data-lc-invert>
          <div className="lc-wrap">
            <div className="lc-head" data-rv>
              <p className="lc-kick">
                <i />
                Measure without a tape
              </p>
              <h2 className="lc-h2">Three ways to get the numbers off the job</h2>
              <p className="lc-lead">
                Measuring is the part that eats the evening. These take it off the drive home.
              </p>
            </div>

            <div className="lc-tools">
              {TOOLS.map((t, i) => (
                <article className="lc-tool" key={t.kicker} data-rv data-rv-d={String(i)}>
                  <div className="lc-tool-art">{t.art}</div>
                  <div className="lc-tool-copy">
                    <span className="lc-mono">{t.kicker}</span>
                    <h3 className="lc-h3">{t.title}</h3>
                    <p className="lc-body">{t.body}</p>
                    <div className="lc-tool-meta">
                      {t.tags.map((tag) => (
                        <span className="lc-tag" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── BENEFITS ────────────────────────────────────────────────── */}
        <section className="lc-sec" id="features" data-lc-mark>
          <div className="lc-wrap">
            <div className="lc-head" data-rv>
              <p className="lc-kick">
                <i />
                The rest of the workspace
              </p>
              <h2 className="lc-h2">Everything after the handshake</h2>
              <p className="lc-lead">
                The proposal is the start of the job, not the end of it. The rest of the shop
                runs in the same place.
              </p>
            </div>

            <div className="lc-bens">
              {BENEFITS.map((b) => (
                <div className="lc-ben" key={b.title} data-rv>
                  <LcGlyph d={b.glyph} />
                  <h3 className="lc-h3">{b.title}</h3>
                  <p className="lc-body">{b.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── QUOTES ──────────────────────────────────────────────────── */}
        <section className="lc-sec" data-lc-mark>
          <div className="lc-wrap">
            <div className="lc-head" data-rv>
              <p className="lc-kick">
                <i />
                In the field
              </p>
              <h2 className="lc-h2">What the workflow sounds like</h2>
            </div>

            <div className="lc-quotes">
              {QUOTES.map((q, i) => (
                <figure className="lc-sheet lc-quote" key={q.initials} data-rv data-rv-d={String(i)}>
                  <blockquote>&ldquo;{q.quote}&rdquo;</blockquote>
                  <figcaption>
                    <span className="lc-avatar" aria-hidden="true">
                      {q.initials}
                    </span>
                    <span>
                      <span className="lc-quote-who">{q.who}</span>
                      <span className="lc-quote-where">{q.where}</span>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>

            <p className="lc-illus" data-rv>
              Illustrative — written to show the workflow, not quoted from named customers
            </p>
          </div>
        </section>

        {/* ── FACTS ───────────────────────────────────────────────────── */}
        <section className="lc-sec" data-lc-tight>
          <div className="lc-wrap">
            <div className="lc-facts" data-rv>
              {FACTS.map((f) => (
                <div className="lc-fact" key={f.n}>
                  <b>{f.n}</b>
                  <p className="lc-body">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CLOSER ──────────────────────────────────────────────────── */}
        <section className="lc-sec" data-lc-mark>
          <div className="lc-wrap">
            <div className="lc-sheet lc-closer" data-rv>
              <p className="lc-kick">
                <i />
                Start free
              </p>
              <h2 className="lc-h2">
                Stop quoting at nine at night
              </h2>
              <p className="lc-lead">
                Price a real job on the trial and see what comes back. If it is not faster than
                what you do now, walk away.
              </p>
              <div className="lc-ctas">
                <Link href="/auth/register" className="lc-btn" data-lc-v="fill">
                  Create an account
                  <LcArrow />
                </Link>
                <Link href="/pricing" className="lc-btn">
                  See pricing
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="lc-foot" data-lc-mark>
        <div className="lc-wrap">
          <div className="lc-foot-grid">
            <div className="lc-foot-brand">
              <span className="lc-brand">
                <LcMark />
                <b>JobFlex</b>
              </span>
              <p className="lc-body">
                The operating system for contractors. Quote, schedule, dispatch and invoice from
                one workspace, built for shops of one to ten.
              </p>
            </div>

            <div className="lc-foot-cols">
              {FOOTER.map((col) => (
                <div className="lc-foot-col" key={col.head}>
                  <h3>{col.head}</h3>
                  <ul>
                    {col.links.map((l) => (
                      <li key={l.label}>
                        <Link href={l.href}>{l.label}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="lc-foot-bar">
            <span className="lc-mono">© 2026 JobFlex</span>
            <span className="lc-mono">Dwg — landing C · Rev 01</span>
            <span className="lc-foot-legal">
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/auth/login">Sign in</Link>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
