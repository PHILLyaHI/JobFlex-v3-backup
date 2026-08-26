"use client";

import { Logo } from "./logo";
import { LOGIN, REGISTER } from "./routes";
import Link from "next/link";

const LINKS = ["Product", "Features", "Resources", "Pricing"];

const HREFS: Record<string, string> = { Pricing: "/pricing" };

function Caret() {
  return (
    <svg viewBox="0 0 10 6" className="h-1.5 w-2.5 opacity-50" aria-hidden>
      <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Nav() {
  return (
    // Sticky on desktop only (owner, 2026-08-25): on a phone a pinned bar
    // eats a chunk of a short viewport for a two-item nav. The bar sits on the
    // same ink ground the hero paints, so pinned or not it reads as one field.
    <header className="lp-nav relative z-50 lg:sticky lg:top-0">
      <div className="mx-auto flex h-[72px] max-w-[86rem] items-center justify-between px-5 sm:px-6 lg:h-[94px]">
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
          <a href={REGISTER} className="lp-btn-dark">
            Start 14-Day Free Trial
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
