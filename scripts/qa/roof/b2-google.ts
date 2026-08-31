/* БЛОК 2, КАНДИДАТ 1 — buildingInsights.roofSegmentStats (Google Solar).
 * Только измерение, ничего не встраивается. Solar бесплатен; сырой ответ
 * кэшируется в .cache/roof-diagram/bi-<key>.json (повторы — ноль сети).
 *
 *   npx tsx scripts/qa/roof/b2-google.ts [ключ]
 *
 * По каждому адресу: таблица сегментов (центр в кадре, компас-азимут,
 * уклон°→/12, площадь, высота плоскости, bbox), покрытие крыши сегментами,
 * три класса расхождений с нашими кластерами:
 *   A. ≥2 сегмента Google разных азимутов в одном нашем кластере → слили
 *   B. ≥2 наших кластера в одном сегменте Google → разрезали
 *   C. сегмент Google без нашего кластера → потеряли
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadHarnessEnv } from "./env";
loadHarnessEnv();
import { reconstructRoof } from "@/lib/roofRecon";
import type { Raster } from "@/lib/solar";
import { gunzipSync } from "node:zlib";
import type { FixtureMeta } from "./fixture";
import { loadFixture } from "./fixture";

const FT = 3.28084;
const D2R = Math.PI / 180;
const EARTH_R_M = 6378137;

const JOBS = [
  { key: "12629", dir: "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl", fixture: "kirkland-12629-ne-100th-pl" },
  { key: "12621", dir: "scripts/qa/roof/field/12621-ne-100th-pl-kirkland-wa", fixture: undefined },
  { key: "12618", dir: "scripts/qa/roof/field/12618-ne-100th-st-kirkland-wa", fixture: undefined },
  { key: "9903", dir: "scripts/qa/roof/field/9903-117th-pl-ne-kirkland-wa", fixture: undefined },
  { key: "419", dir: "scripts/qa/roof/fixtures/prairie-419-prairie-ridge-ln", fixture: "prairie-419-prairie-ridge-ln" },
  { key: "12117", dir: "scripts/qa/roof/field/12117-202nd-st-se-snohomish-wa", fixture: undefined },
];
const ONLY = process.argv[2];

(async () => {
  for (const job of JOBS) {
    if (ONLY && job.key !== ONLY) continue;
    const meta = JSON.parse(readFileSync(resolve(job.dir, "meta.json"), "utf8")) as FixtureMeta;
    const cacheF = resolve(".cache/roof-diagram", `bi-${job.key}.json`);
    let raw: Record<string, unknown>;
    if (existsSync(cacheF)) raw = JSON.parse(readFileSync(cacheF, "utf8"));
    else {
      const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${meta.origin.lat}&location.longitude=${meta.origin.lng}&requiredQuality=HIGH&key=${process.env.GOOGLE_MAPS_API_KEY}`;
      const res = await fetch(url);
      raw = (await res.json()) as Record<string, unknown>;
      writeFileSync(cacheF, JSON.stringify(raw));
    }
    const sp = (raw.solarPotential ?? {}) as Record<string, unknown>;
    const segs = ((sp.roofSegmentStats ?? []) as Array<Record<string, unknown>>).map((s) => {
      const c = (s.center ?? {}) as { latitude?: number; longitude?: number };
      const bb = (s.boundingBox ?? {}) as { sw?: { latitude: number; longitude: number }; ne?: { latitude: number; longitude: number } };
      const st = (s.stats ?? {}) as { areaMeters2?: number };
      return {
        pitchDeg: Number(s.pitchDegrees ?? 0),
        azDeg: Number(s.azimuthDegrees ?? 0),
        areaSf: Number(st.areaMeters2 ?? 0) * FT * FT,
        hM: Number(s.planeHeightAtCenterMeters ?? 0),
        lat: Number(c.latitude ?? 0),
        lng: Number(c.longitude ?? 0),
        bb,
      };
    }).filter((s) => s.areaSf > 0);
    const toFt = (lat: number, lng: number) => ({
      x: (lng - meta.origin.lng) * D2R * Math.cos(meta.origin.lat * D2R) * EARTH_R_M * FT,
      y: (lat - meta.origin.lat) * D2R * EARTH_R_M * FT,
    });
    console.log(`\n===== ${job.key}: сегментов Google ${segs.length} · imagery ${String(raw.imageryQuality ?? "?")}`);
    for (const s of segs.sort((a, b) => b.areaSf - a.areaSf)) {
      const p = toFt(s.lat, s.lng);
      const pitch12 = Math.tan(s.pitchDeg * D2R) * 12;
      const bbW = s.bb.sw && s.bb.ne ? `${(toFt(s.bb.ne.latitude, s.bb.ne.longitude).x - toFt(s.bb.sw.latitude, s.bb.sw.longitude).x).toFixed(0)}×${(toFt(s.bb.ne.latitude, s.bb.ne.longitude).y - toFt(s.bb.sw.latitude, s.bb.sw.longitude).y).toFixed(0)}` : "?";
      console.log(`  центр (${p.x.toFixed(1)},${p.y.toFixed(1)}) · компас ${s.azDeg.toFixed(0)}° · ${s.pitchDeg.toFixed(1)}° = ${pitch12.toFixed(1)}/12 · ${s.areaSf.toFixed(0)} sf · hC ${(s.hM * FT).toFixed(1)} ft · bbox ${bbW} ft`);
    }
    // наши кластеры (текущая сегментация со всеми законами)
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
    const recon = reconstructRoof(dsm as never, mask as never);
    const d = recon.diagnostics as unknown as { assign: Int32Array; clusterPlanes: Array<{ a: number; b: number; c: number }>; buildingPx: number };
    const w = dsm.width, h = dsm.height, stepFt = dsm.pixelSizeM * FT, cx = w / 2, cy = h / 2;
    const byCl = new Map<number, { n: number; sx: number; sy: number }>();
    let roofPx = 0;
    for (let i = 0; i < w * h; i++) {
      if (mask.data[i] > 0.5) roofPx++;
      const cl = d.assign[i];
      if (cl < 0) continue;
      const e = byCl.get(cl) ?? { n: 0, sx: 0, sy: 0 };
      e.n++; e.sx += ((i % w) + 0.5 - cx) * stepFt; e.sy += (cy - Math.floor(i / w) - 0.5) * stepFt;
      byCl.set(cl, e);
    }
    const ours = [...byCl.entries()].map(([cl, e]) => {
      const pl = d.clusterPlanes[cl];
      return {
        cl, sf: e.n * stepFt * stepFt,
        x: e.sx / e.n, y: e.sy / e.n,
        compass: ((Math.atan2(-pl.a, -pl.b) / D2R) + 360) % 360,
        pitch12: Math.hypot(pl.a, pl.b) * 12,
      };
    });
    console.log(`  наших кластеров: ${ours.length}; покрытие Google-сегментами: ${(segs.reduce((s2, x) => s2 + x.areaSf, 0) / (d.buildingPx * stepFt * stepFt) * 100).toFixed(0)}% изолированной крыши (${(d.buildingPx * stepFt * stepFt).toFixed(0)} sf)`);
    // соответствие: сегмент ↔ ближайший кластер того же компаса (±30°)
    // NB: кадры сдвинуты регистрацией — сопоставляем по компасу+близости
    for (const s of segs) {
      const p = toFt(s.lat, s.lng);
      const match = ours.filter((o) => {
        let dAz = Math.abs(o.compass - s.azDeg) % 360;
        if (dAz > 180) dAz = 360 - dAz;
        return dAz <= 30;
      }).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      const pitch12 = Math.tan(s.pitchDeg * D2R) * 12;
      if (!match) console.log(`  [C·ПОТЕРЯН?] Google (${p.x.toFixed(0)},${p.y.toFixed(0)}) ${s.azDeg.toFixed(0)}° ${pitch12.toFixed(1)}/12 ${s.areaSf.toFixed(0)}sf — нашего кластера того же компаса нет`);
      else console.log(`  сегм (${p.x.toFixed(0)},${p.y.toFixed(0)}) ${s.azDeg.toFixed(0)}°/${pitch12.toFixed(1)} ↔ cl${match.cl} (${match.x.toFixed(0)},${match.y.toFixed(0)}) ${match.compass.toFixed(0)}°/${match.pitch12.toFixed(1)} · dist ${Math.hypot(match.x - p.x, match.y - p.y).toFixed(1)} ft`);
    }
  }
})();
