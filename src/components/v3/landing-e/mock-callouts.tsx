"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadDrawSVG, loadGsapFor, reducedMotion } from "./gsap-lazy";

/* DIMENSION CALLOUTS ON A MOCK (landing-e pass C, 2026-09-11). Each callout
   is a leader drawn from a point on the drawing to a label in a pocket of
   the stage: one 90° elbow, a 1.5 px ink line, an 8 px paper square on the
   drawing end (the guide line's node), and a mono-caps label that appears
   when the line has reached it (DrawSVG). The drawing end is measured from
   a real element of the mock — a marker the shot places on its geometry
   ([data-callout-anchor]) — at the moment the sequence arrives, so it
   follows whatever projection the mock is in. The pocket is a corner of the
   stage. Runs once, when the mock is on screen and `armed`; under reduced
   motion everything is drawn at once. */

export type CalloutSpec = {
  key: string;
  text: string;
  /** Which stage corner the label sits in. */
  pocket: "tl" | "tr" | "bl" | "br";
  /** Leader leaves the anchor vertically first (default) or horizontally. */
  elbow?: "v" | "h";
  /** Nudges the label from its pocket (px, positive = right / down). */
  dx?: number;
  dy?: number;
  /** "marker": the label is placed on the mock's own [data-callout-pocket]
   *  point instead of a stage corner — `align` says which edge of the label
   *  sits on that point (hero roof, 2026-09-14: labels beside the drawing,
   *  in the drawing's units, so they hold their distance at every width). */
  place?: "pocket" | "marker";
  align?: "l" | "r" | "t" | "b";
  /** "straight": one line from the anchor to the label's nearest edge, no
   *  elbow — an orthogonal leg next to a rectilinear roof runs parallel to
   *  an eave; a diagonal never does (owner's rule: ≥ 10° off any line). */
  leader?: "elbow" | "straight";
};

type Geo = { ax: number; ay: number; lx: number; ly: number; lw: number; lh: number; d: string };

const PAD = 12;
const NODE = 8;

