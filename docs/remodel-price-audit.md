# Price audit: the existing prompt numbers against the reviewed remodel method

> **Applied 2026-09-18** (owner: "go"): sections A, B, C and D were applied
> to `master-prompt.ts`, `trade-knowledge.ts` and `legacy/PriceBook.ts`;
> section E items 2 to 8 and 10, and the adjacent-layer fixes to
> `estimate-prompt.ts`, were applied. Not applied: item 1 ("yards" stays in
> the unit vocabulary because older estimates carry it; the method never
> uses it) and item 9 (a line's combined unitPrice stays above zero; a
> labor-only line has materialCost 0). Items 11 and 12 needed no change
> once the anchors were corrected. Later the same evening the corrected
> price book and the material profile went back into the live prompt, as the
> previous JobFlex sent them (docs/remodel-method.md). Section F's
> open decisions (contingency, who supplies fixtures, project management,
> derived Seattle rates) stand as the method states them. Line numbers
> below are from before the fix. See `docs/remodel-method.md`.

For the owner. This is not prompt text. It lists every number in the current price layers that is too low for 2025-2026, or that disagrees with another layer or with the method (`parts/core-1-5-8.md`, section 8, and the twelve reviews behind it). It also lists the master-prompt rules that contradict the method or the brief-binding rules.

- Proposed values are US national, standard grade, before markup, unless a row says otherwise. Where a review corrected a rulebook, the review's number is used.
- Line numbers are from `/Users/dmitriyapetenok/Documents/JobFlex-v3-backup` as of commit effc6a5.
- Numbers that were checked and are fine are listed under "Kept", so the fix does not over-correct.

## What matters most

1. **Several price sources can reach one prompt, and they disagree.** Master-prompt PRICING GUIDELINES, the trade-profile anchors, the procedure block and, when it is enabled, the legacy PriceBook can all land in the same call. `procedures/index.ts` L92 (PROCEDURE_RULES) says a trade profile's "price anchors govern the numbers" whenever that block is sent (the gpt-4o-class path). Fix the kitchen and bathroom anchors first (sections B and C).
2. **Licensed-trade labor is priced low in every layer.**
   - A new circuit: $200-500 today; the reviewed price is $450-900.
   - A plumber: $80-160/h today; the reviewed rate is $110-180 ($150-220 in the Seattle area).
   - A new bath fan: $350-600 installed today; the reviewed price is $1,000-2,200.
3. **The line-count rules let the Kirkland failure through.** "Minimum 6-12 line items for bathroom remodels" (master L752) and "6-12 lines minimum" (bathroom preamble, trade-knowledge L407) both pass an 8-line full bath. A gut hall bath is 22-30 lines.
4. **The master prompt's own model kitchen (L736-748) teaches the never-lines:**
   - fixed lumps for countable plumbing and electrical work;
   - a relocation and lighting nobody asked for;
   - a sink line that hides the under-sink plumbing;
   - counts written into line names.
5. **Waste still goes into quantities** (master L44, L408, L413-427; estimate-prompt.ts L108). The brief-binding doc names this rule as a cause of the 450 sqft epoxy reply.

## A. master-prompt.ts, PRICING GUIDELINES (L660-725) and the example (L736-748)

