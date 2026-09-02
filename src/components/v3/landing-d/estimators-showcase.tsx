"use client";

/* ============================================================
   ESTIMATORS SHOWCASE — four sequences, not four pictures
   ============================================================
   Rebuilt as timed demos (owner, 2026-08-24). Each estimator plays the way a
   product video plays it: a state at a time, every change a transition rather
   than a cut, so you watch the work happen instead of reading about it.

     Smart Proposal — prompt alone → lifts away → lines write themselves
     Roof           — address → aerial → outline traces → the SAME outline
                      tilts into perspective and the photo falls away
     Fence          — map → cursor clicks the layer on → parcel → run →
                      the ground tips and walls stand on the run itself
     Video          — recording → pulls back → the read lands as notes on
                      the footage → proposal

   Timing lives in one place per shot (PHASES), and one hook drives them, so a
   sequence can be retimed without touching the markup. Everything moves on
   transform/opacity so it stays on the compositor; the 3D moments are a real
   rotateX on a perspective stage, not a fake skew.

   Hovering the section pauses only the slide auto-advance — never the shot
   itself. Gating the shots on hover froze them mid-sequence the moment the
   cursor wandered in, which read as the animation breaking.
   ============================================================ */

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Reveal } from "./reveal";
import { useInView } from "./use-in-view";

const SLIDE_MS = 9000;

const INK = "#0a0a0a";
const BLUE = "#1854A0";
const SKY = "#4A9EFF";
const HAIR = "rgba(10,10,10,0.12)";
const EASE = "cubic-bezier(.22,.61,.36,1)";

/** True on a handheld column, where the rail sits under the stage rather than
    beside it — the prompt has no rail to slide away from there. */
function useCompact() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return compact;
}

/** Advances through a sequence on its own clock, and rewinds when it restarts. */
function usePhases(marks: number[], active: boolean) {
  const [phase, setPhase] = useState(0);
  const [reduced, setReduced] = useState(false);
  const key = marks.join(",");

  useEffect(() => {
    const id = requestAnimationFrame(() =>
      setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    );
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!active) return;
    if (reduced) {
      const id = requestAnimationFrame(() => setPhase(marks.length));
      return () => cancelAnimationFrame(id);
    }
    const timers = marks.map((ms, i) => setTimeout(() => setPhase(i + 1), ms));
    return () => timers.forEach(clearTimeout);
    // marks is a literal per shot; key keeps the identity stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reduced, key]);

  return phase;
}

/** Types a string out on a fixed cadence once it is allowed to start. */
function useTyped(text: string, active: boolean, speed = 20) {
  const [n, setN] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() =>
      setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    );
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!active) return;
    if (reduced) {
      const id = requestAnimationFrame(() => setN(text.length));
      return () => cancelAnimationFrame(id);
    }
    if (n >= text.length) return;
    const t = setTimeout(() => setN((v) => v + 1), speed);
    return () => clearTimeout(t);
  }, [active, reduced, n, text.length, speed]);

  return text.slice(0, n);
}

/* ============================================================
   CHROME
   ============================================================ */

function AppFrame({
  path,
  action,
  body = "#ffffff",
  children,
}: {
  path: string;
  action: string;
  body?: string;
  children: React.ReactNode;
}) {
  return (
    // `body` is the stage's own colour: the rail column sits on it and stays
    // invisible until the estimate slides in, instead of reading as a white slab.
    <div
      className="overflow-hidden rounded-md shadow-lp-mock ring-1 ring-black/10"
      style={{ background: body, transition: "background .8s ease" }}
    >
      <div className="flex items-center gap-3 border-b-2 border-lp-ink bg-white px-4 py-2.5">
        <span className="grid h-5 w-5 place-items-center rounded-[2px] bg-lp-ink text-[10px] font-black text-white">J</span>
        <span className="min-w-0 flex-1 truncate rounded-[2px] border border-black/10 bg-lp-paper px-2.5 py-1 font-mono text-[10.5px] text-slate-500">
          {path}
        </span>
        <span className="shrink-0 rounded-[2px] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white" style={{ background: BLUE }}>
          {action}
        </span>
      </div>
      {children}
    </div>
  );
}

/** The prompt. Centre stage first, then it lifts and becomes a header bar.
    It keeps its size on the way up — scaling it left the written block a
    different width from the field it came out of. */
