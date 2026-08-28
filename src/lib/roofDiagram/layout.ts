// Roof diagram — the one LAYOUT step behind every rendering of the drawing.
//
//   buildDiagramLayout(input)         RoofModel + chimneys → DiagramLayout
//   renderDiagramSvg(layout, layers)  DiagramLayout → self-contained <svg> string
//   layoutFromMeasurement(dto, hdr)   saved measurement → DiagramLayout
//
// Pure and client-safe: only TYPES come from the server module (fully erased),
// the geometry helpers are the THREE-free ones shared with the wireframe.
//
// Every printed figure — edge lengths, facet areas, footage, pitch mix —
// comes straight from the model's `lengthFt` / `areaSqft` / `totals`.
// Nothing is re-measured from the projected polygons: the calibration lives in
// those figures and the plan view foreshortens sloped lines anyway.
//
// Frame conventions
//   model    feet, x east, y NORTH (the reconstruction's raster frame; EagleView
//            reports are the same way up)
//   axis     the plan is rotated (presentation only, about the frame centre)
//            so the house's dominant axis sits square to the page, the way
//            EagleView lays out its drawings; `northAngleDeg` compensates so
//            the arrow still tells the truth. Figures are never rescaled or
//            re-measured — orientation only.
//   screen   feet, x east, y DOWN — `project` flips y once, here, and nothing
//            downstream flips again
//   north    `northAngleDeg` is how far a straight-up arrow must turn CLOCKWISE
//            to point true north. The recon / Instant frames are y-north, so
//            they draw with 0 before axis alignment; an EagleView report's
//            `northOrientation` attribute carries the same meaning and passes
//            through.
import type { EvLineType, RoofModel, RoofPoint, InstantStructure } from "@/lib/eagleview";
import { buildIndexes, centroid, downSlopeScreen, ringOf } from "@/components/estimator/roof/roofGeometry";
import { dominantAxisDeg } from "@/lib/roofDiagram/rectify";
import { LINE_COLORS, LINE_LABEL, PRIMARY_LINE_TYPES } from "@/components/estimator/roof/roofViz";
import { suppressedLineIds } from "@/lib/roofDiagram/refine";
import type { ChimneyCandidate, RoofMeasurementDTO } from "@/lib/roofDiagram/types";
import {
  ALL_LAYERS_ON,
  type BuildLayoutInput,
  type DiagramChimney,
  type DiagramEdge,
  type DiagramFacet,
  type DiagramHeader,
  type DiagramLayer,
  type DiagramLayers,
  type DiagramLayout,
  type DiagramOptions,
  type DiagramTotals,
  type Pt,
} from "@/lib/roofDiagram/layoutTypes";

export { ALL_LAYERS_ON };

export function emptyLayers(): DiagramLayers {
  return { lengths: false, pitch: false, area: false, ids: false, north: false, chimneys: false, legend: false };
}

export const LAYER_LABELS: Record<DiagramLayer, string> = {
  lengths: "Lengths",
  pitch: "Pitch",
  area: "Area",
  ids: "IDs",
  north: "North",
  chimneys: "Chimneys",
  legend: "Legend",
};

// ── formatting ───────────────────────────────────────────────────────────────

/** "24.5 ft" — one decimal always, so a column of lengths lines up. */
export function fmtLength(ft: number): string {
  return `${(Number.isFinite(ft) ? ft : 0).toFixed(1)} ft`;
}

/** "6/12" */
export function fmtPitch(pitch: number): string {
  return `${Math.round(Number.isFinite(pitch) ? pitch : 0)}/12`;
}

/** "588 sq ft" — whole feet, thousands separated. */
export function fmtArea(sqft: number): string {
  return `${Math.round(Number.isFinite(sqft) ? sqft : 0).toLocaleString("en-US")} sq ft`;
}

// ── constants ────────────────────────────────────────────────────────────────

/** Spec §3: edges under 4 ft get no printed length (label null + short=true —
 *  the app shows those on hover only, print uses the smallest font). */
const DEFAULT_OPTIONS: DiagramOptions = { minLabelEdgeFt: 4, padFrac: 0.08 };

/** Legend / footage order: the roofing lines first, the trim afterwards. */
const TYPE_ORDER: EvLineType[] = [...PRIMARY_LINE_TYPES, "FLASHING", "STEPFLASH", "OTHER"];

/** Monospace glyph advance as a fraction of the font size (JetBrains Mono ≈ 0.6). */
const GLYPH_W = 0.62;
/** Line box height as a fraction of the font size. */
const LINE_H = 1.2;
/** Facet ID is set larger than the pitch / area lines under it. */
const ID_SCALE = 1.35;

/** Spec §3 label conventions: the pitch+area stack only on facets big enough
 *  to read it; the down-slope arrow only where it has room; the LETTER always. */
const MIN_STACK_AREA_SQFT = 20;
const MIN_ARROW_AREA_SQFT = 50;

/** Which parts of a facet's centre annotation the conventions allow (spec §3).
 *  The letter itself is always drawn; renderers with their own facet stacks
 *  should gate on this rather than re-derive thresholds. */
export function facetLabelParts(f: { areaSqft: number }): { stack: boolean; arrow: boolean } {
  return { stack: f.areaSqft >= MIN_STACK_AREA_SQFT, arrow: f.areaSqft >= MIN_ARROW_AREA_SQFT };
}

const CHIMNEY_LABEL: Record<ChimneyCandidate["kind"], string> = {
  chimney: "CHIMNEY (approx.)",
  vent: "VENT (approx.)",
  skylight: "SKYLIGHT (approx.)",
};

