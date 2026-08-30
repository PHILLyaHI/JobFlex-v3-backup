/* Прошивка: строки НОВОГО пути (measured-arrangement) в БД из полевых кэшей —
 * живая страница получает свежие чертежи без единого платного лукапа.
 *
 *   npx tsx scripts/qa/roof/stitch-persist.ts --org <organizationId>
 *
 * По каждому из шести адресов: тот же V2-поток, что в сервер-экшене
 * (скелет → регистрация → уклон → wavefront → сшивка measured-arrangement),
 * модель и StitchProvenance — в RoofMeasurement той же формы, что пишет
 * measureRoofInstant / roof-diagram-eval --persist. Заголовочные цифры —
 * Instant'овские (как в экшене). Ферма честно уходит строкой со скелетом
 * и провенансом skeleton-fill.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { loadHarnessEnv } from "./env";

loadHarnessEnv();

import type { InstantRoofData, RoofModel } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { buildRoofV2 } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { measurePitchFromDsm, structurePitch } from "@/lib/roofRecon/pitchFromDsm";
import { tryWavefront } from "@/lib/roofRecon/wavefrontGate";
import { buildMeasuredRoof } from "@/lib/roofRecon/measuredRoof";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";
import { loadFixture, type FixtureMeta } from "./fixture";

interface Job { key: string; dir: string; fixture?: string; address: string; city: string; state: string; zip: string }
const JOBS: Job[] = [
  { key: "12629", dir: "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl", fixture: "kirkland-12629-ne-100th-pl", address: "12629 NE 100th Pl", city: "Kirkland", state: "WA", zip: "98033" },
  { key: "12621", dir: "scripts/qa/roof/field/12621-ne-100th-pl-kirkland-wa", address: "12621 NE 100th Pl", city: "Kirkland", state: "WA", zip: "98033" },
  { key: "12618", dir: "scripts/qa/roof/field/12618-ne-100th-st-kirkland-wa", address: "12618 NE 100th St", city: "Kirkland", state: "WA", zip: "98033" },
  { key: "9903", dir: "scripts/qa/roof/field/9903-117th-pl-ne-kirkland-wa", address: "9903 117th Pl NE", city: "Kirkland", state: "WA", zip: "98033" },
  { key: "419", dir: "scripts/qa/roof/fixtures/prairie-419-prairie-ridge-ln", fixture: "prairie-419-prairie-ridge-ln", address: "419 Prairie Ridge Ln", city: "North Aurora", state: "IL", zip: "60542" },
  { key: "12117", dir: "scripts/qa/roof/field/12117-202nd-st-se-snohomish-wa", address: "12117 202nd St SE", city: "Snohomish", state: "WA", zip: "98296" },
];

function rasterFrom(file: string, meta: FixtureMeta): Raster {
  const buf = gunzipSync(readFileSync(file));
  const data = new Float32Array(meta.raster.width * meta.raster.height);
  Buffer.from(data.buffer).set(buf);
  return { width: meta.raster.width, height: meta.raster.height, pixelSizeM: meta.raster.pixelSizeM, data } as Raster;
}

(async () => {
  const args = process.argv.slice(2);
  const orgIdx = args.indexOf("--org");
  const orgId = orgIdx >= 0 ? args[orgIdx + 1] : null;
  if (!orgId) {
    console.error("нужно: --org <organizationId>");
    process.exit(1);
  }
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();

  const skipKeys = new Set((args[args.indexOf("--skip") + 1] ?? "").split(",").filter((x) => args.includes("--skip") && x));
  for (const job of JOBS) {
    if (skipKeys.has(job.key)) { console.log(`${job.key}: пропущен (--skip)`); continue; }
    if (!existsSync(resolve(job.dir, "meta.json"))) { console.log(`${job.key}: нет кэша — пропуск`); continue; }
    const meta = JSON.parse(readFileSync(resolve(job.dir, "meta.json"), "utf8")) as FixtureMeta;
    const instant = JSON.parse(readFileSync(resolve(job.dir, "instant.json"), "utf8")) as InstantRoofData;
    let dsm: Raster, mask: Raster;
    if (job.fixture) { const fx = loadFixture(job.fixture); dsm = fx.dsm; mask = fx.mask; }
    else { dsm = rasterFrom(resolve(job.dir, "dsm.f32.gz"), meta); mask = rasterFrom(resolve(job.dir, "mask.f32.gz"), meta); }
    const ground = meta.diagnostics.groundElevFt as number;
    const clustersN = (meta.diagnostics.clusters as number) ?? null;

    // тот же V2-поток, что в экшене
    const first = buildRoofV2({ instant, origin: meta.origin, clusters: clustersN });
    if (!first.model) { console.log(`${job.key}: V2 не построил скелет — пропуск`); continue; }
    const contour = first.report.structures.find((s) => s.ring)?.ring as FootprintPoint[] | undefined;
    if (!contour) { console.log(`${job.key}: нет контура — пропуск`); continue; }
    const reg = registerContourToRaster({ contour, mask, dsm, groundElevFt: ground });
    let skeleton: RoofModel = first.model;
    let pitchNote = "instant";
    if (reg.applied) {
      const meas = measurePitchFromDsm({ model: first.model, mask, dsm, transform: reg.transform, transformFor: () => reg.transform, sectionTolerance12: 0.75 });
      const sp = structurePitch(meas, instant.totals?.predominantPitch ?? null, { solarPanels: instant.structures.some((s) => s.solarPanels === true) });
      pitchNote = sp.source;
      skeleton = buildRoofV2({ instant, origin: meta.origin, clusters: clustersN, pitchOverride12: sp.pitch12 }).model ?? first.model;
      if (first.report.structures.filter((s) => s.ring).length === 1) {
        try {
          const g = tryWavefront({ contour, skeletonModel: skeleton, measurement: meas, structurePitch12: sp.pitch12, structureIndex: 0 });
          if (g.model) skeleton = g.model;
        } catch { /* keep */ }
      }
    }
    const res = buildMeasuredRoof({
      dsm, mask, contour,
      transform: reg.applied ? reg.transform : { dxFt: 0, dyFt: 0, thetaDeg: 0 },
      skeleton,
    });
    const model = res.model ?? skeleton;
    const stitch = {
      applied: res.engine === "measured-dsm",
      engine: res.engine,
      measuredShare: res.measuredShare,
      boundary: res.boundary,
      ...(res.provenance ? { faces: res.provenance.faces } : {}),
      reasons: res.reasons,
    };

    const row = await db.roofMeasurement.create({
      data: {
        organizationId: orgId,
        source: "instant+recon",
        address: job.address,
        city: job.city,
        state: job.state,
        zip: job.zip,
        lat: instant.lat,
        lng: instant.lng,
        areaSqft: instant.totals.areaSqft,
        squares: instant.totals.squares,
        predominantPitch: instant.totals.pitchLabel,
        facetCount: model.totals.facetCount || instant.totals.facetCount,
        instantRequestId: instant.requestId,
        instantJson: JSON.stringify(instant),
        modelJson: JSON.stringify(model),
        chimneyJson: JSON.stringify([]),
        provenanceJson: JSON.stringify({
          provenance: { ...model.provenance, pitchSource: pitchNote },
          stitch,
          replayed: "stitch-persist из полевых кэшей — без лукапа",
        }),
      },
      select: { id: true },
    });
    console.log(`${job.key}: ${stitch.engine} · граней ${model.faces.length} · строка ${row.id}`);
  }
  await db.$disconnect();
})();
