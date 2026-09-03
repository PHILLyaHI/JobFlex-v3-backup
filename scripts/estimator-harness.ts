// Estimator harness — run the Smart Proposal's estimate call outside the app.
//
//   npx tsx scripts/estimator-harness.ts "<brief>" [model] [--no-admin]
//
// Prints the prompt size, the line items the old parser produced, and the
// material / labor / total sums, so a prompt or model change can be judged
// against the previous JobFlex's output without clicking through the UI or
// spending a plan quota. Reads OPENAI_API_KEY / OPENAI_MODEL from .env.local.

import { readFileSync } from "node:fs";
import { buildLegacyEstimatePrompt, legacyEstimateFromText, LEGACY_SYSTEM_MESSAGE } from "../src/lib/estimate/legacy-estimate";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const brief = process.argv[2] ?? "Replace 2400 sqft architectural shingle roof — tear-off, ridge vents, ice & water shield. Bothell, WA.";
const model = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const noAdmin = process.argv.includes("--no-admin");

async function main() {
  const { specialty, prompt } = buildLegacyEstimatePrompt(
    { description: brief, location: null, qualityTier: "standard" },
    { withTradeRules: process.env.HARNESS_EXTRA === "1" },
  );
  const finalPrompt = noAdmin ? prompt.slice(prompt.indexOf(specialty.promptPreamble.trim())) : prompt;
  console.log(`specialty=${specialty.id} model=${model} prompt=${finalPrompt.length}ch admin=${!noAdmin}`);
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: LEGACY_SYSTEM_MESSAGE },
      { role: "user", content: finalPrompt },
    ],
    response_format: { type: "json_object" },
  };
  if (process.env.HARNESS_TEMP === "1" || !/^(gpt-5|o[1-9])/.test(model)) Object.assign(body, { temperature: 0, seed: 42 });
  const t0 = Date.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify(body),
  });
  const json: any = await res.json();
  if (!res.ok) {
    console.log("ERROR", res.status, JSON.stringify(json.error).slice(0, 300));
    return;
  }
  const text = json.choices?.[0]?.message?.content ?? "{}";
  const est = legacyEstimateFromText(text, specialty);
  console.log(`${Math.round((Date.now() - t0) / 1000)}s · usage ${JSON.stringify(json.usage)}`);
  console.log(`title: ${est.title} · ${est.items.length} lines · warnings ${est.warnings.join("|") || "none"}`);
  let mat = 0, lab = 0;
  for (const it of est.items) {
    const m = it.quantity * it.materialUnitPrice, l = it.quantity * it.laborUnitPrice;
    mat += m; lab += l;
    console.log(`  ${it.name.slice(0, 90)} | ${it.quantity} ${it.unit} | mat $${it.materialUnitPrice} | lab $${it.laborUnitPrice} | $${Math.round(m + l)}`);
  }
  console.log(`materials $${Math.round(mat)} · labor $${Math.round(lab)} · subtotal $${Math.round(mat + lab)} · overhead ${est.overheadPct}% profit ${est.profitPct}%`);
}
main().catch((e) => { console.error(e); process.exit(1); });
