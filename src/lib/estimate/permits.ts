// DOES THIS JOB NEED A PERMIT? — decided once, from the brief, before the
// model is asked, and held on its answer afterwards.
//
// The owner (2026-10-09): every Smart Proposal came back with "Permit and
// inspection", a door swap included. Not every job takes a permit: replacing
// a door or a window, tile, paint, flooring do not; electrical, plumbing,
// extending the house and a full remodel do. The model was told "every
// remodel carries a permit" and the validator demanded a permit line from
// eight trades whatever the brief said, so the line came back on everything.
//
// The rules follow the IRC's permit exemptions (R105.2: painting, papering,
// tiling, carpeting, cabinets, countertops and similar finish work; fences up
// to 7 ft; retaining walls up to 4 ft; a fixture reset on its existing
// connections) and the remodel method's own "Permits by scope"
// (remodel-method/text.ts §5.2), which the model was given but not held to.
//
//   required    — the work moves or adds pipe, wire or gas, sets HVAC
//                 equipment, touches the structure, adds to the house, is a
//                 full remodel or new construction. One billed permit line.
//   not-needed  — finish work, a like-for-like swap, a repair. No permit
//                 line, and the estimate says why.
//   depends     — the city decides (a roof replacement, re-siding, a light
//                 swapped on its box). No permit line; the estimate tells the
//                 contractor to add one if the building department asks.
//   null        — professional services and public works, whose procedures
//                 carry the permit as part of the job itself. Untouched.
//
// Pure module, no I/O.

import type { BriefScope } from "./remodel-method";

export type PermitNeed = "required" | "not-needed" | "depends";

export interface PermitCall {
  need: PermitNeed;
  /** What decided it, written to finish "…needs a permit: <reason>". */
  reason: string;
}

// ── What the brief says the work does ────────────────────────────────────────

/** Equipment set or replaced — what separates an HVAC install from a service call. */
const MECHANICAL_INSTALL =
  /\b(?:replac\w*|install\w*|new|add(?:ing)?|upgrad\w*|swap\w*|convert\w*\s+to)\s+(?:the\s+|an?\s+|our\s+|my\s+)?(?:\w+\s+){0,3}?(?:furnace|heat\s+pump|air\s+condition\w*|a\/?c\b|central\s+air|condenser|mini[-\s]?split|ductless|boiler|air\s+handler|hvac|ductwork|gas\s+fireplace|fireplace\s+insert|wood\s+stove|pellet\s+stove)/i;

const ARTICLE = String.raw`(?:an?\s+|the\s+|our\s+|my\s+|two\s+|three\s+|four\s+|\d+\s+|some\s+|more\s+|extra\s+|new\s+)?`;

