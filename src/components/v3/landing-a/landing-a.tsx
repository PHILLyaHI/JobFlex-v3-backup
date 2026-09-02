"use client";

// JobFlex marketing landing — VERSION A, "THE SHEET".
//
// The design spec lives in the header of landing-a.css and governs this file:
// line-weight hierarchy, the 80/15/5 colour split, the annotation layer, and
// what was and was not taken from cal.com. Read it before changing a class.
//
// Two conventions worth stating here, because they are easy to undo by
// accident:
//
// 1. HEADINGS ARE WRITTEN IN SENTENCE CASE and uppercased by CSS
//    (`text-transform`). Typing them in caps in the markup would ship caps to
//    the accessibility tree, where several screen readers spell out
//    all-capital words letter by letter. The visual is identical; the audio
//    is not.
// 2. NOTHING ON THIS PAGE TOUCHES THE DATA LAYER. No Prisma, no server
//    actions, no auth, no fetch. Every figure below is copy, and the numbers
//    in the hero proposal are a worked example that adds up
//    (2,880 + 4,217 + 702 + 164 + 6,173 = 14,136) so the drawing survives
//    somebody checking it.
//
// The word "AI" appears nowhere in the UI, per the house rule — the feature
// is Smart Proposal, and the estimators are named for what they measure.
//
// Social proof is presented as ILLUSTRATIVE and stamped on every card. No
// customer logos are printed and no quote is attributed to a company, because
// none has been collected. The trade strip fills cal.com's logo-wall slot
// with the trades the product serves instead.

import { useState } from "react";
import {
  BenefitIcon,
  BurgerIcon,
  FencePlate,
  MaterialsPlate,
  Mark,
  RoofPlate,
  VideoPlate,
} from "./landing-a-art";
import { useLandingABehavior } from "./use-landing-a-behavior";
import "./landing-a.css";

const NAV = [
  { href: "#steps", label: "How it works" },
  { href: "#estimators", label: "Estimators" },
  { href: "#platform", label: "Platform" },
  { href: "/pricing", label: "Pricing" },
];

const TRADES = [
  "Roofing",
  "Fencing",
  "Decks",
  "Siding",
  "Kitchen & bath",
  "Concrete",
  "General remodel",
];

const STEPS = [
  {
    n: "Step 01",
    title: "Say what the job is",
    body:
      "Type it the way you would say it to your crew, or walk the property on video and talk through it out loud. Both get read the same way.",
    rows: [
      { k: "Video", v: "3:12" },
      { k: "Spoken notes", v: "Read" },
      { k: "Items found", v: "12", accent: true },
    ],
  },
  {
    n: "Step 02",
    title: "Get it back line-itemed",
    body:
      "Quantities, labour and materials come back itemised — with a real retail price on every material line and a link to the shelf it sits on.",
    rows: [
      { k: "Tear-off, 24 SQ", v: "$2,880" },
      { k: "Shingle, 74 BDL", v: "$4,217" },
      { k: "Priced at address", v: "Live", accent: true },
    ],
  },
  {
    n: "Step 03",
    title: "Send it from the driveway",
    body:
      "The client opens it on their phone, reads the scope, and accepts. The job lands on your schedule the moment they do.",
    rows: [
      { k: "Sent", v: "4:12 PM" },
      { k: "Opened", v: "4:14 PM" },
      { k: "Accepted", v: "4:21 PM", accent: true },
    ],
  },
];

const TOOLS = [
  {
    kicker: "Roof estimator",
    title: "Measure it from the air",
    body:
      "Draw the roof off aerial imagery and get facets, pitch and squares back, waste included. You never put a ladder up to write a number.",
    art: <RoofPlate />,
  },
  {
    kicker: "Fence estimator",
    title: "Trace the run on a map",
    body:
      "Pull the parcel boundary, trace the line, set the height. It reads the road off the map and leaves the street side open, so you are not quoting fence across a driveway.",
    art: <FencePlate />,
  },
  {
    kicker: "Video estimator",
    title: "Walk the job and talk",
    body:
      "Record the walk-through on your phone. It reads the footage and what you said out loud, then comes back with the scope you described.",
    art: <VideoPlate />,
  },
  {
    kicker: "Live material pricing",
    title: "Priced at the address",
    body:
      "Every material line is checked against stores near the job, not a list you last updated in spring. You get the price, the distance, and whether it is on the shelf.",
    art: <MaterialsPlate />,
  },
];

