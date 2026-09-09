"use client";

/* The fence estimator sequence. Lives in its own module (2026-09-06) because
   two places play it: slide three of the estimators showcase, and the hero of
   the `?industry=fencing` landing, where it replaces the dashboard shot. One
   sequence, two stages — the timing and the geometry cannot drift apart. */

import Image from "next/image";
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
  usePhases,
} from "./showcase-kit";

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

export function FenceShot({ active }: { active: boolean }) {
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
            className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 rounded-[2px] bg-ink px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-white"
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