/** Work that takes a permit wherever it is done, with the reason it gives. */
const TRIGGERS: Array<{ re: RegExp; reason: string }> = [
  // Electrical: new or moved wiring, a panel, a service.
  {
    re: /\b(?:new|dedicated|additional|extra)\s+(?:\d+\s*-?\s*a(?:mp)?\s+)?(?:\w+\s+)?(?:circuits?|wiring|sub-?panels?)\b|\b(?:additional|extra|more)\s+(?:\w+\s+)?(?:outlets?|receptacles?|lights?|circuits?)\b/i,
    reason: "electrical work on new circuits or wiring",
  },
  {
    re: new RegExp(String.raw`\b(?:add(?:ing)?|run(?:ning)?|extend(?:ing)?|relocat\w*|mov(?:e|ing))\s+${ARTICLE}(?:\w+\s+)?(?:circuits?|outlets?|receptacles?|switch(?:es)?|wiring|wires?|power|lights?|light\s+fixtures?|can\s+lights?|recessed\s+lights?|sconces?)\b`, "i"),
    reason: "adding or moving wiring",
  },
  {
    re: /\b(?:re-?wir\w*|knob[-\s]and[-\s]tube|panel\s+(?:upgrade|replacement|change|swap)|(?:upgrade|replace|swap)\s+(?:the\s+)?(?:electrical\s+|main\s+)?panel|service\s+upgrade|\d{3}\s*-?\s*amp\s+service|240\s*-?\s*v(?:olt)?\b|ev\s+charg\w*|car\s+charg\w*|standby\s+generator|transfer\s+switch|hard-?wir\w*|recessed\s+(?:lights?|lighting|cans?))/i,
    reason: "panel, service or new wiring work",
  },
  // Plumbing and gas: a line moved or added, a water heater, a sewer.
  {
    re: /\b(?:relocat\w*|mov(?:e|ing)|re-?rout\w*)\s+(?:the\s+|an?\s+|our\s+|my\s+)?(?:\w+\s+)?(?:sink|toilet|shower|tub|bathtub|drain|plumbing|vanity|washer|dishwasher|gas\s+line|water\s+line|supply)\b/i,
    reason: "plumbing work that moves a line",
  },
  {
    re: /\badd(?:ing)?\s+(?:an?\s+|a\s+second\s+|another\s+)?(?:new\s+)?(?:full\s+)?(?:bathroom|half[-\s]bath|powder\s+room|wet\s+bar)\b(?!\s+(?:vanity|vanities|faucet|fan|mirror|cabinet|light|tile|floor|sink|counter|door|accessor))|\b(?:add(?:ing)?|new)\s+(?:an?\s+)?(?:drain\s+lines?|water\s+lines?|gas\s+lines?|laundry\s+hook-?ups?)\b|\badd(?:ing)?\s+(?:an?\s+|a\s+second\s+|another\s+)?(?:sink|toilet|shower|tub)\b/i,
    reason: "plumbing work that adds a line",
  },
  { re: /\bwater\s+heater|\btankless\b/i, reason: "a water heater replacement" },
  { re: /\bre-?pip\w*/i, reason: "a repipe" },
  { re: /\bgas\s+(?:line|pipe|piping|stub)/i, reason: "gas piping" },
  { re: /\bsewer\s+(?:line|lateral|pipe|repair|replacement)|\bside\s+sewer|\bseptic\b|\bwater\s+(?:main|service)\b|\bmain\s+water\s+line/i, reason: "a sewer, septic or water service line" },
  { re: /\bbackflow\b/i, reason: "a backflow assembly" },
  {
    re: /\btub[-\s]to[-\s]shower|\bshower[-\s]to[-\s]tub|\b(?:tub|bathtub)\b[^.]{0,30}?\b(?:to|into)\s+(?:an?\s+)?(?:[\w-]+\s+){0,2}?shower\b|\bshower\b[^.]{0,30}?\b(?:to|into)\s+(?:an?\s+)?(?:\w+\s+)?tub\b/i,
    reason: "a tub-to-shower conversion (the drain and valve move)",
  },
  // Mechanical: equipment set or replaced, a new duct out of the house.
  { re: MECHANICAL_INSTALL, reason: "installing HVAC or fuel-burning equipment" },
  {
    re: /\b(?:vent(?:ed)?|duct(?:ed)?)\s+(?:it\s+)?(?:to\s+the\s+)?(?:outside|outdoors|exterior|through\s+the\s+(?:roof|wall))/i,
    reason: "a new duct through the roof or a wall",
  },
  // Structure: a wall out, a new or larger opening, framing, foundation.
  {
    re: /\b(?:load[-\s]?bearing|bearing\s+wall|structural|underpin\w*|re-?fram\w*|shear\s+wall|seismic|egress|sister(?:ing)?)\b|\b(?:install\w*|replac\w*|add(?:ing)?|new|remov\w*|cut\w*|repair\w*|reinforc\w*|support\w*|pour\w*|lift\w*|level\w*|sister\w*)\s+(?:the\s+|an?\s+|new\s+|rotted\s+|cracked\s+|sagging\s+|damaged\s+)*(?:\w+\s+)?(?:beams?|headers?|joists?|rafters?|truss(?:es)?|foundation|footings?|posts?\s+and\s+beams?)\b/i,
    reason: "structural work",
  },
  {
    re: /\b(?:remov\w*|take\s+(?:out|down)|taking\s+(?:out|down)|knock\w*\s+(?:out|down)|tear\w*\s+out|open\w*\s+up)\s+(?:the\s+|a\s+|an\s+|one\s+)?(?:interior\s+|kitchen\s+|dividing\s+|partition\s+|load[-\s]?bearing\s+|bearing\s+|non[-\s]?bearing\s+|half\s+|pony\s+)?walls?\b/i,
    reason: "removing a wall",
  },
  {
    re: /\bcut\s+(?:in\s+)?(?:a\s+)?(?:new\s+)?(?:\w+\s+)?(?:window|door|skylight|opening)\b|\bnew\s+(?:\w+\s+){0,2}?opening\b|\b(?:enlarg\w*|widen\w*|expand\w*)\s+(?:the\s+|a\s+|an\s+)?(?:window|door|opening)|\badd(?:ing)?\s+(?:an?\s+)?(?:new\s+)?(?:window|door|skylight)\b/i,
    reason: "a new or larger opening in the house",
  },
  // Adding to the house, converting space, building new.
  {
    re: /(?<!\bin\s)\baddition\b|\badd-?on\b|\b(?:home|house|room|kitchen|rear|side)\s+extension\b|\bextend(?:ing)?\s+(?:the\s+)?(?:house|home|kitchen|living\s+room|footprint)\b|\bbump[-\s]?out\b|\bsecond\s+(?:story|storey|floor)\b|\bdormer\b|\badu\b|\baccessory\s+dwelling|\bin-?law\s+(?:unit|suite|apartment)|\bgarage\s+conversion|\bconvert(?:ing)?\s+(?:the\s+|a\s+|our\s+|my\s+)?(?:garage|attic|basement)\b|\bfinish(?:ing)?\s+(?:the\s+|a\s+|our\s+|my\s+)?basement\b|\bbasement\s+finish\w*|\bnew\s+(?:house|home|build|construction|garage|shop\s+building)\b|\bground[-\s]up\b|\bsunroom\b|\benclos\w*\s+(?:the\s+|a\s+|our\s+)?(?:porch|patio|deck|carport)\b/i,
    reason: "an addition or a conversion of space",
  },
  // A full remodel.
  {
    re: /\b(?:full|complete|whole|total|entire|major)\s+(?:\w+\s+){0,2}?(?:remodel\w*|renovat\w*|rehab\w*|redo)\b|\bgut(?:ted|ting)?\b|\bdown\s+to\s+(?:the\s+)?studs\b|\bwhole[-\s](?:house|home)\s+remodel/i,
    reason: "a full remodel",
  },
  // Building things that carry their own code check.
  {
    re: /\b(?:build|install|new|add(?:ing)?)\s+(?:an?\s+)?(?:in-?ground\s+|above-?ground\s+)?(?:swimming\s+)?(?:pool|hot\s+tub|spa)\b/i,
    reason: "a pool or spa",
  },
  {
    re: /\b(?:demolish\w*|demo|tear\s+down|raze)\s+(?:the\s+|a\s+|an\s+|old\s+|existing\s+)*(?:house|home|garage|building|structure|barn|carport|addition)\b/i,
    reason: "demolishing a structure",
  },
  {
    re: /\bsolar\s+(?:panels?|array|system|pv)\b|\bbattery\s+(?:backup|storage)\b|\bpowerwall\b/i,
    reason: "a solar or battery install",
  },
];

