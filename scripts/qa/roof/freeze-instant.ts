/**
 * Freeze the stored EagleView Instant responses into the fixtures.
 *
 *   npx tsx scripts/qa/roof/freeze-instant.ts
 *
 * Reads them out of RoofMeasurement rows — no EagleView request is made, and
 * none can be: the response is already paid for and stored. Without this the
 * fixtures cannot reproduce the MAIN path, which is Instant-first; the mask is
 * only the fallback for addresses Instant does not cover.
 */
import { loadHarnessEnv } from "./env";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

loadHarnessEnv();

const TARGETS: Array<{ slug: string; rowId: string }> = [
  { slug: "kirkland-12629-ne-100th-pl", rowId: "cmt9bw6mv0005403bqwdngaau" },
  { slug: "prairie-419-prairie-ridge-ln", rowId: "cmt9bx0pp0007403bu14tyolh" },
];

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  for (const t of TARGETS) {
    const dir = resolve("scripts/qa/roof/fixtures", t.slug);
    if (!existsSync(dir)) {
      console.log(`${t.slug}: no fixture directory`);
      continue;
    }
    const row = await db.roofMeasurement.findUnique({ where: { id: t.rowId } });
    if (!row?.instantJson) {
      console.log(`${t.slug}: row ${t.rowId} has no stored Instant response`);
      continue;
    }
    writeFileSync(resolve(dir, "instant.json"), row.instantJson);
    const parsed = JSON.parse(row.instantJson) as { requestId?: string; totals?: { areaSqft?: number; facetCount?: number } };
    console.log(
      `${t.slug}: frozen instant.json (request ${parsed.requestId ?? "?"}) · ` +
        `${parsed.totals?.areaSqft?.toFixed(0) ?? "?"} sq ft · ${parsed.totals?.facetCount ?? "?"} facets`,
    );
  }
  await db.$disconnect();
  console.log("\nRedmond has no Instant response — see the report for why.");
}

main().catch((e) => {
  console.error("FREEZE FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
