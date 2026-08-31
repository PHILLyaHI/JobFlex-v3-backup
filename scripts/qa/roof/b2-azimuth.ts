/* БЛОК 2, КАНДИДАТ 2 — сегментация по полю азимута градиента DSM.
 * Только измерение. Граница грани — смена АЗИМУТА стока при непрерывной
 * высоте (~180° на коньке, ~90° на вальме/ендове).
 *
 *   npx tsx scripts/qa/roof/b2-azimuth.ts [ключ]
 *
 * a. Поле: градиент по окну шумового пола (half=2 — то же окно нормалей),
 *    азимут atan2, магнитуда = уклон; ниже порога уклона (LEVEL 0.5/12) —
 *    вне поля.
 * b. Гистограмма |Δазимут| соседей: бимодальна? Порог — из провала;
 *    если провала нет — так и печатается.
 * c. Регионы связности (разрыв там, где |Δаз| > порога) → МНК-плоскость
 *    в каждом → таблица против наших кластеров.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { loadHarnessEnv } from "./env";
loadHarnessEnv();
import { reconstructRoof } from "@/lib/roofRecon";
import type { Raster } from "@/lib/solar";
import { loadFixture, type FixtureMeta } from "./fixture";

const FT = 3.28084;
const JOBS = [
  { key: "12629", dir: "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl", fixture: "kirkland-12629-ne-100th-pl" },
  { key: "12621", dir: "scripts/qa/roof/field/12621-ne-100th-pl-kirkland-wa", fixture: undefined },
  { key: "12618", dir: "scripts/qa/roof/field/12618-ne-100th-st-kirkland-wa", fixture: undefined },
  { key: "9903", dir: "scripts/qa/roof/field/9903-117th-pl-ne-kirkland-wa", fixture: undefined },
  { key: "419", dir: "scripts/qa/roof/fixtures/prairie-419-prairie-ridge-ln", fixture: "prairie-419-prairie-ridge-ln" },
  { key: "12117", dir: "scripts/qa/roof/field/12117-202nd-st-se-snohomish-wa", fixture: undefined },
];
const ONLY = process.argv[2];
const LEVEL = 0.5 / 12;

for (const job of JOBS) {
  if (ONLY && job.key !== ONLY) continue;
  const meta = JSON.parse(readFileSync(resolve(job.dir, "meta.json"), "utf8")) as FixtureMeta;
  let dsm: Raster, mask: Raster;
  if (job.fixture) { const fx = loadFixture(job.fixture); dsm = fx.dsm; mask = fx.mask; }
  else {
    const r = (f: string): Raster => {
      const buf = gunzipSync(readFileSync(resolve(job.dir, f)));
      const data = new Float32Array(meta.raster.width * meta.raster.height);
      Buffer.from(data.buffer).set(buf);
      return { width: meta.raster.width, height: meta.raster.height, pixelSizeM: meta.raster.pixelSizeM, data } as Raster;
    };
    dsm = r("dsm.f32.gz"); mask = r("mask.f32.gz");
  }
  const w = dsm.width, h = dsm.height, stepFt = dsm.pixelSizeM * FT;
  const recon = reconstructRoof(dsm as never, mask as never);
  const d = recon.diagnostics as unknown as { assign: Int32Array; clusterPlanes: Array<{ a: number; b: number; c: number }>; buildingPx: number; groundElevFt: number };
  // building-маска из assign>=0 ∪ (mask>0.5 возле них) — берём честно: пиксели, где кто-то был назначен, плюс их окно
  const inB = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (d.assign[i] >= 0) inB[i] = 1;
  // a. градиент по окну half=2 (МНК-плоскость 5×5 — то же окно нормалей)
  const half = 2;
  const az = new Float32Array(w * h).fill(NaN);
  const mag = new Float32Array(w * h).fill(0);
  const zf = (i: number) => dsm.data[i] * FT;
  for (let py = half; py < h - half; py++) for (let px = half; px < w - half; px++) {
    const i = py * w + px;
    if (!inB[i]) continue;
    let sx = 0, sy = 0, sz = 0, sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0, n = 0;
    for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++) {
      const j = (py + dy) * w + (px + dx);
      if (!inB[j]) continue;
      const x = dx * stepFt, y = -dy * stepFt, z = zf(j);
      sx += x; sy += y; sz += z; sxx += x * x; sxy += x * y; syy += y * y; sxz += x * z; syz += y * z; n++;
    }
    if (n < 6) continue;
    const det = (sxx * (syy * n - sy * sy)) - (sxy * (sxy * n - sy * sx)) + (sx * (sxy * sy - syy * sx));
    if (Math.abs(det) < 1e-9) continue;
    const a = ((sxz * (syy * n - sy * sy)) - (sxy * (syz * n - sy * sz)) + (sx * (syz * sy - syy * sz))) / det;
    const b = ((sxx * (syz * n - sy * sz)) - (sxz * (sxy * n - sx * sy)) + (sx * (sxy * sz - syz * sx))) / det;
    const m2 = Math.hypot(a, b);
    if (m2 < LEVEL) continue; // ровное — вне поля
    az[i] = Math.atan2(b, a);
    mag[i] = m2;
  }
  // b. гистограмма |Δазимут| между соседями в поле
  const hist = new Array<number>(36).fill(0);
  for (let py = 0; py < h - 1; py++) for (let px = 0; px < w - 1; px++) {
    const i = py * w + px;
    if (Number.isNaN(az[i])) continue;
    for (const j of [i + 1, i + w]) {
      if (Number.isNaN(az[j])) continue;
      let dAz = Math.abs(az[i] - az[j]) * 180 / Math.PI;
      if (dAz > 180) dAz = 360 - dAz;
      hist[Math.min(35, Math.floor(dAz / 5))]++;
    }
  }
  const tot = hist.reduce((s, x) => s + x, 0);
  // провал: первый бин после главного пика, где счёт < 0.2% и дальше есть масса
  let dip = -1;
  for (let b2 = 1; b2 < 30; b2++) {
    const later = hist.slice(b2).reduce((s, x) => s + x, 0);
    if (hist[b2] / tot < 0.002 && later / tot > 0.005) { dip = b2 * 5; break; }
  }
  console.log(`\n===== ${job.key}: поле ${((1 - hist[0] / tot) * 100).toFixed(0)}%-негладкое · гистограмма Δаз (5°-бины, % основных): ${hist.slice(0, 12).map((x) => (x / tot * 100).toFixed(1)).join(" ")}`);
  console.log(`  провал: ${dip >= 0 ? `есть, порог ${dip}°` : "НЕТ — так и говорю"}`);
  const thr = (dip >= 0 ? dip : 25) * Math.PI / 180;
  // c. регионы связности
  const lab = new Int32Array(w * h).fill(-1);
  let nl = 0;
  const minPx = Math.ceil(12 / (stepFt * stepFt)); // пол минимальной грани
  const regions: Array<{ n: number; sx: number; sy: number; az: number; pitch: number }> = [];
  for (let s0 = 0; s0 < w * h; s0++) {
    if (Number.isNaN(az[s0]) || lab[s0] >= 0) continue;
    const stack = [s0];
    lab[s0] = nl;
    const px2: number[] = [];
    while (stack.length) {
      const i = stack.pop()!;
      px2.push(i);
      const py = Math.floor(i / w), px = i % w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (Number.isNaN(az[j]) || lab[j] >= 0) continue;
        let dAz = Math.abs(az[i] - az[j]);
        if (dAz > Math.PI) dAz = 2 * Math.PI - dAz;
        if (dAz > thr) continue;
        lab[j] = nl;
        stack.push(j);
      }
    }
    if (px2.length >= minPx) {
      let sa = 0, sb = 0, sx2 = 0, sy2 = 0, sm = 0;
      for (const i of px2) { sa += Math.cos(az[i]); sb += Math.sin(az[i]); sx2 += i % w; sy2 += Math.floor(i / w); sm += mag[i]; }
      regions.push({ n: px2.length, sx: (sx2 / px2.length + 0.5 - w / 2) * stepFt, sy: (h / 2 - sy2 / px2.length - 0.5) * stepFt, az: Math.atan2(sb, sa), pitch: (sm / px2.length) * 12 });
    }
    nl++;
  }
  regions.sort((a, b) => b.n - a.n);
  console.log(`  регионов азимута (≥ пол грани): ${regions.length} · [наших кластеров: ${d.clusterPlanes.length}]`);
  for (const r of regions.slice(0, 12)) {
    const compass = ((Math.atan2(-Math.cos(r.az), -Math.sin(r.az)) * 180 / Math.PI) + 360) % 360;
    console.log(`    ${(r.n * stepFt * stepFt).toFixed(0)} sf · центр (${r.sx.toFixed(0)},${r.sy.toFixed(0)}) · компас ${compass.toFixed(0)}° · уклон ${r.pitch.toFixed(1)}/12`);
  }
}
