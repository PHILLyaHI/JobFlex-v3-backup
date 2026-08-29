// Roof diagram — IS THIS ACTUALLY ROOF?
//
// The Google-Solar building mask is a BUILDING mask, not a roof mask: it takes
// in concrete patios, decks, carports and anything else the segmentation reads
// as structure. The reconstruction then dutifully traces facets there, and the
// drawing gains a "wing" the house does not have (measured on 12629 NE 100th
// Pl: facet A8, 290 sq ft at 1/12, drawn as roof — its vertices sit 0.50–0.67 ft
// above ground, i.e. it is the back patio slab, while every real facet on that
// house sits 14–24 ft up).
//
// Two independent tests, cheapest first:
//
//   1. HEIGHT — a roof is on top of a building. Anything whose whole ring sits
//      below MIN_ROOF_HEIGHT_FT above ground is ground, whatever its shape.
//      Free, deterministic, and catches slabs, driveways and low decks.
//   2. VISION — a raised deck or a carport clears the height test, and only
//      looking at the imagery settles it. `roofRegionsFromVision` asks the
//      model to outline the ROOF surfaces in the ortho (shingle/tile/metal over
//      a building) and explicitly exclude patios, decks, driveways and pools;
//      facets whose plan falls outside every returned region are dropped.
//
// Both are advisory: with no imagery, no key, or a trace that fails its gates,
// the height test still runs and the pipeline behaves exactly as before.
import type { RoofModel } from "@/lib/eagleview";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";

/** Lowest a real roof surface sits above ground, feet. A patio slab is ~0.5,
 *  a deck 1–3, a carport 7+; the lowest residential eave is around 8. */
export const MIN_ROOF_HEIGHT_FT = 5;

export interface RoofRegionReport {
  /** Facets dropped because they sit at ground level. */
  droppedGround: string[];
  /** Facets dropped because vision saw no roof there. */
  droppedOffRoof: string[];
  /** Plan area removed, sq ft. */
  removedSqft: number;
  /** Whether a vision region set was available for the second test. */
  visionUsed: boolean;
  notes: string[];
}

type P2 = { x: number; y: number };

const planArea = (ring: Array<{ x: number; y: number }>): number => {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
};

function pointInRing(p: P2, ring: P2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y) {
      const xi = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (Number.isFinite(xi) && p.x < xi) inside = !inside;
    }
  }
  return inside;
}

/** Share of a ring's plan that falls inside any of `regions`, sampled on a grid. */
function coveredShare(ring: P2[], regions: P2[][]): number {
  if (!regions.length) return 1;
  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const step = Math.max(0.5, Math.max(maxX - minX, maxY - minY) / 24);
  let inside = 0;
  let covered = 0;
  for (let x = minX; x <= maxX; x += step) {
    for (let y = minY; y <= maxY; y += step) {
      const p = { x, y };
      if (!pointInRing(p, ring)) continue;
      inside++;
      if (regions.some((r) => pointInRing(p, r))) covered++;
    }
  }
  return inside > 0 ? covered / inside : 1;
}

export interface KeepRoofOptions {
  /** Roof regions in model-frame feet, from vision. Optional. */
  regions?: P2[][];
  /** A facet must have at least this share of its plan on a roof region. */
  minCoveredShare?: number;
  minHeightFt?: number;
}

/**
 * Drop every facet that is not roof, and the lines left orphaned with them.
 * Pure: the input model is never mutated.
 */
