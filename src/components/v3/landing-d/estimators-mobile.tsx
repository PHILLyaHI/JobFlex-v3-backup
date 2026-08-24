"use client";

import { useEffect, useState } from "react";
import { AppWindow, CardLabel } from "./app-window";
import { Reveal } from "./reveal";
import { useInView } from "./use-in-view";

/* ---- 1 · Smart Estimator: AI drafting a proposal ---- */

const DRAFT_ROWS = [
  ["Cabinets — maple shaker, 14 ln ft", "$8,400"],
  ["Quartz countertop, 42 sf", "$2,436"],
  ["Labor — demo & install", "$8,960"],
  ["Permits & disposal", "$410"],
] as const;

function SmartCard() {
  const { ref, inView } = useInView<HTMLDivElement>(0.45);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => setShown(DRAFT_ROWS.length));
      return () => cancelAnimationFrame(id);
    }
    let n = 0;
    const cycle = setInterval(() => {
      n = n >= DRAFT_ROWS.length ? 0 : n + 1;
      setShown(n);
    }, n === 0 ? 700 : 700);
    return () => clearInterval(cycle);
  }, [inView]);

  const total = [8400, 2436, 8960, 410].slice(0, shown).reduce((a, b) => a + b, 0);

  return (
    <div ref={ref}>
      <CardLabel>Smart Estimator</CardLabel>
      <AppWindow title="app.jobflex.com/estimates/new" className="mt-3">
        <div className="px-4 py-4">
          <div className="flex items-center gap-2 rounded-lg bg-lp-paper px-3 py-2.5 ring-1 ring-slate-200">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-lp-blurple" aria-hidden>
              <path d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13l-1.6-4.4L2 7l4.4-1.6L8 1z" fill="currentColor" />
            </svg>
            <span className="truncate text-[12.5px] text-lp-ink">Remodel a 10×10 kitchen</span>
          </div>

          <div className="mt-3 space-y-[6px]">
            {DRAFT_ROWS.map(([l, r], i) => (
              <div
                key={l}
                className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-[12px]"
                style={{
                  opacity: i < shown ? 1 : 0.25,
                  transform: i < shown ? "none" : "translateY(3px)",
                  transition: "opacity .35s ease, transform .35s ease",
                }}
              >
                <span className={i < shown ? "text-slate-600" : "text-slate-300"}>{l}</span>
                <span className={`font-semibold ${i < shown ? "text-lp-ink" : "text-slate-300"}`}>{r}</span>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
              <span className={`h-1.5 w-1.5 rounded-full ${shown >= 4 ? "bg-emerald-500" : "animate-pulse bg-lp-blurple"}`} />
              {shown >= 4 ? "Draft proposal ready" : "AI drafting line items…"}
            </span>
            <span key={total} className="text-[17px] font-bold tracking-tight text-lp-ink" style={{ animation: "toast-in .3s" }}>
              ${total.toLocaleString("en-US")}
            </span>
          </div>
        </div>
      </AppWindow>
    </div>
  );
}

/* ---- 2 · Roof Estimator: 3D blueprint with measurements ---- */

function RoofCard() {
  return (
    <div>
      <CardLabel>Roof Estimator</CardLabel>
      <AppWindow title="app.jobflex.com/estimates/roof" className="mt-3">
        <div className="relative">
          <svg viewBox="0 0 360 230" className="block w-full" aria-hidden>
            <defs>
              <pattern id="bp-dots" width="14" height="14" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill="#e2e8f0" />
              </pattern>
              <linearGradient id="roof-front" x1="0" y1="0" x2="0.4" y2="1">
                <stop offset="0%" stopColor="#c9cffb" />
                <stop offset="100%" stopColor="#b3bbf7" />
              </linearGradient>
              <linearGradient id="roof-side" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#9aa3f0" />
                <stop offset="100%" stopColor="#8890e4" />
              </linearGradient>
            </defs>
            <rect width="360" height="230" fill="#fbfcfe" />
            <rect width="360" height="230" fill="url(#bp-dots)" />

            {/* ground shadow */}
            <ellipse cx="178" cy="196" rx="132" ry="14" fill="#0f172a" opacity="0.07" />

            {/* 3D house — walls below the eaves */}
            <g strokeLinejoin="round">
              <polygon points="52,124 186,156 186,188 52,156" fill="#f4f5f9" stroke="#c7cbd6" strokeWidth="1" />
              <polygon points="186,156 306,122 306,154 186,188" fill="#e6e8f0" stroke="#c7cbd6" strokeWidth="1" />
              {/* door + window hints */}
              <rect x="104" y="146" width="18" height="30" rx="1.5" fill="#d8dbe6" transform="translate(104 146) skewY(13.4) translate(-104 -146)" />
              <rect x="222" y="152" width="22" height="14" rx="1.5" fill="#d8dbe6" transform="translate(222 152) skewY(-15.8) translate(-222 -152)" />

              {/* hip roof — three visible shaded planes */}
              <polygon points="52,124 132,66 238,90 186,156" fill="url(#roof-front)" stroke="#4f46b8" strokeWidth="1.5" />
              <polygon points="186,156 238,90 306,122" fill="url(#roof-side)" stroke="#4f46b8" strokeWidth="1.5" />
              <polygon points="52,124 132,66 118,72 46,118" fill="#e2e5fd" stroke="#4f46b8" strokeWidth="1" opacity="0.9" />
              {/* ridge */}
              <line x1="132" y1="66" x2="238" y2="90" stroke="#3f388f" strokeWidth="2.5" strokeLinecap="round" />
              {/* shingle course lines on the front plane */}
              {[0.25, 0.5, 0.75].map((t) => (
                <line
                  key={t}
                  x1={52 + (132 - 52) * t}
                  y1={124 + (66 - 124) * t}
                  x2={186 + (238 - 186) * t}
                  y2={156 + (90 - 156) * t}
                  stroke="#7d84d9"
                  strokeWidth="0.9"
                  opacity="0.8"
                />
              ))}
            </g>

            {/* scanner nodes at measured corners */}
            {[
              [52, 124],
              [186, 156],
              [306, 122],
              [132, 66],
              [238, 90],
            ].map(([x, y]) => (
              <g key={`${x}-${y}`}>
                <circle cx={x} cy={y} r="5" fill="#ffffff" stroke="#635bff" strokeWidth="1.5" />
                <circle cx={x} cy={y} r="1.8" fill="#635bff" />
              </g>
            ))}

            {/* measurement overlays */}
            <g stroke="#635bff" strokeWidth="1.2" fill="#635bff">
              <line x1="44" y1="168" x2="178" y2="200" strokeDasharray="4 3" />
              <polygon points="44,168 50,166 48,173" />
              <polygon points="178,200 171,201 174,194" />
              <line x1="196" y1="200" x2="314" y2="166" strokeDasharray="4 3" />
              <polygon points="196,200 203,201 200,194" />
              <polygon points="314,166 308,164 310,171" />
              {/* rise callout at the ridge */}
              <line x1="252" y1="86" x2="272" y2="66" strokeDasharray="3 3" strokeWidth="1" />
            </g>
            <g fontFamily="var(--font-sans)" fontSize="11" fontWeight="700" fill="#0f172a">
              <text x="88" y="194" transform="rotate(13 88 194)">38′ 4″</text>
              <text x="242" y="196" transform="rotate(-16 242 196)">24′ 0″</text>
            </g>
            <g>
              <rect x="266" y="52" width="62" height="20" rx="6" fill="#635bff" />
              <text x="297" y="66" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="11" fontWeight="700" fill="#ffffff">
                6/12 pitch
              </text>
            </g>
          </svg>

          {/* measurement chips */}
          <div className="absolute left-3 top-3 rounded-md bg-white px-2.5 py-1.5 text-[10.5px] font-bold text-lp-ink shadow-sm ring-1 ring-slate-200">
            17.6 squares <span className="font-medium text-slate-400">· incl. 10% waste</span>
          </div>
          <div className="absolute bottom-3 right-3 rounded-md bg-lp-ink px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm">
            Estimate: $13,190
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-[11px]">
          <span className="text-slate-400">EagleView geometry imported</span>
          <span className="font-semibold text-lp-blurple">Build proposal →</span>
        </div>
      </AppWindow>
    </div>
  );
}

/* ---- 3 · Fence Estimator: fence line over a satellite map ---- */

function FenceCard() {
  const { ref, inView } = useInView<HTMLDivElement>(0.45);
  return (
    <div ref={ref}>
      <CardLabel>Fence Estimator</CardLabel>
      <AppWindow title="app.jobflex.com/estimates/fence" className="mt-3">
        <div className="relative">
          <svg viewBox="0 0 360 220" className="block w-full" aria-hidden>
            {/* aerial yard */}
            <rect width="360" height="220" fill="#4d7c43" />
            <rect width="360" height="220" fill="url(#lawn)" />
            <defs>
              <linearGradient id="lawn" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#5b8a4e" />
                <stop offset="45%" stopColor="#4d7c43" />
                <stop offset="100%" stopColor="#41693a" />
              </linearGradient>
            </defs>
            {/* mower stripes */}
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <rect key={i} x={i * 60} y="0" width="30" height="220" fill="#ffffff" opacity="0.04" />
            ))}
            {/* trees */}
            <circle cx="322" cy="52" r="22" fill="#2f5429" />
            <circle cx="342" cy="78" r="14" fill="#376131" />
            <circle cx="36" cy="188" r="18" fill="#2f5429" />
            {/* house */}
            <g>
              <rect x="24" y="24" width="120" height="86" fill="#8d8f94" rx="2" />
              <rect x="24" y="24" width="120" height="86" fill="none" stroke="#6b6d72" strokeWidth="2" rx="2" />
              <line x1="84" y1="24" x2="84" y2="110" stroke="#77797e" strokeWidth="3" />
              <rect x="30" y="30" width="48" height="34" fill="#a3a5aa" opacity="0.5" />
            </g>
            {/* driveway */}
            <rect x="0" y="118" width="60" height="34" fill="#b8b3a8" />
            {/* patio */}
            <rect x="152" y="40" width="42" height="30" fill="#c7bfae" rx="2" />

            {/* fence path being drawn */}
            <path
              d="M148 118 L332 118 L332 204 L60 204 L60 152"
              fill="none"
              stroke="#ffffff"
              strokeWidth="5"
              opacity="0.25"
              strokeLinejoin="round"
            />
            <path
              d="M148 118 L332 118 L332 204 L60 204 L60 152"
              fill="none"
              stroke="#635bff"
              strokeWidth="3"
              strokeDasharray="8 6"
              strokeLinejoin="round"
              pathLength={1}
              style={{
                strokeDashoffset: inView ? 0 : 1,
                strokeDasharray: inView ? "8 6" : "1 0",
                transition: "stroke-dashoffset 2.2s ease .3s",
              }}
            />
            {/* vertices */}
            {[
              [148, 118],
              [332, 118],
              [332, 204],
              [60, 204],
              [60, 152],
            ].map(([x, y]) => (
              <g key={`${x}-${y}`}>
                <circle cx={x} cy={y} r="6" fill="#ffffff" />
                <circle cx={x} cy={y} r="3.5" fill="#635bff" />
              </g>
            ))}
            {/* gate mark */}
            <rect x="230" y="199" width="26" height="10" rx="2" fill="#ffffff" />
            <text x="243" y="207" textAnchor="middle" fontSize="7" fontWeight="700" fill="#635bff">GATE</text>
          </svg>

          <div className="absolute left-3 top-3 rounded-md bg-white/95 px-2.5 py-1.5 text-[10.5px] font-bold text-lp-ink shadow-sm">
            418 Alder St · satellite
          </div>
          <div
            className="absolute bottom-3 left-3 rounded-md bg-white px-3 py-2 shadow-md ring-1 ring-slate-200"
            style={{ animation: inView ? "toast-in .4s ease 2.4s backwards" : "none" }}
          >
            <div className="text-[10px] font-medium text-slate-400">128 linear ft · cedar, 6 ft</div>
            <div className="text-[15px] font-bold tracking-tight text-lp-ink">
              $7,040 <span className="text-[10px] font-semibold text-emerald-600">live</span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-[11px]">
          <span className="text-slate-400">Draw the line — JobFlex counts the posts</span>
          <span className="font-semibold text-lp-blurple">3D preview →</span>
        </div>
      </AppWindow>
    </div>
  );
}

export function EstimatorsMobile() {
  return (
    <section className="bg-lp-paper px-5 py-16">
      <Reveal>
        <h2 className="text-[30px] font-bold leading-[1.08] tracking-[-0.02em] text-lp-ink">
          Estimates for every job.
        </h2>
      </Reveal>
      <div className="mt-8 space-y-10">
        <Reveal><SmartCard /></Reveal>
        <Reveal><RoofCard /></Reveal>
        <Reveal><FenceCard /></Reveal>
      </div>
    </section>
  );
}
