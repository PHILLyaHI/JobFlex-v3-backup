// Mobile fence estimator (mobile-fence-estimator-v2) — demo fixture + the pure
// derivations the drawing and the two estimate tables are computed from.
//
// MATERIALS / HEIGHTS / OPENINGS / DEMO_PER_FT are carried over VERBATIM from
// the desktop donor fixture
// (src/components/v3/fence-estimator-blueprint/fence-estimator-data.ts): every
// id, label, rate, width and swatch colour is the donor's literal value, so the
// handheld sheet is judged against the same numbers as the desktop studio.
//
// RUNS_SEED / OPENINGS_SEED are the donor's OPENING STATE, which lives in the
// desktop behaviour module rather than its data module (`fs.runs` / `fs.openings`
// in fence-estimator-behavior.ts). The nine runs are verbatim. One opening is
// added on top of the donor's single gate — a free-standing slatted door — for
// two reasons the brief requires:
//   · the donor renders a `Free` placement whenever `run` is null and picks the
//     closed-door glyph whenever `kind === 'door'`; neither state was reachable
//     from a fixture holding one placed gate;
//   · the row-actions sheet disables "Highlight on plan" for an opening that is
//     not placed on a run, and a disabled row has to be reachable at first paint.
//
// This is a design surface. The data layer is out of scope: nothing here touches
// Prisma, a server action or the network. The component clones these seeds per
// mount so runtime mutations never leak between mounts.

export type Material = {
  id: string;
  label: string;
  base: number;
  color: string;
};

export type HeightOption = {
  ft: number;
  mult: number;
};

export type OpeningType = {
  id: string;
  kind: string;
  label: string;
  width: number;
  price: number;
};

/** One traced leg of the fence line. `ft` is what the ledger edits. */
export type FenceRun = { id: string; ft: number };

/** `run` is the 1-based ordinal of the run the opening sits on, or null = free. */
export type FenceOpening = { id: string; type: string; run: number | null };

export const MATERIALS: Material[] = [
  { id: 'cedar',      label: 'Cedar',      base: 28, color: '#b88420' },
  { id: 'vinyl',      label: 'Vinyl',      base: 40, color: '#e8e6e0' },
  { id: 'chain-link', label: 'Chain-link', base: 18, color: '#94a3b8' },
  { id: 'aluminum',   label: 'Aluminum',   base: 55, color: '#475569' },
  { id: 'composite',  label: 'Composite',  base: 48, color: '#7c5a3a' }
];

export const HEIGHTS: HeightOption[] = [
  { ft: 4, mult: 0.78 },
  { ft: 6, mult: 1.0 },
  { ft: 7, mult: 1.18 },
  { ft: 8, mult: 1.4 }
];

export const OPENINGS: OpeningType[] = [
  { id: 'single', kind: 'gate', label: 'Single gate', width: 4,  price: 350 },
  { id: 'double', kind: 'gate', label: 'Double gate', width: 8,  price: 850 },
  { id: 'triple', kind: 'gate', label: 'Triple gate', width: 12, price: 1150 },
  { id: 'arched', kind: 'gate', label: 'Arched gate', width: 4,  price: 600 },
  { id: 'solid',  kind: 'door', label: 'Solid door',  width: 3,  price: 280 },
  { id: 'slatted',kind: 'door', label: 'Slatted door',width: 3,  price: 340 }
];

/** Teardown + haul rate, per linear foot. */
export const DEMO_PER_FT: number = 6;

export const RUNS_SEED: FenceRun[] = [
  { id: 'r1', ft: 50 }, { id: 'r2', ft: 40 }, { id: 'r3', ft: 22 },
  { id: 'r4', ft: 16 }, { id: 'r5', ft: 17 }, { id: 'r6', ft: 14 },
  { id: 'r7', ft: 25 }, { id: 'r8', ft: 19 }, { id: 'r9', ft: 19 }
];

export const OPENINGS_SEED: FenceOpening[] = [
  { id: 'o1', type: 'single', run: 1 },
  { id: 'o2', type: 'slatted', run: null }
];

/** The donor's Reset drops back to the first three runs and the single gate. */
export const RESET_RUNS: FenceRun[] = [
  { id: 'r1', ft: 50 }, { id: 'r2', ft: 40 }, { id: 'r3', ft: 22 }
];
export const RESET_OPENINGS: FenceOpening[] = [{ id: 'o1', type: 'single', run: 1 }];

export const DEFAULT_MATERIAL = 'composite';
export const DEFAULT_HEIGHT = 6;

/** Seattle-area contractor texture, same book as the sibling handheld pages. */
export const SITE_SEED = '14208 NE 182nd St, Woodinville, WA';
export const DRAWING_NO = 'FS-2847';

/* ============================================================
   MONEY / LOOKUPS — the donor's arithmetic, unchanged.
   ============================================================ */

export function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function materialOf(id: string): Material {
  return MATERIALS.find((m) => m.id === id) || MATERIALS[0];
}

export function heightMult(ft: number): number {
  const h = HEIGHTS.find((x) => x.ft === ft);
  return h ? h.mult : 1;
}

export function openingOf(id: string): OpeningType {
  return OPENINGS.find((o) => o.id === id) || OPENINGS[0];
}

export function totalFt(runs: FenceRun[]): number {
  return runs.reduce((a, r) => a + (r.ft || 0), 0);
}

export type Priced = {
  ft: number;
  perFt: number;
  fence: number;
  ops: number;
  demo: number;
  total: number;
  perAll: number;
};

