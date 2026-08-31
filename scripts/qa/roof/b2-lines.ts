/* БЛОК 2 — ПО-ГРАНИЧНЫЙ ЗАМЕР: куда ставит каждую границу текущей модели
 * каждый из источников. Только измерение.
 *
 *   npx tsx scripts/qa/roof/b2-lines.ts [ключ]
 *
 * Для каждой 2-гранной границы модели (≥ 4 ft):
 *   тек.     — где стоит сейчас (позиция линии);
 *   анал.    — смещение до аналитического пересечения ПЛОСКОСТЕЙ пары
 *              (кластеры владельцев по большинству пикселей кольца);
 *   азимут   — смещение до максимума |Δазимут| DSM-поля по перпендикуляру;
 *   текстура — смещение до максимума смены ориентации гонта (структурный
 *              тензор, окно ~3 ряда гонта; некогерентное — вне поля).
 * Колонка владельца: границы вне пересечения (|анал.| > коридор) — кто из
 * источников ставит их НА пересечение (|Δ до анал.| ≤ 1 ft).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { decode } from "fast-png";
import { loadHarnessEnv } from "./env";
loadHarnessEnv();
import type { InstantRoofData } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { buildMeasuredRoof } from "@/lib/roofRecon/measuredRoof";
import { reconstructRoof } from "@/lib/roofRecon";
import { productionSkeleton } from "./prodflow";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";
import { loadFixture, type FixtureMeta } from "./fixture";
import { Overlay } from "./overlay";

const FT = 3.28084;
const JOBS = [
  { key: "12629", dir: "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl", fixture: "kirkland-12629-ne-100th-pl" },
  { key: "12621", dir: "scripts/qa/roof/field/12621-ne-100th-pl-kirkland-wa", fixture: undefined },
  { key: "12618", dir: "scripts/qa/roof/field/12618-ne-100th-st-kirkland-wa", fixture: undefined },
  { key: "9903", dir: "scripts/qa/roof/field/9903-117th-pl-ne-kirkland-wa", fixture: undefined },
  { key: "419", dir: "scripts/qa/roof/fixtures/prairie-419-prairie-ridge-ln", fixture: "prairie-419-prairie-ridge-ln" },
];
const ONLY = process.argv[2];

for (const job of JOBS) {
  if (ONLY && job.key !== ONLY) continue;
  const meta = JSON.parse(readFileSync(resolve(job.dir, "meta.json"), "utf8")) as FixtureMeta;
  const instant = JSON.parse(readFileSync(resolve(job.dir, "instant.json"), "utf8")) as InstantRoofData;
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
  const prod = productionSkeleton({ instant, origin: meta.origin, clusters: (meta.diagnostics.clusters as number) ?? null, dsm, mask, groundElevFt: meta.diagnostics.groundElevFt as number })!;
  const res = buildMeasuredRoof({ dsm, mask, contour: prod.contour, transform: prod.transform, skeleton: prod.skeleton });
  const model = (res.rejectedCandidate ?? res.model)!; // судим кандидата сшивки, как grammar-run
  const T = prod.transform;
  const th = (T.thetaDeg * Math.PI) / 180;
  const fwd = (p: { x: number; y: number }) => ({ x: p.x * Math.cos(th) - p.y * Math.sin(th) + T.dxFt, y: p.x * Math.sin(th) + p.y * Math.cos(th) + T.dyFt });
  const w = dsm.width, h = dsm.height, stepFt = dsm.pixelSizeM * FT, cx = w / 2, cy = h / 2;
  const pxOf = (pr: { x: number; y: number }) => {
    const px = Math.round(pr.x / stepFt + cx - 0.5);
    const py = Math.round(cy - 0.5 - pr.y / stepFt);
    return px < 0 || py < 0 || px >= w || py >= h ? -1 : py * w + px;
  };
  const recon = reconstructRoof(dsm as never, mask as never);
  const d = recon.diagnostics as unknown as { assign: Int32Array; clusterPlanes: Array<{ a: number; b: number; c: number }>; groundElevFt: number };
  // азимут-поле (окно half=2)
  const azF = new Float32Array(w * h).fill(NaN);
  {
    const half = 2;
    for (let py = half; py < h - half; py++) for (let px = half; px < w - half; px++) {
      const i = py * w + px;
      if (d.assign[i] < 0) continue;
      let sx = 0, sy = 0, sz = 0, sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0, n = 0;
      for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++) {
        const j = (py + dy) * w + (px + dx);
        if (d.assign[j] < 0) continue;
        const x = dx * stepFt, y = -dy * stepFt, z = dsm.data[j] * FT;
        sx += x; sy += y; sz += z; sxx += x * x; sxy += x * y; syy += y * y; sxz += x * z; syz += y * z; n++;
      }
      if (n < 6) continue;
      const det = (sxx * (syy * n - sy * sy)) - (sxy * (sxy * n - sy * sx)) + (sx * (sxy * sy - syy * sx));
      if (Math.abs(det) < 1e-9) continue;
      const a = ((sxz * (syy * n - sy * sy)) - (sxy * (syz * n - sy * sz)) + (sx * (syz * sy - syy * sz))) / det;
      const b = ((sxx * (syz * n - sy * sz)) - (sxz * (sxy * n - sx * sy)) + (sx * (sxy * sz - syz * sx))) / det;
      if (Math.hypot(a, b) < 0.5 / 12) continue;
      azF[i] = Math.atan2(b, a);
    }
  }
  // текстура: ориентация структурного тензора на clear-орто
  const wide = instant.imagery.filter((im) => im.view === "ortho" && im.bbox && im.masked === false)
    .sort((x, y) => (y.bbox![2] - y.bbox![0]) * (y.bbox![3] - y.bbox![1]) - (x.bbox![2] - x.bbox![0]) * (x.bbox![3] - x.bbox![1]))[0]!;
  const orthoF = resolve(".cache/roof-diagram", `pair-${job.key}-wide-clear.png`);
  let texOri: ((pInstant: { x: number; y: number }) => { ori: number; coh: number } | null) | null = null;
  if (existsSync(orthoF)) {
    const img = decode(new Uint8Array(readFileSync(orthoF)));
    const ch = (img as unknown as { channels?: number }).channels ?? 3;
    const gw = img.width, gh = img.height;
    const gray = new Float32Array(gw * gh);
    for (let i = 0; i < gw * gh; i++) gray[i] = (img.data[i * ch] as number) * 0.3 + (img.data[i * ch + 1] as number) * 0.59 + (img.data[i * ch + 2] as number) * 0.11;
    const ov = new Overlay(new Uint8Array(readFileSync(orthoF)), wide.bbox!, meta.origin);
    // px/ft и окно ~3 ряда гонта (3×5.6" ≈ 1.4 ft)
    const p0 = ov.toPx({ x: 0, y: 0 });
    const p1 = ov.toPx({ x: 10, y: 0 });
    const pxPerFt = Math.abs(p1.x - p0.x) / 10;
    const win = Math.max(3, Math.round(1.4 * pxPerFt));
    texOri = (pIn) => {
      const c = ov.toPx(pIn);
      const x0 = Math.round(c.x), y0 = Math.round(c.y);
      if (x0 < win + 1 || y0 < win + 1 || x0 >= gw - win - 1 || y0 >= gh - win - 1) return null;
      let jxx = 0, jxy = 0, jyy = 0;
      for (let dy = -win; dy <= win; dy++) for (let dx = -win; dx <= win; dx++) {
        const i = (y0 + dy) * gw + (x0 + dx);
        const gx = (gray[i + 1] - gray[i - 1]) / 2;
        const gy = (gray[i + gw] - gray[i - gw]) / 2;
        jxx += gx * gx; jxy += gx * gy; jyy += gy * gy;
      }
      const tr = jxx + jyy;
      if (tr < 1e-6) return null;
      const lam = Math.sqrt((jxx - jyy) ** 2 + 4 * jxy * jxy);
      const coh = lam / tr;
      const ori = 0.5 * Math.atan2(2 * jxy, jxx - jyy); // мод 180°
      return { ori, coh };
    };
  }
  // границы модели: 2-гранные, ≥ 4 ft
  const idx = buildIndexes(model);
  const ptById = new Map(model.points.map((p) => [p.id, p]));
  const ownersOf = new Map<string, string[]>();
  for (const f of model.faces) for (const id of new Set(f.lineIds)) {
    const arr = ownersOf.get(id) ?? [];
    if (!arr.includes(f.id)) arr.push(f.id);
    ownersOf.set(id, arr);
  }
  // грань → кластер по большинству пикселей кольца
  const faceCl = new Map<string, number>();
  for (const f of model.faces) {
    const r2 = ringOf(f.lineIds, idx);
    if (!r2) continue;
    const cnt = new Map<number, number>();
    const xs = r2.map((q) => q.x), ys = r2.map((q) => q.y);
    for (let gx = Math.min(...xs); gx <= Math.max(...xs); gx += 1.5) for (let gy = Math.min(...ys); gy <= Math.max(...ys); gy += 1.5) {
      let ins = false;
      for (let i = 0, j = r2.length - 1; i < r2.length; j = i++) {
        if (r2[i].y > gy !== r2[j].y > gy && gx < ((r2[j].x - r2[i].x) * (gy - r2[i].y)) / (r2[j].y - r2[i].y) + r2[i].x) ins = !ins;
      }
      if (!ins) continue;
      const pi = pxOf(fwd({ x: gx, y: gy }));
      if (pi >= 0 && d.assign[pi] >= 0) cnt.set(d.assign[pi], (cnt.get(d.assign[pi]) ?? 0) + 1);
    }
    const best = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) faceCl.set(f.id, best[0]);
    else {
      // фолбэк: по компасу+уклону грани (кольцевая подгонка) к плоскости кластера
      let sa = 0, sb = 0;
      for (let i = 0; i < r2.length; i++) {
        const q1 = r2[i], q2 = r2[(i + 1) % r2.length];
        sa += (q1.x - q2.x) * (q1.z + q2.z) / 2; // грубый градиент не нужен — пропустим
      }
    }
  }
  // фолбэк вторым проходом: грани без кластера — ближайшая плоскость по (компас, уклон)
  {
    const { fitPlane } = require("@/lib/roofRecon");
    for (const f of model.faces) {
      if (faceCl.has(f.id)) continue;
      const r2 = ringOf(f.lineIds, idx);
      if (!r2) continue;
      const pl = fitPlane(r2);
      if (!pl) continue;
      let bestCl = -1, bestD = Infinity;
      d.clusterPlanes.forEach((cp, ci) => {
        const dd = Math.hypot(cp.a - pl.a, cp.b - pl.b);
        if (dd < bestD) { bestD = dd; bestCl = ci; }
      });
      if (bestCl >= 0 && bestD < 0.25) faceCl.set(f.id, bestCl);
    }
  }
  console.log(`\n===== ${job.key} — по-граничный замер (тек | анал | азимут | текстура), смещения в ft поперёк`);
  for (const l of model.lines) {
    const own = ownersOf.get(l.id) ?? [];
    if (own.length !== 2 || l.lengthFt < 4) continue;
    const a = ptById.get(l.aId)!, b = ptById.get(l.bId)!;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const run = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const per = { x: -(b.y - a.y) / run, y: (b.x - a.x) / run };
    // аналитическое пересечение пары
    const clA = faceCl.get(own[0]), clB = faceCl.get(own[1]);
    let dAnal: number | null = null;
    if (clA !== undefined && clB !== undefined && clA !== clB) {
      const A = d.clusterPlanes[clA], B = d.clusterPlanes[clB];
      const da = A.a - B.a, db = A.b - B.b;
      const nrm = Math.hypot(da, db);
      if (nrm > 0.05) {
        const mr = fwd(mid);
        dAnal = (da * mr.x + db * mr.y + (A.c - B.c)) / nrm; // подписанное смещение
      }
    }
    // азимут-поле: max |Δаз| вдоль перпендикуляра ±4 ft
    let dAzPos: number | null = null;
    {
      let best = 0, bestS = 0;
      for (let s2 = -4; s2 <= 4; s2 += 0.5) {
        const i1 = pxOf(fwd({ x: mid.x + per.x * (s2 - 0.5), y: mid.y + per.y * (s2 - 0.5) }));
        const i2 = pxOf(fwd({ x: mid.x + per.x * (s2 + 0.5), y: mid.y + per.y * (s2 + 0.5) }));
        if (i1 < 0 || i2 < 0 || Number.isNaN(azF[i1]) || Number.isNaN(azF[i2])) continue;
        let dz = Math.abs(azF[i1] - azF[i2]);
        if (dz > Math.PI) dz = 2 * Math.PI - dz;
        if (dz > best) { best = dz; bestS = s2; }
      }
      if (best > (20 * Math.PI) / 180) dAzPos = bestS;
    }
    // текстура: max смены ориентации вдоль перпендикуляра (когерентность ≥ 0.2)
    let dTexPos: number | null = null;
    if (texOri) {
      let best = 0, bestS = 0;
      for (let s2 = -4; s2 <= 4; s2 += 0.5) {
        const t1 = texOri({ x: mid.x + per.x * (s2 - 0.7), y: mid.y + per.y * (s2 - 0.7) });
        const t2 = texOri({ x: mid.x + per.x * (s2 + 0.7), y: mid.y + per.y * (s2 + 0.7) });
        if (!t1 || !t2 || t1.coh < 0.2 || t2.coh < 0.2) continue;
        let dz = Math.abs(t1.ori - t2.ori);
        if (dz > Math.PI / 2) dz = Math.PI - dz;
        if (dz > best) { best = dz; bestS = s2; }
      }
      if (best > (15 * Math.PI) / 180) dTexPos = bestS;
    }
    const offInt = dAnal !== null && Math.abs(dAnal) > 1.0;
    const flag = offInt ? "  << ВНЕ ПЕРЕСЕЧЕНИЯ" : "";
    console.log(`  ${l.type.padEnd(9)} (${a.x.toFixed(0)},${a.y.toFixed(0)})→(${b.x.toFixed(0)},${b.y.toFixed(0)}) ${l.lengthFt.toFixed(0)}ft | анал ${dAnal === null ? "н/д " : dAnal.toFixed(1)} | азим ${dAzPos === null ? "нет " : dAzPos.toFixed(1)} | текст ${dTexPos === null ? "нет " : dTexPos.toFixed(1)}${flag}`);
    if (offInt) {
      const near = (v: number | null) => v !== null && Math.abs(v - (dAnal as number)) <= 1.0;
      const votes = [near(dAzPos) ? "азимут" : null, near(dTexPos) ? "текстура" : null].filter(Boolean);
      console.log(`      -> на пересечение ставят: ${votes.length ? votes.join("+") : "никто из полевых"}${votes.length >= 1 ? " (+анал) — ≥2 источников: ПОЧИНКА ГОТОВА" : ""}`);
    }
  }
}