const BENEFITS = [
  {
    icon: "proposal",
    title: "Proposals & portal",
    body: "Clients read, question and accept in one link. No PDF going stale in an inbox.",
  },
  {
    icon: "pipeline",
    title: "Leads & pipeline",
    body: "Every enquiry lands in one list with the trade, the address and where it came from.",
  },
  {
    icon: "calendar",
    title: "Scheduling",
    body: "Estimates, installs and follow-ups on one calendar that knows who is already busy.",
  },
  {
    icon: "crew",
    title: "Crew dispatch",
    body: "Send the job out with the scope, the contact and the address already attached.",
  },
  {
    icon: "jobs",
    title: "Jobs & progress",
    body: "Take a job from accepted to complete without running it through a group chat.",
  },
  {
    icon: "invoice",
    title: "Invoicing & payments",
    body: "Invoice straight off the accepted proposal and take the payment on the same page.",
  },
  {
    icon: "network",
    title: "Trade network",
    body: "Hand overflow work to other shops on the platform instead of turning it down.",
  },
  {
    icon: "clients",
    title: "Client records",
    body: "Every proposal, job and payment for a client sitting on one record.",
  },
];

const NOTES = [
  {
    who: "Roofing",
    size: "4-person shop",
    quote:
      "I used to quote on Sunday nights. Now the homeowner has the number before I have packed the ladder.",
  },
  {
    who: "Fencing",
    size: "2-person shop",
    quote:
      "Tracing the run on the map takes about a minute. Measuring it used to take the whole visit.",
  },
  {
    who: "Decks & remodel",
    size: "6-person shop",
    quote:
      "The video walk-through is the one that changed things. I talk through the job the way I would explain it to a lead, and the scope comes back written down.",
  },
  {
    who: "Siding",
    size: "3-person shop",
    quote:
      "Material prices being real is the part my margin cares about. I was quoting off last year's numbers and eating the difference.",
  },
  {
    who: "General contractor",
    size: "9-person shop",
    quote:
      "The schedule, the crew and the invoice all being the same job means nobody asks me which version is current any more.",
  },
  {
    who: "Kitchen & bath",
    size: "5-person shop",
    quote: "Clients accept on their phone in the driveway. That is a different close rate.",
  },
];

const FAQ = [
  {
    q: "How accurate are the measurements?",
    a: "The roof and fence tools measure off aerial imagery and parcel data, so they are as good as the imagery for that address — which is usually very good. You see the drawing before anything gets priced, and you can correct any edge by hand.",
  },
  {
    q: "Where do the material prices come from?",
    a: "Retail listings from stores near the job address, checked at the moment you build the estimate. Each line shows the price, the distance, and whether it is in stock, and links through to the product.",
  },
  {
    q: "Do I have to change how I price work?",
    a: "No. Your rates, your markup, your waste factors. The estimators bring quantities and material costs to the table; what you charge for them stays yours.",
  },
  {
    q: "What happens when a client wants a change?",
    a: "Edit the proposal and resend it. The client sees the revision, and the version they accept is the one that becomes the job, the schedule entry and the invoice.",
  },
  {
    q: "Does it actually work on a phone?",
    a: "Yes — including the video walk-through, which only works on a phone. Every surface is built to be used one-handed, outdoors, in daylight.",
  },
];

