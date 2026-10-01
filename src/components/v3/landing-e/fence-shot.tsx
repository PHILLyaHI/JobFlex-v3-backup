"use client";

/* The fence estimator sequence. Lives in its own module (2026-09-06) because
   two places play it: slide three of the estimators showcase, and the hero of
   the `?industry=fencing` landing, where it replaces the dashboard shot. One
   sequence, two stages — the timing and the geometry cannot drift apart. */

import Image from "next/image";
import { useEffect } from "react";
import {
  AppFrame,
  BLUE,
  EASE,
  INK,
  Rail,
  SKY,
  STAGE,
  Stat,
  TotalPlate,
  pctX,
  pctY,
  planBoxStyle,
  READ_HOLD,
  usePhases,
  useReduced,
} from "./showcase-kit";
import { MockCallouts, type CalloutSpec } from "./mock-callouts";

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

/* The callouts (landing-e pass C): run, fall and posts, each led from a
   point on the fence line — markers placed on the boundary inside the
   tilted plane, so their measured positions are the projected ones — to a
   pocket of the stage. The top-left pocket sits under the View parcels
   button (dy 44). */
const FENCE_MARKS: Record<string, [number, number]> = {
  run: [(LOT.left + LOT.right) / 2, LOT.bottom],
  fall: [LOT.left, (LOT.top + LOT.bottom) / 2],
  posts: [LOT.right, (LOT.top + LOT.bottom) / 2],
};
const FENCE_CALLOUTS: CalloutSpec[] = [
  { key: "run", text: "120 lf", pocket: "br", elbow: "h" },
  { key: "fall", text: "3 ft 2 in fall", pocket: "tl", dy: 44, elbow: "v" },
  { key: "posts", text: "16 posts", pocket: "tr", elbow: "v" },
];

/* The fence's clock. `slide` = the grade landing, the callouts drawing
   (~1.8 s), then the finished takeoff held for READ_HOLD. */
const FENCE_PHASES = [700, 1420, 1560, 2700, 4100, 5500];
export const FENCE_TIMELINE = { marks: FENCE_PHASES, slide: FENCE_PHASES[5] + 1800 + READ_HOLD };

/** The steps the hero reports as the sequence reaches them (EstimatorDemoStep):
 *  phases 3–6; 1–2 are the cursor on the parcels button. */
const FENCE_STEPS = ["parcel", "run", "tilt", "takeoff"] as const;

export function FenceShot({
  active,
  instant = false,
  onStep,
}: {
  active: boolean;
  instant?: boolean;
  /** Called once per step reached; the hero passes it, the showcase does not. */
  onStep?: (step: string) => void;
}) {
  // A press beat of its own between the cursor arriving and the layer coming
  // on (owner, 2026-08-25). The colour used to flip with nothing moving, so
  // the button never looked pressed — it just changed.
  const phase = usePhases(FENCE_PHASES, active, instant);
  // Opening filled (hero on a phone) or under reduced motion the phases jump
  // straight to the end, so the plane must not ease into its tilt either: the
  // callouts measure their anchors as soon as they are armed, and mid-ease
  // they were measured on the flat plane (the run's node ~50 px under the
  // fence at 1440).
  const still = useReduced() || instant;
  const seeking = phase >= 1;
  const pressing = phase === 2;
  const clicked = phase >= 2;
  const parcel = phase >= 3;
  const run = phase >= 4;
  const tilted = phase >= 5;
  const graded = phase >= 6;
  useEffect(() => {
    if (phase >= 3) onStep?.(FENCE_STEPS[Math.min(phase, 6) - 3]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const bays = 7;
  const sideBays = 5;

  return (
    <AppFrame path="app.jobflex.com/estimators/fence" body="#20222a">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_260px]">
        {/* lp-fence-stage: the showcase fence's own framing (showcase-pass.css) */}
        <div className={`${STAGE} lp-fence-stage`} style={{ background: "#20222a" }}>
          <span className="absolute left-4 top-4 z-30">
            <span
              className={`relative flex items-center gap-1.5 rounded-[2px] border-2 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] ${
                clicked ? "border-ink bg-ink text-white" : "border-ink bg-white text-ink"
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
              // Rest at (320, 210); the seek to (78, 30) is a transform (pass C).
              left: 320,
              top: 210,
              transform: seeking ? "translate(-242px, -180px)" : "translate(0, 0)",
              opacity: run ? 0 : 1,
              transition: `transform .8s ${EASE}, opacity .4s ease`,
            }}
          >
            <path d="M4 2l7 18 2.5-7L20 10 4 2z" fill="#fff" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
          </svg>

          <div className="absolute inset-0" style={{ perspective: "1100px" }}>
            {/* the ground: the map itself tips, and stays visible throughout.
                The tilted framing — how far the plane sits down the stage
                and how large it is once tipped — is two variables with the
                original values as defaults (--fence-tilt-y -47 %,
                --fence-tilt-zoom 1.12); the showcase sets its own
                (showcase-pass.css, .lp-fence-stage). */}
            <div
              style={planBoxStyle({
                transform: tilted
                  ? `translateY(var(--fence-tilt-y, -47%)) rotateX(${TILT}deg) scale(var(--fence-tilt-zoom, 1.12))`
                  : "translateY(-50%)",
                transformOrigin: "50% 62%",
                transformStyle: "preserve-3d",
                transition: still ? "none" : `transform 1.25s ${EASE}`,
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

              {/* callout anchors on the boundary, inside the plane */}
              {Object.entries(FENCE_MARKS).map(([key, [x, y]]) => (
                <span key={key} data-callout-anchor={key} className="absolute h-px w-px" style={{ left: pctX(x), top: pctY(y) }} aria-hidden />
              ))}

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

          {/* The status chip that sat bottom-left ("Parcel from Regrid … Grade ·
              panels stepped") is gone (owner, 2026-09-26): it lay over the
              fence itself on a phone. */}

          {/* the callouts draw once the fence stands and the grade is in */}
          <MockCallouts specs={FENCE_CALLOUTS} armed={graded} />
        </div>

        <Rail title="Takeoff" shown={graded}>
          <Stat k="Run" v="120 lf" accent />
          <Stat k="Fall over run" v="3 ft 2 in" />
          <Stat k="Stepped panels" v="5" />
          <Stat k="Posts" v="16" />
          <Stat k="Gates" v="2" />
          <Stat k="Concrete" v="32 bags" />
          <Stat k="Labor" v="$2,900" />
          <TotalPlate total="$6,540" note="Estimate total" play={graded} />
        </Rail>
      </div>
    </AppFrame>
  );
}
