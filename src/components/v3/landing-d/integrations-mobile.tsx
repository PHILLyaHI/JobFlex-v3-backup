"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/* Mobile integrations: two counter-scrolling icon marquees + one headline */

const TILE =
  "flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white ring-1 ring-lp-blue/25 shadow-[0_1px_2px_rgb(15_23_42/0.04),0_10px_24px_-12px_rgb(15_23_42/0.16)]";

function Icon({ name }: { name: string }) {
  switch (name) {
    case "gmail":
      return (
        <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
          <path d="M2 7v11h4v-7l6 4.5L18 11v7h4V7l-10 7.5L2 7z" fill="#ea4335" />
          <path d="M2 7l10 7.5L22 7l-2-1.5-8 6-8-6L2 7z" fill="#c5221f" opacity=".4" />
          <path d="M2 7l2-1.5 8 6 8-6L22 7" fill="none" />
        </svg>
      );
    case "gcal":
      return (
        <span className="flex h-8 w-8 flex-col overflow-hidden rounded-md ring-1 ring-slate-200">
          <span className="bg-[#1a73e8] py-[2px] text-center text-[6px] font-bold uppercase leading-none text-white">
            Jul
          </span>
          <span className="flex flex-1 items-center justify-center bg-white text-[13px] font-bold text-[#1a73e8]">
            31
          </span>
        </span>
      );
    case "drive":
      return (
        <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
          <path d="M8.5 3h7l6 10.5h-7L8.5 3z" fill="#ffc107" />
          <path d="M8.5 3l-6 10.5 3.5 6L12 9 8.5 3z" fill="#1e8e3e" />
          <path d="M6 19.5h12l3.5-6h-12L6 19.5z" fill="#1a73e8" />
        </svg>
      );
    case "dropbox":
      return (
        <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
          <path
            d="M7 3l5 3.2L7 9.4 2 6.2 7 3zm10 0l5 3.2-5 3.2-5-3.2L17 3zM2 12.6l5-3.2 5 3.2-5 3.2-5-3.2zm15-3.2l5 3.2-5 3.2-5-3.2 5-3.2zM7 17l5-3.2L17 17l-5 3.2L7 17z"
            fill="#0061ff"
          />
        </svg>
      );
    case "github":
      return (
        <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
          <path
            d="M12 2a10 10 0 00-3.16 19.5c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.1.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.58 9.58 0 015 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85V21c0 .27.18.58.69.48A10 10 0 0012 2z"
            fill="#0f172a"
          />
        </svg>
      );
    case "figma":
      return (
        <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
          <path d="M8.5 2h3.5v6.7H8.5a3.35 3.35 0 010-6.7z" fill="#f24e1e" />
          <path d="M12 2h3.5a3.35 3.35 0 010 6.7H12V2z" fill="#ff7262" />
          <path d="M8.5 8.7H12v6.6H8.5a3.3 3.3 0 010-6.6z" fill="#a259ff" />
          <path d="M12 8.7h3.5a3.3 3.3 0 11-3.5 3.3V8.7z" fill="#1abcfe" />
          <path d="M8.5 15.3H12v3.4A3.35 3.35 0 118.5 15.3z" fill="#0acf83" />
        </svg>
      );
    case "slack":
      return (
        <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
          <rect x="9.5" y="2" width="3.4" height="8" rx="1.7" fill="#36c5f0" />
          <rect x="14" y="9.5" width="8" height="3.4" rx="1.7" fill="#2eb67d" />
          <rect x="11" y="14" width="3.4" height="8" rx="1.7" fill="#ecb22e" />
          <rect x="2" y="11" width="8" height="3.4" rx="1.7" fill="#e01e5a" />
        </svg>
      );
    case "stripe":
      return (
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#635bff] text-[17px] font-black italic text-white">
          S
        </span>
      );
    case "square":
      return (
        <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="4.5" fill="#0f172a" />
          <rect x="9" y="9" width="6" height="6" rx="1.2" fill="#fff" />
        </svg>
      );
    case "qb":
      return (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2ca01c] text-[13px] font-black text-white">
          qb
        </span>
      );
    case "zapier":
      return (
        <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
          <path
            d="M12 4v5.1L15.6 5.5l2.9 2.9L14.9 12H20v4h-5.1l3.6 3.6-2.9 2.9L12 18.9V24h-4v-5.1L4.4 22.5 1.5 19.6 5.1 16H0v-4h5.1L1.5 8.4l2.9-2.9L8 9.1V4h4z"
            fill="#ff4f00"
            transform="scale(.85) translate(2 0)"
          />
        </svg>
      );
    case "sheets":
      return (
        <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
          <rect x="5" y="2" width="14" height="20" rx="2" fill="#188038" />
          <path d="M8.5 9h7M8.5 13h7M8.5 17h7M12 9v8" stroke="#fff" strokeWidth="1.3" />
        </svg>
      );
    default:
      return null;
  }
}

const ROW_A = ["gmail", "gcal", "drive", "dropbox", "github", "figma"];
const ROW_B = ["slack", "stripe", "square", "qb", "zapier", "sheets"];

function Marquee({ names, reverse }: { names: string[]; reverse?: boolean }) {
  return (
    <div className="overflow-hidden">
      <div
        className={`flex w-max items-center gap-3 will-change-transform ${
          reverse ? "int-track-b" : "int-track-a"
        }`}
      >
        {[0, 1].map((copy) => (
          <div key={copy} aria-hidden={copy === 1} className="flex items-center gap-3 pr-3">
            {names.map((n) => (
              <span key={n} className={TILE}>
                <Icon name={n} />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function IntegrationsMobile() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    gsap.registerPlugin(ScrollTrigger);

    const a = root.querySelector<HTMLElement>(".int-track-a");
    const b = root.querySelector<HTMLElement>(".int-track-b");
    if (!a || !b) return;

    const loopA = gsap.to(a, { xPercent: -50, ease: "none", duration: 30, repeat: -1 });
    gsap.set(b, { xPercent: -50 });
    const loopB = gsap.to(b, { xPercent: 0, ease: "none", duration: 34, repeat: -1 });
    const loops = [loopA, loopB];

    // Scroll velocity accelerates both marquees, then they ease back
    const st = ScrollTrigger.create({
      trigger: root,
      start: "top bottom",
      end: "bottom top",
      onUpdate(self) {
        const boost = Math.min(Math.abs(self.getVelocity()) / 300, 3);
        loops.forEach((loop) =>
          gsap
            .timeline({ overwrite: true })
            .to(loop, { timeScale: 1 + boost, duration: 0.2 })
            .to(loop, { timeScale: 1, duration: 1, ease: "power2.out" })
        );
      },
    });

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      loops.forEach((l) => l.pause());
    }

    return () => {
      st.kill();
      loops.forEach((l) => l.kill());
    };
  }, []);

  return (
    <div ref={rootRef} className="w-full lg:hidden">
      {/* Counter-scrolling tile rows */}
      <div className="-mx-5 space-y-3 py-1">
        <Marquee names={ROW_A} />
        <Marquee names={ROW_B} reverse />
      </div>

      <div className="mt-7 text-center">
        <h2 className="text-[24px] font-bold tracking-[-0.015em] text-lp-ink">
          Connected to 50+ apps
        </h2>
        <p className="mt-2 text-[15px] text-slate-500">
          Payments, calendars, files, and books — synced to every job.
        </p>
      </div>
    </div>
  );
}
