// Roof diagram — the 5-page Letter PDF, drawn from the shared DiagramLayout
// with @react-pdf/renderer's SVG primitives (vector, no rasters).
//
//   1  ROOF PLAN — ALL LAYERS   lengths + pitch + area + ids + north + chimneys + legend
//   2  LENGTHS                  edge dimensions only
//   3  PITCH                    facet pitch + ids + slope arrows
//   4  AREAS                    facet area + ids
//   5  SUMMARY                  totals, linear feet by type, pitch mix, eave
//                               heights, Instant flags
//
// Every printed figure is a label the layout already formatted (lengthLabel,
// pitchLabel, areaLabel, totals) — nothing is re-measured from the polygons.
//
// react-pdf specifics that shape this file:
//   · CSS variables do not exist here, so the blueprint palette is hard-coded.
//   · Only the built-in fonts are available (no font files in the repo):
//     Helvetica / Helvetica-Bold for prose, Courier-Bold for the annotation
//     layer. Courier is a true monospace at 0.6 em per glyph, which is what
//     lets the label halos be sized exactly.
//   · `transform` on SVG children is a no-op in react-pdf (they carry no box,
//     hence no origin), so every rotated shape — the north arrow, the slope
//     arrows — is rotated in code and labels stay horizontal.
//   · <pattern> is unsupported: chimneys are hatched with diagonal lines
//     clipped to their rectangle analytically.
//   · <Image> is fetched server-side, so the logo is only drawn from hosts we
//     trust (Vercel Blob, or the app's own origin) — an SSRF guard.
import * as React from "react";
import { Document, Page, Text, View, StyleSheet, Image, Svg, G, Line, Polygon, Rect } from "@react-pdf/renderer";
import type {
  DiagramChimney,
  DiagramEdge,
  DiagramFacet,
  DiagramLayers,
  DiagramLayout,
  Pt,
} from "@/lib/roofDiagram/layoutTypes";
import { ALL_LAYERS_ON } from "@/lib/roofDiagram/layoutTypes";
import { fmtArea, fmtLength } from "@/lib/roofDiagram/layout";
import { LINE_COLORS, PRIMARY_LINE_TYPES } from "@/components/estimator/roof/roofViz";

// ── Palette (hard-coded — react-pdf cannot read CSS vars) ───────────────────
const INK = "#0a0a0a";
const PAPER = "#f2f0eb";
const BLUEPRINT = "#1854a0";
const WHITE = "#ffffff";
const MUTED = "#5c5b57";
const RULE = "#d9d6ce";

const SANS = "Helvetica";
const SANS_BOLD = "Helvetica-Bold";
const MONO = "Courier-Bold";
/** Courier advance width per glyph, em. */
const MONO_EM = 0.6;

// ── Sheet geometry (pt) ─────────────────────────────────────────────────────
const PAGE_PAD = 40;
const CONTENT_W = 612 - PAGE_PAD * 2; // 532
const DRAW_W = CONTENT_W;
const DRAW_H = 520;
/** Inset inside the drawing box so labels near the perimeter stay inside the frame. */
const DRAW_INSET = 30;
const GRID_STEP = 16;
const SHEET_COUNT = 5;

