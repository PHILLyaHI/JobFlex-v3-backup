// МЕТРИКА ПОКРЫТИЯ (roofcore): сколько крыши реально видно сверху —
// гейтованная маска против площади контура. Перенесена из удалённого
// reconV2.ts без изменений (закон и числа те же).
import type { Raster } from "@/lib/solar";
import { areaOf, type FootprintPoint } from "@/lib/roofRecon/footprint";

const FT_PER_M = 3.28084;
const ROOF_MIN_HEIGHT_FT = 4;

export function measureCoverage(input: {
  mask: Raster;
  dsm: Raster;
  groundElevFt: number;
  /** The plan polygons the roof was drawn on, in frame feet. */
  rings: FootprintPoint[][];
  /**
   * Width of the perimeter band left out of the interior figure, feet. The
   * default is the drawing's own eave-overhang allowance (drawing-rules spec
   * §5 P2 puts it at 12–24 in, and the vision gate already uses 4 ft as "this
   * vertex is still on the same wall") — not a new number.
   */
  insetFt?: number;
}): { seenSqft: number; contourSqft: number; share: number; insetSeenSqft: number; insetSqft: number; insetShare: number | null } | null {
  const { mask, dsm, groundElevFt, rings } = input;
  const insetFt = input.insetFt ?? 4;
  const usable = rings.filter((r) => r.length >= 3);
  if (!usable.length) return null;
  const contourSqft = usable.reduce((s2, r) => s2 + areaOf(r), 0);
  if (!(contourSqft > 0)) return null;

  const cutM = (groundElevFt + ROOF_MIN_HEIGHT_FT) / FT_PER_M;
  const stepFt = mask.pixelSizeM * FT_PER_M;
  const cellSqft = stepFt * stepFt;
  const xs = usable.flatMap((r) => r.map((p) => p.x));
  const ys = usable.flatMap((r) => r.map((p) => p.y));
  const { width: w, height: h } = mask;
  // Frame → pixel, clamped to the raster.
  const px0 = Math.max(0, Math.floor(Math.min(...xs) / stepFt + w / 2 - 1));
  const px1 = Math.min(w - 1, Math.ceil(Math.max(...xs) / stepFt + w / 2 + 1));
  const py0 = Math.max(0, Math.floor(h / 2 - Math.max(...ys) / stepFt - 1));
  const py1 = Math.min(h - 1, Math.ceil(h / 2 - Math.min(...ys) / stepFt + 1));

  const inside = (x: number, y: number): boolean => {
    for (const r of usable) {
      let hit = false;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const a = r[i];
        const b = r[j];
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
      }
      if (hit) return true;
    }
    return false;
  };

  // distance from a point to the nearest boundary edge of any ring
  const distToEdge = (x: number, y: number): number => {
    let best = Infinity;
    for (const r of usable) {
      for (let i = 0; i < r.length; i++) {
        const a = r[i];
        const b = r[(i + 1) % r.length];
        const dx = b.x - a.x, dy = b.y - a.y;
        const l2 = dx * dx + dy * dy;
        const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
        best = Math.min(best, Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)));
      }
    }
    return best;
  };

  let seen = 0;
  let insetSeen = 0;
  let insetCells = 0;
  for (let py = py0; py <= py1; py++) {
    for (let px = px0; px <= px1; px++) {
      const x = (px + 0.5 - w / 2) * stepFt;
      const y = (h / 2 - py - 0.5) * stepFt;
      if (!inside(x, y)) continue;
      const deep = distToEdge(x, y) >= insetFt;
      if (deep) insetCells++;
      if (!(mask.data[py * w + px] > 0)) continue;
      const z = dsm.data[py * w + px];
      if (Number.isFinite(z) && z >= cutM) {
        seen++;
        if (deep) insetSeen++;
      }
    }
  }
  const seenSqft = seen * cellSqft;
  const insetSqft = insetCells * cellSqft;
  return {
    seenSqft,
    contourSqft,
    share: Math.min(1, seenSqft / contourSqft),
    insetSeenSqft: insetSeen * cellSqft,
    insetSqft,
    insetShare: insetSqft > 0 ? Math.min(1, insetSeen * cellSqft / insetSqft) : null,
  };
}
