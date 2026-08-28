/**
 * Seed a RoofMeasurement row per fixture, built by the V2 path, so the real
 * page can be looked at without paying for an Instant lookup again.
 *
 *   npx tsx scripts/qa/roof/seed-v2.ts
 *
 * No EagleView request is made and none can be: the Instant responses come from
 * the frozen fixtures, which were paid for once and stored. The pipeline is the
 * shipping one — buildRoofV2, registerContourToRaster, measurePitchFromDsm —
 * so what lands in the row is what the action would have written.
 *
 * Rows are tagged in the address so they are easy to tell apart and delete.
 */
import { loadHarnessEnv } from "./env";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

loadHarnessEnv();
const req = createRequire(resolve(process.cwd(), "package.json"));

import type { InstantRoofData, RoofModel } from "../../../src/lib/eagleview";
import { buildIndexes, ringOf } from "../../../src/components/estimator/roof/roofGeometry";
import { buildRoofV2, buildRoofV2FromRecon, measureCoverage } from "../../../src/lib/roofRecon/reconV2";
import { registerContourToRaster } from "../../../src/lib/roofRecon/register";
import { measurePitchFromDsm, structurePitch } from "../../../src/lib/roofRecon/pitchFromDsm";
import { areaOf, type FootprintPoint } from "../../../src/lib/roofRecon/footprint";
import { parseWkt } from "../../../src/lib/parcels";
import { fixtureSlugs, loadFixture } from "./fixture";

const FT_PER_M = 3.28084;
const EARTH_R_M = 6378137;
const D2R = Math.PI / 180;
const TAG = "[V2]";

