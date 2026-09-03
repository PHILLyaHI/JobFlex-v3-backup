import type { AiSpecialty } from "./specialties";
import { formatSpecialtyMaterialProfile, priceBookCategoriesForSpecialty } from "./specialtyMaterialMap";
import { formatPriceBookForPrompt } from "./promptFormatter";
import { buildSalesTaxGuidance } from "./salesTaxGuidance";

type BuildPromptOptions = {
  specialty: AiSpecialty;
  summary: string;
  projectSize?: string;
  projectType?: "remodel" | "new-construction";
  companyName?: string;
  locale?: {
    state?: string;
    county?: string;
    city?: string;
  };
  includePricing?: boolean;
  adminPrompt?: string | null;
  adminPromptExtra?: string | null;
  pricingPrompt?: string | null;
};

/** Sync prompt builder. Use the async `buildQuoteDraftPromptLive` from API
 *  routes — it pulls the BLS-adjusted PriceBook filtered to the specialty's
 *  trade categories and injects the curated material profile when one
 *  exists. The sync variant is preserved for tests / offline tooling. */
export function buildQuoteDraftPrompt(options: BuildPromptOptions): string {
  return assembleQuoteDraftPrompt(options, {
    priceBookBlock: null,
    materialProfileBlock: null,
    taxBlock: null,
  });
}

/** Async wrapper: fetches the live, specialty-filtered PriceBook + curated
 *  material profile + sales-tax guidance, then assembles the prompt. Falls
 *  back to the bare prompt if any fetch fails — anchoring is best-effort,
 *  not load-bearing. */
export async function buildQuoteDraftPromptLive(options: BuildPromptOptions): Promise<string> {
  let priceBookBlock: string | null = null;
  let materialProfileBlock: string | null = null;
  let taxBlock: string | null = null;

  try {
    const filter = priceBookCategoriesForSpecialty(options.specialty.id, options.specialty.category);
    priceBookBlock = formatPriceBookForPrompt(filter);
  } catch (err) {
    console.warn("[buildQuoteDraftPromptLive] PriceBook fetch failed (non-blocking):", err instanceof Error ? err.message : err);
  }
  try {
    materialProfileBlock = formatSpecialtyMaterialProfile(options.specialty.id);
  } catch (err) {
    console.warn("[buildQuoteDraftPromptLive] Material profile fetch failed (non-blocking):", err instanceof Error ? err.message : err);
  }
  try {
    const locStr = [options.locale?.city, options.locale?.county, options.locale?.state]
      .filter(Boolean).join(', ').trim();
    taxBlock = buildSalesTaxGuidance({ location: locStr || null });
  } catch (err) {
    console.warn("[buildQuoteDraftPromptLive] Tax guidance build failed (non-blocking):", err instanceof Error ? err.message : err);
  }

  return assembleQuoteDraftPrompt(options, { priceBookBlock, materialProfileBlock, taxBlock });
}

