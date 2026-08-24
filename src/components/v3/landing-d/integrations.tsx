"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { IntegrationsMobile } from "./integrations-mobile";
import { Reveal } from "./reveal";

const TILE = "float-tile flex items-center justify-center rounded-2xl bg-white shadow-lp-tile ring-1 ring-lp-blue/25";

function Tiles({ side }: { side: "left" | "right" }) {
  const L = side === "left";
  return (
    <div className="pointer-events-auto absolute inset-y-0 hidden w-[30%] lg:block" style={L ? { left: 0 } : { right: 0 }}>
      {/* payments */}
      <span className={`${TILE} absolute h-20 w-20`} style={L ? { left: "2%", top: "18%" } : { right: "4%", top: "6%" }}>
        {L ? (
          <span className="flex h-full w-full items-center justify-center rounded-2xl bg-indigo-500 text-[34px] font-bold italic text-white">S</span>
        ) : (
          <svg viewBox="0 0 40 40" className="h-9 w-9 text-lp-ink" aria-hidden>
            <rect x="6" y="6" width="28" height="28" rx="7" fill="currentColor" />
            <rect x="15" y="15" width="10" height="10" rx="3" fill="#fff" />
          </svg>
        )}
      </span>
      {/* comms */}
      <span className={`${TILE} absolute h-[72px] w-[72px]`} style={L ? { left: "38%", top: "4%" } : { right: "40%", top: "26%" }}>
        {L ? (
          <span className="flex h-full w-full items-center justify-center rounded-2xl bg-[#f22f46]">
            <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
              <circle cx="16" cy="16" r="11" fill="none" stroke="#fff" strokeWidth="3.5" />
              <circle cx="12.5" cy="12.5" r="2.4" fill="#fff" />
              <circle cx="19.5" cy="12.5" r="2.4" fill="#fff" />
              <circle cx="12.5" cy="19.5" r="2.4" fill="#fff" />
              <circle cx="19.5" cy="19.5" r="2.4" fill="#fff" />
            </svg>
          </span>
        ) : (
          <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
            <rect x="5" y="9" width="30" height="22" rx="4" fill="#e2e8f0" />
            <path d="M5 13l15 10 15-10" fill="none" stroke="#64748b" strokeWidth="2.5" />
            <path d="M5 12a3 3 0 013-3h24a3 3 0 013 3l-15 10L5 12z" fill="#ef4444" />
          </svg>
        )}
      </span>
      {/* money / files */}
      <span className={`${TILE} absolute h-[84px] w-[84px]`} style={L ? { left: "12%", top: "52%" } : { right: "14%", top: "48%" }}>
        {L ? (
          <span className="flex h-full w-full items-center justify-center rounded-2xl bg-[#0070e0] text-[30px] font-black text-white">P</span>
        ) : (
          <span className="flex h-full w-full items-center justify-center rounded-2xl bg-[#2ca01c] text-[26px] font-black text-white">qb</span>
        )}
      </span>
      {/* calendar / sheets */}
      <span className={`${TILE} absolute h-16 w-16`} style={L ? { left: "52%", top: "40%" } : { right: "52%", top: "66%" }}>
        {L ? (
          <span className="flex h-full w-full flex-col overflow-hidden rounded-2xl">
            <span className="bg-[#1a73e8] py-1 text-center text-[8px] font-bold uppercase text-white">Jul</span>
            <span className="flex flex-1 items-center justify-center bg-white text-[22px] font-bold text-lp-ink">14</span>
          </span>
        ) : (
          <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden>
            <rect x="8" y="5" width="24" height="30" rx="3" fill="#188038" />
            <path d="M13 14h14M13 20h14M13 26h14M20 11v18" stroke="#fff" strokeWidth="1.8" />
          </svg>
        )}
      </span>
      {/* zap / camera */}
      <span className={`${TILE} absolute h-[70px] w-[70px]`} style={L ? { left: "30%", top: "76%" } : { right: "2%", top: "80%" }}>
        {L ? (
          <span className="flex h-full w-full items-center justify-center rounded-2xl bg-[#ff4f00]">
            <svg viewBox="0 0 24 24" className="h-7 w-7 text-white" aria-hidden>
              <path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12L13 2z" fill="currentColor" />
            </svg>
          </span>
        ) : (
          <svg viewBox="0 0 40 40" className="h-8 w-8 text-sky-500" aria-hidden>
            <rect x="4" y="11" width="32" height="22" rx="4" fill="currentColor" />
            <path d="M14 11l3-4h6l3 4" fill="none" stroke="currentColor" strokeWidth="2.5" />
            <circle cx="20" cy="22" r="6" fill="#fff" />
            <circle cx="20" cy="22" r="3" fill="currentColor" />
          </svg>
        )}
      </span>
      {/* mail brand / bank */}
      <span className={`${TILE} absolute h-14 w-14`} style={L ? { left: "62%", top: "72%" } : { right: "34%", top: "0%" }}>
        {L ? (
          <span className="text-[24px] font-black tracking-tight text-lp-ink">R</span>
        ) : (
          <svg viewBox="0 0 40 40" className="h-8 w-8 text-slate-600" aria-hidden>
            <path d="M6 16L20 7l14 9" fill="none" stroke="currentColor" strokeWidth="2.5" />
            <path d="M9 18v12M16 18v12M24 18v12M31 18v12M5 32h30" stroke="currentColor" strokeWidth="2.5" />
          </svg>
        )}
      </span>
    </div>
  );
}

