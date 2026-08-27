// RoofModel from a weighted-wavefront result: per-facet lift at the facet's
// own slope (z = slope_i · dist to edge i's line — each facet is planar on
// its edge's plane by construction), then the same assembly discipline the
// other V2 builders use: weld points, dedupe lines, classify by geometry,
// EagleView designators by area rank, totals and footage from the drawn
// geometry (the H3 identity holds by construction).

import type { EvLineType, RoofFace, RoofLine, RoofModel, RoofPoint } from "@/lib/eagleview";
import { areaOf, type FootprintPoint } from "@/lib/roofRecon/footprint";
import type { WavefrontResult, WPt } from "@/lib/roofRecon/weightedWavefront";

const LEVEL_SLOPE = 0.02;
const Q = 1e-3;

export interface WavefrontModelInput {
  contour: FootprintPoint[];
  slopes: number[]; // rise/run per contour edge; Infinity = gable
  result: WavefrontResult;
  /** Copied onto the model shell (location, provenance fields). */
  base: RoofModel;
  structureIndex: number;
}

export function modelFromWavefront(input: WavefrontModelInput): RoofModel | null {
  const { contour, slopes, result } = input;
  const n = contour.length;

  const edgeLine = (i: number) => {
    const a = contour[i];
    const b = contour[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    // inward normal for a CCW contour
    const ccw = areaOf(contour) > 0 ? 1 : -1;
    return { a, nrm: { x: -d.y * ccw, y: d.x * ccw } };
  };
  const zOn = (i: number, p: WPt): number => {
    const { a, nrm } = edgeLine(i);
    return slopes[i] * ((p.x - a.x) * nrm.x + (p.y - a.y) * nrm.y);
  };

  type P3 = { x: number; y: number; z: number };
  const rings: Array<{ ring: P3[]; pitch12: number; edgeIndex: number }> = [];
  for (const f of result.facets) {
    const s = slopes[f.edgeIndex];
    if (!Number.isFinite(s)) return null;
    const ring = f.ring.map((p) => ({ x: p.x, y: p.y, z: zOn(f.edgeIndex, p) }));
    if (ring.length < 3) return null;
    rings.push({ ring, pitch12: s * 12, edgeIndex: f.edgeIndex });
  }

  // ── assembly ──
  const points: RoofPoint[] = [];
  const pIds = new Map<string, string>();
  // Weld by PLAN position only: a roof is a height function, so one plan
  // point carries one z. Facet planes at a shared node agree to the engine's
  // equal-height tolerance but not to the weld quantum — welding by XYZ split
  // shared vertices, doubled the boundary edges and broke Euler (measured:
  // −1 on 12621, 471 ft of phantom rake).
  const pt = (p: P3): string => {
    const k = `${Math.round(p.x / Q)}|${Math.round(p.y / Q)}`;
    let id = pIds.get(k);
    if (!id) {
      id = `WP${points.length + 1}`;
      pIds.set(k, id);
      points.push({ id, x: p.x, y: p.y, z: p.z });
    }
    return id;
  };
  const lines: RoofLine[] = [];
  const lIds = new Map<string, string>();
  interface Pending { ids: string[]; ring: P3[]; pitch12: number; edgeIndex: number }
  const pend: Pending[] = [];
  for (const r of rings) {
    const ids: string[] = [];
    for (let i = 0; i < r.ring.length; i++) {
      const a = r.ring[i];
      const b = r.ring[(i + 1) % r.ring.length];
      const aId = pt(a);
      const bId = pt(b);
      if (aId === bId) continue;
      const k = [aId, bId].sort().join("#");
      let id = lIds.get(k);
      if (!id) {
        id = `WL${lines.length + 1}`;
        lIds.set(k, id);
        lines.push({ id, type: "OTHER", aId, bId, lengthFt: Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) });
      }
      ids.push(id);
    }
    pend.push({ ids, ring: r.ring, pitch12: r.pitch12, edgeIndex: r.edgeIndex });
  }
  const owners = new Map<string, Pending[]>();
  for (const f of pend) for (const id of f.ids) {
    const arr = owners.get(id) ?? [];
    arr.push(f);
    owners.set(id, arr);
  }
  const zOf = (f: Pending, x: number, y: number): number => zOn(f.edgeIndex, { x, y });
  for (const l of lines) {
    const a = points.find((p) => p.id === l.aId)!;
    const b = points.find((p) => p.id === l.bId)!;
    const run = Math.hypot(b.x - a.x, b.y - a.y);
    const level = Math.abs(a.z - b.z) <= Math.max(0.08, LEVEL_SLOPE * run);
    const own = owners.get(l.id) ?? [];
    if (own.length <= 1) {
      l.type = level ? "EAVE" : "RAKE";
    } else if (level) {
      l.type = "RIDGE";
    } else {
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zc = (a.z + b.z) / 2;
      const dir = { x: (b.x - a.x) / (run || 1), y: (b.y - a.y) / (run || 1) };
      const per = { x: -dir.y, y: dir.x };
      const z1 = zOf(own[0], mid.x + per.x * 0.5, mid.y + per.y * 0.5);
      const z2 = zOf(own[1], mid.x - per.x * 0.5, mid.y - per.y * 0.5);
      l.type = z1 <= zc && z2 <= zc ? "HIP" : "VALLEY";
    }
  }
  const order = [...pend].sort((x, y) => {
    const ax = Math.abs(areaOf(x.ring.map((p) => ({ x: p.x, y: p.y }))));
    const ay = Math.abs(areaOf(y.ring.map((p) => ({ x: p.x, y: p.y }))));
    return ax - ay;
  });
  const faces: RoofFace[] = [];
  let totalArea = 0;
  for (const [rank, f] of order.entries()) {
    const plan = Math.abs(areaOf(f.ring.map((p) => ({ x: p.x, y: p.y }))));
    const sf = Math.sqrt(1 + (f.pitch12 / 12) ** 2);
    const area = plan * sf;
    totalArea += area;
    const { nrm } = edgeLine(f.edgeIndex);
    faces.push({
      id: `s${input.structureIndex}:WF${rank + 1}`,
      designator: `${String.fromCharCode(65 + Math.floor(rank / 9))}${(rank % 9) + 1}`,
      pitch: f.pitch12,
      areaSqft: area,
      orientation: ((Math.atan2(-nrm.x, -nrm.y) * 180) / Math.PI + 360) % 360,
      lineIds: f.ids,
    });
  }
  const footageByType = {} as Record<EvLineType, number>;
  for (const l of lines) footageByType[l.type] = (footageByType[l.type] ?? 0) + l.lengthFt;
  for (const t of ["EAVE", "RIDGE", "VALLEY", "HIP", "RAKE", "FLASHING", "STEPFLASH", "OTHER"] as EvLineType[]) footageByType[t] = footageByType[t] ?? 0;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y), zs = points.map((p) => p.z);
  const byPitchArea = new Map<number, number>();
  for (const f of faces) {
    const key = Math.round(f.pitch * 100) / 100;
    byPitchArea.set(key, (byPitchArea.get(key) ?? 0) + f.areaSqft);
  }
  const predominant = [...byPitchArea.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? input.base.totals.predominantPitch;

  return {
    ...input.base,
    points,
    lines,
    faces,
    totals: {
      ...input.base.totals,
      areaSqft: totalArea,
      squares: totalArea / 100,
      facetCount: faces.length,
      predominantPitch: predominant,
      footageByType,
      bounds: {
        minX: Math.min(...xs), maxX: Math.max(...xs),
        minY: Math.min(...ys), maxY: Math.max(...ys),
        minZ: Math.min(...zs), maxZ: Math.max(...zs),
      },
    },
  };
}
