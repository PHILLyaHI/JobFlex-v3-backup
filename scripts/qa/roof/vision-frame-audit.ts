/* Which picture went to the reader, and which house is 12629 — the audit.
 *
 *   npx tsx scripts/qa/roof/vision-frame-audit.ts
 *
 * Outputs, all into .cache/ablation/:
 *   audit-frames.png   the four imagery tokens side by side, each with the pin
 *                      crosshair and the Instant outline, captioned in console
 *                      with resolution and measured shadow share
 *   audit-anchor.png   the wide clear frame with three independent anchors:
 *                      the pin, EagleView's outline for "12629", and the
 *                      CADASTRE ring of the neighbour 12621 from ParcelCache —
 *                      the one ground truth in reach that is address-matched
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { decode, encode } from "fast-png";
import { loadHarnessEnv } from "./env";

loadHarnessEnv();

import type { InstantRoofData } from "@/lib/eagleview";
import { fetchPropertyImage } from "@/lib/eagleview";
import type { FixtureMeta } from "./fixture";

const FT_PER_M = 3.28084;
const EARTH_R_M = 6378137;
const D2R = Math.PI / 180;
const DIR = "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl";
const CACHE = resolve(".cache/roof-diagram");
const OUT = resolve(".cache/ablation");

const meta = JSON.parse(readFileSync(resolve(DIR, "meta.json"), "utf8")) as FixtureMeta;
const instant = JSON.parse(readFileSync(resolve(DIR, "instant.json"), "utf8")) as InstantRoofData;
const origin = meta.origin;

interface Frame { w: number; h: number; ch: number; data: Uint8Array; bbox: [number, number, number, number] }

async function frameOf(token: string, cacheName: string, bbox: [number, number, number, number]): Promise<Frame> {
  const file = resolve(CACHE, cacheName);
  let bytes: Uint8Array;
  if (existsSync(file)) bytes = new Uint8Array(readFileSync(file));
  else {
    const r = await fetchPropertyImage(token);
    bytes = new Uint8Array(r.bytes);
    writeFileSync(file, Buffer.from(bytes));
  }
  const img = decode(bytes);
  return { w: img.width, h: img.height, ch: (img as unknown as { channels?: number }).channels ?? 3, data: img.data as Uint8Array, bbox };
}

const px = (f: Frame, lat: number, lng: number) => ({
  x: ((lng - f.bbox[0]) / (f.bbox[2] - f.bbox[0])) * f.w,
  y: ((f.bbox[3] - lat) / (f.bbox[3] - f.bbox[1])) * f.h,
});

function mark(f: Frame, out: Uint8Array, ow: number, ox: number, oy: number, scale: number) {
  // pin crosshair
  const p = px(f, origin.lat, origin.lng);
  for (let d = -12; d <= 12; d++) {
    for (const [xx, yy] of [[p.x + d, p.y], [p.x, p.y + d]] as const) {
      const X = Math.round(ox + xx * scale);
      const Y = Math.round(oy + yy * scale);
      if (X >= 0 && Y >= 0) { const i = (Y * ow + X) * 3; out[i] = 255; out[i + 1] = 255; out[i + 2] = 0; }
    }
  }
  // Instant outline
  const ring = instant.structures[0].outline ?? [];
  for (let i = 0; i < ring.length; i++) {
    const a = px(f, ring[i].lat, ring[i].lng);
    const b = px(f, ring[(i + 1) % ring.length].lat, ring[(i + 1) % ring.length].lng);
    const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    for (let s = 0; s <= steps; s++) {
      const X = Math.round(ox + (a.x + ((b.x - a.x) * s) / steps) * scale);
      const Y = Math.round(oy + (a.y + ((b.y - a.y) * s) / steps) * scale);
      if (X >= 0 && Y >= 0) { const i2 = (Y * ow + X) * 3; out[i2] = 0; out[i2 + 1] = 255; out[i2 + 2] = 255; }
    }
  }
}

/** Share of pixels inside the Instant outline darker than a fixed luma. */
function shadowShare(f: Frame): number {
  const ring = (instant.structures[0].outline ?? []).map((q) => px(f, q.lat, q.lng));
  const inR = (x: number, y: number) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      if (ring[i].y > y !== ring[j].y > y && x < ((ring[j].x - ring[i].x) * (y - ring[i].y)) / (ring[j].y - ring[i].y) + ring[i].x) inside = !inside;
    }
    return inside;
  };
  let dark = 0;
  let total = 0;
  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  for (let y = Math.max(0, Math.floor(Math.min(...ys))); y < Math.min(f.h, Math.ceil(Math.max(...ys))); y++) {
    for (let x = Math.max(0, Math.floor(Math.min(...xs))); x < Math.min(f.w, Math.ceil(Math.max(...xs))); x++) {
      if (!inR(x, y)) continue;
      const i = (y * f.w + x) * f.ch;
      const luma = 0.299 * f.data[i] + 0.587 * f.data[i + 1] + 0.114 * f.data[i + 2];
      total++;
      if (luma < 80) dark++;
    }
  }
  return total ? dark / total : 0;
}

