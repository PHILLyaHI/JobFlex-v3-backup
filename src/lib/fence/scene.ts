// THE FENCE IN 3D, FOR THE CLIENT (2026-09-27) — pure, no three.js.
//
// Owner: "when sending the fence proposal to the client, send the 3D as well,
// so they can look." The estimator's 3D is rebuilt from what the proposal
// already stores (the FENCE_PLAN ActivityEvent, lib/fence/planSvg): the
// traced points, the height, the drawn houses and the lot line — and, since
// this date, a `scene` block with what the studio's scene had beyond that:
// the fence's look and colour, the gates with their variants, the priced slope
// class per run, the wall mounts, the land's lattice and the lot line's colour.
// Nothing is uploaded and no Blob store is needed (production has none, so
// the PNG snapshot never reached anyone). An older plan without a `scene`
// still stands up: flat ground, the default look for its type.
//
// `fenceSceneFromPlan` gives the props FenceModel3D takes; the public route
// /api/public-quote/[publicId]/fence-scene serves them as JSON and the
// FenceSceneFigure component mounts the scene on the client's page and on
// the contractor's proposal.

import type { FencePlan, PlanPoint } from "./planSvg";
import { fenceBuildForFamily, parseFenceBuild, type FenceBuild } from "./build";

export type SceneBayClass = "level" | "racked" | "stepped";

export interface FenceSceneTerrain {
  plan: { x0: number; y0: number; dx: number; dy: number; cols: number; rows: number };
  grid: number[][];
}

export interface FenceSceneGate {
  id: string;
  segmentIndex: number;
  t: number;
  widthFt: number;
  kind: "gate" | "door";
  variant: string;
  x?: number;
  y?: number;
}

/** What the studio's scene had beyond the plan. Stored inside the plan. */
export interface FencePlanScene {
  /** The 3D look: cedar | vinyl | chain-link | aluminum | composite. */
  family: string;
  /** The type's swatch colour (#rrggbb). */
  color: string;
  gates: FenceSceneGate[];
  segClasses: Record<number, SceneBayClass>;
  /** The ticket's step count per stepped segment (2026-10-01), so the
   *  client's 3D steps where the price does. Absent on older plans. */
  segSteps?: Record<number, number>;
  wallMounts: PlanPoint[];
  terrain: FenceSceneTerrain | null;
  lotColor: string | null;
  /** What the fence is built from (lib/fence/build, 2026-09-28) — the
   *  client's 3D stands up the same posts, rails and boards as the studio's.
   *  Absent on plans stored before; the look's default build stands in. */
  build?: FenceBuild | null;
}

export const SCENE_FAMILIES = ["cedar", "vinyl", "chain-link", "aluminum", "composite"] as const;
/** The most lattice points a stored scene carries (the studio's own cap is 900). */
export const SCENE_TERRAIN_MAX_POINTS = 2500;
export const SCENE_TERRAIN_MAX_SIDE = 80;

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const HEX = /^#[0-9a-f]{6}$/i;

const readPts = (arr: unknown, max: number): PlanPoint[] =>
  (Array.isArray(arr) ? arr : [])
    .slice(0, max)
    .flatMap((p) => {
      const q = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
      return num(q.x) && num(q.y) ? [q.gap === true ? { x: q.x, y: q.y, gap: true } : { x: q.x, y: q.y }] : [];
    });

/** A stored scene, read back defensively: a bad shape is no scene, never a crash. */
export function parseFencePlanScene(raw: unknown): FencePlanScene | null {
  const r = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  if (!r) return null;
  const family = typeof r.family === "string" && (SCENE_FAMILIES as readonly string[]).includes(r.family) ? r.family : "cedar";
  const color = typeof r.color === "string" && HEX.test(r.color) ? r.color : "";
  const gates: FenceSceneGate[] = (Array.isArray(r.gates) ? r.gates : []).slice(0, 40).flatMap((g, i) => {
    const q = (g && typeof g === "object" ? g : {}) as Record<string, unknown>;
    if (!num(q.segmentIndex) || !num(q.t) || !num(q.widthFt)) return [];
    return [{
      id: typeof q.id === "string" ? q.id.slice(0, 40) : `g${i}`,
      segmentIndex: Math.round(q.segmentIndex),
      t: Math.min(1, Math.max(0, q.t)),
      widthFt: Math.max(0, Math.min(40, q.widthFt)),
      kind: q.kind === "door" ? "door" : "gate",
      variant: typeof q.variant === "string" ? q.variant.slice(0, 20) : q.kind === "door" ? "solid" : "single",
      x: num(q.x) ? q.x : undefined,
      y: num(q.y) ? q.y : undefined,
    }];
  });
  const segClasses: Record<number, SceneBayClass> = {};
  if (r.segClasses && typeof r.segClasses === "object") {
    for (const [k, v] of Object.entries(r.segClasses as Record<string, unknown>).slice(0, 600)) {
      const i = Number(k);
      if (Number.isInteger(i) && i >= 0 && (v === "level" || v === "racked" || v === "stepped")) segClasses[i] = v;
    }
  }
  const segSteps: Record<number, number> = {};
  if (r.segSteps && typeof r.segSteps === "object") {
    for (const [k, v] of Object.entries(r.segSteps as Record<string, unknown>).slice(0, 600)) {
      const i = Number(k);
      if (Number.isInteger(i) && i >= 0 && num(v) && v >= 1 && v <= 400) segSteps[i] = Math.round(v);
    }
  }
  const wallMounts = readPts(r.wallMounts, 40);
  const terrain = parseTerrain(r.terrain);
  const lotColor = typeof r.lotColor === "string" && HEX.test(r.lotColor) ? r.lotColor : null;
  const build = parseFenceBuild(r.build);
  return { family, color, gates, segClasses, segSteps, wallMounts, terrain, lotColor, build };
}

