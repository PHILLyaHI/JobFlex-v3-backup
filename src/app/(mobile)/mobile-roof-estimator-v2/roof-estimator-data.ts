// Mobile roof estimator (mobile-roof-estimator-v2) — demo fixture + the pure
// measurement math the handheld page draws from.
//
// SAMPLES / STATES / LINE_COLORS / LINE_LABEL / faces / edges / REPORT_SEED /
// MS_STAGES are carried VERBATIM from the desktop donor fixture
// (src/components/v3/roof-estimator-blueprint/roof-estimator-data.ts) so the
// handheld composition is judged against exactly the same roof as the desktop
// sheet: same coordinates, same pitches, same sample report ids.
//
// Everything below the fixture is the donor's own arithmetic, lifted out of
// roof-estimator-behavior.ts unchanged (polyArea / pitchFactor / faceArea /
// edgeLen / num / money, the totals IIFE, the linear-footage and pitch-mix
// groupings, and the materials/labor takeoff with its per-unit prices). It
// lives here rather than in the component because it is pure: no state, no
// DOM, no network. The data layer is out of scope — nothing here touches
// Prisma, a server action or fetch.
//
// The one thing the page ADDS is buildPlan(): the donor renders its SVG in raw
// FEET (a ~94×52 viewBox), which on a phone blows every annotation up by the
// viewport scale — a 8.5-unit facet label lands near 27px. buildPlan maps the
// same projected geometry into a fixed 340×230 drawing frame, so one user unit
// is ≈1 CSS px at handheld width and stroke weights / type sizes are authored
// in the units they render in. Same projection, same centroids, same labels.

export type Sample = {
  id: number;
  label: string;
  detail: string;
};

/** Roof plane. `pts` are [x, y] pairs in feet. */
export type Face = {
  id: string;
  name: string;
  pitch: number;
  dir: string;
  pts: number[][];
};

/** Roof edge: `a` → `b`, [x, y] in feet. */
export type Edge = {
  type: string;
  a: number[];
  b: number[];
};

export const SAMPLES: Sample[] = [
  { id: 69153261, label: 'Single structure',    detail: '419 Prairie Ridge Ln, North Aurora IL' },
  { id: 69077209, label: 'Multiple structures', detail: 'Sample report' },
  { id: 69110976, label: 'Complex structure',   detail: 'Sample report' }
];

export const STATES: string[] = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

/**
 * The donor's edge palette, kept verbatim for fixture fidelity.
 *
 * The handheld drawing does NOT paint with it. RAKE is `#7c3aed` — a purple,
 * which is on the design system's explicit anti-reference list, and a
 * five-colour categorical ramp is exactly the "rainbow series" the palette
 * rules forbid. The mobile plan encodes edge type with the house tokens plus
 * line WEIGHT and DASH instead (see EDGE_KEYS), which is also closer to how a
 * real roof plan reads. The donor values stay here so the substitution is
 * reviewable rather than silent.
 */
export const LINE_COLORS: Record<string, string> = { RIDGE: '#3a7d44', HIP: '#b88420', VALLEY: '#1854a0', RAKE: '#7c3aed', EAVE: '#475569' };
export const LINE_LABEL: Record<string, string> = { RIDGE: 'Ridge', HIP: 'Hip', VALLEY: 'Valley', RAKE: 'Rake', EAVE: 'Eave', FLASHING: 'Flashing' };

// Roof plan: hip base + a gable wing. Coordinates in feet.
export const faces: Face[] = [
  { id: 'F1', name: 'Front slope', pitch: 6, dir: 'S', pts: [[0,0],[56,0],[42,18],[14,18]] },
  { id: 'F2', name: 'Back slope',  pitch: 6, dir: 'N', pts: [[0,36],[56,36],[42,18],[14,18]] },
  { id: 'F3', name: 'West hip',    pitch: 6, dir: 'W', pts: [[0,0],[14,18],[0,36]] },
  { id: 'F4', name: 'East hip',    pitch: 6, dir: 'E', pts: [[56,0],[56,36],[42,18]] },
  { id: 'F5', name: 'Wing front',  pitch: 8, dir: 'S', pts: [[56,6],[78,6],[78,18],[56,18]] },
  { id: 'F6', name: 'Wing back',   pitch: 8, dir: 'N', pts: [[56,30],[78,30],[78,18],[56,18]] }
];