function Prompt({
  label,
  value,
  lifted,
  attach,
  search,
  compact,
}: {
  label: string;
  value: string;
  lifted: boolean;
  attach?: boolean;
  search?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className="absolute inset-x-0 z-20 px-3 sm:px-5"
      style={{
        top: lifted ? 8 : compact ? 74 : 148,
        // The prompt overlays the whole frame, so at rest it centres on the
        // card the viewer actually sees. On lift it slides half the rail's
        // width left, into the stage column where the work lands — except on a
        // handheld, where the rail is stacked underneath and there is nothing
        // to move out of.
        transform: lifted
          ? `translateX(${compact ? 0 : -130}px) scale(1)`
          : `translateX(0) scale(${compact ? 1 : 1.15})`,
        transformOrigin: "center top",
        transition: `top .8s ${EASE}, transform .8s ${EASE}`,
      }}
    >
      <div
        className="mx-auto w-full max-w-[640px] rounded-[3px] border-2 bg-white"
        style={{
          borderColor: lifted ? HAIR : INK,
          boxShadow: lifted ? "none" : "0 18px 40px -18px rgba(10,10,10,.35)",
          transition: `border-color .6s ease, box-shadow .6s ease`,
        }}
      >
        {/* Sized for the column it sits in (owner, 2026-08-25): at phone width
            the desktop field filled a third of the stage and still truncated. */}
        <div className="flex items-center gap-2 px-2.5 py-2 sm:gap-3 sm:px-4 sm:py-3.5">
          <span className="shrink-0 font-mono text-[8.5px] font-bold uppercase tracking-[0.14em] text-slate-400 sm:text-[10px]">
            {label}
          </span>
          {/* The caret rides the end of the TEXT. Flexing the value pushed it to
              the right edge of the field, so it read as a cursor parked in an
              empty box while the words appeared away from it. */}
          <span className="flex min-w-0 flex-1 items-center">
            <span className="truncate text-[11.5px] text-lp-ink sm:text-[15px]">{value}</span>
            <span className="ml-[1px] inline-block h-[13px] w-[1.5px] shrink-0 bg-lp-ink sm:h-[17px]" style={{ animation: "caret 1s step-end infinite" }} />
          </span>
          {search && (
            /* Stays put through the lift (owner, 2026-08-25): a search field
               that loses its magnifier mid-animation reads as a glitch. */
            <svg
              viewBox="0 0 24 24"
              className="h-[13px] w-[13px] shrink-0 text-slate-400 sm:h-[17px] sm:w-[17px]"
              aria-hidden
            >
              <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4.2-4.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </div>
        {attach && (
          <div
            className="overflow-hidden"
            style={{ maxHeight: lifted ? 0 : 44, opacity: lifted ? 0 : 1, transition: `max-height .5s ${EASE}, opacity .35s ease` }}
          >
            <div className="flex items-center gap-2 border-t px-2.5 py-1.5 sm:px-4 sm:py-2" style={{ borderColor: HAIR }}>
              <span className="flex items-center gap-1.5 rounded-[2px] border border-black/15 px-1.5 py-[3px] text-[9px] font-semibold text-slate-500 sm:px-2 sm:py-1 sm:text-[10.5px]">
                <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
                  <path d="M10 4.5L5.8 8.7a2 2 0 102.8 2.8l4.2-4.2a3.5 3.5 0 10-5-5L3.2 6.9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                Attach photo
              </span>
              <span className="rounded-[2px] bg-lp-paper px-1.5 py-[3px] font-mono text-[8.5px] text-slate-400 sm:px-2 sm:py-1 sm:text-[10px]">kitchen-01.jpg</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Rail({ title, shown, children }: { title: string; shown: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`lp-est-rail overflow-hidden${shown ? " is-on" : ""}`}
      style={{
        // Nothing of the rail exists until the estimate does — including its
        // paper and its border, which used to sit there as a white slab
        // waiting for numbers.
        // Transitions live in the stylesheet — on a handheld the rail also has
        // to collapse its own height, and an inline transition here would win
        // over that rule and leave the height snapping.
        background: shown ? "#f2f0eb" : "transparent",
        opacity: shown ? 1 : 0,
        transform: shown ? "translateX(0)" : "translateX(18px)",
      }}
    >
      <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">{title}</div>
      <div className="mt-3 space-y-2.5">{children}</div>
    </div>
  );
}

function Stat({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-black/[0.08] pb-2 last:border-0">
      <span className="truncate text-[11px] text-slate-500">{k}</span>
      <span className={`shrink-0 font-mono text-[12.5px] font-bold ${accent ? "" : "text-lp-ink"}`} style={accent ? { color: BLUE } : undefined}>
        {v}
      </span>
    </div>
  );
}

function TotalPlate({ total, note }: { total: string; note: string }) {
  return (
    <div className="mt-4 rounded-[2px] bg-lp-ink px-3 py-2.5">
      <div className="text-[9px] font-black uppercase tracking-[0.16em] text-white/45">{note}</div>
      <div className="mt-0.5 font-mono text-[19px] font-black text-white">{total}</div>
    </div>
  );
}

function Beat({ delay, children }: { delay: number; children: React.ReactNode }) {
  return <div style={{ animation: `toast-in .45s ${EASE} ${delay}ms backwards` }}>{children}</div>;
}

const STAGE = "lp-est-stage relative h-[286px] overflow-hidden sm:h-[430px]";

/* Both orthophoto stages draw on a 420×280 plan. The photo is object-cover, so
   percentages of the STAGE don't line up with it — the fence panels used to
   float ~38px off the boundary because of exactly that. PlanBox is a box with
   the plan's own aspect, full width and centred, i.e. the cover crop itself:
   inside it the photo, the SVG and any standing element share one grid. */
function planBoxStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    position: "absolute",
    // --plan-inset / --plan-y are set per breakpoint in landing-d.css. On a
    // phone the plate is pushed wider than the stage so it fills the floor
    // instead of floating in it, and nudged below centre because the prompt
    // owns the top of the stage.
    left: "var(--plan-inset, 0px)",
    right: "var(--plan-inset, 0px)",
    top: "var(--plan-y, 50%)",
    aspectRatio: "420 / 280",
    ...extra,
  };
}

const pctX = (x: number) => `${(x / 420) * 100}%`;
const pctY = (y: number) => `${(y / 280) * 100}%`;

/* ============================================================
   1 · SMART PROPOSAL — prompt, lift, write
   ============================================================ */

/* Prices carry the dollar sign (owner, 2026-08-25): a bare 8,400 next to a
   quantity reads as another quantity. */
const SP_LINES: [string, string, string][] = [
  ["Semi-custom maple shaker cabinets", "14 ln ft", "$8,400"],
  ["Quartz countertop, installed", "42 sf", "$2,436"],
  ["Sink relocation — plumbing rough-in", "1 fixture", "$1,850"],
  ["Demo, install and finish", "112 hrs", "$8,960"],
];

function SmartProposalShot({ active }: { active: boolean }) {
  const compact = useCompact();
  const phase = usePhases([1000, 1400], active);
  const typed = useTyped("Remodel a 10×10 kitchen — maple & quartz", active, 18);
  const lifted = phase >= 1;
  const writing = phase >= 2;

  return (
    <AppFrame path="app.jobflex.com/proposals/new" action="Send for signature">
      <div className="relative">
        <Prompt label="Scope" value={typed} lifted={lifted} attach compact={compact} />
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_260px]">
        <div className={STAGE}>
          {/* the document, arriving under the lifted prompt — same wrapper
              padding and max-width as the prompt, so the two edges register */}
          <div
            className="absolute inset-x-0 bottom-0 px-3 pb-4 sm:px-5 sm:pb-5"
            style={{
              top: compact ? 50 : 78,
              opacity: writing ? 1 : 0,
              transform: writing ? "translateY(0)" : "translateY(16px)",
              transition: `opacity .5s ease, transform .7s ${EASE}`,
            }}
          >
            <div className="mx-auto w-full max-w-[640px]">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Written</span>
                <span className="h-px flex-1" style={{ background: HAIR }} />
              </div>
              {writing &&
                SP_LINES.map(([name, qty, price], i) => (
                  <Beat key={name} delay={120 + i * 160}>
                    <div className="flex items-baseline gap-3 border-b border-black/[0.07] py-2.5">
                      <span className="w-4 shrink-0 font-mono text-[10px] text-slate-300">{String(i + 1).padStart(2, "0")}</span>
                      <span className="min-w-0 flex-1 truncate text-[12px] text-lp-ink sm:text-[13.5px]">{name}</span>
                      {/* the quantity is the first thing to go when the column
                          is 350px wide — the line and its price are not */}
                      <span className="hidden shrink-0 font-mono text-[10.5px] text-slate-400 sm:inline">{qty}</span>
                      <span className="w-[62px] shrink-0 text-right font-mono text-[12px] font-bold text-lp-ink sm:w-[68px] sm:text-[13px]">{price}</span>
                    </div>
                  </Beat>
                ))}
              {writing && (
                <Beat delay={120 + SP_LINES.length * 160}>
                  <div className="flex items-center gap-2 py-2.5">
                    <span className="h-[3px] w-24 rounded-full" style={{ background: SKY, opacity: 0.5 }} />
                    <span className="font-mono text-[10px] text-slate-400">writing…</span>
                  </div>
                </Beat>
              )}
            </div>
          </div>
        </div>

        <Rail title="Proposal" shown={writing}>
          <Stat k="Materials" v="$12,686" />
          <Stat k="Labor" v="$8,960" />
          <Stat k="Margin" v="22%" />
          <TotalPlate total="$21,646" note="Project total" />
        </Rail>
        </div>
      </div>
    </AppFrame>
  );
}

/* ============================================================
   2 · ROOF — address, aerial, trace, tilt, takeoff
   ============================================================
   One outline. It traces onto the photo, then the whole plane rotates into
   perspective and the photo fades from underneath it — the drawing that is
   left standing is the same drawing that was traced, not a second one cut in.

   Geometry measured off aerial-roof.png in plan units (px/4.75): main block
   (85,35)–(284,220), wing to (350, 78–191), porch gable 153–217 down to 248. */

/* The roof as a 3D model, not two drawings. Every vertex is (x, y, z) in the
   photo's own plan units — eaves at z 0, ridges lifted. The bird's-eye view is
   this model orthographically projected from straight above, which makes it
   pixel-identical to the trace on the photo; the camera move just rotates the
   SAME projection, so the outline never changes into anything — you watch it
   gain its angles. Measured off aerial-roof.png by pixel scan. */

type P3 = [number, number, number];

const RV: Record<string, P3> = {
  // Eave corners sit on the OUTER gutter line, not the shingle edge — tracing
  // the shingles left a white band of eave metal outside the outline, which
  // read as the trace missing the roof.
  //
  // Re-measured off aerial-roof.png by pixel scan (owner, 2026-08-25). Three
  // things were wrong and all three showed: the south eave ran diagonally
  // because the SW corner was 5 units high, the porch was drawn as a V when
  // the photo has a hipped rectangle, and the notch by the garage was cut on
  // the diagonal instead of stepped.
  A: [83, 34, 0],       // NW eave
  B: [285.5, 34, 0],    // NE eave, main block
  C: [285.5, 77, 0],    // step down to the wing
  D: [351, 77, 0],      // NE eave, wing
  E: [351, 193, 0],     // SE eave, wing
  F: [272, 193, 0],     // SW eave, wing
  G: [272, 205, 0],     // the notch, down
  H: [261, 205, 0],     // the notch, in
  I: [261, 217, 0],     // back onto the main south eave
  J: [217, 217, 0],     // porch, east shoulder
  K: [217, 230, 0],     // porch, east eave
  L: [197, 238, 0],     // porch, front east
  M: [170, 238, 0],     // porch, front west
  N: [152, 230, 0],     // porch, west eave
  O: [152, 217, 0],     // porch, west shoulder
  P: [83, 217, 0],      // SW eave

  R1: [171, 122, 42], R2: [196, 122, 42],  // main ridge
  V: [239, 131, 34],                        // valley junction toward the wing
  W: [297, 125, 36],                        // wing ridge head
  M1: [183, 122, 42],                       // centre ridge, down to the porch
  PR: [184, 226, 16],                       // porch ridge head
};

const ROOF_OUTLINE = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P",
];

const ROOF_EDGES: [string, string][] = [
  ["R1", "R2"],
  ["A", "R1"], ["P", "R1"], ["B", "R2"],
  ["R2", "V"], ["V", "W"], ["D", "W"], ["E", "W"], ["C", "V"], ["V", "F"],
  ["M1", "PR"],
  ["PR", "L"], ["PR", "M"], ["PR", "J"], ["PR", "O"],
];

/* Eave corners that get a dashed drop to the ground plane once there is a
   third dimension to drop through. */
const ROOF_DROPS = ["A", "B", "D", "E", "P", "O", "J"];

/* Placed in the PLAN box against the tilted drawing, not in the stage corners
   (owner, 2026-08-25). Parked at the frame edges they read as captions; a
   dimension has to sit on the line it measures. Coordinates are the tilted end
   state, which is the only state they are ever visible in. */
const ROOF_DIMS: { label: string; x: number; y: number; tx: string }[] = [
  { label: "48'-0\"", x: 214, y: 203, tx: "translate(-50%, 0)" },
  { label: "43'-6\"", x: 72, y: 131, tx: "translate(-100%, -50%)" },
  // In the empty pocket above the wing, not across its facets.
  { label: "8/12 pitch", x: 358, y: 96, tx: "translate(-100%, -100%)" },
];

/** 0 → flat bird's eye (the trace), 1 → tilted camera on the same model. */
function useTiltT(on: boolean) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    if (!on) { raf = requestAnimationFrame(() => setT(0)); return () => cancelAnimationFrame(raf); }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      raf = requestAnimationFrame(() => setT(1));
      return () => cancelAnimationFrame(raf);
    }
    const t0 = performance.now();
    const D = 1500;
    const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / D);
      setT(ease(u));
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [on]);
  return t;
}

