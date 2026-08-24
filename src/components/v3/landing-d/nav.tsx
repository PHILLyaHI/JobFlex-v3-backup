"use client";

import { useState } from "react";
import { Logo } from "./logo";
import Link from "next/link";

const LINKS = ["Product", "Features", "Resources", "Pricing"];

const HREFS: Record<string, string> = { Pricing: "/pricing", "Sign in": "/login" };

function Caret() {
  return (
    <svg viewBox="0 0 10 6" className="h-1.5 w-2.5 opacity-50" aria-hidden>
      <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="relative z-50 bg-white">
      <div className="mx-auto flex h-[72px] max-w-[86rem] items-center justify-between px-5 sm:px-6 lg:h-[94px]">
        <div className="flex items-center gap-10">
          <Link href="/" aria-label="JobFlex home">
            <Logo />
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
          <a href="/login" className="text-[15px] font-medium text-black/70 transition-colors hover:text-black">
            Sign in
          </a>
          <a href="/register" className="lp-btn-dark">
            Get Started — free
          </a>
        </div>

        <button
          className="-mr-2 flex h-11 w-11 flex-col items-center justify-center gap-[5px] lg:hidden"
          aria-label="Menu"
          onClick={() => setOpen(!open)}
        >
          <span
            className={`h-[2px] w-5 bg-lp-ink transition-transform duration-300 ease-[cubic-bezier(.2,.6,.2,1)] ${
              open ? "translate-y-[7px] rotate-45" : ""
            }`}
          />
          <span
            className={`h-[2px] w-5 bg-lp-ink transition-[opacity,transform] duration-200 ease-out ${
              open ? "scale-x-0 opacity-0" : ""
            }`}
          />
          <span
            className={`h-[2px] w-5 bg-lp-ink transition-transform duration-300 ease-[cubic-bezier(.2,.6,.2,1)] ${
              open ? "-translate-y-[7px] -rotate-45" : ""
            }`}
          />
        </button>
      </div>

      {/* Mobile menu — always mounted so it can ease open and closed */}
      <div
        className={`absolute inset-x-0 top-full border-t border-slate-100 bg-white px-5 pb-8 pt-2 shadow-xl transition-[opacity,transform] duration-300 ease-[cubic-bezier(.2,.6,.2,1)] lg:hidden ${
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-3 opacity-0"
        }`}
        aria-hidden={!open}
      >
        {[...LINKS, "Sign in"].map((l, i) => (
          <a
            key={l}
            href={HREFS[l] ?? "#"}
            tabIndex={open ? 0 : -1}
            className="flex min-h-[48px] items-center border-b border-slate-50 text-[17px] font-medium text-lp-ink transition-[opacity,transform] duration-300 ease-out"
            style={{
              opacity: open ? 1 : 0,
              transform: open ? "none" : "translateY(-6px)",
              transitionDelay: open ? `${80 + i * 40}ms` : "0ms",
            }}
          >
            {l}
          </a>
        ))}
        <a
          href="/register"
          tabIndex={open ? 0 : -1}
          className="lp-btn-dark mt-5 h-12 w-full text-[16px]"
          style={{
            opacity: open ? 1 : 0,
            transform: open ? "none" : "translateY(-6px)",
            transition: "opacity .3s ease-out, transform .3s ease-out",
            transitionDelay: open ? "300ms" : "0ms",
          }}
        >
          Get Started — free
        </a>
      </div>
    </header>
  );
}
