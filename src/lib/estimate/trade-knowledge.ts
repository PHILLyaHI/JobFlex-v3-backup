// TRADE KNOWLEDGE — what an experienced estimator already knows about a job
// before the first line is priced.
//
// WHY IT EXISTS (owner, 2026-09-03)
//
// The previous JobFlex estimated in ONE model call fed by a trade catalog: a
// per-trade preamble (which phases a job of this kind always has, and the unit
// each phase is sold in), the questions an estimator would ask, and a book of
// unit-price anchors. Its estimates read like a contractor wrote them — twelve
// scope sentences, prep and permits and cleanup included, labor that scaled
// with the roof. This build had replaced that with a MATERIALS planner feeding
// a product matcher, so the estimate was only ever as complete as the bill of
// materials, labor-only phases were an afterthought, and prices were guessed
// with nothing to anchor to.
//
// This file is that catalog, written for this codebase: residential trades,
// each with the phases a complete estimate covers, the unit per phase, the
// unit-price anchors (US 2025, standard grade) and the planning questions.
// `detectTrade` picks one from the brief by keyword. Everything here is a
// plain constant — no I/O, safe on the client and the server.
//
// Units are the manual builder's ten (console-model ESTIMATE_UNITS).

export type TradeProfile = {
  id: string;
  name: string;
  /** Words that name this trade outright; any one of them wins the match. */
  primary: string[];
  /** Supporting vocabulary, scored by count. */
  keywords: string[];
  /** How a proposal for this trade is built — phases and their units. */
  preamble: string;
  /** Phases a complete estimate covers, in order. Each becomes a line. */
  phases: string[];
  /** Unit-price anchors: material $/unit and labor $/unit, standard grade. */
  anchors: string[];
  keyQuestions: string[];
};