| Line | Current text | Proposed | Why |
|---|---|---|---|
| L668 | Countertop (laminate): $20-40/SF | $25-45/sqft installed (post-form may be sold by the linear ft) | Kitchen rulebook unit checks. The kitchen review notes that post-form is sold by the foot. |
| L669 | Backsplash tile: $10-30/SF (material) | $3-15/sqft material (3x6 ceramic subway $3-6) | The kitchen rulebook says $3-15 and the method's allowance is $6. The current number overprices a 40 sqft subway backsplash by $300-900. |
| L673 | Vanity (stock): $200-800 | 36 in. stock cabinet $350-900, top $150-450; or $700-1,100 with the top | Bathroom anchors (the reviews say they hold). $200 buys a 24 in. big-box combo. |
| L675 | Toilet: $200-600 | $250-550 | Standard is a comfort-height 1.28 gpf elongated bowl. Minor. |
| L677 | Shower (prefab): $800-2500 | Label it material: prefab base and surround kit $800-2,500. Installed tub-to-shower with a prefab kit: $6,500-11,000 | As written it reads as an installed price. |
| L678 | Shower (custom tile): $3000-10000+ | Remove the lump. The tiled shower is itemized (pan, membrane, backer, tile, glass, valve). Installed check: $10,000-18,000, never under $12,000 in Seattle-area and CA or NY metros | Read as an installed price, this number is the Kirkland failure. |
| L679 | Tile (floor): $5-20/SF material, $8-15/SF labor | Material $3-8 (standard porcelain; mosaic $8-15). Labor $10-18/sqft | Bathroom anchors. Labor was low; material was high for standard grade. |
| L680 | Tile (walls): $5-25/SF material, $10-20/SF labor | Labor $12-25/sqft for shower walls, $18-30 for mosaics and niches | Bathroom anchors. |
| L716 | Demolition: $3-8/SF | $3-8 per sqft of surface removed. Price a room gut whole: bath $1,200-2,800, kitchen $1,800-4,000, with disposal on its own line | Applied to room floor area, the current rate prices a 12x14 kitchen gut at $500-1,350 and a 5x8 bath at $120-320. The L736 example does exactly that. |
| L717 | Tile installation: $8-20/SF | Floors $10-18, walls $12-25, mosaics and niches $18-30 | One number covers three different tasks. |
| L719 | Plumbing rough-in: $500-1500/fixture | Per fixture in place $600-1,200; per relocated fixture $1,500-3,500 | Discipline rulebook per-task anchors (not refuted). A moved fixture at $500 is a third of its cost. |
| L720 | Electrical rough-in: $200-500/circuit | New 20 A circuit with breaker and device $450-900; 240 V 50 A range circuit $700-1,600 | The discipline ($450-900), bathroom ($450-1,000) and kitchen ($700-1,600 range circuit) rulebooks agree. |
| L725 | electrician $80-150/hr, plumber $80-160/hr | Electrician $100-160 (Seattle area $140-200); plumber $110-180 ($150-220) | The discipline MEP review warns that two rate tables in one prompt make the model average them. The MEP review confirms Seattle plumbers bill $150-220. |
| L736 | Example: demolition, sqft 225, labor $5.00/sqft (about $1,125) | Kitchen gut $1,800-4,000, plus a 20 cu yd dumpster at $450-700 on its own line | Below the reviewed gut range. |
| L741 | Example: backsplash material $12/sqft | $5/sqft for subway | See L669. |

**Kept (checked, no change):**
- L663-665: stock, semi-custom and custom cabinets at $100-200, $200-400 and $400-800 per LF. The kitchen review calls these defensible; plywood boxes are an upgrade on most semi-custom lines.
- L666-667: quartz $60-120 and granite $50-100 installed.
- L670: backsplash labor $15-25.
- L674 (custom vanity) and L676 (tub, as material).
- L718: cabinet install $50-100/LF.
- L721: painting $2-5/sqft.
- L725: carpenter $60-110/h.

## B. trade-knowledge.ts, kitchen profile anchors (L388-398)

