"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/* THE GUIDE LINE through "Run your business" (owner, 2026-09-10): one dashed
   ink path that leaves the Schedule mock, enters and leaves the Revenue
   cards and ends at the Change order, with a square node at every stop.

   Geometry is measured, not written: the three mocks are found by
   [data-guide] and their positions taken from the offset chain (transforms —
   the reveal lift, the parallax drift — do not move the line), re-measured
   by a ResizeObserver on the wrapper and on every mock. Turns are 90° only.

   Desk (two columns): down from the Schedule's bottom centre, across to the
   Revenue chart's top centre, down through it, out of the donut's bottom
   edge, across to the Change order's top centre. Phone (stacked): a
   vertical in the left gutter, x = 10 px, one node beside each mock.

   The line draws with the scroll: a mask path's dashoffset follows a
   reference line at 85 % of the viewport, so the line is drawn to where the
   reader is; a node appears when the line has reached it. Reduced motion:
   everything at once. No gradient, no image. */

type Pt = { x: number; y: number };
type Seg = { a: Pt; b: Pt };
type Node = { p: Pt; at: number };
type Geometry = { d: string; length: number; nodes: Node[]; width: number; height: number; startY: number; endY: number };

const NODE = 8;

function rectIn(el: HTMLElement, root: HTMLElement) {
  let x = 0;
  let y = 0;
  let e: HTMLElement | null = el;
  while (e && e !== root) {
    x += e.offsetLeft;
    y += e.offsetTop;
    e = e.offsetParent as HTMLElement | null;
  }
  return { left: x, top: y, right: x + el.offsetWidth, bottom: y + el.offsetHeight, width: el.offsetWidth, height: el.offsetHeight };
}

/** The visible element for a role: the desk and the phone build each carry one. */
function find(root: HTMLElement, role: string): HTMLElement | null {
  const all = Array.from(root.querySelectorAll<HTMLElement>(`[data-guide="${role}"]`));
  return all.find((el) => el.offsetParent !== null && el.offsetWidth > 0) ?? null;
}

function orthogonal(points: Pt[]): { d: string; segs: Seg[] } {
  let d = `M${points[0].x} ${points[0].y}`;
  const segs: Seg[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    d += b.x === a.x ? ` V${b.y}` : ` H${b.x}`;
    segs.push({ a, b });
  }
  return { d, segs };
}

const len = (s: Seg) => Math.abs(s.b.x - s.a.x) + Math.abs(s.b.y - s.a.y);

function measure(root: HTMLElement): Geometry | null {
  const schedule = find(root, "schedule");
  const chart = find(root, "revenue-in");
  const donut = find(root, "revenue-out");
  const co = find(root, "co");
  if (!schedule || !chart || !donut || !co) return null;
  const S = rectIn(schedule, root);
  const R = rectIn(chart, root);
  const D = rectIn(donut, root);
  const C = rectIn(co, root);
  const width = root.offsetWidth;
  const height = root.offsetHeight;
  const stacked = window.innerWidth < 1024;

  if (stacked) {
    // Phone: the vertical in the left gutter, a node beside each mock's middle.
    const x = 10;
    const ys = Math.round(S.top + S.height / 2);
    const yr = Math.round(R.top + R.height / 2);
    const yc = Math.round(C.top + C.height / 2);
    const { d, segs } = orthogonal([{ x, y: ys }, { x, y: yr }, { x, y: yc }]);
    const l1 = len(segs[0]);
    const l2 = len(segs[1]);
    return {
      d,
      length: l1 + l2,
      nodes: [{ p: { x, y: ys }, at: 0 }, { p: { x, y: yr }, at: l1 }, { p: { x, y: yc }, at: l1 + l2 }],
      width, height, startY: ys, endY: yc,
    };
  }

  // Desk: out of the Schedule, into and through Revenue, into the Change order.
  const sx = Math.round(S.left + S.width / 2);
  const sy = Math.round(S.bottom);
  const rx = Math.round(R.left + R.width / 2);
  const ryIn = Math.round(R.top);
  const ryOut = Math.round(D.bottom);
  const cx = Math.round(C.left + C.width / 2);
  const cy = Math.round(C.top);
  const mid1 = Math.round((sy + ryIn) / 2);
  const mid2 = Math.round((ryOut + cy) / 2);
  const first = orthogonal([{ x: sx, y: sy }, { x: sx, y: mid1 }, { x: rx, y: mid1 }, { x: rx, y: ryIn }]);
  const second = orthogonal([{ x: rx, y: ryOut }, { x: rx, y: mid2 }, { x: cx, y: mid2 }, { x: cx, y: cy }]);
  const l1 = first.segs.reduce((a, s) => a + len(s), 0);
  const l2 = second.segs.reduce((a, s) => a + len(s), 0);
  return {
    d: `${first.d} ${second.d}`,
    length: l1 + l2,
    nodes: [
      { p: { x: sx, y: sy }, at: 0 },
      { p: { x: rx, y: ryIn }, at: l1 },
      { p: { x: rx, y: ryOut }, at: l1 },
      { p: { x: cx, y: cy }, at: l1 + l2 },
    ],
    width, height, startY: sy, endY: cy,
  };
}

