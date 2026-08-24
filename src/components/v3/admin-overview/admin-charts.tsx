"use client";

// ADMIN charts — inline SVG on the dashboard donor's geometry.
//
// viewBox 860×332, plot 70..790 × 16..288 (symmetric margins), a pale
// graph-paper pattern, four horizontal majors, two 1.5px ink axes, NO
// vertical majors. Points are SQUARES; the last point is filled. The line
// draws itself (stroke-dashoffset, 850ms, --ease-draw) and the fill, points
// and peak note arrive after — the donor's sequence, via the Web Animations
// API instead of the donor's inline-style JS. All marks use the dashboard
// module's global `.ch-*` classes; only the bar fills are this page's own.
//
// THE HANDHELD GEOMETRY (why there are two)
//
// `.chart-wrap svg` is `width: 100%; height: auto`, so ONE user unit renders
// at containerWidth/viewBoxWidth CSS pixels. At 390px the card gives the chart
// about 314px, which scales the donor's 860-unit viewBox by 0.36 — and the
// axis labels decisions.md fixed at 13px ("10.5px was hard to read") came out
// at 4.7px, the peak note at 6.5px. No stylesheet can fix that: a `font-size`
// inside an SVG is in USER units and shrinks with everything else.
//
// So below the shell's 860px breakpoint the chart stops scaling and starts
// fitting: the viewBox width becomes the measured container width, one user
// unit is one CSS pixel, and every published `.ch-*` size renders at the
// number it was authored as. Above 860px the donor's viewBox is untouched.
//
// TOUCH READ PATH. A bar's value used to live only in `<title>` — a hover
// tooltip, which is nothing on a phone. Tapping a bar (or a point) now draws
// the donor's tooltip plate with the same numbers; tapping again, or anywhere
// else in the plot, puts it away. `<title>` stays for the pointer.
//
// Every number drawn here is one the caller passed in. Nothing is smoothed,
// interpolated or estimated.

import { useCallback, useEffect, useId, useRef, useState } from "react";

/** The plot's frame in its own coordinate system. */
interface Geo {
  W: number;
  H: number;
  X0: number;
  X1: number;
  Y0: number;
  Y1: number;
  plotW: number;
  plotH: number;
  /** The four horizontal majors; the axis at Y1 is the fifth line. */
  majors: number[];
  /** How many x labels fit without colliding — points, then bars. */
  xLabelsLine: number;
  xLabelsBar: number;
}

function geo(W: number, H: number, X0: number, X1: number, Y0: number, Y1: number, xl: number, xb: number): Geo {
  const plotW = X1 - X0;
  const plotH = Y1 - Y0;
  return {
    W,
    H,
    X0,
    X1,
    Y0,
    Y1,
    plotW,
    plotH,
    majors: [0, 1, 2, 3].map((k) => Y0 + (k * plotH) / 4),
    xLabelsLine: xl,
    xLabelsBar: xb,
  };
}

/** The donor's numbers, verbatim. */
const DESK = geo(860, 332, 70, 790, 16, 288, 12, 6);

/** The shell hands the layout to its mobile layer here; so does the chart. */
const HANDHELD = "(max-width: 860px)";

/**
 * 1:1 geometry for a measured container. The margins are the donor's
 * proportions cut to what a 13px label actually needs: room for "1.2k" to the
 * left of the axis, half a label's width past the last point, and one line
 * below the baseline.
 */
function fitted(width: number): Geo {
  const W = Math.max(240, Math.round(width));
  const X0 = 40;
  const X1 = W - 22;
  const Y0 = 12;
  const plotH = Math.round(Math.min(230, Math.max(150, W * 0.55)));
  const Y1 = Y0 + plotH;
  const slots = Math.min(12, Math.max(2, Math.floor((X1 - X0) / 62)));
  return geo(W, Y1 + 32, X0, X1, Y0, Y1, slots, Math.min(6, slots));
}

/**
 * The geometry this chart should draw in. Donor above the handheld breakpoint;
 * below it, one user unit per CSS pixel of the measured container.
 *
 * The observer watches the `<svg>` itself, which is `width: 100%` — its WIDTH
 * is the container's and does not depend on the viewBox, so changing the
 * viewBox (which changes only the rendered height) cannot feed back.
 */