export const TRADES: TradeProfile[] = [
  {
    id: "roofing",
    name: "Roofing",
    primary: ["roof", "roofing", "shingle", "shingles", "re-roof", "reroof"],
    keywords: ["tear-off", "tear off", "underlayment", "ridge", "drip edge", "flashing", "ice and water", "ice & water", "asphalt", "metal roof", "skylight", "gutter"],
    preamble:
      "Roofing proposal. A complete re-roof always has: tear-off and disposal of the existing roof (sqft, labor), replacement of damaged decking found after tear-off (unit = sheets, an allowance), ice & water shield at eaves and valleys (sqft), synthetic underlayment over the whole deck (sqft), the shingle system supplied by the square (sq boards, 1 = 100 sqft, 10-15% waste), drip edge at eaves and rakes (linear ft), ridge vent (linear ft), ridge cap shingles (linear ft), pipe boots and penetration flashings (unit), step and wall flashing where the roof meets walls (linear ft), nails/sealant/starter consumables (fixed), permit and inspection (fixed), and final cleanup with a magnetic nail sweep (fixed). Roof area = footprint × pitch factor; a 2,400 sqft roof is 24 squares before waste. Roofing LABOR is priced per sqft or per square, never per sheet or bundle.",
    phases: [
      "Tear-off and disposal of the existing shingles down to the deck",
      "Replace damaged roof decking found after tear-off (allowance)",
      "Ice & water shield at eaves, valleys and penetrations",
      "Synthetic underlayment over the full deck",
      "Drip edge at eaves and rakes",
      "Supply and install architectural shingles",
      "Starter strip and hip/ridge cap shingles",
      "Ridge vent",
      "Pipe boots, vents and penetration flashings",
      "Step, wall and chimney flashing",
      "Nails, sealant and consumables",
      "Permit and inspection",
      "Final cleanup, haul-off and magnetic nail sweep",
    ],
    anchors: [
      "Tear-off + disposal, one layer: labor $1.20-2.00/sqft (add $0.50-0.90/sqft per extra layer); dumpster $400-700 fixed if separate",
      "Architectural shingles (30-yr, Class A): material $110-160/sq boards; install labor $150-260/sq boards",
      "Synthetic underlayment: material $0.25-0.45/sqft; labor $0.15-0.30/sqft",
      "Ice & water shield: material $0.60-1.10/sqft; labor $0.30-0.60/sqft",
      "Drip edge, aluminum: material $1.50-3.00/linear ft; labor $1.50-2.50/linear ft",
      "Ridge vent: material $8-14/linear ft; labor $4-8/linear ft",
      "Hip/ridge cap shingles: material $3-5/linear ft; labor $2-4/linear ft",
      "Starter strip: material $1-1.50/linear ft; labor $0.50-1.00/linear ft",
      "Pipe boot / vent flashing: material $20-45/unit; labor $35-60/unit",
      "Step / wall flashing: material $2-4/linear ft; labor $3-6/linear ft",
      "Decking replacement, 1/2 in OSB or CDX: material $45-70/unit (sheet); labor $40-70/unit",
      "Consumables (nails, sealant, caulk): $200-400 fixed on a 20-30 square roof",
      "Roofing permit + inspection: $250-600 fixed",
      "Final cleanup + magnetic sweep: labor $250-450 fixed",
    ],
    keyQuestions: [
      "How many layers come off, and is the decking sound?",
      "Roof pitch and stories — steep or two-story work adds 15-30% labor",
      "Ventilation and flashing details (ridge vent, chimney, skylights)",
    ],
  },
  {
    id: "siding",
    name: "Siding",
    primary: ["siding", "hardie", "clapboard", "board and batten", "vinyl siding"],
    keywords: ["housewrap", "wrb", "trim", "fascia", "soffit", "corner boards", "lap"],
    preamble:
      "Siding proposal. Phases: mobilization and site protection (fixed), remove and dispose of existing siding (sqft), sheathing repair allowance (unit = sheets), housewrap/WRB (sqft), head and Z-flashings at openings (linear ft), siding supply and install (sqft, net wall area with 10% waste), corner boards (linear ft), window and door casing (linear ft), soffit and fascia (linear ft), caulk and fasteners (fixed), paint or touch-up (sqft), scaffolding or lift for two-story work (fixed), cleanup (fixed). Net wall area = perimeter × height minus openings.",
    phases: [
      "Mobilization, site protection and staging",
      "Remove and dispose of existing siding",
      "Sheathing repair allowance",
      "Housewrap / weather-resistive barrier",
      "Head flashing and Z-flashing at openings",
      "Supply and install siding",
      "Corner boards",
      "Window and door casing trim",
      "Soffit and fascia",
      "Caulk, sealant and fasteners",
      "Lift / scaffolding for upper stories",
      "Final cleanup and haul-off",
    ],
    anchors: [
      "Siding removal + disposal: labor $1.00-2.00/sqft",
      "Fiber-cement lap siding: material $2.50-4.00/sqft; labor $3.50-5.50/sqft",
      "Vinyl siding: material $1.50-3.00/sqft; labor $2.50-4.00/sqft",
      "Cedar / wood siding: material $4.00-8.00/sqft; labor $4.00-6.50/sqft",
      "Housewrap: material $0.15-0.30/sqft; labor $0.40-0.70/sqft",
      "Trim / corner boards / casing (fiber-cement or primed): material $3-5/linear ft; labor $3-4/linear ft",
      "Head / Z flashing: material $0.80-1.50/linear ft; labor $0.80-1.25/linear ft",
      "Soffit + fascia: material $4-8/linear ft; labor $4-7/linear ft",
      "Scissor lift / scaffolding: $150-250 per day, fixed",
      "Sheathing repair: material $45-70/unit; labor $50-80/unit",
    ],
    keyQuestions: ["Stories and access — lift or scaffold?", "Existing siding type and what is under it", "Trim profile and paint scope"],
  },
  {
    id: "gutters",
    name: "Gutters",
    primary: ["gutter", "gutters", "downspout", "downspouts", "leaf guard", "gutter guard"],
    keywords: ["seamless", "aluminum", "fascia", "splash block", "two-story", "colonial"],
    preamble:
      "Gutter proposal. Phases: remove and dispose of existing gutters and downspouts (linear ft), fascia repair allowance (linear ft), seamless aluminum gutters supplied and installed (linear ft), downspouts (linear ft or unit per drop), outlets, end caps, miters and hangers (unit or fixed), leaf guards if requested (linear ft), splash blocks or drain tie-ins (unit), cleanup (fixed). A two-story colonial runs 150-220 linear ft of gutter and 4-6 downspouts.",
    phases: [
      "Remove and dispose of existing gutters and downspouts",
      "Fascia repair allowance",
      "Seamless aluminum gutters, supplied and installed",
      "Downspouts and elbows",
      "Miters, end caps, outlets and hidden hangers",
      "Leaf guards",
      "Splash blocks / downspout extensions",
      "Final cleanup",
    ],
    anchors: [
      "Removal: labor $1-2/linear ft",
      "5 in seamless aluminum gutter: material $4-7/linear ft; labor $5-9/linear ft (6 in: +25%)",
      "Downspout, 2x3 or 3x4 aluminum: material $3-6/linear ft; labor $4-7/linear ft",
      "Leaf guard, micro-mesh: material $6-14/linear ft; labor $3-6/linear ft",
      "Miters / end caps / outlets: material $8-20/unit; labor $10-20/unit",
      "Fascia repair: material $4-8/linear ft; labor $5-9/linear ft",
    ],
    keyQuestions: ["Total run and number of downspouts", "Stories and roof edge access", "Guards, color, 5 in or 6 in"],
  },
  {
    id: "fencing",
    name: "Fencing",
    primary: ["fence", "fencing", "fences", "privacy fence", "picket"],
    keywords: ["cedar", "vinyl", "chain link", "gate", "posts", "rails", "pickets", "post caps", "sloped"],
    preamble:
      "Fence proposal. Phases: remove and haul off the existing fence (linear ft), layout and utility locate (fixed), post holes and concrete (unit = posts, one post per 6-8 ft), posts (unit), rails and pickets or panels supplied and installed (linear ft of run), gates with hardware (unit), post caps and trim (unit or linear ft), stain or seal if requested (sqft of face), cleanup (fixed). A 20 ft run is quantity 20 at a price per linear ft — never a package count.",
    phases: [
      "Remove and haul off existing fence",
      "Layout, utility locate and site prep",
      "Dig post holes and set posts in concrete",
      "Supply and install fence panels / rails and pickets",
      "Gate with hinges and latch",
      "Post caps and finish trim",
      "Stain or seal (if requested)",
      "Final cleanup and haul-off",
    ],
    anchors: [
      "Old fence removal: labor $3-6/linear ft",
      "6 ft cedar privacy fence: material $18-30/linear ft; labor $12-22/linear ft (7 ft: +15%)",
      "Vinyl privacy fence: material $25-40/linear ft; labor $12-20/linear ft",
      "Chain link 4-6 ft: material $8-18/linear ft; labor $8-15/linear ft",
      "4x4 pressure-treated post set in concrete: material $18-30/unit (post + 1-2 bags concrete); labor $35-60/unit",
      "Single walk gate, 4 ft, with hardware: material $150-300/unit; labor $100-200/unit",
      "Sloped / rocky yard: +10-25% labor",
    ],
    keyQuestions: ["Total run, height, style and material", "Number and width of gates", "Slope, soil and access for digging"],
  },
  {
    id: "decking",
    name: "Decks",
    primary: ["deck", "decking", "trex", "composite deck"],
    keywords: ["railing", "stairs", "joists", "ledger", "footings", "balusters", "frame"],
    preamble:
      "Deck proposal. Phases: remove existing decking/railing (sqft), frame inspection and joist repair or new frame (sqft or linear ft), footings and posts for new frames (unit), deck boards supplied and installed (sqft, 10% waste), fascia and skirting (linear ft), railing with posts and balusters (linear ft), stairs (unit = treads or per flight), hardware and fasteners (fixed), stain/seal for wood (sqft), permit (fixed), cleanup (fixed).",
    phases: [
      "Remove existing deck boards and railing",
      "Inspect and repair frame / new framing",
      "Footings and posts (new frame only)",
      "Supply and install deck boards",
      "Fascia and skirting",
      "Railing with posts and balusters",
      "Stairs",
      "Hardware, fasteners and hidden clips",
      "Permit and inspection",
      "Final cleanup and haul-off",
    ],
    anchors: [
      "Demo of decking + railing: labor $2-4/sqft",
      "Composite decking: material $8-15/sqft; labor $8-15/sqft",
      "Pressure-treated decking: material $3-6/sqft; labor $6-12/sqft",
      "New framing (joists, beams, ledger): material $6-10/sqft; labor $8-14/sqft",
      "Footing + post: material $60-120/unit; labor $120-250/unit",
      "Composite railing: material $30-60/linear ft; labor $20-35/linear ft",
      "Stairs: $150-300 per tread installed (unit)",
      "Permit: $200-500 fixed",
    ],
    keyQuestions: ["Reuse the frame or rebuild?", "Height, railing style and stairs", "Board brand and color"],
  },
  {
    id: "tile",
    name: "Tile",
    primary: ["tile", "tiling", "porcelain", "ceramic tile", "backsplash", "tile floor", "shower tile"],
    keywords: ["thinset", "grout", "backer", "schluter", "waterproof", "mosaic", "large format", "12x24"],
    preamble:
      "Tile proposal. Phases: protect adjacent finishes and mobilize (fixed), remove existing floor finish (sqft), substrate prep — scrape, clean, patch, level (sqft), underlayment or cement board / uncoupling membrane (sqft), tile supplied (sqft, 10-15% waste), thinset and setting materials (sqft), tile installation labor (sqft), grout and joint finishing (sqft), perimeter sealant (linear ft), transitions and edge profiles (linear ft), sealer where required (sqft), final cleanup (fixed). Showers add waterproofing (sqft), a pan or curb (fixed/linear ft), and niche/bench (unit).",
    phases: [
      "Protect adjacent finishes, stage materials and mobilize",
      "Remove existing floor finish and dispose",
      "Substrate preparation — scrape, clean, patch and level",
      "Underlayment / cement board / uncoupling membrane",
      "Supply porcelain tile",
      "Thinset mortar and setting materials",
      "Install tile — layout, cuts, spacing and setting",
      "Grout, joint filling and cleanup",
      "Perimeter and transition sealant",
      "Transition strips / edge profiles",
      "Grout or tile sealer",
      "Final detailing and cleanup",
    ],
    anchors: [
      "Floor finish removal: labor $1.50-3.50/sqft (tile demo $3-5/sqft)",
      "Substrate prep / patching: material $0.40-0.80/sqft; labor $1.00-2.00/sqft",
      "Cement board or uncoupling membrane: material $1.50-2.50/sqft; labor $1.50-2.50/sqft",
      "Porcelain tile, standard: material $3.00-8.00/sqft (premium $8-20)",
      "Thinset + setting materials: material $0.60-1.20/sqft",
      "Tile installation labor: $8-14/sqft floor; $12-20/sqft walls and showers; small-format or herringbone +30%",
      "Grout + joint finishing: material $0.30-0.60/sqft; labor $1.00-1.50/sqft",
      "Perimeter sealant: material $0.50-1.00/linear ft; labor $1.50-2.50/linear ft",
      "Transition / Schluter profile: material $4-8/linear ft; labor $3-5/linear ft",
      "Sealer: material $0.30-0.50/sqft; labor $0.50-0.80/sqft",
      "Shower waterproofing membrane: material $2-4/sqft; labor $3-5/sqft",
    ],
    keyQuestions: ["Existing floor and substrate condition", "Tile size, pattern and grade", "Wet area — waterproofing and pan?"],
  },
  {
    id: "flooring",
    name: "Flooring",
    primary: ["flooring", "hardwood", "laminate", "vinyl plank", "lvp", "carpet", "engineered wood", "refinish"],
    keywords: ["underlayment", "subfloor", "baseboard", "transition", "plank", "floor"],
    preamble:
      "Flooring proposal. Phases: mobilize and protect (fixed), remove existing flooring (sqft), subfloor repair allowance (unit = sheets), leveling (sqft), underlayment / vapor barrier (sqft), flooring supplied (sqft, 10% waste), installation labor (sqft), transitions and reducers (linear ft), baseboard or shoe molding remove/reinstall (linear ft), cleanup (fixed). Carpet is sold by the sq yard; hardwood refinishing is sanding + finish per sqft.",
    phases: [
      "Mobilize and protect adjacent finishes",
      "Remove and dispose of existing flooring",
      "Subfloor repair allowance",
      "Floor leveling / prep",
      "Underlayment / vapor barrier",
      "Supply flooring",
      "Install flooring",
      "Transitions and reducers",
      "Baseboard / shoe molding",
      "Final cleanup",
    ],
    anchors: [
      "Flooring removal: labor $1.00-2.50/sqft (glued-down $2-4)",
      "LVP: material $2.50-5.00/sqft; labor $2.00-3.50/sqft",
      "Engineered hardwood: material $5-10/sqft; labor $4-7/sqft",
      "Solid hardwood, nail-down: material $6-12/sqft; labor $5-8/sqft",
      "Laminate: material $1.50-4.00/sqft; labor $2-3/sqft",
      "Carpet + pad: material $2-5/sqft; labor $1-2/sqft (or $18-45/sq yards)",
      "Hardwood refinish (sand + 3 coats): labor $3-5/sqft; material $0.50-1.00/sqft",
      "Underlayment: material $0.30-0.70/sqft; labor $0.30-0.50/sqft",
      "Transitions: material $4-8/linear ft; labor $3-5/linear ft",
      "Baseboard R&R: labor $2-3/linear ft; new base material $2-5/linear ft",
    ],
    keyQuestions: ["Existing floor and subfloor", "Product, thickness and install method", "Rooms, transitions and stairs"],
  },
  {
    id: "painting",
    name: "Painting",
    primary: ["paint", "painting", "repaint", "stain"],
    keywords: ["primer", "walls", "ceiling", "trim", "exterior", "interior", "coats", "caulk", "pressure wash"],
    preamble:
      "Painting proposal. Interior phases: protect floors and furniture (fixed), prep — patch, sand, caulk (sqft), primer where needed (sqft), walls two coats (sqft of wall area), ceilings (sqft), trim and doors (linear ft or unit), cleanup (fixed). Exterior adds pressure washing (sqft), scraping and priming bare wood (sqft), siding two coats (sqft), trim/fascia (linear ft), and lift/ladder work (fixed). Wall area = perimeter × height; one gallon covers ~350 sqft per coat.",
    phases: [
      "Protect floors, furniture and fixtures",
      "Surface prep — patch, sand, caulk",
      "Primer",
      "Walls, two coats",
      "Ceilings",
      "Trim, doors and casing",
      "Final cleanup",
    ],
    anchors: [
      "Interior walls, 2 coats: material $0.40-0.80/sqft; labor $1.50-3.00/sqft",
      "Ceilings: material $0.30-0.60/sqft; labor $1.50-2.50/sqft",
      "Trim / base / casing: material $0.50-1.00/linear ft; labor $1.50-3.00/linear ft",
      "Doors: material $8-15/unit; labor $50-90/unit",
      "Prep (patch, sand, caulk): material $0.10-0.30/sqft; labor $0.50-1.50/sqft",
      "Exterior siding, 2 coats: material $0.60-1.20/sqft; labor $2.00-4.00/sqft",
      "Pressure wash: labor $0.20-0.40/sqft",
    ],
    keyQuestions: ["Surfaces, condition and colors", "Ceiling height and trim scope", "Occupied — phasing and protection"],
  },
  {
    id: "drywall",
    name: "Drywall",
    primary: ["drywall", "sheetrock", "gypsum", "plaster"],
    keywords: ["tape", "mud", "texture", "level 4", "level 5", "hang", "finish"],
    preamble:
      "Drywall proposal. Phases: protection and setup (fixed), demolition of damaged board (sqft), hang (sqft, 8% waste), tape/mud/sand to the specified level (sqft), corner bead (linear ft), texture or skim (sqft), primer (sqft), cleanup (fixed).",
    phases: ["Protection and setup", "Remove damaged drywall", "Hang drywall", "Tape, mud and sand", "Corner bead", "Texture / skim coat", "Primer", "Final cleanup"],
    anchors: [
      "1/2 in drywall hung: material $0.60-1.00/sqft; labor $0.80-1.50/sqft",
      "Tape + finish level 4: material $0.20-0.40/sqft; labor $1.00-1.80/sqft (level 5 +$0.60)",
      "Corner bead: material $0.30-0.60/linear ft; labor $0.80-1.20/linear ft",
      "Texture: material $0.15-0.30/sqft; labor $0.60-1.20/sqft",
      "Demo: labor $0.80-1.50/sqft",
    ],
    keyQuestions: ["Finish level and texture", "Ceiling height and access", "Moisture or fire-rated board?"],
  },
  {
    id: "kitchen",
    name: "Kitchen remodel",
    primary: ["kitchen", "kitchen remodel", "cabinets", "cabinetry", "countertop", "countertops", "backsplash"],
    keywords: ["island", "quartz", "granite", "appliances", "sink", "faucet", "range", "dishwasher", "shaker"],
    preamble:
      "Kitchen remodel proposal. Phases: protection and mobilization (fixed), demolition of cabinets, counters, backsplash, flooring, appliances and haul-off (sqft or fixed), plumbing rough-in changes (fixed or unit per fixture), electrical rough-in — circuits, outlets, lighting (fixed or unit), drywall patch and paint (sqft), base cabinets (linear ft), upper cabinets (linear ft), island (linear ft), countertops fabricated and installed (sqft), backsplash tile (sqft), sink and faucet (unit), appliance installation (unit or fixed), flooring (sqft), trim and finish (linear ft), permit (fixed), final cleanup (fixed). A kitchen has 8-15 lines.",
    phases: [
      "Protect adjacent areas and mobilize",
      "Demolition of cabinets, countertops, backsplash and flooring; haul-off",
      "Plumbing rough-in and relocation",
      "Electrical rough-in — circuits, outlets, under-cabinet and ceiling lighting",
      "Drywall patching and paint",
      "Base cabinets",
      "Upper cabinets",
      "Island cabinets",
      "Countertops — fabricate and install",
      "Backsplash tile",
      "Sink, faucet and disposal",
      "Appliance installation and hookup",
      "Flooring",
      "Trim, toe kicks and finish carpentry",
      "Permit and inspections",
      "Final cleanup",
    ],
    anchors: [
      "Demo + haul-off: labor $4-8/sqft of kitchen; dumpster $400-700 fixed",
      "Stock cabinets: material $100-200/linear ft; semi-custom $200-400; custom $400-800; install labor $50-100/linear ft",
      "Quartz countertop: material $60-120/sqft installed (fabricator); granite $50-100; laminate $20-40",
      "Backsplash tile: material $10-30/sqft; labor $15-25/sqft",
      "Sink + faucet: material $300-900/unit; labor $250-450/unit",
      "Plumbing rough-in: $500-1,500 per fixture (unit) or $800-2,500 fixed",
      "Electrical: $200-500 per circuit; outlets/switches $80-150/unit; under-cabinet LED $20-40/linear ft installed",
      "Appliance install + hookup: labor $100-250/unit",
      "Paint: material $0.50/sqft; labor $2-3/sqft",
    ],
    keyQuestions: ["Layout change or same footprint?", "Cabinet grade and countertop material", "Appliances by owner or by contractor?"],
  },
  {
    id: "bathroom",
    name: "Bathroom remodel",
    primary: ["bathroom", "bath remodel", "bathroom remodel", "shower", "tub", "vanity", "powder room", "master bath"],
    keywords: ["toilet", "tile", "glass", "exhaust fan", "waterproof", "niche", "kerdi", "freestanding"],
    preamble:
      "Bathroom remodel proposal. Phases: protection and mobilization (fixed), gut demolition and haul-off (sqft or fixed), plumbing rough-in (unit per fixture or fixed), electrical — GFCI, fan, lighting (unit or fixed), framing and blocking (fixed), cement board and waterproofing (sqft), shower pan / curb (fixed), floor tile (sqft), wall and shower tile (sqft), vanity and top (unit), toilet (unit), tub or shower fixtures and valve (unit), shower glass (linear ft or unit), mirror, lighting and accessories (unit), drywall and paint (sqft), exhaust fan (unit), permit (fixed), cleanup (fixed). 6-12 lines minimum.",
    phases: [
      "Protect adjacent areas and mobilize",
      "Demolition and haul-off",
      "Plumbing rough-in",
      "Electrical — GFCI outlets, exhaust fan, lighting",
      "Framing, blocking and niche",
      "Cement board and waterproofing",
      "Shower pan and curb",
      "Floor tile",
      "Wall and shower tile",
      "Vanity, top, sink and faucet",
      "Toilet",
      "Tub / shower valve, trim and head",
      "Shower glass",
      "Mirror, lighting and accessories",
      "Drywall, paint and trim",
      "Permit and inspections",
      "Final cleanup",
    ],
    anchors: [
      "Gut demo + haul-off, full bath: labor $1,200-2,500 fixed (or $15-30/sqft)",
      "Plumbing rough-in: $500-1,500/unit per fixture",
      "Electrical: GFCI $120-200/unit; exhaust fan $350-600/unit installed; vanity light $150-300/unit installed",
      "Cement board + waterproofing: material $2-4/sqft; labor $3-5/sqft",
      "Shower pan (tile-ready system) + curb: material $400-900 fixed; labor $600-1,200 fixed",
      "Tile: floor material $4-10/sqft, labor $10-15/sqft; shower walls material $5-15/sqft, labor $14-22/sqft",
      "Vanity + top: material $400-1,500/unit; labor $250-450/unit",
      "Toilet: material $200-600/unit; labor $150-300/unit",
      "Shower valve + trim: material $200-800/unit; labor $250-500/unit",
      "Frameless glass: $500-1,200/linear ft installed",
      "Paint: labor $2-3/sqft",
    ],
    keyQuestions: ["Tub-to-shower conversion or like-for-like?", "Tile scope — floor only or full shower?", "Fixture grade"],
  },
  {
    id: "concrete",
    name: "Concrete",
    primary: ["concrete", "slab", "driveway", "patio", "sidewalk", "footing", "foundation"],
    keywords: ["pour", "rebar", "forms", "gravel", "excavation", "cubic", "broom finish", "stamped"],
    preamble:
      "Concrete proposal. Phases: demolition and haul-off of existing concrete (sqft), excavation and grading (sqft or cu yards), compacted gravel base (cu yards or sqft), forms (linear ft), rebar or mesh (sqft), vapor barrier where required (sqft), concrete placed and finished (cu yards or sqft), control joints (linear ft), sealer (sqft), cleanup (fixed). Volume = area × thickness ÷ 27 (4 in slab: 1 cu yard per 81 sqft).",
    phases: ["Demolition and haul-off of existing concrete", "Excavation and grading", "Compacted gravel base", "Forming", "Rebar / wire mesh", "Concrete placement and finishing", "Control joints", "Sealer", "Final cleanup"],
    anchors: [
      "Demo + haul-off: labor $2-5/sqft",
      "Excavation + grading: labor $1.50-3.00/sqft",
      "Gravel base: material $35-55/cu yards; labor $1.00-2.00/sqft",
      "Forms: material $1-2/linear ft; labor $2-4/linear ft",
      "Rebar / mesh: material $0.50-1.20/sqft; labor $0.40-0.80/sqft",
      "Concrete 4 in, broom finish: material $160-220/cu yards; labor $4-7/sqft (stamped $8-14/sqft)",
      "Sealer: material $0.20-0.40/sqft; labor $0.30-0.60/sqft",
    ],
    keyQuestions: ["Thickness, finish and reinforcement", "Access for trucks and pump", "Drainage and slope"],
  },
  {
    id: "electrical",
    name: "Electrical",
    primary: ["electrical", "electrician", "panel", "breaker", "wiring", "rewire", "ev charger", "outlet", "outlets"],
    keywords: ["circuit", "gfci", "recessed", "lighting", "200 amp", "subpanel", "generator"],
    preamble:
      "Electrical proposal. Phases: permit (fixed), panel or service work (unit or fixed), circuits run (unit per circuit), devices — outlets, switches, GFCI (unit), fixtures — recessed cans, ceiling fans (unit), low voltage (unit), drywall patching after fishing wire (sqft), inspection and cleanup (fixed). Count devices; never lump 70 outlets into one fixed line.",
    phases: ["Permit and inspection", "Panel / service work", "New circuits", "Outlets, switches and GFCI devices", "Light fixtures and recessed cans", "Drywall patching", "Cleanup"],
    anchors: [
      "200 A panel upgrade: material $800-1,500; labor $1,500-2,500 (unit)",
      "New 20 A circuit: material $80-150/unit; labor $200-400/unit",
      "Outlet / switch / GFCI: material $5-30/unit; labor $60-120/unit",
      "Recessed LED can: material $30-80/unit; labor $90-150/unit",
      "EV charger circuit (50 A): material $300-600; labor $500-900 (unit)",
      "Electrician hourly: $80-150/hour",
    ],
    keyQuestions: ["Panel capacity and location", "Device counts per room", "Finished walls — patching needed?"],
  },
  {
    id: "plumbing",
    name: "Plumbing",
    primary: ["plumbing", "plumber", "water heater", "repipe", "sewer", "drain", "faucet", "toilet"],
    keywords: ["pex", "copper", "tankless", "valve", "supply", "waste", "vent", "fixture"],
    preamble:
      "Plumbing proposal. Phases: permit (fixed), rough-in supply and drain per fixture (unit), fixtures supplied and set (unit), water heater (unit), repipe by linear ft of run or per fixture, drywall/access openings and patching (fixed or sqft), testing, inspection and cleanup (fixed).",
    phases: ["Permit and inspection", "Rough-in supply and drain", "Fixture supply and installation", "Water heater", "Access openings and patching", "Testing and cleanup"],
    anchors: [
      "Rough-in per fixture: material $150-300/unit; labor $400-1,200/unit",
      "Toilet set: material $200-600/unit; labor $150-300/unit",
      "Faucet: material $100-400/unit; labor $120-250/unit",
      "50 gal tank water heater: material $800-1,500/unit; labor $500-900/unit; tankless material $1,200-2,500, labor $1,200-2,000",
      "PEX repipe: material $2-4/linear ft; labor $8-15/linear ft",
      "Plumber hourly: $90-160/hour",
    ],
    keyQuestions: ["Fixture count and locations", "Existing pipe material and access", "Gas or electric water heater"],
  },
  {
    id: "hvac",
    name: "HVAC",
    primary: ["hvac", "furnace", "heat pump", "air conditioner", "ac unit", "mini split", "ductwork", "condenser"],
    keywords: ["ton", "btu", "seer", "thermostat", "refrigerant", "duct", "register"],
    preamble:
      "HVAC proposal. Phases: permit (fixed), remove and dispose of old equipment (unit), equipment supplied (unit), installation labor (unit or fixed), line set and electrical whip (linear ft / fixed), ductwork (linear ft or unit per run), registers and grilles (unit), thermostat (unit), startup, commissioning and cleanup (fixed).",
    phases: ["Permit and inspection", "Remove and dispose of old equipment", "Equipment", "Installation", "Line set, condensate and electrical connection", "Ductwork modifications", "Registers and grilles", "Thermostat", "Startup, commissioning and cleanup"],
    anchors: [
      "3-ton heat pump system: material $5,000-9,000/unit; labor $2,500-4,500/unit",
      "Gas furnace 80k BTU: material $2,000-4,000/unit; labor $1,500-2,500/unit",
      "Mini split single zone: material $1,500-3,500/unit; labor $1,200-2,500/unit",
      "Ductwork: material $8-15/linear ft; labor $15-30/linear ft",
      "Thermostat: material $80-300/unit; labor $100-180/unit",
    ],
    keyQuestions: ["Tonnage / load and fuel", "Existing ductwork condition", "Electrical capacity for the new unit"],
  },
  {
    id: "windows-doors",
    name: "Windows & doors",
    primary: ["window", "windows", "door", "doors", "entry door", "slider", "french door", "garage door"],
    keywords: ["vinyl", "fiberglass", "replacement", "retrofit", "casing", "flashing", "trim"],
    preamble:
      "Window and door proposal. Phases: remove existing unit (unit), supply new unit (unit — size and type in the name), install with flashing, shims, foam and sealant (unit), interior casing and exterior trim (linear ft), paint touch-up (unit), haul-off (fixed). Count every opening.",
    phases: ["Remove existing windows / doors", "Supply new windows / doors", "Install, flash, foam and seal", "Interior casing and exterior trim", "Paint / touch-up", "Haul-off and cleanup"],
    anchors: [
      "Vinyl replacement window, standard size: material $350-700/unit; labor $200-400/unit",
      "Fiberglass entry door with frame: material $1,200-3,000/unit; labor $400-800/unit",
      "Sliding patio door: material $1,000-2,500/unit; labor $500-900/unit",
      "Casing / trim: material $2-5/linear ft; labor $3-5/linear ft",
      "Garage door 16x7 insulated: material $1,200-2,500/unit; labor $400-700/unit",
    ],
    keyQuestions: ["Count, sizes and types", "Full-frame or insert replacement", "Exterior cladding and trim details"],
  },
  {
    id: "insulation",
    name: "Insulation",
    primary: ["insulation", "insulate", "blown-in", "spray foam", "batt"],
    keywords: ["attic", "crawlspace", "r-value", "r-38", "air seal", "vapor barrier"],
    preamble:
      "Insulation proposal. Phases: air sealing (sqft or fixed), remove old insulation if required (sqft), baffles and dams (unit or linear ft), insulation installed by area (sqft) at the specified R-value, vapor barrier (sqft), cleanup (fixed).",
    phases: ["Air sealing", "Remove old insulation", "Baffles and dams", "Install insulation", "Vapor barrier", "Cleanup"],
    anchors: [
      "Blown-in attic to R-38: material $0.80-1.30/sqft; labor $0.70-1.20/sqft",
      "Fiberglass batts R-13/R-19: material $0.50-1.00/sqft; labor $0.60-1.00/sqft",
      "Closed-cell spray foam 2 in: material $1.50-2.50/sqft; labor $1.50-2.50/sqft",
      "Air sealing: labor $0.50-1.00/sqft or $400-900 fixed",
      "Removal: labor $1.00-2.00/sqft",
    ],
    keyQuestions: ["Target R-value and area", "Access and existing insulation", "Ventilation baffles needed?"],
  },
  {
    id: "landscape",
    name: "Landscape & hardscape",
    primary: ["landscaping", "landscape", "paver", "pavers", "retaining wall", "sod", "irrigation", "hardscape"],
    keywords: ["mulch", "gravel", "plants", "turf", "grading", "drainage", "sprinkler"],
    preamble:
      "Landscape proposal. Phases: demolition and grading (sqft or cu yards), base material (cu yards), pavers or wall block supplied and installed (sqft / sqft of face), edging (linear ft), plants and trees (unit), mulch or gravel (cu yards), sod or seed (sqft), irrigation zones (unit), cleanup (fixed).",
    phases: ["Demolition and grading", "Base material", "Pavers / wall block", "Edging and restraint", "Plants and trees", "Mulch / gravel", "Sod / seed", "Irrigation", "Cleanup"],
    anchors: [
      "Paver patio: material $6-12/sqft; labor $10-18/sqft",
      "Retaining wall block: material $15-30/sqft of face; labor $20-40/sqft",
      "Sod: material $0.50-0.90/sqft; labor $0.50-0.80/sqft",
      "Mulch: material $35-60/cu yards; labor $30-50/cu yards",
      "Irrigation: $600-1,200 per zone (unit)",
      "Grading: labor $1.00-2.50/sqft",
    ],
    keyQuestions: ["Area and slope", "Drainage and access", "Plant list and sizes"],
  },
  {
    id: "demolition",
    name: "Demolition",
    primary: ["demolition", "demo only", "tear down", "gut"],
    keywords: ["haul", "dumpster", "debris", "remove", "strip"],
    preamble:
      "Demolition proposal. Phases: protection and containment (fixed), demolition by area or by item (sqft or unit), dumpster and disposal (fixed per load), hazardous material handling if noted (fixed), broom-clean cleanup (fixed).",
    phases: ["Protection and containment", "Demolition", "Dumpster and disposal", "Final cleanup"],
    anchors: ["Interior demo: labor $3-8/sqft", "Dumpster 20 yd: $450-700 fixed per load", "Hourly labor: $45-75/hour"],
    keyQuestions: ["What stays?", "Hazardous materials (asbestos, lead)?", "Access for the dumpster"],
  },
];

