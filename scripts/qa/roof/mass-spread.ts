/* Multi-mass detector, measurement only. Nothing here changes construction.
 *
 * Reads the reconstruction's OWN plane clusters — pitch and 3D area per cluster
 * — and asks whether more than one slope family holds real roof. The frozen
 * meta.json predates the cluster-area diagnostic, so the clusters are recomputed
 * from the same rasters and the pitch list is checked against the frozen one
 * before the areas are trusted.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import type { InstantRoofData } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { reconstructRoof } from "@/lib/roofRecon";
import { measureClusterSpread } from "@/lib/roofRecon/massSpread";
import { loadFixture, type FixtureMeta } from "./fixture";

interface Job { name: string; dir: string; fixture?: string }
const JOBS: Job[] = [
  { name: "12629 Kirkland", dir: "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl", fixture: "kirkland-12629-ne-100th-pl" },
  { name: "12621 Kirkland", dir: "scripts/qa/roof/field/12621-ne-100th-pl-kirkland-wa" },
  { name: "12618 Kirkland", dir: "scripts/qa/roof/field/12618-ne-100th-st-kirkland-wa" },
  { name: "9903 Kirkland", dir: "scripts/qa/roof/field/9903-117th-pl-ne-kirkland-wa" },
  { name: "419 Prairie IL", dir: "scripts/qa/roof/fixtures/prairie-419-prairie-ridge-ln", fixture: "prairie-419-prairie-ridge-ln" },
  { name: "12117 Snohomish", dir: "scripts/qa/roof/field/12117-202nd-st-se-snohomish-wa" },
];

function rasterFrom(file: string, meta: FixtureMeta): Raster {
  const buf = gunzipSync(readFileSync(file));
  const data = new Float32Array(meta.raster.width * meta.raster.height);
  Buffer.from(data.buffer).set(buf);
  return { width: meta.raster.width, height: meta.raster.height, pixelSizeM: meta.raster.pixelSizeM, data } as Raster;
}

(async () => {
  for (const job of JOBS) {
    const meta = JSON.parse(readFileSync(resolve(job.dir, "meta.json"), "utf8")) as FixtureMeta;
    const instant = JSON.parse(readFileSync(resolve(job.dir, "instant.json"), "utf8")) as InstantRoofData;
    let dsm: Raster, mask: Raster;
    if (job.fixture) { const fx = loadFixture(job.fixture); dsm = fx.dsm; mask = fx.mask; }
    else { dsm = rasterFrom(resolve(job.dir, "dsm.f32.gz"), meta); mask = rasterFrom(resolve(job.dir, "mask.f32.gz"), meta); }

    const r = reconstructRoof(dsm as never, mask as never);
    const pitches = (r.diagnostics.pitches12 ?? []) as number[];
    const areas = (r.diagnostics.clusterSqft ?? []) as number[];
    const frozen = ((meta.diagnostics.pitches12 as number[]) ?? []).map((p) => p.toFixed(1)).sort().join(",");
    const fresh = pitches.map((p) => p.toFixed(1)).sort().join(",");
    const same = frozen === fresh;

    const cl = measureClusterSpread(pitches, areas);
    const shape = instant.structures?.[0]?.shape ?? "—";
    console.log(`\n${job.name}   [Instant shape: ${shape}]${same ? "" : "   ⚠ cluster set differs from the frozen record"}`);
    if (!same) console.log(`  frozen  ${frozen}\n  fresh   ${fresh}`);
    console.log(`  ${cl.multiMass ? "MULTI-MASS" : "single mass"} — ${cl.reason}`);
    console.log(`  families: ${cl.families.map((f) => `${f.pitch12.toFixed(1)}/12 ×${f.facets.length} = ${Math.round(f.planSqft)} sf`).join(" | ")}`);
    // The other candidate quantity: where each cluster's ridge sits. Two masses
    // meeting at a valley or a wall differ in RIDGE HEIGHT even when a single
    // builder gave both the same pitch.
    const tops = (r.diagnostics.clusterTopFt ?? []) as number[];
    const rows = tops.map((t, i) => ({ t, a: areas[i] ?? 0, p: pitches[i] ?? 0 }))
      .filter((x) => x.a >= 100).sort((x, y) => y.t - x.t);
    console.log(`  ridge heights (clusters over 100 sf): ${rows.map((x) => `${x.t.toFixed(1)} ft @${x.p.toFixed(0)}/12 ${Math.round(x.a)}sf`).join(" | ")}`);
  }
})();
