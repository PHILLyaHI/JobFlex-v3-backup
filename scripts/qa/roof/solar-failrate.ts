/* Which Solar call fails, how often, and on which host.
 *
 * MEASUREMENT ONLY. The size/latency sweep (solar-latency.ts) showed 8 failures
 * in 18 combinations INCLUDING at radius 10 with a 92 KB raster, which rules
 * out payload size as the cause. This isolates the variable that is left: which
 * endpoint is refusing to answer.
 *
 * dataLayers is served by solar.googleapis.com; the raster URLs it returns
 * point at a different host entirely (solar.ts gotcha 2). If the failures are
 * all on one of the two, that is the finding.
 */
import { loadHarnessEnv } from "./env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

loadHarnessEnv();
const KEY = process.env.GOOGLE_MAPS_API_KEY!;
const BASE = "https://solar.googleapis.com/v1";
const CEILING_MS = 15_000;
const R = 40; // what production asks for today
const SITE = { name: "12629 Kirkland", lat: 47.6900298, lng: -122.1719688 };
const PASSES = 10;

const ms = () => Number(process.hrtime.bigint() / 1_000_000n);
const hostOf = (u: string) => { try { return new URL(u).host; } catch { return "?"; } };

interface Tally { ok: number; fail: number; times: number[]; host: string }
const tally: Record<string, Tally> = {
  dataLayers: { ok: 0, fail: 0, times: [], host: "" },
  dsm: { ok: 0, fail: 0, times: [], host: "" },
  mask: { ok: 0, fail: 0, times: [], host: "" },
};

async function timed(name: string, url: string): Promise<ArrayBuffer | null> {
  tally[name].host = hostOf(url);
  const t0 = ms();
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(CEILING_MS) });
    if (!res.ok) { tally[name].fail++; console.log(`  ${name.padEnd(10)} HTTP ${res.status} in ${ms() - t0} ms`); return null; }
    const buf = await res.arrayBuffer();
    const dt = ms() - t0;
    tally[name].ok++; tally[name].times.push(dt);
    console.log(`  ${name.padEnd(10)} ok   ${String(dt).padStart(6)} ms  ${(buf.byteLength / 1024).toFixed(0).padStart(5)} KB`);
    return buf;
  } catch (err) {
    tally[name].fail++;
    console.log(`  ${name.padEnd(10)} FAIL ${String(ms() - t0).padStart(6)} ms  ${(err as Error).name}`);
    return null;
  }
}

(async () => {
  console.log(`${PASSES} passes at radius ${R} m · ${SITE.name} · ceiling ${CEILING_MS / 1000}s`);
  console.log(`started ${new Date().toISOString()}\n`);
  for (let i = 1; i <= PASSES; i++) {
    console.log(`pass ${i}`);
    const dlUrl =
      `${BASE}/dataLayers:get?location.latitude=${SITE.lat}&location.longitude=${SITE.lng}` +
      `&radiusMeters=${R}&view=FULL_LAYERS&requiredQuality=HIGH&pixelSizeMeters=0.1&key=${KEY}`;
    const dl = await timed("dataLayers", dlUrl);
    if (!dl) continue;
    const body = JSON.parse(Buffer.from(dl).toString("utf8")) as { dsmUrl?: string; maskUrl?: string };
    if (!body.dsmUrl || !body.maskUrl) { console.log("  (no layer urls)"); continue; }
    const k = (u: string) => `${u}${u.includes("?") ? "&" : "?"}key=${KEY}`;
    await Promise.all([timed("dsm", k(body.dsmUrl)), timed("mask", k(body.maskUrl))]);
  }
  console.log(`\nfinished ${new Date().toISOString()}\n`);
  console.log("call        host                          ok  fail   rate     median ms   max ms");
  console.log("─".repeat(84));
  for (const [name, t] of Object.entries(tally)) {
    const n = t.ok + t.fail;
    const sorted = t.times.slice().sort((a, b) => a - b);
    const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    const max = sorted.length ? sorted[sorted.length - 1] : 0;
    console.log(
      `${name.padEnd(11)} ${t.host.slice(0, 28).padEnd(29)} ${String(t.ok).padStart(3)} ${String(t.fail).padStart(5)}  ` +
      `${n ? ((t.fail / n) * 100).toFixed(0).padStart(4) : "  —"}%  ${String(med).padStart(10)} ${String(max).padStart(8)}`,
    );
  }
})();