| Line | Current text | Proposed | Why |
|---|---|---|---|
| L389 | Demo + haul-off: labor $4-8/sqft of kitchen; dumpster $400-700 fixed | Kitchen gut to the subfloor $1,800-4,000 (about $11-24 per sqft of a 168 sqft kitchen). 20 cu yd dumpster $450-700 on its own line | At $4-8 per floor sqft, a 12x14 gut prices at $670-1,340. |
| L391 | laminate $20-40 | $25-45/sqft installed | Kitchen unit checks. |
| L392 | Backsplash tile: material $10-30/sqft | $3-15/sqft material (subway $3-6) | Kitchen rulebook and the method's allowance. |
| L393 | Sink + faucet: material $300-900/unit; labor $250-450/unit | Split it. 18-gauge stainless sink $250-450; pull-down faucet $250-350; set labor $250-450. The under-sink plumbing gets its own line: trap kit re-piped $60-150, angle stop $45-90 each when replaced, braided supply $15-30 each, basket strainer $25-50 each | Owner's rule 2: the under-sink line is visible. The numbers are the kitchen rulebook's unit checks. |
| L394 | Plumbing rough-in: $500-1,500 per fixture (unit) or $800-2,500 fixed | Per fixture only: in place $600-1,200, relocated $1,500-3,500. Drop the "or $800-2,500 fixed" option | Every rulebook bans a fixed lump for countable fixtures. |
| L395 | Electrical: $200-500 per circuit; outlets/switches $80-150/unit; under-cabinet LED $20-40/linear ft installed | New 20 A circuit $450-900; 50 A range circuit $700-1,600; device swap $75-150; new box on an existing circuit $180-400; AFCI or dual-function breaker installed $120-250; hardwired under-cabinet LED with driver and dimmer $900-2,000 for 16 linear ft | The circuit price is half the reviewed one. $20-40/LF buys the tape alone. |
| L396 | Appliance install + hookup: labor $100-250/unit | By appliance: range $120-250, dishwasher $180-350, hood hung and hardwired $250-500 | Kitchen unit checks. A hood or a dishwasher runs over $250. |

**Kept:** L390 (cabinets and install), L391 (quartz and granite), L397 (paint).

**Missing, so the model has nothing to hold:**
- Permits $300-1,500 (King County, Bay Area and NYC $800-2,500).
- Protection $250-600.
- Final clean $250-500.
- Drywall patch $250-450 for the first opening.
- Washington asbestos survey $300-700.

**Same profile:** the L369 preamble says "A kitchen has 8-15 lines". A same-layout full kitchen runs 24-32 lines (MEP rulebook table, reviewed); a sink swap runs 4-7.

## C. trade-knowledge.ts, bathroom profile anchors (L427-439)

| Line | Current text | Proposed | Why |
|---|---|---|---|
| L428 | Gut demo + haul-off, full bath: labor $1,200-2,500 fixed (or $15-30/sqft) | Gut to the studs and subfloor $1,200-2,800. 10 cu yd dumpster $400-650 (Seattle $550-800) on its own line. Drop the per-sqft alternative | $15-30 per sqft of a 40 sqft bath is $600-1,200, half the fixed range printed beside it. |
| L429 | Plumbing rough-in: $500-1,500/unit per fixture | In place $600-1,200; relocated $1,500-3,500; tub-to-shower drain conversion and valve $900-1,800 | As for the kitchen. The last figure is the MEP rulebook's. |
| L430 | exhaust fan $350-600/unit installed | New fan ducted to a roof or wall cap, with switch and permit, $1,000-2,200 (Seattle $1,300-2,600). Replacement on the existing duct $350-700. Add a 20 A GFCI bathroom circuit at $450-1,000 | The bathroom estimator review corrected the fan price. $350-600 is the replacement price. |
| L432 | Shower pan (tile-ready system) + curb: material $400-900 fixed; labor $600-1,200 fixed | Unit, not fixed. Foam tray system with bonded drain $800-1,200 installed; mud pan $1,200-2,000 | The method's unit convention for a pan is unit. The discipline review split the tray and mud-pan prices. |
| L433 | Tile: floor ... labor $10-15/sqft; shower walls ... labor $14-22/sqft | Floors $10-18; walls $12-25; mosaics and niches $18-30 | Bathroom anchors. |
| L436 | Shower valve + trim: ... labor $250-500/unit | Labor $400-950 (4-6 plumber hours) | From the bathroom rulebook's valve row. |
| L437 | Frameless glass: $500-1,200/linear ft installed | Unit: 60 in. door and panel $1,500-3,000; single 30 in. door on a 36 in. stall $900-1,600 | Priced by the foot, a 60 in. door lands at $2,500-6,000. The unit convention for a glass enclosure is unit. |

**Kept:**
- L430: GFCI $120-200 and vanity light $150-300.
- L431: backer and membrane at $2-4 material and $3-5 labor. Write them as two lines.
- L434 (vanity and top), L435 (toilet), L438 (paint).

