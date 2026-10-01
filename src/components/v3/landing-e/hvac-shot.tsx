"use client";

/* ============================================================
   HVAC — address, house, load, system
   ============================================================
   The `?industry=hvac` hero's product shot and a slide of the estimators
   showcase (2026-10-01). One module, two stages, like the roof and the fence.

   It plays itself (address typed → house card → load → system, on the
   showcase kit's clock) and it TAKES A HAND: the address field offers three
   houses, the step strip jumps between steps, the tiers and the size / SEER2
   switches reprice the system. The first touch stops the clock; nothing
   leaves the browser — every figure comes from hvac-demo.ts, which is a copy
   of the estimator's sums on three made-up Seattle-area houses. The window
   says "example" where a figure is one.

   The drawing is the estimator's own idea of a house — a plan with its
   zones, the trunk and runs, the outdoor unit on its pad — drawn here in
   blueprint ink and blue, no photo. The whole window reads on a 390 screen
   with no scrolling inside it: the plan is the stage, the controls stack
   under it as the takeoff rail does on the other shots. */

import { useCallback, useEffect, useRef, useState } from "react";
import { Counter } from "./counter";
import { REGISTER } from "./routes";
import { trackTraffic } from "@/lib/traffic-client";
import { TRAFFIC_EVENTS } from "@/lib/traffic-contract";
import {
  AppFrame,
  BLUE,
  EASE,
  INK,
  Prompt,
  Rail,
  READ_HOLD,

  STAGE,
  Stat,
  TYPE_BEAT,
  TYPE_LEAD,
  TYPE_MS,
  typedAt,
  usePhases,
  useTyped,
} from "./showcase-kit";
import {
  DEMO_DEFAULT,
  DEMO_HOUSES,
  SEER_STEPS,
  TIERS,
  TIER_ORDER,
  WA_INCENTIVES,
  demoLoad,
  demoSystem,
  fmtMoney,
  type DemoHouse,
  type HvacTier,
} from "./hvac-demo";

/* THE CLOCK. Address typed and a beat → the house card; then the load; then
   the system on the Better tier; then it holds. Derived from the typed
   length so the field never lifts mid-word, like the roof's. */
const LIFT = typedAt(DEMO_DEFAULT.address.length) + TYPE_BEAT;
const MARKS = [LIFT, LIFT + 1700, LIFT + 3900];
export const HVAC_TIMELINE = {
  marks: MARKS,
  done: MARKS[2] + 1400,
  slide: MARKS[2] + 1400 + READ_HOLD,
};

type Step = 0 | 1 | 2 | 3;
const STEPS: Array<[Step, string]> = [
  [0, "Address"],
  [1, "House"],
  [2, "Load"],
  [3, "System"],
];

/* ── the plan ──────────────────────────────────────────────
   One 420×280 box, the stage's own units. The house is a 3:2 rectangle whose
   width follows the footprint (the engine's own 3:2 assumption), so the
   three houses draw at three sizes. */
const PLAN = { cx: 190, cy: 142, maxW: 300, maxH: 196 };

function planFor(h: DemoHouse) {
  const footprint = h.sqft / h.storeys;
  const k = Math.sqrt(footprint / 1320); // the Kirkland house fills the box
  const w = Math.min(PLAN.maxW, PLAN.maxW * k);
  const hh = Math.min(PLAN.maxH, PLAN.maxH * k);
  const x = PLAN.cx - w / 2;
  const y = PLAN.cy - hh / 2;
  // Zones: the first takes a column on the left; the rest share the right column.
  const zones: Array<{ name: string; x: number; y: number; w: number; h: number; sqft: number }> = [];
  const first = h.zones[0];
  const rest = h.zones.slice(1);
  const fw = w * (rest.length ? first.share : 1);
  zones.push({ name: first.name, x, y, w: fw, h: hh, sqft: Math.round(h.sqft * first.share) });
  let cy = y;
  const restShare = rest.reduce((a, z) => a + z.share, 0) || 1;
  for (const z of rest) {
    const zh = hh * (z.share / restShare);
    zones.push({ name: z.name, x: x + fw, y: cy, w: w - fw, h: zh, sqft: Math.round(h.sqft * z.share) });
    cy += zh;
  }
  const widthFt = Math.round(Math.sqrt(footprint * 1.5));
  return { x, y, w, h: hh, zones, widthFt };
}

