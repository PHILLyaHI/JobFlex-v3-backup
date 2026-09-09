"use client";

/* ============================================================
   SHOWCASE KIT — what every estimator shot is built from
   ============================================================
   Moved out of estimators-showcase.tsx on 2026-09-06 so the FenceShot could
   also stand in the hero (the `?industry=fencing` landing) without the hero
   importing the whole showcase. Nothing here changed in the move: the
   palette, the three hooks (compact / phases / typed), the app chrome, the
   prompt, the takeoff rail and the plan-box geometry are the originals,
   now exported. */

import { useEffect, useState } from "react";

export const INK = "#0a0a0a";
export const BLUE = "#1854A0";
export const SKY = "#4A9EFF";
export const HAIR = "rgba(10,10,10,0.12)";
export const EASE = "cubic-bezier(.22,.61,.36,1)";

/** True on a handheld column, where the rail sits under the stage rather than
    beside it — the prompt has no rail to slide away from there. */
export function useCompact() {
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
export function usePhases(marks: number[], active: boolean) {
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
export function useTyped(text: string, active: boolean, speed = 20) {
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

export function AppFrame({
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
      <div className="flex items-center gap-3 border-b-2 border-ink bg-white px-4 py-2.5">
        <span className="grid h-5 w-5 place-items-center rounded-[2px] bg-ink text-[10px] font-black text-white">J</span>
        <span className="min-w-0 flex-1 truncate rounded-[2px] border border-black/10 bg-lp-paper px-2.5 py-1 font-mono text-[10.5px] text-ink-muted">
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
export function Prompt({
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
          <span className="shrink-0 font-mono text-[8.5px] font-bold uppercase tracking-[0.14em] text-ink-faint sm:text-[10px]">
            {label}
          </span>
          {/* The caret rides the end of the TEXT. Flexing the value pushed it to
              the right edge of the field, so it read as a cursor parked in an
              empty box while the words appeared away from it. */}
          <span className="flex min-w-0 flex-1 items-center">
            <span className="truncate text-[11.5px] text-ink sm:text-[15px]">{value}</span>
            <span className="ml-[1px] inline-block h-[13px] w-[1.5px] shrink-0 bg-ink sm:h-[17px]" style={{ animation: "caret 1s step-end infinite" }} />
          </span>
          {search && (
            /* Stays put through the lift (owner, 2026-08-25): a search field
               that loses its magnifier mid-animation reads as a glitch. */
            <svg
              viewBox="0 0 24 24"
              className="h-[13px] w-[13px] shrink-0 text-ink-faint sm:h-[17px] sm:w-[17px]"
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
              <span className="flex items-center gap-1.5 rounded-[2px] border border-black/15 px-1.5 py-[3px] text-[9px] font-semibold text-ink-muted sm:px-2 sm:py-1 sm:text-[10.5px]">
                <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
                  <path d="M10 4.5L5.8 8.7a2 2 0 102.8 2.8l4.2-4.2a3.5 3.5 0 10-5-5L3.2 6.9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                Attach photo
              </span>
              <span className="rounded-[2px] bg-lp-paper px-1.5 py-[3px] font-mono text-[8.5px] text-ink-faint sm:px-2 sm:py-1 sm:text-[10px]">kitchen-01.jpg</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function Rail({ title, shown, children }: { title: string; shown: boolean; children: React.ReactNode }) {
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
      <div className="text-[9px] font-black uppercase tracking-[0.18em] text-ink-faint">{title}</div>
      <div className="mt-3 space-y-2.5">{children}</div>
    </div>
  );
}

export function Stat({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-black/[0.08] pb-2 last:border-0">
      <span className="truncate text-[11px] text-ink-muted">{k}</span>
      <span className={`shrink-0 font-mono text-[12.5px] font-bold ${accent ? "" : "text-ink"}`} style={accent ? { color: BLUE } : undefined}>
        {v}
      </span>
    </div>
  );
}

export function TotalPlate({ total, note }: { total: string; note: string }) {
  return (
    <div className="mt-4 rounded-[2px] bg-ink px-3 py-2.5">
      <div className="text-[9px] font-black uppercase tracking-[0.16em] text-white/45">{note}</div>
      <div className="mt-0.5 font-mono text-[19px] font-black text-white">{total}</div>
    </div>
  );
}

export function Beat({ delay, children }: { delay: number; children: React.ReactNode }) {
  return <div style={{ animation: `toast-in .45s ${EASE} ${delay}ms backwards` }}>{children}</div>;
}

export const STAGE = "lp-est-stage relative h-[286px] overflow-hidden sm:h-[430px]";

/* Both orthophoto stages draw on a 420×280 plan. The photo is object-cover, so
   percentages of the STAGE don't line up with it — the fence panels used to
   float ~38px off the boundary because of exactly that. PlanBox is a box with
   the plan's own aspect, full width and centred, i.e. the cover crop itself:
   inside it the photo, the SVG and any standing element share one grid. */
export function planBoxStyle(extra?: React.CSSProperties): React.CSSProperties {
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

export const pctX = (x: number) => `${(x / 420) * 100}%`;
export const pctY = (y: number) => `${(y / 280) * 100}%`;