const STAMP_BY_SOURCE: Partial<Record<BuildLayoutInput["source"], string>> = {
  recon: "ESTIMATE — NOT MEASURED",
  "instant-outline": "FACETS UNAVAILABLE",
};

/**
 * On the outline-only path, WHY decides the stamp. "FACETS UNAVAILABLE" is a
 * claim about the address — that Google has no elevation data here — and it is
 * only true for `no-coverage`. A timeout is a claim about one request, and the
 * drawing is a retry away from being complete.
 */
const STAMP_BY_RECON_FAILURE: Record<NonNullable<BuildLayoutInput["reconUnavailable"]>["kind"], string> = {
  "no-coverage": "FACETS UNAVAILABLE",
  timeout: "ELEVATION DATA NOT RECEIVED",
  config: "ELEVATION DATA NOT RECEIVED",
  error: "ELEVATION DATA NOT RECEIVED",
};

const SOURCE_LINE: Record<BuildLayoutInput["source"], string> = {
  "instant+recon": "EagleView Instant Property Data · geometry reconstructed from aerial imagery",
  "instant-outline": "EagleView Instant Property Data · building outline only",
  recon: "Aerial reconstruction (Google Solar) — estimate",
  eagleview: "EagleView measurement report",
};

const FACADE_NAME: Record<string, string> = { N: "North", E: "East", S: "South", W: "West" };
const FACADE_ORDER = ["N", "E", "S", "W"];

// ── small geometry ───────────────────────────────────────────────────────────

const project = (p: { x: number; y: number }): Pt => ({ x: p.x, y: -p.y });

// ── axis alignment ───────────────────────────────────────────────────────────

/** Below this fold the plan is already straight — leave it exactly as it is. */
const MIN_AXIS_ROT_DEG = 0.25;

/** Fold an axis angle into [-45, 45): the smallest signed turn onto a cardinal. */
function foldAxisDeg(deg: number): number {
  let d = ((deg % 90) + 90) % 90;
  if (d >= 45) d -= 90;
  return d;
}

/** Line types that run along the house walls — the family that defines the
 *  page axis. Hips and valleys run the diagonals and must not vote here. */
const AXIS_LINE_TYPES: ReadonlySet<EvLineType> = new Set<EvLineType>(["EAVE", "RIDGE", "RAKE"]);

/**
 * The house's wall axis in degrees mod 90 (0 = +x east), sub-degree.
 *
 * `dominantAxisDeg` is the established estimator, but it votes ALL lines into
 * one mod-90 histogram: on a hip-heavy roof the diagonals (hips + valleys) can
 * out-weigh the walls and the mode lands 45° off — fine for rectify, whose
 * 4-direction grid repeats every 45°, but sideways on the page (measured on
 * 419 Prairie Ridge Ln's rectified candidate: mode 45° while every eave sits
 * on 0/90). So: disambiguate `base` vs `base + 45` by length-weighted support
 * among the wall-running line types only (EAVE / RIDGE / RAKE), then refine to
 * sub-degree with the length-weighted mean deviation of those lines, so the
 * big eave cluster — not the integer histogram bin — defines "straight".
 */
function houseAxisDeg(model: RoofModel): number {
  const base = dominantAxisDeg(model);
  if (!Number.isFinite(base)) return 0;
  const pts = new Map(model.points.map((p) => [p.id, p]));
  const walls: Array<{ deg: number; len: number }> = [];
  for (const l of model.lines) {
    if (!AXIS_LINE_TYPES.has(l.type)) continue;
    const a = pts.get(l.aId);
    const b = pts.get(l.bId);
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!Number.isFinite(len) || len < 0.5) continue;
    const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    if (!Number.isFinite(deg)) continue;
    walls.push({ deg, len });
  }
  if (!walls.length) return base;
  const support = (axis: number) => walls.reduce((s, w) => s + (Math.abs(foldAxisDeg(w.deg - axis)) <= 10 ? w.len : 0), 0);
  const axis = support(base + 45) > support(base) ? base + 45 : base;
  let sum = 0;
  let wsum = 0;
  for (const w of walls) {
    const d = foldAxisDeg(w.deg - axis);
    if (Math.abs(d) > 5) continue;
    sum += d * w.len;
    wsum += w.len;
  }
  const refined = wsum > 0 ? axis + sum / wsum : axis;
  return Number.isFinite(refined) ? refined : base;
}

/**
 * Presentation-only rotation (deg, CCW in the model frame) that puts the
 * house's wall axis square to the page: rot = -fold(houseAxisDeg).
 * Exactly 0 for an already-straight model (|fold| < 0.25°) or a degenerate one.
 */
function axisAlignRotationDeg(model: RoofModel): number {
  const folded = foldAxisDeg(houseAxisDeg(model));
  if (!Number.isFinite(folded) || Math.abs(folded) < MIN_AXIS_ROT_DEG) return 0;
  return -folded;
}

/**
 * Deep-rotate the plan by `rotDeg` (CCW, model frame) about the centre of the
 * model's point extent — points and chimney centres together, so facets, edges,
 * labels and penetrations all inherit the turn from the rotated points. z is
 * untouched (pitch and areas are figures, never re-measured). Inputs are never
 * mutated; chimney boxes stay axis-aligned approximations, only their centres
 * move.
 */