/** The fallback when nothing in the brief names a trade. */
export const GENERAL_TRADE: TradeProfile = {
  id: "general",
  name: "General remodeling",
  primary: [],
  keywords: [],
  preamble:
    "General contracting proposal. Break the work into every phase a crew would actually perform, in build order: protection and mobilization, demolition and haul-off, rough-ins, structure, surfaces, fixtures and finishes, permits, cleanup. Price each phase in the unit it is measured in.",
  phases: ["Protection and mobilization", "Demolition and haul-off", "Rough-in work", "Primary installation", "Finish work", "Permit and inspection", "Final cleanup"],
  anchors: [
    "General labor: $55-95/hour; skilled trades $80-160/hour",
    "Demolition: labor $3-8/sqft; dumpster $450-700 fixed",
    "Drywall + paint: $3-5/sqft combined",
    "Permit: $150-600 fixed",
  ],
  keyQuestions: ["Existing conditions and access", "Permits required?", "Preferred materials or brands"],
};

const STOP = new Set(["with", "from", "into", "this", "that", "have", "will", "your", "what", "when", "about", "over", "than", "such", "project", "work", "job", "install", "need", "want", "home", "house", "please", "existing", "replace", "remove", "new"]);

/**
 * Pick the trade a brief describes.
 *
 * A primary word ("roof", "fence", "tile") decides outright — the first one
 * that appears wins, so "replace the roof and paint the fascia" is roofing.
 * Otherwise supporting keywords are counted and the best score wins when it
 * clears a small threshold; a brief with no trade words at all falls back to
 * the general profile. Pure, cheap, runs on every request.
 */