function useGeo(ref: React.RefObject<SVGSVGElement | null>): Geo {
  const [g, setG] = useState<Geo>(DESK);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mq = window.matchMedia(HANDHELD);
    let last = -1;

    const apply = () => {
      if (!mq.matches) {
        last = -1;
        setG(DESK);
        return;
      }
      const w = Math.round(el.getBoundingClientRect().width);
      if (w <= 0 || w === last) return;
      last = w;
      setG(fitted(w));
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    mq.addEventListener("change", apply);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", apply);
    };
  }, [ref]);

  return g;
}

/** Four intervals with a "nice" step, so every tick label is a clean number. */
function niceMax(max: number): number {
  if (max <= 4) return 4;
  const raw = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
  return step * 4;
}

function reduced(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function fmtTick(v: number): string {
  if (v >= 1000) return `${Math.round(v / 100) / 10}k`;
  return String(Math.round(v));
}

/**
 * Which x positions get a label. Never the last two in a row: `i % every === 0`
 * can land one step short of the end, and two labels half a step apart read as
 * one smudge at handheld width.
 */
function labelled(n: number, slots: number): (i: number) => boolean {
  const every = Math.max(1, Math.ceil(n / Math.max(1, slots)));
  const clear = Math.ceil(every / 2);
  return (i: number) => i === n - 1 || (i % every === 0 && n - 1 - i >= clear);
}

function Paper({ id, g }: { id: string; g: Geo }) {
  // The donor's 22.5 × 22.67 cell, expressed as the count of cells it made, so
  // the pattern stays square-ish in any frame instead of stretching.
  const cw = g.plotW / Math.max(4, Math.round(g.plotW / 22.5));
  const ch = g.plotH / Math.max(4, Math.round(g.plotH / 22.67));
  return (
    <>
      <defs>
        <pattern id={id} x={g.X0} y={g.Y0} width={cw} height={ch} patternUnits="userSpaceOnUse">
          <path d={`M ${cw} 0 L 0 0 0 ${ch}`} className="ch-minor" fill="none" />
        </pattern>
      </defs>
      <rect x={g.X0} y={g.Y0} width={g.plotW} height={g.plotH} fill={`url(#${id})`} />
      {g.majors.map((y) => (
        <line key={y} x1={g.X0} y1={y} x2={g.X1} y2={y} className="ch-major" />
      ))}
      <line x1={g.X0} y1={g.Y0} x2={g.X0} y2={g.Y1} className="ch-axis" />
      <line x1={g.X0} y1={g.Y1} x2={g.X1} y2={g.Y1} className="ch-axis" />
    </>
  );
}

function YTicks({ yMax, g }: { yMax: number; g: Geo }) {
  const step = yMax / 4;
  return (
    <g>
      {[...g.majors, g.Y1].map((y, k) => (
        <text key={y} x={g.X0 - 12} y={y + 4} textAnchor="end" className="ch-lbl">
          {fmtTick(yMax - k * step)}
        </text>
      ))}
    </g>
  );
}

/**
 * The tapped mark's numbers, on the donor's tooltip plate. Anchored to the top
 * of the plot on the side AWAY from the mark, so the thing being read is never
 * the thing being covered. Inert to the pointer — a plate that swallowed the
 * next tap would need a second tap to dismiss.
 */
function Readout({ g, lines, at }: { g: Geo; lines: string[]; at: number }) {
  const LH = 17;
  const PAD = 10;
  const w = Math.max(...lines.map((l) => l.length)) * 7.9 + PAD * 2;
  const h = lines.length * LH + PAD * 2 - 4;
  const left = at > (g.X0 + g.X1) / 2;
  const x = left ? g.X0 + 6 : g.X1 - w - 6;
  const y = g.Y0 + 6;
  return (
    <g pointerEvents="none">
      <rect x={x} y={y} width={w} height={h} rx="2" className="ch-tip-box" />
      {lines.map((l, k) => (
        <text key={l + k} x={x + PAD} y={y + PAD + 12 + k * LH} className="ch-tip-text">
          {l}
        </text>
      ))}
    </g>
  );
}

// ── Line ──────────────────────────────────────────────────────────────

export interface LinePoint {
  label: string;
  value: number;
}

/** The peak's value, annotated beside its square.
 *
 *  It used to be centred 28px BELOW the mark whenever the mark sat near the
 *  top of the plot — and a peak equal to yMax always does, because niceMax
 *  returns exactly the maximum when the maximum is already a clean step
 *  multiple. An 18px mono numeral stacked directly under a 10px square does
 *  not read as an annotation; "8" reads as two more dots on the same point.
 *  So when there is no room above, the numeral steps sideways instead — the
 *  square keeps the point to itself, and every data point still carries
 *  exactly one mark. */
function PeakNote({ x, y, value, g }: { x: number; y: number; value: number; g: Geo }) {
  const tight = y - g.Y0 < 22; // no room for a numeral above the mark
  if (!tight) {
    return (
      <text x={x} y={y - 14} textAnchor="middle" className="ch-note">
        {value}
      </text>
    );
  }
  const left = x > (g.X0 + g.X1) / 2; // near the right edge — annotate inwards
  return (
    <text x={left ? x - 13 : x + 13} y={y + 6} textAnchor={left ? "end" : "start"} className="ch-note">
      {value}
    </text>
  );
}

export function LineChart({ points, ariaLabel }: { points: LinePoint[]; ariaLabel: string }) {
  const pid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const afterRef = useRef<SVGGElement>(null);
  const g = useGeo(svgRef);
  const [active, setActive] = useState<number | null>(null);
  const pick = useCallback((i: number) => setActive((cur) => (cur === i ? null : i)), []);

  const n = points.length;
  const yMax = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const xs = points.map((_, i) => (n > 1 ? g.X0 + (i * g.plotW) / (n - 1) : g.X0 + g.plotW / 2));
  const ys = points.map((p) => g.Y1 - (p.value / yMax) * g.plotH);
  const d = points.map((_, i) => `${i === 0 ? "M" : "L"} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
  const area = n > 0 ? `${d} L ${xs[n - 1].toFixed(1)} ${g.Y1} L ${xs[0].toFixed(1)} ${g.Y1} Z` : "";
  const show = labelled(n, g.xLabelsLine);
  const hit = n > 0 ? g.plotW / n : g.plotW;

  let peak = -1;
  points.forEach((p, i) => {
    if (p.value > 0 && (peak === -1 || p.value > points[peak].value)) peak = i;
  });

  useEffect(() => {
    const line = lineRef.current;
    const after = afterRef.current;
    if (!line || !after) return;
    if (reduced()) return;
    const len = line.getTotalLength();
    line.style.strokeDasharray = `${len}`;
    line.style.strokeDashoffset = `${len}`;
    const draw = line.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
      duration: 850,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      fill: "forwards",
    });
    after.style.opacity = "0";
    const fade = after.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 300,
      delay: 950,
      easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
      fill: "forwards",
    });
    return () => {
      draw.cancel();
      fade.cancel();
      line.style.strokeDasharray = "";
      line.style.strokeDashoffset = "";
      after.style.opacity = "";
    };
  }, [d]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${g.W} ${g.H}`}
      role="img"
      aria-label={ariaLabel}
      onClick={() => setActive(null)}
    >
      <Paper id={`mm-${pid}`} g={g} />
      <YTicks yMax={yMax} g={g} />
      <g>
        {points.map((p, i) =>
          show(i) ? (
            <text key={i} x={xs[i]} y={g.Y1 + 24} textAnchor="middle" className="ch-lbl">
              {p.label}
            </text>
          ) : null,
        )}
      </g>
      {n > 0 && (
        <>
          <path ref={lineRef} d={d} className="ch-line" />
          <g ref={afterRef}>
            <path d={area} className="ch-area" />
            {points.map((_, i) => (
              <rect
                key={i}
                x={xs[i] - 5}
                y={ys[i] - 5}
                width="10"
                height="10"
                className={(active === null ? i === n - 1 : i === active) ? "ch-dot on" : "ch-dot"}
              />
            ))}
            {peak >= 0 && active === null && (
              <PeakNote x={xs[peak]} y={ys[peak]} value={points[peak].value} g={g} />
            )}
          </g>
          {/* Full-height columns, so a 10px square is not the tap target. */}
          <g>
            {points.map((p, i) => (
              <rect
                key={i}
                x={xs[i] - hit / 2}
                y={g.Y0}
                width={hit}
                height={g.plotH}
                fill="transparent"
                onClick={(e) => {
                  e.stopPropagation();
                  pick(i);
                }}
              >
                <title>{`${p.label} · ${p.value}`}</title>
              </rect>
            ))}
          </g>
          {active !== null && points[active] && (
            <Readout g={g} at={xs[active]} lines={[points[active].label, String(points[active].value)]} />
          )}
        </>
      )}
    </svg>
  );
}