function assembleQuoteDraftPrompt(
  {
    specialty,
    summary,
    projectSize,
    projectType = "remodel",
    companyName,
    locale,
    includePricing = false,
    adminPrompt,
    adminPromptExtra,
    pricingPrompt,
  }: BuildPromptOptions,
  injected: {
    priceBookBlock: string | null;
    materialProfileBlock: string | null;
    taxBlock: string | null;
  },
): string {
  const lines: string[] = [];

  // Start with admin estimator prompt if provided (this is the main system instruction)
  if (adminPrompt?.trim()) {
    lines.push(adminPrompt.trim());
    lines.push("");
  }

  // Add specialty-specific preamble (this provides context for the specialty)
  lines.push(specialty.promptPreamble.trim());
  lines.push("");

  // Inject the curated specialty material profile FIRST (most specific guidance),
  // then the trade-filtered PriceBook (broader anchor). Order matters — GPT
  // weights earlier instructions more heavily.
  if (injected.materialProfileBlock) {
    lines.push(injected.materialProfileBlock);
    lines.push("");
  }
  if (injected.priceBookBlock) {
    lines.push(injected.priceBookBlock);
    lines.push("");
  }
  if (injected.taxBlock) {
    lines.push(injected.taxBlock);
    lines.push("");
  }

  // Add extra admin prompt if provided (additional constraints/guidance)
  if (adminPromptExtra?.trim()) {
    lines.push(adminPromptExtra.trim());
    lines.push("");
  }
  lines.push("Return a concise JSON object with the following structure:");
  lines.push("");
  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push("PROPOSAL TEMPLATE STRUCTURE (What the final proposal will show):");
  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push("Your generated proposal will be displayed using a universal template with 11 sections:");
  lines.push("");
  lines.push("1. 🏗️ Contractor Information");
  lines.push("   → Auto-filled from company settings (logo, name, address, phone, email)");
  lines.push("   → You don't need to provide this");
  lines.push("");
  lines.push("2. 📄 Client Information");
  lines.push("   → Client name, project address, date, proposal number");
  lines.push("   → Use 'title' for proposal name, project details from user input");
  lines.push("");
  lines.push("3. 📋 Project Summary");
  lines.push("   → Clear description of the project");
  lines.push("   → Use the 'summary' field in your JSON output");
  lines.push("");
  lines.push("4. 🔧 Scope of Work");
  lines.push("   → Detailed breakdown: demo → prep → install → finish → cleanup");
  lines.push("   → Use the 'scope' array in your JSON (each item becomes a bullet point)");
  lines.push("");
  lines.push("5. 📊 Line Item Estimate");
  lines.push("   → Table with: Description | Qty | Unit | Material Cost | Labor Cost | Line Total");
  lines.push("   → Use 'pricing.lineItems' array - each item MUST have:");
  lines.push("     • name (CRITICAL: Detailed, descriptive line item name - NOT generic category names)");
  lines.push("       ❌ NEVER USE: 'Demolition', 'Cabinetry', 'Flooring', 'Countertops', 'Stone Fabrication'");
  lines.push("       ✅ ALWAYS USE DETAILED DESCRIPTIONS:");
  lines.push("       'Remove existing cabinets, countertops, and fixtures; haul away debris; protect surrounding areas'");
  lines.push("       'Fabricate and install granite countertops (120 sqft) with polished edges and undermount sink cutout'");
  lines.push("       'Install luxury vinyl plank flooring over subfloor with vapor barrier, baseboards, and transitions'");
  lines.push("       'Demo existing kitchen: remove cabinets, appliances, counters; patch walls; protect floors'");
  lines.push("     • description (optional additional details for the line item)");
  lines.push("     • measurementType (CRITICAL: Choose the correct type - DO NOT default to 'fixed')");
  lines.push("       - 'sqft' = area-based (flooring, countertops, tile, painting surfaces, drywall, insulation, sheathing)");
  lines.push("       - 'linear' or 'linearft' = length-based (trim, baseboards, perimeters, borders, fascia, gutters, drip edge, ridge cap)");
  lines.push("       - 'cubic' = volume-based (concrete pours, gravel, fill dirt, topsoil, mulch — cubic yards)");
  lines.push("       - 'unit' = item-based (fixtures, appliances, pieces, roofing squares, tons, gallons, bundles, rolls)");
  lines.push("       - 'hour' = time-based (labor hours, consulting, equipment rental per hour/day)");
  lines.push("       - 'sqboards' = board feet (lumber — board footage)");
  lines.push("       - 'yards' = linear yards (fabric, carpet by the yard)");
  lines.push("       - 'fixed' = ONLY for flat-rate tasks that cannot be measured otherwise");
  lines.push("       IMPORTANT: Countertops/stone = 'sqft', Demolition = 'hour' or 'fixed'");
  lines.push("     • sqft OR quantity (Qty column) - use sqft for 'sqft', quantity for all others");
  lines.push("     • unitPrice OR fixedPrice (for Material Cost calculation)");
  lines.push("     • total (Line Total column)");
  lines.push("     • laborCost (REQUIRED - estimated labor cost for this specific line item)");
  lines.push("     • materialCost (REQUIRED - estimated material cost for this specific line item)");
  lines.push("   IMPORTANT: Provide laborCost and materialCost for EACH line item. This ensures accurate cost breakdown.");
  lines.push("   CRITICAL: Choose the correct measurementType - using the wrong type (e.g., sqft instead of linearft) will result in incorrect estimates.");
  lines.push("");
  lines.push("6. ➕ Optional Add-ons");
  lines.push("   → Relevant upsells when applicable");
  lines.push("   → Use the 'upsells' array (title, description)");
  lines.push("");
  lines.push("7. 💰 Project Totals");
  lines.push("   → Material Subtotal, Labor Subtotal, Subtotal, Tax, Total");
  lines.push("   → Calculated from: pricing.laborCost, pricing.lineItems totals, pricing.taxRate");
  lines.push("   → Ensure 'pricing.laborCost' is provided for Labor Subtotal");
  lines.push("");
  lines.push("8. 📝 Notes");
  lines.push("   → Important assumptions, conditions, or clarifications");
  lines.push("   → Use 'pricing.notes' array (each item becomes a note)");
  lines.push("");
  lines.push("9. 📜 Terms & Conditions");
  lines.push("   → Standard terms about materials, labor, scope changes, warranty");
  lines.push("   → Auto-filled by the system (you don't need to provide)");
  lines.push("");
  lines.push("10. 💳 Payment Schedule");
  lines.push("    → Deposit, progress payments, final payment");
  lines.push("    → Use 'pricing.schedule' array (name, percent)");
  lines.push("    → Percentages must add up to 100");
  lines.push("");
  lines.push("11. ✍️ Signatures");
  lines.push("    → Contractor and client signature lines with date fields");
  lines.push("    → Auto-filled by the system (you don't need to provide)");
  lines.push("");
  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push("IMPORTANT: Your JSON output will be automatically converted to match this template structure.");
  lines.push("Focus on providing complete, accurate data in the JSON format below.");
  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push("");
  if (includePricing) {
    lines.push(
      `{"title": string, "summary": string, "scope": [string], "timeline": string, "upsells": [{"title": string, "description": string}], "disclaimers": [string], "nextSteps": [string], "pricing": {"summary": string, "currency": "USD", "basePricePerSqFt": number, "recommendedPrice": number, "laborRate": number, "crew": number, "hours1": number, "hours2": number, "laborCost": number, "overhead": number, "profit": number, "taxRate": number, "discount": number, "lineItems": [{"name": string, "description": string, "system": string, "measurementType": "sqft" | "linear" | "linearft" | "cubic" | "unit" | "hour" | "fixed" | "sqboards" | "yards" | "sqyards", "sqft": number, "quantity": number, "unitPrice": number, "fixedPrice": number, "laborCost": number, "materialCost": number, "total": number}], "schedule": [{"name": string, "percent": number}], "notes": [string]}}`,
    );

    // CRITICAL INSTRUCTIONS - ALWAYS INCLUDED (cannot be overridden by custom prompts)
    lines.push("");
    lines.push("═══════════════════════════════════════════════════════════════");
    lines.push("CRITICAL REQUIREMENTS - MUST FOLLOW:");
    lines.push("═══════════════════════════════════════════════════════════════");
    lines.push("");
    lines.push("1. LINE ITEM NAMES:");
    lines.push("   Each lineItem 'name' MUST be a detailed description of the specific work, NOT a generic category.");
    lines.push("   ❌ BAD: 'Demolition', 'Cabinetry', 'Flooring', 'Stone Fabrication'");
    lines.push("   ✅ GOOD: 'Remove existing cabinets, countertops, and fixtures; haul away debris and protect surrounding areas'");
    lines.push("   ✅ GOOD: 'Fabricate and install granite countertops with polished edges, undermount sink cutout, and backsplash'");
    lines.push("   ✅ GOOD: 'Install luxury vinyl plank flooring over existing subfloor with vapor barrier and transitions'");
    lines.push("   Each line item should read like a scope item explaining WHAT is being done, HOW, and with WHAT materials.");
    lines.push("");
    lines.push("1A. ROOM-SPECIFIC NAMING (MANDATORY for multi-room and whole-house jobs):");
    lines.push("   When the project covers multiple rooms or an entire house, every finish-trade line item MUST identify the SPECIFIC room(s) it applies to. Generic, room-less line items are FORBIDDEN for multi-room jobs.");
    lines.push("");
    lines.push("   STEP A — Identify and name every space involved. Use the names from the project description if given (e.g., 'Master Bedroom', 'Bedroom 2', 'Bedroom 3', 'Master Bath', 'Hall Bath', 'Powder Room', 'Kitchen', 'Pantry', 'Dining', 'Great Room', 'Office', 'Mudroom', 'Laundry', 'Foyer', 'Garage', 'Bonus Room'). NEVER use vague labels like 'bedroom', 'bathroom', 'room', 'space', 'area' without an index or descriptor.");
    lines.push("");
    lines.push("   STEP B — Every flooring, paint, cabinet, countertop, plumbing fixture, light fixture, door, window, trim, and tile line item MUST start with or include the specific room name. When multiple rooms share the same finish, you MAY bundle them, but you MUST list every room name in the line item description.");
    lines.push("");
    lines.push("   ❌ FORBIDDEN: 'Interior paint — 5,200 sf walls'");
    lines.push("   ❌ FORBIDDEN: 'Hardwood flooring — 1,084 sf'");
    lines.push("   ❌ FORBIDDEN: 'Toilet, supply, shutoffs — 3 ea'");
    lines.push("   ❌ FORBIDDEN: 'New vanity — 2 ea'");
    lines.push("");
    lines.push("   ✅ REQUIRED: 'Interior paint — Master Bedroom (288 sf walls + 288 sf ceiling, 2 coats)'");
    lines.push("   ✅ REQUIRED: 'Interior paint — Bedrooms 2 & 3 + Hall (612 sf walls + 410 sf ceiling, 2 coats)'");
    lines.push("   ✅ REQUIRED: 'Hardwood flooring — Great Room, Kitchen, Dining, Foyer, Office (1,084 sf, 5/8\" engineered oak)'");
    lines.push("   ✅ REQUIRED: 'Carpet — Master Bedroom + Master WIC + Bedrooms 2 & 3 (684 sf, mid-grade nylon w/ 8 lb pad)'");
    lines.push("   ✅ REQUIRED: 'Tile flooring — Master Bath, Hall Bath, Powder, Mudroom (350 sf 12×24 porcelain)'");
    lines.push("   ✅ REQUIRED: 'Master Bath — 72\" double vanity with quartz top and undermount sinks'");
    lines.push("   ✅ REQUIRED: 'Hall Bath — 36\" single vanity with cultured marble top'");
    lines.push("   ✅ REQUIRED: 'Powder Room — Pedestal sink and chrome faucet'");
    lines.push("   ✅ REQUIRED: 'Toilet, supply, angle stop — Master Bath (1 ea, comfort-height elongated)'");
    lines.push("   ✅ REQUIRED: 'Toilet, supply, angle stop — Hall Bath (1 ea)'");
    lines.push("   ✅ REQUIRED: 'Toilet, supply, angle stop — Powder Room (1 ea)'");
    lines.push("   ✅ REQUIRED: 'Master Bedroom — Install 2 ea 4'-0\" × 5'-0\" double-hung vinyl windows'");
    lines.push("");
    lines.push("   Trades that REQUIRE room-specific naming for multi-room jobs:");
    lines.push("   - All flooring (hardwood, carpet, tile, LVP, polished concrete)");
    lines.push("   - All paint and wall covering");
    lines.push("   - All plumbing fixtures (every toilet, sink, tub, shower, faucet — itemized per bathroom/kitchen/laundry)");
    lines.push("   - All cabinets, countertops, and built-ins");
    lines.push("   - All interior doors, trim (base, casing, crown), and closet systems");
    lines.push("   - All windows and exterior doors when room-specific");
    lines.push("   - All electrical fixtures (lights, fans, dedicated circuits) when room-specific");
    lines.push("   - All tile work (per bathroom, per backsplash)");
    lines.push("");
    lines.push("   Trades that CAN remain whole-house bundled (with the room list still in the description):");
    lines.push("   - Site protection, demolition (itemize the rooms being demoed)");
    lines.push("   - Foundation, framing, roof, siding, insulation, drywall hang/finish");
    lines.push("   - Whole-house rough-in plumbing/electrical/HVAC (rough-in only — finish must be per room)");
    lines.push("   - General conditions, overhead, profit, permits");
    lines.push("");
    lines.push("   For SINGLE-ROOM jobs (e.g., 'kitchen remodel only', 'master bath only'), name the room once in the title and you do NOT need to repeat it on every line item — but the line items must still describe the specific work being done.");
    lines.push("");
    lines.push("2. MEASUREMENT TYPES:");
    lines.push("   Choose the appropriate measurementType for each lineItem based on the job description:");
    lines.push("   • 'sqft' = area-based work (flooring, painting surfaces, tile, countertops by area, drywall, insulation, sheathing)");
    lines.push("   • 'linear' or 'linearft' = length-based work (trim, baseboards, borders, perimeters, fascia, gutters, drip edge, ridge cap)");
    lines.push("   • 'cubic' = volume-based work (concrete pours, gravel, fill dirt, topsoil, mulch)");
    lines.push("   • 'unit' = item-based work (fixtures, appliances, pieces, roofing squares, tons, gallons, bundles, rolls, bags)");
    lines.push("   • 'hour' = time-based work (labor hours, consulting, equipment rental)");
    lines.push("   • 'sqboards' = board feet (lumber board footage)");
    lines.push("   • 'yards' = linear yards (carpet, fabric by the yard)");
    lines.push("   • 'fixed' = ONLY for flat-rate tasks that cannot be measured otherwise");
    lines.push("   IMPORTANT: Do NOT default to 'fixed' - analyze the work and use the most accurate measurement type.");
    lines.push("   For countertops/stone: use 'sqft' (surface area). For demolition: use 'hour' or 'fixed' depending on scope.");
    lines.push("   For roofing shingles: use 'unit' with quantity in squares (1 sq = 100 sqft). For roof labor: use 'sqft'.");
    lines.push("");

    // Use custom pricing prompt if provided, otherwise use default
    if (pricingPrompt?.trim()) {
      // Replace location placeholder if locale is provided
      let finalPricingPrompt = pricingPrompt.trim();
      if (locale?.city || locale?.state) {
        const locationText = [locale.city, locale.state].filter(Boolean).join(", ");
        finalPricingPrompt = finalPricingPrompt.replace(
          /IMPORTANT:\s*Adjust pricing based on the provided location\./g,
          `IMPORTANT: Adjust pricing based on the provided location (${locationText}).`
        );
        // If no location placeholder exists, add it
        if (!finalPricingPrompt.includes(locationText)) {
          finalPricingPrompt = `IMPORTANT: Adjust pricing based on the provided location (${locationText}). Different cities and states have different material costs and labor rates. Research typical pricing for this location when calculating materials and labor costs.\n\n${finalPricingPrompt}`;
        }
      }
      lines.push(finalPricingPrompt);
    } else {
      // Default pricing instructions
      lines.push(
        [
          "CRITICAL - LINE ITEM NAMES: Each lineItem 'name' MUST be a detailed description of the specific work, NOT a generic category. Example BAD names: 'Demolition', 'Cabinetry', 'Flooring'. Example GOOD names: 'Remove existing fixtures, cabinets, and flooring; protect surrounding areas', 'Install shaker-style base and wall cabinets with soft-close hardware', 'Lay waterproof luxury vinyl plank with vapor barrier'. Each line item should read like a scope item explaining WHAT is being done, HOW, and with WHAT materials.",
          "You must return at least three pricing lineItems that cover preparation, primary installation scope, and wrap-up/cleanup tasks.",
          "Use realistic US contractor pricing based on typical market rates for the specialty.",
          locale?.city || locale?.state
            ? `IMPORTANT: Adjust pricing based on the provided location (${[locale.city, locale.state].filter(Boolean).join(", ")}). Different cities and states have different material costs and labor rates. Research typical pricing for this location when calculating materials and labor costs.`
            : "Use typical US market rates for the specialty.",
          "CRITICAL - MEASUREMENT TYPES: Choose the appropriate measurementType for each lineItem based on the job description. This is ESSENTIAL for accurate estimates: (1) 'sqft' for area-based work (flooring, painting by area, square footage, surface area, drywall, insulation, sheathing), (2) 'linear' or 'linearft' for length-based work (borders, edges, perimeters, linear feet, trim, baseboards, crown molding, fascia, gutters, drip edge, ridge cap, linear measurements, running feet, lineal feet, LF, LFT), (3) 'sqboards' for square board measurements (board feet, lumber calculations, wood materials, board footage, BF), (4) 'cubic' for volume-based work (concrete pours, gravel, fill dirt, topsoil, mulch, cubic yards, CY), (5) 'yards' for linear yard measurements (fabric, carpet by the yard, fencing, linear yardage), (6) 'unit' for item-based work (fixtures, pieces, items, each, EA, roofing squares SQ, tons, gallons, bundles, rolls, bags, boxes), (7) 'hour' for time-based work (labor hours, consulting, equipment rental), (8) 'fixed' for flat-rate work (permits, cleanup, mobilization, lump sum). ANALYZE THE JOB DESCRIPTION CAREFULLY: If it mentions 'linear feet', 'linear ft', 'linearft', 'LF', 'LFT', 'perimeter', 'border', 'edge', 'trim', 'baseboard', 'crown molding', 'running feet', 'lineal feet', use 'linear' or 'linearft'. If it mentions 'square boards', 'board feet', 'sq boards', 'BF', 'lumber', 'timber', use 'sqboards'. If it mentions 'cubic yards', 'cu yards', 'cubic feet', 'volume', 'CY', 'gravel', 'fill dirt', 'topsoil', 'mulch', 'concrete volume', use 'cubic'. If it mentions 'yards', 'yds', 'yd' (linear yardage, not cubic yards), use 'yards'. If it mentions 'pieces', 'items', 'fixtures', 'each', 'EA', 'units', 'squares', 'SQ', 'tons', 'gallons', 'bundles', 'rolls', 'bags', use 'unit'. If it mentions 'hours', 'time', 'hourly', use 'hour'. For roofing: shingles use 'unit' with quantity in squares (1 sq = 100 sqft), installation labor uses 'sqft'. For each measurementType, provide the appropriate fields: sqft + unitPrice for 'sqft', quantity + unitPrice for 'linear'/'linearft'/'sqboards'/'cubic'/'yards'/'unit'/'hour', fixedPrice for 'fixed'. ALWAYS use the most accurate measurement type - using 'sqft' when the work is actually linear or unit-based will result in incorrect estimates.",
          "CRITICAL - LABOR CALCULATION: Calculate labor based on TOTAL PROJECT SIZE. For sqft-based projects, use total square footage. For linear/cubic/unit/hour projects, estimate equivalent sqft or calculate labor based on the measurement type. Labor MUST scale with project size - larger projects require more labor hours. Calculate laborHours, laborRate, crew, hours1, hours2, and laborCost based on: (1) Total project size from all lineItems combined (convert all measurement types to equivalent scale), (2) Project complexity (prep required, repairs, detailing), (3) Specialty type (some specialties require more time per sqft), (4) Location labor rates (higher in major cities). The laborCost field MUST be calculated as: laborCost = laborRate × crew × (hours1 + hours2). Do NOT use fixed labor hours regardless of project size. Always provide the laborCost field in the pricing object.",
          "CRITICAL - MATERIAL VS LABOR SEPARATION: For EACH lineItem, you MUST provide both 'materialCost' and 'laborCost' fields explicitly. DO NOT rely on the system to calculate these - you must estimate them based on: (1) The specific work involved in that line item, (2) Typical material costs for that scope, (3) Typical labor hours needed for that specific task, (4) Location-based labor rates. For sqft-based items: estimate materialCost = sqft × unitPrice (or appropriate material rate) and laborCost = estimated hours × laborRate × crew. For fixed-price items: estimate 50-60% materials and 40-50% labor based on task complexity. For other measurement types: estimate based on typical labor hours per unit. The sum of materialCost + laborCost for each line item should approximately equal the 'total' field. This explicit separation is REQUIRED for accurate proposal display.",
          "All totals should equal the appropriate calculation (sqft × unitPrice for 'sqft', quantity × unitPrice for 'linear'/'linearft'/'sqboards'/'cubic'/'unit'/'hour', fixedPrice for 'fixed'), and the sum of line item totals should match recommendedPrice.",
          "Percent values in the schedule must be whole numbers that add up to 100.",
          "Provide thoughtful notes that explain key pricing assumptions (e.g., labor mix, material quality, equipment usage, location-based adjustments, labor hours calculation rationale).",
        ].join(" "),
      );
    }
  } else {
    lines.push(
      `{"title": string, "summary": string, "scope": [string], "timeline": string, "upsells": [{"title": string, "description": string}], "disclaimers": [string], "nextSteps": [string]}`,
    );
    lines.push(
      "Keep pricing references qualitative only. When suggesting upsells, ensure they are relevant to the specialty.",
    );
  }
  lines.push("");
  lines.push("Project details provided by the contractor:");
  lines.push(`- Specialty: ${specialty.name}`);
  if (companyName) {
    lines.push(`- Company: ${companyName}`);
  }

  // Add project type detection instruction
  lines.push("");
  lines.push("IMPORTANT - PROJECT TYPE DETECTION:");
  lines.push("Analyze the project summary below to determine if this is a 'remodel/retrofit' or 'new construction' project.");
  lines.push("");
  lines.push("NEW CONSTRUCTION indicators:");
  lines.push("- Keywords: 'new construction', 'new build', 'ground up', 'from scratch', 'new home', 'new building', 'new system', 'new installation', 'core and shell', 'new tenant space', 'brand new', 'newly constructed', 'initial installation'");
  lines.push("- Context: Building from scratch, new structures, new systems, ground-up projects");
  lines.push("");
  lines.push("REMODEL/RETROFIT indicators:");
  lines.push("- Keywords: 'remodel', 'renovation', 'retrofit', 'upgrade', 'replace', 'refinish', 'resurface', 'repair', 'existing', 'current', 'old', 'worn', 'damaged', 'crack', 'patch', 'occupied structure'");
  lines.push("- Context: Upgrading existing systems, replacing finishes, working in occupied structures, phasing work");
  lines.push("");
  lines.push("If the summary clearly indicates new construction, treat this as a NEW CONSTRUCTION project.");
  lines.push("If the summary indicates work on existing structures/systems, treat this as a REMODEL/RETROFIT project.");
  lines.push("If uncertain, default to REMODEL/RETROFIT (most common scenario).");
  lines.push("");

  if (projectType === "new-construction") {
    lines.push("- Project type: New construction (detected from description)");
  } else if (projectType === "remodel") {
    lines.push("- Project type: Remodel / retrofit (detected from description)");
  }
  if (locale?.city || locale?.county || locale?.state) {
    const locationParts = [locale.city, locale.county, locale.state].filter(Boolean);
    lines.push(`- Location: ${locationParts.join(", ")}`);
  }
  if (projectSize) {
    lines.push(`- Project size: ${projectSize}`);
  }
  lines.push(`- Summary: ${summary.trim()}`);
  lines.push("");
  lines.push("VERIFY: Based on the summary above, confirm whether this is truly a 'new construction' or 'remodel/retrofit' project.");
  lines.push("Adjust your proposal scope, pricing, and timeline accordingly:");
  lines.push("- NEW CONSTRUCTION: Typically requires more prep work, permits, inspections, and may have different material/labor ratios");
  lines.push("- REMODEL/RETROFIT: Typically requires demo, protection of existing finishes, phasing, and working around occupied spaces");
  lines.push("");
  lines.push("Key planning questions to consider:");
  specialty.keyQuestions.forEach((question) => {
    lines.push(`- ${question}`);
  });

  return lines.join("\n");
}

