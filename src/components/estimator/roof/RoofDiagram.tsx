"use client";
import * as React from "react";
import type { EvLineType } from "@/lib/eagleview";
import type { DiagramEdge, DiagramLayers, DiagramLayout, Pt } from "@/lib/roofDiagram/layoutTypes";
import { fmtArea, renderDiagramSvg } from "@/lib/roofDiagram/layout";
import { LINE_COLORS, PRIMARY_LINE_TYPES } from "./roofViz";

// Interactive plan-view roof drawing over a pre-computed DiagramLayout.
//
// The layout (src/lib/roofDiagram/layout.ts) already holds every projected
// ring, typed edge, placed label and printed figure; this component only draws
// it and handles the viewport. Nothing here measures a polygon — every number
// on screen is the layout's `lengthLabel` / `pitchLabel` / `areaLabel`.
//
//   · facets     fill rgba(24,84,160,.10), ink outline (currentColor), fixed 1.2 px
//   · edges      LINE_COLORS by type, primary 2 px / other 1.25 px, non-scaling
//   · labels     JetBrains Mono with a white halo; sizes derive from
//                layout.fontFt × (viewBox.w / frame.w) so they stay the same
//                size on screen at any zoom (the RoofWireframe trick)
//   · overlays   north arrow, legend, stamps and the hint are HTML positioned
//                over the SVG so they never scale with the drawing
//
// interactive: drag-pan · wheel zoom (native non-passive, cursor-anchored,
// 0.12×–4× of the fitted span) · one-finger pan · two-finger pinch ·
// double-tap or the Fit button resets · pan is clamped so ≥ 20% of the frame
// stays in view. Non-interactive renders static with no listeners.
//
// ref: toSvgString(layers) delegates to renderDiagramSvg; toPngDataUrl draws
// that SVG through an <img> onto a canvas (1600×1200 × scale).

export interface RoofDiagramHandle {
  toSvgString(layers?: DiagramLayers): string;
  toPngDataUrl(opts?: { scale?: number; layers?: DiagramLayers }): Promise<string>;
}

export interface RoofDiagramProps {
  layout: DiagramLayout;
  layers: DiagramLayers;
  interactive?: boolean;
  className?: string;
}

const EXPORT_W = 1600;
const EXPORT_H = 1200;
const ZOOM_MIN = 0.12; // × fitted span
const ZOOM_MAX = 4;
const MONO = "var(--font-mono), ui-monospace, monospace";
const INK = "var(--color-ink, #0a0a0a)";
const FACET_FILL = "rgba(24,84,160,.10)";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  span: number;
}

/** Text rotation folded into [-90, 90) — the same fold layout.ts applies to placed labels. */
function readableAngle(deg: number): number {
  let d = ((deg % 360) + 360) % 360;
  if (d >= 90 && d < 270) d -= 180;
  else if (d >= 270) d -= 360;
  return d;
}

/** Keep at least 20% of the fitted frame inside the viewport on each axis. */
function clampPan(v: Box, fit: Box): Box {
  const x = Math.min(Math.max(v.x, fit.x - v.w * 0.8), fit.x + fit.w - v.w * 0.2);
  const y = Math.min(Math.max(v.y, fit.y - v.h * 0.8), fit.y + fit.h - v.h * 0.2);
  return x === v.x && y === v.y ? v : { ...v, x, y };
}

/** viewBox → client mapping for the default `xMidYMid meet` behaviour. */
function mapping(v: Box, rect: DOMRect) {
  const s = Math.min(rect.width / v.w, rect.height / v.h);
  return { s, offX: (rect.width - v.w * s) / 2, offY: (rect.height - v.h * s) / 2 };
}

function clientToWorld(v: Box, rect: DOMRect, cx: number, cy: number): Pt {
  const { s, offX, offY } = mapping(v, rect);
  return { x: v.x + (cx - rect.left - offX) / s, y: v.y + (cy - rect.top - offY) / s };
}

/** New viewBox of width `nw` (aspect kept) with `world` pinned under client (cx, cy). */
function placeAt(v: Box, rect: DOMRect, world: Pt, cx: number, cy: number, nw: number): Box {
  const w = Math.min(Math.max(nw, v.span * ZOOM_MIN), v.span * ZOOM_MAX);
  const h = w * (v.h / v.w);
  // `meet` keeps the letterbox offsets when the aspect is unchanged.
  const { offX, offY } = mapping(v, rect);
  const s = Math.min(rect.width / w, rect.height / h);
  return { x: world.x - (cx - rect.left - offX) / s, y: world.y - (cy - rect.top - offY) / s, w, h, span: v.span };
}