**Missing:**
- Permit $350-1,200 (Seattle $600-1,500).
- Protection.
- Washington asbestos survey $300-700.
- Moisture-resistant drywall and patch.

**Same profile (L407 preamble):**
- "shower pan / curb (fixed)" should be unit.
- "framing and blocking (fixed)" should be linear ft.
- "shower glass (linear ft or unit)" should be unit.
- "6-12 lines minimum": a gut hall bath is 22-30 lines.

## D. legacy/PriceBook.ts: CABINETS, TILE_FLOORING, PLUMBING, ELECTRICAL, PAINT

**The formatter header is the first problem.** The entries are material prices. But `promptFormatter.ts` L75-79 presents them as "MATERIAL & LABOR PRICE REFERENCE ... PRIMARY reference when calculating material_cost and labor_cost ... Do NOT invent prices outside these ranges".

**This block does not reach the Smart Proposal today.**
- `legacy-estimate.ts` L181 calls the sync `buildQuoteDraftPrompt`, which passes `priceBookBlock: null` (`legacy/prompt.ts` L29).
- Only the unused `buildQuoteDraftPromptLive` injects the block.

If it is ever re-enabled as written, an outlet line is held to $2-15 installed, and a panel to $150-800. Change the header to "material prices only; labor comes from the anchors" before fixing the entries.

