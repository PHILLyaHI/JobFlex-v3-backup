/* SMART PROPOSAL SCENARIOS — the data the Smart Proposal sequence plays.
   ============================================================
   One animation, several jobs. The showcase plays the kitchen (the original,
   verbatim); a trade hero (`?industry=painting`, `?industry=decking`) plays
   its own. Only these fields change between them — the prompt that types
   itself, the lines that write themselves, and the rail.

   PRICES. Nothing here is invented. Every figure is a unit-price anchor from
   lib/estimate/trade-knowledge.ts (US 2025, standard grade, mid-range of the
   band) × the Washington cost index the same file carries (WA 1.15 — the
   Seattle market the sample jobs are set in), rounded to $5. The deck
   scenario additionally takes the manual builder's "Deck rebuild · 200sf"
   preset (manual-builder-data.ts) as its framing anchor, since that preset
   IS a priced 200 sf frame. Line = material + labor; the rail splits the
   same figures back into Materials / Labor, so the total is the sum of the
   lines, never a separate number. Profile → trade mapping is explicit in
   `profile` so the source can be re-checked. */

export type SmartLine = [name: string, qty: string, price: string];

export type SmartScenario = {
  /** trade-knowledge.ts profile id this scenario is priced from. */
  profile:
    | "kitchen"
    | "painting"
    | "decking"
    | "siding"
    | "concrete"
    | "landscape"
    | "flooring"
    | "tile"
    | "plumbing"
    | "electrical"
    | "hvac"
    | "drywall"
    | "windows-doors"
    | "insulation"
    | "demolition"
    | "general";
  /** What the visitor watches being typed into the Scope field. */
  typedPrompt: string;
  /** 3–4 lines with realistic units and Seattle prices. */
  lines: SmartLine[];
  /** The rail: Materials / Labor / Margin, in that order. */
  rail: [name: string, value: string][];
  /** The plate under the rail. */
  total: string;
  note: string;
};

export type SmartScenarioKey = keyof typeof SMART_SCENARIOS;

