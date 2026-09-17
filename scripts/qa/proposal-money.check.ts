// Synthetic check of the manual proposal's money — no browser, no database.
//   npx tsx --tsconfig tsconfig.json scripts/qa/proposal-money.check.ts
// The sheet the client sees and the lines the server stores are priced by one
// chain (markup → overhead → profit, spread into per-unit prices): the printed
// column adds up to the subtotal, "Labor + material breakdown" halves add up to
// each line, the cost sliders reach every line, and the stored line prices
// agree with the sheet to the cent (the 2026-09-17 finding: overhead and
// profit never reached the saved proposal).
import { computeTotals, bakeAdjustments } from "../../src/components/v3/manual-card-lab/manual-focus/manual-focus-math";
import type { Draft, Line } from "../../src/components/v3/manual-card-lab/manual-focus/manual-focus-types";
import { overheadProfitLoad, priceLinesForClient } from "../../src/lib/pricing/markup";

let failures = 0;
let passes = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passes++;
  else failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

const line = (id: string, name: string, unit: Line["unit"], quantity: number, materialCost: number, laborCost: number): Line => ({ id, name, description: "", unit, quantity, materialCost, laborCost });

// The Kirkland epoxy sheet: 400 sq ft of prep, coating and a fixed cleanup.
const LINES: Line[] = [
  line("a", "Diamond-grind and prep the slab", "sqft", 400, 0.35, 1.4),
  line("b", "Full flake epoxy with polyaspartic topcoat", "sqft", 400, 3.4, 4.25),
  line("c", "Masking, protection and final cleanup", "fixed", 1, 40, 260),
  line("d", "", "sqft", 100, 9, 9), // unnamed: not work yet
];

function draft(over: Partial<Draft> = {}): Draft {
  return {
    title: "Epoxy floor", description: "", projectId: "", client: { mode: "none" }, address: "", addressAuto: true,
    lines: LINES, taxPct: 6.5, taxAuto: false, taxState: "",
    materialMarkupPct: 0, laborMarkupPct: 0, overheadPct: 0, profitPct: 0,
    discountPct: 0, discountFlat: 0, discountIsPercent: true,
    scopeOfWork: "", notes: "", terms: "",
    options: { hideBreakdown: false, laborOnly: false, showSignature: true, showScope: true },
    installments: [], files: [],
    ...over,
  } as Draft;
}

const sum = (ns: number[]) => Math.round(ns.reduce((a, b) => a + b, 0) * 100) / 100;

// ── The sheet at neutral ────────────────────────────────────────────────────
{
  const t = computeTotals(draft());
  ok("Neutral: printed prices are the raw costs and the column is the subtotal", t.printed[0].unitPrice === 1.75 && t.printed[1].unitPrice === 7.65 && t.preTax === sum(t.printed.map((p) => p.amount)) && t.preTax === 4060, `$${t.preTax}`);
  ok("Materials are in the price (no labor-only mode in the blueprint)", t.baseMaterials === 1540 && t.subtotalCosts === 4060, `${t.baseMaterials} / ${t.subtotalCosts}`);
  ok("Every printed line's labor + material halves add up to its amount", t.printed.every((p) => sum([p.materialAmount, p.laborAmount]) === p.amount), t.printed.map((p) => `${p.materialAmount}+${p.laborAmount}=${p.amount}`).join(" | "));
  ok("The unnamed row prints nothing and counts for nothing", t.printed.length === 3 && t.unnamedCount === 1);
}