export function MockCallouts({ specs, armed }: { specs: CalloutSpec[]; armed: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Record<string, Geo>>({});
  const [phase, setPhase] = useState<"idle" | "drawing" | "done">("idle");
  const played = useRef(false);

  // Where everything is: anchors measured from the mock's markers, labels in
  // their pockets, one elbow between.
  const measure = useCallback(() => {
    const root = ref.current;
    if (!root) return null;
    const stage = root.parentElement;
    if (!stage) return null;
    const sr = stage.getBoundingClientRect();
    const next: Record<string, Geo> = {};
    for (const s of specs) {
      const marker = stage.querySelector<HTMLElement>(`[data-callout-anchor="${s.key}"]`);
      const label = root.querySelector<HTMLElement>(`[data-callout-label="${s.key}"]`);
      if (!marker || !label) continue;
      const mr = marker.getBoundingClientRect();
      const ax = mr.left + mr.width / 2 - sr.left;
      const ay = mr.top + mr.height / 2 - sr.top;
      const lw = label.offsetWidth;
      const lh = label.offsetHeight;
      let lx = (s.pocket.endsWith("l") ? PAD : sr.width - PAD - lw) + (s.dx ?? 0);
      let ly = (s.pocket.startsWith("t") ? PAD : sr.height - PAD - lh) + (s.dy ?? 0);
      // the leader ends on the label's near edge, at mid-height
      let ex = s.pocket.endsWith("l") ? lx + lw : lx;
      let ey = ly + lh / 2;
      if (s.place === "marker") {
        const pocketMark = stage.querySelector<HTMLElement>(`[data-callout-pocket="${s.key}"]`);
        if (pocketMark) {
          const pr = pocketMark.getBoundingClientRect();
          const px = pr.left + pr.width / 2 - sr.left;
          const py = pr.top + pr.height / 2 - sr.top;
          const align = s.align ?? "l";
          lx = align === "r" ? px - lw : align === "l" ? px : px - lw / 2;
          ly = align === "b" ? py - lh : align === "t" ? py : py - lh / 2;
          ex = px;
          ey = py;
        }
      } else if (s.leader === "straight") {
        // the edge midpoint nearest the anchor
        const mids = [{ x: lx, y: ly + lh / 2 }, { x: lx + lw, y: ly + lh / 2 }, { x: lx + lw / 2, y: ly }, { x: lx + lw / 2, y: ly + lh }];
        const m = mids.reduce((a, b) => (Math.hypot(b.x - ax, b.y - ay) < Math.hypot(a.x - ax, a.y - ay) ? b : a));
        ex = m.x;
        ey = m.y;
      }
      const d = s.leader === "straight" || s.place === "marker"
        ? `M${ax} ${ay} L${ex} ${ey}`
        : (s.elbow ?? "v") === "v" ? `M${ax} ${ay} V${ey} H${ex}` : `M${ax} ${ay} H${ex} V${ey}`;
      next[s.key] = { ax, ay, lx, ly, lw, lh, d };
    }
    return next;
  }, [specs]);

  useEffect(() => {
    const root = ref.current;
    if (!root || !armed || played.current) return;
    let alive = true;
    let io: IntersectionObserver | null = null;
    let tl: { kill(): void } | null = null;

    const start = () => {
      if (played.current) return;
      played.current = true;
      const g = measure();
      if (!g) return;
      setGeo(g);
      if (reducedMotion()) { setPhase("done"); return; }
      void Promise.all([loadGsapFor(!!root.closest(".lp-hero")), loadDrawSVG()]).then(([{ gsap }]) => {
        if (!alive) return;
        // gsap owns visibility/opacity/transform from here (its fromTo sets
        // the start state at once); React only ever positions the pieces.
        const timeline = gsap.timeline({ onComplete: () => alive && setPhase("done") });
        specs.forEach((s, i) => {
          const at = i * 0.35;
          const path = root.querySelector(`[data-callout-path="${s.key}"]`);
          const node = root.querySelector(`[data-callout-node="${s.key}"]`);
          const label = root.querySelector(`[data-callout-label="${s.key}"]`);
          if (!path || !node || !label) return;
          timeline.fromTo(node, { scale: 0, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.25, ease: "power2.out" }, at);
          timeline.fromTo(path, { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.55, ease: "power2.inOut" }, at + 0.1);
          timeline.fromTo(label, { autoAlpha: 0, y: 4 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: "power2.out" }, at + 0.6);
        });
        tl = timeline;
        setPhase("drawing");
      });
    };

    io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { io?.disconnect(); start(); } }, { threshold: 0.4 });
    io.observe(root);
    return () => { alive = false; io?.disconnect(); tl?.kill(); };
  }, [armed, specs, measure]);

  // After the play, keep the geometry honest through a resize.
  useEffect(() => {
    if (phase !== "done") return;
    const onResize = () => { const g = measure(); if (g) setGeo(g); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase, measure]);

  // While idle the stylesheet hides every piece (.lp-callouts-pending); once
  // the timeline exists it has already set its own start state inline.
  return (
    <div ref={ref} className={`pointer-events-none absolute inset-0 z-30${phase === "idle" ? " lp-callouts-pending" : ""}`} aria-hidden>
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        {specs.map((s) => {
          const g = geo[s.key];
          if (!g) return null;
          return (
            <path
              key={s.key}
              data-callout-path={s.key}
              d={g.d}
              fill="none"
              stroke="#0a0a0a"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      {specs.map((s) => {
        const g = geo[s.key];
        return (
          <span key={s.key}>
            {g && (
              <span
                data-callout-node={s.key}
                className="absolute block border-[1.5px] border-[#0a0a0a] bg-[#f2f0eb]"
                style={{ width: NODE, height: NODE, left: g.ax - NODE / 2, top: g.ay - NODE / 2 }}
              />
            )}
            <span
              data-callout-label={s.key}
              className="absolute block whitespace-nowrap border border-[#0a0a0a] bg-[#f2f0eb] px-1.5 py-[3px] font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#0a0a0a]"
              style={{ left: g ? g.lx : -9999, top: g ? g.ly : -9999 }}
            >
              {s.text}
            </span>
          </span>
        );
      })}
    </div>
  );
}
