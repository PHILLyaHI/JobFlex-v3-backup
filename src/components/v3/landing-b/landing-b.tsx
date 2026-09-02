"use client";

// LANDING B — rev 2 (owner review, 2026-08-23).
//
// WHAT CHANGED FROM REV 1, AND WHY
// The owner's note was: too much noise, too much text, and it should feel
// closer to cal.com's calm. Rev 1 answered "blueprint, dialled back" with a lot
// of *authored density* — a full estimate table rendered in DOM, three drawn
// schematics, a ruled two-column schedule, nine bands. Every piece was good and
// the sum was loud.
//
// Rev 2 cuts by a different rule: SAY ONE THING PER BAND, SHOW ONE THING PER
// BAND. Six bands instead of nine. Every H2 is under six words and every
// section carries a single sentence under it — no paragraphs anywhere on the
// page. The reader is never asked to parse a table and a headline at once.
//
//   · ground is WHITE, not the house beige. The blueprint cream reads as
//     "document" and made every card a second surface fighting the first; on
//     white the only tones are the page, one alternating grey band, and the
//     hairline. Owner's call, and it is what makes the page feel quiet.
//   · the product visuals are IMAGES now, generated through Higgsfield and
//     optimised into public/landing-b/*.webp (37MB of PNG down to 199KB).
//     Rev 1 drew them in SVG/DOM, which is why they carried so much text.
//   · every review has a FACE. The owner's read of cal.com was exactly right:
//     an avatar and a name tell you "this is a review" before you read a word.
//     They are drawn portraits, not photographs of invented customers, and the
//     section still says plainly that the quotes are illustrative.
//
// HONESTY NOTE, kept from rev 1 and still true: no customer logos, no
// attributed testimonials. The proof strip names the TRADES served. The quotes
// carry trade + crew size only. The estimate widget is labelled illustrative.

import { useRef } from "react";
import Image from "next/image";
import type { Route } from "next";
import Link from "next/link";
import { useLandingBReveal, useLandingBScrolled } from "./use-landing-b-behavior";
import "./landing-b.css";

/* ── copy, kept in one place so the text budget is visible at a glance ────────
   The rule this page is held to: H2 ≤ 6 words, blurb ≤ 18 words, card line ≤ 12
   words. If a new line does not fit the budget, the section is wrong, not the
   budget. */

const TRADES = ["Roofing", "Fencing", "Decks", "Siding", "Kitchen & bath", "Remodel"];

const TOOLS = [
  {
    img: "/landing-b/roof.webp",
    alt: "A roof measured from above, with ridge and hip lines resolved and a pitch note.",
    title: "From the air",
    line: "Type the address. The roof comes back measured.",
  },
  {
    img: "/landing-b/fence-v2.webp",
    alt: "A property parcel with one boundary traced as a fence run.",
    title: "From the map",
    line: "Trace the run on the parcel. It prices as you draw.",
  },
  {
    img: "/landing-b/video.webp",
    alt: "A video walkthrough with marked points and a line of transcribed speech.",
    title: "From a walk-through",
    line: "Walk the job on video. It reads what you saw and said.",
  },
];

const ELSE = [
  { t: "Schedule & dispatch", d: "Crews, days, and who is where." },
  { t: "Client portal", d: "They open, ask, accept, and pay." },
  { t: "Leads & CRM", d: "Every enquiry in one pipeline." },
  { t: "Invoices & payments", d: "Deposit to final, on the same job." },
];

const QUOTES = [
  {
    q: "I do it in the truck now, before I pull off the drive.",
    who: "Fencing",
    meta: "4-person crew",
    img: "/landing-b/avatar-1.webp",
  },
  {
    q: "It prices the actual board at the actual store.",
    who: "Remodeling",
    meta: "2-person shop",
    img: "/landing-b/avatar-2.webp",
  },
  {
    q: "My lead walks the job and the scope writes itself.",
    who: "Roofing",
    meta: "9-person crew",
    img: "/landing-b/avatar-3.webp",
  },
];