export const edges: Edge[] = [
  { type: 'RIDGE',  a: [14,18], b: [42,18] },
  { type: 'RIDGE',  a: [56,18], b: [78,18] },
  { type: 'HIP',    a: [0,0],   b: [14,18] },
  { type: 'HIP',    a: [0,36],  b: [14,18] },
  { type: 'HIP',    a: [56,0],  b: [42,18] },
  { type: 'HIP',    a: [56,36], b: [42,18] },
  { type: 'VALLEY', a: [56,6],  b: [50,12] },
  { type: 'VALLEY', a: [56,30], b: [50,24] },
  { type: 'EAVE',   a: [0,0],   b: [56,0] },
  { type: 'EAVE',   a: [0,36],  b: [56,36] },
  { type: 'EAVE',   a: [56,6],  b: [78,6] },
  { type: 'EAVE',   a: [56,30], b: [78,30] },
  { type: 'RAKE',   a: [78,6],  b: [78,18] },
  { type: 'RAKE',   a: [78,30], b: [78,18] }
];

/**
 * The donor MUTATES both fields (a sample tap rewrites the address, an order
 * rewrites the id), so the component takes a per-mount copy of this seed.
 */
export const REPORT_SEED: { id: number; address: string } = {
  id: 69153261,
  address: '419 Prairie Ridge Ln, North Aurora IL'
};

/** The measuring screen's stage captions. */
export const MS_STAGES: string[] = ['Ordering report…', 'Locating the structure…', 'Tracing facets…', 'Measuring pitch…', 'Report ready'];

/** Donor: `Report price <b>$24</b> · delivered in minutes`. */
export const REPORT_PRICE = 24;

/** Donor: the waste-factor <select> options, as numbers. */
export const WASTE_OPTIONS: number[] = [10, 12, 15, 18];

/* ============================================================
   GEOMETRY — the donor's arithmetic, unchanged
   ============================================================ */

export function polyArea(pts: number[][]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

export function pitchFactor(p: number): number {
  return Math.sqrt(1 + (p / 12) * (p / 12));
}

export function faceArea(f: Face): number {
  return polyArea(f.pts) * pitchFactor(f.pitch);
}

export function edgeLen(e: Edge): number {
  return Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
}

export function num(n: number, d?: number): string {
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: d == null ? 0 : d });
}

