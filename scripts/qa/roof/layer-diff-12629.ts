/* Layer ablation on 12629 with the two lists the eye cannot be trusted to make.
 *
 *   npx tsx scripts/qa/roof/layer-diff-12629.ts
 *
 * A: bare skeleton · B: +wavefront · C: +lidar folds · D: current output.
 * Per layer: facets, footage by type — and two lists, measured rather than
 * eyeballed:
 *
 *   MODEL LINES ABSENT FROM THE PICTURE — an interior line where the elevation
 *   data does NOT bend across it (planes fitted to both sides inside the host
 *   facet, same 10-degree floor the lidar folds use). A drawn crease over a
 *   flat slope is a crease the drawing invented.
 *
 *   PICTURE LINES ABSENT FROM THE MODEL — the independent finders' lines
 *   (Hough segments over the contrast map, >= 20 ft, inside the contour, and
 *   lidar fold candidates) with no model line within NOT_A_NEW_LINE_FT (6 ft).
 *   This list is the important one: it is what the drawing failed to draw.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadHarnessEnv } from "./env";

loadHarnessEnv();

import type { InstantRoofData, RoofModel } from "@/lib/eagleview";
import { fitPlane } from "@/lib/roofRecon";
import { buildRoofV2 } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { measurePitchFromDsm, structurePitch } from "@/lib/roofRecon/pitchFromDsm";
import { tryWavefront } from "@/lib/roofRecon/wavefrontGate";
import { fetchCloud } from "@/lib/roofRecon/lidarCloud";
import { findCreases } from "@/lib/roofRecon/creases";
import { applyCreases } from "@/lib/roofRecon/facetCut";
import { contrastMap } from "@/lib/roofDiagram/orthoPrep";
import { canny, houghP, mergeCollinear, grayFromPng } from "@/lib/roofDiagram/cv";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";
import { loadFixture, type FixtureMeta } from "./fixture";

const FT_PER_M = 3.28084;
const EARTH_R_M = 6378137;
const D2R = Math.PI / 180;
const BEND_MIN_DEG = 10;
const SAME_LINE_FT = 6;
const MIN_HOUGH_FT = 20;
const DIR = "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl";

const meta = JSON.parse(readFileSync(resolve(DIR, "meta.json"), "utf8")) as FixtureMeta;
const instant = JSON.parse(readFileSync(resolve(DIR, "instant.json"), "utf8")) as InstantRoofData;
const origin = meta.origin;

const inRing = (p: { x: number; y: number }, r: ReadonlyArray<{ x: number; y: number }>): boolean => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if (r[i].y > p.y !== r[j].y > p.y && p.x < ((r[j].x - r[i].x) * (p.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) inside = !inside;
  }
  return inside;
};

function distToSeg(p: FootprintPoint, a: FootprintPoint, b: FootprintPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

(async () => {
  const fx = loadFixture("kirkland-12629-ne-100th-pl");
  const dsm = fx.dsm;
  const mask = fx.mask;
  const ground = meta.diagnostics.groundElevFt as number;
  const clusters = (meta.diagnostics.clusters as number) ?? null;

  // ── the four layers, exactly as the product builds them ──
  const first = buildRoofV2({ instant, origin, clusters });
  const ring0 = first.report.structures.find((s) => s.ring)!.ring as FootprintPoint[];
  const reg = registerContourToRaster({ contour: ring0, mask, dsm, groundElevFt: ground });
  const meas = reg.applied
    ? measurePitchFromDsm({ model: first.model!, mask, dsm, transform: reg.transform, transformFor: () => reg.transform, sectionTolerance12: 0.75 })
    : null;
  const sp = meas ? structurePitch(meas, instant.totals?.predominantPitch ?? null, { solarPanels: false }) : null;
  const A: RoofModel = (sp ? buildRoofV2({ instant, origin, clusters, pitchOverride12: sp.pitch12 }).model : null) ?? first.model!;
  let B = A;
  if (meas && sp) {
    try {
      const g = tryWavefront({ contour: ring0, skeletonModel: A, measurement: meas, structurePitch12: sp.pitch12, structureIndex: 0 });
      if (g.model) B = g.model;
    } catch { /* refusal — B stays A */ }
  }
  let C = B;
  const xs = ring0.map((p) => p.x);
  const ys = ring0.map((p) => p.y);
  const cloud = await fetchCloud({ origin, box: { x0: Math.min(...xs) - 15, x1: Math.max(...xs) + 15, y0: Math.min(...ys) - 15, y1: Math.max(...ys) + 15 } });
  let lidarCands: ReturnType<typeof findCreases> = [];
  if (!("reason" in cloud)) {
    lidarCands = findCreases({ model: B, cloud: cloud.cloud.points, groundFt: cloud.cloud.groundFt });
    C = applyCreases(B, lidarCands).model;
  }
  const D = C; // surgeries diagnose, never edit
  const layers: Array<{ tag: string; m: RoofModel }> = [
    { tag: "A · голый скелет", m: A },
    { tag: "B · + wavefront", m: B },
    { tag: "C · + складки", m: C },
    { tag: "D · текущий вывод", m: D },
  ];

  // ── the DSM as points, for the bend test ──
  const stepFt = dsm.pixelSizeM * FT_PER_M;
  const cx = dsm.width / 2;
  const cy = dsm.height / 2;
  const pts: Array<{ x: number; y: number; z: number }> = [];
  for (let py = 0; py < dsm.height; py++) {
    for (let px = 0; px < dsm.width; px++) {
      const i = py * dsm.width + px;
      if (mask.data[i] <= 0) continue;
      const z = dsm.data[i] * FT_PER_M - ground;
      if (!Number.isFinite(z) || z < 3) continue;
      pts.push({ x: (px + 0.5 - cx) * stepFt, y: (cy - py - 0.5) * stepFt, z });
    }
  }

  /** Does the surface actually BEND across this model line? */
  function bendAt(m: RoofModel, aId: string, bId: string): { bend: number | null; host: string } {
    const P = new Map(m.points.map((p) => [p.id, p]));
    const a = P.get(aId)!;
    const b = P.get(bId)!;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 3) return { bend: null, host: "—" };
    const nx = -dy / len;
    const ny = dx / len;
    const idx = buildIndexes(m);
    const host = m.faces.find((f) => {
      const r = ringOf(f.lineIds, idx);
      return r && r.length >= 3 && inRing(mid, r.map((q) => ({ x: q.x, y: q.y })));
    });
    // Sides taken over the LINE's own neighbourhood band, not a facet — an
    // interior line borders two facets, and both sides matter.
    const lo: typeof pts = [];
    const hi: typeof pts = [];
    for (const p of pts) {
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len);
      if (t < 0 || t > 1) continue;
      const s = (p.x - mid.x) * nx + (p.y - mid.y) * ny;
      if (Math.abs(s) > 8 || Math.abs(s) < 1) continue;
      (s > 0 ? hi : lo).push(p);
    }
    if (lo.length < 10 || hi.length < 10) return { bend: null, host: host ? String(host.designator || host.id) : "—" };
    const pl = fitPlane(lo);
    const ph = fitPlane(hi);
    if (!pl || !ph) return { bend: null, host: host ? String(host.designator || host.id) : "—" };
    const dot = pl.a * ph.a + pl.b * ph.b + 1;
    const mag = Math.hypot(pl.a, pl.b, 1) * Math.hypot(ph.a, ph.b, 1);
    return { bend: (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI, host: host ? String(host.designator || host.id) : "—" };
  }

  // ── the picture's own lines: Hough over the contrast map + lidar candidates ──
  const clearFile = resolve(".cache/roof-diagram", "pair-12629-wide-clear.png");
  const wideIm = instant.imagery.filter((i) => !i.masked && i.bbox).sort((a, b) =>
    (b.bbox![2] - b.bbox![0]) * (b.bbox![3] - b.bbox![1]) - (a.bbox![2] - a.bbox![0]) * (a.bbox![3] - a.bbox![1]))[0];
  const photoLines: Array<{ a: FootprintPoint; b: FootprintPoint; src: string; lenFt: number }> = [];
  if (existsSync(clearFile) && wideIm?.bbox) {
    const cm = contrastMap(new Uint8Array(readFileSync(clearFile)));
    const g = grayFromPng(cm.bytes);
    const edges = canny(g.gray, g.w, g.h, 20, 70);
    const segs = mergeCollinear(houghP(edges, g.w, g.h, { threshold: 40, minLineLength: 25, maxLineGap: 6, linesMax: 400 }));
    const [minLon, minLat, maxLon, maxLat] = wideIm.bbox;
    const toFrame = (px: number, py: number): FootprintPoint => {
      const lng = minLon + (px / g.w) * (maxLon - minLon);
      const lat = maxLat - (py / g.h) * (maxLat - minLat);
      return {
        x: (lng - origin.lng) * D2R * Math.cos(origin.lat * D2R) * EARTH_R_M * FT_PER_M,
        y: (lat - origin.lat) * D2R * EARTH_R_M * FT_PER_M,
      };
    };
    for (const s of segs) {
      const a = toFrame(s.x1, s.y1);
      const b = toFrame(s.x2, s.y2);
      const lenFt = Math.hypot(b.x - a.x, b.y - a.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (lenFt < MIN_HOUGH_FT || !inRing(mid, ring0)) continue;
      photoLines.push({ a, b, src: "Хаф", lenFt });
    }
  }
  for (const c of lidarCands) {
    const half = 25;
    photoLines.push({
      a: { x: c.through.x - c.dir.x * half, y: c.through.y - c.dir.y * half },
      b: { x: c.through.x + c.dir.x * half, y: c.through.y + c.dir.y * half },
      src: `лидар (${c.refused ? "отброшен гвардой" : "принят"})`,
      lenFt: half * 2,
    });
  }

  // ── per-layer report ──
  const md5s = new Set<string>();
  for (const L of layers) {
    const m = L.m;
    const fp = JSON.stringify(m.lines.map((l) => l.type + l.aId + l.bId).sort());
    md5s.add(fp);
    const ft = (t: string) => Math.round((m.totals.footageByType?.[t as never] as number) ?? 0);
    console.log(`\n${"=".repeat(76)}\n${L.tag}`);
    console.log(`  граней ${m.faces.length} · конёк ${ft("RIDGE")} · вальмы ${ft("HIP")} · ендовы ${ft("VALLEY")} · карниз ${ft("EAVE")} · фронтоны ${ft("RAKE")} ft`);

    const P = new Map(m.points.map((p) => [p.id, p]));
    const interior = m.lines.filter((l) => ["RIDGE", "HIP", "VALLEY"].includes(l.type));
    const ghost: string[] = [];
    for (const l of interior) {
      const r = bendAt(m, l.aId, l.bId);
      const a = P.get(l.aId)!;
      const b = P.get(l.bId)!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (r.bend != null && r.bend < BEND_MIN_DEG && len >= 4) {
        ghost.push(`${l.type} ${len.toFixed(0)} ft у (${((a.x + b.x) / 2).toFixed(0)},${((a.y + b.y) / 2).toFixed(0)}): изгиб DSM ${r.bend.toFixed(1)}° < ${BEND_MIN_DEG}°`);
      }
    }
    console.log(`  ЛИНИИ МОДЕЛИ, КОТОРЫХ НЕТ НА СНИМКЕ (изгиб высот < ${BEND_MIN_DEG}°): ${ghost.length}`);
    for (const s2 of ghost) console.log(`    – ${s2}`);

    const missing: string[] = [];
    for (const ph of photoLines) {
      const mid = { x: (ph.a.x + ph.b.x) / 2, y: (ph.a.y + ph.b.y) / 2 };
      const near = m.lines.some((l) => {
        const a = P.get(l.aId);
        const b = P.get(l.bId);
        return a && b && distToSeg(mid, a, b) <= SAME_LINE_FT && distToSeg(ph.a, a, b) <= SAME_LINE_FT * 2;
      });
      if (!near) missing.push(`${ph.src} ${ph.lenFt.toFixed(0)} ft у (${mid.x.toFixed(0)},${mid.y.toFixed(0)})`);
    }
    console.log(`  ЛИНИИ СНИМКА, КОТОРЫХ НЕТ В МОДЕЛИ: ${missing.length}`);
    for (const s2 of missing) console.log(`    – ${s2}`);
  }
  console.log(`\nслоёв с различающейся геометрией: ${md5s.size} из 4 ${md5s.size === 1 ? "— A = B = C = D, крест живёт в скелете" : ""}`);
})();
