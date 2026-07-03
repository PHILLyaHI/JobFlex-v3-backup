"use client";
import * as React from "react";
import type { RoofModel, EvLineType } from "@/lib/eagleview";
import {
  buildIndexes,
  ringOf,
  centroid,
  downSlopeScreen,
  type Vec2,
} from "./roofGeometry";
import {
  LINE_COLORS,
  LINE_LABEL,
  PRIMARY_LINE_TYPES,
  feetWhole,
  pitchNumber,
  areaNumber,
  type LabelMode,
} from "./roofViz";

// Top-down CAD blueprint of the roof. `mode` filters what the diagram annotates:
//   shaded → clean massing · pitch → pitch # + down-slope arrow per facet
//   area   → sqft per facet · length → colored edges with length labels
// Pan with drag, zoom with wheel. Light canvas; labels carry a white halo.
export function RoofWireframe({
  model,
  mode,
  className,
}: {
  model: RoofModel;
  mode: LabelMode;
  className?: string;
}) {
  // ── Pre-projected geometry, memoized on the model (NOT on pan/zoom) ──
  const { facets, segs, fit } = React.useMemo(() => {
    const idx = buildIndexes(model);
    const project = (p: { x: number; y: number }): Vec2 => ({ x: p.x, y: -p.y });

    const facets = model.faces
      .map((f) => {
        const ring = ringOf(f.lineIds, idx);
        if (!ring) return null;
        const c = centroid(ring);
        return {
          id: f.id,
          ringScreen: ring.map(project),
          c: project(c),
          slope: downSlopeScreen(ring),
          pitch: f.pitch,
          area: f.areaSqft,
        };
      })
      .filter(Boolean) as {
      id: string;
      ringScreen: Vec2[];
      c: Vec2;
      slope: Vec2 | null;
      pitch: number;
      area: number;
    }[];

    const segs = model.lines
      .map((l) => {
        const a = idx.pointsById.get(l.aId);
        const b = idx.pointsById.get(l.bId);
        if (!a || !b) return null;
        return { id: l.id, type: l.type, a: project(a), b: project(b), lengthFt: l.lengthFt };
      })
      .filter(Boolean) as {
      id: string;
      type: EvLineType;
      a: Vec2;
      b: Vec2;
      lengthFt: number;
    }[];

    const xs = facets.flatMap((f) => f.ringScreen.map((p) => p.x)).concat(segs.map((s) => s.a.x));
    const ys = facets.flatMap((f) => f.ringScreen.map((p) => p.y)).concat(segs.map((s) => s.a.y));
    const minX = Math.min(...xs, 0);
    const maxX = Math.max(...xs, 0);
    const minY = Math.min(...ys, 0);
    const maxY = Math.max(...ys, 0);
    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    const pad = Math.max(w, h) * 0.06;
    const fit = { x: minX - pad, y: minY - pad, w: w + pad * 2, h: h + pad * 2, span: Math.max(w, h) };
    return { facets, segs, fit };
  }, [model]);

  // ── Collision-resolved length labels (computed at base zoom = worst case) ──
  const lengthLabels = React.useMemo(() => {
    const base = fit.span / 55;
    const center = { x: fit.x + fit.w / 2, y: fit.y + fit.h / 2 };
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const out: { id: string; x: number; y: number; text: string }[] = [];
    const candidates = segs
      .filter((s) => PRIMARY_LINE_TYPES.includes(s.type))
      .sort((a, b) => b.lengthFt - a.lengthFt);
    for (const s of candidates) {
      const dx = s.b.x - s.a.x;
      const dy = s.b.y - s.a.y;
      const len = Math.hypot(dx, dy);
      if (len < base * 2.2) continue; // physically too short to label
      const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
      const n = { x: -dy / len, y: dx / len }; // unit normal
      const text = feetWhole(s.lengthFt);
      const box = { w: text.length * base * 0.62, h: base * 1.2 };
      // Try the normal side facing the model center first, then the other.
      const toward = (mid.x - center.x) * n.x + (mid.y - center.y) * n.y > 0 ? -1 : 1;
      let pos: { x: number; y: number } | null = null;
      for (const side of [toward, -toward]) {
        const p = { x: mid.x + n.x * base * 0.9 * side, y: mid.y + n.y * base * 0.9 * side };
        const b = { x: p.x - box.w / 2, y: p.y - box.h / 2, w: box.w, h: box.h };
        const hit = placed.some(
          (q) => Math.abs(q.x + q.w / 2 - p.x) < (q.w + box.w) / 2 && Math.abs(q.y + q.h / 2 - p.y) < (q.h + box.h) / 2,
        );
        if (!hit) {
          pos = p;
          placed.push(b);
          break;
        }
      }
      if (pos) out.push({ id: s.id, x: pos.x, y: pos.y, text });
    }
    return out;
  }, [segs, fit]);

  // ── Pan / zoom ──
  const [vb, setVb] = React.useState(fit);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const drag = React.useRef<{ x: number; y: number } | null>(null);

  // Native, NON-passive wheel listener: React's synthetic onWheel is passive, so
  // its preventDefault() is ignored and the page scrolls. Binding the native
  // event with { passive: false } lets us swallow the scroll and zoom instead
  // (cursor-anchored) whenever the pointer is over the blueprint.
  const vbRef = React.useRef(vb);
  React.useEffect(() => {
    vbRef.current = vb;
  }, [vb]);
  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const v = vbRef.current;
      const factor = e.deltaY > 0 ? 1.12 : 0.89;
      const rect = svg.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const nw = Math.min(Math.max(v.w * factor, fit.span * 0.12), fit.span * 4);
      const nh = nw * (v.h / v.w);
      setVb({ x: v.x + (v.w - nw) * px, y: v.y + (v.h - nh) * py, w: nw, h: nh, span: fit.span });
    };
    svg.addEventListener("wheel", onWheelNative, { passive: false });
    return () => svg.removeEventListener("wheel", onWheelNative);
  }, [fit]);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const dx = ((e.clientX - drag.current.x) / rect.width) * vb.w;
    const dy = ((e.clientY - drag.current.y) / rect.height) * vb.h;
    drag.current = { x: e.clientX, y: e.clientY };
    setVb((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
  }
  function onPointerUp() {
    drag.current = null;
  }

  // ── Render scale: keep label text & arrows ~constant on screen at any zoom ──
  const k = vb.w / fit.w;
  const font = (fit.span / 55) * k;
  const centroidFont = font * 1.35;
  const arrowLen = fit.span * 0.036 * k;

  const textForward = mode === "pitch" || mode === "area";
  const strokeW = (type: EvLineType) => {
    const primary = PRIMARY_LINE_TYPES.includes(type);
    if (mode === "length") return primary ? 2 : 1.25;
    if (textForward) return primary ? 1.25 : 0.75;
    return primary ? 2 : 1.25;
  };
  const fillOpacity = mode === "length" ? 0.05 : 0.07;
  const typesPresent = PRIMARY_LINE_TYPES.filter((lt) => segs.some((s) => s.type === lt));

  return (
    <div className={`relative ${className ?? ""}`}>
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className="w-full h-full touch-none select-none cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* facet fills */}
        {facets.map((f) => (
          <polygon
            key={`fill-${f.id}`}
            points={f.ringScreen.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="#1f7a52"
            fillOpacity={fillOpacity}
            stroke="none"
          />
        ))}

        {/* edges, colored by type */}
        {segs.map((s) => (
          <line
            key={s.id}
            x1={s.a.x}
            y1={s.a.y}
            x2={s.b.x}
            y2={s.b.y}
            stroke={LINE_COLORS[s.type]}
            strokeWidth={strokeW(s.type)}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* pitch mode — down-slope arrows */}
        {mode === "pitch" &&
          facets.map((f) => {
            const d = f.slope;
            if (!d) return null;
            // A small, neat slope marker tucked just past the pitch number.
            const tail = { x: f.c.x + d.x * centroidFont * 0.62, y: f.c.y + d.y * centroidFont * 0.62 };
            const head = { x: tail.x + d.x * arrowLen, y: tail.y + d.y * arrowLen };
            const hl = arrowLen * 0.34;
            const hw = arrowLen * 0.17;
            const perp = { x: -d.y, y: d.x };
            const base = { x: head.x - d.x * hl, y: head.y - d.y * hl };
            const p1 = { x: base.x + perp.x * hw, y: base.y + perp.y * hw };
            const p2 = { x: base.x - perp.x * hw, y: base.y - perp.y * hw };
            return (
              <g key={`arr-${f.id}`} style={{ pointerEvents: "none" }}>
                <line
                  x1={tail.x}
                  y1={tail.y}
                  x2={base.x}
                  y2={base.y}
                  stroke="#5a6473"
                  strokeWidth={1.1}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
                <polygon points={`${head.x},${head.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`} fill="#5a6473" />
              </g>
            );
          })}

        {/* centroid labels — pitch # (bold, larger) or area sqft (lighter, like length) */}
        {(mode === "pitch" || mode === "area") &&
          facets.map((f) => {
            const isPitch = mode === "pitch";
            const fs = isPitch ? centroidFont : font * 1.05;
            return (
              <text
                key={`c-${f.id}`}
                x={f.c.x}
                y={f.c.y}
                fontSize={fs}
                fontWeight={500}
                fill="#14181f"
                stroke="#ffffff"
                strokeWidth={fs * 0.2}
                paintOrder="stroke"
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ pointerEvents: "none", fontVariantNumeric: "tabular-nums" }}
              >
                {isPitch ? pitchNumber(f.pitch) : areaNumber(f.area)}
              </text>
            );
          })}

        {/* length mode — edge length labels (collision-resolved positions) */}
        {mode === "length" &&
          lengthLabels.map((l) => (
            <text
              key={`l-${l.id}`}
              x={l.x}
              y={l.y}
              fontSize={font}
              fill="#14181f"
              stroke="#ffffff"
              strokeWidth={font * 0.18}
              paintOrder="stroke"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ pointerEvents: "none", fontVariantNumeric: "tabular-nums" }}
            >
              {l.text}
            </text>
          ))}
      </svg>

      {/* legend — only in length mode (the colored-edge CAD view) */}
      {mode === "length" && (
        <div className="absolute left-3 bottom-3 flex flex-wrap gap-x-3 gap-y-1 rounded-[var(--r-sm)] bg-white/85 backdrop-blur px-2.5 py-1.5 hairline">
          {typesPresent.map((lt) => (
            <span key={lt} className="flex items-center gap-1.5 text-[10px] text-[color:var(--ink-muted)]">
              <span className="h-2 w-3 rounded-sm" style={{ backgroundColor: LINE_COLORS[lt] }} />
              {LINE_LABEL[lt]}
            </span>
          ))}
        </div>
      )}

      <div className="absolute right-3 top-3 text-[10px] text-[color:var(--ink-faint)] bg-white/70 rounded px-2 py-0.5 pointer-events-none">
        scroll to zoom · drag to pan
      </div>
    </div>
  );
}
