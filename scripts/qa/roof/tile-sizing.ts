/* What the contour-sized tile actually asks for, and what it costs.
 *
 * Measurement. Radii come from frozen Instant outlines (free); the timings and
 * raster sizes come from live Solar calls at exactly those radii, so the table
 * is what production will now do.
 */
import { loadHarnessEnv } from "./env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fromArrayBuffer } from "geotiff";

loadHarnessEnv();
// Read lazily: `import` is hoisted above this file's .env loading, so a
// module-scope read of the key lands before the file that sets it.
const key = () => process.env.GOOGLE_MAPS_API_KEY ?? "";
const BASE = "https://solar.googleapis.com/v1";

import type { InstantRoofData } from "@/lib/eagleview";
import { tileRadiusM } from "@/lib/roofReconBuild";
import { latLngRingToFrame } from "@/lib/roofRecon";
import { SOLAR_DEFAULT_RADIUS_M, SOLAR_MAX_RADIUS_M } from "@/lib/solar";
import type { FixtureMeta } from "./fixture";

const FT_PER_M = 3.28084;
const JOBS = [
  { name: "12629 Kirkland", dir: "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl" },
  { name: "12621 Kirkland", dir: "scripts/qa/roof/field/12621-ne-100th-pl-kirkland-wa" },
  { name: "12618 Kirkland", dir: "scripts/qa/roof/field/12618-ne-100th-st-kirkland-wa" },
  { name: "9903 Kirkland", dir: "scripts/qa/roof/field/9903-117th-pl-ne-kirkland-wa" },
  { name: "419 Prairie IL", dir: "scripts/qa/roof/fixtures/prairie-419-prairie-ridge-ln" },
  { name: "12117 Snohomish", dir: "scripts/qa/roof/field/12117-202nd-st-se-snohomish-wa" },
];

const ms = () => Number(process.hrtime.bigint() / 1_000_000n);

async function tile(lat: number, lng: number, r: number) {
  const t0 = ms();
  const dl = await fetch(
    `${BASE}/dataLayers:get?location.latitude=${lat}&location.longitude=${lng}` +
      `&radiusMeters=${r}&view=FULL_LAYERS&requiredQuality=HIGH&pixelSizeMeters=0.1&key=${key()}`,
    { cache: "no-store", signal: AbortSignal.timeout(15_000) },
  );
  if (!dl.ok) {
    const body = await dl.text();
    const m = body.match(/"message"\s*:\s*"([^"]{0,140})"/);
    return { err: `dataLayers ${dl.status}: ${m ? m[1] : body.slice(0, 90)}` } as const;
  }
  const body = (await dl.json()) as { dsmUrl?: string };
  if (!body.dsmUrl) return { err: "no dsmUrl" } as const;
  const res = await fetch(`${body.dsmUrl}&key=${key()}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return { err: `raster ${res.status}` } as const;
  const buf = await res.arrayBuffer();
  const img = await (await fromArrayBuffer(buf)).getImage();
  return { ms: ms() - t0, kb: buf.byteLength / 1024, w: img.getWidth(), h: img.getHeight() } as const;
}

(async () => {
  console.log("address            structs  radius   px          DSM KB   ms     vs 40 m");
  console.log("─".repeat(84));
  for (const job of JOBS) {
    const meta = JSON.parse(readFileSync(resolve(job.dir, "meta.json"), "utf8")) as FixtureMeta;
    const instant = JSON.parse(readFileSync(resolve(job.dir, "instant.json"), "utf8")) as InstantRoofData;
    const contours = instant.structures.map((st) => st.outline ?? []).filter((r) => r.length >= 3);
    const r = tileRadiusM(meta.origin, contours) ?? SOLAR_DEFAULT_RADIUS_M;

    // How many structures actually fall inside the tile at this radius, and at 40.
    const inside = (rad: number) =>
      contours.filter((ring) =>
        latLngRingToFrame(meta.origin, ring).ring.every(
          (p) => Math.abs(p.x) / FT_PER_M <= rad && Math.abs(p.y) / FT_PER_M <= rad,
        ),
      ).length;

    // Two attempts, matching the shipping retry policy — the raster endpoint
    // fails about a third of the time on a fresh tuple (see ROOF-STATE), and a
    // table that reports those as "no data" would be measuring the wrong thing.
    let t = await tile(meta.origin.lat, meta.origin.lng, r).catch(() => ({ err: "timeout" }) as const);
    if ("err" in t) t = await tile(meta.origin.lat, meta.origin.lng, r).catch(() => ({ err: "timeout (twice)" }) as const);
    const capped = r >= SOLAR_MAX_RADIUS_M ? " (AT GOOGLE'S CEILING)" : "";
    const px = "err" in t ? "—" : `${t.w}x${t.h}`;
    const kb = "err" in t ? t.err : t.kb.toFixed(0);
    const time = "err" in t ? "—" : String(t.ms);
    console.log(
      `${job.name.padEnd(18)} ${String(contours.length).padStart(4)}  ${String(r).padStart(5)} m ${px.padStart(11)} ${String(kb).padStart(9)} ${time.padStart(6)}   ` +
      `${((r / SOLAR_DEFAULT_RADIUS_M) ** 2 * 100).toFixed(0)}% px${capped}`,
    );
    console.log(`${" ".repeat(18)} structures fully inside the tile: ${inside(r)}/${contours.length} at ${r} m · ${inside(SOLAR_DEFAULT_RADIUS_M)}/${contours.length} at the old fixed 40 m`);
  }
})();
