// Adds the Lead Center columns of 2026-10-03 to production (lead-center-columns.sql).
//
//   npx tsx --tsconfig tsconfig.json scripts/ops/lead-center-columns.ts --prod           (dry run: what exists)
//   npx tsx --tsconfig tsconfig.json scripts/ops/lead-center-columns.ts --prod --apply   (add what is missing)
//
// --prod reads C:\Users\ivana\Downloads\prod-db-url.txt and deletes it at once
// (scripts/billing/_prod.ts) — each run needs the file again, so a single
// `--apply` run is the usual one: it prints what exists, adds what is missing
// (ADD COLUMN IF NOT EXISTS, idempotent), and prints the columns again.
// Run it BEFORE deploying: the app reads these columns on every query of
// Organization and PlatformLead, and the Vercel build does not push the schema.
import fs from "node:fs";
import path from "node:path";
import { openEnvironment, ROOT } from "../billing/_prod";

const PROD = process.argv.includes("--prod");
const APPLY = process.argv.includes("--apply");
if (!PROD) {
  console.error("Postgres only: run with --prod (the local SQLite database gets the columns from `prisma db push`).");
  process.exit(2);
}
const env = openEnvironment({ prod: true, out: path.join(ROOT, ".cache/ops"), allowLiveWrites: false });

const WANT = [
  { table: "Organization", column: "serviceRadiusMiles" },
  { table: "Organization", column: "isInternal" },
  { table: "PlatformLead", column: "isTest" },
];

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client");
  const db = new PrismaClient();
  console.log(`database: ${env.where}${APPLY ? "  · APPLY" : "  · dry run"}`);

  const present = async () => {
    const rows = await db.$queryRawUnsafe<{ table_name: string; column_name: string; data_type: string; column_default: string | null }[]>(
      `SELECT table_name, column_name, data_type, column_default FROM information_schema.columns
       WHERE table_schema = current_schema() AND ((table_name = 'Organization' AND column_name IN ('serviceRadiusMiles','isInternal'))
          OR (table_name = 'PlatformLead' AND column_name = 'isTest'))`,
    );
    for (const w of WANT) {
      const r = rows.find((x) => x.table_name === w.table && x.column_name === w.column);
      console.log(`  ${w.table}.${w.column}: ${r ? `present (${r.data_type}, default ${r.column_default})` : "MISSING"}`);
    }
    return rows.length;
  };

  console.log("before:");
  const n = await present();
  if (!APPLY) {
    console.log(n === WANT.length ? "\nall present — nothing to do." : "\ndry run — re-run with --apply.");
    await db.$disconnect();
    return;
  }
  const sql = fs
    .readFileSync(path.join(ROOT, "scripts/ops/lead-center-columns.sql"), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  await db.$transaction(sql.map((s) => db.$executeRawUnsafe(s)));
  console.log("\nafter:");
  const m = await present();
  console.log(m === WANT.length ? "\nCOMMITTED — all three columns present." : "\nSOMETHING IS MISSING — see above.");
  await db.$disconnect();
  if (m !== WANT.length) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