export function Integrations() {
  const fieldRef = useRef<HTMLDivElement>(null);

  // Cursor repulsion: tiles drift away from an approaching pointer, then settle back
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const tiles = Array.from(field.querySelectorAll<HTMLElement>(".float-tile"));
    const setters = tiles.map((t) => ({
      x: gsap.quickTo(t, "x", { duration: 0.5, ease: "power2.out" }),
      y: gsap.quickTo(t, "y", { duration: 0.5, ease: "power2.out" }),
    }));

    const RADIUS = 220;
    const PUSH = 22;

    const onMove = (e: PointerEvent) => {
      tiles.forEach((t, i) => {
        const r = t.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = cx - e.clientX;
        const dy = cy - e.clientY;
        const dist = Math.hypot(dx, dy);
        if (dist < RADIUS && dist > 0.01) {
          const force = (1 - dist / RADIUS) * PUSH;
          setters[i].x((dx / dist) * force);
          setters[i].y((dy / dist) * force);
        } else {
          setters[i].x(0);
          setters[i].y(0);
        }
      });
    };
    const onLeave = () => setters.forEach((s) => (s.x(0), s.y(0)));

    field.addEventListener("pointermove", onMove);
    field.addEventListener("pointerleave", onLeave);
    return () => {
      field.removeEventListener("pointermove", onMove);
      field.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <section className="relative flex flex-col items-center bg-white px-5 pb-[10vmin] pt-[6vmin] sm:px-6 lg:pt-[4vmin]">
      <div ref={fieldRef} className="relative mx-auto w-full max-w-[92rem]">
        <Tiles side="left" />
        <Tiles side="right" />
        <Reveal>
          <IntegrationsMobile />
          <div className="mx-auto hidden max-w-[36rem] flex-col items-center justify-center text-center lg:flex lg:min-h-[420px]">
            <h2 className="lp-eyebrow text-slate-500">Integrations</h2>
            <p className="mt-4 text-[clamp(30px,3vw,42px)] font-bold tracking-[-0.015em] text-lp-ink">
              Works with your back office.
            </p>
            <p className="mt-5 text-[19px] leading-[1.55] text-slate-600">
              Stripe, Square &amp; PayPal payments, Twilio texting, Resend
              email, Google Calendar, QuickBooks, photo storage, spreadsheets.{" "}
              <strong className="text-lp-ink">Yes.</strong>
            </p>
            <a href="#" className="lp-arrow-link mt-7 text-[17px] text-slate-600 hover:text-lp-ink">
              Explore the integrations library
              <span className="arrow" aria-hidden>
                →
              </span>
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