function rotatePlanGeometry(
  model: RoofModel,
  chimneys: ChimneyCandidate[],
  rotDeg: number,
): { model: RoofModel; chimneys: ChimneyCandidate[] } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of model.points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return { model, chimneys };
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const r = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const rx = (x: number, y: number) => cx + (x - cx) * cos - (y - cy) * sin;
  const ry = (x: number, y: number) => cy + (x - cx) * sin + (y - cy) * cos;
  return {
    model: { ...model, points: model.points.map((p) => ({ ...p, x: rx(p.x, p.y), y: ry(p.x, p.y) })) },
    chimneys: chimneys.map((c) => ({ ...c, x: rx(c.x, c.y), y: ry(c.x, c.y) })),
  };
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const boxAround = (c: Pt, w: number, h: number): Box => ({ x: c.x - w / 2, y: c.y - h / 2, w, h });

const boxesHit = (a: Box, b: Box): boolean =>
  Math.abs(a.x + a.w / 2 - (b.x + b.w / 2)) < (a.w + b.w) / 2 && Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) < (a.h + b.h) / 2;

/** Axis-aligned extent of a w×h text box rotated by `deg`. */
function rotatedExtent(w: number, h: number, deg: number): { w: number; h: number } {
  const r = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { w: w * c + h * s, h: w * s + h * c };
}

/**
 * Edge angle folded into [-90, 90) so rotated text always reads left-to-right;
 * a vertical edge gets -90 so its label reads bottom-to-top (drafting convention).
 */
function readableAngle(dx: number, dy: number): number {
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  while (deg >= 90) deg -= 180;
  while (deg < -90) deg += 180;
  return deg;
}

/**
 * Down-slope unit vector (screen) from the least-squares plane through the
 * facet's 3D ring: z = a·x + b·y + c, gradient (a, b) points UP-slope in the
 * model frame; flip it and drop y into the screen frame. Falls back to the
 * three-point normal when the ring is collinear in plan; null when flat.
 */
function slopeDirOf(ring: RoofPoint[]): Pt | null {
  const n = ring.length;
  if (n < 3) return null;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const p of ring) {
    sx += p.x;
    sy += p.y;
    sz += p.z;
  }
  const mx = sx / n;
  const my = sy / n;
  const mz = sz / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  let sxz = 0;
  let syz = 0;
  for (const p of ring) {
    const dx = p.x - mx;
    const dy = p.y - my;
    const dz = p.z - mz;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
    sxz += dx * dz;
    syz += dy * dz;
  }
  const det = sxx * syy - sxy * sxy;
  if (Math.abs(det) < 1e-6) return downSlopeScreen(ring);
  const a = (sxz * syy - syz * sxy) / det;
  const b = (syz * sxx - sxz * sxy) / det;
  const g = Math.hypot(a, b);
  // A rise under 1:100 is flat for drawing purposes — no arrow.
  if (g < 0.01) return null;
  return { x: -a / g, y: b / g };
}

// ── edge dedupe ──────────────────────────────────────────────────────────────

interface RawEdge {
  id: string;
  type: EvLineType;
  a: Pt;
  b: Pt;
  lengthFt: number;
}

/** Trim lines are never crease twins — flashing runs alongside a wall, not inside a ring. */
const TRIM_TYPES: ReadonlySet<EvLineType> = new Set<EvLineType>(["FLASHING", "STEPFLASH", "OTHER"]);

/**
 * A reconstructed crease appears twice — once in each adjoining facet's ring —
 * and both copies stay in `model.lines` because ringOf() walks per-facet ids.
 * The drawing wants each physical edge once: longest first, skip anything
 * collinear with and overlapping an edge already kept (same test the recon
 * uses for its footage totals). Two collinear edges that merely touch end to
 * end are both real and both survive.
 *
 * Only the reconstruction (`model.source` "synthetic" / "instant") carries
 * those per-facet copies; an EagleView report and the Instant outline list
 * each line once, so they draw as given. Trim lines (FLASHING / STEPFLASH /
 * OTHER) and the lines of a penetration are never twins either — a chimney's
 * base sits collinear with a real edge and must not be dropped for it.
 */
function dedupeEdges(edges: RawEdge[], protectedIds: ReadonlySet<string>): RawEdge[] {
  const passthrough: RawEdge[] = [];
  const twins: RawEdge[] = [];
  for (const e of edges) (TRIM_TYPES.has(e.type) || protectedIds.has(e.id) ? passthrough : twins).push(e);
  const keptIds = new Set([...passthrough, ...dedupeTwins(twins)].map((e) => e.id));
  // Original model order, so the output is stable regardless of the dedupe's sort.
  return edges.filter((e) => keptIds.has(e.id));
}

