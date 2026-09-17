"use client";

/* ============================================================
   ROOF — address, aerial, trace, tilt, takeoff
   ============================================================
   Lives in its own module (2026-09-07) because two places play it: slide two
   of the estimators showcase, and the hero of the `?industry=roofing`
   landing. One sequence, two stages — the timing and the geometry cannot
   drift apart. The section header below is the original's. */

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  AppFrame,
  BLUE,
  EASE,
  Prompt,
  Rail,
  SKY,
  STAGE,
  Stat,
  TotalPlate,
  pctX,
  pctY,
  planBoxStyle,
  useCompact,
  usePhases,
  useTyped,
} from "./showcase-kit";
import { MockCallouts, type CalloutSpec } from "./mock-callouts";

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
];

/* The callouts (landing-e pass C): area, pitch and squares, each led from a
   point ON the model — a facet centre in the model's own (x, y, z) — to a
   pocket of the stage. The points are projected with the same camera as the
   drawing, so they ride the tilt; the figures are the takeoff's own (17.6
   squares = 1,760 sq ft, 8/12), so the mock never contradicts itself. The
   labels clear the lifted address bar at the top of the stage (dy 56). */
const ROOF_MARKS: Record<string, P3> = {
  area: [112, 124, 14],   // west facet, A–R1–P
  pitch: [184, 78, 21],   // north facet, A–B–R2–R1
  squares: [315, 135, 18], // wing, C–D–E–F
};
const ROOF_CALLOUTS: CalloutSpec[] = [
  { key: "area", text: "1,760 sq ft", pocket: "tl", dy: 56, elbow: "v" },
  { key: "pitch", text: "8/12 pitch", pocket: "tr", dy: 56, elbow: "v" },
  { key: "squares", text: "17.6 sq", pocket: "br", elbow: "h" },
];

/* THE HERO'S OWN LAYOUT (owner, 2026-09-14). In the hero the plate is drawn
   smaller (.lp-hero-stage) so the drawing has room around it, and every
   figure stands OUTSIDE the outline, at least 12 px off the nearest line,
   with a straight leader that is never within 10° of the line beside it —
   an elbow's horizontal leg beside a horizontal eave read as one more eave.

   From 640 px the labels are placed on points of the drawing itself (tilted
   plan units, like the dimensions), so their distance to the roof holds at
   every width; below 640 px the roof fills the width and the labels take the
   stage's top corners and bottom-right pocket, above and below the roof.
   The wing's anchor moved down its facet (300, 170) so its leader leaves the
   hip E–W at 17°, the pitch anchor toward the north facet's east end so its
   leader is short. Pocket and dimension coordinates are the TILTED end state
   (the porch eave lands at y 199, not 238). The two dimension boxes are
   hero-only from 1024 px. */
const HERO_MARKS: Record<string, P3> = {
  area: [112, 124, 14],
  pitch: [240, 62, 24],   // north facet, near its east hip: a short leader to the right
  squares: [300, 170, 10],
};
const HERO_POCKETS: Record<string, { x: number; y: number }> = {
  area: { x: 58, y: 125 },     // right edge of the label, 15.6 units off the west eave
  pitch: { x: 378, y: 140 },   // left edge, 17.6 units off the wing's east eave
  squares: { x: 322, y: 194 }, // top edge, 22 units under the wing's south eave
};
const HERO_CALLOUTS_DESK: CalloutSpec[] = [
  { key: "area", text: "1,760 sq ft", pocket: "tl", place: "marker", align: "r" },
  { key: "pitch", text: "8/12 pitch", pocket: "tr", place: "marker", align: "l" },
  { key: "squares", text: "17.6 sq", pocket: "br", place: "marker", align: "t" },
];
const HERO_CALLOUTS_PHONE: CalloutSpec[] = [
  { key: "area", text: "1,760 sq ft", pocket: "tl", dy: 40, leader: "straight" },
  { key: "pitch", text: "8/12 pitch", pocket: "tr", dy: 40, leader: "straight" },
  { key: "squares", text: "17.6 sq", pocket: "br", leader: "straight" },
];
const HERO_DIMS: typeof ROOF_DIMS = [
  { label: "48'-0\"", x: 184, y: 211, tx: "translate(-50%, 0)" },   // under the porch (tilted eave at 199), 12 units off
  { label: "43'-6\"", x: 56, y: 170, tx: "translate(-100%, -50%)" }, // left of the west eave, 17.6 units off
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

/** True from 1024 px — where the hero's two dimension boxes are shown. */
function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return wide;
}

export function RoofShot({ active, instant = false, hero = false }: { active: boolean; instant?: boolean; hero?: boolean }) {
  const compact = useCompact();
  const wide = useWide();
  const marks = hero ? HERO_MARKS : ROOF_MARKS;
  const callouts = hero ? (compact ? HERO_CALLOUTS_PHONE : HERO_CALLOUTS_DESK) : ROOF_CALLOUTS;
  const dims = hero ? (wide ? HERO_DIMS : []) : ROOF_DIMS;
  const phase = usePhases([1100, 2000, 3400, 4800], active, instant);
  const typed = useTyped("142 Alder Ridge Rd", active, 20, instant);
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
        <div className={hero ? `${STAGE} lp-hero-stage` : STAGE} style={{ background: tilted ? "#f6f7f5" : "#e9eae6", transition: "background .9s ease" }}>
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

            {/* callout anchors: points on the model, projected like the drawing */}
            {Object.entries(marks).map(([key, v]) => (
              <span key={key} data-callout-anchor={key} className="absolute h-px w-px" style={{ left: pctX(px(v)), top: pctY(py(v)) }} aria-hidden />
            ))}
            {/* hero, from 640 px: where each label sits, in the drawing's units */}
            {hero && !compact && Object.entries(HERO_POCKETS).map(([key, v]) => (
              <span key={key} data-callout-pocket={key} className="absolute h-px w-px" style={{ left: pctX(v.x), top: pctY(v.y) }} aria-hidden />
            ))}

            {/* the numbers, each against the line it measures */}
            {dims.map((d, i) => (
              <span
                key={d.label}
                className="absolute z-20"
                style={{ left: pctX(d.x), top: pctY(d.y), transform: d.tx }}
              >
                <span
                  className="block whitespace-nowrap rounded-[2px] border-2 border-ink bg-white px-1.5 py-[3px] font-mono text-[9.5px] font-bold text-ink sm:px-2 sm:py-1 sm:text-[10.5px]"
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
            className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 rounded-[2px] bg-ink px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-white"
            style={{ opacity: aerial ? 1 : 0, transition: "opacity .5s ease" }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: SKY }} />
            {tilted ? "Wireframe · aerial geometry" : traced ? "Tracing facets" : "Orthophoto located"}
          </span>

          {/* the callouts draw once the camera has settled and the takeoff is in */}
          <MockCallouts specs={callouts} armed={measured && t >= 1} />
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
