/* Эталон расщепления кластера по внутренней стене (§K8, отмашка
 * 2026-08-31 п.3) — ручные числа.
 *
 *   npx tsx scripts/qa/roof/wallsplit-synth.ts    (exit 1 на любой FAIL)
 *
 * Случай 1: один кластер 32×28 ft, плато z=12.5 (y>0) / стена 2.5 /
 * плато z=8 (y<0) с рампой в 1 px. Приёмка: регион режется на ДВЕ
 * интра-секции (~по половине), каждая — новый кластер со своей
 * плоскостью (уровни 12.5 и 8 в пределах шага), полоса обрыва узкая.
 *
 * Случай 2 (контроль): обрыв-огрызок 4 ft посреди кластера (не насквозь)
 * НЕ режет — регион остаётся один.
 */
import { splitClustersByInnerWall } from "@/lib/roofRecon/wallSplit";

const FT_PER_M = 3.28084;
const PX_M = 0.1;
const STEP_FT = PX_M * FT_PER_M;
const W = 120;
const H = 100;
const cx = W / 2;
const cy = H / 2;

let failures = 0;
const check = (label: string, ok: boolean, detail: string) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${detail}`);
};

const ftOfFor = () => (pi: number) => {
  const px = pi % W;
  const py = (pi - px) / W;
  return { x: (px + 0.5 - cx) * STEP_FT, y: (cy - py - 0.5) * STEP_FT };
};

const run = (zAt: (x: number, y: number) => number | null) => {
  const region = new Int32Array(W * H).fill(-1);
  const ftOf = ftOfFor();
  for (let pi = 0; pi < W * H; pi++) {
    const p = ftOf(pi);
    if (Math.abs(p.x) > 16 || Math.abs(p.y) > 14) continue;
    region[pi] = 0;
  }
  const regionKind: Array<"cluster" | "fill"> = ["cluster"];
  const clusterOf = [0];
  const clusters: Array<{ plane: { a: number; b: number; c: number }; px: number }> = [
    { plane: { a: 0, b: 0, c: 10 }, px: 0 },
  ];
  const res = splitClustersByInnerWall({
    region,
    regionKind,
    clusterOf,
    width: W,
    height: H,
    stepFt: STEP_FT,
    minFacetSqft: 15,
    zOf: (pi) => {
      const p = ftOf(pi);
      if (Math.abs(p.x) > 18 || Math.abs(p.y) > 16) return null;
      return zAt(p.x, p.y);
    },
    ftOf,
    coreDzFt: 2.0,
    growDzFt: 1.8,
    planeTolFt: 0.6, // DEFAULT_PLANE_TOL_FT — та же линейка, что суд клетки
    registerCluster: (plane, pixels) => {
      clusters.push({ plane, px: pixels.length });
      return clusters.length - 1;
    },
  });
  return { res, region, regionKind, clusterOf, clusters };
};

// ── Случай 1: плато 12.5 / стена 2.5 / плато 8 ──
{
  // рампа в один пиксель у y=0: 12.5 (y > step/2), 8 (y < -step/2)
  const r = run((x, y) => (y > STEP_FT / 2 ? 12.5 : y < -STEP_FT / 2 ? 8 : 10.25));
  console.log(`СЛУЧАЙ 1 — плато 12.5 / стена 4.5 / плато 8: расщеплений ${r.res.splits}, регионов ${r.regionKind.length}`);
  check("регион разрезан (1 расщепление, 2 региона)", r.res.splits === 1 && r.regionKind.length === 2, `splits=${r.res.splits}, регионов=${r.regionKind.length}`);
  const pxOfRegion = [0, 0];
  for (let pi = 0; pi < W * H; pi++) {
    const rid = r.region[pi];
    if (rid >= 0) pxOfRegion[rid]++;
  }
  const sf = pxOfRegion.map((n) => Math.round(n * STEP_FT * STEP_FT));
  check("секции ~по половине (по ~448sf ±60)", Math.abs(sf[0] - 448) <= 60 && Math.abs(sf[1] - 448) <= 60, `${sf.join("sf | ")}sf`);
  // уровни секций — из их плоскостей (в центре секции)
  const lvl = (rid: number, y0: number): number | null => {
    const cl = r.clusterOf[rid];
    const pl = r.clusters[cl]?.plane;
    return pl ? pl.a * 0 + pl.b * y0 + pl.c : null;
  };
  const z0 = lvl(0, 7);
  const z1 = lvl(1, -7);
  const [zHi, zLo] = z0 !== null && z1 !== null ? [Math.max(z0, z1), Math.min(z0, z1)] : [NaN, NaN];
  check("уровень верхней секции 12.5 (±0.33)", Math.abs(zHi - 12.5) <= STEP_FT, `zHi=${zHi.toFixed(2)}`);
  check("уровень нижней секции 8 (±0.33)", Math.abs(zLo - 8) <= STEP_FT, `zLo=${zLo.toFixed(2)}`);
}

// ── Случай 2 (контроль): обрыв-огрызок 4 ft не насквозь — не режет ──
{
  // клин-стена: обрыв 4.5 живёт только на |x| ≤ 2 (4-ft огрызок посреди),
  // выцветает к |x| = 4; дальше юг сообщается с севером гладко —
  // линия обрыва НЕ доходит до границ кластера
  const drop = (x: number): number => 4.5 * Math.max(0, Math.min(1, 1 - (Math.abs(x) - 2) / 6));
  const r = run((x, y) => (y > STEP_FT / 2 ? 12.5 : 12.5 - drop(x)));
  console.log(`СЛУЧАЙ 2 — огрызок 4 ft посреди (клин, не насквозь): расщеплений ${r.res.splits}, регионов ${r.regionKind.length}`);
  check("огрызок не режет (0 расщеплений, 1 регион)", r.res.splits === 0 && r.regionKind.length === 1, `splits=${r.res.splits}, регионов=${r.regionKind.length}`);
}

// ── Случай 3 (§J, переработка блока 4): крона-полоса — хаотичные
//    станции поперёк региона НЕ режут: секции раскроя не держат свою
//    плоскость (суд секций той же линейкой, что переподгонка клетки) ──
{
  // детерминированный «лиственный» хаос ±3 ft на полосе |y| < 3,
  // пересекающей регион насквозь; вне полосы — плоскость 12.5
  const leaf = (x: number, y: number): number =>
    3 * Math.sin(x * 12.9898 + y * 78.233) * Math.sin(x * 3.7 - y * 5.1);
  const r = run((x, y) => (Math.abs(y) < 3 ? 12.5 + leaf(x, y) : 12.5));
  console.log(`СЛУЧАЙ 3 — крона-полоса (хаос ±3 поперёк): расщеплений ${r.res.splits}, регионов ${r.regionKind.length}`);
  check("крона не режет (0 расщеплений, 1 регион)", r.res.splits === 0 && r.regionKind.length === 1, `splits=${r.res.splits}, регионов=${r.regionKind.length}`);
}

// ── Случай 4 (отмашка п.2): СКЛАДКА — две плоскости разных градиентов,
//    высота непрерывна (стены нет): суд плоскостей обеих сторон ──
{
  const r = run((x, y) => (x + y < 0 ? 10 + 0.5 * (x + y) : 10 + 0.2 * (x + y)));
  console.log(`СЛУЧАЙ 4 — складка без стены (|Δ∇|≈3.6/12): расщеплений ${r.res.splits}, регионов ${r.regionKind.length}`);
  check("складка режет (1 расщепление, 2 региона)", r.res.splits === 1 && r.regionKind.length === 2, `splits=${r.res.splits}, регионов=${r.regionKind.length}`);
  if (r.res.splits === 1) {
    const g = r.clusters.slice(1).map((c) => Math.hypot(c.plane.a, c.plane.b) * 12);
    check("градиенты секций ≈ 8.5 и 3.4 (±1)", g.some((v) => Math.abs(v - 8.5) < 1) && g.some((v) => Math.abs(v - 3.4) < 1), `∇·12 = ${g.map((v) => v.toFixed(1)).join(" / ")}`);
  }
}

console.log(failures ? `\n${failures} FAIL` : "\nALL PASS");
process.exit(failures ? 1 : 0);
