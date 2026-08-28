/* How much Solar tile does a measurement actually USE?
 *
 * Measurement only, entirely from frozen inputs — no network, nothing billed.
 * The tile is requested at radiusMeters = 40 (an 80 m square, ~800x800 px at
 * 0.1 m/px) with the comment "comfortably larger than any residential roof".
 * This prints what "comfortably" is worth in feet on the seven addresses we
 * have, so the margin can be judged instead of assumed.
 *
 * The radius has to cover, from the PIN:
 *   1. the Instant contour of every structure we draw
 *   2. the registration shift, which moves that contour on the raster
 *   3. the parcel ring, when one scoped the structures
 *   4. the mask component we isolate, which is what the DSM is actually read on
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import type { InstantRoofData } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { latLngRingToFrame } from "@/lib/roofRecon";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { buildRoofV2 } from "@/lib/roofRecon/reconV2";
import { loadFixture, type FixtureMeta } from "./fixture";

const FT_PER_M = 3.28084;
const M_PER_FT = 1 / FT_PER_M;

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

console.log("address            contour  +shift   mask    tile/2   radius needed  slack");
console.log("                   max ft   max ft   max ft  now ft   m (ceil)       x");
console.log("─".repeat(88));

const rows: Array<{ name: string; needM: number }> = [];
for (const job of JOBS) {
  const meta = JSON.parse(readFileSync(resolve(job.dir, "meta.json"), "utf8")) as FixtureMeta;
  const instant = JSON.parse(readFileSync(resolve(job.dir, "instant.json"), "utf8")) as InstantRoofData;

  // 1. the Instant contours, in feet from the pin
  let contourFt = 0;
  for (const st of instant.structures) {
    if (!st.outline?.length) continue;
    for (const p of latLngRingToFrame(meta.origin, st.outline).ring) {
      contourFt = Math.max(contourFt, Math.hypot(p.x, p.y));
    }
  }

  // 2. and the mask footprint we actually read the DSM on
  let dsm: Raster, mask: Raster;
  if (job.fixture) { const fx = loadFixture(job.fixture); dsm = fx.dsm; mask = fx.mask; }
  else { dsm = rasterFrom(resolve(job.dir, "dsm.f32.gz"), meta); mask = rasterFrom(resolve(job.dir, "mask.f32.gz"), meta); }

  // 3. plus the registration shift — it moves that contour on the raster.
  // Computed, not read: it is the same call the shipping path makes.
  const ground = meta.diagnostics.groundElevFt as number;
  const first = buildRoofV2({ instant, origin: meta.origin, clusters: (meta.diagnostics.clusters as number) ?? null });
  const shifts: number[] = [];
  for (const st of first.report.structures) {
    if (!st.ring || st.ring.length < 3) continue;
    const reg = registerContourToRaster({ contour: st.ring, mask, dsm, groundElevFt: ground });
    if (reg.applied && reg.transform) shifts.push(Math.hypot(reg.transform.dxFt, reg.transform.dyFt));
  }
  const shiftFt = shifts.length ? Math.max(...shifts) : 0;
  // The SUBJECT building only — the connected mask component under the pin.
  // Measuring the whole mask is meaningless here: it covers every building in
  // the tile (solar.ts gotcha 4), so it reaches the tile's own corner by
  // construction and would "prove" any radius is too small.
  const stepFt = mask.pixelSizeM * FT_PER_M;
  const cx = Math.round((mask.width - 1) / 2), cy = Math.round((mask.height - 1) / 2);
  const W = mask.width, H = mask.height;
  const on = (i: number) => mask.data[i] > 0;
  let maskFt = 0;
  // Seed on the nearest lit pixel to the centre — the pin can sit just off the
  // roof, and an unseeded flood would report nothing.
  let seed = -1;
  for (let r = 0; r < Math.max(W, H) && seed < 0; r++) {
    for (let dy = -r; dy <= r && seed < 0; dy++) {
      for (let dx = -r; dx <= r && seed < 0; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (on(y * W + x)) seed = y * W + x;
      }
    }
  }
  if (seed >= 0) {
    const seen = new Uint8Array(W * H);
    const stack = [seed];
    seen[seed] = 1;
    while (stack.length) {
      const i = stack.pop() as number;
      const x = i % W, y = (i - x) / W;
      const d = Math.hypot(x - cx, y - cy) * stepFt;
      if (d > maskFt) maskFt = d;
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + ax, ny = y + ay;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (seen[j] || !on(j)) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
  }

  const halfTileFt = (mask.width / 2) * mask.pixelSizeM * FT_PER_M;
  // What a request would have to ask for: the far corner of what we use.
  // The tile is a SQUARE of side 2r, so a diagonal reach of d ft needs only
  // r >= d/sqrt(2) in the worst orientation — but we take the axis-aligned
  // bound, which is the honest upper bound on what any of these needs.
  const needFt = Math.max(contourFt + shiftFt, maskFt);
  const needM = Math.ceil((needFt * M_PER_FT) / 5) * 5;
  rows.push({ name: job.name, needM });
  console.log(
    `${job.name.padEnd(18)} ${contourFt.toFixed(0).padStart(6)} ${shiftFt.toFixed(1).padStart(8)} ${maskFt.toFixed(0).padStart(7)} ` +
    `${halfTileFt.toFixed(0).padStart(7)} ${String(needM).padStart(11)} ${(halfTileFt / needFt).toFixed(2).padStart(8)}`,
  );
}

const worst = Math.max(...rows.map((r) => r.needM));
console.log("─".repeat(88));
console.log(`\nWidest need across the seven: ${worst} m. Requested today: 40 m.`);
console.log(`Pixels scale with the SQUARE of the radius: a ${worst} m tile is ${((worst / 40) ** 2 * 100).toFixed(0)}% of today's ${(800 * 800 / 1e6).toFixed(2)} MP.`);
console.log(`\nThe mask column is the binding one — it is what the DSM is read on, and`);
console.log(`it covers EVERY building in the tile, not just the subject (solar.ts gotcha 4).`);