export function keepOnlyRoof(
  input: RoofModel,
  opts: KeepRoofOptions = {},
): { model: RoofModel; report: RoofRegionReport } {
  const minHeight = opts.minHeightFt ?? MIN_ROOF_HEIGHT_FT;
  const minShare = opts.minCoveredShare ?? 0.5;
  const regions = (opts.regions ?? []).filter((r) => r.length >= 3);

  const model: RoofModel = {
    ...input,
    points: input.points.map((p) => ({ ...p })),
    lines: input.lines.map((l) => ({ ...l })),
    faces: input.faces.map((f) => ({ ...f, lineIds: [...f.lineIds] })),
    penetrations: input.penetrations?.map((p) => ({ ...p, lineIds: [...p.lineIds] })) ?? input.penetrations,
  };
  const report: RoofRegionReport = {
    droppedGround: [],
    droppedOffRoof: [],
    removedSqft: 0,
    visionUsed: regions.length > 0,
    notes: [],
  };

  const idx = buildIndexes(model);

  // Which facets form the MAIN roof body? Union-find over shared lines; the
  // largest component by area is the house. The vision test may only remove
  // facets OUTSIDE it — an imperfect region polygon must never be able to cut
  // a hole in the middle of a roof (measured on 419 Prairie Ridge Ln: an early
  // version dropped 242 sq ft of genuine roof, taking every rake with it).
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let r = a;
    while (parent.get(r) && parent.get(r) !== r) r = parent.get(r) as string;
    parent.set(a, r);
    return r;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const f of model.faces) parent.set(f.id, f.id);
  // Connectivity is measured GEOMETRICALLY, not by shared line ids: this runs on
  // the RAW reconstruction, where each facet still carries its own copy of every
  // edge (welding them is refine's job, later). Two facets whose rings come
  // within TOUCH_FT of each other are one roof.
  const TOUCH_FT = 1.5;
  const ringsById = new Map<string, Array<{ x: number; y: number }>>();
  for (const f of model.faces) {
    const r = ringOf(f.lineIds, idx);
    if (r && r.length >= 3) ringsById.set(f.id, r.map((p) => ({ x: p.x, y: p.y })));
  }
  const ids = [...ringsById.keys()];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ringsById.get(ids[i]) as Array<{ x: number; y: number }>;
      const b = ringsById.get(ids[j]) as Array<{ x: number; y: number }>;
      let touch = false;
      for (const p of a) {
        for (const q of b) {
          if (Math.hypot(p.x - q.x, p.y - q.y) <= TOUCH_FT) { touch = true; break; }
        }
        if (touch) break;
      }
      if (touch) union(ids[i], ids[j]);
    }
  }
  const areaByRoot = new Map<string, number>();
  for (const f of model.faces) {
    const root = find(f.id);
    areaByRoot.set(root, (areaByRoot.get(root) ?? 0) + (f.areaSqft ?? 0));
  }
  let mainRoot: string | null = null;
  for (const [root, area] of areaByRoot) {
    if (!mainRoot || area > (areaByRoot.get(mainRoot) ?? 0)) mainRoot = root;
  }

  const doomed = new Set<string>();
  for (const f of model.faces) {
    const ring = ringOf(f.lineIds, idx);
    if (!ring || ring.length < 3) continue;
    const tag = f.designator || f.id;
    const top = Math.max(...ring.map((p) => p.z));
    if (Number.isFinite(top) && top < minHeight) {
      doomed.add(f.id);
      report.droppedGround.push(tag);
      report.removedSqft += planArea(ring);
      report.notes.push(`${tag}: highest corner ${top.toFixed(1)} ft above ground — not a roof`);
      continue;
    }
    if (regions.length && find(f.id) !== mainRoot) {
      const share = coveredShare(
        ring.map((p) => ({ x: p.x, y: p.y })),
        regions,
      );
      if (share < minShare) {
        doomed.add(f.id);
        report.droppedOffRoof.push(tag);
        report.removedSqft += planArea(ring);
        report.notes.push(
          `${tag}: detached from the main roof and only ${(share * 100).toFixed(0)}% of its plan is roof in the imagery`,
        );
      }
    }
  }
  if (!doomed.size) return { model, report };

  // Never strip the house down to nothing: if the tests would take most of the
  // roof, they are wrong about this house and none of it is applied.
  const keptArea = model.faces
    .filter((f) => !doomed.has(f.id))
    .reduce((s, f) => s + (f.areaSqft ?? 0), 0);
  const totalArea = model.faces.reduce((s, f) => s + (f.areaSqft ?? 0), 0);
  if (totalArea > 0 && keptArea < 0.5 * totalArea) {
    report.notes.push(
      `refused: the tests would drop ${(100 - (keptArea / totalArea) * 100).toFixed(0)}% of the roof — treating them as wrong here`,
    );
    report.droppedGround = [];
    report.droppedOffRoof = [];
    report.removedSqft = 0;
    return { model, report };
  }

  model.faces = model.faces.filter((f) => !doomed.has(f.id));
  const referenced = new Set<string>();
  for (const f of [...model.faces, ...(model.penetrations ?? [])]) for (const id of f.lineIds) referenced.add(id);
  model.lines = model.lines.filter((l) => referenced.has(l.id));
  const usedPts = new Set<string>();
  for (const l of model.lines) {
    usedPts.add(l.aId);
    usedPts.add(l.bId);
  }
  model.points = model.points.filter((p) => usedPts.has(p.id));

  const area = model.faces.reduce((s, f) => s + (f.areaSqft ?? 0), 0);
  const footage: Record<string, number> = { EAVE: 0, RIDGE: 0, VALLEY: 0, HIP: 0, RAKE: 0, FLASHING: 0, STEPFLASH: 0, OTHER: 0 };
  const pts = new Map(model.points.map((p) => [p.id, p]));
  for (const l of model.lines) {
    const a = pts.get(l.aId);
    const b = pts.get(l.bId);
    if (!a || !b) continue;
    footage[l.type] = (footage[l.type] ?? 0) + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  model.totals = {
    ...model.totals,
    areaSqft: area,
    squares: area / 100,
    facetCount: model.faces.length,
    footageByType: footage as RoofModel["totals"]["footageByType"],
  };
  return { model, report };
}