export const SMART_SCENARIOS = {
  /* The original showcase job, byte-for-byte (owner, 2026-08-25): prices carry
     the dollar sign so a bare 8,400 next to a quantity is not read as another
     quantity. */
  kitchen: {
    profile: "kitchen",
    typedPrompt: "Remodel a 10×10 kitchen — maple & quartz",
    lines: [
      ["Semi-custom maple shaker cabinets", "14 ln ft", "$8,400"],
      ["Quartz countertop, installed", "42 sf", "$2,436"],
      ["Sink relocation — plumbing rough-in", "1 fixture", "$1,850"],
      ["Demo, install and finish", "112 hrs", "$8,960"],
    ],
    rail: [
      ["Materials", "$12,686"],
      ["Labor", "$8,960"],
      ["Margin", "22%"],
    ],
    total: "$21,646",
    note: "Project total",
  },

  /* Painting profile, interior. Anchors (mid-band × WA 1.15):
       prep     material $0.20 + labor $1.00 /sf → $1.38/sf × 1,480 sf = $2,040
       walls    material $0.60 + labor $2.25 /sf → $3.28/sf × 1,480 sf = $4,850
       ceilings material $0.45 + labor $2.00 /sf → $2.82/sf ×   520 sf = $1,465
       trim     material $0.75 + labor $2.25 /lf → $3.45/lf ×   210 lf =   $725
       doors    material $11.50 + labor $70 /unit → $93.70 × 6 doors  =   $560
     Materials $1,890 · Labor $7,750 · lines sum $9,640. */
  painting: {
    profile: "painting",
    typedPrompt: "Repaint 3 bedrooms and the hall — walls, ceilings, trim",
    lines: [
      ["Surface prep — patch, sand, caulk", "1,480 sf", "$2,040"],
      ["Walls, two coats", "1,480 sf", "$4,850"],
      ["Ceilings, two coats", "520 sf", "$1,465"],
      ["Trim, casing and 6 doors", "210 lf", "$1,285"],
    ],
    rail: [
      ["Materials", "$1,890"],
      ["Labor", "$7,750"],
      ["Margin", "22%"],
    ],
    total: "$9,640",
    note: "Project total",
  },

  /* Decks profile + the manual "Deck rebuild · 200sf" preset as the frame:
       demo      labor $3.00/sf × 1.15 → $3.45/sf × 200 sf            =   $690
       frame     preset: 22 × 2x8 joist $18.40 + 44 hangers $2.35
                 + 26 hrs framing crew @ $65 → $405 + $103 + $1,690  = $2,200
       decking   composite material $11.50 + labor $11.50 /sf × 1.15
                 → $26.45/sf × 200 sf                                 = $5,290
       railing   composite material $45 + labor $27.50 /lf × 1.15
                 → $83.40/lf × 36 lf                                  = $3,000
     Materials $5,015 · Labor $6,165 · lines sum $11,180. */
  decking: {
    profile: "decking",
    typedPrompt: "Rebuild a 200 sf composite deck — new frame and railing",
    lines: [
      ["Demo of decking and railing", "200 sf", "$690"],
      ["Frame — 2x8 joists, hangers, framing crew", "26 hrs", "$2,200"],
      ["Composite deck boards, installed", "200 sf", "$5,290"],
      ["Composite railing with posts", "36 lf", "$3,000"],
    ],
    rail: [
      ["Materials", "$5,015"],
      ["Labor", "$6,165"],
      ["Margin", "22%"],
    ],
    total: "$11,180",
    note: "Project total",
  },

  /* ── batch 2 (2026-09-08): trades with no tool of their own, priced the
     same way — Smart Estimator lines from the profile's anchors × WA 1.15. */

  /* Siding profile. Two-story, 2,100 sf of wall, fiber-cement lap:
       removal   labor $1.50/sf × 1.15 → $1.725 × 2,100                  = $3,620
       housewrap material $0.225 + labor $0.55 → $0.891/sf × 2,100       = $1,870
       lap       material $3.25 + labor $4.50 → $8.91/sf × 2,100         = $18,715
       trim      material $4.00 + labor $3.50 /lf → $8.63/lf × 280 lf    = $2,415
     Materials $9,680 · Labor $16,940 · lines sum $26,620. */
  siding: {
    profile: "siding",
    typedPrompt: "Re-side a 2,100 sf two-story — fiber-cement lap, new trim",
    lines: [
      ["Siding removal and disposal", "2,100 sf", "$3,620"],
      ["Housewrap", "2,100 sf", "$1,870"],
      ["Fiber-cement lap siding, installed", "2,100 sf", "$18,715"],
      ["Trim, corner boards and casing", "280 lf", "$2,415"],
    ],
    rail: [
      ["Materials", "$9,680"],
      ["Labor", "$16,940"],
      ["Margin", "22%"],
    ],
    total: "$26,620",
    note: "Project total",
  },

  /* Concrete profile. 600 sf driveway, 4 in broom finish (≈8 cu yd):
       demo       labor $3.50/sf × 1.15 → $4.03 × 600                       = $2,415
       excavation labor $2.25/sf → $2.59 × 600 = $1,552; gravel material
                  $45/cy × 1.15 × 8 = $414 + labor $1.50/sf → $1.73 × 600
                  = $1,035                                                  = $3,000
       forms      material $1.50 + labor $3 /lf → $5.18 × 100 lf = $518;
                  rebar material $0.85 + labor $0.60 /sf → $1.67 × 600 = $1,000 = $1,520
       concrete   material $190/cy × 1.15 × 8 = $1,748 + labor $5.50/sf
                  → $6.33 × 600 = $3,795                                    = $5,545
     Materials $2,920 · Labor $9,560 · lines sum $12,480. */
  concrete: {
    profile: "concrete",
    typedPrompt: "Pour a 600 sf driveway — 4 in broom finish, rebar, new base",
    lines: [
      ["Demo and haul-off", "600 sf", "$2,415"],
      ["Excavation, grading and gravel base", "600 sf", "$3,000"],
      ["Forms and rebar", "100 lf", "$1,520"],
      ["Concrete 4 in, broom finish", "8 cu yd", "$5,545"],
    ],
    rail: [
      ["Materials", "$2,920"],
      ["Labor", "$9,560"],
      ["Margin", "22%"],
    ],
    total: "$12,480",
    note: "Project total",
  },

  /* Landscape & hardscape profile. Back yard — patio, wall, lawn:
       grading   labor $1.75/sf × 1.15 → $2.01 × 1,200 sf               = $2,415
       pavers    material $9 + labor $14 /sf → $26.45 × 320 sf           = $8,465
       wall      material $22.50 + labor $30 /sf face → $60.38 × 80 sf   = $4,830
       sod       material $0.70 + labor $0.65 /sf → $1.55 × 900 sf       = $1,395
     Materials $6,105 · Labor $11,000 · lines sum $17,105. */
  landscaping: {
    profile: "landscape",
    typedPrompt: "Back yard: 320 sf paver patio, 40 ft retaining wall, new sod",
    lines: [
      ["Grading", "1,200 sf", "$2,415"],
      ["Paver patio, installed", "320 sf", "$8,465"],
      ["Retaining wall block, 2 ft face", "40 lf", "$4,830"],
      ["Sod, supplied and laid", "900 sf", "$1,395"],
    ],
    rail: [
      ["Materials", "$6,105"],
      ["Labor", "$11,000"],
      ["Margin", "22%"],
    ],
    total: "$17,105",
    note: "Project total",
  },

  /* Flooring profile. Carpet out, LVP in, 1,100 sf:
       removal     labor $1.75/sf × 1.15 → $2.01 × 1,100                    = $2,215
       underlay    material $0.50 + labor $0.40 → $1.04/sf × 1,100          = $1,140
       LVP         material $3.75 + labor $2.75 → $7.48/sf × 1,100          = $8,225
       base + trans baseboard R&R labor $2.50/lf → $2.88 × 240 lf = $690;
                   transitions material $6 + labor $4 /lf → $11.50 × 8 lf = $92 =   $780
     Materials $5,430 · Labor $6,930 · lines sum $12,360. */
  flooring: {
    profile: "flooring",
    typedPrompt: "Replace 1,100 sf of carpet with LVP — 3 bedrooms and hall",
    lines: [
      ["Remove and dispose of carpet", "1,100 sf", "$2,215"],
      ["Underlayment", "1,100 sf", "$1,140"],
      ["LVP, supplied and installed", "1,100 sf", "$8,225"],
      ["Baseboard R&R and transitions", "240 lf", "$780"],
    ],
    rail: [
      ["Materials", "$5,430"],
      ["Labor", "$6,930"],
      ["Margin", "22%"],
    ],
    total: "$12,360",
    note: "Project total",
  },

  /* Tile profile. 90 sf bathroom floor + 120 sf shower, porcelain:
       demo + prep    tile demo labor $4/sf → $4.60 × 90 = $414; prep material
                      $0.60 + labor $1.50 → $2.42 × 90 = $217                   =   $630
       board + membr. cement board material $2 + labor $2 → $4.60 × 210 = $966;
                      shower membrane material $3 + labor $4 → $8.05 × 120 = $966 = $1,930
       tile + thinset material $5.50 + $0.90 → $7.36/sf × 210               = $1,545
       install+grout  floor labor $11 → $12.65 × 90 = $1,139; walls $16 →
                      $18.40 × 120 = $2,208; grout material $0.45 + labor
                      $1.25 → $1.96 × 210 = $411                              = $3,760
     Materials $2,615 · Labor $5,250 · lines sum $7,865. */
  tile: {
    profile: "tile",
    typedPrompt: "Tile a 90 sf bathroom floor and a 120 sf shower — porcelain",
    lines: [
      ["Tile demo and substrate prep", "90 sf", "$630"],
      ["Cement board and shower waterproofing", "210 sf", "$1,930"],
      ["Porcelain tile and thinset", "210 sf", "$1,545"],
      ["Installation, grout and sealant", "210 sf", "$3,760"],
    ],
    rail: [
      ["Materials", "$2,615"],
      ["Labor", "$5,250"],
      ["Margin", "22%"],
    ],
    total: "$7,865",
    note: "Project total",
  },

  /* ── batch 3 (2026-09-08): the unit-priced trades — fixtures, points,
     equipment, sheets, openings — not square feet. Same rule: profile
     anchor mid-band × WA 1.15, rounded to $5. */

  /* Plumbing profile. Water heater swap, two fixtures, a drain run:
       heater    50 gal tank material $1,150 + labor $700 → $1,850 × 1.15      = $2,130
       rough-in  material $225 + labor $800 → $1,025 × 1.15 = $1,179 × 2       = $2,360
       set       toilet material $400 + labor $225 → $719; faucet material
                 $250 + labor $185 → $500                                       = $1,220
       drain     PEX run material $3 + labor $11.50 /lf → $16.68 × 40 lf       =   $665
     Materials $2,725 · Labor $3,650 · lines sum $6,375. */
  plumbing: {
    profile: "plumbing",
    typedPrompt: "Swap the 50 gal water heater, set 2 fixtures, run a new drain line",
    lines: [
      ["50 gal tank water heater, replaced", "1 unit", "$2,130"],
      ["Rough-in, two fixtures", "2 fixtures", "$2,360"],
      ["Toilet and faucet, set and connected", "2 units", "$1,220"],
      ["Drain line, new run", "40 lf", "$665"],
    ],
    rail: [
      ["Materials", "$2,725"],
      ["Labor", "$3,650"],
      ["Margin", "22%"],
    ],
    total: "$6,375",
    note: "Project total",
  },

  /* Electrical profile. Panel, circuits, points:
       panel     200 A material $1,150 + labor $2,000 → $3,150 × 1.15          = $3,620
       circuits  20 A material $115 + labor $300 → $415 × 1.15 = $477 × 2      =   $955
       outlets   GFCI material $17.50 + labor $90 → $107.50 × 1.15 = $124 × 6  =   $740
       cans      LED material $55 + labor $120 → $175 × 1.15 = $201 × 6        = $1,210
     Materials $2,085 · Labor $4,440 · lines sum $6,525. */
  electrical: {
    profile: "electrical",
    typedPrompt: "200 A panel upgrade, 2 kitchen circuits, 6 outlets, 6 recessed cans",
    lines: [
      ["200 A panel upgrade", "1 unit", "$3,620"],
      ["New 20 A circuits", "2 circuits", "$955"],
      ["Outlets and GFCI", "6 points", "$740"],
      ["Recessed LED cans", "6 units", "$1,210"],
    ],
    rail: [
      ["Materials", "$2,085"],
      ["Labor", "$4,440"],
      ["Margin", "22%"],
    ],
    total: "$6,525",
    note: "Project total",
  },

  /* HVAC profile. Furnace + AC out, heat pump in:
       system    3-ton heat pump material $7,000 + labor $3,500 → $10,500 × 1.15 = $12,075
       duct      material $11.50 + labor $22.50 /lf → $39.10 × 40 lf            = $1,565
       tstat     material $190 + labor $140 → $330 × 1.15                       =   $380
     Materials $8,800 · Labor $5,220 · lines sum $14,020. */
  hvac: {
    profile: "hvac",
    typedPrompt: "Replace the furnace and AC with a 3-ton heat pump, 40 ft of new duct",
    lines: [
      ["3-ton heat pump system, installed", "1 unit", "$12,075"],
      ["Ductwork, new runs", "40 lf", "$1,565"],
      ["Thermostat, installed", "1 unit", "$380"],
    ],
    rail: [
      ["Materials", "$8,800"],
      ["Labor", "$5,220"],
      ["Margin", "22%"],
    ],
    total: "$14,020",
    note: "Project total",
  },

  /* Drywall profile. 14×16 addition, 9 ft walls + ceiling ≈ 768 sf = 32 sheets:
       hang      material $0.80 + labor $1.15 /sf → $2.24 × 768                = $1,720
       finish    level 4 material $0.30 + labor $1.40 → $1.96 × 768            = $1,500
       bead      material $0.45 + labor $1.00 /lf → $1.67 × 60 lf              =   $100
       texture   material $0.225 + labor $0.90 → $1.29 × 768                   =   $995
     Materials $1,200 · Labor $3,115 · lines sum $4,315. */
  drywall: {
    profile: "drywall",
    typedPrompt: "Hang and finish a 14×16 addition — level 4, orange peel, 32 sheets",
    lines: [
      ["Hang 1/2 in drywall", "32 sheets", "$1,720"],
      ["Tape and finish, level 4", "768 sf", "$1,500"],
      ["Corner bead", "60 lf", "$100"],
      ["Orange peel texture", "768 sf", "$995"],
    ],
    rail: [
      ["Materials", "$1,200"],
      ["Labor", "$3,115"],
      ["Margin", "22%"],
    ],
    total: "$4,315",
    note: "Project total",
  },

  /* Windows & doors profile. Eight openings plus the slider:
       windows   vinyl material $525 + labor $300 → $825 × 1.15 = $949 × 8     = $7,590
       slider    material $1,750 + labor $700 → $2,450 × 1.15                  = $2,820
       casing    material $3.50 + labor $4 /lf → $8.63 × 112 lf (8 × 14 lf)    =   $965
     Materials $7,295 · Labor $4,080 · lines sum $11,375. */
  windows: {
    profile: "windows-doors",
    typedPrompt: "Replace 8 windows and the patio slider — vinyl, standard size, new casing",
    lines: [
      ["Vinyl replacement windows, standard size", "8 openings", "$7,590"],
      ["Sliding patio door", "1 opening", "$2,820"],
      ["Interior casing", "112 lf", "$965"],
    ],
    rail: [
      ["Materials", "$7,295"],
      ["Labor", "$4,080"],
      ["Margin", "22%"],
    ],
    total: "$11,375",
    note: "Project total",
  },

  /* ── batch 4 (2026-09-08): the last five. Two of them (countertops,
     carpentry) have no profile of their own in trade-knowledge.ts — their
     anchors live inside neighbouring profiles, named line by line below, and
     `profile` points at the profile the first line comes from. Same rule
     throughout: anchor mid-band × WA 1.15, rounded to $5; no anchor, no line. */

  /* Countertops — anchors from the KITCHEN profile:
       quartz    "$60-120/sqft installed (fabricator)" → $90 × 1.15 = $103.50 × 45 sf = $4,660
       sink      material $600 + labor $350 → $950 × 1.15                      = $1,095
       splash    backsplash tile material $20 + labor $20 → $46/sf × 30 sf    = $1,380
     The fabricator's figure is supplied-and-installed, so it sits under
     Materials whole. Materials $6,040 · Labor $1,095 · lines sum $7,135. */
  countertops: {
    profile: "kitchen",
    typedPrompt: "Quartz tops for a 45 sf kitchen — undermount sink, 30 sf backsplash",
    lines: [
      ["Quartz countertop, fabricated and installed", "45 sf", "$4,660"],
      ["Undermount sink and faucet, set", "1 unit", "$1,095"],
      ["Backsplash tile", "30 sf", "$1,380"],
    ],
    rail: [
      ["Materials", "$6,040"],
      ["Labor", "$1,095"],
      ["Margin", "22%"],
    ],
    total: "$7,135",
    note: "Project total",
  },

  /* Carpentry — anchors from WINDOWS & DOORS (casing, entry door), FLOORING
     (baseboard) and GENERAL (skilled-trades hourly):
       trim      casing material $3.50 + labor $4 /lf → $8.63 × 160 lf = $1,380;
                 base material $3.50 + labor $2.50 /lf → $6.90 × 180 lf = $1,242 = $2,620
       door      fiberglass entry door material $2,100 + labor $600 → $2,700 × 1.15 = $3,105
       built-in  skilled trades $120/hr × 1.15 = $138 × 16 hrs                  = $2,210
     No anchor prices an interior door hang or framing by the foot, so the
     owner's "3 doors" became the one door the catalogue prices.
     Materials $3,785 · Labor $4,150 · lines sum $7,935. */
  carpentry: {
    profile: "windows-doors",
    typedPrompt: "Trim package for 3 rooms, hang the new entry door, build in the shelving",
    lines: [
      ["Trim package — casing and baseboard", "340 lf", "$2,620"],
      ["Entry door with frame, hung and cased", "1 unit", "$3,105"],
      ["Built-in shelving, skilled carpentry", "16 hrs", "$2,210"],
    ],
    rail: [
      ["Materials", "$3,785"],
      ["Labor", "$4,150"],
      ["Margin", "22%"],
    ],
    total: "$7,935",
    note: "Project total",
  },

  /* Insulation profile. Attic blown-in, wall batts, air seal:
       removal   labor $1.50/sf × 1.15 → $1.73 × 1,200 sf                     = $2,070
       attic     blown-in to R-38 material $1.05 + labor $0.95 → $2.30 × 1,200  = $2,760
       batts     R-13/R-19 material $0.75 + labor $0.80 → $1.78 × 800 sf       = $1,425
       air seal  fixed $650 × 1.15                                              =   $750
     The catalogue's attic anchor stops at R-38, so that is the depth priced.
     Materials $2,140 · Labor $4,865 · lines sum $7,005. */
  insulation: {
    profile: "insulation",
    typedPrompt: "Pull the old attic insulation, blow in to R-38, batt the garage wall, air seal",
    lines: [
      ["Remove old attic insulation", "1,200 sf", "$2,070"],
      ["Blown-in attic to R-38", "1,200 sf", "$2,760"],
      ["Fiberglass batts R-19, garage wall", "800 sf", "$1,425"],
      ["Air sealing — top plates and penetrations", "fixed", "$750"],
    ],
    rail: [
      ["Materials", "$2,140"],
      ["Labor", "$4,865"],
      ["Margin", "22%"],
    ],
    total: "$7,005",
    note: "Project total",
  },

  /* Demolition profile. Kitchen gut to the studs:
       contain   hourly $60 × 1.15 = $69 × 8 hrs                                =   $550
       demo      interior labor $5.50/sf × 1.15 → $6.33 × 200 sf               = $1,265
       dumpsters 20 yd $575 × 1.15 = $661 × 2 loads                             = $1,325
       clean     hourly $69 × 4 hrs                                             =   $275
     Labor $2,090 · Disposal $1,325 · lines sum $3,415. */
  demolition: {
    profile: "demolition",
    typedPrompt: "Gut a 200 sf kitchen to the studs — cabinets, tile, soffit, two loads out",
    lines: [
      ["Protection and containment", "8 hrs", "$550"],
      ["Interior demolition to the studs", "200 sf", "$1,265"],
      ["20 yd dumpsters, hauled and tipped", "2 loads", "$1,325"],
      ["Broom-clean cleanup", "4 hrs", "$275"],
    ],
    rail: [
      ["Labor", "$2,090"],
      ["Disposal", "$1,325"],
      ["Margin", "22%"],
    ],
    total: "$3,415",
    note: "Project total",
  },

  /* General contractor — not one trade's estimate but a project assembled
     from phases, each priced off the sub-trade's own anchor:
       demo       GENERAL: labor $5.50/sf × 1.15 → $6.33 × 600 sf = $3,795
                  + dumpster $575 × 1.15 = $661                                  = $4,455
       rough-ins  ELECTRICAL: 20 A circuit $415 × 1.15 = $477 × 6 = $2,864;
                  PLUMBING: rough-in $1,025 × 1.15 = $1,179 × 3 fixtures = $3,536 = $6,400
       surfaces   GENERAL: drywall + paint $4/sf combined × 1.15 → $4.60 × 1,800 = $8,280
       finish     FLOORING: LVP material $3.75 + labor $2.75 → $7.48/sf × 900   = $6,725
     Self-performed (demo) $4,455 · Subcontractors $21,405 · lines sum $25,860. */
  "general-contractor": {
    profile: "general",
    typedPrompt: "Whole-floor remodel, 900 sf — gut, rough-ins, drywall and paint, LVP",
    lines: [
      ["Demolition and haul-off", "600 sf", "$4,455"],
      ["Electrical and plumbing rough-in", "6 circuits · 3 fixtures", "$6,400"],
      ["Drywall and paint", "1,800 sf", "$8,280"],
      ["Flooring — LVP, installed", "900 sf", "$6,725"],
    ],
    rail: [
      ["Self-performed", "$4,455"],
      ["Subcontractors", "$21,405"],
      ["Margin", "22%"],
    ],
    total: "$25,860",
    note: "Project total",
  },
} as const satisfies Record<string, SmartScenario>;