/** The plan: outline, zones, the trunk and runs, the outdoor unit. */
function HousePlan({ house, step, hero }: { house: DemoHouse; step: Step; hero: boolean }) {
  const p = planFor(house);
  const drawn = step >= 1;
  const loaded = step >= 2;
  const system = step >= 3;
  const ah = { x: p.x + 14, y: p.y + p.h - 26, s: 16 }; // the air handler, in a closet
  const trunkY = ah.y + ah.s / 2;
  const ducted = house.ducts.location !== "none";
  const ou = { x: p.x + p.w + 16, y: p.y + p.h * 0.58, s: 26 }; // the outdoor unit on its pad
  const dash = (on: boolean, delay = 0, len = 1): React.CSSProperties => ({
    strokeDasharray: len,
    strokeDashoffset: on ? 0 : len,
    transition: `stroke-dashoffset .8s ${EASE} ${delay}ms`,
  });
  return (
    <svg viewBox="0 0 420 280" className="absolute inset-0 h-full w-full" aria-hidden>
      {/* the drafting grid of the stage */}
      <defs>
        <pattern id="hv-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke={INK} strokeOpacity="0.07" strokeWidth="0.6" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="420" height="280" fill="url(#hv-grid)" />
      <text x="14" y="20" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="8.5" fontWeight="700" fill={INK} fillOpacity="0.55" letterSpacing="1.2">
        N ↑ · PLAN · {house.storeys === 2 ? "2 STOREYS" : "1 STOREY"}
      </text>

      {/* zones: tinted by their share once the load is in */}
      {p.zones.map((z, i) => (
        <g key={z.name}>
          <rect x={z.x} y={z.y} width={z.w} height={z.h} fill={BLUE} fillOpacity={loaded ? 0.06 + i * 0.04 : 0} style={{ transition: "fill-opacity .6s ease" }} />
          <text x={z.x + 8} y={z.y + 15} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize={hero ? 8 : 8.5} fontWeight="700" fill={INK} opacity={drawn ? 1 : 0} style={{ transition: `opacity .4s ease ${300 + i * 120}ms` }}>
            {z.name.toUpperCase()}
          </text>
          <text x={z.x + 8} y={z.y + 26} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="8" fill={INK} fillOpacity="0.6" opacity={drawn ? 1 : 0} style={{ transition: `opacity .4s ease ${380 + i * 120}ms` }}>
            {z.sqft.toLocaleString("en-US")} sq ft
          </text>
        </g>
      ))}
      {/* partitions */}
      <g stroke={INK} strokeWidth="1.2" strokeDasharray="4 3" fill="none">
        {p.zones.slice(1).map((z, i) => (
          <g key={z.name}>
            {i === 0 && <path d={`M${z.x} ${p.y} V${p.y + p.h}`} pathLength={1} style={dash(drawn, 500)} />}
            {i > 0 && <path d={`M${z.x} ${z.y} H${z.x + z.w}`} pathLength={1} style={dash(drawn, 600)} />}
          </g>
        ))}
      </g>
      {/* the outline, traced */}
      <rect x={p.x} y={p.y} width={p.w} height={p.h} fill="none" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" pathLength={1} style={dash(drawn)} />
      {/* the footprint dimension */}
      <g opacity={drawn ? 1 : 0} style={{ transition: "opacity .5s ease .7s" }}>
        <path d={`M${p.x} ${p.y + p.h + 12} H${p.x + p.w}`} stroke={INK} strokeWidth="1" />
        <path d={`M${p.x} ${p.y + p.h + 8} v8 M${p.x + p.w} ${p.y + p.h + 8} v8`} stroke={INK} strokeWidth="1" />
        <rect x={p.x + p.w / 2 - 22} y={p.y + p.h + 4} width="44" height="15" fill="#fff" stroke={INK} strokeWidth="1.2" />
        <text x={p.x + p.w / 2} y={p.y + p.h + 15} textAnchor="middle" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="8.5" fontWeight="700" fill={INK}>
          {p.widthFt}&apos;-0&quot;
        </text>
      </g>

      {/* the air handler and the runs — or, with no ducts, the wall heads */}
      {ducted ? (
        <g>
          <rect x={ah.x} y={ah.y} width={ah.s} height={ah.s} fill="#fff" stroke={loaded ? BLUE : INK} strokeWidth="1.6" opacity={loaded ? 1 : 0} style={{ transition: "opacity .4s ease" }} />
          <text x={ah.x + ah.s / 2} y={ah.y + ah.s / 2 + 3} textAnchor="middle" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="7" fontWeight="800" fill={BLUE} opacity={loaded ? 1 : 0} style={{ transition: "opacity .4s ease" }}>
            AH
          </text>
          <g stroke={BLUE} strokeWidth="1.8" fill="none" strokeLinecap="round">
            {/* trunk along the back wall */}
            <path d={`M${ah.x + ah.s} ${trunkY} H${p.x + p.w - 18}`} pathLength={1} style={dash(loaded, 150)} />
            {/* a run up into each zone, a register at its end */}
            {p.zones.map((z, i) => {
              const rx = Math.min(p.x + p.w - 18, Math.max(ah.x + ah.s + 10, z.x + z.w / 2));
              const ry = z.y + z.h / 2;
              return <path key={z.name} d={`M${rx} ${trunkY} V${ry} h-6 m6 0 h6`} pathLength={1} style={dash(loaded, 450 + i * 160)} />;
            })}
          </g>
        </g>
      ) : (
        <g stroke={BLUE} strokeWidth="1.8" fill="#fff">
          {p.zones.map((z, i) => (
            <rect key={z.name} x={z.x + z.w - 26} y={z.y + 6} width="20" height="8" rx="1" opacity={loaded ? 1 : 0} style={{ transition: `opacity .4s ease ${200 + i * 160}ms` }} />
          ))}
        </g>
      )}

      {/* the outdoor unit on its pad, and the line set through the wall */}
      <g opacity={system ? 1 : 0} style={{ transition: "opacity .5s ease .15s" }}>
        <rect x={ou.x} y={ou.y} width={ou.s} height={ou.s} fill="#fff" stroke={INK} strokeWidth="1.8" />
        <circle cx={ou.x + ou.s / 2} cy={ou.y + ou.s / 2} r={ou.s * 0.32} fill="none" stroke={INK} strokeWidth="1.4" />
        <path d={`M${ou.x + ou.s / 2} ${ou.y + ou.s / 2 - 6} v12 M${ou.x + ou.s / 2 - 6} ${ou.y + ou.s / 2} h12`} stroke={INK} strokeWidth="1.2" />
        <path d={`M${ou.x} ${ou.y + ou.s / 2} H${p.x + p.w}`} stroke={BLUE} strokeWidth="1.6" strokeDasharray="3 2" fill="none" />
        <text x={ou.x + ou.s / 2} y={ou.y + ou.s + 11} textAnchor="middle" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="7.5" fontWeight="700" fill={INK}>
          HEAT PUMP
        </text>
      </g>
    </svg>
  );
}

/* ── a segmented switch, the kit's look ──────────────────── */
function Seg<T extends string | number>({ label, value, options, onPick, fmt }: { label: string; value: T; options: readonly T[]; onPick: (v: T) => void; fmt?: (v: T) => string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-[10.5px] text-ink-muted">{label}</span>
      <div className="flex rounded-[2px] border border-ink" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o)}
            type="button"
            aria-pressed={o === value}
            onClick={() => onPick(o)}
            className={`min-h-[30px] px-2 font-mono text-[10.5px] font-bold transition-colors ${o === value ? "bg-ink text-white" : "bg-white text-ink hover:bg-lp-paper"}`}
          >
            {fmt ? fmt(o) : String(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function HvacShot({ active, instant = false, hero = false }: { active: boolean; instant?: boolean; hero?: boolean }) {
  // Where the visitor took it: null while the clock runs the sequence.
  const [manual, setManual] = useState<Step | null>(null);
  const [houseId, setHouseId] = useState(DEMO_DEFAULT.id);
  const [tier, setTier] = useState<HvacTier>("mid");
  const [tonsPick, setTonsPick] = useState<number | null>(null);
  const [seerPick, setSeerPick] = useState<number | null>(null);
  const house = DEMO_HOUSES.find((h) => h.id === houseId) ?? DEMO_DEFAULT;

  const phase = usePhases(HVAC_TIMELINE.marks, active && manual === null, instant);
  const typed = useTyped(DEMO_DEFAULT.address, active && manual === null, TYPE_MS, instant, TYPE_LEAD);
  const autoStep: Step = typed.length < DEMO_DEFAULT.address.length ? 0 : (Math.min(3, phase) as Step);
  const step: Step = manual ?? autoStep;
  const address = manual !== null || step > 0 ? house.address : typed;

  const load = demoLoad(house);
  const tons = tonsPick ?? load.targetTons;
  const seer2 = seerPick ?? TIERS[tier].seer2;
  const system = demoSystem(house, load, tier, tons, seer2);
  const t = TIERS[tier];

  // One event when the sequence plays through on its own; one per touch.
  const played = useRef(false);
  useEffect(() => {
    if (manual === null && autoStep === 3 && !played.current) {
      played.current = true;
      trackTraffic(TRAFFIC_EVENTS.hvacDemoStep, { step: "system", how: "auto", hero, industry: "hvac", variant: "e" });
    }
  }, [autoStep, manual, hero]);
  const go = useCallback(
    (s: Step) => {
      setManual(s);
      trackTraffic(TRAFFIC_EVENTS.hvacDemoStep, { step: STEPS[s][1].toLowerCase(), how: "tap", hero, industry: "hvac", variant: "e" });
    },
    [hero],
  );
  const pickHouse = (h: DemoHouse) => {
    setHouseId(h.id);
    setTonsPick(null);
    go(1);
  };
  const pickTier = (k: HvacTier) => {
    setTier(k);
    setSeerPick(null);
    setManual(3);
    trackTraffic(TRAFFIC_EVENTS.hvacDemoTier, { tier: TIERS[k].name.toLowerCase(), tons, hero, industry: "hvac", variant: "e" });
  };

  const lifted = step >= 1;
  const stageBg = step >= 3 ? "#f6f7f5" : "#eef0ee";
  const tonOptions = [Math.max(1.5, load.targetTons - 0.5), load.targetTons, load.targetTons + 0.5];
  const railTitle = step <= 1 ? "The house" : step === 2 ? "Design load" : "The system";
  const maxPart = Math.max(...load.parts.map((p) => Math.max(p.heating, p.cooling)), 1);

  return (
    <AppFrame path="app.jobflex.com/estimators/hvac" body={stageBg}>
      <div className="relative" data-hvac-window data-step={step}>
        <Prompt label="Address" value={address} lifted={lifted} search />
        {/* the three houses, offered under the field while it is centre stage */}
        {step === 0 && (
          <div
            // The same box, offset and zoom as the prompt at rest (showcase-kit
            // Prompt), so the list hangs exactly under the field at every width.
            className="absolute left-0 right-0 z-30 px-3 [--prompt-dx:0px] [--prompt-top:74px] [--prompt-zoom:1] sm:right-[260px] sm:px-5 sm:[--prompt-dx:130px] sm:[--prompt-top:148px] sm:[--prompt-zoom:1.15]"
            style={{
              top: "calc(var(--prompt-top) + 46px)",
              transform: "translate(var(--prompt-dx), 0) scale(var(--prompt-zoom))",
              transformOrigin: "center top",
              animation: `toast-in .4s ${EASE} backwards`,
            }}
          >
            <div className="mx-auto w-full max-w-[640px] rounded-[3px] border-2 border-ink bg-white shadow-[0_18px_40px_-18px_rgba(10,10,10,.35)]" role="listbox" aria-label="Addresses">
              {DEMO_HOUSES.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  role="option"
                  aria-selected={h.id === houseId}
                  onClick={() => pickHouse(h)}
                  className="flex w-full items-center justify-between gap-3 border-b border-black/10 px-3 py-2 text-left last:border-0 hover:bg-lp-paper sm:px-4 sm:py-2.5"
                  data-hvac-house={h.id}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[11.5px] font-semibold text-ink sm:text-[13px]">{h.address}</span>
                    <span className="block truncate font-mono text-[9px] text-ink-muted sm:text-[10px]">{h.town} · {h.sqft.toLocaleString("en-US")} sq ft · {h.year}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-ink-muted">example</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_260px]">
          <div className={hero ? `${STAGE} lp-hero-stage lp-hvac-stage` : `${STAGE} lp-hvac-stage`} style={{ background: stageBg, transition: "background .9s ease" }}>
            <div className="lp-hvac-plan absolute" style={{ opacity: lifted ? 1 : 0.35, transition: "opacity .6s ease" }}>
              <HousePlan house={house} step={step} hero={hero} />
            </div>

            {/* the house card, once the address is in */}
            <div
              className="absolute left-3 right-3 top-[52px] z-20 sm:left-5 sm:right-auto sm:top-[60px] sm:max-w-[250px]"
              style={lifted ? { animation: `toast-in .45s ${EASE} 150ms backwards` } : { opacity: 0, pointerEvents: "none" }}
            >
              <div className="rounded-[2px] border-2 border-ink bg-white px-2.5 py-1.5 sm:px-3 sm:py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[8.5px] font-black uppercase tracking-[0.16em] text-ink-muted">House · {house.county} County</span>
                  <span className="font-mono text-[8.5px] text-ink-muted">{load.coolingF}° / {load.heatingF}° design</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0 text-[11px] font-semibold text-ink sm:text-[12px]">
                  <span>{house.sqft.toLocaleString("en-US")} sq ft</span>
                  <span>built {house.year}</span>
                  <span>{house.zones.length} zones</span>
                  <span>{house.storeys === 2 ? "2 storeys" : "1 storey"}</span>
                </div>
              </div>
            </div>

            {/* the equipment card, over the floor of the plan, once the system is picked */}
            <div
              className="absolute bottom-2.5 left-3 right-3 z-20 sm:bottom-4 sm:left-5 sm:right-5"
              style={step >= 3 ? { animation: `toast-in .45s ${EASE} 250ms backwards` } : { opacity: 0, pointerEvents: "none" }}
              data-hvac-equipment
            >
              <div className="flex items-center gap-3 rounded-[2px] border-2 border-ink bg-white px-2.5 py-2 sm:px-3">
                {/* the unit, drawn */}
                <svg viewBox="0 0 36 36" className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" aria-hidden>
                  <rect x="3" y="5" width="30" height="26" rx="1.5" fill="none" stroke={INK} strokeWidth="2" />
                  <circle cx="18" cy="18" r="8" fill="none" stroke={BLUE} strokeWidth="1.8" />
                  <path d="M18 11v14M11 18h14" stroke={BLUE} strokeWidth="1.4" />
                </svg>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[11.5px] font-bold text-ink sm:text-[12.5px]">
                      {system.tons}-ton · {t.name} · {t.staging === "variable" ? "variable" : t.staging === "two-stage" ? "two-stage" : "single-stage"}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] font-bold" style={{ color: BLUE }}>
                      {system.seer2} SEER2 · {system.hspf2} HSPF2
                    </span>
                  </div>
                  {/* the SEER2 scale: the floor, the tiers, this unit */}
                  <div className="relative mt-1.5 h-[6px] rounded-full bg-black/10" aria-hidden>
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, ((system.seer2 - 13) / 10) * 100)}%`, background: BLUE, transition: `width .5s ${EASE}` }} />
                    {SEER_STEPS.map((s) => (
                      <span key={s} className="absolute top-1/2 h-[10px] w-[1.5px] -translate-y-1/2 bg-ink/40" style={{ left: `${((s - 13) / 10) * 100}%` }} />
                    ))}
                  </div>
                  <div className="mt-0.5 flex justify-between font-mono text-[8px] text-ink-muted">
                    <span>13 SEER2</span>
                    <span className="truncate px-1 text-ink">{system.heatNote}</span>
                    <span>23</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Rail title={railTitle} shown={lifted}>
            {/* the steps, as a strip the visitor can walk */}
            <div className="flex gap-1" role="tablist" aria-label="Steps" data-hvac-steps>
              {STEPS.map(([s, label]) => (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={s === step}
                  onClick={() => go(s)}
                  className={`flex-1 rounded-[2px] border px-1 py-[5px] font-mono text-[8.5px] font-bold uppercase tracking-[0.1em] ${s === step ? "border-ink bg-ink text-white" : s < step ? "border-ink bg-white text-ink" : "border-black/20 bg-white text-ink-muted"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {step <= 1 && (
              <>
                <Stat k="Conditioned area" v={`${house.sqft.toLocaleString("en-US")} sq ft`} accent />
                <Stat k="Built" v={`${house.year} · ${house.storeys === 2 ? "2 storeys" : "1 storey"}`} />
                <Stat k="Envelope" v={load.envelope.split(" · ")[0]} />
                <Stat k="What is there" v={house.existing.label.split(",")[0]} />
                <Stat k="Ducts" v={house.ducts.label.split(",")[0].replace("Ducts in the ", "")} />
                <Stat k="Design day" v={`${load.coolingF} °F / ${load.heatingF} °F`} />
                <button type="button" onClick={() => go(2)} className="lp-btn-dark mt-3 w-full !py-2 !text-[11px]" data-hvac-next="load">
                  Calculate the load →
                </button>
              </>
            )}

            {step === 2 && (
              <>
                {load.parts.filter((p) => p.heating > 0).map((p, i) => (
                  <div key={p.name} className="border-b border-black/[0.08] pb-1.5 last:border-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[10.5px] text-ink-muted">{p.name}</span>
                      <span className="shrink-0 font-mono text-[10.5px] font-bold text-ink">{p.heating.toLocaleString("en-US")}</span>
                    </div>
                    <div className="mt-1 h-[5px] rounded-full bg-black/10" aria-hidden>
                      <div className="h-full rounded-full" style={{ width: `${(p.heating / maxPart) * 100}%`, background: BLUE, transition: `width .9s ${EASE} ${120 + i * 110}ms` }} />
                    </div>
                  </div>
                ))}
                <div className="mt-3 rounded-[2px] bg-ink px-3 py-2.5" data-hvac-load>
                  <div className="text-[9px] font-black uppercase tracking-[0.16em] text-white/45">Heating load · {load.heatingF} °F</div>
                  <div className="mt-0.5 font-mono text-[18px] font-black text-white">
                    <Counter value={load.heatingBtuh.toLocaleString("en-US")} /> <span className="text-[11px] font-bold text-white/60">BTU/h</span>
                  </div>
                  <div className="mt-1 flex justify-between font-mono text-[9.5px] text-white/70">
                    <span>cooling {load.coolingBtuh.toLocaleString("en-US")}</span>
                    <span>{load.targetTons} ton · {load.cfm.toLocaleString("en-US")} CFM</span>
                  </div>
                </div>
                <button type="button" onClick={() => go(3)} className="lp-btn-dark mt-3 w-full !py-2 !text-[11px]" data-hvac-next="system">
                  Pick the system →
                </button>
              </>
            )}

            {step >= 3 && (
              <>
                {/* Good · Better · Best */}
                <div className="grid grid-cols-3 gap-1" role="group" aria-label="Tier" data-hvac-tiers>
                  {TIER_ORDER.map((k) => {
                    const tt = TIERS[k];
                    const on = k === tier;
                    return (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={on}
                        onClick={() => pickTier(k)}
                        className={`rounded-[2px] border-2 px-1 py-1.5 text-center transition-colors ${on ? "border-ink bg-ink text-white" : "border-ink bg-white text-ink hover:bg-lp-paper"}`}
                        data-hvac-tier={k}
                      >
                        <span className="block text-[11px] font-black">{tt.name}</span>
                        <span className={`block font-mono text-[8.5px] ${on ? "text-white/70" : "text-ink-muted"}`}>{tt.seer2} SEER2</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] leading-[1.35] text-ink-muted">{t.blurb}.</p>
                <Seg label="Size" value={tons} options={tonOptions} onPick={(v) => { setTonsPick(v); trackTraffic(TRAFFIC_EVENTS.hvacDemoTier, { tier: t.name.toLowerCase(), tons: v, seer2, hero, industry: "hvac", variant: "e" }); }} fmt={(v) => `${v} t`} />
                <Seg label="SEER2" value={seer2} options={SEER_STEPS} onPick={(v) => { setSeerPick(v); trackTraffic(TRAFFIC_EVENTS.hvacDemoTier, { tier: t.name.toLowerCase(), tons, seer2: v, hero, industry: "hvac", variant: "e" }); }} />
                <div className={`flex items-center justify-between font-mono text-[9.5px] ${system.fitOk ? "text-ink-muted" : "text-[#8a2a1c]"}`}>
                  <span>Manual S fit</span>
                  <span className="font-bold">{system.fitPct}% of the cooling load{system.fitOk ? "" : " — outside the window"}</span>
                </div>
                <div className="rounded-[2px] bg-ink px-3 py-2.5" data-hvac-total={system.total}>
                  <div className="text-[9px] font-black uppercase tracking-[0.16em] text-white/45">Estimate · installed</div>
                  <div className="mt-0.5 font-mono text-[19px] font-black text-white">
                    <Counter key={system.total} value={fmtMoney(system.total)} />
                  </div>
                  <div className="mt-1 flex justify-between font-mono text-[9.5px] text-white/70">
                    <span>equipment {fmtMoney(system.equipment)}</span>
                    <span>labor {fmtMoney(system.labor)}</span>
                  </div>
                </div>
                <div className="flex items-baseline justify-between gap-2 border-b border-black/[0.08] pb-2" data-hvac-savings={system.savings}>
                  <span className="text-[10.5px] text-ink-muted">Year&apos;s bill · example</span>
                  <span className="font-mono text-[11px] font-bold text-ink">
                    {fmtMoney(system.billBefore)} → <span style={{ color: BLUE }}>{fmtMoney(system.billAfter)}</span>
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2 border-b border-black/[0.08] pb-2">
                  <span className="text-[10.5px] text-ink-muted">Saves a year</span>
                  <span className="font-mono text-[12.5px] font-bold" style={{ color: BLUE }}>
                    {fmtMoney(system.savings)}
                  </span>
                </div>
                {/* Washington: what the estimator says about incentives on the design day */}
                <div className="rounded-[2px] border border-ink/25 bg-white px-2.5 py-2" data-hvac-incentives>
                  <div className="font-mono text-[8.5px] font-black uppercase tracking-[0.14em] text-ink-muted">{WA_INCENTIVES.state} · incentives</div>
                  {WA_INCENTIVES.lines.map((l) => (
                    <div key={l.k} className="mt-1 flex items-baseline justify-between gap-2 text-[10px]">
                      <span className="truncate text-ink">{l.k}</span>
                      <span className="shrink-0 font-mono text-[9.5px] font-bold text-ink" title={l.note}>
                        {l.v}
                      </span>
                    </div>
                  ))}
                </div>
                <a href={`${REGISTER}?industry=hvac`} className="lp-btn-dark mt-1 w-full !py-2 !text-[11px]" data-cta="hero-window">
                  Estimate ready → proposal
                </a>
              </>
            )}
          </Rail>
        </div>
      </div>
    </AppFrame>
  );
}