(async () => {
  console.log(`EagleView echoed address: ${instant.address}`);
  console.log(`EagleView's own pin: ${instant.lat}, ${instant.lng} · our pin: ${origin.lat}, ${origin.lng}`);

  // ── the four tokens, side by side ──
  const cacheNames: Record<string, string> = {};
  instant.imagery.forEach((im) => {
    const wideArea = (b: [number, number, number, number]) => (b[2] - b[0]) * (b[3] - b[1]);
    const isWide = wideArea(im.bbox!) === Math.max(...instant.imagery.map((x) => wideArea(x.bbox!)));
    cacheNames[im.token] = `pair-12629-${isWide ? "wide" : "tight"}-${im.masked ? "masked" : "clear"}.png`;
  });
  const frames: Array<{ f: Frame; label: string }> = [];
  for (const im of instant.imagery) {
    const f = await frameOf(im.token, cacheNames[im.token], im.bbox!);
    const ftPerPx = ((im.bbox![2] - im.bbox![0]) * D2R * Math.cos(origin.lat * D2R) * EARTH_R_M * FT_PER_M) / f.w;
    const sh = shadowShare(f);
    const label = `${cacheNames[im.token].replace("pair-12629-", "").replace(".png", "")} · ${f.w}x${f.h} · ${ftPerPx.toFixed(3)} ft/px · shadow ${(sh * 100).toFixed(0)}%`;
    console.log(`  ${im.token.slice(0, 8)}… ${label} · shot ${im.shotDate}`);
    frames.push({ f, label });
  }
  // montage 2x2, each cell 500px wide
  const cell = 500;
  const cellH = Math.round((cell * frames[0].f.h) / frames[0].f.w);
  const ow = cell * 2;
  const oh = cellH * 2;
  const out = new Uint8Array(ow * oh * 3);
  frames.forEach(({ f }, n) => {
    const ox = (n % 2) * cell;
    const oy = Math.floor(n / 2) * cellH;
    const scale = cell / f.w;
    for (let y = 0; y < cellH; y++) {
      for (let x = 0; x < cell; x++) {
        const sx = Math.min(f.w - 1, Math.round(x / scale));
        const sy = Math.min(f.h - 1, Math.round(y / scale));
        const si = (sy * f.w + sx) * f.ch;
        const di = ((oy + y) * ow + (ox + x)) * 3;
        out[di] = f.data[si];
        out[di + 1] = f.data[si + 1];
        out[di + 2] = f.data[si + 2];
      }
    }
    mark(f, out, ow, ox, oy, scale);
  });
  writeFileSync(resolve(OUT, "audit-frames.png"), Buffer.from(encode({ width: ow, height: oh, data: out, channels: 3, depth: 8 })));
  console.log("wrote audit-frames.png (yellow cross = pin, cyan = Instant outline for 12629)");

  // ── the anchor: neighbour 12621's cadastre on the wide frame ──
  const wideIm = instant.imagery.filter((i) => !i.masked).sort((a, b) =>
    (b.bbox![2] - b.bbox![0]) * (b.bbox![3] - b.bbox![1]) - (a.bbox![2] - a.bbox![0]) * (a.bbox![3] - a.bbox![1]))[0];
  const wf = await frameOf(wideIm.token, cacheNames[wideIm.token], wideIm.bbox!);
  const anchor = new Uint8Array(wf.w * wf.h * 3);
  for (let i = 0; i < wf.w * wf.h; i++) for (let c = 0; c < 3; c++) anchor[i * 3 + c] = wf.data[i * wf.ch + c];
  mark(wf, anchor, wf.w, 0, 0, 1);
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  const p21 = await db.parcelCache.findFirst({ where: { address: { startsWith: "12621 " } } });
  await db.$disconnect();
  if (p21?.wkt) {
    const m = p21.wkt.match(/\(\(([^)]+)\)\)/);
    const ring = (m ? m[1].split(",").map((s) => s.trim().split(/\s+/).map(Number)) : [])
      .filter((c) => c.length >= 2)
      .map(([lng, lat]) => ({ lat, lng }));
    for (let i = 0; i < ring.length; i++) {
      const a = px(wf, ring[i].lat, ring[i].lng);
      const b = px(wf, ring[(i + 1) % ring.length].lat, ring[(i + 1) % ring.length].lng);
      const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
      for (let s = 0; s <= steps; s++) {
        const X = Math.round(a.x + ((b.x - a.x) * s) / steps);
        const Y = Math.round(a.y + ((b.y - a.y) * s) / steps);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const XX = X + dx, YY = Y + dy;
          if (XX >= 0 && YY >= 0 && XX < wf.w && YY < wf.h) { const i2 = (YY * wf.w + XX) * 3; anchor[i2] = 255; anchor[i2 + 1] = 0; anchor[i2 + 2] = 255; }
        }
      }
    }
    console.log("wrote audit-anchor.png (magenta = CADASTRE ring of 12621 from ReportAll, cyan = EagleView outline of 12629, yellow = pin)");
  } else console.log("12621 cadastre missing — anchor drawn without it");
  writeFileSync(resolve(OUT, "audit-anchor.png"), Buffer.from(encode({ width: wf.w, height: wf.h, data: anchor, channels: 3, depth: 8 })));
})();