function RoofShot({ active }: { active: boolean }) {
  const compact = useCompact();
  const phase = usePhases([1100, 2000, 3400, 4800], active);
  const typed = useTyped("142 Alder Ridge Rd", active);
  const lifted = phase >= 1;
  const aerial = phase >= 1;
  const traced = phase >= 2;
  const tilted = phase >= 3;
  const measured = phase >= 4;
  const t = useTiltT(tilted);

  /* Orthographic camera rotating about the model's centre. At t=0 this is the
     identity on (x, y) — exactly the plan the trace was drawn in. */
  const th = t * 0.96; // → ~55°
  const cosT = Math.cos(th), sinT = Math.sin(th);
  const s = 1 + 0.07 * t;
  const px = (v: P3) => 217 + (v[0] - 217) * s;
  const py = (v: P3) => 138 + ((v[1] - 138) * cosT - v[2] * sinT) * s;
  const pt = (n: string) => `${px(RV[n])} ${py(RV[n])}`;
  const outlineD = `M${ROOF_OUTLINE.map(pt).join(" L")} Z`;

  const stroke = tilted ? BLUE : SKY;

  return (
    <AppFrame
      path="app.jobflex.com/estimators/roof"
      action="Send as proposal"
      body={tilted ? "#f6f7f5" : aerial ? "#3b4034" : "#e9eae6"}
    >
      <div className="relative">
        <Prompt label="Address" value={typed} lifted={lifted} search compact={compact} />
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_260px]">
        <div className={STAGE} style={{ background: tilted ? "#f6f7f5" : "#e9eae6", transition: "background .9s ease" }}>
          <div style={planBoxStyle({ transform: "translateY(-50%)" })}>
            <div
              className="absolute inset-0"
              style={{
                opacity: aerial && !tilted ? 1 : 0,
                transition: `opacity .9s ease ${tilted ? ".35s" : "0s"}`,
              }}
            >
              <Image src="/landing-d/aerial-roof.png" alt="" fill priority sizes="(max-width: 640px) 100vw, 60vw" className="object-cover" />
            </div>

            <svg viewBox="0 0 420 280" className="absolute inset-0 h-full w-full" aria-hidden>
              {/* dashed drops: the eave corners falling to the ground plane */}
              <g stroke={BLUE} strokeWidth="1.1" strokeDasharray="3 3" strokeOpacity={0.5 * t} fill="none">
                {ROOF_DROPS.map((n) => {
                  const v = RV[n];
                  const g: P3 = [v[0], v[1], -16];
                  return <path key={n} d={`M${px(v)} ${py(v)} L${px(g)} ${py(g)}`} />;
                })}
              </g>
              <path
                d={outlineD}
                fill={BLUE}
                fillOpacity={0.07 * t}
                stroke={stroke}
                strokeWidth="2.4"
                strokeLinejoin="round"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={traced ? 0 : 1}
                style={{ transition: `stroke-dashoffset 1s ${EASE}, stroke .9s ease` }}
              />
              <g fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
                {ROOF_EDGES.map(([ea, eb], i) => (
                  <path
                    key={`${ea}-${eb}`}
                    d={`M${pt(ea)} L${pt(eb)}`}
                    stroke={stroke}
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={traced ? 0 : 1}
                    style={{ transition: `stroke-dashoffset .6s ${EASE} ${220 + i * 45}ms, stroke .9s ease` }}
                  />
                ))}
              </g>
            </svg>

            {/* the numbers, each against the line it measures */}
            {ROOF_DIMS.map((d, i) => (
              <span
                key={d.label}
                className="absolute z-20"
                style={{ left: pctX(d.x), top: pctY(d.y), transform: d.tx }}
              >
                <span
                  className="block whitespace-nowrap rounded-[2px] border-2 border-lp-ink bg-white px-1.5 py-[3px] font-mono text-[9.5px] font-bold text-lp-ink sm:px-2 sm:py-1 sm:text-[10.5px]"
                  style={
                    measured
                      ? { animation: `toast-in .45s ${EASE} ${i * 140}ms backwards` }
                      : { opacity: 0 }
                  }
                >
                  {d.label}
                </span>
              </span>
            ))}
          </div>

          <span
            className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 rounded-[2px] bg-lp-ink px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-white"
            style={{ opacity: aerial ? 1 : 0, transition: "opacity .5s ease" }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: SKY }} />
            {tilted ? "Wireframe · EagleView geometry" : traced ? "Tracing facets" : "Orthophoto located"}
          </span>
        </div>

        <Rail title="Takeoff" shown={measured}>
          <Stat k="Total squares" v="17.6" accent />
          <Stat k="Pitch" v="8/12" />
          <Stat k="Ridge" v="48 lf" />
          <Stat k="Hip" v="62 lf" />
          <Stat k="Eave" v="96 lf" />
          <Stat k="Bundles" v="56" />
          <Stat k="Labor" v="$6,610" />
          <TotalPlate total="$13,190" note="Estimate total" />
        </Rail>
        </div>
      </div>
    </AppFrame>
  );
}