async function main() {
  const { PrismaClient } = req("@prisma/client") as { PrismaClient: new () => never };
  const db = new (PrismaClient as never)() as {
    roofMeasurement: {
      findFirst: (a: unknown) => Promise<{ organizationId: string; createdById: string | null } | null>;
      deleteMany: (a: unknown) => Promise<{ count: number }>;
      create: (a: unknown) => Promise<{ id: string }>;
    };
    parcelCache: { findMany: () => Promise<Array<{ wkt: string; addressKey: string | null }>> };
    $disconnect: () => Promise<void>;
  };

  const any = await db.roofMeasurement.findFirst({ orderBy: { createdAt: "desc" } });
  if (!any) {
    console.error("no existing measurement to borrow an organization from");
    process.exit(1);
  }
  const removed = await db.roofMeasurement.deleteMany({ where: { address: { startsWith: TAG } } });
  if (removed.count) console.log(`removed ${removed.count} previous ${TAG} row(s)`);
  const parcels = await db.parcelCache.findMany();

  for (const slug of fixtureSlugs()) {
    const fx = loadFixture(slug);
    const ground = fx.meta.diagnostics.groundElevFt as number;
    const clusters = (fx.meta.diagnostics.clusters as number) ?? null;
    const instFile = resolve("scripts/qa/roof/fixtures", slug, "instant.json");
    const instant: InstantRoofData | null = existsSync(instFile)
      ? (JSON.parse(readFileSync(instFile, "utf8")) as InstantRoofData)
      : null;

    let model: RoofModel | null = null;
    let contour: FootprintPoint[] | null = null;
    let pitchNote = "";
    let regNote = "";
    let source = "instant+recon";
    let partial: { reason: string; measuredStructures: number } | undefined;
    let pitchSource: Record<string, unknown> | undefined;
    let registration: Record<string, unknown> | undefined;

    if (instant) {
      const first = buildRoofV2({ instant, origin: fx.meta.origin, clusters });
      contour = first.report.structures.find((s) => s.ring)?.ring ?? null;
      if (!first.model || !contour) continue;
      const reg = registerContourToRaster({ contour, mask: fx.mask, dsm: fx.dsm, groundElevFt: ground });
      registration = reg.applied
        ? { applied: true, transform: reg.transform, iouBefore: reg.iouBefore, iouAfter: reg.iouAfter }
        : { applied: false, reason: reg.reason, iouBefore: reg.iouBefore, iouAfter: reg.iouAfter };
      regNote = reg.applied ? `IoU ${(reg.iouBefore * 100).toFixed(0)}→${(reg.iouAfter * 100).toFixed(0)}%` : "REFUSED";
      const instantPitch = instant.totals?.predominantPitch ?? null;
      if (reg.applied) {
        const meas = measurePitchFromDsm({ model: first.model, mask: fx.mask, dsm: fx.dsm, transform: reg.transform, sectionTolerance12: 0.75 });
        const solar = instant.structures.some((st) => st.solarPanels === true);
        const sp = structurePitch(meas, instantPitch, { solarPanels: solar });
        pitchSource = { source: sp.source, pitch12: sp.pitch12, trustedShare: sp.trustedShare, reason: sp.reason, ...(solar ? { solarPanels: true } : {}) };
        pitchNote = `${sp.pitch12.toFixed(2)}/12 ${sp.source}`;
        model = buildRoofV2({ instant, origin: fx.meta.origin, clusters, pitchOverride12: sp.pitch12 }).model ?? first.model;
      } else {
        pitchSource = { source: "instant", pitch12: instantPitch ?? 0, trustedShare: 0, reason: "registration refused" };
        model = first.model;
        pitchNote = `${instantPitch}/12 instant`;
      }
    } else {
      // No Instant — the fallback: mask + height gate + the parcel ring.
      source = "recon";
      const o = fx.meta.origin;
      let parcel: FootprintPoint[] | null = null;
      for (const row of parcels) {
        const rings = parseWkt(row.wkt);
        if (!rings.length) continue;
        const ft = rings[0].map(([lat, lng]) => ({
          x: (lng - o.lng) * D2R * EARTH_R_M * Math.cos(o.lat * D2R) * FT_PER_M,
          y: (lat - o.lat) * D2R * EARTH_R_M * FT_PER_M,
        }));
        // the ring that contains the pin
        let hit = false;
        for (let i = 0, j = ft.length - 1; i < ft.length; j = i++) {
          if (ft[i].y > 0 !== ft[j].y > 0 && 0 < ((ft[j].x - ft[i].x) * (0 - ft[i].y)) / (ft[j].y - ft[i].y) + ft[i].x) hit = !hit;
        }
        if (hit) { parcel = ft; break; }
      }
      const built = buildRoofV2FromRecon({ mask: fx.mask, dsm: fx.dsm, groundElevFt: ground, parcel, pitch12: fx.model.totals.predominantPitch ?? 6 });
      if (!built.model) continue;
      model = built.model;
      contour = built.report.structures.find((s) => s.ring)?.ring ?? null;
      pitchNote = `${built.report.pitch12}/12 recon`;
      if (!parcel) partial = { reason: "No parcel boundary was available, so only the building under the pin was measured.", measuredStructures: built.report.structures.filter((s) => s.ring).length };
    }
    if (!model) continue;

    const idx = buildIndexes(model);
    const rings = model.faces
      .map((f) => ringOf(f.lineIds, idx))
      .filter((r): r is NonNullable<typeof r> => !!r && r.length >= 3)
      .map((r) => r.map((p) => ({ x: p.x, y: p.y })));
    const coverage = measureCoverage({ mask: fx.mask, dsm: fx.dsm, groundElevFt: ground, rings });

    const row = await db.roofMeasurement.create({
      data: {
        organizationId: any.organizationId,
        createdById: any.createdById,
        source,
        address: `${TAG} ${fx.meta.address.address}`,
        city: fx.meta.address.city,
        state: fx.meta.address.state,
        zip: fx.meta.address.zip,
        lat: fx.meta.origin.lat,
        lng: fx.meta.origin.lng,
        areaSqft: model.totals.areaSqft,
        squares: model.totals.squares,
        predominantPitch: pitchSource ? `${Math.round(Number(pitchSource.pitch12))}/12` : pitchNote.split(" ")[0],
        facetCount: model.totals.facetCount,
        instantRequestId: instant?.requestId ?? null,
        instantJson: instant ? JSON.stringify(instant) : null,
        modelJson: JSON.stringify(model),
        chimneyJson: JSON.stringify([]),
        provenanceJson: JSON.stringify({
          calibration: null,
          provenance: {
            ...(coverage ? { coverage } : {}),
            ...(registration ? { registration } : {}),
            ...(pitchSource ? { pitchSource } : {}),
            ...(partial ? { partialCoverage: partial } : {}),
            googleAreaSqft: fx.meta.googleAreaSqft,
          },
        }),
      },
    });
    console.log(
      `${slug.padEnd(30)} → ${row.id.slice(-6)} · ${model.faces.length} facets · ${model.totals.areaSqft.toFixed(0)} sq ft · ` +
        `contour ${contour ? areaOf(contour).toFixed(0) : "?"} · pitch ${pitchNote} · ${regNote} · ` +
        `coverage ${coverage ? (coverage.share * 100).toFixed(0) + "%" : "n/a"}`,
    );
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error("SEED FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
