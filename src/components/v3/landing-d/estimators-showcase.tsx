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
import { Reveal } from "./reveal";
import { useInView } from "./use-in-view";

import {
  AppFrame,
  Beat,
  EASE,
  HAIR,
  Rail,
  SKY,
  STAGE,
  Stat,
  TotalPlate,
  usePhases,
  useTyped,
} from "./showcase-kit";
import { FenceShot } from "./fence-shot";
import type { ShowcaseSlideKey } from "./landing-variants";

const SLIDE_MS = 9000;

import { RoofShot } from "./roof-shot";
import { SmartProposalShot } from "./smart-proposal-shot";
import { SMART_SCENARIOS } from "./smart-scenarios";

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
              className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-[2px] bg-ink/85 px-2 py-1 text-[10.5px] font-bold text-white"
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
              <span className="text-[9px] font-black uppercase tracking-[0.18em] text-ink-faint">Priced from the clip</span>
              <span className="h-px flex-1" style={{ background: HAIR }} />
            </div>
            {priced &&
              V_LINES.map(([name, price], i) => (
                <Beat key={name} delay={200 + i * 160}>
                  <div className="flex items-baseline gap-3 border-b border-black/[0.07] py-2">
                    <span className="w-4 shrink-0 font-mono text-[10px] text-ink-faint">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{name}</span>
                    <span className="w-[64px] shrink-0 text-right font-mono text-[12px] font-bold text-ink">{price}</span>
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

export function EstimatorsShowcase({ initialSlide }: { initialSlide?: ShowcaseSlideKey }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.15);
  // A trade variant opens on its own estimator (fence for `?industry=fencing`);
  // auto-advance then carries on round the four as usual.
  const [slide, setSlide] = useState(() => Math.max(0, SLIDES.findIndex((s) => s.key === initialSlide)));
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
              {slide === 0 && <SmartProposalShot active={inView} scenario={SMART_SCENARIOS.kitchen} />}
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