/* ============================================================
   3 · FENCE — cursor, click, parcel, run, 3D, grade
   ============================================================
   The order is the point: the cursor travels first, THEN the button takes the
   click, THEN the parcel draws — the boundary appearing before the click gave
   away that it was a picture rather than a lookup.

   The 3D moment tips the ground plane; the plan run fades out and true
   standing walls (rotateZ·rotateX composed inside the tilted plane) rise on
   the same three edges the run was drawn on, so the map never disappears and
   the fence never leaves the boundary. */

const LOT = { left: 127, right: 292, top: 39, bottom: 235 };
const TILT = 42;
const WALL_H = 30;

function FenceShot({ active }: { active: boolean }) {
  // A press beat of its own between the cursor arriving and the layer coming
  // on (owner, 2026-08-25). The colour used to flip with nothing moving, so
  // the button never looked pressed — it just changed.
  const phase = usePhases([700, 1420, 1560, 2700, 4100, 5500], active);
  const seeking = phase >= 1;
  const pressing = phase === 2;
  const clicked = phase >= 2;
  const parcel = phase >= 3;
  const run = phase >= 4;
  const tilted = phase >= 5;
  const graded = phase >= 6;

  const bays = 7;
  const sideBays = 5;

  return (
    <AppFrame path="app.jobflex.com/estimators/fence" action="Send as proposal" body="#20222a">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_260px]">
        <div className={STAGE} style={{ background: "#20222a" }}>
          <span className="absolute left-4 top-4 z-30">
            <span
              className={`relative flex items-center gap-1.5 rounded-[2px] border-2 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] ${
                clicked ? "border-lp-ink bg-lp-ink text-white" : "border-lp-ink bg-white text-lp-ink"
              }`}
              style={{
                transform: pressing ? "scale(.9)" : "scale(1)",
                transition: `transform .16s ${EASE}, background-color .3s ease, color .3s ease`,
              }}
            >
              View parcels
              {clicked && !pressing && (
                <span
                  className="pointer-events-none absolute -inset-[3px] rounded-[3px] border-2"
                  style={{ borderColor: SKY, animation: `lpRipple .6s ${EASE} forwards` }}
                  aria-hidden
                />
              )}
            </span>
          </span>
          <svg
            viewBox="0 0 24 24"
            className="absolute z-30 h-5 w-5 drop-shadow"
            aria-hidden
            style={{
              left: seeking ? 78 : 320,
              top: seeking ? 30 : 210,
              opacity: run ? 0 : 1,
              transition: `left .8s ${EASE}, top .8s ${EASE}, opacity .4s ease`,
            }}
          >
            <path d="M4 2l7 18 2.5-7L20 10 4 2z" fill="#fff" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
          </svg>

          <div className="absolute inset-0" style={{ perspective: "1100px" }}>
            {/* the ground: the map itself tips, and stays visible throughout */}
            <div
              style={planBoxStyle({
                transform: tilted
                  ? `translateY(-47%) rotateX(${TILT}deg) scale(1.12)`
                  : "translateY(-50%)",
                transformOrigin: "50% 62%",
                transformStyle: "preserve-3d",
                transition: `transform 1.25s ${EASE}`,
              })}
            >
              <Image src="/landing-d/aerial-lot.png" alt="" fill priority sizes="(max-width: 640px) 100vw, 60vw" className="object-cover" />

              {/* the parcel, only once the layer is on */}
              <svg viewBox="0 0 420 280" className="absolute inset-0 h-full w-full" aria-hidden>
                <polygon
                  points={`${LOT.left},${LOT.top} ${LOT.right},${LOT.top} ${LOT.right},${LOT.bottom} ${LOT.left},${LOT.bottom}`}
                  fill={SKY}
                  fillOpacity={parcel ? 0.12 : 0}
                  stroke={SKY}
                  strokeWidth="2.2"
                  pathLength={1}
                  strokeDasharray={1}
                  style={{
                    strokeDashoffset: parcel ? 0 : 1,
                    opacity: tilted ? 0.4 : 1,
                    transition: `fill-opacity .6s ease .2s, stroke-dashoffset .8s ${EASE}, opacity .6s ease`,
                  }}
                />
                {parcel && (
                  <text
                    x={(LOT.left + LOT.right) / 2}
                    y={LOT.top + 13}
                    fill="#fff"
                    stroke={INK}
                    strokeWidth="2.4"
                    paintOrder="stroke"
                    strokeLinejoin="round"
                    fontFamily="JetBrains Mono, monospace"
                    fontSize="8.5"
                    fontWeight="700"
                    textAnchor="middle"
                    style={{
                      opacity: tilted ? 0 : 1,
                      transition: "opacity .4s ease",
                      animation: `toast-in .4s ${EASE} 620ms backwards`,
                    }}
                  >
                    PARCEL 04-118-023 · 0.31 AC
                  </text>
                )}
                {/* the run, in plan — hands over entirely to the walls in 3D */}
                <polyline
                  points={`${LOT.left},${LOT.top} ${LOT.left},${LOT.bottom} ${LOT.right},${LOT.bottom} ${LOT.right},${LOT.top}`}
                  fill="none"
                  stroke={BLUE}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={1}
                  strokeDasharray={1}
                  style={{
                    strokeDashoffset: run ? 0 : 1,
                    opacity: tilted ? 0 : 1,
                    transition: `stroke-dashoffset 1.1s ${EASE}, opacity .5s ease`,
                  }}
                />
              </svg>

              {/* front run: bays standing on the bottom boundary */}
              {run &&
                Array.from({ length: bays }).map((_, i) => {
                  const w = (LOT.right - LOT.left) / bays;
                  return (
                    <span
                      key={`b${i}`}
                      className="absolute"
                      style={{
                        left: pctX(LOT.left + i * w + 1),
                        top: pctY(LOT.bottom),
                        width: pctX(w - 2),
                        height: WALL_H,
                        marginTop: -WALL_H,
                        transform: `rotateX(-90deg) scaleY(${tilted ? 1 : 0})`,
                        transformOrigin: "bottom center",
                        background: "rgba(24,84,160,.72)",
                        borderTop: `2px solid ${SKY}`,
                        transition: `transform .55s ${EASE} ${i * 45}ms`,
                      }}
                    />
                  );
                })}
              {/* side runs: same walls, pre-rotated in plan so they stand on
                  the left and right boundaries instead of billboarding */}
              {run &&
                ([LOT.left, LOT.right] as const).map((edge) => (
                  <span
                    key={`side-${edge}`}
                    className="absolute"
                    style={{
                      left: pctX(edge),
                      top: pctY(LOT.top),
                      width: pctX(LOT.bottom - LOT.top),
                      height: WALL_H,
                      transformOrigin: "top left",
                      transform: "rotateZ(90deg) rotateX(90deg)",
                      transformStyle: "preserve-3d",
                    }}
                  >
                    {Array.from({ length: sideBays }).map((_, i) => (
                      <span
                        key={i}
                        className="absolute inset-y-0"
                        style={{
                          left: `${(i * 100) / sideBays + 0.6}%`,
                          width: `${100 / sideBays - 1.2}%`,
                          transform: `scaleY(${tilted ? 1 : 0})`,
                          transformOrigin: "top center",
                          background: "rgba(24,84,160,.55)",
                          borderBottom: `2px solid ${SKY}`,
                          transition: `transform .55s ${EASE} ${120 + i * 45}ms`,
                        }}
                      />
                    ))}
                  </span>
                ))}
            </div>
          </div>

          <span
            className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 rounded-[2px] bg-lp-ink px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-white"
            style={{ opacity: parcel ? 1 : 0, transition: "opacity .5s ease" }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: SKY }} />
            {graded ? "Grade · panels stepped" : tilted ? "Fence placed · 6 ft" : run ? "Drawing the run" : "Parcel from Regrid"}
          </span>
        </div>

        <Rail title="Takeoff" shown={graded}>
          <Stat k="Run" v="120 lf" accent />
          <Stat k="Fall over run" v="3 ft 2 in" />
          <Stat k="Stepped panels" v="5" />
          <Stat k="Posts" v="16" />
          <Stat k="Gates" v="2" />
          <Stat k="Concrete" v="32 bags" />
          <Stat k="Labor" v="$2,900" />
          <TotalPlate total="$6,540" note="Estimate total" />
        </Rail>
      </div>
    </AppFrame>
  );
}