// ── Overhead and profit spread into the lines ───────────────────────────────
{
  const t = computeTotals(draft({ overheadPct: 10, profitPct: 10 }));
  const chain = Math.round((4060 * 1.1 * 1.1 + Number.EPSILON) * 100) / 100;
  ok("10% overhead + 10% profit: pre-tax is the chain figure, from the printed column", Math.abs(t.preTax - chain) <= 5 && t.preTax === sum(t.printed.map((p) => p.amount)), `$${t.preTax} vs chain $${chain} (cents quantised per unit)`);
  ok("Every line multiplies out: quantity × printed unit price = printed amount", t.printed.every((p) => Math.round(p.quantity * p.unitPrice * 100) / 100 === p.amount));
  ok("The breakdown halves still add to each line with the load inside them", t.printed.every((p) => sum([p.materialAmount, p.laborAmount]) === p.amount) && t.printed[1].materialAmount > 1360);
  ok("The load helper reproduces the ledger's chain", overheadProfitLoad(4060, 10, 10) === Math.round((4060 * 1.1 * 1.1 + Number.EPSILON) * 100) / 100 / 4060 && overheadProfitLoad(0, 10, 10) === 1 && overheadProfitLoad(4060, 0, 0) === 1);
}

// ── The cost sliders reach every line ───────────────────────────────────────
{
  const t = computeTotals(draft({ materialMarkupPct: 10, laborMarkupPct: -5 }));
  const prep = t.printed[0];
  ok("Materials +10%, labor −5%: the printed unit price carries both", prep.unitPrice === Math.round((0.35 * 1.1 + 1.4 * 0.95) * 100) / 100, `$${prep.unitPrice}`);
  ok("The ledger's adjustment rows say what the sliders added", t.materialsMarkup === 154 && t.laborMarkup === -126, `${t.materialsMarkup} / ${t.laborMarkup}`);
  const baked = bakeAdjustments(draft({ materialMarkupPct: 10, laborMarkupPct: -5 }));
  const t2 = computeTotals(baked);
  ok("Saving bakes the sliders into every line's costs and returns them to neutral", baked.materialMarkupPct === 0 && baked.laborMarkupPct === 0 && baked.lines[1].materialCost === 3.74 && baked.lines[1].laborCost === 4.04 && Math.abs(t2.preTax - t.preTax) < 0.05, `$${t2.preTax} after vs $${t.preTax} before`);
}

// ── The stored lines agree with the sheet ───────────────────────────────────
{
  for (const [oh, pr, mm, lm] of [[0, 0, 0, 0], [10, 10, 0, 0], [12.5, 8, 0, 0], [15, 20, 10, -5]] as const) {
    const d = draft({ overheadPct: oh, profitPct: pr, materialMarkupPct: mm, laborMarkupPct: lm });
    const t = computeTotals(d);
    // What the builder sends (payloadFromDraft): named lines, raw costs, the four rates.
    const named = d.lines.filter((l) => l.name.trim());
    const stored = priceLinesForClient(named.map((l) => ({ quantity: l.quantity, unitPrice: Math.round((l.materialCost + l.laborCost) * 100) / 100, materialCost: l.materialCost, laborCost: l.laborCost })), { materialMarkupPct: mm, laborMarkupPct: lm, overheadPct: oh, profitPct: pr });
    const subtotal = sum(stored.map((l) => l.total));
    ok(`Server pricing at overhead ${oh}% / profit ${pr}% / sliders ${mm}%,${lm}%: stored unit prices and subtotal equal the sheet's`, stored.every((l, i) => l.unitPrice === t.printed[i].unitPrice && l.total === t.printed[i].amount) && subtotal === t.preTax, `$${subtotal} vs sheet $${t.preTax}`);
  }
  const zero = priceLinesForClient([{ quantity: 3, unitPrice: 12.34, materialCost: 0, laborCost: 0 }], { materialMarkupPct: 0, laborMarkupPct: 0 });
  ok("An unsplit line at 0% keeps its raw unit price", zero[0].unitPrice === 12.34 && zero[0].total === 37.02);
  const loaded = priceLinesForClient([{ quantity: 3, unitPrice: 12.34, materialCost: 0, laborCost: 0 }], { materialMarkupPct: 0, laborMarkupPct: 0, overheadPct: 10, profitPct: 0 });
  ok("An unsplit line still takes the overhead load", loaded[0].unitPrice === 13.57, `$${loaded[0].unitPrice}`);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