| Line | Current | Proposed | Why |
|---|---|---|---|
| L855 toilet | EA $120-600, avg 280 | $250-550, avg 350 | Standard comfort-height 1.28 gpf elongated. |
| L863 vanity | EA $200-1,200, avg 450 | 36 in. cabinet $350-900; with top $700-1,100; 60 in. double with top $1,400-2,200 | The entry gives no size and says nothing about a top. |
| L871 sink, lavatory | EA $80-500, avg 200 | Split: lavatory $120-350; kitchen 18-gauge stainless $250-450 | Two different fixtures share one entry. |
| L879 faucet | EA $80-400, avg 180 | Kitchen pull-down $250-350; lavatory $120-300 | The $180 average is below a standard kitchen faucet. |
| L887 tub | EA $250-1,500, avg 550 | 60 in. alcove, acrylic or steel $400-900; cast iron $900-1,800 | Bathroom anchors. |
| L895 shower valve, trim | EA $100-500, avg 220 | Valve and trim $350-600 (rough valve $110-250 plus trim $120-400) | $220 buys the valve body alone. |
| L903 water heater | EA $400-1,800 | Keep as material. Installed 50 gal gas tank with pan, expansion tank, straps and permit: $2,100-3,800 | Wrong only under the "material & labor" header. |
| L911 garbage disposal | EA $80-300, avg 150 | $150-350 (1/2-3/4 hp) | $80 buys a 1/3 hp builder unit. |
| L931 recessed light | EA $15-80, avg 35 | $30-60 material (IC-rated airtight 4 in. LED wafer); installed $110-275 | The low end is below the standard fixture. |
| L947 exhaust fan | EA $40-200, avg 90 | $140-300 (80-110 CFM, ENERGY STAR, humidity-sensing) | $40-90 buys a 50 CFM builder fan. |
| L955 outlet | EA $2-15, avg 5 | Keep for a duplex. Add a 20 A tamper-resistant GFCI at $22-35. Installed device swap $75-150 | Wrong only under the header. |
| L971 panel | EA $150-800, avg 350 | Keep as material. Installed 200 A service $3,200-6,500 national, $5,500-12,000 in Puget Sound | Wrong only under the header. |
| L983, L999 interior paint, primer | GAL | Price per sqft: walls two coats $1.50-3.50 installed, ceilings $1-2, trim $1.50-3/linear ft. Keep the gallon price for the shopping list only | UNIT_RULES (master L42) treat gallons as packages. |
| L1019 ceramic, porcelain tile | SF $1.50-8.00, avg 3.50 | Standard 12x24 porcelain $3-6, avg 4.50. Mosaic $8-15 as its own entry | The low end is budget 12x12 ceramic. |
| L1043 carpet | SF $2-8 | Sell by the sq yard: installed with 8 lb pad $40-80/sq yard | UNIT_RULES (b) and every rulebook sell carpet by the square yard. |
| L1059, L1068 thinset, grout | BAG | Shopping list only, never a line | They are packages (UNIT_RULES) and consumables (owner's rule 4). |
| L1080 base cabinet | LF $100-400, avg 200 | Standard (semi-custom) $200-400, avg 300 | The $200 average pulls a standard kitchen to stock pricing. The master example uses $300. |
| L1088 wall cabinet | LF $80-350, avg 180 | Standard $200-400, avg 250 | The master example uses $250. |
| L1096 countertop (granite, quartz) | SF $40-150, avg 75 | Quartz $60-120 and granite $50-100 installed (the fabricator's price, with labor 0) | $40 is below any installed stone. |
| L1104 laminate countertop | SF $15-40, avg 25 | $25-45 installed | Kitchen unit checks. |

**Kept (material):** light fixture, ceiling fan, switch, LVP, hardwood, laminate flooring, pipe and fittings.

**Also dormant, and it disagrees with the live layer.** PriceBook `REGION_MULTIPLIERS` WA 1.15 is multiplied by `METRO_COST_INDEX` Seattle 1.18 or Bellevue 1.20, an effective 1.36-1.38. Kirkland is not listed. The live prompt (`estimate-prompt.ts` L71) states WA 1.15 with "metro areas run higher still". The method uses 1.25 for Seattle-Bellevue-Kirkland in place of the state index, never both. Pick one.

## E. Master-prompt rules that contradict the method or the brief-binding rules

1. **Unit list (L25-26).** UNIT_VOCABULARY has ten words, including "lf" and "yards". The method and the brief rules use seven, plus sq boards for roofing. "yards" is ambiguous (cubic or square) and lets carpet go out as "yards". Proposed: drop "yards"; keep "lf" only as a parser alias for linear ft.
2. **Waste in quantities.**
   - L44: "(waste applied where the methodology says so)".
   - L408: "Include waste factors: 10% lumber, 10-15% tile/flooring ...".
   - L413-427: the waste table, with "State the waste % applied on each line item's notes".
   - estimate-prompt.ts L108 (rule 5, the roofing example) says the same.

   The brief-binding rule and the method both say a quantity is net and waste lives in the material unit price. Proposed wording: "quantities are net measured; the waste % is priced into the material unit price and stated in notes".
3. **Counts and math in names.**
   - The L364-379 "REQUIRED" examples carry "(1 ea, comfort-height elongated)", "(2 ea 32" 6-panel + 2 reach-in closet doors)" and "22 LF".
   - L401 carries "(684 sf total: 288 + 96 + 156 + 144)". That contradicts L765 ("Line names must NEVER contain math") and PRICING_RULES (L54).

   Proposed: keep the room names and move every count and sum into the quantity and notes fields.
4. **Overhead and profit as lines (L399).** "Trades that CAN bundle ... General conditions, overhead, profit, permits" lists overhead and profit as lines, while L407 says not to add them. Strike "overhead, profit".
5. **The no-photo breakdown (L443-459).** "BREAK DOWN ALL COMPONENTS" is a fixed kitchen list:
   - it bills the same demolition four times ("Demolition and disposal", "Cabinet removal", "Flooring removal", "Appliance removal");
   - it includes the bare categories the method bans ("Plumbing rough-in", "Electrical work", "Finish work and cleanup");
   - it applies to any brief without photos, so a sink swap gets a kitchen remodel's lines.

   Replace it with: "the lines are the job the brief names, walked through its procedure; a like-for-like fixture swap is 4-7 lines".
6. **The model kitchen (L736-748) teaches never-lines:**
   - L740: "waterfall edge", an upsell written as a line.
   - L743: "Undermount Sink and Faucet ... installation and plumbing hookup" hides the under-sink plumbing (owner's rule 2).
   - L744: "Plumbing Rough-In — relocate water supply lines, drain lines ..., gas line for range · fixed" is a fixed lump for countable fixtures, plus a relocation and a gas line the brief did not ask for.
   - L745: "Electrical Upgrades — (2) new 20A circuits, (5) new outlets, under-cabinet LED lighting, pendant lights over island · fixed" is the "electrical upgrades" never-line, puts counts in the name, and adds lighting upsells.
   - L746: "Appliance Installation ... · fixed · 1": four appliances are four units by the prompt's own L43.
   - L747: "Paint and Finish ... sqft · 225" uses the floor area, not the painted walls and ceiling. "Premium paint" is not standard grade.
   - L748: "Permits and Final Cleanup ... debris removal · fixed" is two steps in one line (PROCEDURE_RULES: "two different steps are never priced as one line"), and the debris is already on L736.

   Rewrite the example from the method: a 12x14 same-layout kitchen at 24-32 lines.
7. **Line minimums (L750-752).** "Minimum 8-15 line items for kitchen remodels; Minimum 6-12 line items for bathroom remodels" passes an 8-line full bath. The procedure block (`procedures/index.ts` L117) already demands at least the core step count. Drop the fixed minimums. Typical counts: a full hall bath 22-30 lines, a full kitchen 24-32, a like-for-like swap 4-7.
8. **Consumables as a line (L616).** "Fasteners, nails, caulk, sealants, adhesives → sqft ... or fixed" makes consumables a line. It was written for siding, but a small model generalizes it: "Sealants and fasteners — fixed" appeared in the discipline rulebook's sink trigger, and both reviews struck it. Proposed: "consumables ride inside the line they serve".
9. **Zero prices (L793).** "Every line has a quantity > 0 and a unitPrice > 0" conflicts with L739 ("labor $0"), L762 and PROCEDURE_RULES L89 ("a labor-only step has materialCost 0"). Proposed: "no ledger line has a zero quantity or price; a supply-only or labor-only task appears in one ledger".
10. **Two rate tables (L725).** L725 and the method's section 8 give different hourly rates. Keep one table.
11. **Price sources.** L51 (PRICING_RULES) prices every line "from the PRICING GUIDELINES", while PROCEDURE_RULES L92 says the trade profile's anchors govern. With the method's section 8, a remodel prompt carries three sources that disagree (backsplash $10-30 against $3-15; a circuit $200-500 against $450-900). Proposed: one source per number. The corrected anchors govern line prices; section 8 checks the total.
12. **Wall area (L136).** "Wall area ... (perimeter × ceiling height − openings)" is kept; the method follows it. The structure rulebook's convention (no deduction under 10% of the wall) must not be carried into the domain parts, or the prompt will hold two paint quantities.

**Adjacent layers in the same prompt:**
- `estimate-prompt.ts` L82 says every trade-profile phase is "REQUIRED as its own line ... including allowances, consumables, permit and cleanup". `detectTrade` picks the kitchen profile for any brief containing "kitchen", so "replace the kitchen sink" is told to print cabinets, countertops, flooring and a permit. That breaks brief-binding, and "consumables" as a line breaks owner's rule 4. Proposed: "phases are the steps of a full job; a smaller brief writes only the phases it touches".
- `estimate-prompt.ts` L105 (rule 2) puts "consumables and fasteners" in the ALWAYS list, and defaults to "8-16" lines when a profile sets no range.

## F. Decisions the method made that you may want to reverse

- **Contingency.** The discipline rulebook wanted a 10-15% contingency line on any job that opens walls. The kitchen, interior, structure, MEP and bathroom rulebooks list "contingency" as a never-line, and the structure estimator review names the pattern to use instead. The method uses the change-order clause, plus a named allowance only when the brief, a photo or an answer names the condition.
- **Who supplies fixtures.** The kitchen rulebook defaults sinks and faucets to owner-supplied. The method defaults appliances to the owner, and plumbing fixtures, lights and finishes to the contractor at named allowances, which matches the master prompt's own example and the discipline and MEP totals.
- **Project management.** The discipline rulebook bills supervision hours on any two-trade job; the bathroom rulebook bans a "project management" line because the markup covers it. The method takes no side. Decide whether your org's markup includes supervision.
- **Seattle-area labor.** The Seattle rates for HVAC, tile, carpentry, paint, drywall and general labor in section 8 are the national rates times the reviewed metro factor. No review gave those numbers directly.