export function money(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

/** Drawing-sheet dimension text: 78 → 78'-0". Annotation layer, mono only. */
export function feetInches(v: number): string {
  const whole = Math.floor(v);
  const inches = Math.round((v - whole) * 12);
  return inches === 12 ? `${whole + 1}'-0"` : `${whole}'-${inches}"`;
}

export const TOTALS = (function () {
  const area = faces.reduce((a, f) => a + faceArea(f), 0);
  const byPitch: Record<string, number> = {};
  faces.forEach((f) => {
    byPitch[f.pitch] = (byPitch[f.pitch] || 0) + faceArea(f);
  });
  const predominant = Object.keys(byPitch).sort((a, b) => byPitch[b] - byPitch[a])[0];
  return {
    area,
    squares: area / 100,
    facets: faces.length,
    pitch: Number(predominant),
    byPitch,
  };
})();

/** Edge lengths grouped by type, in the fixture's own insertion order. */
export function linearByType(): Array<{ type: string; feet: number }> {
  const by: Record<string, number> = {};
  edges.forEach((e) => {
    by[e.type] = (by[e.type] || 0) + edgeLen(e);
  });
  return Object.keys(by).map((type) => ({ type, feet: by[type] }));
}

export const LINEAR_TOTAL = linearByType().reduce((a, r) => a + r.feet, 0);

export function pitchGroups(): Array<{ pitch: number; area: number; pct: number }> {
  return Object.keys(TOTALS.byPitch)
    .map((p) => ({
      pitch: Number(p),
      area: TOTALS.byPitch[p],
      pct: (TOTALS.byPitch[p] / TOTALS.area) * 100,
    }))
    .sort((a, b) => b.area - a.area);
}

/**
 * The donor's three-branch advisory. With this geometry the steep branch
 * fires (635 sq ft at 8/12) and the low-slope branch does not — both are
 * computed from the fixture, so a flatter roof would flip them.
 */
export function pitchCalls(): Array<{ tone: "warn" | "info"; text: string }> {
  const groups = pitchGroups();
  const steep = groups.filter((g) => g.pitch >= 8).reduce((a, g) => a + g.area, 0);
  const low = groups.filter((g) => g.pitch <= 2).reduce((a, g) => a + g.area, 0);
  const out: Array<{ tone: "warn" | "info"; text: string }> = [];
  if (steep > 0) {
    out.push({
      tone: "warn",
      text: `${num(steep)} sq ft at 8/12 or steeper — plan for roof jacks and a steep-pitch labor rate.`,
    });
  }
  if (low > 0) {
    out.push({
      tone: "info",
      text: `${num(low)} sq ft of low slope — shingles are out of spec; price a membrane instead.`,
    });
  }
  if (!out.length) {
    out.push({ tone: "info", text: "All facets are walkable — standard labor rate applies." });
  }
  return out;
}

/* ============================================================
   TAKEOFF — the donor's materials / labor tables
   ============================================================ */

export type TakeoffRow = { n: string; q: number; u: string; p: number };

export function wasteSquares(waste: number): number {
  return TOTALS.squares * (1 + waste / 100);
}

export function buildTakeoff(waste: number): {
  materials: TakeoffRow[];
  labor: TakeoffRow[];
  matSum: number;
  labSum: number;
  total: number;
} {
  const sq = wasteSquares(waste);
  const feetOf = (type: string) =>
    edges.filter((e) => e.type === type).reduce((a, e) => a + edgeLen(e), 0);
  const ridgeFt = feetOf("RIDGE");
  const eaveFt = feetOf("EAVE");
  const valleyFt = feetOf("VALLEY");

  const materials: TakeoffRow[] = [
    { n: "Architectural shingles", q: Math.ceil(sq), u: "square", p: 128 },
    { n: "Synthetic underlayment", q: Math.ceil(sq / 4), u: "roll", p: 92 },
    { n: "Ice & water shield", q: Math.ceil((eaveFt + valleyFt) / 65), u: "roll", p: 118 },
    { n: "Ridge vent", q: Math.ceil(ridgeFt / 4), u: "each", p: 21 },
    { n: "Drip edge", q: Math.ceil(eaveFt / 10), u: "each", p: 14 },
    { n: "Hip & ridge cap", q: Math.ceil(ridgeFt / 20), u: "bundle", p: 64 },
  ];

  const labor: TakeoffRow[] = [
    { n: "Tear-off and disposal", q: Math.round(TOTALS.squares), u: "square", p: 62 },
    { n: "Underlayment and flashing", q: Math.round(TOTALS.squares), u: "square", p: 34 },
    { n: "Shingle installation", q: Math.round(TOTALS.squares), u: "square", p: 118 },
    {
      n: "Steep-pitch surcharge",
      q: Math.round(TOTALS.byPitch[8] ? TOTALS.byPitch[8] / 100 : 0),
      u: "square",
      p: 28,
    },
  ].filter((l) => l.q > 0);

  const matSum = materials.reduce((a, r) => a + r.q * r.p, 0);
  const labSum = labor.reduce((a, r) => a + r.q * r.p, 0);
  return { materials, labor, matSum, labSum, total: matSum + labSum };
}

/* ============================================================
   PLAN — projection, then a fit into a 340×230 drawing frame
   ============================================================ */

export type ViewMode = "2d" | "3d";
export type LabelMode = "shaded" | "pitch" | "area" | "length";

/** The drawing frame. 340 wide so one user unit ≈ 1 CSS px at 320–414px. */
export const PLAN_VB = { w: 340, h: 230 };

export type PlanFacet = {
  id: string;
  name: string;
  dir: string;
  pitch: number;
  area: number;
  points: string;
  cx: number;
  cy: number;
  tone: number;
  head: string;
  sub: string;
};

export type PlanEdge = {
  key: string;
  type: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mx: number;
  my: number;
  feet: number;
};

export type PlanDim = {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  tx: number;
  ty: number;
  label: string;
  vertical: boolean;
};

export type Plan = { facets: PlanFacet[]; edges: PlanEdge[]; dims: PlanDim[] };

function project(p: number[], z: number, view: ViewMode): [number, number] {
  if (view === "2d") return [p[0], p[1]];
  // 30° axonometric: x' = (x - y) cos30, y' = (x + y) sin30 - height
  const c = Math.cos(Math.PI / 6);
  const s = Math.sin(Math.PI / 6);
  return [(p[0] - p[1]) * c, (p[0] + p[1]) * s - z];
}

/** Ridge height: points on the y=18 line inside the outline are raised. */
export function heightAt(pt: number[]): number {
  const onMainRidge = pt[1] === 18 && pt[0] >= 14 && pt[0] <= 42;
  const onWingRidge = pt[1] === 18 && pt[0] >= 56;
  if (onMainRidge) return (18 * 6) / 12;
  if (onWingRidge) return (12 * 8) / 12;
  if (pt[1] === 18) return 14; // where the wing ridge meets the main hip
  return 0;
}

/** The donor's faceLabel(), returned as [head, sub]. */
export function facetLabel(f: Face, mode: LabelMode): [string, string] {
  if (mode === "pitch") return [String(f.pitch), "rise / 12"];
  if (mode === "area") return [num(faceArea(f)), "sq ft"];
  if (mode === "length") return [num(Math.sqrt(polyArea(f.pts)), 0) + "'", "run"];
  return [f.id, f.dir];
}

export function buildPlan(view: ViewMode, mode: LabelMode): Plan {
  const all: Array<[number, number]> = [];
  faces.forEach((f) => f.pts.forEach((p) => all.push(project(p, heightAt(p), view))));
  edges.forEach((e) => {
    all.push(project(e.a, heightAt(e.a), view));
    all.push(project(e.b, heightAt(e.b), view));
  });

  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);

  // 2D leaves a gutter left and below for the overall dimension lines.
  const pad = view === "2d" ? { l: 38, r: 16, t: 20, b: 34 } : { l: 16, r: 16, t: 16, b: 16 };
  const plotW = PLAN_VB.w - pad.l - pad.r;
  const plotH = PLAN_VB.h - pad.t - pad.b;
  const s = Math.min(plotW / spanX, plotH / spanY);
  const ox = pad.l + (plotW - spanX * s) / 2;
  const oy = pad.t + (plotH - spanY * s) / 2;
  const X = (x: number) => ox + (x - minX) * s;
  const Y = (y: number) => oy + (y - minY) * s;

  const planFacets: PlanFacet[] = faces.map((f, i) => {
    const points = f.pts
      .map((p) => {
        const q = project(p, heightAt(p), view);
        return `${X(q[0]).toFixed(2)},${Y(q[1]).toFixed(2)}`;
      })
      .join(" ");
    const c = f.pts.reduce(
      (a, p) => [a[0] + p[0] / f.pts.length, a[1] + p[1] / f.pts.length],
      [0, 0],
    );
    const cz = project(c, heightAt([c[0], Math.round(c[1])]) * 0.55, view);
    const [head, sub] = facetLabel(f, mode);
    return {
      id: f.id,
      name: f.name,
      dir: f.dir,
      pitch: f.pitch,
      area: faceArea(f),
      points,
      cx: X(cz[0]),
      cy: Y(cz[1]),
      tone: (i % 4) + 1,
      head,
      sub,
    };
  });

  const planEdges: PlanEdge[] = edges.map((e, i) => {
    const a = project(e.a, heightAt(e.a), view);
    const b = project(e.b, heightAt(e.b), view);
    const x1 = X(a[0]);
    const y1 = Y(a[1]);
    const x2 = X(b[0]);
    const y2 = Y(b[1]);
    return {
      key: `${e.type}-${i}`,
      type: e.type,
      x1,
      y1,
      x2,
      y2,
      mx: (x1 + x2) / 2,
      my: (y1 + y2) / 2,
      feet: edgeLen(e),
    };
  });

  // Overall dimensions only make sense on the flat plan; the axonometric view
  // foreshortens both runs, so annotating them there would be a lie.
  const dims: PlanDim[] = [];
  if (view === "2d") {
    const left = X(minX);
    const right = X(maxX);
    const top = Y(minY);
    const bottom = Y(maxY);
    dims.push({
      key: "width",
      x1: left,
      y1: bottom + 18,
      x2: right,
      y2: bottom + 18,
      tx: (left + right) / 2,
      ty: bottom + 22,
      label: feetInches(maxX - minX),
      vertical: false,
    });
    dims.push({
      key: "depth",
      x1: left - 22,
      y1: top,
      x2: left - 22,
      y2: bottom,
      tx: left - 18,
      ty: (top + bottom) / 2,
      label: feetInches(maxY - minY),
      vertical: true,
    });
  }

  return { facets: planFacets, edges: planEdges, dims };
}

/**
 * Legend order for the drawing. The tone/weight/dash treatment lives in CSS
 * (one class per key) so the plan and the legend swatch can never drift.
 */
export const EDGE_KEYS: string[] = ["RIDGE", "HIP", "VALLEY", "EAVE", "RAKE"];

/**
 * A sample carries a real street address only for the first record; the other
 * two are labelled "Sample report". This is what makes the actions sheet's
 * DISABLED row reachable from the fixture rather than from a flag.
 */
export function hasStreetAddress(s: Sample): boolean {
  return s.detail.trim().toLowerCase() !== "sample report";
}

/** SINGLE / MULTIPLE / COMPLEX — the badge on line 3 of a sample row. */
export function structureKind(s: Sample): string {
  return s.label.split(" ")[0].toUpperCase();
}
