/* §J-ПРАВИЛО (приказ владельца, 2026-08-30): любой проверяющий инструмент
 * обязан ходить через ПРОИЗВОДСТВЕННЫЙ поток, а не через свою сборку.
 * Четыре срабатывания класса «инструмент проверки в другой геометрии, чем
 * продукт» (§K13 №1–4; последнее — лента мерила упрощённый скелет, 12618
 * в ленте проходил, в продакшене падал).
 *
 * Этот модуль — единственный законный способ собрать скелет для стенда:
 * тот же путь, что в экшене (buildRoofV2 → registerContourToRaster →
 * measurePitchFromDsm → structurePitch → pitchOverride → tryWavefront).
 * Исключение одно: синтетики с известным ответом (§K8) мерят МЕХАНИЗМ на
 * сконструированном входе — им производственный поток не положен.
 */
import type { InstantRoofData, RoofModel } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { buildRoofV2 } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { measurePitchFromDsm, structurePitch } from "@/lib/roofRecon/pitchFromDsm";
import { tryWavefront } from "@/lib/roofRecon/wavefrontGate";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";

export interface ProdFlowInput {
  instant: InstantRoofData;
  origin: { lat: number; lng: number };
  clusters: number | null;
  dsm: Raster;
  mask: Raster;
  groundElevFt: number;
}

export interface ProdFlowOut {
  contour: FootprintPoint[];
  skeleton: RoofModel;
  transform: { dxFt: number; dyFt: number; thetaDeg: number };
  registered: boolean;
}

export function productionSkeleton(input: ProdFlowInput): ProdFlowOut | null {
  const { instant, origin, clusters, dsm, mask, groundElevFt } = input;
  const first = buildRoofV2({ instant, origin, clusters });
  if (!first.model) return null;
  const contour = first.report.structures.find((s) => s.ring)?.ring as FootprintPoint[] | undefined;
  if (!contour) return null;
  const reg = registerContourToRaster({ contour, mask, dsm, groundElevFt });
  let skeleton: RoofModel = first.model;
  if (reg.applied) {
    const meas = measurePitchFromDsm({ model: first.model, mask, dsm, transform: reg.transform, transformFor: () => reg.transform, sectionTolerance12: 0.75 });
    const sp = structurePitch(meas, instant.totals?.predominantPitch ?? null, { solarPanels: instant.structures.some((s) => s.solarPanels === true) });
    skeleton = buildRoofV2({ instant, origin, clusters, pitchOverride12: sp.pitch12 }).model ?? first.model;
    if (first.report.structures.filter((s) => s.ring).length === 1) {
      try {
        const g = tryWavefront({ contour, skeletonModel: skeleton, measurement: meas, structurePitch12: sp.pitch12, structureIndex: 0 });
        if (g.model) skeleton = g.model;
      } catch { /* keep */ }
    }
  }
  return {
    contour,
    skeleton,
    transform: reg.applied ? reg.transform : { dxFt: 0, dyFt: 0, thetaDeg: 0 },
    registered: reg.applied,
  };
}
