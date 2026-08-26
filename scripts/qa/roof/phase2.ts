/**
 * Phase 2 acceptance harness — the Instant path, offline.
 *
 *   npx tsx scripts/qa/roof/phase2.ts            both Instant fixtures
 *   npx tsx scripts/qa/roof/phase2.ts kirkland   one, by slug substring
 *
 * Runs the contour through the phase-1 regularisation, grows the skeleton, and
 * reports every acceptance number: both validators (the reference .mjs and the
 * in-app port, which must agree), Euler, the facet table, the area check
 * against the REGULARISED contour, and the facet count against Instant's.
 * Writes roof-v2.svg next to each fixture.
 *
 * No network: Instant comes from the frozen instant.json, nothing else is
 * needed — phase 2 builds topology, and heights arrive in phase 3.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { InstantRoofData, RoofModel, RoofPoint } from "../../../src/lib/eagleview";
import { buildIndexes, ringOf } from "../../../src/components/estimator/roof/roofGeometry";
import { validateRoofInvariants } from "../../../src/lib/roofDiagram/validate";
import { areaOf, type FootprintPoint } from "../../../src/lib/roofRecon/footprint";
import { buildRoofV2 } from "../../../src/lib/roofRecon/reconV2";
import { fixtureSlugs, loadFixture } from "./fixture";

const filter = process.argv.slice(2).find((a) => !a.startsWith("--"));

/** RoofModel → the reference validator's schema. The footprint is the REAL
 *  regularised contour, not the bounding box the fixture dump uses, so R05
 *  (contour coverage) and R18 actually mean something here. */