/* ============================================================
   4 · VIDEO — the real clip, the read as notes, the proposal
   ============================================================
   An actual walkthrough plays here rather than a drawing of one. What the AI
   reads off the footage lands as short notes pinned to the things themselves —
   not a measuring rig of crosshairs and dimension chips. */

const V_NOTES: { label: string; left: string; top: string }[] = [
  { label: "Wood uppers", left: "22%", top: "24%" },
  { label: "Tile backsplash", left: "60%", top: "50%" },
  { label: "Granite countertop", left: "30%", top: "74%" },
];

const V_LINES: [string, string][] = [
  ["Semi-custom uppers, 12 ln ft", "3,240"],
  ["Quartz countertop, 26 sf", "1,508"],
  ["Demo and install, 64 hrs", "5,120"],
];

/* The notes are pinned to things in the FRAME, so they are only right while
   the clip is showing that frame. This is the point in the footage where the
   camera is on the uppers and the backsplash. */
const V_NOTES_IN = 2.6;
const V_NOTES_OUT = 9.5;

function VideoShot({ active }: { active: boolean }) {
  const phase = usePhases([1500, 2600, 4600], active);
  const pulled = phase >= 1;
  const priced = phase >= 3;
  const caption = useTyped("…remodel the whole kitchen — the run here is about twelve feet…", active, 24);
  // The clip loops; the notes belong to the read of THIS pass, so they leave
  // and land again each time the footage restarts.
  const [loop, setLoop] = useState(0);
  // Driven by the video clock, not a wall clock (owner, 2026-08-25). On the
  // second pass the notes used to reappear the instant the clip restarted,
  // which put "Wood uppers" on a bare wall — the camera was not there yet.
  const [clipT, setClipT] = useState(0);
  const lastT = useRef(0);
  const read = phase >= 2;
  const notesOn = read && clipT >= V_NOTES_IN && clipT <= V_NOTES_OUT;

  return (
    <AppFrame path="app.jobflex.com/estimators/video" action="Send as proposal" body="#0f172a">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_260px]">
        <div className={STAGE} style={{ background: "#0f172a" }}>
          {/* the footage, which pulls back once it has been watched */}
          <div
            className="absolute inset-0"
            style={{
              transform: pulled ? "scale(1)" : "scale(1.18)",
              transition: `transform 1.3s ${EASE}`,
            }}
          >
            <video
              className="h-full w-full object-cover"
              src="/landing-d/walkthrough.mp4"
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              onTimeUpdate={(e) => {
                const t = e.currentTarget.currentTime;
                if (t < lastT.current - 0.5) setLoop((l) => l + 1);
                lastT.current = t;
                setClipT(t);
              }}
            />
          </div>

          {/* what the read found: notes pinned to the footage */}
          {V_NOTES.map((n, i) => (
            <span
              key={`${n.label}-${loop}`}
              className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-[2px] bg-lp-ink/85 px-2 py-1 text-[10.5px] font-bold text-white"
              style={{
                left: n.left,
                top: n.top,
                ...(notesOn
                  ? { animation: `toast-in .45s ${EASE} ${i * 160}ms backwards` }
                  : { opacity: 0 }),
              }}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SKY }} />
              {n.label}
            </span>
          ))}

          <span
            className="absolute right-4 top-4 z-20 flex items-center gap-1.5 rounded-[2px] bg-black/60 px-2 py-1 font-mono text-[9.5px] font-bold uppercase tracking-[0.12em] text-white"
            style={{ opacity: pulled ? 0 : 1, transition: "opacity .5s ease" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" style={{ animation: "lpPulse 1.2s ease-in-out infinite" }} />
            rec 0:18
          </span>

          <div
            className="absolute inset-x-0 bottom-0 z-20 flex items-start gap-2 px-4 pb-4 pt-8"
            style={{
              background: "linear-gradient(to top, rgba(15,23,42,.96), rgba(15,23,42,0))",
              opacity: priced ? 0 : 1,
              transition: "opacity .5s ease",
            }}
          >
            <span className="mt-[2px] shrink-0 rounded-[2px] bg-white/90 px-1.5 py-[2px] font-mono text-[9px] font-black uppercase text-slate-900">cc</span>
            <span className="text-[14px] font-semibold leading-[1.4] text-white">{caption}</span>
          </div>

          <div
            className="absolute inset-x-0 bottom-0 z-30 rounded-t-[3px] bg-white px-5 pb-5 pt-4"
            style={{
              transform: priced ? "translateY(0)" : "translateY(102%)",
              transition: `transform 1s ${EASE}`,
              boxShadow: "0 -18px 40px -18px rgba(0,0,0,.5)",
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Priced from the clip</span>
              <span className="h-px flex-1" style={{ background: HAIR }} />
            </div>
            {priced &&
              V_LINES.map(([name, price], i) => (
                <Beat key={name} delay={200 + i * 160}>
                  <div className="flex items-baseline gap-3 border-b border-black/[0.07] py-2">
                    <span className="w-4 shrink-0 font-mono text-[10px] text-slate-300">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-lp-ink">{name}</span>
                    <span className="w-[64px] shrink-0 text-right font-mono text-[12px] font-bold text-lp-ink">{price}</span>
                  </div>
                </Beat>
              ))}
          </div>
        </div>

        <Rail title="Read from clip" shown={read}>
          <Stat k="Wall run" v="12 ft 4 in" accent />
          <Stat k="Ceiling" v="8 ft" />
          <Stat k="Uppers" v="2 walls" />
          <Stat k="Labor" v="$5,120" />
          <TotalPlate total="$9,868" note="Estimate total" />
        </Rail>
      </div>
    </AppFrame>
  );
}

/* ============================================================
   THE SECTION
   ============================================================ */

const SLIDES = [
  { key: "smart", label: "Smart Proposal" },
  { key: "roof", label: "Roof estimator" },
  { key: "fence", label: "Fence estimator" },
  { key: "video", label: "Video estimator" },
];

export function EstimatorsShowcase() {
  const { ref, inView } = useInView<HTMLDivElement>(0.15);
  const [slide, setSlide] = useState(0);
  const [run, setRun] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() =>
      setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    );
    return () => cancelAnimationFrame(id);
  }, []);

  const s = SLIDES[slide];
  const goTo = (n: number) => {
    setSlide(((n % SLIDES.length) + SLIDES.length) % SLIDES.length);
    setRun((r) => r + 1);
  };

  return (
    <>
      {/* One build for both viewports (owner, 2026-08-25). The phone used to
          get a separate, static estimates section; it now runs the same four
          sequences with the takeoff rail stacked under the stage. */}
      <section className="relative overflow-hidden bg-lp-navy px-5 py-[11vmin] sm:py-[9vmin] sm:px-6">
        <div ref={ref} className="mx-auto lp-wrap">
          <Reveal>
            <h2 className="mb-5 text-[clamp(34px,3.6vw,54px)] font-bold leading-[1.04] tracking-[-0.02em] text-white sm:mb-7">
              Estimates.
            </h2>
          </Reveal>

          <Reveal delay={80}>
            <div
              className="grid grid-cols-2 items-stretch gap-1.5 sm:flex sm:flex-wrap sm:gap-2"
              role="tablist"
              aria-label="Estimators"
            >
              {SLIDES.map((sl, i) => (
                <button
                  key={sl.key}
                  type="button"
                  role="tab"
                  aria-selected={i === slide}
                  onClick={() => goTo(i)}
                  className={`relative overflow-hidden rounded-[2px] px-3 pb-3 pt-2.5 text-left transition-colors duration-200 sm:flex-1 sm:px-4 sm:pb-3.5 sm:pt-3 ${
                    i === slide ? "bg-white/[0.08] text-white" : "bg-white/[0.02] text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
                  }`}
                >
                  <span className="block text-[12px] font-semibold sm:text-[13.5px]">{sl.label}</span>
                  <span className="mt-2 block h-[3px] overflow-hidden rounded-full bg-white/15 sm:mt-2.5">
                    {i === slide && (
                      <span
                        key={`${slide}-${run}`}
                        onAnimationEnd={() => goTo(slide + 1)}
                        className="block h-full rounded-full bg-white"
                        style={
                          reduced
                            ? { width: "100%" }
                            : {
                                animation: `slide-fill ${SLIDE_MS}ms linear forwards`,
                                // Nothing pauses this but scrolling away — a
                                // hover-pause kept freezing the bar (and with
                                // it the whole rotation) mid-play.
                                animationPlayState: inView ? "running" : "paused",
                              }
                        }
                      />
                    )}
                  </span>
                </button>
              ))}
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="mt-6 sm:mt-9" key={`${s.key}-${run}`} style={{ animation: `toast-in .5s ${EASE}` }}>
              {slide === 0 && <SmartProposalShot active={inView} />}
              {slide === 1 && <RoofShot active={inView} />}
              {slide === 2 && <FenceShot active={inView} />}
              {slide === 3 && <VideoShot active={inView} />}
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