const NUM = String.raw`(\d+(?:\.\d+)?|three|four|five|six|seven|eight|nine|ten|twelve)`;
const WORD_NUM: Record<string, number> = { three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
const toFeet = (raw: string | undefined) => {
  const n = WORD_NUM[(raw ?? "").toLowerCase()] ?? Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * The height the brief gives a fence or a wall: "7ft tall", "8 feet high",
 * "height of 6 ft", or a size right before the noun ("a 6 ft cedar fence").
 * Never a run's length — "180 linear ft of fence" is not a height, and
 * nothing over 20 ft is read as one.
 */
function heightFt(text: string, noun: RegExp): number | null {
  if (!noun.test(text)) return null;
  const tall =
    text.match(new RegExp(String.raw`${NUM}\s*-?\s*(?:ft|feet|foot|')\.?\s*(?:tall|high)\b`, "i")) ??
    text.match(new RegExp(String.raw`\b(?:height|tall|high)\s*(?:of|:|is)?\s*${NUM}\s*-?\s*(?:ft|feet|foot|')`, "i"));
  const before = text.match(new RegExp(String.raw`${NUM}\s*-?\s*(?:ft|foot|')\.?\s+(?:\w+\s+){0,3}?${noun.source}`, "i"));
  const n = toFeet(tall?.[1]) ?? toFeet(before?.[1]);
  return n != null && n <= 20 ? n : null;
}

// ── What each trade's work is when the brief says nothing more ─────────────

/** Professional services and public works: the permit is the job's own step. */
const UNTOUCHED = new Set([
  // design, engineering, consulting, inspection
  "architect", "residential-architect", "commercial-architect", "interior-architect", "architectural-drafting", "bim-revit",
  "structural-engineer", "civil-engineer", "geotechnical-engineer", "environmental-engineer", "mechanical-engineer", "electrical-engineer",
  "plumbing-engineer", "fire-protection-engineer", "transportation-engineer", "traffic-engineer", "hydrology-drainage-engineer",
  "land-surveyor", "boundary-topo-survey", "alta-survey", "utility-survey", "land-development-analysis", "feasibility-study",
  "highest-best-use", "zoning-code-analysis", "far-density-study", "buildable-area-calc", "lot-split-analysis", "entitlement-strategy",
  "rezoning-variance", "traffic-impact-study", "environmental-impact", "preconstruction-consulting", "conceptual-cost-estimating",
  "rom-estimating", "cost-engineering", "constructability-review", "construction-phasing", "cpm-analysis", "risk-contingency",
  "owners-representative", "construction-manager", "landscape-architect-pro", "permit-consultant", "permit-expediter",
  "code-compliance", "home-inspector", "engineering-design", "development-consulting",
  // public works and heavy civil: the right-of-way and street-use permits are bid items
  "roadway-highway", "road-construction", "road-milling", "chip-seal", "slurry-seal", "concrete-curb-gutter", "sidewalk", "ada-ramp",
  "parking-lot-construction", "traffic-control", "road-striping", "guardrail", "road-sign", "roadway-transportation",
  "mass-excavation", "utility-excavation", "trenching", "hydrovac-excavation", "directional-drilling", "rock-excavation",
  "shoring-support", "dewatering", "soil-stabilization", "compaction-proofrolling", "underground-utility", "underground-utility-installation",
  "water-utility-installation", "sanitary-sewer", "storm-sewer", "culvert-installation", "catch-basin-manhole", "lift-station",
  "pump-station", "utility-vault", "conduit-duct-bank", "civil-demolition", "environmental-remediation",
]);

/** The trade's work is permitted work by its nature. */
const REQUIRED_TRADES: Record<string, string> = {
  electrical: "electrical work",
  "residential-electrical": "electrical work",
  plumbing: "plumbing work",
  "residential-plumbing": "plumbing work",
  "gas-line": "gas piping",
  "water-heater-replacement": "a water heater replacement",
  "tankless-water-heater": "a water heater replacement",
  "whole-house-repiping": "a repipe",
  "backflow-preventer": "a backflow assembly",
  "greywater-system": "a greywater system",
  "radiant-floor-heating": "a heating system",
  hvac: "HVAC equipment",
  "residential-hvac": "HVAC equipment",
  "fire-protection": "a fire sprinkler system",
  "fire-alarm": "a fire alarm system",
  "residential-sprinkler-retrofit": "a fire sprinkler system",
  solar: "a solar install",
  "ev-charger": "an EV charger circuit",
  "residential-generator": "a standby generator",
  "battery-backup": "battery storage",
  "pool-spa": "a pool or spa",
  "septic-installer": "a septic system",
  "septic-repair": "septic work",
  "foundation-retaining": "foundation work",
  "residential-foundation-repair": "foundation work",
  "house-lifting": "structural work",
  "seismic-retrofit": "structural work",
  "structural-steel": "structural work",
  "framing-contractor": "framing",
  demolition: "demolition",
  "garage-conversion": "a garage conversion",
  "garage-builder": "a new garage",
  "carport-builder": "a carport",
  "patio-cover": "a patio cover",
  "adu-builder": "an ADU",
  "residential-new-home-builder": "new construction",
  "custom-home-builder": "new construction",
  "spec-home-builder": "new construction",
  "manufactured-home-installer": "setting a manufactured home",
  "mobile-home-setup": "setting a manufactured home",
  "prefab-modular": "a modular building",
  "elevator-lift": "an elevator or lift",
  "tenant-improvement": "a tenant improvement",
  "disaster-rebuild": "a rebuild",
  fireplace: "a fireplace or stove",
  "outdoor-kitchen": "gas and power to an outdoor kitchen",
  "commercial-roofing": "a commercial reroof",
};

/** Room remodels: a whole one takes a permit, a piece of one usually does not. */
const REMODEL_TRADES = new Set(["kitchen-remodel", "bathroom-remodel", "interior-remodel", "laundry-room-remodel", "home-office-buildout"]);

/** The city decides. */
const DEPENDS_TRADES: Record<string, string> = {
  roofing: "a roof replacement",
  "siding-installation": "re-siding",
  "stucco-eifs": "stucco or EIFS work",
  masonry: "masonry work",
  "chimney-repair": "chimney work",
  "sun-tunnel": "a new roof penetration",
  skylight: "a skylight",
  "excavation-grading": "grading",
  "erosion-control": "erosion control",
  "irrigation-contractor": "an irrigation system with its backflow",
  "tree-removal": "removing a tree",
  "radon-mitigation": "a radon system",
  signage: "a sign",
  "gate-access-control": "a powered gate",
  "sump-pump": "a sump pump",
  "whole-house-fan": "a whole-house fan",
  "surge-protection": "a whole-house surge protector",
  "security-lowvoltage": "low-voltage wiring",
  "smart-home": "low-voltage wiring",
  "data-cabling": "low-voltage wiring",
  "crawlspace-repair": "crawlspace work",
  "basement-waterproofing": "basement waterproofing",
  "storefront-curtain-wall": "a storefront",
  "concrete-contractor": "concrete work",
  "concrete-cutting": "cutting concrete",
  "insurance-repair": "the repair",
  restoration: "the restoration",
  "water-damage-restoration": "the rebuild after water damage",
  "fire-damage-restoration": "the rebuild after a fire",
};

/** A repair or a swap on what is there — no permit even in a permitted trade. */
const PLUMBING_SWAP = /\b(?:faucets?|toilets?|garbage\s+disposals?|disposals?|shower\s*heads?|clog\w*|unclog\w*|snak\w*|drain\s+clean\w*|leak\w*|fill\s+valves?|flappers?|p-?traps?|angle\s+stops?|shut-?off\s+valves?|aerators?|sinks?|wax\s+rings?)\b/i;
const ELECTRICAL_SWAP = /\b(?:light\s+fixtures?|lights?|switch(?:es)?(?!\s+(?:covers?|plates?))|outlets?|receptacles?|ceiling\s+fans?|fans?|dimmers?|doorbells?|smoke\s+(?:alarms?|detectors?)|co\s+(?:alarms?|detectors?)|gfci|cover\s+plates?|bulbs?)\b/i;
const HVAC_EQUIPMENT = /\b(?:furnace|heat\s+pump|air\s+condition\w*|a\/?c\b|hvac|condenser|mini[-\s]?split|boiler|air\s+handler)\b/i;
const HVAC_SERVICE = /\b(?:tune-?up|maintenance|service\s+call|clean\w*|repair\w*|capacitor|contactor|filters?|thermostat|recharge|refrigerant\s+leak|diagnos\w*|inspect\w*|check-?up)\b/i;
const SWAP_VERB = /\b(?:replac\w*|swap\w*|fix\w*|repair\w*|reset\w*|change\w*|install\w*|clear\w*)\b/i;

/** A roof repair, not a replacement. */
const ROOF_REPAIR = /\b(?:repair\w*|leak\w*|patch\w*|fix\w*|reseal\w*|flashing|pipe\s+boots?|replace\s+(?:a\s+|the\s+)?(?:few|some|\d+|missing|damaged|broken|blown[-\s]off)\s+shingles?)\b/i;
const ROOF_WORDS = /\broof\w*|\bshingles?\b/i;
/** Flatwork at grade (IRC R105.2 exempts sidewalks and driveways). */
const FLATWORK = /\b(?:patio|driveway|walkway|sidewalk|walk|pathway|pavers?|flatwork)\b/i;

/** Deck work on the frame that is there. */
const DECK_RESURFACE = /\bexisting\s+(?:framing|frame|joists|substructure|structure)\b|\bresurfac\w*|\bre-?deck\w*|\bdeck\s+boards?\b|\bdecking\s+boards?\b|\bstain\w*|\brefinish\w*|\brailings?\b|\breplace\s+(?:the\s+)?(?:\w+\s+)?boards?\b/i;
const DECK_NEW = /\b(?:build|construct\w*|new|install|add)\s+(?:an?\s+|the\s+)?(?:\w+\s+){0,3}?deck\b(?!\s*boards?)/i;
/** A deck, not a roof deck. */
const DECK_JOB = /\bdeck\b/i;
const ROOF_DECK = /\broof(?:ing)?\s+deck/i;

/** A roof replacement, whatever the specialty detector filed it under. */
const ROOF_JOB = /\bre-?roof\w*|\broof\s+replacement|\breplac\w*\s+(?:the\s+|a\s+|our\s+|my\s+)?(?:\w+\s+){0,3}?roof\b|\btear[-\s]?off\b[^.]{0,60}\b(?:shingles?|roof)|\b(?:shingles?|squares)\b[^.]{0,60}\b(?:tear[-\s]?off|underlayment)/i;

/**
 * The permit call for one brief. `text` is the project type and description
 * together, as the prompt builder reads them.
 */
export function permitCall(input: { text: string; specialtyId: string; scope: BriefScope }): PermitCall | null {
  const text = input.text ?? "";
  const id = input.specialtyId;

  // Heights decide fences and retaining walls (IRC R105.2: 7 ft, 4 ft).
  const wallFt = heightFt(text, /retaining\s+walls?/);
  if (wallFt != null && wallFt > 4) return { need: "required", reason: `a retaining wall over 4 ft (${wallFt} ft)` };
  const fenceFt = heightFt(text, /fenc\w*/);
  if (fenceFt != null && fenceFt > 7) return { need: "required", reason: `a fence over 7 ft (${fenceFt} ft)` };

  // A routine HVAC service call, before the equipment words read as an install
  // — by the words too: a furnace tune-up lands in general contracting.
  if ((id === "hvac" || id === "residential-hvac" || HVAC_EQUIPMENT.test(text)) && HVAC_SERVICE.test(text) && !MECHANICAL_INSTALL.test(text)) {
    return { need: "not-needed", reason: "a service call or repair on the equipment that is there" };
  }

  // Decks, by the words — the detector has filed a resurface under framing.
  if ((id === "decking" || DECK_JOB.test(text)) && !ROOF_DECK.test(text)) {
    if (DECK_RESURFACE.test(text) && !DECK_NEW.test(text)) return { need: "not-needed", reason: "deck work on the existing frame" };
    if (DECK_NEW.test(text) && !DECK_RESURFACE.test(text)) return { need: "required", reason: "a new deck" };
  }

  for (const t of TRIGGERS) if (t.re.test(text)) return { need: "required", reason: t.reason };

  // A roof replacement, by the words — the detector has filed one under
  // architect and under asphalt paving. A repair is not one.
  if (ROOF_JOB.test(text) && id !== "commercial-roofing") return { need: "depends", reason: "a roof replacement" };
  if ((id === "roofing" || id === "residential-roof-repair" || ROOF_WORDS.test(text)) && ROOF_REPAIR.test(text)) {
    return { need: "not-needed", reason: "a roof repair" };
  }

  // Flatwork at grade, whoever pours it.
  if (FLATWORK.test(text) && /\b(?:concrete|pour\w*|pavers?|stamped|slab|flatwork|asphalt)\b/i.test(text)) {
    return { need: "not-needed", reason: "flatwork at grade (a patio, walk or driveway)" };
  }

  // Services and public works carry the permit as part of the job.
  if (UNTOUCHED.has(id)) return null;

  // A permitted trade asked for a swap or a repair on what is there.
  if ((id === "plumbing" || id === "residential-plumbing") && PLUMBING_SWAP.test(text) && SWAP_VERB.test(text)) {
    return { need: "not-needed", reason: "a fixture replaced on its existing connections" };
  }
  if ((id === "electrical" || id === "residential-electrical" || id === "general-contracting") && ELECTRICAL_SWAP.test(text) && SWAP_VERB.test(text)) {
    return { need: "depends", reason: "a device replaced on its existing box" };
  }

  if (REQUIRED_TRADES[id]) return { need: "required", reason: REQUIRED_TRADES[id] };
  if (id === "general-contracting" || id === "design-build") {
    // The detector's fallback: no trigger fired, so no wire, pipe or structure.
    return input.scope === "full"
      ? { need: "required", reason: "a full remodel" }
      : { need: "not-needed", reason: "work that changes no wiring, plumbing or structure" };
  }
  if (REMODEL_TRADES.has(id)) {
    return input.scope === "full"
      ? { need: "required", reason: "a full remodel" }
      : { need: "not-needed", reason: "finish work and fixtures replaced in place" };
  }
  if (id === "decking") return { need: "depends", reason: "a deck of this size and height" };
  if (id === "fencing" || id === "residential-fence-repair") return { need: "not-needed", reason: "a fence 7 ft or under" };
  if (id === "hardscape") return { need: "not-needed", reason: "hardscape with no wall over 4 ft" };
  if (DEPENDS_TRADES[id]) return { need: "depends", reason: DEPENDS_TRADES[id] };
  if (id === "window-door" || id === "window-replacement" || id === "garage-door") {
    return { need: "not-needed", reason: "a window or door replaced in its existing opening" };
  }
  return { need: "not-needed", reason: "finish or repair work that changes no wiring, plumbing or structure" };
}

// ── The prompt ───────────────────────────────────────────────────────────────

/** "Lynnwood" out of "Lynnwood, WA" — the office that issues the permit. */
function cityOf(location: string | null | undefined): string | null {
  const c = (location ?? "").split(",")[0]?.trim();
  return c ? c : null;
}

/**
 * The block the prompt carries, last of the extras so it wins over every
 * earlier word on permits (the master prompt's, a procedure's, the method's).
 */
export function permitPromptBlock(call: PermitCall | null, location?: string | null): string | null {
  if (!call) return null;
  const city = cityOf(location);
  const office = city ? `${city}'s building department` : "the local building department";
  const head = "PERMIT DECISION FOR THIS JOB — made from the brief; it overrides every other instruction about permits above.";
  if (call.need === "required") {
    return `${head}\nThis job needs a permit: ${call.reason}. Write ONE permit line naming the trades and the inspections it covers (e.g. "Building permit with the rough and final inspections"), unit fixed, quantity 1, priced at ${office}'s fee, laborCost 0. Inspections live inside that line, never a line of their own.`;
  }
  if (call.need === "not-needed") {
    return `${head}\nThis job does NOT need a permit: ${call.reason}. Write no permit, plan-review or inspection-fee line, and do not say permits are included anywhere (line names, scope, notes, disclaimers).`;
  }
  return `${head}\nWhether this job needs a permit is up to ${office}: ${call.reason}. Write no permit line — the contractor adds one if the office requires it — and do not say permits are included anywhere.`;
}

// ── Holding the answer to it ─────────────────────────────────────────────────

/** A line that is a permit or its fee. "Final cleanup" and a roof inspection by the crew are not. */
const PERMIT_LINE = /\bpermits?\b|\bplan\s+review\b|\binspection\s+fees?\b|\bbuilding\s+department\b|\b(?:building|city|county|municipal|code|rough|final|framing|electrical|plumbing|mechanical)\s+inspections?\b/i;
const PERMIT_WORDS = /\bpermit|\bplan\s+review|\binspection\s+fee|\bbuilding\s+department|\b(?:city|county|code|rough|final)\s+inspections?\b/i;

export const isPermitLine = (name: string) => PERMIT_LINE.test(name ?? "");

/** Drop the sentences (or bullets) of a prose block that talk about permits. */
function withoutPermitTalk(text: string): string {
  return (text ?? "")
    .split("\n")
    .map((line) => {
      if (!PERMIT_WORDS.test(line)) return line;
      if (/^\s*(?:[-•*]|\d+[.)])\s/.test(line)) return null;
      const kept = line.split(/(?<=[.!?])\s+/).filter((s) => !PERMIT_WORDS.test(s));
      return kept.length ? kept.join(" ") : null;
    })
    .filter((l): l is string => l !== null)
    .join("\n");
}

/** The note that tells the contractor (and the client) why there is no permit line. */
export function permitNote(call: PermitCall, location?: string | null): string | null {
  if (call.need === "not-needed") return `No permit included: ${call.reason} does not need one.`;
  if (call.need === "depends") {
    const city = cityOf(location);
    return `No permit included: whether ${call.reason} needs one is up to ${city ? `${city}'s` : "the local"} building department — add it if they require one.`;
  }
  return null;
}

/** The line under the ledger that tells the contractor what was decided, either way. */
export function permitSummary(call: PermitCall | null, location?: string | null): string | null {
  if (!call) return null;
  if (call.need === "required") return `Permit included: ${call.reason} needs one.`;
  return permitNote(call, location);
}

/**
 * Hold the estimate to the call. A job that needs no permit (or whose city
 * decides) loses any permit line the model wrote anyway, the assumptions and
 * scope sentences that promise one, and gains the note that says why.
 * A required permit is the validator's to insert (validate-estimate).
 */
export function holdPermitDecision<T extends { name: string; laborUnitPrice: number }>(
  est: { items: T[]; assumptions: string[]; scope: string },
  call: PermitCall | null,
  location?: string | null,
): { items: T[]; assumptions: string[]; scope: string; dropped: string[] } {
  if (!call || call.need === "required") return { ...est, dropped: [] };
  const dropped: string[] = [];
  const items = est.items.filter((it) => {
    // A permit named inside a line of real work keeps the work.
    const permitOnly = isPermitLine(it.name) && (!(it.laborUnitPrice > 0) || /^\s*(?:obtain|pull|apply|secure|file|building|city|county|permit)/i.test(it.name));
    if (permitOnly) dropped.push(it.name);
    return !permitOnly;
  });
  const note = permitNote(call, location);
  const assumptions = [...est.assumptions.filter((a) => !PERMIT_WORDS.test(a)), ...(note ? [note] : [])];
  return { items, assumptions, scope: withoutPermitTalk(est.scope), dropped };
}

/** A procedure without its permit steps, for a job that writes no permit line. */
export function withoutPermitSteps<P extends { steps: Array<{ item: string }> }>(procedure: P): P {
  return { ...procedure, steps: procedure.steps.filter((s) => !/\bpermit\b/i.test(s.item)) };
}
