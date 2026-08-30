/**
 * Freeze the three QA roofs so every later run is offline and free.
 *
 *   npx tsx scripts/qa/roof/dump-fixtures.ts [--force]
 *
 * Each Google-Solar reconstruction costs a geocode + dataLayers + two GeoTIFF
 * downloads + buildingInsights, so this runs ONCE per address and everything
 * downstream reads scripts/qa/roof/fixtures/<slug>/:
 *
 *   meta.json     origin, raster shape, parcel ring, pitchPriors12, Google area
 *   dsm.f32.gz    DSM heights, row-major float32, gzipped
 *   mask.f32.gz   building mask, same grid
 *   model.json    the model the CURRENT pipeline produces (validator input)
 *   validator.json the same model in the roof-geometry validator's schema
 *
 * A fixture that already exists is left alone unless --force is passed.
 */
import { loadHarnessEnv } from "./env";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";

loadHarnessEnv();

import type { RoofModel, RoofPoint } from "../../../src/lib/eagleview";
import { buildReconModel } from "../../../src/lib/roofReconBuild";
import type { Raster } from "../../../src/lib/solar";
import { buildIndexes, ringOf } from "../../../src/components/estimator/roof/roofGeometry";

const FIXTURES = resolve("scripts/qa/roof/fixtures");
const FORCE = process.argv.includes("--force");

interface Target {
  slug: string;
  address: { address: string; city: string; state: string; zip: string };
  /** Saved measurement whose SHIPPED model is the validator input (optional). */
  rowId?: string;
  note: string;
}

const TARGETS: Target[] = [
  {
    slug: "redmond-17028-ne-100th-st",
    address: { address: "17028 NE 100th St", city: "Redmond", state: "WA", zip: "98052" },
    note: "raw reconstruction only — no saved measurement",
  },
  {
    slug: "kirkland-12629-ne-100th-pl",
    address: { address: "12629 NE 100th Pl", city: "Kirkland", state: "WA", zip: "98033" },
    rowId: "cmt9bw6mv0005403bqwdngaau",
    note: "PRIMARY test case: double ridge, 1.7 / 5.4 sq ft facets",
  },
  {
    slug: "prairie-419-prairie-ridge-ln",
    address: { address: "419 Prairie Ridge Ln", city: "North Aurora", state: "IL", zip: "60542" },
    rowId: "cmt9bx0pp0007403bu14tyolh",
    note: "hips A8–A2 / A2–A9 at 22.2° and 67.8° instead of 45°",
  },
];

const rasterBytes = (r: Raster): Buffer =>
  Buffer.from(r.data.buffer, r.data.byteOffset, r.data.byteLength);

/** RoofModel → the validator's schema. The model carries no footprint polygon
 *  (see ROOF-DIAGNOSIS.md B.1), so the bounding box stands in for it; R05 is
 *  therefore measured against the bbox, exactly as in the diagnosis run. */
function toValidatorSchema(model: RoofModel): unknown {
  const idx = buildIndexes(model);
  const verts: number[][] = [];
  const seen = new Map<string, number>();
  const vid = (p: RoofPoint): number => {
    const k = `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
    if (!seen.has(k)) {
      seen.set(k, verts.length);
      verts.push([+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]);
    }
    return seen.get(k) as number;
  };
  const facets: Array<{ id: string; pitch: number; v: number[] }> = [];
  for (const f of model.faces) {
    const ring = ringOf(f.lineIds, idx);
    if (!ring || ring.length < 3) continue;
    facets.push({ id: String(f.designator || f.id), pitch: Number(f.pitch) || 0, v: ring.map(vid) });
  }
  const xs = verts.map((v) => v[0]);
  const ys = verts.map((v) => v[1]);
  const footprint = [
    [Math.min(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.max(...ys)],
    [Math.min(...xs), Math.max(...ys)],
  ];
  const ptById2 = new Map(model.points.map((pt) => [pt.id, pt]));
  const lines = model.lines
    .map((l) => {
      const a = ptById2.get(l.aId);
      const b = ptById2.get(l.bId);
      return a && b ? { a: [a.x, a.y], b: [b.x, b.y], type: l.type } : null;
    })
    .filter((x): x is { a: number[]; b: number[]; type: string } => x !== null);
  return { material: "asphalt", footprint, vertices: verts, facets, lines };
}

async function savedModel(rowId: string): Promise<RoofModel | null> {
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  const row = await db.roofMeasurement.findUnique({ where: { id: rowId } });
  await db.$disconnect();
  return row?.modelJson ? (JSON.parse(row.modelJson) as RoofModel) : null;
}

async function main() {
  mkdirSync(FIXTURES, { recursive: true });
  for (const t of TARGETS) {
    const dir = resolve(FIXTURES, t.slug);
    if (existsSync(resolve(dir, "meta.json")) && !FORCE) {
      console.log(`= ${t.slug}: already frozen (pass --force to refetch)`);
      continue;
    }
    console.log(`\n▶ ${t.slug} — fetching Google Solar (billed) …`);
    const recon = await buildReconModel(t.address);
    mkdirSync(dir, { recursive: true });

    writeFileSync(resolve(dir, "dsm.f32.gz"), gzipSync(rasterBytes(recon.dsm)));
    writeFileSync(resolve(dir, "mask.f32.gz"), gzipSync(rasterBytes(recon.mask)));

    const meta = {
      slug: t.slug,
      note: t.note,
      address: t.address,
      frozenAt: new Date().toISOString(),
      origin: recon.origin,
      raster: { width: recon.dsm.width, height: recon.dsm.height, pixelSizeM: recon.dsm.pixelSizeM },
      googleAreaSqft: recon.googleAreaSqft,
      multiStructure: recon.multiStructure,
      excludedSqft: recon.excludedSqft,
      diagnostics: recon.diagnostics,
      // pitchPriors12 is not returned by buildReconModel; it is derived from the
      // same Solar segments and re-derivable offline from diagnostics + model.
      pitchPriors12: [...new Set(recon.model.faces.map((f) => Math.round(Number(f.pitch))))].filter((p) => p >= 1 && p <= 24).sort((a, b) => a - b),
      layers: recon.layers,
    };
    writeFileSync(resolve(dir, "meta.json"), JSON.stringify(meta, null, 1));

    const model = t.rowId ? ((await savedModel(t.rowId)) ?? recon.model) : recon.model;
    writeFileSync(resolve(dir, "model.json"), JSON.stringify(model));
    writeFileSync(resolve(dir, "validator.json"), JSON.stringify(toValidatorSchema(model), null, 1));
    console.log(
      `  frozen: ${recon.dsm.width}×${recon.dsm.height} @ ${recon.dsm.pixelSizeM} m/px · ` +
        `google ${recon.googleAreaSqft?.toFixed(0) ?? "n/a"} sq ft · model ${model.faces.length} facets` +
        `${t.rowId ? ` (from saved row ${t.rowId})` : " (raw reconstruction)"}`,
    );
  }
  console.log(`\nfixtures → ${FIXTURES}`);
}

main().catch((e) => {
  console.error("DUMP FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