export function CrewGuide({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, "");
  const [geo, setGeo] = useState<Geometry | null>(null);
  const [progress, setProgress] = useState(0);
  const [reduced, setReduced] = useState(false);

  // Measure after hydration and on every size change of the wrapper or a mock.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setGeo(measure(root)));
    };
    const ro = new ResizeObserver(update);
    ro.observe(root);
    root.querySelectorAll<HTMLElement>("[data-guide]").forEach((el) => ro.observe(el));
    window.addEventListener("resize", update);
    window.addEventListener("load", update);
    update();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("load", update);
    };
  }, []);

  // Draw with the scroll while the wrapper is on screen.
  useEffect(() => {
    const root = ref.current;
    if (!root || !geo) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const r = requestAnimationFrame(() => {
        setReduced(true);
        setProgress(1);
      });
      return () => cancelAnimationFrame(r);
    }
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const top = root.getBoundingClientRect().top + window.scrollY;
        const reference = window.scrollY + window.innerHeight * 0.85;
        const p = (reference - (top + geo.startY)) / Math.max(1, geo.endY - geo.startY);
        setProgress(Math.min(1, Math.max(0, p)));
      });
    };
    let listening = false;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !listening) {
        listening = true;
        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
      } else if (!entry.isIntersecting && listening) {
        listening = false;
        window.removeEventListener("scroll", onScroll);
      }
    });
    io.observe(root);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      if (listening) window.removeEventListener("scroll", onScroll);
    };
  }, [geo]);

  const drawn = geo ? geo.length * progress : 0;

  return (
    <div ref={ref} id="crew" className="relative">
      {children}
      {geo && (
        <svg
          className="lp-guide"
          width={geo.width}
          height={geo.height}
          viewBox={`0 0 ${geo.width} ${geo.height}`}
          aria-hidden
        >
          <mask id={`${id}-m`} maskUnits="userSpaceOnUse" x="0" y="0" width={geo.width} height={geo.height}>
            <path
              d={geo.d}
              fill="none"
              stroke="#fff"
              strokeWidth="6"
              strokeDasharray={geo.length}
              strokeDashoffset={geo.length - drawn}
              style={reduced ? undefined : { transition: "stroke-dashoffset .35s linear" }}
            />
          </mask>
          <path d={geo.d} fill="none" stroke="#0a0a0a" strokeWidth="1.5" strokeDasharray="6 4" mask={`url(#${id}-m)`} />
          {geo.nodes.map((n, i) => (
            <rect
              key={i}
              x={n.p.x - NODE / 2}
              y={n.p.y - NODE / 2}
              width={NODE}
              height={NODE}
              fill="var(--paper, #f2f0eb)"
              stroke="#0a0a0a"
              strokeWidth="1.5"
              opacity={drawn >= n.at - 1 ? 1 : 0}
              style={reduced ? undefined : { transition: "opacity .25s ease" }}
            />
          ))}
        </svg>
      )}
    </div>
  );
}