function dedupeTwins(edges: RawEdge[]): RawEdge[] {
  const sorted = [...edges].sort((p, q) => q.lengthFt - p.lengthFt || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
  const kept: RawEdge[] = [];
  for (const e of sorted) {
    const len = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
    if (len < 1e-6) continue;
    const ux = (e.b.x - e.a.x) / len;
    const uy = (e.b.y - e.a.y) / len;
    let duplicate = false;
    for (const k of kept) {
      const kl = Math.hypot(k.b.x - k.a.x, k.b.y - k.a.y);
      if (kl < 1e-6) continue;
      const kux = (k.b.x - k.a.x) / kl;
      const kuy = (k.b.y - k.a.y) / kl;
      if (Math.abs(ux * kux + uy * kuy) < 0.985) continue; // > 10° apart
      const perp = (p: Pt) => Math.abs((p.x - k.a.x) * -kuy + (p.y - k.a.y) * kux);
      if (perp(e.a) > 2 || perp(e.b) > 2) continue;
      const t = (p: Pt) => (p.x - k.a.x) * kux + (p.y - k.a.y) * kuy;
      const t0 = Math.min(t(e.a), t(e.b));
      const t1 = Math.max(t(e.a), t(e.b));
      if (t1 < 0.5 || t0 > kl - 0.5) continue; // disjoint runs
      duplicate = true;
      break;
    }
    if (!duplicate) kept.push(e);
  }
  return kept;
}

// ── layout ───────────────────────────────────────────────────────────────────

/** Width of the facet's centre stack (ID line is larger than the two under it).
 *  Small facets reserve room for the letter only — their pitch/area lines are
 *  never drawn (spec §3). */
function facetStackBox(
  f: { label: string; pitchLabel: string; areaLabel: string; areaSqft: number },
  fontFt: number,
): { w: number; h: number } {
  const { stack } = facetLabelParts(f);
  const w =
    Math.max(f.label.length * ID_SCALE, stack ? f.pitchLabel.length : 0, stack ? f.areaLabel.length : 0) *
    GLYPH_W *
    fontFt;
  const h = (ID_SCALE + (stack ? 2 : 0)) * LINE_H * fontFt;
  return { w, h };
}

export function buildDiagramLayout(input: BuildLayoutInput): DiagramLayout {
  const opts: DiagramOptions = { ...DEFAULT_OPTIONS, ...(input.options ?? {}) };

  // ── axis alignment (presentation only) ──
  // The world frame leaves the house a couple of degrees off cardinal, which
  // reads as "crooked" next to an EagleView sheet. Rotate the whole plan once,
  // up front, so everything downstream — facet rings, edges, chimney rects,
  // label placement — inherits the straightened geometry. Printed figures come
  // from the model's lengthFt / areaSqft / totals and are untouched.
  const rotDeg = axisAlignRotationDeg(input.model);
  const { model, chimneys: chimneyCands } =
    rotDeg === 0
      ? { model: input.model, chimneys: input.chimneys ?? [] }
      : rotatePlanGeometry(input.model, input.chimneys ?? [], rotDeg);
  const idx = buildIndexes(model);

  // ── facets ──
  const facets: DiagramFacet[] = [];
  model.faces.forEach((f, i) => {
    const ring = ringOf(f.lineIds, idx);
    if (!ring) return;
    facets.push({
      id: f.id,
      label: f.designator || `F${i + 1}`,
      ring: ring.map(project),
      centroid: project(centroid(ring)),
      pitch: f.pitch,
      pitchLabel: fmtPitch(f.pitch),
      areaSqft: f.areaSqft,
      areaLabel: fmtArea(f.areaSqft),
      // Down-slope arrow only on facets ≥ 50 sq ft (spec §3) — a null slopeDir
      // is how every renderer skips the arrow.
      slopeDir: f.areaSqft >= MIN_ARROW_AREA_SQFT ? slopeDirOf(ring) : null,
    });
  });

  // ── edges ──
  // Edges the refine pass suppressed from the DRAWING (micro-stubs, stray
  // OTHER not part of a penetration ring) are skipped here; footage totals
  // still come from model.totals, computed before the visual drop.
  const suppressed = suppressedLineIds(model);
  const raw: RawEdge[] = [];
  for (const l of model.lines) {
    if (suppressed.has(l.id)) continue;
    const a = idx.pointsById.get(l.aId);
    const b = idx.pointsById.get(l.bId);
    if (!a || !b) continue;
    raw.push({ id: l.id, type: l.type, a: project(a), b: project(b), lengthFt: l.lengthFt });
  }
  const hasTwins = input.source !== "instant-outline" && (model.source === "synthetic" || model.source === "instant");
  const penetrationIds = new Set<string>();
  for (const p of model.penetrations ?? []) for (const id of p.lineIds) penetrationIds.add(id);
  const unique = hasTwins ? dedupeEdges(raw, penetrationIds) : raw;

  // ── chimneys ──
  const chimneys: DiagramChimney[] = chimneyCands.map((c) => ({
    x: c.x,
    y: -c.y,
    wFt: c.wFt,
    hFt: c.hFt,
    kind: c.kind,
    method: c.method,
    confidence: c.confidence,
    label: CHIMNEY_LABEL[c.kind],
  }));

  // ── extent + frame ──
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const f of facets) for (const p of f.ring) grow(p.x, p.y);
  for (const e of unique) {
    grow(e.a.x, e.a.y);
    grow(e.b.x, e.b.y);
  }
  for (const c of chimneys) {
    grow(c.x - c.wFt / 2, c.y - c.hFt / 2);
    grow(c.x + c.wFt / 2, c.y + c.hFt / 2);
  }
  if (!Number.isFinite(minX) || maxX - minX < 1e-6 || maxY - minY < 1e-6) {
    // Nothing (or a single point) to frame: a 40×30 sheet around whatever there is.
    const cx = Number.isFinite(minX) ? (minX + maxX) / 2 : 0;
    const cy = Number.isFinite(minY) ? (minY + maxY) / 2 : 0;
    minX = cx - 20;
    maxX = cx + 20;
    minY = cy - 15;
    maxY = cy + 15;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const span = Math.max(w, h);
  const pad = span * opts.padFrac;
  const frame = { minX: minX - pad, minY: minY - pad, width: w + pad * 2, height: h + pad * 2 };
  const fontFt = span / 55;

  // ── edge labels: reserve the facet stacks, then place lengths longest-first ──
  const placed: Box[] = facets.map((f) => {
    const s = facetStackBox(f, fontFt);
    return boxAround(f.centroid, s.w, s.h);
  });
  const roofCentre: Pt = facets.length
    ? {
        x: facets.reduce((s, f) => s + f.centroid.x, 0) / facets.length,
        y: facets.reduce((s, f) => s + f.centroid.y, 0) / facets.length,
      }
    : { x: minX + w / 2, y: minY + h / 2 };
  const rank = (t: EvLineType) => (PRIMARY_LINE_TYPES.includes(t) ? 0 : 1);
  const order = [...unique].sort((p, q) => rank(p.type) - rank(q.type) || q.lengthFt - p.lengthFt);
  const labelById = new Map<string, DiagramEdge["label"]>();
  for (const e of order) {
    if (e.lengthFt < opts.minLabelEdgeFt) continue;
    const dx = e.b.x - e.a.x;
    const dy = e.b.y - e.a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const mid = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
    const n = { x: -dy / len, y: dx / len };
    const angleDeg = readableAngle(dx, dy);
    const text = fmtLength(e.lengthFt);
    const ext = rotatedExtent(text.length * GLYPH_W * fontFt, LINE_H * fontFt, angleDeg);
    const toward = (mid.x - roofCentre.x) * n.x + (mid.y - roofCentre.y) * n.y > 0 ? -1 : 1;
    for (const side of [toward, -toward]) {
      const pos = { x: mid.x + n.x * fontFt * 0.9 * side, y: mid.y + n.y * fontFt * 0.9 * side };
      const box = boxAround(pos, ext.w, ext.h);
      if (placed.some((q) => boxesHit(q, box))) continue;
      placed.push(box);
      labelById.set(e.id, { pos, angleDeg });
      break;
    }
  }
  const edges: DiagramEdge[] = unique.map((e) => ({
    id: e.id,
    type: e.type,
    a: e.a,
    b: e.b,
    lengthFt: e.lengthFt,
    lengthLabel: fmtLength(e.lengthFt),
    label: labelById.get(e.id) ?? null,
    short: e.lengthFt < opts.minLabelEdgeFt,
  }));

  // ── legend ──
  const present = new Set(edges.map((e) => e.type));
  const legend = TYPE_ORDER.filter((t) => present.has(t)).map((t) => ({ type: t, label: LINE_LABEL[t], color: LINE_COLORS[t] }));

  // ── totals ──
  const t = model.totals;
  const footage = TYPE_ORDER.map((type) => ({ type, label: LINE_LABEL[type], ft: t.footageByType?.[type] ?? 0 })).filter(
    (r) => r.ft > 0.5,
  );
  const byPitch = new Map<number, number>();
  for (const f of model.faces) {
    const key = Math.round(f.pitch);
    byPitch.set(key, (byPitch.get(key) ?? 0) + f.areaSqft);
  }
  const facetArea = Array.from(byPitch.values()).reduce((s, a) => s + a, 0);
  const pitchMix = Array.from(byPitch.entries())
    .sort((p, q) => q[1] - p[1] || p[0] - q[0])
    .map(([pitch, areaSqft]) => ({
      pitchLabel: fmtPitch(pitch),
      areaSqft,
      pct: facetArea > 0 ? (areaSqft / facetArea) * 100 : 0,
    }));
  const totals: DiagramTotals = {
    areaSqft: t.areaSqft,
    squares: t.squares,
    predominantPitch: fmtPitch(t.predominantPitch),
    facetCount: t.facetCount || facets.length,
    footage,
    pitchMix,
    ...(input.extras?.eaveHeights?.length ? { eaveHeights: input.extras.eaveHeights } : {}),
    ...(input.extras?.flags ? { flags: input.extras.flags } : {}),
  };

  // ── stamps ──
  const stamps: string[] = [];
  const bySource =
    input.source === "instant-outline" && input.reconUnavailable
      ? STAMP_BY_RECON_FAILURE[input.reconUnavailable.kind]
      : STAMP_BY_SOURCE[input.source];
  if (bySource) stamps.push(bySource);
  else if (facets.length === 0) stamps.push("NO FACET GEOMETRY");

  const header: DiagramHeader = { ...input.header, source: input.header.source ?? SOURCE_LINE[input.source] };
  const northRaw = Number.isFinite(model.northOrientation) ? model.northOrientation : 0;
  // North compensation. `rotDeg` is CCW in the model frame; `project`'s y-flip
  // and SVG's y-down cancel, so it is also a CCW turn on the page. Rotating the
  // picture turns every depicted direction — including where true north points —
  // CCW by rotDeg, and northAngleDeg measures CLOCKWISE from page-up (header
  // comment), so the arrow compensates the opposite way: SUBTRACT rotDeg.
  // (Concretely: a house 2° CCW of cardinal folds to +2, rotDeg = -2 — the plan
  // turns 2° clockwise to sit square, and north moves with it, 2° clockwise of
  // up: northAngleDeg = 0 - (-2) = 2.)
  const northAngleDeg = (((northRaw - rotDeg) % 360) + 360) % 360;

  return {
    frame,
    fontFt,
    facets,
    edges,
    chimneys,
    northAngleDeg,
    axisRotationDeg: rotDeg,
    legend,
    totals,
    stamps,
    header,
    source: input.source,
  };
}

// ── from a saved measurement ─────────────────────────────────────────────────

function largestStructure(structures: InstantStructure[]): InstantStructure | null {
  let best: InstantStructure | null = null;
  const size = (s: InstantStructure) => s.areaSqft ?? s.footprintSqft ?? -1;
  for (const s of structures) if (!best || size(s) > size(best)) best = s;
  return best;
}

function eaveHeightsOf(s: InstantStructure | null): Array<{ facade: string; ft: number }> {
  if (!s?.eaveHeightFt) return [];
  const pos = (k: string) => {
    const i = FACADE_ORDER.indexOf(k.toUpperCase());
    return i < 0 ? FACADE_ORDER.length : i;
  };
  return Object.entries(s.eaveHeightFt)
    .filter(([, ft]) => Number.isFinite(ft))
    .sort((a, b) => pos(a[0]) - pos(b[0]) || (a[0] < b[0] ? -1 : 1))
    .map(([k, ft]) => ({ facade: FACADE_NAME[k.toUpperCase()] ?? k, ft }));
}

/** Header + extras from a saved measurement; `header.company` comes from the org. */
export function layoutFromMeasurement(
  m: RoofMeasurementDTO,
  header: { company?: { name: string; logoUrl?: string | null } },
): DiagramLayout {
  const town = [m.city, [m.state, m.zip].filter(Boolean).join(" ")].filter(Boolean).join(" ");
  const address = [m.address, town].filter(Boolean).join(", ") || "Address unavailable";
  const drawingNo = `DRAWING № RM-${m.id === "unsaved" ? "UNSAVED" : m.id.slice(-6).toUpperCase()}`;
  const main = m.instant ? largestStructure(m.instant.structures) : null;
  const eaveHeights = eaveHeightsOf(main);
  const flags: DiagramTotals["flags"] | undefined = main
    ? {
        chimney: main.chimney,
        solarPanels: main.solarPanels,
        rooftopAcCount: main.rooftopAcCount,
        material: main.material,
        conditionRating: main.conditionRating,
        roofAgeYears: main.roofAgeYears,
      }
    : undefined;
  return buildDiagramLayout({
    model: m.model,
    chimneys: m.chimneys,
    source: m.source,
    header: {
      title: "ROOF PLAN",
      address,
      drawingNo,
      date: m.createdAt.slice(0, 10),
      source: SOURCE_LINE[m.source],
      ...(header.company ? { company: header.company } : {}),
    },
    extras: { ...(eaveHeights.length ? { eaveHeights } : {}), ...(flags ? { flags } : {}) },
    ...(m.provenance?.reconUnavailable ? { reconUnavailable: m.provenance.reconUnavailable } : {}),
  });
}

// ── static SVG ───────────────────────────────────────────────────────────────

export interface RenderSvgOptions {
  /** Sheet size in px. Default 1600 × 1200. */
  width?: number;
  height?: number;
  /** Draw the title band (company, address, drawing №). Default true. */
  header?: boolean;
  /** Paint the paper + graph grid. Default true (false → transparent sheet). */
  background?: boolean;
}

const INK = "#0a0a0a";
const PAPER = "#f2f0eb";
const BLUEPRINT = "#1854a0";
const MONO = "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace";
const SANS = "Inter, Helvetica Neue, Helvetica, Arial, sans-serif";

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

/** Compact, deterministic number for attributes. */
const n = (v: number): string => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};