const FOOT = [
  {
    head: "Product",
    links: [
      ["Smart Proposal", "#steps"],
      ["Proposals & portal", "#platform"],
      ["Scheduling", "#platform"],
      ["Invoicing", "#platform"],
    ],
  },
  {
    head: "Estimators",
    links: [
      ["Roof", "#estimators"],
      ["Fence", "#estimators"],
      ["Video walk-through", "#estimators"],
      ["Live materials", "#estimators"],
    ],
  },
  {
    head: "Company",
    links: [
      ["About", "/about"],
      ["Pricing", "/pricing"],
      ["For homeowners", "/homeowner"],
    ],
  },
  {
    head: "Legal",
    links: [
      ["Terms", "/terms"],
      ["Privacy", "/privacy"],
      ["Sign in", "/auth/login"],
    ],
  },
];

export function LandingA() {
  const rootRef = useLandingABehavior<HTMLDivElement>();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="jf-landing-a" ref={rootRef}>
      <a className="la-skip" href="#main">
        Skip to content
      </a>

      <div className="la-sheet">
        {/* ── NAV — cal.com's floating pill, squared off ─────────────────── */}
        <header className="la-nav-wrap">
          <nav className="la-nav" aria-label="Main">
            <a className="la-brand" href="#main">
              <Mark className="la-brand-mark" />
              <span className="la-brand-name">JobFlex</span>
            </a>

            <div className="la-nav-links">
              {NAV.map((item) => (
                <a key={item.href} href={item.href}>
                  {item.label}
                </a>
              ))}
            </div>

            <div className="la-nav-end">
              <a className="la-nav-signin" href="/auth/login">
                Sign in
              </a>
              <a className="la-btn la-btn-primary la-btn-sm la-nav-cta" href="/auth/register">
                Start free
              </a>
              <button
                type="button"
                className="la-burger"
                aria-expanded={menuOpen}
                aria-controls="la-menu"
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <BurgerIcon open={menuOpen} />
              </button>
            </div>
          </nav>

          {menuOpen ? (
            <div className="la-menu" id="la-menu">
              {NAV.map((item) => (
                <a key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>
                  {item.label}
                </a>
              ))}
              <a href="/auth/login" onClick={() => setMenuOpen(false)}>
                Sign in
              </a>
              <a className="la-btn la-btn-primary" href="/auth/register">
                Start free
              </a>
            </div>
          ) : null}
        </header>

        <main id="main">
          {/* ── HERO ────────────────────────────────────────────────────── */}
          <section className="la-band la-hero">
            <div className="la-hero-in">
              <p className="la-eyebrow la-mono" data-rv>
                <i aria-hidden="true" />
                The operating system for contractors
              </p>
              <h1 data-rv="1">Price the job before you leave the driveway</h1>
              <p className="la-lede" data-rv="2">
                JobFlex measures the job, prices it against material costs pulled from stores near
                the address, and sends a proposal your client can sign on their phone. Then it runs
                the schedule, the crew and the invoice.
              </p>
              <div className="la-hero-cta" data-rv="3">
                <a className="la-btn la-btn-primary" href="/auth/register">
                  Start free
                </a>
                <a className="la-btn la-btn-ghost" href="#estimators">
                  See the estimators
                </a>
              </div>
              <p className="la-mono la-hero-note" data-rv="4">
                14-day trial &middot; No card &middot; Cancel anytime
              </p>
            </div>

            {/* The hero artifact. Authored as HTML rather than one big SVG so
                it reflows at 390px and stays selectable and readable. */}
            <div className="la-plate" data-rv="5">
              <div className="la-plate-bar">
                <b>Smart Proposal</b>
                <span className="la-mono">EST-1042 &middot; Rev A</span>
              </div>

              <div className="la-plate-grid">
                <div className="la-plate-in">
                  <span className="la-mono">Describe the job</span>
                  <p className="la-field">
                    Tear off two layers on a 6/12 hip roof, about 24 squares. New ice and water on
                    the eaves, new pipe boots, architectural shingle.
                    <span className="la-caret" aria-hidden="true" />
                  </p>

                  {/* The same box takes a walk-through, so the panel says so
                      rather than leaving the column half empty next to the
                      taller estimate. */}
                  <div className="la-plate-alt">
                    <span className="la-mono">Or hand it the walk-through</span>
                    <div className="la-mini">
                      <span className="la-mini-row">
                        Video
                        <b>3:12</b>
                      </span>
                      <span className="la-mini-row">
                        Spoken notes
                        <b>Read</b>
                      </span>
                      <span className="la-mini-row" data-accent>
                        Scope items found
                        <b>12</b>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="la-plate-out">
                  <span className="la-mono">Estimate</span>
                  <table className="la-items">
                    <thead>
                      <tr>
                        <th scope="col">Line item</th>
                        <th scope="col">Qty</th>
                        <th scope="col">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Tear-off, two layers</td>
                        <td className="la-qty">24 SQ</td>
                        <td className="la-amt">$2,880</td>
                      </tr>
                      <tr data-live>
                        <td>Architectural shingle, 30 yr</td>
                        <td className="la-qty">74 BDL</td>
                        <td className="la-amt">$4,217</td>
                      </tr>
                      <tr>
                        <td colSpan={3}>
                          <span className="la-live">
                            <i className="la-live-dot" aria-hidden="true" />
                            <span className="la-mono">Live price</span>
                            <b>$56.98 / BDL</b>
                            <span className="la-mono" data-store>
                              3 suppliers &middot; 2.1 mi &middot; In stock
                            </span>
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td>Ice &amp; water shield</td>
                        <td className="la-qty">6 RL</td>
                        <td className="la-amt">$702</td>
                      </tr>
                      <tr>
                        <td>Pipe boots &amp; flashing</td>
                        <td className="la-qty">4 EA</td>
                        <td className="la-amt">$164</td>
                      </tr>
                      <tr>
                        <td>Install labour</td>
                        <td className="la-qty">24 SQ</td>
                        <td className="la-amt">$6,173</td>
                      </tr>
                    </tbody>
                  </table>

                  <p className="la-total">
                    <span className="la-mono">Proposal total</span>
                    <b>$14,136</b>
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ── TRADE STRIP — cal's logo wall, without invented logos ────── */}
          <section className="la-trades" aria-label="Trades served">
            <p className="la-mono">Built for</p>
            <ul className="la-trade-row">
              {TRADES.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>

          {/* ── PLATE 01 — how it works ─────────────────────────────────── */}
          <section className="la-band" id="steps">
            <div className="la-plate-no" data-rv>
              <b>Plate 01</b>
              <span>Walk-through to signature</span>
            </div>
            <div className="la-head" data-rv="1">
              <h2>Three steps and you are done quoting</h2>
              <p className="la-lede">
                No spreadsheet, no second trip out to measure, no evening at the kitchen table with
                a calculator and last year&apos;s prices.
              </p>
            </div>

            <div className="la-steps">
              {STEPS.map((s, i) => (
                <article className="la-step" key={s.n} data-rv={i + 1}>
                  <p className="la-step-n">{s.n}</p>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                  <div className="la-step-art">
                    <div className="la-mini">
                      {s.rows.map((r) => (
                        <span
                          className="la-mini-row"
                          key={r.k}
                          {...(r.accent ? { "data-accent": "" } : {})}
                        >
                          {r.k}
                          <b>{r.v}</b>
                        </span>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* ── PLATE 02 — the estimators ───────────────────────────────── */}
          <section className="la-band" id="estimators">
            <div className="la-plate-no" data-rv>
              <b>Plate 02</b>
              <span>Measurement</span>
            </div>
            <div className="la-head" data-rv="1">
              <h2>Measure it without climbing it</h2>
              <p className="la-lede">
                Four ways into an estimate. Use whichever one the job hands you — the roof from the
                air, the fence off a map, the remodel on video, and the materials priced where you
                would actually buy them.
              </p>
            </div>

            <div className="la-tools">
              {TOOLS.map((t, i) => (
                <article className="la-tool" key={t.kicker} data-rv={i + 1}>
                  <div className="la-tool-art">{t.art}</div>
                  <div className="la-tool-body">
                    <span className="la-mono">{t.kicker}</span>
                    <h3>{t.title}</h3>
                    <p>{t.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* ── PLATE 03 — the rest of the platform ─────────────────────── */}
          <section className="la-band" id="platform">
            <div className="la-plate-no" data-rv>
              <b>Plate 03</b>
              <span>The rest of the shop</span>
            </div>
            <div className="la-head" data-rv="1">
              <h2>The quote is only the front door</h2>
              <p className="la-lede">
                Everything downstream of it lives in the same workspace, so the number you sent, the
                crew you dispatched and the invoice you are chasing are all the same job.
              </p>
            </div>

            <div className="la-bens">
              {BENEFITS.map((b, i) => (
                <article className="la-ben" key={b.title} data-rv={(i % 4) + 1}>
                  <BenefitIcon name={b.icon} />
                  <h3>{b.title}</h3>
                  <p>{b.body}</p>
                </article>
              ))}
            </div>
          </section>

          {/* ── PLATE 04 — field notes, explicitly illustrative ─────────── */}
          <section className="la-band">
            <div className="la-plate-no" data-rv>
              <b>Plate 04</b>
              <span>Field notes</span>
            </div>
            <div className="la-head" data-rv="1">
              <h2>What a week looks like</h2>
              <p className="la-lede">
                The notes below are illustrative — written to show how the product gets used, not
                collected from customers. We will print real ones when we have earned them.
              </p>
            </div>

            <div className="la-notes">
              {NOTES.map((n, i) => (
                <figure className="la-note" key={n.quote} data-rv={(i % 3) + 1}>
                  <div className="la-note-top">
                    <span className="la-mono">{n.who}</span>
                    <span className="la-note-tag">Illustrative</span>
                  </div>
                  <blockquote>{n.quote}</blockquote>
                  <figcaption className="la-mono">{n.size}</figcaption>
                </figure>
              ))}
            </div>
          </section>

          {/* ── PLATE 05 — FAQ. Native <details>: keyboard support and
                 no-JS operation come free. ─────────────────────────────── */}
          <section className="la-band">
            <div className="la-plate-no" data-rv>
              <b>Plate 05</b>
              <span>Questions</span>
            </div>
            <div className="la-head" data-rv="1">
              <h2>Questions we get</h2>
            </div>

            <div className="la-faq" data-rv="2">
              {FAQ.map((f) => (
                <details key={f.q}>
                  <summary>
                    {f.q}
                    <span className="la-faq-sign" aria-hidden="true" />
                  </summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </section>

          {/* ── CLOSING CTA ─────────────────────────────────────────────── */}
          <section className="la-band la-close">
            <div className="la-close-plate" data-rv>
              <h2>Stop quoting at eleven at night</h2>
              <p className="la-lede">
                Start free, price a real job today, and see whether the number comes back the way
                you would have written it yourself.
              </p>
              <div className="la-close-cta">
                <a className="la-btn la-btn-primary" href="/auth/register">
                  Start free
                </a>
                <a className="la-btn la-btn-ghost" href="/pricing">
                  See pricing
                </a>
              </div>
              <p className="la-mono la-hero-note">14-day trial &middot; No card required</p>
            </div>
          </section>
        </main>
      </div>

      {/* ── FOOTER — cal.com closes a long scroll by inverting to a dark
             surface. Same move, our own ink, full-bleed so the sheet visibly
             ends. The title block is the page's only stamp. ─────────────── */}
      <footer className="la-foot">
        <div className="la-foot-in">
          <div className="la-foot-grid">
            <div className="la-foot-brand">
              <span className="la-brand">
                <Mark className="la-brand-mark" />
                <span className="la-brand-name">JobFlex</span>
              </span>
              <p>
                The operating system for contractors. Quote it, schedule it, build it, and get paid
                for it — without leaving one workspace.
              </p>
            </div>

            {FOOT.map((col) => (
              <div className="la-foot-col" key={col.head}>
                <h3>{col.head}</h3>
                <ul>
                  {col.links.map(([label, href]) => (
                    <li key={label}>
                      <a href={href}>{label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="la-titleblock">
            <span className="la-mono">JobFlex</span>
            <span className="la-mono">Landing &mdash; Rev A</span>
            <span className="la-mono">Sheet 1 of 1</span>
            <span className="la-mono" data-rev>
              &copy; 2026 JobFlex
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
