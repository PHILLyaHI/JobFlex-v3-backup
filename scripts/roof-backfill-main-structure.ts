// Backfill the Recent-list columns of saved roof measurements to the
// main-structure rule (audit 2026-09-08): areaSqft / squares / facetCount from
// the main structure of the stored Instant answer, predominantPitch as the
// page shows it (measured families when the stored provenance has them, else
// EagleView's published figure for that structure). Nothing is fetched:
// EagleView is not called, the stored instantJson and provenanceJson are the
// only inputs.
//
//   npx tsx --env-file=.env.local scripts/roof-backfill-main-structure.ts          # dry run
//   npx tsx --env-file=.env.local scripts/roof-backfill-main-structure.ts --apply  # write
//
// Left alone: rows without a provenance object (there is nothing to derive
// the pitch from), rows built by the previous calibrated pipeline (their
// figures are the calibrated model's, not Instant's), rows without an Instant
// answer, and rows whose columns already match the rule. Safe to re-run.
import { db } from "@/lib/db";
import type { InstantRoofData } from "@/lib/eagleview";
import { foreignIndices, pickMainStructure, rowFigures } from "@/lib/roofDiagram/instantTotals";

const apply = process.argv.includes("--apply");

function parcelKnownFrom(instant: InstantRoofData): boolean {
  // The lot mask is built from EagleView's masked/clear ortho pair; when the
  // answer carries one, the live run had a parcel to judge with.
  const orthos = instant.imagery.filter((im) => im.view === "ortho" && typeof im.masked === "boolean");
  return orthos.some((im) => im.masked) && orthos.some((im) => !im.masked);
}

async function main() {
  const rows = await db.roofMeasurement.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true, address: true, city: true, lat: true, lng: true, areaSqft: true, squares: true, predominantPitch: true, facetCount: true, instantJson: true, provenanceJson: true },
  });
  let changed = 0;
  const skipped: Record<string, number> = {};
  const skip = (why: string) => { skipped[why] = (skipped[why] ?? 0) + 1; };
  for (const r of rows) {
    if (!r.provenanceJson) { skip("no provenance"); continue; }
    let stored: { calibration?: unknown; provenance?: Record<string, unknown> };
    try { stored = JSON.parse(r.provenanceJson); } catch { skip("provenance unreadable"); continue; }
    const prov = stored.provenance;
    if (!prov || typeof prov !== "object") { skip("no provenance"); continue; }
    if (stored.calibration) { skip("previous pipeline (calibrated)"); continue; }
    if (!r.instantJson) { skip("no Instant answer"); continue; }
    let instant: InstantRoofData;
    try { instant = JSON.parse(r.instantJson); } catch { skip("Instant unreadable"); continue; }
    if (!instant.structures?.length) { skip("no structures"); continue; }

    const veto = prov.parcelVeto as { foreignStructures?: string[] } | undefined;
    const pick = pickMainStructure(instant.structures, {
      foreign: foreignIndices(veto?.foreignStructures),
      origin: r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null,
      parcelKnown: parcelKnownFrom(instant),
    });
    if (pick.index == null) { skip("no main structure"); continue; }
    const others = instant.structures.filter((_, i) => i !== pick.index);
    // The page's rule, whole (lib/roofDiagram/instantTotals.rowFigures): the
    // main structure's area / squares / facet count and the pitch as shown.
    // Second pass 2026-09-09: the drawn figures of the Aug 26-31 pipelines
    // (2,413 sq ft / 16 facets for a 2,326 sq ft answer) are no longer kept
    // — the page shows the answer, so the list and the columns do too.
    const fig = rowFigures({
      instant,
      provenance: { ...prov, mainStructure: { index: pick.index } },
      columns: { areaSqft: r.areaSqft, squares: r.squares, lat: r.lat, lng: r.lng },
    });
    const next = { areaSqft: fig.areaSqft, squares: fig.squares, facetCount: fig.facetCount, predominantPitch: fig.predominantPitch };
    const same =
      Math.abs((r.areaSqft ?? -1) - (next.areaSqft ?? -1)) < 0.01 &&
      Math.abs((r.squares ?? -1) - (next.squares ?? -1)) < 0.001 &&
      (r.facetCount ?? null) === (next.facetCount ?? null) &&
      (r.predominantPitch ?? null) === (next.predominantPitch ?? null);
    const mainStructure = {
      index: pick.index,
      how: pick.how,
      others: others.length,
      othersSqft: Math.round(others.reduce((a, s) => a + (s.areaSqft ?? 0), 0)),
      backfilledAt: new Date().toISOString(),
    };
    const when = String(r.createdAt).slice(4, 15);
    if (same && prov.mainStructure) { skip("already right"); continue; }
    if (same) {
      console.log(`  = ${when} ${r.address}, ${r.city}: columns already match (main s${pick.index}, ${pick.how}) — provenance.mainStructure ${apply ? "written" : "would be written"}`);
    } else {
      console.log(
        `  * ${when} ${r.address}, ${r.city}: area ${r.areaSqft?.toFixed(0)} → ${next.areaSqft?.toFixed(0)} | squares ${r.squares?.toFixed(1)} → ${next.squares?.toFixed(1)} | pitch ${r.predominantPitch ?? "—"} → ${next.predominantPitch ?? "—"} | facets ${r.facetCount ?? "—"} → ${next.facetCount ?? "—"} (main s${pick.index}, ${pick.how}, ${others.length} others)`,
      );
    }
    changed++;
    if (apply) {
      await db.roofMeasurement.update({
        where: { id: r.id },
        data: { ...next, provenanceJson: JSON.stringify({ ...stored, provenance: { ...prov, mainStructure } }) },
      });
    }
  }
  console.log(`\n${apply ? "updated" : "would update"} ${changed} row(s); skipped:`, JSON.stringify(skipped));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