function toValidatorSchema(model: RoofModel, footprint: FootprintPoint[]): unknown {
  const idx = buildIndexes(model);
  const verts: number[][] = [];
  const seen = new Map<string, number>();
  const vid = (p: RoofPoint): number => {
    const k = `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
    if (!seen.has(k)) {
      seen.set(k, verts.length);
      verts.push([+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]);
    }
    return seen.get(k) as number;
  };
  const facets: Array<{ id: string; pitch: number; v: number[] }> = [];
  for (const f of model.faces) {
    const ring = ringOf(f.lineIds, idx);
    if (!ring || ring.length < 3) continue;
    facets.push({ id: String(f.designator || f.id), pitch: Number(f.pitch) || 0, v: ring.map(vid) });
  }
  return {
    material: "asphalt",
    footprint: footprint.map((p) => [+p.x.toFixed(3), +p.y.toFixed(3)]),
    vertices: verts,
    facets,
  };
}

function runMjs(file: string): { text: string; errors: number; warnings: number } {
  let text = "";
  try {
    text = execFileSync(process.execPath, [resolve("scripts/qa/roof/validate-roof.mjs"), file], { encoding: "utf8" });
  } catch (e) {
    text = String((e as { stdout?: string }).stdout ?? "");
  }
  const m = text.match(/(\d+)\s+ошибок,\s*(\d+)\s+предупреждений/);
  return { text, errors: m ? Number(m[1]) : -1, warnings: m ? Number(m[2]) : -1 };
}

/** V − E + F over the plan graph, the same count R07 makes. */
function euler(model: RoofModel): { v: number; e: number; f: number; chi: number } {
  const key = (p: { x: number; y: number }) => `${Math.round(p.x / 0.05)}|${Math.round(p.y / 0.05)}`;
  const pts = new Map(model.points.map((p) => [p.id, p]));
  const verts = new Set<string>();
  const edges = new Set<string>();
  for (const l of model.lines) {
    const a = pts.get(l.aId);
    const b = pts.get(l.bId);
    if (!a || !b) continue;
    verts.add(key(a));
    verts.add(key(b));
    edges.add([key(a), key(b)].sort().join("#"));
  }
  const v = verts.size;
  const e = edges.size;
  const f = model.faces.length;
  return { v, e, f, chi: v - e + f };
}

function svg(model: RoofModel, contour: FootprintPoint[], file: string): void {
  const idx = buildIndexes(model);
  const all = [...contour, ...model.points.map((p) => ({ x: p.x, y: p.y }))];
  const x0 = Math.min(...all.map((p) => p.x)) - 6;
  const x1 = Math.max(...all.map((p) => p.x)) + 6;
  const y0 = Math.min(...all.map((p) => p.y)) - 6;
  const y1 = Math.max(...all.map((p) => p.y)) + 6;
  const S = 900 / (x1 - x0);
  const W = Math.round((x1 - x0) * S);
  const H = Math.round((y1 - y0) * S);
  const X = (x: number) => ((x - x0) * S).toFixed(1);
  const Y = (y: number) => ((y1 - y) * S).toFixed(1);
  const COLOR: Record<string, string> = {
    EAVE: "#1b6ef3", RIDGE: "#e5484d", HIP: "#f5a524", VALLEY: "#12a594", RAKE: "#8e4ec6",
  };
  const parts: string[] = [
    `<polygon points="${contour.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ")}" fill="#f4f4f5" stroke="#a1a1aa" stroke-width="1" stroke-dasharray="5 4"/>`,
  ];
  for (const f of model.faces) {
    const ring = ringOf(f.lineIds, idx);
    if (!ring || ring.length < 3) continue;
    parts.push(
      `<polygon points="${ring.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ")}" fill="#ffffff" fill-opacity="0.75" stroke="none"/>`,
    );
    const cx = ring.reduce((s, p) => s + p.x, 0) / ring.length;
    const cy = ring.reduce((s, p) => s + p.y, 0) / ring.length;
    parts.push(
      `<text x="${X(cx)}" y="${Y(cy)}" font-family="ui-monospace,monospace" font-size="11" fill="#3f3f46" text-anchor="middle">${f.designator || f.id}</text>`,
      `<text x="${X(cx)}" y="${(+Y(cy) + 12).toFixed(1)}" font-family="ui-monospace,monospace" font-size="9" fill="#71717a" text-anchor="middle">${Number(f.pitch)}/12 · ${f.areaSqft.toFixed(0)}</text>`,
    );
  }
  const pts = new Map(model.points.map((p) => [p.id, p]));
  for (const l of model.lines) {
    const a = pts.get(l.aId);
    const b = pts.get(l.bId);
    if (!a || !b) continue;
    parts.push(
      `<line x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}" stroke="${COLOR[l.type] ?? "#71717a"}" stroke-width="${l.type === "EAVE" ? 2.5 : 2}" stroke-linecap="round"/>`,
    );
  }
  const legend = Object.entries(COLOR)
    .map(([k, v], i) => `<rect x="${10 + i * 78}" y="${H - 22}" width="12" height="3" fill="${v}"/><text x="${26 + i * 78}" y="${H - 16}" font-family="ui-monospace,monospace" font-size="10" fill="#52525b">${k}</text>`)
    .join("");
  writeFileSync(
    file,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${parts.join("")}${legend}</svg>`,
  );
}

function main(): void {
  let blocking = 0;
  for (const slug of fixtureSlugs(filter)) {
    const dir = resolve("scripts/qa/roof/fixtures", slug);
    const instFile = resolve(dir, "instant.json");
    if (!existsSync(instFile)) {
      console.log(`\n======== ${slug} ========\n   no Instant response — not part of phase 2`);
      continue;
    }
    const fx = loadFixture(slug);
    const instant = JSON.parse(readFileSync(instFile, "utf8")) as InstantRoofData;
    const clusters = (fx.meta.diagnostics.clusters as number) ?? null;
    const acceptance = slug.includes("kirkland");

    console.log(`\n================ ${slug} ${acceptance ? "(ACCEPTANCE)" : "(shown, not blocking)"} ================`);
    const { model, report } = buildRoofV2({ instant, origin: fx.meta.origin, clusters });

    for (const s of report.structures) {
      const r = s.regularize;
      console.log(
        `\n[${s.prefix}] contour ${s.instantAreaSqft.toFixed(0)} sq ft, ${r.vertices} v after regularisation` +
          ` (Instant sent ${instant.structures[0]?.outline?.length ?? "?"} points)`,
      );
      console.log(
        `     family ${(r.familyShare * 100).toFixed(1)}% (axis ${r.axisDeg.toFixed(1)}°, worst edge ${r.worstAngleDeviationDeg.toFixed(1)}° off)` +
          ` · vertices ≤ 64 ${s.contourEdges <= 64 ? "PASS" : "FAIL"} · family ≥ 85% ${r.asserts.angles ? "PASS" : "FAIL"}`,
      );
      console.log(
        `     area ${r.rawAreaSqft.toFixed(0)} → ${r.areaSqft.toFixed(0)} sq ft (${(((r.areaSqft - r.rawAreaSqft) / r.rawAreaSqft) * 100).toFixed(2)}%)` +
          ` · max corner shift ${r.maxCornerShiftFt.toFixed(2)} ft`,
      );
      if (r.staircaseEdgesRemoved.length) {
        console.log(`     effect test (off family): ${r.staircaseEdgesRemoved.map((e) => `${e.lengthFt.toFixed(1)} ft @ ${e.offDeg.toFixed(1)}° (shift ${e.shiftFt.toFixed(2)} ft, area ${(e.areaShare * 100).toFixed(2)}%)`).join("; ")}`);
      }
      if (r.budgetEdgesRemoved.length) {
        console.log(`     effect test (vertex budget): ${r.budgetEdgesRemoved.map((e) => `${e.lengthFt.toFixed(1)} ft (shift ${e.shiftFt.toFixed(2)} ft, area ${(e.areaShare * 100).toFixed(2)}%)`).join("; ")}`);
      }
      if (r.offFamily.length) console.log(`     left off family: ${r.offFamily.map((e) => `${e.lengthFt.toFixed(1)} ft @ ${e.offDeg.toFixed(1)}°`).join("; ")}`);
      console.log(`     clusters ${s.clusters ?? "n/a"} vs ${s.contourEdges} contour edges → ${s.multiMass ? "MULTI-MASS" : "single mass"}`);
      for (const n of s.notes) console.log(`     ! ${n}`);
    }
    for (const r of report.reasons) console.log(`   ! ${r}`);
    for (const f of report.synthesizeFailed) console.log(`   ! synthesize: ${f}`);

    if (!model) {
      console.log("\n   NO MODEL");
      if (acceptance) blocking++;
      continue;
    }

    const contour = report.structures[0].ring ?? [];
    const idx = buildIndexes(model);
    const rows = model.faces
      .map((f) => {
        const ring = ringOf(f.lineIds, idx);
        const plan = ring && ring.length >= 3 ? areaOf(ring.map((p) => ({ x: p.x, y: p.y }))) : 0;
        return { id: String(f.designator || f.id), pitch: Number(f.pitch), plan, sloped: f.areaSqft, verts: ring?.length ?? 0 };
      })
      .sort((a, b) => a.plan - b.plan);
    console.log(`\n   facet table (${rows.length} facets)`);
    console.log("   id      pitch   plan sq ft   sloped sq ft   verts");
    for (const r of rows) {
      console.log(
        `   ${r.id.padEnd(7)} ${String(r.pitch).padStart(2)}/12 ${r.plan.toFixed(1).padStart(11)} ${r.sloped.toFixed(1).padStart(14)} ${String(r.verts).padStart(7)}` +
          (r.plan < 20 ? "   <-- under 20 sq ft" : ""),
      );
    }
    const planSum = rows.reduce((s, r) => s + r.plan, 0);
    const contourArea = areaOf(contour);
    const areaDelta = contourArea > 0 ? (planSum - contourArea) / contourArea : 1;
    const eu = euler(model);
    const instantFacets = instant.totals?.facetCount ?? 0;
    const facetDelta = Math.abs(model.faces.length - instantFacets);
    const tiniest = rows.length ? rows[0].plan : 0;

    const valFile = resolve(dir, "roof-v2-validator.json");
    writeFileSync(valFile, JSON.stringify(toValidatorSchema(model, contour), null, 1));
    const mjs = runMjs(valFile);
    const port = validateRoofInvariants(model, { footprint: contour.map((p) => [p.x, p.y] as [number, number]) });
    svg(model, contour, resolve(dir, "roof-v2.svg"));

    console.log(`\n   ---- reference validator (validate-roof.mjs) ----`);
    console.log(mjs.text.trimEnd().split("\n").map((l) => "   " + l).join("\n"));
    console.log(`\n   ---- in-app port (validateRoofInvariants) ----`);
    console.log(`   ${port.errors} errors / ${port.warnings} warnings · codes: ${port.errorCodes.join(", ") || "none"}`);
    const agree = mjs.errors === port.errors && mjs.warnings === port.warnings;
    console.log(`   validators ${agree ? "agree" : `DIVERGED (.mjs ${mjs.errors}/${mjs.warnings} vs port ${port.errors}/${port.warnings})`}`);

    const r07 = port.results.filter((f) => f.id === "R07" && f.level === "error").length;
    const r12 = port.results.filter((f) => f.id === "R12" && f.level === "error").length;
    const r01 = port.results.filter((f) => (f.id === "R01" || f.id === "R02") && f.level === "error").length;
    // R12's rule (arctan(pB/pA), 45° at equal pitches) only holds at a SQUARE
    // corner; at 135° the hip must bisect and run at 67.5°, which the rule
    // calls an error. So it is asked only of a rectilinear contour — the
    // wording defect is phase 5.
    const rectilinear = contour.every((p, i) => {
      const a = contour[(i - 1 + contour.length) % contour.length];
      const c = contour[(i + 1) % contour.length];
      let turn = ((Math.atan2(c.y - p.y, c.x - p.x) - Math.atan2(p.y - a.y, p.x - a.x)) * 180) / Math.PI;
      while (turn > 180) turn -= 360;
      while (turn < -180) turn += 360;
      return Math.abs(Math.abs(turn) - 90) < 2;
    });
    const structureCount = report.structures.filter((st) => st.ring).length;
    const checks: Array<{ name: string; ok: boolean; detail: string }> = [
      { name: "Euler = 1 per structure", ok: eu.chi === structureCount, detail: `V ${eu.v} − E ${eu.e} + F ${eu.f} = ${eu.chi} (${structureCount} structure(s))` },
      { name: "|Σ plan − contour| < 0.5%", ok: Math.abs(areaDelta) < 0.005, detail: `Σ ${planSum.toFixed(1)} vs contour ${contourArea.toFixed(1)} = ${(areaDelta * 100).toFixed(2)}%` },
      { name: "R07 zero errors", ok: r07 === 0, detail: `${r07} error(s)` },
      {
        name: "R12 zero on square corners",
        ok: !rectilinear || r12 === 0,
        detail: rectilinear ? `${r12} error(s)` : `${r12} error(s) — contour not rectilinear, not asked (phase 5)`,
      },
      { name: "no degenerate/crossing facet", ok: r01 === 0, detail: `${r01} R01/R02 error(s)` },
      { name: "validators agree", ok: agree, detail: agree ? "yes" : "no" },
    ];
    // facetCount is a DETECTOR, not a criterion: it means a different thing in
    // each direction. Prairie reports 22 against a 12-edge contour because
    // Instant counts interior planes; Kirkland reports 10 against 16 sides
    // because EagleView traces the building more coarsely than we regularise.
    // One number, two meanings — nothing to measure acceptance against.
    const detector =
      !instantFacets
        ? "no Instant facet count"
        : facetDelta <= 2
          ? "agrees"
          : model.faces.length < instantFacets
            ? "MULTI-MASS — interior structure the outer contour cannot carry"
            : "COARSE OUTLINE — Instant traces with fewer sides than we regularise to";
    console.log(`\n   ---- acceptance ----`);
    for (const c of checks) console.log(`   ${c.ok ? "PASS" : "FAIL"}  ${c.name.padEnd(30)} ${c.detail}`);
    console.log(`   ----  facetCount detector       ${model.faces.length} facets vs Instant ${instantFacets}: ${detector}`);
    console.log(`   ----  smallest facet            ${tiniest.toFixed(1)} sq ft (logged, not a gate: a 3.4×4.3 ft bay legitimately makes ~15)`);
    const failed = checks.filter((c) => !c.ok).length;
    if (acceptance && failed) blocking += failed;
    if (!acceptance && failed) console.log(`   (${failed} not met — multi-mass roof, not blocking by decision)`);
    console.log(`   svg → ${resolve(dir, "roof-v2.svg")}`);
  }

  console.log(blocking ? `\nPHASE 2 NOT ACCEPTED — ${blocking} blocking check(s) failed` : "\nPHASE 2 ACCEPTED");
  if (blocking) process.exitCode = 1;
}

main();