export function priceOf(
  runs: FenceRun[],
  openings: FenceOpening[],
  materialId: string,
  heightFt: number,
  demoOn: boolean,
): Priced {
  const ft = totalFt(runs);
  const perFt = materialOf(materialId).base * heightMult(heightFt);
  const fence = ft * perFt;
  const ops = openings.reduce((a, o) => a + openingOf(o.type).price, 0);
  const demo = demoOn ? ft * DEMO_PER_FT : 0;
  const total = fence + ops + demo;
  return { ft, perFt, fence, ops, demo, total, perAll: ft ? total / ft : 0 };
}

/** One estimate line, in the donor's own wording. */
export type EstimateLine = { key: string; label: string; value: number };

export function estimateLines(
  runs: FenceRun[],
  openings: FenceOpening[],
  materialId: string,
  heightFt: number,
  demoOn: boolean,
): EstimateLine[] {
  const p = priceOf(runs, openings, materialId, heightFt, demoOn);
  const lines: EstimateLine[] = [
    {
      key: 'fence',
      label: `${materialOf(materialId).label} · ${heightFt} ft · ${Math.round(p.ft)} lf`,
      value: p.fence,
    },
  ];
  const groups: Record<string, number> = {};
  openings.forEach((o) => {
    const t = openingOf(o.type);
    groups[t.label] = (groups[t.label] || 0) + 1;
  });
  Object.keys(groups).forEach((k) => {
    const t = OPENINGS.find((o) => o.label === k) as OpeningType;
    lines.push({ key: k, label: `${k} × ${groups[k]}`, value: t.price * groups[k] });
  });
  if (p.demo > 0) {
    lines.push({
      key: 'demo',
      label: `Demolition & haul · ${money(DEMO_PER_FT)}/lf`,
      value: p.demo,
    });
  }
  return lines;
}

/* ============================================================
   PLAN GEOMETRY — the desktop traces the run on a live Google
   Maps layer. There is no map here (and no network call of any
   kind), so the run is DRAWN: the ledger's lengths are walked as
   an orthogonal perimeter, which is what a residential fence line
   actually is.
   The rule is deterministic, so the same ledger always draws the
   same plan: walk east, and turn 90° clockwise as soon as the
   current side has taken a quarter of the total footage. Four
   equal runs therefore close a square, and "Close loop" — which
   appends a run of 12% of the total — visibly closes the figure.
   ============================================================ */

export type Pt = { x: number; y: number };
export type Seg = { id: string; index: number; a: Pt; b: Pt; ft: number; dx: number; dy: number };

const DIRS: Pt[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

export function planSegments(runs: FenceRun[]): Seg[] {
  const total = totalFt(runs);
  const target = total > 0 ? total / 4 : 1;
  const segs: Seg[] = [];
  let dir = 0;
  let side = 0;
  let x = 0;
  let y = 0;
  runs.forEach((r, index) => {
    const v = DIRS[dir];
    // A zero-length run still needs a vertex, so the drawing keeps a mark where
    // the ledger says there is one.
    const len = Math.max(1, r.ft || 0);
    const b = { x: x + v.x * len, y: y + v.y * len };
    segs.push({ id: r.id, index, a: { x, y }, b, ft: r.ft, dx: v.x, dy: v.y });
    x = b.x;
    y = b.y;
    side += len;
    if (side >= target) {
      side = 0;
      dir = (dir + 1) % 4;
    }
  });
  return segs;
}

/** Fixed user-space box: strokes and annotation type stay one size at any
 *  device width, and the plan is fitted INTO it rather than the viewBox being
 *  stretched around it. */
export const PLAN_W = 340;
export const PLAN_H = 252;
const PLAN_PAD = 34;

export type PlanFit = { s: number; ox: number; oy: number };

export function planFit(segs: Seg[]): PlanFit {
  if (!segs.length) return { s: 1, ox: PLAN_W / 2, oy: PLAN_H / 2 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  segs.forEach((g) => {
    [g.a, g.b].forEach((p) => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });
  });
  const bw = maxX - minX;
  const bh = maxY - minY;
  const iw = PLAN_W - PLAN_PAD * 2;
  const ih = PLAN_H - PLAN_PAD * 2;
  const sx = bw > 0 ? iw / bw : Infinity;
  const sy = bh > 0 ? ih / bh : Infinity;
  let s = Math.min(sx, sy);
  // A single short run has no bounding box to fit against; cap the blow-up so
  // one 12 ft leg does not fill the sheet.
  if (!Number.isFinite(s)) s = 4;
  s = Math.min(s, 6);
  return {
    s,
    ox: PLAN_PAD + (iw - bw * s) / 2 - minX * s,
    oy: PLAN_PAD + (ih - bh * s) / 2 - minY * s,
  };
}

/** Largest round footage whose drawn length still fits the scale bar. */
export function scaleUnit(s: number): number {
  const steps = [5, 10, 20, 25, 50, 100, 200];
  let unit = steps[0];
  steps.forEach((u) => {
    if (u * s <= 92) unit = u;
  });
  return unit;
}

/* ============================================================
   ELEVATION GEOMETRY — the desktop's "3D" tab is an empty slot
   waiting for a scene to mount. A placeholder box is the worst
   possible handheld answer, so the second view is a drawn
   ELEVATION: one typical bay run of the fence at true relative
   height, with the picked material's infill and a gate leaf when
   the ledger holds an opening. It is a drawing, not a render,
   which is why it is named for what it is.
   ============================================================ */

export const EL_W = 340;
export const EL_H = 208;
export const EL_GROUND = 166;
export const EL_PX_FT = 15.5;
export const EL_X0 = 48;
export const EL_X1 = 330;
export const EL_BAYS = 5;
export const EL_POST_W = 7;
/** The bay drawn as a gate when the ledger holds at least one opening. */
export const EL_GATE_BAY = 3;