/** Hover label for an edge the layout gave none (too short / nothing fit): mid-edge, folded readable. */
function fallbackEdgeLabel(e: DiagramEdge): { pos: Pt; angleDeg: number } {
  return {
    pos: { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 },
    angleDeg: readableAngle((Math.atan2(e.b.y - e.a.y, e.b.x - e.a.x) * 180) / Math.PI),
  };
}

export const RoofDiagram = React.forwardRef<RoofDiagramHandle, RoofDiagramProps>(function RoofDiagram(
  { layout, layers, interactive = false, className },
  ref,
) {
  const uid = React.useId().replace(/:/g, "");
  const hatchId = `rd-hatch-${uid}`;

  // ── Fitted box from the layout frame (memoized on its numbers, not the object) ──
  const { minX, minY, width, height } = layout.frame;
  const fit = React.useMemo<Box>(
    () => ({ x: minX, y: minY, w: Math.max(width, 1e-6), h: Math.max(height, 1e-6), span: Math.max(width, height, 1e-6) }),
    [minX, minY, width, height],
  );

  const colorOf = React.useMemo(() => {
    const m = new Map<EvLineType, string>();
    for (const l of layout.legend) m.set(l.type, l.color);
    return (t: EvLineType) => m.get(t) ?? LINE_COLORS[t];
  }, [layout.legend]);

  const facetPoints = React.useMemo(
    () => layout.facets.map((f) => f.ring.map((p) => `${p.x},${p.y}`).join(" ")),
    [layout.facets],
  );

  // ── Viewport ──
  const [vb, setVb] = React.useState<Box>(fit);
  // A new layout refits the viewport (derived-state reset, no effect round-trip).
  const [fitSeen, setFitSeen] = React.useState(fit);
  if (fitSeen !== fit) {
    setFitSeen(fit);
    setVb(fit);
  }
  const vbRef = React.useRef(vb);
  React.useEffect(() => {
    vbRef.current = vb;
  }, [vb]);

  const svgRef = React.useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);

  // Pointer bookkeeping for pan / pinch / double-tap. Refs: no re-render per move.
  const pointers = React.useRef(new Map<number, { x: number; y: number }>());
  const pan = React.useRef<{ x: number; y: number; moved: number } | null>(null);
  const pinch = React.useRef<{ d0: number; world: Pt; v0: Box } | null>(null);
  const lastTap = React.useRef<{ t: number; x: number; y: number } | null>(null);

  // Native, NON-passive wheel listener: React's onWheel is passive, so its
  // preventDefault() is ignored and the page scrolls instead of the drawing zooming.
  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !interactive) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const factor = Math.sign(e.deltaY) > 0 ? 1.12 : 0.89;
      const { clientX, clientY } = e;
      // Functional update: batched wheel events must each step from the latest box.
      setVb((v) => {
        const world = clientToWorld(v, rect, clientX, clientY);
        return clampPan(placeAt(v, rect, world, clientX, clientY, v.w * factor), fit);
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [interactive, fit]);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive) return;
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setHovered(null);
    if (pointers.current.size === 1) {
      pan.current = { x: e.clientX, y: e.clientY, moved: 0 };
      pinch.current = null;
      setDragging(true);
    } else if (pointers.current.size === 2) {
      const [p, q] = Array.from(pointers.current.values());
      const rect = svg.getBoundingClientRect();
      const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      pinch.current = {
        d0: Math.max(Math.hypot(q.x - p.x, q.y - p.y), 1),
        world: clientToWorld(vbRef.current, rect, mid.x, mid.y),
        v0: vbRef.current,
      };
      pan.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive || !pointers.current.has(e.pointerId)) return;
    const svg = svgRef.current;
    if (!svg) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = svg.getBoundingClientRect();

    if (pinch.current && pointers.current.size >= 2) {
      const [p, q] = Array.from(pointers.current.values());
      const d1 = Math.max(Math.hypot(q.x - p.x, q.y - p.y), 1);
      const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      const { d0, world, v0 } = pinch.current;
      setVb(clampPan(placeAt(v0, rect, world, mid.x, mid.y, v0.w * (d0 / d1)), fit));
      return;
    }
    if (pan.current) {
      const { s } = mapping(vbRef.current, rect);
      const dx = (e.clientX - pan.current.x) / s;
      const dy = (e.clientY - pan.current.y) / s;
      pan.current.moved += Math.hypot(e.clientX - pan.current.x, e.clientY - pan.current.y);
      pan.current.x = e.clientX;
      pan.current.y = e.clientY;
      setVb((v) => clampPan({ ...v, x: v.x - dx, y: v.y - dy }, fit));
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive) return;
    const svg = svgRef.current;
    if (svg?.hasPointerCapture?.(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const moved = pan.current?.moved ?? Number.POSITIVE_INFINITY;

    if (pointers.current.size === 1) {
      // Pinch ended with a finger still down: continue as a pan from it.
      const [rest] = Array.from(pointers.current.values());
      pinch.current = null;
      pan.current = { x: rest.x, y: rest.y, moved: Number.POSITIVE_INFINITY };
      return;
    }
    if (pointers.current.size === 0) {
      pinch.current = null;
      pan.current = null;
      setDragging(false);
      // Double-tap / double-click → reset the viewport to the fitted frame.
      const now = performance.now();
      const tap = moved < 8 ? { t: now, x: e.clientX, y: e.clientY } : null;
      const prev = lastTap.current;
      if (tap && prev && now - prev.t < 320 && Math.hypot(tap.x - prev.x, tap.y - prev.y) < 24) {
        lastTap.current = null;
        setVb(fit);
      } else {
        lastTap.current = tap;
      }
    }
  };

  // ── Imperative export API ──
  React.useImperativeHandle(
    ref,
    () => ({
      toSvgString(ls) {
        return renderDiagramSvg(layout, ls ?? layers, {
          width: EXPORT_W,
          height: EXPORT_H,
          header: false,
          background: true,
        });
      },
      toPngDataUrl(opts) {
        const scale = opts?.scale ?? 2;
        const svg = renderDiagramSvg(layout, opts?.layers ?? layers, {
          width: EXPORT_W,
          height: EXPORT_H,
          header: false,
          background: true,
        });
        const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        return new Promise<string>((resolve, reject) => {
          const img = new Image();
          img.decoding = "sync";
          img.onload = () => {
            try {
              const canvas = document.createElement("canvas");
              canvas.width = Math.round(EXPORT_W * scale);
              canvas.height = Math.round(EXPORT_H * scale);
              const ctx = canvas.getContext("2d");
              if (!ctx) throw new Error("Roof diagram: canvas 2D context unavailable");
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              resolve(canvas.toDataURL("image/png"));
            } catch (err) {
              reject(err instanceof Error ? err : new Error(String(err)));
            } finally {
              URL.revokeObjectURL(url);
            }
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Roof diagram: the SVG could not be rasterised for PNG export"));
          };
          img.src = url;
        });
      },
    }),
    [layout, layers],
  );

  // ── Screen-constant sizes: feet per pixel changes with zoom, the font must not ──
  const k = vb.w / fit.w;
  const fs = layout.fontFt * k; //        facet ID     (8.5px/700 in the spec)
  const fsSub = fs * 0.82; //             pitch / area / edge lengths (7px/600)
  const arrowLen = fs * 1.6;

  const isPrimary = (t: EvLineType) => PRIMARY_LINE_TYPES.includes(t);
  const haloStyle = (size: number, weight: number): React.CSSProperties => ({
    fontFamily: MONO,
    fontSize: size,
    fontWeight: weight,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "0.02em",
    fill: INK,
    stroke: "#ffffff",
    strokeWidth: size * 0.22,
    strokeLinejoin: "round",
    paintOrder: "stroke",
    pointerEvents: "none",
    userSelect: "none",
  });

  const t = layout.totals;
  const ariaLabel =
    `Roof plan${layout.header.address ? ` of ${layout.header.address}` : ""}: ` +
    `${fmtArea(t.areaSqft)}, ${t.squares.toFixed(1)} squares, predominant pitch ${t.predominantPitch}` +
    (t.facetCount > 0 ? `, ${t.facetCount} facets` : "") +
    (layout.stamps.length ? `. ${layout.stamps.join(". ")}` : "");

  const showEdgeLabel = (e: DiagramEdge) => {
    if (hovered === e.id) return true;
    return layers.lengths && !e.short && e.label !== null;
  };

  return (
    <div
      className={`rd-wrap relative ${className ?? ""}`}
      style={{ position: "relative", overflow: "hidden", color: INK }}
    >
      <svg
        ref={svgRef}
        role="img"
        aria-label={ariaLabel}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className="rd-svg w-full h-full"
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          touchAction: interactive ? "none" : "auto",
          userSelect: "none",
          cursor: interactive ? (dragging ? "grabbing" : "grab") : "default",
        }}
        onPointerDown={interactive ? onPointerDown : undefined}
        onPointerMove={interactive ? onPointerMove : undefined}
        onPointerUp={interactive ? onPointerUp : undefined}
        onPointerCancel={interactive ? onPointerUp : undefined}
      >
        <defs>
          {/* Chimney hatch — 45° ink lines; spacing is in feet so it zooms with the plan. */}
          <pattern
            id={hatchId}
            patternUnits="userSpaceOnUse"
            width={layout.fontFt * 0.5}
            height={layout.fontFt * 0.5}
            patternTransform="rotate(45)"
          >
            <line x1={0} y1={0} x2={0} y2={layout.fontFt * 0.5} stroke={INK} strokeWidth={layout.fontFt * 0.06} />
          </pattern>
        </defs>

        {/* facets */}
        {layout.facets.map((f, i) => (
          <polygon
            key={`f-${f.id}`}
            points={facetPoints[i]}
            style={{ fill: FACET_FILL, stroke: "currentColor", strokeWidth: 1.2, strokeLinejoin: "round" }}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* edges, coloured by type */}
        {layout.edges.map((e) => (
          <line
            key={`e-${e.id}`}
            x1={e.a.x}
            y1={e.a.y}
            x2={e.b.x}
            y2={e.b.y}
            style={{
              stroke: colorOf(e.type),
              strokeWidth: hovered === e.id ? 3 : isPrimary(e.type) ? 2 : 1.25,
              strokeLinecap: "round",
              pointerEvents: "none",
            }}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* chimneys — hatched plan rect + label, no dimensions */}
        {layers.chimneys &&
          layout.chimneys.map((c, i) => (
            <g key={`c-${i}`} style={{ pointerEvents: "none" }}>
              <rect
                x={c.x - c.wFt / 2}
                y={c.y - c.hFt / 2}
                width={c.wFt}
                height={c.hFt}
                style={{ fill: `url(#${hatchId})`, stroke: INK, strokeWidth: 1.25 }}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={c.x}
                y={c.y + c.hFt / 2 + fsSub * 0.9}
                textAnchor="middle"
                dominantBaseline="middle"
                style={haloStyle(fsSub * 0.9, 600)}
              >
                {c.label}
              </text>
            </g>
          ))}

        {/* facet centre stacks — ID / pitch / area, whichever layers are on */}
        {layout.facets.map((f) => {
          const lines: Array<{ text: string; size: number; weight: number }> = [];
          if (layers.ids) lines.push({ text: f.label, size: fs, weight: 700 });
          if (layers.pitch) lines.push({ text: f.pitchLabel, size: fsSub, weight: 600 });
          if (layers.area) lines.push({ text: f.areaLabel, size: fsSub, weight: 600 });
          const total = lines.reduce((s, l) => s + l.size * 1.18, 0);
          let y = f.centroid.y - total / 2;
          const rows = lines.map((l, i) => {
            const cy = y + (l.size * 1.18) / 2;
            y += l.size * 1.18;
            return (
              <text
                key={i}
                x={f.centroid.x}
                y={cy}
                textAnchor="middle"
                dominantBaseline="middle"
                style={haloStyle(l.size, l.weight)}
              >
                {l.text}
              </text>
            );
          });

          // Down-slope marker: a short arrow tucked just past the stack.
          let arrow: React.ReactNode = null;
          const d = f.slopeDir;
          if (layers.pitch && d) {
            const off = total / 2 + fsSub * 0.4;
            const tail = { x: f.centroid.x + d.x * off, y: f.centroid.y + d.y * off };
            const head = { x: tail.x + d.x * arrowLen, y: tail.y + d.y * arrowLen };
            const hl = arrowLen * 0.36;
            const hw = arrowLen * 0.18;
            const perp = { x: -d.y, y: d.x };
            const base = { x: head.x - d.x * hl, y: head.y - d.y * hl };
            arrow = (
              <g style={{ pointerEvents: "none" }}>
                <line
                  x1={tail.x}
                  y1={tail.y}
                  x2={base.x}
                  y2={base.y}
                  style={{ stroke: INK, strokeWidth: 1.1, strokeLinecap: "round", opacity: 0.7 }}
                  vectorEffect="non-scaling-stroke"
                />
                <polygon
                  points={`${head.x},${head.y} ${base.x + perp.x * hw},${base.y + perp.y * hw} ${base.x - perp.x * hw},${base.y - perp.y * hw}`}
                  style={{ fill: INK, opacity: 0.7 }}
                />
              </g>
            );
          }
          return (
            <g key={`s-${f.id}`}>
              {rows}
              {arrow}
            </g>
          );
        })}

        {/* edge length labels — rotated along the edge; short edges only while hovered */}
        {layout.edges.map((e) => {
          if (!showEdgeLabel(e)) return null;
          // Placed labels arrive already folded into [-90, 90) by the layout.
          const lb = e.label ?? fallbackEdgeLabel(e);
          return (
            <text
              key={`l-${e.id}`}
              transform={`translate(${lb.pos.x} ${lb.pos.y}) rotate(${lb.angleDeg})`}
              textAnchor="middle"
              dominantBaseline="middle"
              style={haloStyle(fsSub, hovered === e.id ? 700 : 600)}
            >
              {e.lengthLabel}
            </text>
          );
        })}

        {/* wide invisible hit strokes — hover reveals the length of any edge */}
        {interactive &&
          layout.edges.map((e) => (
            <line
              key={`h-${e.id}`}
              x1={e.a.x}
              y1={e.a.y}
              x2={e.b.x}
              y2={e.b.y}
              style={{ stroke: "transparent", strokeWidth: 14, strokeLinecap: "round", pointerEvents: "stroke" }}
              vectorEffect="non-scaling-stroke"
              onPointerEnter={() => {
                if (!pan.current && !pinch.current) setHovered(e.id);
              }}
              onPointerLeave={() => setHovered((h) => (h === e.id ? null : h))}
            />
          ))}
      </svg>

      {/* ── HTML overlays: constant size, never part of the zoomable drawing ── */}
      {layout.stamps.length > 0 && (
        <div
          className="rd-stamps"
          aria-hidden
          style={{
            position: "absolute",
            left: interactive ? 12 + 44 + 8 : 12,
            top: 12,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            pointerEvents: "none",
          }}
        >
          {layout.stamps.map((s) => (
            <span
              key={s}
              className="rd-stamp"
              style={{
                display: "inline-block",
                alignSelf: "flex-start",
                border: `2px solid ${INK}`,
                background: "rgba(255,255,255,.85)",
                color: INK,
                padding: "3px 8px",
                fontFamily: MONO,
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                transform: "rotate(-3deg)",
                transformOrigin: "left center",
              }}
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {layers.north && (
        <div
          className="rd-north"
          aria-hidden
          title="True north"
          style={{
            position: "absolute",
            right: 12,
            top: 12,
            width: 44,
            height: 44,
            border: `1.5px solid ${INK}`,
            background: "rgba(255,255,255,.85)",
            color: INK,
            pointerEvents: "none",
          }}
        >
          <svg viewBox="0 0 44 44" width="100%" height="100%" style={{ display: "block" }}>
            <g transform={`rotate(${layout.northAngleDeg} 22 24)`}>
              <line x1={22} y1={38} x2={22} y2={19} stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" />
              <polygon points="22,13 17,22 22,19.5 27,22" fill="currentColor" />
              <text
                x={22}
                y={8.5}
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, fill: "currentColor" }}
              >
                N
              </text>
            </g>
          </svg>
        </div>
      )}

      {layers.legend && layout.legend.length > 0 && (
        <div
          className="rd-legend"
          aria-hidden
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
            display: "flex",
            flexWrap: "wrap",
            gap: "4px 12px",
            maxWidth: "calc(100% - 24px)",
            border: `1.5px solid ${INK}`,
            background: "rgba(255,255,255,.85)",
            padding: "6px 10px",
            pointerEvents: "none",
          }}
        >
          {layout.legend.map((l) => (
            <span
              key={l.type}
              className="rd-legend-item"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontFamily: MONO,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: INK,
              }}
            >
              <span style={{ display: "inline-block", width: 14, height: 3, background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      )}

      {interactive && (
        <button
          type="button"
          className="rd-fit"
          aria-label="Fit the drawing to the view"
          title="Fit to view"
          onClick={() => setVb(fit)}
          style={{
            position: "absolute",
            left: 12,
            top: 12,
            width: 44,
            height: 44,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: `1.5px solid ${INK}`,
            background: "rgba(255,255,255,.85)",
            color: INK,
            font: "inherit",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            lineHeight: 1,
            cursor: "pointer",
            padding: 0,
            touchAction: "manipulation",
          }}
        >
          Fit
        </button>
      )}

      {interactive && (
        <div
          className="rd-hint"
          aria-hidden
          style={{
            position: "absolute",
            right: 12,
            bottom: 12,
            fontFamily: MONO,
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.04em",
            color: INK,
            opacity: 0.55,
            background: "rgba(255,255,255,.7)",
            padding: "2px 6px",
            pointerEvents: "none",
          }}
        >
          drag · scroll or pinch to zoom · double-tap or Fit resets
        </div>
      )}
    </div>
  );
});