const s = StyleSheet.create({
  page: {
    backgroundColor: PAPER,
    color: INK,
    padding: PAGE_PAD,
    fontFamily: SANS,
    fontSize: 9,
  },

  // Header band — every page.
  band: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: INK,
  },
  bandLeft: { flexDirection: "row", alignItems: "center", gap: 8, maxWidth: 260 },
  logo: { width: 26, height: 26, objectFit: "contain" },
  company: { fontFamily: SANS_BOLD, fontSize: 12, letterSpacing: -0.2, textTransform: "uppercase" },
  bandRight: { alignItems: "flex-end", gap: 2 },
  bandTitle: { fontFamily: SANS_BOLD, fontSize: 8, letterSpacing: 1.6, textTransform: "uppercase" },
  bandMono: { fontFamily: MONO, fontSize: 7.5, color: INK },
  bandMuted: { fontFamily: SANS, fontSize: 7, color: MUTED },
  addressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 6,
    paddingBottom: 6,
    borderBottomWidth: 0.75,
    borderBottomColor: INK,
  },
  address: { fontFamily: SANS_BOLD, fontSize: 9.5 },
  sourceLine: { fontFamily: SANS, fontSize: 7, color: MUTED, maxWidth: 260, textAlign: "right" },

  // Sheet title row.
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 12,
    marginBottom: 8,
  },
  kicker: { fontFamily: MONO, fontSize: 7, color: BLUEPRINT, letterSpacing: 0.4, marginBottom: 3 },
  sheetTitle: { fontFamily: SANS_BOLD, fontSize: 17, letterSpacing: -0.5, textTransform: "uppercase", lineHeight: 1 },
  stamps: { flexDirection: "row", gap: 6, alignItems: "flex-end" },
  stamp: {
    backgroundColor: INK,
    color: WHITE,
    fontFamily: SANS_BOLD,
    fontSize: 7.5,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    paddingTop: 4,
    paddingBottom: 3,
    paddingLeft: 8,
    paddingRight: 8,
  },

  // Legend row under the drawing.
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8, alignItems: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  swatch: { width: 14, height: 3 },
  legendText: { fontFamily: MONO, fontSize: 7 },
  legendNote: { fontFamily: SANS, fontSize: 7, color: MUTED, marginLeft: "auto" },

  // Summary tables.
  section: { marginTop: 16 },
  sectionLabel: {
    fontFamily: SANS_BOLD,
    fontSize: 7.5,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    paddingBottom: 4,
    borderBottomWidth: 1.5,
    borderBottomColor: INK,
    marginBottom: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 5,
    paddingBottom: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: RULE,
  },
  rowTotal: { borderBottomWidth: 0, borderTopWidth: 1, borderTopColor: INK, marginTop: 1 },
  cellLabel: { flex: 1, fontFamily: SANS, fontSize: 9 },
  cellLabelBold: { flex: 1, fontFamily: SANS_BOLD, fontSize: 9 },
  cellMono: { fontFamily: MONO, fontSize: 8.5, textAlign: "right" },
  cellMonoWide: { width: 96 },
  cellMonoNarrow: { width: 56 },
  swatchCell: { width: 22, alignItems: "flex-start" },
  barTrack: { flex: 1, height: 6, backgroundColor: WHITE, borderWidth: 0.75, borderColor: INK, marginRight: 10 },
  barFill: { height: "100%", backgroundColor: BLUEPRINT },
  twoCol: { flexDirection: "row", gap: 24 },
  col: { flex: 1 },
  totalsGrid: { flexDirection: "row", borderWidth: 1.5, borderColor: INK, backgroundColor: WHITE },
  totalsCell: { flex: 1, paddingTop: 9, paddingBottom: 9, paddingLeft: 10, paddingRight: 10 },
  totalsCellRule: { borderLeftWidth: 1.5, borderLeftColor: INK },
  totalsValue: { fontFamily: SANS_BOLD, fontSize: 16, letterSpacing: -0.4 },
  totalsKey: { fontFamily: MONO, fontSize: 6.5, color: MUTED, marginTop: 2, letterSpacing: 0.3 },

  footer: {
    position: "absolute",
    bottom: 22,
    left: PAGE_PAD,
    right: PAGE_PAD,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: INK,
  },
  footerText: { fontFamily: MONO, fontSize: 6.5, color: MUTED },
  footerSheet: { fontFamily: MONO, fontSize: 7, color: INK },
});

// ── Helpers ─────────────────────────────────────────────────────────────────

const BLOB_HOST = /^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//i;

/**
 * The logo URL react-pdf may fetch server-side: https Vercel Blob, or an
 * absolute URL on the app's own origin. Anything else (data URLs, arbitrary
 * hosts, relative paths) is dropped — the header prints the name alone.
 */