const isHttpsUrl = (u: string | null | undefined): u is string => typeof u === "string" && /^https:\/\//i.test(u);

/** A halo'd mono label. `extra` = further attributes, already escaped. */
function textEl(x: number, y: number, size: number, content: string, extra = "", fill = INK): string {
  return (
    `<text x="${n(x)}" y="${n(y)}" font-family="${MONO}" font-size="${n(size)}" font-weight="700" fill="${fill}"` +
    ` stroke="#ffffff" stroke-width="${n(size * 0.25)}" stroke-linejoin="round" paint-order="stroke"` +
    ` text-anchor="middle" dominant-baseline="central" style="font-variant-numeric:tabular-nums"${extra}>` +
    `${escapeXml(content)}</text>`
  );
}

function facetStack(f: DiagramFacet, layers: DiagramLayers, fontFt: number): string {
  // Spec §3: the letter always; pitch+area only on facets ≥ 20 sq ft (the
  // arrow gate lives in the layout — small facets get slopeDir null).
  const { stack } = facetLabelParts(f);
  const lines: Array<{ text: string; size: number }> = [];
  if (layers.ids) lines.push({ text: f.label, size: fontFt * ID_SCALE });
  if (layers.pitch && stack) lines.push({ text: f.pitchLabel, size: fontFt });
  if (layers.area && stack) lines.push({ text: f.areaLabel, size: fontFt });
  let out = "";
  if (lines.length) {
    const total = lines.reduce((s, l) => s + l.size * LINE_H, 0);
    let y = f.centroid.y - total / 2;
    for (const l of lines) {
      out += textEl(f.centroid.x, y + (l.size * LINE_H) / 2, l.size, l.text);
      y += l.size * LINE_H;
    }
  }
  // Down-slope tick past the stack: a short shaft + head in the flow direction.
  if (layers.pitch && f.slopeDir) {
    const d = f.slopeDir;
    const stackH = lines.reduce((s, l) => s + l.size * LINE_H, 0);
    const off = Math.max(stackH / 2, fontFt * 0.8) + fontFt * 0.4;
    const tail = { x: f.centroid.x + d.x * off, y: f.centroid.y + d.y * off };
    const len = fontFt * 1.8;
    const head = { x: tail.x + d.x * len, y: tail.y + d.y * len };
    const hl = len * 0.38;
    const hw = len * 0.2;
    const base = { x: head.x - d.x * hl, y: head.y - d.y * hl };
    const p1 = { x: base.x - d.y * hw, y: base.y + d.x * hw };
    const p2 = { x: base.x + d.y * hw, y: base.y - d.x * hw };
    out +=
      `<line x1="${n(tail.x)}" y1="${n(tail.y)}" x2="${n(base.x)}" y2="${n(base.y)}" stroke="${INK}"` +
      ` stroke-width="${n(fontFt * 0.08)}" stroke-linecap="round"/>` +
      `<polygon points="${n(head.x)},${n(head.y)} ${n(p1.x)},${n(p1.y)} ${n(p2.x)},${n(p2.y)}" fill="${INK}"/>`;
  }
  return out;
}