// ── Bars ──────────────────────────────────────────────────────────────

export interface BarDay {
  label: string;
  /** Full-width, light bar (pageviews) — or the only series. */
  a: number;
  /** Optional second series, solid (visitors). */
  b?: number;
  /** Tooltip text; defaults to the numbers. */
  title?: string;
}

export function BarChart({
  days,
  ariaLabel,
  classA,
  classB,
  /** What one `a` is, for the tap readout. The legend says it on screen. */
  nameA = "",
  /** What one `b` is. */
  nameB = "",
}: {
  days: BarDay[];
  ariaLabel: string;
  /** Module class for the `a` bars. */
  classA: string;
  /** Module class for the `b` bars. */
  classB?: string;
  nameA?: string;
  nameB?: string;
}) {
  const pid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const g = useGeo(svgRef);
  const [active, setActive] = useState<number | null>(null);

  const n = days.length;
  const two = days.some((d) => d.b !== undefined);
  const yMax = niceMax(Math.max(0, ...days.flatMap((d) => [d.a, d.b ?? 0])));
  const slot = n > 0 ? g.plotW / n : g.plotW;
  const show = labelled(n, g.xLabelsBar);

  const h = (v: number) => (v / yMax) * g.plotH;
  const one = (v: number, name: string) => `${v} ${name}`.trim();
  const caption = (d: BarDay) =>
    two
      ? `${d.label} · ${one(d.b ?? 0, nameB)} · ${one(d.a, nameA)}`
      : `${d.label} · ${one(d.a, nameA)}`;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${g.W} ${g.H}`}
      role="img"
      aria-label={ariaLabel}
      onClick={() => setActive(null)}
    >
      <Paper id={`mm-${pid}`} g={g} />
      <YTicks yMax={yMax} g={g} />
      <g>
        {days.map((d, i) =>
          show(i) ? (
            <text key={i} x={g.X0 + i * slot + slot / 2} y={g.Y1 + 24} textAnchor="middle" className="ch-lbl">
              {d.label}
            </text>
          ) : null,
        )}
      </g>
      <g>
        {days.map((d, i) => {
          const x = g.X0 + i * slot;
          const title = d.title ?? caption(d);
          const bars = two ? (
            <>
              <rect x={x + slot * 0.14} y={g.Y1 - h(d.a)} width={slot * 0.34} height={h(d.a)} className={classA} />
              <rect
                x={x + slot * 0.52}
                y={g.Y1 - h(d.b ?? 0)}
                width={slot * 0.34}
                height={h(d.b ?? 0)}
                className={classB ?? classA}
              />
            </>
          ) : (
            <rect x={x + slot * 0.22} y={g.Y1 - h(d.a)} width={slot * 0.56} height={h(d.a)} className={classA} />
          );
          return (
            <g key={i}>
              <title>{title}</title>
              {bars}
              {/* The whole column is the target: at 30 days on a phone a bar is
                  three pixels wide and nothing can be hit. */}
              <rect
                x={x}
                y={g.Y0}
                width={slot}
                height={g.plotH}
                fill="transparent"
                onClick={(e) => {
                  e.stopPropagation();
                  setActive((cur) => (cur === i ? null : i));
                }}
              />
            </g>
          );
        })}
      </g>
      {active !== null && days[active] && (
        <Readout
          g={g}
          at={g.X0 + active * slot + slot / 2}
          lines={
            two
              ? [days[active].label, one(days[active].b ?? 0, nameB), one(days[active].a, nameA)]
              : [days[active].label, one(days[active].a, nameA)]
          }
        />
      )}
    </svg>
  );
}
