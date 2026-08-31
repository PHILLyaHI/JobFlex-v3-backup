// The V2 assembly discipline, extracted from modelFromWavefront so the
// arrangement builder shares it instead of re-implementing it (§K7): weld
// points by PLAN position (a roof is a height function — welding by XYZ split
// shared vertices, doubled boundary edges and broke Euler; measured −1 on
// 12621 with 471 ft of phantom rake), dedupe lines, classify or inherit line
// types, EagleView designators by area rank, totals and footage from the
// drawn geometry.
import type { EvLineType, RoofFace, RoofLine, RoofModel, RoofPoint } from "@/lib/eagleview";
import { areaOf } from "@/lib/roofRecon/footprint";

const LEVEL_SLOPE = 0.02;
const Q = 1e-3;

export interface P3 {
  x: number;
  y: number;
  z: number;
  /** Level tag: points weld by PLAN position AND tag. A roof is a height
   *  function except at STEPS between roof levels — there the two sides
   *  carry different z at the same plan point and must stay separate. */
  tag?: string;
}

export interface AssembleCell {
  ring: P3[];
  pitch12: number;
  orientationDeg: number;
  /** The cell's own height function — used by the geometric classifier. */
  zOf: (x: number, y: number) => number;
  /** Known type per boundary edge (by ring index); undefined = classify. */
  edgeTypes?: Array<EvLineType | undefined>;
  /** Индекс исходной ячейки (CellInfo) — для z-солвера. */
  srcIndex?: number;
}

export interface AssembleInput {
  cells: AssembleCell[];
  /** Copied onto the model shell (location, provenance fields). */
  base: RoofModel;
  /** Заполняется сборкой: face id -> srcIndex ячейки (для z-солвера). */
  faceSrcOut?: Map<string, number>;
  idPrefix: string;
  structureIndex: number;
}

export function assembleRoofModel(input: AssembleInput): RoofModel | null {
  const { cells, idPrefix } = input;
  for (const c of cells) if (c.ring.length < 3) return null;

  const points: RoofPoint[] = [];
  const pIds = new Map<string, string>();
  const pt = (p: P3): string => {
    const k = `${Math.round(p.x / Q)}|${Math.round(p.y / Q)}|${p.tag ?? ""}`;
    let id = pIds.get(k);
    if (!id) {
      id = `${idPrefix}P${points.length + 1}`;
      pIds.set(k, id);
      points.push({ id, x: p.x, y: p.y, z: p.z });
    }
    return id;
  };

  const lines: RoofLine[] = [];
  const lIds = new Map<string, string>();
  const fixedTypes = new Map<string, EvLineType>();
  interface Pending { ids: string[]; cell: AssembleCell }
  const pend: Pending[] = [];
  for (const c of cells) {
    const ids: string[] = [];
    for (let i = 0; i < c.ring.length; i++) {
      const a = c.ring[i];
      const b = c.ring[(i + 1) % c.ring.length];
      const aId = pt(a);
      const bId = pt(b);
      if (aId === bId) continue;
      const k = [aId, bId].sort().join("#");
      let id = lIds.get(k);
      if (!id) {
        id = `${idPrefix}L${lines.length + 1}`;
        lIds.set(k, id);
        lines.push({ id, type: "OTHER", aId, bId, lengthFt: Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) });
      }
      const fixed = c.edgeTypes?.[i];
      if (fixed && !fixedTypes.has(id)) fixedTypes.set(id, fixed);
      ids.push(id);
    }
    pend.push({ ids, cell: c });
  }

  const owners = new Map<string, Pending[]>();
  for (const f of pend) for (const id of f.ids) {
    const arr = owners.get(id) ?? [];
    arr.push(f);
    owners.set(id, arr);
  }
  for (const l of lines) {
    const fixed = fixedTypes.get(l.id);
    if (fixed) { l.type = fixed; continue; }
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
      const z1 = own[0].cell.zOf(mid.x + per.x * 0.5, mid.y + per.y * 0.5);
      const z2 = own[1].cell.zOf(mid.x - per.x * 0.5, mid.y - per.y * 0.5);
      l.type = z1 <= zc && z2 <= zc ? "HIP" : "VALLEY";
    }
  }

  const order = [...pend].sort((x, y) => {
    const ax = Math.abs(areaOf(x.cell.ring.map((p) => ({ x: p.x, y: p.y }))));
    const ay = Math.abs(areaOf(y.cell.ring.map((p) => ({ x: p.x, y: p.y }))));
    return ax - ay;
  });
  const faces: RoofFace[] = [];
  let totalArea = 0;
  for (const [rank, f] of order.entries()) {
    const plan = Math.abs(areaOf(f.cell.ring.map((p) => ({ x: p.x, y: p.y }))));
    const sf = Math.sqrt(1 + (f.cell.pitch12 / 12) ** 2);
    const area = plan * sf;
    totalArea += area;
    if (input.faceSrcOut && f.cell.srcIndex !== undefined) input.faceSrcOut.set(`s${input.structureIndex}:${idPrefix}F${rank + 1}`, f.cell.srcIndex);
    faces.push({
      id: `s${input.structureIndex}:${idPrefix}F${rank + 1}`,
      designator: `${String.fromCharCode(65 + Math.floor(rank / 9))}${(rank % 9) + 1}`,
      pitch: f.cell.pitch12,
      areaSqft: area,
      orientation: f.cell.orientationDeg,
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