function parseTerrain(raw: unknown): FenceSceneTerrain | null {
  const t = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  const p = (t?.plan && typeof t.plan === "object" ? t.plan : null) as Record<string, unknown> | null;
  if (!t || !p || !Array.isArray(t.grid)) return null;
  if (!num(p.x0) || !num(p.y0) || !num(p.dx) || !num(p.dy) || !num(p.cols) || !num(p.rows)) return null;
  const cols = Math.round(p.cols);
  const rows = Math.round(p.rows);
  if (cols < 2 || rows < 2 || cols > SCENE_TERRAIN_MAX_SIDE || rows > SCENE_TERRAIN_MAX_SIDE || cols * rows > SCENE_TERRAIN_MAX_POINTS) return null;
  if (p.dx <= 0 || p.dy <= 0) return null;
  const grid: number[][] = [];
  for (const row of (t.grid as unknown[]).slice(0, rows)) {
    if (!Array.isArray(row)) return null;
    const vals = row.slice(0, cols).map((v) => (num(v) ? v : NaN));
    if (vals.length !== cols || vals.some((v) => !Number.isFinite(v))) return null;
    grid.push(vals);
  }
  if (grid.length !== rows) return null;
  return { plan: { x0: p.x0, y0: p.y0, dx: p.dx, dy: p.dy, cols, rows }, grid };
}

/**
 * A lattice no bigger than `maxPoints`: every `step`-th sample in each
 * direction, the spacing widened to match, the origin kept. Uniform spacing
 * is what the studio's elevation read assumes, so rows and columns are
 * thinned by the same whole step.
 */
export function capTerrain(t: FenceSceneTerrain, maxPoints = SCENE_TERRAIN_MAX_POINTS, maxSide = SCENE_TERRAIN_MAX_SIDE): FenceSceneTerrain {
  const { cols, rows } = t.plan;
  let step = 1;
  while (Math.ceil(cols / step) * Math.ceil(rows / step) > maxPoints || Math.ceil(cols / step) > maxSide || Math.ceil(rows / step) > maxSide) step++;
  if (step === 1) return t;
  const grid: number[][] = [];
  for (let j = 0; j < rows; j += step) {
    const row: number[] = [];
    for (let i = 0; i < cols; i += step) row.push(t.grid[j][i]);
    grid.push(row);
  }
  return { plan: { x0: t.plan.x0, y0: t.plan.y0, dx: t.plan.dx * step, dy: t.plan.dy * step, cols: grid[0].length, rows: grid.length }, grid };
}

/** The default swatch of each look — the studio's MATERIAL_SWATCH, by value. */
const FAMILY_SWATCH: Record<string, string> = {
  cedar: "#b07a47",
  vinyl: "#eef0ee",
  "chain-link": "#9aa0a6",
  aluminum: "#2c3036",
  composite: "#6f6a60",
};
/** The default swatch of a look, for a colour the page could not resolve. */
export function familySwatch(family: string): string {
  return FAMILY_SWATCH[family] ?? FAMILY_SWATCH.cedar;
}
/** The map's lot line, when a plan predates the stored colour. */
export const SCENE_DEFAULT_LOT_COLOR = "#4a9eff";

/** What FenceModel3D takes, as plain data (its prop types, minus React). */
export interface FenceSceneProps {
  points: PlanPoint[];
  height: number;
  material: string;
  materialColor: string;
  gates: FenceSceneGate[];
  buildings: Array<{ ring: PlanPoint[]; heightFt: number; role: "subject" | "neighbor" }>;
  terrain: FenceSceneTerrain | null;
  segClasses: Record<number, SceneBayClass> | null;
  segSteps: Record<number, number> | null;
  wallMounts: PlanPoint[];
  lots: PlanPoint[][];
  lotColor: string;
  /** The parts the fence is built from. */
  build: FenceBuild;
  /** What the client reads under the scene. */
  facts: string;
}

/**
 * The scene a stored plan stands up. Only the houses the contractor DREW
 * (role subject) are built — the same rule as the studio's own 3D. A plan
 * without a `scene` block gets flat ground and its type's default look.
 */
export function fenceSceneFromPlan(plan: FencePlan): FenceSceneProps | null {
  if (plan.points.length < 2) return null;
  const s = plan.scene;
  const material = s?.family ?? "cedar";
  const gates = plan.gates.length;
  return {
    points: plan.points,
    height: plan.heightFt,
    material,
    materialColor: s?.color || FAMILY_SWATCH[material] || FAMILY_SWATCH.cedar,
    gates: s?.gates ?? plan.gates.map((g, i) => ({ id: `g${i}`, segmentIndex: g.segmentIndex, t: g.t, widthFt: g.widthFt, kind: g.kind, variant: g.kind === "door" ? "solid" : "single", x: g.x, y: g.y })),
    buildings: plan.buildings.filter((b) => b.role === "subject").map((b) => ({ ring: b.ring, heightFt: b.heightFt ?? 12, role: "subject" as const })),
    terrain: s?.terrain ?? null,
    segClasses: s && Object.keys(s.segClasses).length ? s.segClasses : null,
    segSteps: s?.segSteps && Object.keys(s.segSteps).length ? s.segSteps : null,
    wallMounts: s?.wallMounts ?? [],
    lots: plan.lots,
    lotColor: s?.lotColor ?? SCENE_DEFAULT_LOT_COLOR,
    build: s?.build ?? fenceBuildForFamily(material, plan.heightFt),
    facts: `${plan.typeLabel} · ${plan.heightFt} ft · ${Math.round(plan.totalLf)} ft${gates ? ` · ${gates} ${gates === 1 ? "gate" : "gates"}` : ""}`,
  };
}