function drawingLayer(layout: DiagramLayout, layers: DiagramLayers): string {
  const { fontFt } = layout;
  let s = "";
  // Facets
  for (const f of layout.facets) {
    s +=
      `<polygon points="${f.ring.map((p) => `${n(p.x)},${n(p.y)}`).join(" ")}" fill="rgba(24,84,160,0.10)"` +
      ` stroke="${INK}" stroke-width="${n(fontFt * 0.06)}" stroke-linejoin="round"/>`;
  }
  // Edges
  for (const e of layout.edges) {
    const primary = PRIMARY_LINE_TYPES.includes(e.type);
    s +=
      `<line x1="${n(e.a.x)}" y1="${n(e.a.y)}" x2="${n(e.b.x)}" y2="${n(e.b.y)}" stroke="${LINE_COLORS[e.type]}"` +
      ` stroke-width="${n(fontFt * (primary ? 0.12 : 0.08))}" stroke-linecap="round"/>`;
  }
  // Chimneys
  if (layers.chimneys) {
    for (const c of layout.chimneys) {
      s +=
        `<rect x="${n(c.x - c.wFt / 2)}" y="${n(c.y - c.hFt / 2)}" width="${n(c.wFt)}" height="${n(c.hFt)}"` +
        ` fill="url(#rd-hatch)" stroke="${INK}" stroke-width="${n(fontFt * 0.06)}"/>`;
      s += textEl(c.x, c.y + c.hFt / 2 + fontFt * 0.7, fontFt * 0.8, c.label);
    }
  }
  // Facet stacks
  for (const f of layout.facets) s += facetStack(f, layers, fontFt);
  // Edge lengths
  if (layers.lengths) {
    for (const e of layout.edges) {
      if (e.short || !e.label) continue;
      s += textEl(0, 0, fontFt, e.lengthLabel, ` transform="translate(${n(e.label.pos.x)} ${n(e.label.pos.y)}) rotate(${n(e.label.angleDeg)})"`);
    }
  }
  return s;
}

