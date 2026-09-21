"use client";

import { Logo } from "./logo";
import { LOGIN, REGISTER } from "./routes";
import Link from "next/link";

/* Product, Features and Resources have no pages yet and pointed at "#";
   hidden until they exist (CRO stage 2, 2026-09-09). */
const LINKS = ["Pricing"];

const HREFS: Record<string, string> = { Pricing: "/pricing" };

function Caret() {
  return (
    <svg viewBox="0 0 10 6" className="h-1.5 w-2.5 opacity-50" aria-hidden>
      <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Nav({ registerHref = REGISTER, cta }: { registerHref?: string; cta?: string }) {
  return (
    // Sticky on desktop only (owner, 2026-08-25): on a phone a pinned bar
    // eats a chunk of a short viewport for a two-item nav. The bar sits on the
    // same ink ground the hero paints, so pinned or not it reads as one field.
    <header className="lp-nav relative z-50 lg:sticky lg:top-0">
      {/* 80 / 64px (owner, 2026-09-20): the bar was 94 / 72 and took more of
          the fold than a five-item row needs. The mark is 67px tall at lg,
          which is what sets 80px as the floor. `scroll-padding-top` in
          landing-e.css follows this number — move them together. */}
      <div className="mx-auto flex h-[64px] max-w-[86rem] items-center justify-between px-5 sm:px-6 lg:h-[80px]">
        <div className="flex items-center gap-10">
          <Link href="/" aria-label="JobFlex home">
            <Logo className="lp-brand--lg" />
          </Link>
          <nav className="hidden items-center gap-7 lg:flex">
            {LINKS.map((l) => (
              <a
                key={l}
                href={HREFS[l] ?? "#"}
                className="inline-flex items-center gap-1.5 text-[15px] font-medium text-black/70 transition-colors hover:text-black"
              >
                {l}
                {(l === "Product" || l === "Resources") && <Caret />}
              </a>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-6 lg:flex">
          <a href={LOGIN} className="text-[15px] font-medium text-black/70 transition-colors hover:text-black">
            Sign in
          </a>
          {/* No note under this one (owner, 2026-09-10): the bar stays a bar.
              The trial line lives under the hero pair. */}
          <a href={registerHref} className="lp-btn-dark" data-cta="nav">
            {cta ?? "Start 14-Day Free Trial"}
          </a>
        </div>

        {/* Handheld: the menu drawer is gone and the bar carries the one action
            a visitor on a phone actually wants (owner, 2026-08-25). The wrapper
            does the hiding — `.jf-lp .lp-btn-dark` sets display and would
            outrank a `lg:hidden` sitting on the anchor itself. */}
        <div className="lg:hidden">
          <a href={LOGIN} className="lp-btn-dark h-10 px-5 text-[14.5px] font-semibold">
            Log in
          </a>
        </div>
      </div>
    </header>
  );
}
