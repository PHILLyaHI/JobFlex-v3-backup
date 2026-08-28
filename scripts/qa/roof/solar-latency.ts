/* What drives fetchRaster's response time.
 *
 * MEASUREMENT ONLY — nothing here is wired into the product. Google Solar is
 * free on this account; each pass is a handful of requests.
 *
 * Three 15 s raster timeouts were observed in three consecutive live runs on
 * 2026-08-28, which is a state of the service rather than one unlucky request.
 * The retry hides it. This asks what the time actually depends on: the tile
 * radius, the pixel count, the layer quality — and separates TRANSFER from
 * DECODE, because a slow decode is our problem and a slow transfer is Google's.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fromArrayBuffer } from "geotiff";

for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), file), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      // An EMPTY value counts as unset. `.env` in this repo ships
      // GOOGLE_MAPS_API_KEY="" and Prisma loads `.env` at import time, so a
      // `=== undefined` guard would keep that empty string and every Solar call
      // would come back 403 "unregistered callers".
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch { /* optional */ }
}

const KEY = process.env.GOOGLE_MAPS_API_KEY;
if (!KEY) { console.error("GOOGLE_MAPS_API_KEY missing"); process.exit(1); }
const BASE = "https://solar.googleapis.com/v1";
const CEILING_MS = 15_000; // the per-attempt ceiling in solar.ts

const SITES = [
  { name: "12629 Kirkland", lat: 47.6900298, lng: -122.1719688 },
  { name: "419 Prairie IL", lat: 41.8141163, lng: -88.3364441 },
  { name: "12117 Snohomish", lat: 47.8146934, lng: -122.0673436 },
];
const RADII = [10, 20, 30, 40, 60, 80];
/** Seconds of quiet between combinations. 0 = the first pass's pacing. */
const GAP_MS = Number(process.env.SOLAR_GAP_MS ?? 0);
const idle = (n: number) => new Promise<void>((r) => setTimeout(r, n));

const ms = () => Number(process.hrtime.bigint() / 1_000_000n);

async function dataLayers(lat: number, lng: number, r: number, quality: string) {
  const url =
    `${BASE}/dataLayers:get?location.latitude=${lat}&location.longitude=${lng}` +
    `&radiusMeters=${r}&view=FULL_LAYERS&requiredQuality=${quality}&pixelSizeMeters=0.1&key=${KEY}`;
  const t0 = ms();
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(CEILING_MS) });
  const body = res.ok ? ((await res.json()) as Record<string, unknown>) : null;
  return { ms: ms() - t0, status: res.status, quality: String(body?.imageryQuality ?? "—"),
           dsmUrl: (body?.dsmUrl as string) ?? null, maskUrl: (body?.maskUrl as string) ?? null };
}

/** Transfer and decode timed apart. */
async function raster(url: string) {
  const sep = url.includes("?") ? "&" : "?";
  const t0 = ms();
  const res = await fetch(`${url}${sep}key=${KEY}`, { cache: "no-store", signal: AbortSignal.timeout(CEILING_MS) });
  if (!res.ok) return { err: `HTTP ${res.status}` } as const;
  const buf = await res.arrayBuffer();
  const t1 = ms();
  const img = await (await fromArrayBuffer(buf)).getImage();
  const t2 = ms();
  return { transferMs: t1 - t0, decodeMs: t2 - t1, bytes: buf.byteLength, w: img.getWidth(), h: img.getHeight() } as const;
}

const pad = (v: string | number, n: number) => String(v).padStart(n);

(async () => {
  console.log(`started ${new Date().toISOString()} · per-attempt ceiling ${CEILING_MS / 1000}s\n`);
  console.log("site              r(m)  qual   layers  dsm px      dsm KB  xfer   dec   mask KB  xfer   TOTAL");
  console.log("─".repeat(100));
  for (const s of SITES) {
    for (const r of RADII) {
      if (GAP_MS) await idle(GAP_MS);
      try {
        const dl = await dataLayers(s.lat, s.lng, r, "HIGH");
        if (!dl.dsmUrl || !dl.maskUrl) {
          console.log(`${s.name.padEnd(17)} ${pad(r, 4)}  ${dl.quality.padEnd(6)} ${pad(dl.ms, 6)}  (no layer urls, status ${dl.status})`);
          continue;
        }
        const [d, m] = await Promise.all([raster(dl.dsmUrl), raster(dl.maskUrl)]);
        if ("err" in d || "err" in m) {
          console.log(`${s.name.padEnd(17)} ${pad(r, 4)}  ${dl.quality.padEnd(6)} ${pad(dl.ms, 6)}  raster failed: ${"err" in d ? d.err : (m as {err:string}).err}`);
          continue;
        }
        const total = dl.ms + Math.max(d.transferMs + d.decodeMs, m.transferMs + m.decodeMs);
        console.log(
          `${s.name.padEnd(17)} ${pad(r, 4)}  ${dl.quality.padEnd(6)} ${pad(dl.ms, 6)}  ${pad(`${d.w}x${d.h}`, 10)} ` +
          `${pad((d.bytes / 1024).toFixed(0), 7)} ${pad(d.transferMs, 5)} ${pad(d.decodeMs, 5)} ` +
          `${pad((m.bytes / 1024).toFixed(0), 8)} ${pad(m.transferMs, 5)} ${pad(total, 7)}`,
        );
      } catch (err) {
        const e = err as Error;
        console.log(`${s.name.padEnd(17)} ${pad(r, 4)}  ${"—".padEnd(6)} ${"TIMEOUT/ERR".padStart(6)}  ${e.name}: ${e.message.slice(0, 50)}`);
      }
    }
    console.log();
  }
  console.log(`finished ${new Date().toISOString()}`);
})();