function northArrow(cx: number, cy: number, r: number, angleDeg: number): string {
  const sw = Math.max(1.5, r * 0.06);
  const shaft = r * 0.62;
  return (
    `<g transform="translate(${n(cx)} ${n(cy)})">` +
    `<circle r="${n(r)}" fill="${PAPER}" stroke="${INK}" stroke-width="${n(sw)}"/>` +
    `<g transform="rotate(${n(angleDeg)})">` +
    `<line x1="0" y1="${n(shaft)}" x2="0" y2="${n(-shaft * 0.35)}" stroke="${INK}" stroke-width="${n(sw)}" stroke-linecap="round"/>` +
    `<polygon points="0,${n(-shaft * 0.72)} ${n(-r * 0.2)},${n(-shaft * 0.3)} ${n(r * 0.2)},${n(-shaft * 0.3)}" fill="${INK}"/>` +
    `<text x="0" y="${n(-r * 0.76)}" font-family="${SANS}" font-weight="900" font-size="${n(r * 0.42)}" fill="${INK}"` +
    ` text-anchor="middle" dominant-baseline="central">N</text>` +
    `</g></g>`
  );
}

function legendBlock(layout: DiagramLayout, x: number, bottom: number, u: number): string {
  if (!layout.legend.length) return "";
  const fs = 13 * u;
  const row = fs * 1.7;
  const padX = 12 * u;
  const padY = 9 * u;
  const swW = 22 * u;
  const swH = 6 * u;
  const textW = Math.max(...layout.legend.map((l) => l.label.length)) * fs * 0.62;
  const w = padX * 2 + swW + 10 * u + textW;
  const h = padY * 2 + row * layout.legend.length;
  const y = bottom - h;
  let s = `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${PAPER}" stroke="${INK}" stroke-width="${n(1.5 * u)}"/>`;
  layout.legend.forEach((l, i) => {
    const cy = y + padY + row * i + row / 2;
    s += `<rect x="${n(x + padX)}" y="${n(cy - swH / 2)}" width="${n(swW)}" height="${n(swH)}" fill="${l.color}"/>`;
    s +=
      `<text x="${n(x + padX + swW + 10 * u)}" y="${n(cy)}" font-family="${MONO}" font-size="${n(fs)}" font-weight="600" fill="${INK}"` +
      ` dominant-baseline="central">${escapeXml(l.label)}</text>`;
  });
  return s;
}

function stampBlock(stamps: string[], cx: number, cy: number, u: number): string {
  let s = "";
  stamps.forEach((text, i) => {
    const size = 84 * u;
    const w = text.length * size * 0.66;
    const h = size * 1.3;
    const padX = size * 0.35;
    s +=
      `<g transform="translate(${n(cx)} ${n(cy + i * h * 1.4)}) rotate(-12)" opacity="0.55">` +
      `<rect x="${n(-w / 2 - padX)}" y="${n(-h / 2)}" width="${n(w + padX * 2)}" height="${n(h)}" fill="none" stroke="${INK}" stroke-width="${n(5 * u)}"/>` +
      `<text x="0" y="0" font-family="${SANS}" font-weight="900" font-size="${n(size)}" fill="${INK}" text-anchor="middle"` +
      ` dominant-baseline="central" textLength="${n(w)}" lengthAdjust="spacingAndGlyphs">${escapeXml(text)}</text>` +
      `</g>`;
  });
  return s;
}