export function detectTrade(description: string): TradeProfile {
  const text = ` ${description.toLowerCase().replace(/[^a-z0-9&'\- ]+/g, " ")} `;
  let firstAt = Infinity;
  let firstTrade: TradeProfile | null = null;
  for (const t of TRADES) {
    for (const w of t.primary) {
      const at = text.indexOf(` ${w}`);
      if (at >= 0 && at < firstAt) {
        firstAt = at;
        firstTrade = t;
      }
    }
  }
  if (firstTrade) return firstTrade;

  let best: { t: TradeProfile; score: number } | null = null;
  const tokens = text.split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w));
  for (const t of TRADES) {
    let score = 0;
    for (const w of t.keywords) if (text.includes(` ${w}`)) score += w.length >= 6 ? 2 : 1;
    for (const w of tokens) if (t.keywords.includes(w)) score += 1;
    if (!best || score > best.score) best = { t, score };
  }
  return best && best.score >= 2 ? best.t : GENERAL_TRADE;
}

/**
 * State cost multiplier applied by the model, not by us: it is stated in the
 * prompt so the anchors read as national figures and the estimate lands in the
 * job's market. Rough US construction-cost relatives, 1.00 = national.
 */
export const STATE_COST_INDEX: Record<string, number> = {
  HI: 1.3, AK: 1.25, CA: 1.25, NY: 1.2, DC: 1.18, MA: 1.15, WA: 1.15, NJ: 1.15, CT: 1.12, CO: 1.1, MD: 1.1, RI: 1.1,
  OR: 1.08, NH: 1.08, IL: 1.05, VA: 1.05, AZ: 1.05, NV: 1.05, DE: 1.05, VT: 1.05, FL: 1.02, PA: 1.02, UT: 1.02, MN: 1.02,
  TX: 1.0, ID: 1.0, ME: 1.0, NC: 0.98, GA: 0.98, MT: 0.98, WY: 0.98, WI: 0.97, NM: 0.96, OH: 0.95, MI: 0.95, NE: 0.95,
  ND: 0.95, TN: 0.95, SC: 0.95, LA: 0.95, IN: 0.94, KS: 0.94, IA: 0.93, SD: 0.93, MO: 0.93, AL: 0.92, KY: 0.92, OK: 0.92,
  MS: 0.9, AR: 0.9, WV: 0.88,
};

export function stateCostIndex(location: string | null | undefined): { state: string; index: number } | null {
  if (!location) return null;
  const m = location.toUpperCase().match(/\b([A-Z]{2})\b(?!.*\b[A-Z]{2}\b)/);
  const st = m?.[1];
  if (!st || !(st in STATE_COST_INDEX)) return null;
  return { state: st, index: STATE_COST_INDEX[st] };
}