export function safeLogoUrl(url: string | null | undefined, appOrigin?: string): string | null {
  if (!url) return null;
  if (BLOB_HOST.test(url)) return url;
  if (!appOrigin) return null;
  try {
    const u = new URL(url);
    const o = new URL(appOrigin);
    return u.origin === o.origin && (u.protocol === "https:" || u.protocol === "http:") ? url : null;
  } catch {
    return null;
  }
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Maps the layout's feet frame into the drawing box (aspect kept, centred). */
class Mapper {
  readonly scale: number;
  private readonly ox: number;
  private readonly oy: number;

  constructor(frame: DiagramLayout["frame"], width: number, height: number, inset: number) {
    const fw = frame.width > 0 ? frame.width : 1;
    const fh = frame.height > 0 ? frame.height : 1;
    this.scale = Math.min((width - inset * 2) / fw, (height - inset * 2) / fh);
    this.ox = (width - fw * this.scale) / 2 - frame.minX * this.scale;
    this.oy = (height - fh * this.scale) / 2 - frame.minY * this.scale;
  }

  x(v: number): number {
    return r2(this.ox + v * this.scale);
  }

  y(v: number): number {
    return r2(this.oy + v * this.scale);
  }

  pt(p: Pt): Pt {
    return { x: this.x(p.x), y: this.y(p.y) };
  }

  ft(v: number): number {
    return r2(v * this.scale);
  }
}

const pointsAttr = (pts: Pt[]): string => pts.map((p) => `${p.x},${p.y}`).join(" ");

/** Rotate a screen vector clockwise by `deg` (y down). */
function rotate(v: Pt, deg: number): Pt {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const sn = Math.sin(t);
  return { x: v.x * c - v.y * sn, y: v.x * sn + v.y * c };
}

/**
 * 45° hatch segments clipped to the rectangle [x0,x1]×[y0,y1]. Each line is
 * x − y = c; inside the rect it spans y ∈ [x0 − c, x1 − c] ∩ [y0, y1].
 */
function hatchSegments(x0: number, y0: number, x1: number, y1: number, step: number): Array<[Pt, Pt]> {
  const out: Array<[Pt, Pt]> = [];
  const cMin = x0 - y1;
  const cMax = x1 - y0;
  for (let c = Math.ceil(cMin / step) * step; c < cMax; c += step) {
    const lo = Math.max(y0, x0 - c);
    const hi = Math.min(y1, x1 - c);
    if (hi - lo > 0.5) out.push([{ x: r2(lo + c), y: r2(lo) }, { x: r2(hi + c), y: r2(hi) }]);
  }
  return out;
}

/** Halo + text for one horizontal monospace label centred on (x, y). */
function MonoLabel({
  x,
  y,
  text,
  size,
  color = INK,
  halo = true,
}: {
  x: number;
  y: number;
  text: string;
  size: number;
  color?: string;
  halo?: boolean;
}) {
  const w = text.length * MONO_EM * size + 3;
  const h = size * 1.25;
  return (
    <G>
      {halo ? (
        <Rect x={r2(x - w / 2)} y={r2(y - h / 2)} width={r2(w)} height={r2(h)} fill={WHITE} fillOpacity={0.85} />
      ) : null}
      <Text
        x={x}
        y={r2(y + size * 0.36)}
        textAnchor="middle"
        fill={color}
        style={{ fontFamily: MONO, fontSize: size }}
      >
        {text}
      </Text>
    </G>
  );
}

function GraphPaper({ width, height }: { width: number; height: number }) {
  const lines: React.ReactElement[] = [];
  for (let x = GRID_STEP; x < width; x += GRID_STEP) {
    const major = x % (GRID_STEP * 5) === 0;
    lines.push(
      <Line key={`v${x}`} x1={x} y1={0} x2={x} y2={height} stroke={BLUEPRINT} strokeWidth={major ? 0.5 : 0.3} strokeOpacity={major ? 0.22 : 0.12} />,
    );
  }
  for (let y = GRID_STEP; y < height; y += GRID_STEP) {
    const major = y % (GRID_STEP * 5) === 0;
    lines.push(
      <Line key={`h${y}`} x1={0} y1={y} x2={width} y2={y} stroke={BLUEPRINT} strokeWidth={major ? 0.5 : 0.3} strokeOpacity={major ? 0.22 : 0.12} />,
    );
  }
  return <G>{lines}</G>;
}

function NorthArrow({ cx, cy, angleDeg }: { cx: number; cy: number; angleDeg: number }) {
  const len = 15;
  const tip = rotate({ x: 0, y: -len }, angleDeg);
  const tail = rotate({ x: 0, y: len * 0.55 }, angleDeg);
  const headL = rotate({ x: -4, y: -len + 8 }, angleDeg);
  const headR = rotate({ x: 4, y: -len + 8 }, angleDeg);
  const nPos = rotate({ x: 0, y: -len - 8 }, angleDeg);
  const P = (v: Pt): Pt => ({ x: r2(cx + v.x), y: r2(cy + v.y) });
  const t = P(tip);
  const b = P(tail);
  const l = P(headL);
  const rr = P(headR);
  const n = P(nPos);
  return (
    <G>
      <Rect x={cx - 24} y={cy - 32} width={48} height={56} fill={WHITE} fillOpacity={0.9} stroke={INK} strokeWidth={0.75} />
      <Line x1={b.x} y1={b.y} x2={t.x} y2={t.y} stroke={INK} strokeWidth={1.2} />
      <Polygon points={pointsAttr([t, l, rr])} fill={INK} />
      <Text x={n.x} y={r2(n.y + 2.5)} textAnchor="middle" fill={INK} style={{ fontFamily: MONO, fontSize: 7.5 }}>
        N
      </Text>
    </G>
  );
}

function FacetShape({ facet, m }: { facet: DiagramFacet; m: Mapper }) {
  if (facet.ring.length < 3) return null;
  return (
    <Polygon
      points={pointsAttr(facet.ring.map((p) => m.pt(p)))}
      fill={BLUEPRINT}
      fillOpacity={0.1}
      stroke={INK}
      strokeWidth={0.6}
      strokeLinejoin="round"
    />
  );
}

function EdgeShape({ edge, m }: { edge: DiagramEdge; m: Mapper }) {
  const a = m.pt(edge.a);
  const b = m.pt(edge.b);
  const primary = PRIMARY_LINE_TYPES.includes(edge.type);
  return (
    <Line
      x1={a.x}
      y1={a.y}
      x2={b.x}
      y2={b.y}
      stroke={LINE_COLORS[edge.type]}
      strokeWidth={primary ? 1.3 : 0.8}
      strokeLinecap="round"
    />
  );
}

function EdgeLabel({ edge, m, size }: { edge: DiagramEdge; m: Mapper; size: number }) {
  if (edge.short || !edge.label) return null;
  const p = m.pt(edge.label.pos);
  return <MonoLabel x={p.x} y={p.y} text={edge.lengthLabel} size={size} color={LINE_COLORS[edge.type]} />;
}

function FacetLabel({
  facet,
  m,
  layers,
  size,
}: {
  facet: DiagramFacet;
  m: Mapper;
  layers: DiagramLayers;
  size: number;
}) {
  const lines: Array<{ text: string; size: number; color: string }> = [];
  if (layers.ids) lines.push({ text: facet.label, size: size * 1.15, color: INK });
  if (layers.pitch) lines.push({ text: facet.pitchLabel, size: size * 0.9, color: BLUEPRINT });
  if (layers.area) lines.push({ text: facet.areaLabel, size: size * 0.9, color: INK });
  if (!lines.length) return null;

  const c = m.pt(facet.centroid);
  const lineH = size * 1.3;
  const blockH = lineH * lines.length;
  const blockW = Math.max(...lines.map((l) => l.text.length * MONO_EM * l.size)) + 4;
  const top = c.y - blockH / 2;

  // Slope arrow (pitch layer): a short arrow below the label block, pointing
  // down-slope, so a reader sees which way the facet drains.
  let arrow: React.ReactElement | null = null;
  if (layers.pitch && facet.slopeDir) {
    const d = facet.slopeDir;
    const start = { x: c.x + d.x * (blockH / 2 + 3), y: c.y + d.y * (blockH / 2 + 3) };
    const len = 9;
    const end = { x: start.x + d.x * len, y: start.y + d.y * len };
    const nrm = { x: -d.y, y: d.x };
    const hl = { x: end.x - d.x * 3.5 + nrm.x * 2.2, y: end.y - d.y * 3.5 + nrm.y * 2.2 };
    const hr = { x: end.x - d.x * 3.5 - nrm.x * 2.2, y: end.y - d.y * 3.5 - nrm.y * 2.2 };
    arrow = (
      <G>
        <Line x1={r2(start.x)} y1={r2(start.y)} x2={r2(end.x)} y2={r2(end.y)} stroke={BLUEPRINT} strokeWidth={0.9} />
        <Polygon
          points={pointsAttr([
            { x: r2(end.x), y: r2(end.y) },
            { x: r2(hl.x), y: r2(hl.y) },
            { x: r2(hr.x), y: r2(hr.y) },
          ])}
          fill={BLUEPRINT}
        />
      </G>
    );
  }

  return (
    <G>
      <Rect x={r2(c.x - blockW / 2)} y={r2(top - 1)} width={r2(blockW)} height={r2(blockH + 2)} fill={WHITE} fillOpacity={0.85} />
      {lines.map((l, i) => {
        const cy = top + lineH * i + lineH / 2;
        return (
          <Text
            key={i}
            x={c.x}
            y={r2(cy + l.size * 0.36)}
            textAnchor="middle"
            fill={l.color}
            style={{ fontFamily: MONO, fontSize: r2(l.size) }}
          >
            {l.text}
          </Text>
        );
      })}
      {arrow}
    </G>
  );
}

function chimneyBox(chimney: DiagramChimney, m: Mapper) {
  const cx = m.x(chimney.x);
  const cy = m.y(chimney.y);
  const w = Math.max(m.ft(chimney.wFt), 6);
  const h = Math.max(m.ft(chimney.hFt), 6);
  return { cx, cy, w, h, x0: r2(cx - w / 2), y0: r2(cy - h / 2), x1: r2(cx + w / 2), y1: r2(cy + h / 2) };
}

/** The hatched square — drawn under the labels so a facet label never hides it. */
function ChimneyShape({ chimney, m }: { chimney: DiagramChimney; m: Mapper }) {
  const b = chimneyBox(chimney, m);
  return (
    <G>
      <Rect x={b.x0} y={b.y0} width={r2(b.w)} height={r2(b.h)} fill={WHITE} stroke={INK} strokeWidth={0.9} />
      {hatchSegments(b.x0, b.y0, b.x1, b.y1, 2.6).map(([a, c], i) => (
        <Line key={i} x1={a.x} y1={a.y} x2={c.x} y2={c.y} stroke={INK} strokeWidth={0.45} />
      ))}
    </G>
  );
}

/** "CHIMNEY (approx.)" — drawn last, on top of every facet label halo. */
function ChimneyLabel({ chimney, m, size }: { chimney: DiagramChimney; m: Mapper; size: number }) {
  const b = chimneyBox(chimney, m);
  return <MonoLabel x={b.cx} y={r2(b.y1 + size * 0.9)} text={chimney.label} size={size * 0.8} />;
}

/** The roof drawing for one sheet: white box, graph paper, ink frame, layers. */
function Drawing({ layout, layers }: { layout: DiagramLayout; layers: DiagramLayers }) {
  const m = new Mapper(layout.frame, DRAW_W, DRAW_H, DRAW_INSET);
  const base = clamp(layout.fontFt * m.scale, 5.5, 8);
  const hasGeometry = layout.facets.length > 0 || layout.edges.length > 0;

  return (
    <Svg width={DRAW_W} height={DRAW_H} viewBox={`0 0 ${DRAW_W} ${DRAW_H}`}>
      <Rect x={0} y={0} width={DRAW_W} height={DRAW_H} fill={WHITE} />
      <GraphPaper width={DRAW_W} height={DRAW_H} />

      {layout.facets.map((f) => (
        <FacetShape key={f.id} facet={f} m={m} />
      ))}
      {layout.edges.map((e) => (
        <EdgeShape key={e.id} edge={e} m={m} />
      ))}
      {layers.chimneys ? layout.chimneys.map((c, i) => <ChimneyShape key={i} chimney={c} m={m} />) : null}
      {layers.lengths ? layout.edges.map((e) => <EdgeLabel key={e.id} edge={e} m={m} size={base * 0.9} />) : null}
      {layers.ids || layers.pitch || layers.area
        ? layout.facets.map((f) => <FacetLabel key={f.id} facet={f} m={m} layers={layers} size={base} />)
        : null}
      {layers.chimneys ? layout.chimneys.map((c, i) => <ChimneyLabel key={i} chimney={c} m={m} size={base} />) : null}

      {!hasGeometry ? (
        <Text
          x={DRAW_W / 2}
          y={DRAW_H / 2}
          textAnchor="middle"
          fill={MUTED}
          style={{ fontFamily: MONO, fontSize: 9 }}
        >
          NO GEOMETRY — TOTALS ONLY
        </Text>
      ) : null}

      {layers.north ? <NorthArrow cx={DRAW_W - 34} cy={38} angleDeg={layout.northAngleDeg} /> : null}

      <Rect x={0.75} y={0.75} width={DRAW_W - 1.5} height={DRAW_H - 1.5} fill="none" stroke={INK} strokeWidth={1.5} />
    </Svg>
  );
}

// ── Page furniture ──────────────────────────────────────────────────────────

function isoDate(d: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : d;
}

/** The built-in fonts are WinAnsi: no U+2116 "№", so the drawing number prints "No.". */
function drawingNoText(layout: DiagramLayout): string {
  return layout.header.drawingNo.replace(/№/g, "No.");
}

/** Header band on every page — `fixed`, so an overflowing sheet repeats it. */
function HeaderBand({ layout, logoUrl }: { layout: DiagramLayout; logoUrl: string | null }) {
  const { header } = layout;
  return (
    <View fixed>
      <View style={s.band}>
        <View style={s.bandLeft}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image has no alt prop */}
          {logoUrl ? <Image src={logoUrl} style={s.logo} /> : null}
          <Text style={s.company}>{header.company?.name ?? "Roof measurement"}</Text>
        </View>
        <View style={s.bandRight}>
          <Text style={s.bandTitle}>{header.title}</Text>
          <Text style={s.bandMono}>{drawingNoText(layout)}</Text>
          <Text style={s.bandMuted}>{isoDate(header.date)}</Text>
        </View>
      </View>
      <View style={s.addressRow}>
        <Text style={s.address}>{header.address || "Address unavailable"}</Text>
        <Text style={s.sourceLine}>{header.source}</Text>
      </View>
    </View>
  );
}