function headerBand(h: DiagramHeader, W: number, bandH: number, u: number): string {
  const m = 40 * u;
  let s = `<rect x="0" y="0" width="${n(W)}" height="${n(bandH)}" fill="${PAPER}"/>`;
  s += `<line x1="0" y1="${n(bandH)}" x2="${n(W)}" y2="${n(bandH)}" stroke="${INK}" stroke-width="${n(2 * u)}"/>`;
  let x = m;
  const logo = h.company?.logoUrl;
  if (h.company && isHttpsUrl(logo)) {
    const size = bandH * 0.5;
    s += `<image href="${escapeXml(logo)}" x="${n(x)}" y="${n(bandH * 0.25)}" width="${n(size)}" height="${n(size)}" preserveAspectRatio="xMidYMid meet"/>`;
    x += size + 16 * u;
  }
  const kickerY = bandH * 0.3;
  const titleY = bandH * 0.56;
  const subY = bandH * 0.8;
  if (h.company?.name) {
    s +=
      `<text x="${n(x)}" y="${n(kickerY)}" font-family="${SANS}" font-weight="900" font-size="${n(15 * u)}" fill="${BLUEPRINT}"` +
      ` letter-spacing="${n(1.6 * u)}" dominant-baseline="central">${escapeXml(h.company.name.toUpperCase())}</text>`;
  }
  s +=
    `<text x="${n(x)}" y="${n(titleY)}" font-family="${SANS}" font-weight="900" font-size="${n(30 * u)}" fill="${INK}"` +
    ` letter-spacing="${n(-0.6 * u)}" dominant-baseline="central">${escapeXml(h.title.toUpperCase())}</text>`;
  s +=
    `<text x="${n(x)}" y="${n(subY)}" font-family="${SANS}" font-weight="500" font-size="${n(15 * u)}" fill="${INK}"` +
    ` dominant-baseline="central">${escapeXml(h.address)}</text>`;
  const right = W - m;
  const mono = (y: number, text: string, size: number, weight: number, fill = INK) =>
    `<text x="${n(right)}" y="${n(y)}" font-family="${MONO}" font-weight="${weight}" font-size="${n(size)}" fill="${fill}"` +
    ` text-anchor="end" dominant-baseline="central">${escapeXml(text)}</text>`;
  s += mono(kickerY, h.drawingNo, 14 * u, 700, BLUEPRINT);
  s += mono(titleY, h.date, 14 * u, 600);
  s += mono(subY, h.source, 11.5 * u, 500);
  return s;
}

/**
 * The whole sheet as one <svg> string: inline styling only, no CSS classes,
 * so it survives Image()→canvas for PNG export and pastes anywhere. Output is
 * a pure function of its inputs.
 */
export function renderDiagramSvg(layout: DiagramLayout, layers: DiagramLayers, opts: RenderSvgOptions = {}): string {
  const W = Math.max(200, Math.round(opts.width ?? 1600));
  const H = Math.max(150, Math.round(opts.height ?? 1200));
  const withHeader = opts.header ?? true;
  const background = opts.background ?? true;
  const u = W / 1600;
  const bandH = withHeader ? Math.round(Math.max(72 * u, H * 0.11)) : 0;
  const areaH = H - bandH;
  const { frame, fontFt } = layout;
  const pxPerFt = Math.min(W / frame.width, areaH / frame.height);
  // Where the (meet-fitted) drawing lands on the sheet, so the grid stays on the feet.
  const drawX = (W - frame.width * pxPerFt) / 2;
  const drawY = bandH + (areaH - frame.height * pxPerFt) / 2;

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  s += "<defs>";
  const grid = 5 * pxPerFt;
  s +=
    `<pattern id="rd-grid" patternUnits="userSpaceOnUse" width="${n(grid)}" height="${n(grid)}"` +
    ` patternTransform="translate(${n(drawX - frame.minX * pxPerFt)} ${n(drawY - frame.minY * pxPerFt)})">` +
    `<path d="M ${n(grid)} 0 L 0 0 0 ${n(grid)}" fill="none" stroke="rgba(0,0,0,0.035)" stroke-width="${n(Math.max(1, u))}"/>` +
    `</pattern>`;
  const hatch = fontFt * 0.5;
  s +=
    `<pattern id="rd-hatch" patternUnits="userSpaceOnUse" width="${n(hatch)}" height="${n(hatch)}" patternTransform="rotate(45)">` +
    `<rect width="${n(hatch)}" height="${n(hatch)}" fill="${PAPER}"/>` +
    `<line x1="0" y1="0" x2="0" y2="${n(hatch)}" stroke="${INK}" stroke-width="${n(hatch * 0.22)}"/>` +
    `</pattern>`;
  s += "</defs>";

  if (background) {
    s += `<rect x="0" y="0" width="${W}" height="${H}" fill="${PAPER}"/>`;
    s += `<rect x="0" y="${bandH}" width="${W}" height="${n(areaH)}" fill="url(#rd-grid)"/>`;
  }

  // The drawing itself, in feet, fitted into the area below the band.
  s +=
    `<svg x="0" y="${bandH}" width="${W}" height="${n(areaH)}" viewBox="${n(frame.minX)} ${n(frame.minY)} ${n(frame.width)} ${n(frame.height)}"` +
    ` preserveAspectRatio="xMidYMid meet" overflow="visible">`;
  s += drawingLayer(layout, layers);
  s += "</svg>";

  if (layers.north) {
    const r = 34 * u;
    s += northArrow(W - 40 * u - r, bandH + 40 * u + r, r, layout.northAngleDeg);
  }
  if (layers.legend) s += legendBlock(layout, 40 * u, H - 40 * u, u);
  if (layout.stamps.length) s += stampBlock(layout.stamps, W / 2, bandH + areaH / 2, u);
  if (withHeader) s += headerBand(layout.header, W, bandH, u);

  s += "</svg>";
  return s;
}
