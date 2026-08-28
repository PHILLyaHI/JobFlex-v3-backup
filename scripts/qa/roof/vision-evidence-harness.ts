/* Verify the shipped visionEvidence module on the two houses with cached AI
   reads — the same numbers the action will now record in provenance. Free. */
import { loadHarnessEnv } from "./env";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
loadHarnessEnv();
import type { InstantRoofData } from "@/lib/eagleview";
import { readRoofStructure } from "@/lib/roofDiagram/roofStructureVision";
import { buildRoofV2 } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { measurePitchFromDsm, structurePitch } from "@/lib/roofRecon/pitchFromDsm";
import { detectUnrecognisedFacets } from "@/lib/roofRecon/surgeries";
import { readVisionEvidence } from "@/lib/roofRecon/visionEvidence";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";
import { loadFixture } from "@/../scripts/qa/roof/fixture";

const HOUSES = [
  { name: "12629", fixture: "kirkland-12629-ne-100th-pl", slug: "12629-ne-100th-pl-kirkland-wa-98033" },
  { name: "419", fixture: "prairie-419-prairie-ridge-ln", slug: "419-prairie-ridge-ln-north-aurora-il-60542" },
];

(async () => {
  for (const h of HOUSES) {
    if (!existsSync(resolve(".cache/roof-diagram", `roof-structure-${h.slug}.json`))) { console.log(`${h.name}: no cached read`); continue; }
    const fx = loadFixture(h.fixture);
    const instant = JSON.parse(readFileSync(resolve("scripts/qa/roof/fixtures", h.fixture, "instant.json"), "utf8")) as InstantRoofData;
    const ground = fx.meta.diagnostics.groundElevFt as number;
    const clusters = (fx.meta.diagnostics.clusters as number) ?? null;
    const first = buildRoofV2({ instant, origin: fx.meta.origin, clusters });
    if (!first.model) continue;
    const kept = first.report.structures.filter((s) => s.ring);
    const contour = kept[0].ring as FootprintPoint[];
    const reg = registerContourToRaster({ contour, mask: fx.mask, dsm: fx.dsm, groundElevFt: ground });
    if (!reg.applied) continue;
    const measurement = measurePitchFromDsm({ model: first.model, mask: fx.mask, dsm: fx.dsm, transform: reg.transform, sectionTolerance12: 0.75 });
    const sp = structurePitch(measurement, instant.totals?.predominantPitch ?? null, {
      solarPanels: instant.structures.some((st) => st.solarPanels === true),
    });
    const model = buildRoofV2({ instant, origin: fx.meta.origin, clusters, pitchOverride12: sp.pitch12 }).model ?? first.model;
    const unrecognised = detectUnrecognisedFacets(model, measurement);
    const read = await readRoofStructure({ imagery: instant.imagery, origin: fx.meta.origin, slug: h.slug, wallRings: kept.map((s) => s.ring as FootprintPoint[]) });

    const ev = readVisionEvidence({
      contour, model, measurement,
      interior: read.interior,
      unrecognised: unrecognised.map((u) => u.facet),
      source: read.source,
      model_: read.model,
    });
    console.log(`\n=== ${h.name} ===`);
    console.log(`  AI read: ${ev.lines.ridge} ridge / ${ev.lines.hip} hip / ${ev.lines.valley} valley (${ev.model}, ${ev.source})`);
    console.log(`  agreement with the DSM: ${ev.agreement.agreed}/${ev.agreement.both} walls` + (ev.agreement.share == null ? " (never both spoke)" : ` = ${(ev.agreement.share * 100).toFixed(0)}%`));
    console.log(`  unrecognised facets: ${unrecognised.length ? unrecognised.map((u) => u.facet).join(", ") : "none"}`);
    console.log(`  corroborated by vision: ${ev.corroborated.length ? ev.corroborated.join(", ") : "none"}`);
    for (const w of ev.walls.filter((x) => x.dsm !== "silent" || x.vision !== "silent")) {
      console.log(`    e${w.edge} ${w.lengthFt.toFixed(1)} ft (${w.facet ?? "—"}): dsm ${w.dsm} · vision ${w.vision}`);
    }
  }
})();