function SheetTitle({ layout, kicker, title }: { layout: DiagramLayout; kicker: string; title: string }) {
  return (
    <View style={s.titleRow}>
      <View>
        <Text style={s.kicker}>{kicker}</Text>
        <Text style={s.sheetTitle}>{title}</Text>
      </View>
      {layout.stamps.length ? (
        <View style={s.stamps}>
          {layout.stamps.map((st) => (
            <Text key={st} style={s.stamp}>
              {st}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Legend({ layout }: { layout: DiagramLayout }) {
  if (!layout.legend.length) return null;
  const hasShort = layout.edges.some((e) => e.short);
  return (
    <View style={s.legend}>
      {layout.legend.map((l) => (
        <View key={l.type} style={s.legendItem}>
          <View style={[s.swatch, { backgroundColor: l.color }]} />
          <Text style={s.legendText}>{l.label.toUpperCase()}</Text>
        </View>
      ))}
      {layout.chimneys.length ? (
        <View style={s.legendItem}>
          <View style={[s.swatch, { height: 8, width: 8, borderWidth: 0.75, borderColor: INK, backgroundColor: WHITE }]} />
          <Text style={s.legendText}>PENETRATION (APPROX.)</Text>
        </View>
      ) : null}
      {hasShort ? <Text style={s.legendNote}>Edges under 3 ft are not dimensioned on the sheet.</Text> : null}
    </View>
  );
}

/**
 * Footer on every page — `fixed`, with the page number resolved by react-pdf
 * at layout time so an overflow page (a long summary) is labelled correctly
 * rather than repeating its sheet's number.
 */
function Footer({ layout }: { layout: DiagramLayout }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>JOBFLEX · ROOF DIAGRAM</Text>
      <Text style={s.footerText}>{drawingNoText(layout)}</Text>
      <Text
        style={s.footerSheet}
        render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `SHEET ${pageNumber} / ${totalPages}`
        }
      />
    </View>
  );
}

function DrawingPage({
  layout,
  logoUrl,
  sheet,
  title,
  layers,
}: {
  layout: DiagramLayout;
  logoUrl: string | null;
  sheet: number;
  title: string;
  layers: DiagramLayers;
}) {
  return (
    <Page size="LETTER" style={s.page}>
      <HeaderBand layout={layout} logoUrl={logoUrl} />
      <SheetTitle layout={layout} kicker={`SHEET ${sheet} OF ${SHEET_COUNT} · PLAN VIEW · TRUE LENGTHS`} title={title} />
      <Drawing layout={layout} layers={layers} />
      {layers.legend ? <Legend layout={layout} /> : null}
      <Footer layout={layout} />
    </Page>
  );
}

// ── Summary sheet ───────────────────────────────────────────────────────────

const squaresLabel = (n: number): string => (Math.round(n * 10) / 10).toLocaleString("en-US");
const yesNo = (v: boolean): string => (v ? "Yes" : "No");
const titleCase = (v: string): string => v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();

const FACADE_NAMES: Record<string, string> = { N: "North", E: "East", S: "South", W: "West" };

/** Pitch-mix rows printed on the summary sheet; the rest fold into "Other". */
const PITCH_MIX_MAX_ROWS = 6;
/** Footage rows under this are noise (rounding of dedupe), not a line type worth printing. */
const FOOTAGE_MIN_FT = 0.5;

function pitchMixRows(mix: DiagramLayout["totals"]["pitchMix"]): DiagramLayout["totals"]["pitchMix"] {
  if (mix.length <= PITCH_MIX_MAX_ROWS) return mix;
  const head = mix.slice(0, PITCH_MIX_MAX_ROWS - 1);
  const rest = mix.slice(PITCH_MIX_MAX_ROWS - 1);
  return [
    ...head,
    {
      pitchLabel: "Other",
      areaSqft: rest.reduce((a, p) => a + p.areaSqft, 0),
      pct: rest.reduce((a, p) => a + p.pct, 0),
    },
  ];
}

function flagRows(flags: NonNullable<DiagramLayout["totals"]["flags"]>): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  if (typeof flags.chimney === "boolean") rows.push(["Chimney", yesNo(flags.chimney)]);
  if (typeof flags.solarPanels === "boolean") rows.push(["Solar panels", yesNo(flags.solarPanels)]);
  if (typeof flags.rooftopAcCount === "number") rows.push(["Rooftop AC units", String(flags.rooftopAcCount)]);
  if (flags.material) rows.push(["Material", titleCase(flags.material)]);
  if (flags.conditionRating) rows.push(["Condition", titleCase(flags.conditionRating)]);
  if (typeof flags.roofAgeYears === "number") rows.push(["Roof age", `${flags.roofAgeYears} yrs`]);
  return rows;
}

function SummaryPage({ layout, logoUrl }: { layout: DiagramLayout; logoUrl: string | null }) {
  const t = layout.totals;
  const footage = t.footage.filter((f) => f.ft > FOOTAGE_MIN_FT);
  const footageTotal = footage.reduce((a, f) => a + f.ft, 0);
  const pitchMix = pitchMixRows(t.pitchMix);
  const flags = t.flags ? flagRows(t.flags) : [];
  const eaves = t.eaveHeights ?? [];

  return (
    <Page size="LETTER" style={s.page}>
      <HeaderBand layout={layout} logoUrl={logoUrl} />
      <SheetTitle layout={layout} kicker={`SHEET ${SHEET_COUNT} OF ${SHEET_COUNT} · FIGURES`} title="Summary" />

      <View style={s.totalsGrid}>
        <View style={s.totalsCell}>
          <Text style={s.totalsValue}>{fmtArea(t.areaSqft)}</Text>
          <Text style={s.totalsKey}>ROOF AREA</Text>
        </View>
        <View style={[s.totalsCell, s.totalsCellRule]}>
          <Text style={s.totalsValue}>{squaresLabel(t.squares)}</Text>
          <Text style={s.totalsKey}>SQUARES</Text>
        </View>
        <View style={[s.totalsCell, s.totalsCellRule]}>
          <Text style={s.totalsValue}>{t.predominantPitch}</Text>
          <Text style={s.totalsKey}>PREDOMINANT PITCH</Text>
        </View>
        <View style={[s.totalsCell, s.totalsCellRule]}>
          <Text style={s.totalsValue}>{t.facetCount}</Text>
          <Text style={s.totalsKey}>FACETS</Text>
        </View>
      </View>

      <View style={s.section}>
        <Text style={s.sectionLabel}>Linear feet by type</Text>
        {footage.length ? (
          footage.map((f) => (
            <View key={f.type} style={s.row}>
              <View style={s.swatchCell}>
                <View style={[s.swatch, { backgroundColor: LINE_COLORS[f.type] }]} />
              </View>
              <Text style={s.cellLabel}>{f.label}</Text>
              <Text style={[s.cellMono, s.cellMonoWide]}>{fmtLength(f.ft)}</Text>
            </View>
          ))
        ) : (
          <View style={s.row}>
            <Text style={s.cellLabel}>No edge geometry in this measurement.</Text>
          </View>
        )}
        {footage.length ? (
          <View style={[s.row, s.rowTotal]}>
            <View style={s.swatchCell} />
            <Text style={s.cellLabelBold}>Total</Text>
            <Text style={[s.cellMono, s.cellMonoWide]}>{fmtLength(footageTotal)}</Text>
          </View>
        ) : null}
      </View>

      <View style={s.section}>
        <Text style={s.sectionLabel}>Pitch mix</Text>
        {pitchMix.length ? (
          pitchMix.map((p) => (
            <View key={p.pitchLabel} style={s.row}>
              <Text style={[s.cellMono, s.cellMonoNarrow, { textAlign: "left" }]}>{p.pitchLabel}</Text>
              <View style={s.barTrack}>
                <View style={[s.barFill, { width: `${clamp(p.pct, 0, 100)}%` }]} />
              </View>
              <Text style={[s.cellMono, s.cellMonoWide]}>{fmtArea(p.areaSqft)}</Text>
              <Text style={[s.cellMono, s.cellMonoNarrow]}>{Math.round(p.pct)}%</Text>
            </View>
          ))
        ) : (
          <View style={s.row}>
            <Text style={s.cellLabel}>Predominant pitch {t.predominantPitch} — facet pitches unavailable.</Text>
          </View>
        )}
      </View>

      {eaves.length || flags.length ? (
        <View style={[s.section, s.twoCol]}>
          {eaves.length ? (
            <View style={s.col}>
              <Text style={s.sectionLabel}>Eave heights</Text>
              {eaves.map((e) => (
                <View key={e.facade} style={s.row}>
                  <Text style={s.cellLabel}>{FACADE_NAMES[e.facade.toUpperCase()] ?? e.facade} facade</Text>
                  <Text style={[s.cellMono, s.cellMonoWide]}>{fmtLength(e.ft)}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {flags.length ? (
            <View style={s.col}>
              <Text style={s.sectionLabel}>Property data</Text>
              {flags.map(([k, v]) => (
                <View key={k} style={s.row}>
                  <Text style={s.cellLabel}>{k}</Text>
                  <Text style={[s.cellMono, s.cellMonoWide]}>{v}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={s.section}>
        <Text style={s.sectionLabel}>Source</Text>
        <View style={s.row}>
          <Text style={s.cellLabel}>{layout.header.source}</Text>
        </View>
        {layout.chimneys.length ? (
          <View style={s.row}>
            <Text style={s.cellLabel}>
              {layout.chimneys.length} penetration{layout.chimneys.length === 1 ? "" : "s"} located approximately
              (aerial detection); positions are not surveyed.
            </Text>
          </View>
        ) : null}
      </View>

      <Footer layout={layout} />
    </Page>
  );
}

// ── Document ────────────────────────────────────────────────────────────────

const LENGTHS_ONLY: DiagramLayers = { ...ALL_LAYERS_ON, pitch: false, area: false, ids: false, chimneys: false };
const PITCH_ONLY: DiagramLayers = { ...ALL_LAYERS_ON, lengths: false, area: false, chimneys: false, legend: false };
const AREAS_ONLY: DiagramLayers = { ...ALL_LAYERS_ON, lengths: false, pitch: false, chimneys: false, legend: false };

export function RoofDiagramPdfDocument({ layout, appOrigin }: { layout: DiagramLayout; appOrigin?: string }) {
  const logoUrl = safeLogoUrl(layout.header.company?.logoUrl, appOrigin);
  const author = layout.header.company?.name ?? "JobFlex";
  return (
    <Document
      title={`${layout.header.title} — ${layout.header.address}`}
      author={author}
      creator={author}
      producer="JobFlex"
    >
      <DrawingPage layout={layout} logoUrl={logoUrl} sheet={1} title="Roof plan — all layers" layers={ALL_LAYERS_ON} />
      <DrawingPage layout={layout} logoUrl={logoUrl} sheet={2} title="Lengths" layers={LENGTHS_ONLY} />
      <DrawingPage layout={layout} logoUrl={logoUrl} sheet={3} title="Pitch" layers={PITCH_ONLY} />
      <DrawingPage layout={layout} logoUrl={logoUrl} sheet={4} title="Areas" layers={AREAS_ONLY} />
      <SummaryPage layout={layout} logoUrl={logoUrl} />
    </Document>
  );
}
