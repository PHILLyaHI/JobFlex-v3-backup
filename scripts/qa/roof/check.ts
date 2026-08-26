/**
 * QA gate for the roof generator. Runs both validators over every frozen
 * fixture and fails the process when any of them reports an error.
 *
 *   npx tsx scripts/qa/roof/check.ts            all fixtures
 *   npx tsx scripts/qa/roof/check.ts kirkland   one, by slug substring
 *   npx tsx scripts/qa/roof/check.ts --baseline record today's counts as the
 *                                              accepted baseline
 *
 * Two validators on purpose:
 *   • validate-roof.mjs — the reference implementation (zero deps, CI-friendly)
 *   • validateRoofInvariants (src/lib/roofDiagram/validate.ts) — the same rules
 *     inside the app, so the drawing can refuse to render a broken roof
 * They must agree; a divergence means the port drifted and is reported as such.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { RoofModel } from "../../../src/lib/eagleview";
import { validateRoofInvariants } from "../../../src/lib/roofDiagram/validate";

const FIXTURES = resolve("scripts/qa/roof/fixtures");
const BASELINE = resolve("scripts/qa/roof/baseline.json");
const args = process.argv.slice(2);
const RECORD = args.includes("--baseline");
const filter = args.find((a) => !a.startsWith("--"));

interface Counts {
  errors: number;
  warnings: number;
}

function runMjs(file: string): Counts {
  let text = "";
  try {
    text = execFileSync(process.execPath, [resolve("scripts/qa/roof/validate-roof.mjs"), file], {
      encoding: "utf8",
    });
  } catch (e) {
    // exit code 1 just means "errors found" — the output is still on stdout
    text = String((e as { stdout?: string }).stdout ?? "");
  }
  const m = text.match(/(\d+)\s+ошибок,\s*(\d+)\s+предупреждений/);
  return m ? { errors: Number(m[1]), warnings: Number(m[2]) } : { errors: -1, warnings: -1 };
}

function main(): void {
  if (!existsSync(FIXTURES)) {
    console.error("no fixtures — run: npx tsx scripts/qa/roof/dump-fixtures.ts");
    process.exit(2);
  }
  const slugs = readdirSync(FIXTURES).filter((s) => !filter || s.includes(filter));
  const baseline: Record<string, Counts> = existsSync(BASELINE)
    ? (JSON.parse(readFileSync(BASELINE, "utf8")) as Record<string, Counts>)
    : {};
  const recorded: Record<string, Counts> = {};
  let failed = 0;

  for (const slug of slugs) {
    const dir = resolve(FIXTURES, slug);
    const modelFile = resolve(dir, "model.json");
    const valFile = resolve(dir, "validator.json");
    if (!existsSync(modelFile) || !existsSync(valFile)) continue;
    const model = JSON.parse(readFileSync(modelFile, "utf8")) as RoofModel;

    const mjs = runMjs(valFile);
    const port = validateRoofInvariants(model);
    recorded[slug] = { errors: mjs.errors, warnings: mjs.warnings };

    const agree = mjs.errors === port.errors && mjs.warnings === port.warnings;
    const base = baseline[slug];
    const drift = base && (base.errors !== mjs.errors || base.warnings !== mjs.warnings);

    console.log(
      `${slug.padEnd(30)} .mjs ${String(mjs.errors).padStart(3)} err / ${String(mjs.warnings).padStart(2)} warn` +
        ` · port ${String(port.errors).padStart(3)} err / ${String(port.warnings).padStart(2)} warn` +
        ` · ${agree ? "agree" : "DIVERGED"}` +
        (base ? ` · baseline ${base.errors}/${base.warnings}${drift ? " CHANGED" : ""}` : ""),
    );
    if (!agree) {
      failed++;
      console.log(`   port codes: ${port.errorCodes.join(", ") || "none"}`);
    }
    if (drift) failed++;
  }

  if (RECORD) {
    writeFileSync(BASELINE, JSON.stringify(recorded, null, 1));
    console.log(`\nbaseline recorded → ${BASELINE}`);
    return;
  }
  if (failed) {
    console.error(`\nQA ROOF GATE FAILED (${failed} issue(s))`);
    process.exit(1);
  }
  console.log("\nQA roof gate: validators agree with the recorded baseline");
}

main();
