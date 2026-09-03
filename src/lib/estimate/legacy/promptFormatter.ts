/**
 * Format PriceBook data into a structured text block for AI prompt injection.
 *
 * The AI receives concrete per-unit prices grouped by category so it can
 * anchor its estimates to real market data instead of vague ranges.
 *
 * The synchronous variants below operate on whatever PriceBook entries you
 * pass in. Prefer the `formatPriceBookForPromptLive` helpers for runtime
 * code — they fetch BLS-adjusted prices from Redis before formatting.
 */

import { PRICE_BOOK, type MaterialCategory, type PriceBookEntry } from "./PriceBook";

/** Human-readable category labels */
const CATEGORY_LABELS: Record<MaterialCategory, string> = {
  EPOXY_FLOORING: "EPOXY FLOORING",
  CONCRETE: "CONCRETE & ASPHALT",
  LUMBER: "LUMBER & FRAMING",
  PLUMBING: "PLUMBING",
  ELECTRICAL: "ELECTRICAL",
  PAINT: "PAINT & FINISHES",
  TILE_FLOORING: "TILE & FLOORING",
  CABINETS: "CABINETS & COUNTERTOPS",
  APPLIANCE: "APPLIANCES",
  HVAC: "HVAC",
  ROOFING: "ROOFING",
  RENTAL: "EQUIPMENT RENTAL",
  GENERAL: "GENERAL CONSUMABLES",
};

/** Category display order (most important first) */
const CATEGORY_ORDER: MaterialCategory[] = [
  "EPOXY_FLOORING",
  "CONCRETE",
  "TILE_FLOORING",
  "CABINETS",
  "PLUMBING",
  "ELECTRICAL",
  "LUMBER",
  "PAINT",
  "APPLIANCE",
  "HVAC",
  "ROOFING",
  "RENTAL",
  "GENERAL",
];

function formatPrice(val: number): string {
  if (val >= 1) return `$${val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  return `$${val.toFixed(2)}`;
}

function formatEntry(entry: PriceBookEntry): string {
  const name = entry.keywords.slice(0, 2).join(" / ");
  const range = `${formatPrice(entry.priceLow)}-${formatPrice(entry.priceHigh)}/${entry.unit}`;
  const avg = `avg ${formatPrice(entry.priceAvg)}`;
  const note = entry.notes ? ` — ${entry.notes}` : "";
  return `  - ${name}: ${range} (${avg})${note}`;
}

/**
 * Format the entire PriceBook as a prompt-injectable text block.
 *
 * @param categories  Optional filter — only include these categories.
 *                    Pass undefined/null to include all.
 * @param book        Optional explicit PriceBook to format. Defaults to the
 *                    static PRICE_BOOK. Pass an adjusted book here if you've
 *                    already loaded BLS multipliers and want to inject them.
 */
export function formatPriceBookForPrompt(
  categories?: MaterialCategory[] | null,
  book: PriceBookEntry[] = PRICE_BOOK,
): string {
  const lines: string[] = [
    "=== MATERIAL & LABOR PRICE REFERENCE (US Market Data — use as baseline) ===",
    "",
    "IMPORTANT: Use these unit prices as your PRIMARY reference when calculating material_cost and labor_cost.",
    "Multiply unit price × quantity to get line item costs. Do NOT invent prices outside these ranges",
    "unless the specific item is not listed below.",
    "",
  ];

  // Group entries by category
  const grouped = new Map<MaterialCategory, PriceBookEntry[]>();
  for (const entry of book) {
    if (categories && !categories.includes(entry.category)) continue;
    if (!grouped.has(entry.category)) grouped.set(entry.category, []);
    grouped.get(entry.category)!.push(entry);
  }

  // Emit in display order
  for (const cat of CATEGORY_ORDER) {
    const entries = grouped.get(cat);
    if (!entries || entries.length === 0) continue;

    lines.push(`${CATEGORY_LABELS[cat]}:`);
    for (const entry of entries) {
      lines.push(formatEntry(entry));
    }
    lines.push("");
  }

  lines.push("=== END PRICE REFERENCE ===");
  return lines.join("\n");
}

/**
 * Async variant — pulls the latest BLS-adjusted PriceBook from Redis before
 * formatting. Use this from API routes; the sync variant is fine for tests
 * and offline tooling.
 *
 *  Note: we deliberately do NOT inject the snapshot timestamp into the prompt.
 *  The same project description should produce the same estimate, and any
 *  varying string (a date, a request id, an iso timestamp) in the prompt
 *  body breaks OpenAI's `seed` determinism — the same logical input has to
 *  hash to byte-identical bytes for the seed to reproduce. Snapshot
 *  metadata belongs in logs / response headers, not in the model's input.
 */
/**
 * Get a compact version (fewer lines) suitable for token-constrained prompts.
 * Only includes the avg price per entry, grouped by category.
 */
export function formatPriceBookCompact(): string {
  const lines: string[] = [
    "=== PRICE REFERENCE (avg unit prices, US market) ===",
  ];

  const grouped = new Map<MaterialCategory, PriceBookEntry[]>();
  for (const entry of PRICE_BOOK) {
    if (!grouped.has(entry.category)) grouped.set(entry.category, []);
    grouped.get(entry.category)!.push(entry);
  }

  for (const cat of CATEGORY_ORDER) {
    const entries = grouped.get(cat);
    if (!entries || entries.length === 0) continue;

    const items = entries.map((e) => {
      const name = e.keywords[0];
      return `${name}: ${formatPrice(e.priceAvg)}/${e.unit}`;
    });

    lines.push(`${CATEGORY_LABELS[cat]}: ${items.join(", ")}`);
  }

  lines.push("=== END ===");
  return lines.join("\n");
}