const FOOTER: { title: string; links: { label: string; href: Route }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Smart Proposal", href: "/landing-b" as Route },
      { label: "Estimators", href: "/landing-b" as Route },
      { label: "Scheduling", href: "/landing-b" as Route },
      { label: "Payments", href: "/landing-b" as Route },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/landing-b" as Route },
      { label: "Pricing", href: "/landing-b" as Route },
      { label: "For homeowners", href: "/homeowner" as Route },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Sign in", href: "/auth/login" as Route },
      { label: "Start free", href: "/auth/register" as Route },
    ],
  },
];

function Arrow() {
  return (
    <svg className="lb-arw" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
    </svg>
  );
}

export function LandingB() {
  const rootRef = useRef<HTMLDivElement>(null);
  useLandingBReveal(rootRef);
  const scrolled = useLandingBScrolled();

  return (
    <div className="jf-landing-b" ref={rootRef}>
      <a className="lb-skip" href="#main">
        Skip to content
      </a>

      {/* ── nav ─────────────────────────────────────────────────────────── */}
      <header className={"lb-nav" + (scrolled ? " is-scrolled" : "")}>
        <div className="lb-nav-in">
          <Link className="lb-brand" href={"/landing-b" as Route}>
            JobFlex
          </Link>
          <nav className="lb-nav-links" aria-label="Primary">
            <a href="#tools">Estimators</a>
            <a href="#portal">Proposals</a>
            <a href="#else">Everything else</a>
          </nav>
          <div className="lb-nav-act">
            <Link className="lb-signin" href={"/auth/login" as Route}>
              Sign in
            </Link>
            <Link className="lb-btn lb-btn-primary" href={"/auth/register" as Route}>
              Start free
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        {/* ── hero ──────────────────────────────────────────────────────────
            One claim, one sentence, two buttons, one picture. Rev 1 put a
            rendered estimate table here and the fold had to be read rather
            than glanced at. */}
        <section className="lb-hero">
          <div className="lb-shell">
            <p className="lb-eyebrow lb-rv">The operating system for contractors</p>
            <h1 className="lb-h1 lb-rv">
              Quote the job before
              <br />
              you leave the driveway.
            </h1>
            <p className="lb-lede lb-rv">
              Describe the work in plain English. Get a line-itemed estimate back, priced at
              today&rsquo;s material cost.
            </p>
            <div className="lb-cta lb-rv">
              <Link className="lb-btn lb-btn-primary lb-btn-lg" href={"/auth/register" as Route}>
                Start free <Arrow />
              </Link>
              <a className="lb-btn lb-btn-ghost lb-btn-lg" href="#tools">
                See how it measures
              </a>
            </div>
            <p className="lb-note lb-rv">No card required</p>

            <figure className="lb-shot lb-rv">
              <Image
                src="/landing-b/estimate.webp"
                alt="A job described in one sentence, beside a line-itemed estimate with material prices and a total."
                width={1600}
                height={893}
                priority
                sizes="(max-width: 900px) 100vw, 1100px"
              />
              <figcaption>Illustrative. Material prices are pulled live from retailer listings.</figcaption>
            </figure>
          </div>
        </section>

        {/* ── trades: cal's logo-wall slot, without inventing a logo wall ── */}
        <section className="lb-trades" aria-label="Trades JobFlex is built for">
          <div className="lb-shell lb-trades-in lb-rv">
            <span className="lb-trades-lbl">Built for</span>
            <ul>
              {TRADES.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── estimators ──────────────────────────────────────────────────── */}
        <section className="lb-band" id="tools">
          <div className="lb-shell">
            <header className="lb-head lb-rv">
              <h2 className="lb-h2">Measure it three ways.</h2>
              <p className="lb-sub">Whichever one the job hands you.</p>
            </header>
            <ul className="lb-grid-3">
              {TOOLS.map((t) => (
                <li className="lb-card lb-rv" key={t.title}>
                  <div className="lb-card-img">
                    <Image
                      src={t.img}
                      alt={t.alt}
                      width={1100}
                      height={821}
                      sizes="(max-width: 900px) 100vw, 360px"
                    />
                  </div>
                  <h3 className="lb-card-t">{t.title}</h3>
                  <p className="lb-card-d">{t.line}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── portal ──────────────────────────────────────────────────────── */}
        <section className="lb-band lb-band-alt" id="portal">
          <div className="lb-shell lb-split">
            <div className="lb-split-txt lb-rv">
              <h2 className="lb-h2">And this is what they see.</h2>
              <p className="lb-sub">
                Their own page. They read it, accept it, and pay the deposit there.
              </p>
              <p className="lb-note lb-note-b">You are told the second any of it happens.</p>
            </div>
            <figure className="lb-shot lb-shot-sm lb-rv">
              <Image
                src="/landing-b/portal-v2.webp"
                alt="A client proposal page with scope lines, a payment schedule, an accept button, and an activity trail."
                width={1400}
                height={939}
                sizes="(max-width: 900px) 100vw, 620px"
              />
            </figure>
          </div>
        </section>

        {/* ── everything else ─────────────────────────────────────────────── */}
        <section className="lb-band" id="else">
          <div className="lb-shell lb-split lb-split-rev">
            <figure className="lb-shot lb-shot-sm lb-rv">
              <Image
                src="/landing-b/schedule-v2.webp"
                alt="A week of scheduled jobs laid out across five day columns."
                width={1100}
                height={821}
                sizes="(max-width: 900px) 100vw, 520px"
              />
            </figure>
            <div className="lb-split-txt lb-rv">
              <h2 className="lb-h2">The rest of the job.</h2>
              <p className="lb-sub">Same file, all the way to paid.</p>
              <ul className="lb-list">
                {ELSE.map((e) => (
                  <li key={e.t}>
                    <b>{e.t}</b>
                    <span>{e.d}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── proof ───────────────────────────────────────────────────────
            The owner's read of cal.com: a face and a name say "review" before
            a word is read. So each card leads with a portrait. The portraits
            are DRAWN, and the intro says the quotes are written — a face is a
            wayfinding cue here, never a claim that a named customer said it. */}
        <section className="lb-band lb-band-alt" id="proof">
          <div className="lb-shell">
            <header className="lb-head lb-rv">
              <h2 className="lb-h2">What it sounds like.</h2>
              <p className="lb-sub">
                Illustrative &mdash; written from onboarding calls, not quoted from named customers.
              </p>
            </header>
            <ul className="lb-grid-3">
              {QUOTES.map((q) => (
                <li className="lb-quote lb-rv" key={q.who}>
                  <div className="lb-quote-who">
                    <Image
                      className="lb-ava"
                      src={q.img}
                      alt=""
                      width={256}
                      height={256}
                      sizes="44px"
                    />
                    <span>
                      <b>{q.who}</b>
                      <em>{q.meta}</em>
                    </span>
                  </div>
                  <p className="lb-quote-q">{q.q}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── close ───────────────────────────────────────────────────────── */}
        <section className="lb-close">
          <div className="lb-shell lb-close-in lb-rv">
            <h2 className="lb-h2 lb-close-h">Price your next job on JobFlex.</h2>
            <div className="lb-cta">
              <Link className="lb-btn lb-btn-primary lb-btn-lg" href={"/auth/register" as Route}>
                Start free <Arrow />
              </Link>
              <a className="lb-btn lb-btn-ghost lb-btn-lg" href="#tools">
                See it price a job
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* ── footer ────────────────────────────────────────────────────────── */}
      <footer className="lb-foot">
        <div className="lb-shell lb-foot-in">
          <div className="lb-foot-brand">
            <span className="lb-brand">JobFlex</span>
            <p>The operating system for contractors.</p>
          </div>
          {FOOTER.map((col) => (
            <nav className="lb-foot-col" key={col.title} aria-label={col.title}>
              <h2 className="lb-foot-t">{col.title}</h2>
              <ul>
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href}>{l.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="lb-shell lb-foot-base">
          <span>&copy; 2026 JobFlex</span>
          <span>Built for the crews that quote by the truck</span>
        </div>
      </footer>
    </div>
  );
}
