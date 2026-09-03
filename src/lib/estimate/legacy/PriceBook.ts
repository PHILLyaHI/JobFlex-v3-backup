/**
 * Price Book - Internal price reference for market validation
 * 
 * Contains typical price ranges for common construction materials
 * organized by category + keyword matching.
 * 
 * This allows market price validation WITHOUT external API calls.
 */

export type MaterialCategory = 
  | "LUMBER"
  | "PLUMBING"
  | "ELECTRICAL"
  | "PAINT"
  | "TILE_FLOORING"
  | "APPLIANCE"
  | "RENTAL"
  | "EPOXY_FLOORING"
  | "CABINETS"
  | "HVAC"
  | "CONCRETE"
  | "ROOFING"
  | "GENERAL";

export interface PriceBookEntry {
  keywords: string[];
  category: MaterialCategory;
  unit: string;
  priceLow: number;
  priceHigh: number;
  priceAvg: number;
  notes?: string;
}

// ============================================================
// REGION MULTIPLIERS — State-level baseline cost adjustments
// ============================================================
export const REGION_MULTIPLIERS: Record<string, number> = {
  // High cost states
  "CA": 1.25, "NY": 1.20, "MA": 1.15, "WA": 1.15, "CO": 1.10,
  "NJ": 1.15, "CT": 1.12, "HI": 1.30, "AK": 1.25, "OR": 1.08,
  "MD": 1.10, "DC": 1.18, "NH": 1.08, "VT": 1.05, "RI": 1.10,
  "MN": 1.02, "DE": 1.05,
  // Average cost states
  "TX": 1.00, "FL": 1.02, "AZ": 1.05, "NC": 0.98, "GA": 0.98,
  "VA": 1.05, "PA": 1.02, "IL": 1.05, "OH": 0.95, "MI": 0.95,
  "WI": 0.97, "IN": 0.94, "IA": 0.93, "NE": 0.95, "KS": 0.94,
  "SD": 0.93, "ND": 0.95, "MT": 0.98, "WY": 0.98, "ID": 1.00,
  "NV": 1.05, "UT": 1.02, "NM": 0.96, "ME": 1.00,
  // Lower cost states
  "MS": 0.90, "AL": 0.92, "AR": 0.90, "WV": 0.88, "KY": 0.92,
  "OK": 0.92, "MO": 0.93, "TN": 0.95, "SC": 0.95, "LA": 0.95,
  // Default
  "DEFAULT": 1.00,
};

// ============================================================
// METRO / CITY COST INDEX — applied ON TOP of state multiplier
// Keys are lowercase city or metro names; value is an additional
// multiplier relative to the state baseline (1.0 = no adjustment).
// Example: CA = 1.25 (state) × SF metro 1.20 = effective 1.50
// ============================================================
export const METRO_COST_INDEX: Record<string, { multiplier: number; state: string }> = {
  // California
  "san francisco":   { multiplier: 1.20, state: "CA" },
  "san jose":        { multiplier: 1.18, state: "CA" },
  "oakland":         { multiplier: 1.15, state: "CA" },
  "los angeles":     { multiplier: 1.10, state: "CA" },
  "san diego":       { multiplier: 1.05, state: "CA" },
  "sacramento":      { multiplier: 0.95, state: "CA" },
  "fresno":          { multiplier: 0.88, state: "CA" },
  "bakersfield":     { multiplier: 0.85, state: "CA" },
  "riverside":       { multiplier: 0.92, state: "CA" },
  // New York
  "new york":        { multiplier: 1.25, state: "NY" },
  "manhattan":       { multiplier: 1.30, state: "NY" },
  "brooklyn":        { multiplier: 1.22, state: "NY" },
  "queens":          { multiplier: 1.15, state: "NY" },
  "long island":     { multiplier: 1.12, state: "NY" },
  "westchester":     { multiplier: 1.15, state: "NY" },
  "albany":          { multiplier: 0.88, state: "NY" },
  "buffalo":         { multiplier: 0.85, state: "NY" },
  "rochester":       { multiplier: 0.85, state: "NY" },
  "syracuse":        { multiplier: 0.83, state: "NY" },
  // Texas
  "austin":          { multiplier: 1.10, state: "TX" },
  "dallas":          { multiplier: 1.05, state: "TX" },
  "houston":         { multiplier: 1.03, state: "TX" },
  "san antonio":     { multiplier: 0.95, state: "TX" },
  "el paso":         { multiplier: 0.88, state: "TX" },
  "fort worth":      { multiplier: 1.02, state: "TX" },
  // Florida
  "miami":           { multiplier: 1.18, state: "FL" },
  "fort lauderdale": { multiplier: 1.12, state: "FL" },
  "west palm beach": { multiplier: 1.10, state: "FL" },
  "naples":          { multiplier: 1.12, state: "FL" },
  "orlando":         { multiplier: 1.00, state: "FL" },
  "tampa":           { multiplier: 1.00, state: "FL" },
  "jacksonville":    { multiplier: 0.95, state: "FL" },
  // Washington
  "seattle":         { multiplier: 1.18, state: "WA" },
  "bellevue":        { multiplier: 1.20, state: "WA" },
  "tacoma":          { multiplier: 1.00, state: "WA" },
  "spokane":         { multiplier: 0.88, state: "WA" },
  // Massachusetts
  "boston":           { multiplier: 1.18, state: "MA" },
  "cambridge":       { multiplier: 1.20, state: "MA" },
  "worcester":       { multiplier: 0.92, state: "MA" },
  "springfield":     { multiplier: 0.88, state: "MA" },
  // Colorado
  "denver":          { multiplier: 1.10, state: "CO" },
  "boulder":         { multiplier: 1.15, state: "CO" },
  "colorado springs":{ multiplier: 0.95, state: "CO" },
  // Illinois
  "chicago":         { multiplier: 1.15, state: "IL" },
  "naperville":      { multiplier: 1.10, state: "IL" },
  "springfield il":  { multiplier: 0.85, state: "IL" },
  // New Jersey
  "jersey city":     { multiplier: 1.15, state: "NJ" },
  "newark":          { multiplier: 1.08, state: "NJ" },
  "princeton":       { multiplier: 1.12, state: "NJ" },
  // Connecticut
  "stamford":        { multiplier: 1.15, state: "CT" },
  "hartford":        { multiplier: 0.95, state: "CT" },
  "new haven":       { multiplier: 0.95, state: "CT" },
  // Georgia
  "atlanta":         { multiplier: 1.10, state: "GA" },
  "savannah":        { multiplier: 0.95, state: "GA" },
  // Virginia
  "northern virginia":{ multiplier: 1.15, state: "VA" },
  "arlington":       { multiplier: 1.18, state: "VA" },
  "richmond":        { multiplier: 0.95, state: "VA" },
  // Pennsylvania
  "philadelphia":    { multiplier: 1.12, state: "PA" },
  "pittsburgh":      { multiplier: 0.95, state: "PA" },
  // Arizona
  "scottsdale":      { multiplier: 1.10, state: "AZ" },
  "phoenix":         { multiplier: 1.02, state: "AZ" },
  "tucson":          { multiplier: 0.92, state: "AZ" },
  // Oregon
  "portland":        { multiplier: 1.12, state: "OR" },
  // Nevada
  "las vegas":       { multiplier: 1.05, state: "NV" },
  "reno":            { multiplier: 1.00, state: "NV" },
  // Hawaii
  "honolulu":        { multiplier: 1.10, state: "HI" },
  // DC
  "washington dc":   { multiplier: 1.15, state: "DC" },
  "dc":              { multiplier: 1.15, state: "DC" },
  // North Carolina
  "charlotte":       { multiplier: 1.05, state: "NC" },
  "raleigh":         { multiplier: 1.05, state: "NC" },
  // Tennessee
  "nashville":       { multiplier: 1.08, state: "TN" },
  "memphis":         { multiplier: 0.92, state: "TN" },
  // Ohio
  "columbus":        { multiplier: 1.02, state: "OH" },
  "cleveland":       { multiplier: 0.95, state: "OH" },
  "cincinnati":      { multiplier: 0.95, state: "OH" },
  // Michigan
  "detroit":         { multiplier: 0.98, state: "MI" },
  "ann arbor":       { multiplier: 1.05, state: "MI" },
  // Minnesota
  "minneapolis":     { multiplier: 1.08, state: "MN" },
  // Missouri
  "kansas city":     { multiplier: 1.02, state: "MO" },
  "st louis":        { multiplier: 1.00, state: "MO" },
  // Louisiana
  "new orleans":     { multiplier: 1.05, state: "LA" },
  // South Carolina
  "charleston":      { multiplier: 1.05, state: "SC" },
  // Utah
  "salt lake city":  { multiplier: 1.05, state: "UT" },
  // Maryland
  "baltimore":       { multiplier: 1.05, state: "MD" },
  "bethesda":        { multiplier: 1.18, state: "MD" },
};

// ============================================================
// ZIP CODE PREFIX → STATE mapping (first 3 digits of zip)
// ============================================================
const ZIP_PREFIX_TO_STATE: Record<string, string> = {
  // CT 060-069
  "060": "CT", "061": "CT", "062": "CT", "063": "CT", "064": "CT",
  "065": "CT", "066": "CT", "067": "CT", "068": "CT", "069": "CT",
  // MA 010-027
  "010": "MA", "011": "MA", "012": "MA", "013": "MA", "014": "MA",
  "015": "MA", "016": "MA", "017": "MA", "018": "MA", "019": "MA",
  "020": "MA", "021": "MA", "022": "MA", "023": "MA", "024": "MA",
  "025": "RI", "026": "RI", "027": "MA", "028": "RI", "029": "RI",
  // NJ 070-089
  "070": "NJ", "071": "NJ", "072": "NJ", "073": "NJ", "074": "NJ",
  "075": "NJ", "076": "NJ", "077": "NJ", "078": "NJ", "079": "NJ",
  "080": "NJ", "081": "NJ", "082": "NJ", "083": "NJ", "084": "NJ",
  "085": "NJ", "086": "NJ", "087": "NJ", "088": "NJ", "089": "NJ",
  // NY 100-149
  "100": "NY", "101": "NY", "102": "NY", "103": "NY", "104": "NY",
  "105": "NY", "106": "NY", "107": "NY", "108": "NY", "109": "NY",
  "110": "NY", "111": "NY", "112": "NY", "113": "NY", "114": "NY",
  "115": "NY", "116": "NY", "117": "NY", "118": "NY", "119": "NY",
  "120": "NY", "121": "NY", "122": "NY", "123": "NY", "124": "NY",
  "125": "NY", "126": "NY", "127": "NY", "128": "NY", "129": "NY",
  "130": "NY", "131": "NY", "132": "NY", "133": "NY", "134": "NY",
  "135": "NY", "136": "NY", "137": "NY", "138": "NY", "139": "NY",
  "140": "NY", "141": "NY", "142": "NY", "143": "NY", "144": "NY",
  "145": "NY", "146": "NY", "147": "NY", "148": "NY", "149": "NY",
  // PA 150-196
  "150": "PA", "151": "PA", "152": "PA", "153": "PA", "154": "PA",
  "155": "PA", "156": "PA", "157": "PA", "158": "PA", "159": "PA",
  "160": "PA", "161": "PA", "162": "PA", "163": "PA", "164": "PA",
  "165": "PA", "166": "PA", "167": "PA", "168": "PA", "169": "PA",
  "170": "PA", "171": "PA", "172": "PA", "173": "PA", "174": "PA",
  "175": "PA", "176": "PA", "177": "PA", "178": "PA", "179": "PA",
  "180": "PA", "181": "PA", "182": "PA", "183": "PA", "184": "PA",
  "185": "PA", "186": "PA", "187": "PA", "188": "PA", "189": "PA",
  "190": "PA", "191": "PA",
  // DE 197-199
  "197": "DE", "198": "DE", "199": "DE",
  // DC 200-205
  "200": "DC", "201": "MD", "202": "DC", "203": "DC", "204": "DC", "205": "DC",
  // VA 220-246
  "220": "VA", "221": "VA", "222": "VA", "223": "VA", "224": "VA",
  "225": "VA", "226": "VA", "227": "VA", "228": "VA", "229": "VA",
  "230": "VA", "231": "VA", "232": "VA", "233": "VA", "234": "VA",
  // MD 206-219
  "206": "MD", "207": "MD", "208": "MD", "209": "MD", "210": "MD",
  "211": "MD", "212": "MD", "214": "MD", "215": "MD", "216": "MD",
  "217": "MD", "218": "MD", "219": "MD",
  // FL 320-349
  "320": "FL", "321": "FL", "322": "FL", "323": "FL", "324": "FL",
  "325": "FL", "326": "FL", "327": "FL", "328": "FL", "329": "FL",
  "330": "FL", "331": "FL", "332": "FL", "333": "FL", "334": "FL",
  "335": "FL", "336": "FL", "337": "FL", "338": "FL", "339": "FL",
  "340": "FL", "341": "FL", "342": "FL", "344": "FL", "346": "FL",
  "347": "FL", "349": "FL",
  // GA 300-319
  "300": "GA", "301": "GA", "302": "GA", "303": "GA", "304": "GA",
  "305": "GA", "306": "GA", "307": "GA", "308": "GA", "309": "GA",
  "310": "GA", "311": "GA", "312": "GA", "313": "GA", "314": "GA",
  "315": "GA", "316": "GA", "317": "GA", "318": "GA", "319": "GA",
  // TX 750-799, 733-739, 700s partial
  "750": "TX", "751": "TX", "752": "TX", "753": "TX", "754": "TX",
  "755": "TX", "756": "TX", "757": "TX", "758": "TX", "759": "TX",
  "760": "TX", "761": "TX", "762": "TX", "763": "TX", "764": "TX",
  "765": "TX", "766": "TX", "767": "TX", "768": "TX", "769": "TX",
  "770": "TX", "771": "TX", "772": "TX", "773": "TX", "774": "TX",
  "775": "TX", "776": "TX", "777": "TX", "778": "TX", "779": "TX",
  "780": "TX", "781": "TX", "782": "TX", "783": "TX", "784": "TX",
  "785": "TX", "786": "TX", "787": "TX", "788": "TX", "789": "TX",
  "790": "TX", "791": "TX", "792": "TX", "793": "TX", "794": "TX",
  "795": "TX", "796": "TX", "797": "TX", "798": "TX", "799": "TX",
  // CA 900-961
  "900": "CA", "901": "CA", "902": "CA", "903": "CA", "904": "CA",
  "905": "CA", "906": "CA", "907": "CA", "908": "CA", "910": "CA",
  "911": "CA", "912": "CA", "913": "CA", "914": "CA", "915": "CA",
  "916": "CA", "917": "CA", "918": "CA", "919": "CA", "920": "CA",
  "921": "CA", "922": "CA", "923": "CA", "924": "CA", "925": "CA",
  "926": "CA", "927": "CA", "928": "CA", "930": "CA", "931": "CA",
  "932": "CA", "933": "CA", "934": "CA", "935": "CA", "936": "CA",
  "937": "CA", "938": "CA", "939": "CA", "940": "CA", "941": "CA",
  "942": "CA", "943": "CA", "944": "CA", "945": "CA", "946": "CA",
  "947": "CA", "948": "CA", "949": "CA", "950": "CA", "951": "CA",
  "952": "CA", "953": "CA", "954": "CA", "955": "CA", "956": "CA",
  "957": "CA", "958": "CA", "959": "CA", "960": "CA", "961": "CA",
  // WA 980-994
  "980": "WA", "981": "WA", "982": "WA", "983": "WA", "984": "WA",
  "985": "WA", "986": "WA", "988": "WA", "989": "WA", "990": "WA",
  "991": "WA", "992": "WA", "993": "WA", "994": "WA",
  // IL 600-629
  "600": "IL", "601": "IL", "602": "IL", "603": "IL", "604": "IL",
  "605": "IL", "606": "IL", "607": "IL", "608": "IL", "609": "IL",
  "610": "IL", "611": "IL", "612": "IL", "613": "IL", "614": "IL",
  "615": "IL", "616": "IL", "617": "IL", "618": "IL", "619": "IL",
  "620": "IL", "622": "IL", "623": "IL", "624": "IL", "625": "IL",
  "626": "IL", "627": "IL", "628": "IL", "629": "IL",
  // CO 800-816
  "800": "CO", "801": "CO", "802": "CO", "803": "CO", "804": "CO",
  "805": "CO", "806": "CO", "807": "CO", "808": "CO", "809": "CO",
  "810": "CO", "811": "CO", "812": "CO", "813": "CO", "814": "CO",
  "815": "CO", "816": "CO",
  // AZ 850-865
  "850": "AZ", "851": "AZ", "852": "AZ", "853": "AZ", "855": "AZ",
  "856": "AZ", "857": "AZ", "859": "AZ", "860": "AZ", "863": "AZ",
  "864": "AZ", "865": "AZ",
  // HI
  "967": "HI", "968": "HI",
  // AK
  "995": "AK", "996": "AK", "997": "AK", "998": "AK", "999": "AK",
  // NC 270-289
  "270": "NC", "271": "NC", "272": "NC", "273": "NC", "274": "NC",
  "275": "NC", "276": "NC", "277": "NC", "278": "NC", "279": "NC",
  "280": "NC", "281": "NC", "282": "NC", "283": "NC", "284": "NC",
  "285": "NC", "286": "NC", "287": "NC", "288": "NC", "289": "NC",
  // OH 430-459
  "430": "OH", "431": "OH", "432": "OH", "433": "OH", "434": "OH",
  "435": "OH", "436": "OH", "437": "OH", "438": "OH", "439": "OH",
  "440": "OH", "441": "OH", "442": "OH", "443": "OH", "444": "OH",
  "445": "OH", "446": "OH", "447": "OH", "448": "OH", "449": "OH",
  "450": "OH", "451": "OH", "452": "OH", "453": "OH", "454": "OH",
  "455": "OH", "456": "OH", "457": "OH", "458": "OH", "459": "OH",
  // TN 370-385
  "370": "TN", "371": "TN", "372": "TN", "373": "TN", "374": "TN",
  "376": "TN", "377": "TN", "378": "TN", "379": "TN", "380": "TN",
  "381": "TN", "382": "TN", "383": "TN", "384": "TN", "385": "TN",
  // MI 480-499
  "480": "MI", "481": "MI", "482": "MI", "483": "MI", "484": "MI",
  "485": "MI", "486": "MI", "487": "MI", "488": "MI", "489": "MI",
  "490": "MI", "491": "MI", "492": "MI", "493": "MI", "494": "MI",
  "495": "MI", "496": "MI", "497": "MI", "498": "MI", "499": "MI",
};

/**
 * Extract state from a zip code using the 3-digit prefix table.
 */
export function stateFromZip(zip: string): string | null {
  const clean = zip.replace(/\D/g, "").substring(0, 3);
  if (clean.length < 3) return null;
  return ZIP_PREFIX_TO_STATE[clean] || null;
}

// ============================================================
// QUALITY TIER SYSTEM — Budget / Standard / Premium / Luxury
// ============================================================
export type QualityTier = "Budget" | "Standard" | "Premium" | "Luxury";

export interface TierConfig {
  materialMultiplier: number;
  laborMultiplier: number;
  label: string;
  description: string;
  finishDescriptions: Record<string, string>;
}

export const QUALITY_TIERS: Record<QualityTier, TierConfig> = {
  Budget: {
    materialMultiplier: 0.70,
    laborMultiplier: 0.90,
    label: "Budget",
    description: "Builder-grade materials, basic finishes. Cost-effective without cutting corners on code or safety.",
    finishDescriptions: {
      countertops: "Laminate countertops (Formica / Wilsonart)",
      cabinets: "Stock / builder-grade cabinets (thermofoil or melamine)",
      flooring: "Sheet vinyl or basic laminate flooring",
      tile: "Basic ceramic tile (builder-grade, 12×12 or 12×24)",
      paint: "Standard latex paint, flat or eggshell (1 coat primer + 2 coats)",
      fixtures: "Basic chrome fixtures (Glacier Bay / Project Source)",
      appliances: "Entry-level white or black appliances",
      lighting: "Basic flush-mount and recessed lights",
      hardware: "Standard pulls and knobs (chrome or nickel)",
      doors: "Hollow-core interior doors",
      trim: "MDF baseboard and casing",
      epoxy: "Single-coat solid epoxy with water-based topcoat",
    },
  },
  Standard: {
    materialMultiplier: 1.00,
    laborMultiplier: 1.00,
    label: "Standard",
    description: "Mid-range materials and finishes. Good quality, proven brands, professional result.",
    finishDescriptions: {
      countertops: "Quartz countertops (Silestone / Caesarstone level)",
      cabinets: "Semi-custom wood cabinets with soft-close hardware",
      flooring: "Luxury vinyl plank (LVP) or engineered hardwood",
      tile: "Porcelain tile (12×24 or large format), standard patterns",
      paint: "Premium latex paint, satin or semi-gloss (Sherwin-Williams / Benjamin Moore)",
      fixtures: "Mid-range brushed nickel or matte black (Moen / Delta)",
      appliances: "Stainless steel mid-range (Samsung / LG / Whirlpool)",
      lighting: "LED recessed + pendant fixtures",
      hardware: "Quality pulls and knobs (Top Knobs / Amerock)",
      doors: "Solid-core interior doors",
      trim: "Primed pine or poplar baseboard and casing",
      epoxy: "Full-broadcast flake epoxy with polyaspartic topcoat",
    },
  },
  Premium: {
    materialMultiplier: 1.45,
    laborMultiplier: 1.15,
    label: "Premium",
    description: "High-end materials, designer-level finishes, upgraded fixtures and appliances.",
    finishDescriptions: {
      countertops: "Premium quartz or natural granite (3cm, eased or ogee edge)",
      cabinets: "Custom or high-end semi-custom cabinets (maple / cherry / painted)",
      flooring: "Wide-plank hardwood (white oak / hickory) or premium porcelain",
      tile: "Designer porcelain or natural stone tile (marble-look, large format)",
      paint: "Designer paint, satin finish (Farrow & Ball / Benjamin Moore Advance)",
      fixtures: "High-end fixtures (Kohler / Grohe / Hansgrohe)",
      appliances: "Premium stainless (KitchenAid / Bosch / GE Profile)",
      lighting: "Designer LED fixtures, under-cabinet lighting, dimmer systems",
      hardware: "Premium hardware (Emtek / Restoration Hardware)",
      doors: "Solid-core paneled doors (Shaker or 5-panel)",
      trim: "Hardwood trim (oak / poplar), crown molding",
      epoxy: "Metallic epoxy or quartz broadcast with UV-stable polyaspartic",
    },
  },
  Luxury: {
    materialMultiplier: 1.85,
    laborMultiplier: 1.30,
    label: "Luxury",
    description: "Top-tier materials, custom craftsmanship, showroom-quality finishes throughout.",
    finishDescriptions: {
      countertops: "Natural marble, quartzite, or exotic stone (bookmatched slabs)",
      cabinets: "Fully custom inset cabinets (hand-painted or exotic wood)",
      flooring: "Wide-plank reclaimed or rift-sawn white oak, heated floors",
      tile: "Natural marble, zellige, or handmade artisan tile",
      paint: "Premium designer paint, custom color matching, hand-applied finish",
      fixtures: "Luxury fixtures (Waterworks / Dornbracht / Brizo)",
      appliances: "Professional-grade (Sub-Zero / Wolf / Thermador / Miele)",
      lighting: "Custom designer fixtures, smart lighting control (Lutron / Ketra)",
      hardware: "Custom or imported hardware (unlacquered brass / hand-forged)",
      doors: "Solid hardwood doors, custom profiles, concealed hinges",
      trim: "Custom millwork, built-in details, premium crown and wainscoting",
      epoxy: "Designer metallic epoxy with custom color blends, diamond-polished finish",
    },
  },
};

/**
 * Resolve the combined location multiplier from state + city/metro.
 * Accepts a flexible location string (address, city, state, or zip).
 * Returns { stateMultiplier, metroMultiplier, combined, state, metro }.
 */
export function resolveLocationMultiplier(location: string): {
  state: string | null;
  metro: string | null;
  stateMultiplier: number;
  metroMultiplier: number;
  combined: number;
} {
  if (!location || !location.trim()) {
    return { state: null, metro: null, stateMultiplier: 1.0, metroMultiplier: 1.0, combined: 1.0 };
  }
  const loc = location.trim();
  const locLower = loc.toLowerCase();

  // 1. Try to extract state abbreviation (last 2 letters or common patterns)
  let state: string | null = null;

  // Check for zip code anywhere in the string
  const zipMatch = loc.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (zipMatch) {
    state = stateFromZip(zipMatch[1]);
  }

  // Check for 2-letter state abbreviation
  if (!state) {
    const stateAbbrMatch = loc.match(/\b([A-Z]{2})\b/);
    if (stateAbbrMatch && REGION_MULTIPLIERS[stateAbbrMatch[1]]) {
      state = stateAbbrMatch[1];
    }
  }

  // Check for full state names (common ones)
  if (!state) {
    const stateNames: Record<string, string> = {
      "california": "CA", "new york": "NY", "texas": "TX", "florida": "FL",
      "washington": "WA", "massachusetts": "MA", "colorado": "CO", "illinois": "IL",
      "new jersey": "NJ", "connecticut": "CT", "georgia": "GA", "virginia": "VA",
      "pennsylvania": "PA", "arizona": "AZ", "oregon": "OR", "nevada": "NV",
      "hawaii": "HI", "alaska": "AK", "ohio": "OH", "michigan": "MI",
      "north carolina": "NC", "tennessee": "TN", "south carolina": "SC",
      "maryland": "MD", "minnesota": "MN", "missouri": "MO", "louisiana": "LA",
      "kentucky": "KY", "alabama": "AL", "mississippi": "MS", "arkansas": "AR",
      "west virginia": "WV", "oklahoma": "OK", "utah": "UT",
      "district of columbia": "DC",
    };
    for (const [name, abbr] of Object.entries(stateNames)) {
      if (locLower.includes(name)) {
        state = abbr;
        break;
      }
    }
  }

  // 2. Try to match a metro/city
  let metro: string | null = null;
  let metroMultiplier = 1.0;

  for (const [cityName, cityData] of Object.entries(METRO_COST_INDEX)) {
    if (locLower.includes(cityName)) {
      metro = cityName;
      metroMultiplier = cityData.multiplier;
      // If we also found the city's state from the metro, use it
      if (!state) state = cityData.state;
      break;
    }
  }

  const stateMultiplier = state ? (REGION_MULTIPLIERS[state] || REGION_MULTIPLIERS.DEFAULT) : 1.0;
  const combined = Math.round(stateMultiplier * metroMultiplier * 100) / 100;

  return { state, metro, stateMultiplier, metroMultiplier, combined };
}

/**
 * Apply location + tier pricing adjustments to an AI estimate result.
 * Modifies all line item costs and totals in-place and returns the adjusted object.
 */
export function applyLocationAndTierPricing(
  estimate: any,
  location: string,
  tier: QualityTier
): any {
  const locResult = resolveLocationMultiplier(location);
  const tierConfig = QUALITY_TIERS[tier] || QUALITY_TIERS.Standard;

  const locationMult = locResult.combined;
  const materialMult = tierConfig.materialMultiplier * locationMult;
  const laborMult = tierConfig.laborMultiplier * locationMult;

  // Helper to round to 2 decimal places
  const r = (n: number) => Math.round(n * 100) / 100;

  // Adjust line items
  const lineItems = estimate.line_items || estimate.lineItems || [];
  let totalMaterial = 0;
  let totalLabor = 0;

  for (const category of lineItems) {
    const items = category.items || [];
    let catMaterial = 0;
    let catLabor = 0;

    for (const item of items) {
      item.material_cost = r((item.material_cost || 0) * materialMult);
      item.labor_cost = r((item.labor_cost || 0) * laborMult);
      item.total_cost = r(item.material_cost + item.labor_cost);
      catMaterial += item.material_cost;
      catLabor += item.labor_cost;
    }

    totalMaterial += catMaterial;
    totalLabor += catLabor;
  }

  // Update category summaries
  if (estimate.category_summaries) {
    for (const cat of estimate.category_summaries) {
      cat.material_cost = r((cat.material_cost || 0) * materialMult);
      cat.labor_cost = r((cat.labor_cost || 0) * laborMult);
      cat.total_cost = r(cat.material_cost + cat.labor_cost);
    }
  }

  // Update totals
  if (estimate.totals) {
    estimate.totals.material_total = r(totalMaterial);
    estimate.totals.labor_total = r(totalLabor);
    estimate.totals.grand_total_estimate = r(totalMaterial + totalLabor);
  }

  // Add pricing metadata
  estimate._pricing = {
    location: location || "Not specified",
    state: locResult.state,
    metro: locResult.metro,
    stateMultiplier: locResult.stateMultiplier,
    metroMultiplier: locResult.metroMultiplier,
    locationCombined: locationMult,
    tier: tier,
    tierLabel: tierConfig.label,
    materialMultiplier: materialMult,
    laborMultiplier: laborMult,
    tierDescription: tierConfig.description,
  };

  return estimate;
}

/**
 * Main Price Book data - seed with common construction materials
 */
export const PRICE_BOOK: PriceBookEntry[] = [
  // ==========================================
  // EPOXY FLOORING (Primary for this business)
  // ==========================================
  {
    keywords: ["epoxy", "epoxy coating", "floor coating", "garage epoxy"],
    category: "EPOXY_FLOORING",
    unit: "GAL",
    priceLow: 80,
    priceHigh: 200,
    priceAvg: 140,
    notes: "2-part epoxy kit per gallon coverage 100-200 SF",
  },
  {
    keywords: ["polyaspartic", "poly coating"],
    category: "EPOXY_FLOORING",
    unit: "GAL",
    priceLow: 150,
    priceHigh: 350,
    priceAvg: 250,
    notes: "Fast-cure polyaspartic per gallon",
  },
  {
    keywords: ["primer", "epoxy primer", "floor primer"],
    category: "EPOXY_FLOORING",
    unit: "GAL",
    priceLow: 60,
    priceHigh: 120,
    priceAvg: 85,
  },
  {
    keywords: ["flake", "decorative flake", "chip", "vinyl chip"],
    category: "EPOXY_FLOORING",
    unit: "LB",
    priceLow: 8,
    priceHigh: 20,
    priceAvg: 12,
  },
  {
    keywords: ["clear coat", "topcoat", "urethane topcoat"],
    category: "EPOXY_FLOORING",
    unit: "GAL",
    priceLow: 100,
    priceHigh: 280,
    priceAvg: 180,
  },
  {
    keywords: ["quartz broadcast", "quartz aggregate"],
    category: "EPOXY_FLOORING",
    unit: "LB",
    priceLow: 0.50,
    priceHigh: 2,
    priceAvg: 1,
  },
  
  // ==========================================
  // CONCRETE / ASPHALT
  // ==========================================
  {
    keywords: ["ready-mix", "ready mix", "concrete"],
    category: "CONCRETE",
    unit: "CY",
    priceLow: 140,
    priceHigh: 220,
    priceAvg: 180,
    notes: "Delivered ready-mix concrete per CY",
  },
  {
    keywords: ["asphalt", "hot mix asphalt", "asphalt patch"],
    category: "CONCRETE",
    unit: "TON",
    priceLow: 100,
    priceHigh: 200,
    priceAvg: 145,
    notes: "Hot mix asphalt per ton",
  },
  {
    keywords: ["asphalt patch", "cold patch", "pothole patch"],
    category: "CONCRETE",
    unit: "BAG",
    priceLow: 15,
    priceHigh: 40,
    priceAvg: 25,
    notes: "50 lb cold patch bag",
  },
  {
    keywords: ["tack coat", "asphalt tack"],
    category: "CONCRETE",
    unit: "GAL",
    priceLow: 15,
    priceHigh: 35,
    priceAvg: 22,
  },
  {
    keywords: ["crushed rock", "crushed stone", "gravel", "rock bedding", "aggregate"],
    category: "CONCRETE",
    unit: "TON",
    priceLow: 30,
    priceHigh: 80,
    priceAvg: 50,
  },
  {
    keywords: ["crushed rock", "rock bedding", "gravel"],
    category: "CONCRETE",
    unit: "CY",
    priceLow: 40,
    priceHigh: 100,
    priceAvg: 65,
  },
  {
    keywords: ["compaction", "compactor rental"],
    category: "RENTAL",
    unit: "DAY",
    priceLow: 100,
    priceHigh: 250,
    priceAvg: 160,
  },
  {
    keywords: ["rebar", "reinforcing bar", "#4 rebar"],
    category: "CONCRETE",
    unit: "LF",
    priceLow: 0.60,
    priceHigh: 1.20,
    priceAvg: 0.85,
  },
  {
    keywords: ["rebar"],
    category: "CONCRETE",
    unit: "LB",
    priceLow: 0.50,
    priceHigh: 1.00,
    priceAvg: 0.70,
  },
  {
    keywords: ["vapor barrier", "poly sheeting", "moisture barrier"],
    category: "CONCRETE",
    unit: "SF",
    priceLow: 0.08,
    priceHigh: 0.25,
    priceAvg: 0.15,
  },
  {
    keywords: ["wire mesh", "welded wire"],
    category: "CONCRETE",
    unit: "SF",
    priceLow: 0.15,
    priceHigh: 0.35,
    priceAvg: 0.22,
  },
  {
    keywords: ["concrete sealer"],
    category: "CONCRETE",
    unit: "GAL",
    priceLow: 30,
    priceHigh: 80,
    priceAvg: 50,
  },
  
  // ==========================================
  // LUMBER
  // ==========================================
  {
    keywords: ["2x4", "stud"],
    category: "LUMBER",
    unit: "EA",
    priceLow: 3,
    priceHigh: 8,
    priceAvg: 5,
  },
  {
    keywords: ["2x6"],
    category: "LUMBER",
    unit: "LF",
    priceLow: 0.80,
    priceHigh: 1.80,
    priceAvg: 1.20,
  },
  {
    keywords: ["plywood", "sheathing"],
    category: "LUMBER",
    unit: "EA",
    priceLow: 35,
    priceHigh: 70,
    priceAvg: 50,
    notes: "4x8 sheet",
  },
  {
    keywords: ["osb"],
    category: "LUMBER",
    unit: "EA",
    priceLow: 25,
    priceHigh: 50,
    priceAvg: 35,
    notes: "4x8 sheet",
  },
  {
    keywords: ["drywall", "sheetrock", "gypsum"],
    category: "LUMBER",
    unit: "EA",
    priceLow: 12,
    priceHigh: 22,
    priceAvg: 16,
    notes: "4x8 sheet",
  },
  {
    keywords: ["insulation", "fiberglass batt"],
    category: "LUMBER",
    unit: "SF",
    priceLow: 0.50,
    priceHigh: 1.50,
    priceAvg: 0.90,
  },
  {
    keywords: ["baseboard", "base molding"],
    category: "LUMBER",
    unit: "LF",
    priceLow: 1.00,
    priceHigh: 4.00,
    priceAvg: 2.20,
  },
  {
    keywords: ["casing", "door casing", "window casing"],
    category: "LUMBER",
    unit: "LF",
    priceLow: 1.00,
    priceHigh: 3.50,
    priceAvg: 1.80,
  },
  {
    keywords: ["crown molding", "crown"],
    category: "LUMBER",
    unit: "LF",
    priceLow: 2.00,
    priceHigh: 8.00,
    priceAvg: 4.00,
  },
  {
    keywords: ["interior door", "prehung door"],
    category: "LUMBER",
    unit: "EA",
    priceLow: 80,
    priceHigh: 350,
    priceAvg: 180,
  },
  {
    keywords: ["exterior door", "entry door"],
    category: "LUMBER",
    unit: "EA",
    priceLow: 300,
    priceHigh: 1500,
    priceAvg: 650,
  },
  
  // ==========================================
  // PLUMBING
  // ==========================================
  {
    keywords: ["sewer pipe", "sdr-35", "pvc pipe", "drain pipe"],
    category: "PLUMBING",
    unit: "LF",
    priceLow: 3,
    priceHigh: 25,
    priceAvg: 12,
    notes: "SDR-35 PVC or similar drainage pipe",
  },
  {
    keywords: ["sewer pipe", "sdr-35", "pvc pipe 4 inch", "pvc pipe 6 inch", "pvc pipe 8 inch"],
    category: "PLUMBING",
    unit: "EA",
    priceLow: 20,
    priceHigh: 150,
    priceAvg: 65,
    notes: "Per 10-20 ft section",
  },
  {
    keywords: ["pipe fitting", "coupling", "elbow", "tee"],
    category: "PLUMBING",
    unit: "EA",
    priceLow: 3,
    priceHigh: 40,
    priceAvg: 15,
  },
  {
    keywords: ["toilet", "water closet"],
    category: "PLUMBING",
    unit: "EA",
    priceLow: 120,
    priceHigh: 600,
    priceAvg: 280,
  },
  {
    keywords: ["vanity"],
    category: "PLUMBING",
    unit: "EA",
    priceLow: 200,
    priceHigh: 1200,
    priceAvg: 450,
  },
  {
    keywords: ["sink", "lavatory"],
    category: "PLUMBING",
    unit: "EA",
    priceLow: 80,
    priceHigh: 500,
    priceAvg: 200,
  },
  {
    keywords: ["faucet"],
    category: "PLUMBING",
    unit: "EA",
    priceLow: 80,
    priceHigh: 400,
    priceAvg: 180,
  },
  {
    keywords: ["tub", "bathtub"],
    category: "PLUMBING",
    unit: "EA",
    priceLow: 250,
    priceHigh: 1500,
    priceAvg: 550,
  },
  {
    keywords: ["shower valve", "shower trim"],
    category: "PLUMBING",
    unit: "EA",
    priceLow: 100,
    priceHigh: 500,
    priceAvg: 220,
  },
  {
    keywords: ["water heater"],
    category: "PLUMBING",
    unit: "EA",
    priceLow: 400,
    priceHigh: 1800,
    priceAvg: 800,
  },
  {
    keywords: ["garbage disposal"],
    category: "PLUMBING",
    unit: "EA",
    priceLow: 80,
    priceHigh: 300,
    priceAvg: 150,
  },
  
  // ==========================================
  // ELECTRICAL
  // ==========================================
  {
    keywords: ["light fixture", "ceiling light"],
    category: "ELECTRICAL",
    unit: "EA",
    priceLow: 30,
    priceHigh: 300,
    priceAvg: 100,
  },
  {
    keywords: ["recessed light", "can light", "downlight"],
    category: "ELECTRICAL",
    unit: "EA",
    priceLow: 15,
    priceHigh: 80,
    priceAvg: 35,
  },
  {
    keywords: ["ceiling fan"],
    category: "ELECTRICAL",
    unit: "EA",
    priceLow: 80,
    priceHigh: 400,
    priceAvg: 180,
  },
  {
    keywords: ["exhaust fan", "bath fan"],
    category: "ELECTRICAL",
    unit: "EA",
    priceLow: 40,
    priceHigh: 200,
    priceAvg: 90,
  },
  {
    keywords: ["outlet", "receptacle"],
    category: "ELECTRICAL",
    unit: "EA",
    priceLow: 2,
    priceHigh: 15,
    priceAvg: 5,
  },
  {
    keywords: ["switch", "light switch"],
    category: "ELECTRICAL",
    unit: "EA",
    priceLow: 2,
    priceHigh: 25,
    priceAvg: 8,
  },
  {
    keywords: ["panel", "electrical panel", "breaker panel"],
    category: "ELECTRICAL",
    unit: "EA",
    priceLow: 150,
    priceHigh: 800,
    priceAvg: 350,
  },
  
  // ==========================================
  // PAINT
  // ==========================================
  {
    keywords: ["interior paint", "wall paint"],
    category: "PAINT",
    unit: "GAL",
    priceLow: 25,
    priceHigh: 70,
    priceAvg: 40,
  },
  {
    keywords: ["exterior paint"],
    category: "PAINT",
    unit: "GAL",
    priceLow: 35,
    priceHigh: 80,
    priceAvg: 55,
  },
  {
    keywords: ["primer"],
    category: "PAINT",
    unit: "GAL",
    priceLow: 20,
    priceHigh: 50,
    priceAvg: 32,
  },
  {
    keywords: ["stain", "wood stain"],
    category: "PAINT",
    unit: "GAL",
    priceLow: 30,
    priceHigh: 70,
    priceAvg: 45,
  },
  
  // ==========================================
  // TILE & FLOORING
  // ==========================================
  {
    keywords: ["ceramic tile", "porcelain tile"],
    category: "TILE_FLOORING",
    unit: "SF",
    priceLow: 1.50,
    priceHigh: 8.00,
    priceAvg: 3.50,
  },
  {
    keywords: ["lvp", "luxury vinyl", "vinyl plank"],
    category: "TILE_FLOORING",
    unit: "SF",
    priceLow: 2.00,
    priceHigh: 6.00,
    priceAvg: 3.50,
  },
  {
    keywords: ["hardwood", "oak flooring", "engineered wood"],
    category: "TILE_FLOORING",
    unit: "SF",
    priceLow: 4.00,
    priceHigh: 15.00,
    priceAvg: 7.00,
  },
  {
    keywords: ["carpet"],
    category: "TILE_FLOORING",
    unit: "SF",
    priceLow: 2.00,
    priceHigh: 8.00,
    priceAvg: 4.00,
  },
  {
    keywords: ["laminate"],
    category: "TILE_FLOORING",
    unit: "SF",
    priceLow: 1.50,
    priceHigh: 5.00,
    priceAvg: 2.50,
  },
  {
    keywords: ["thinset", "tile mortar"],
    category: "TILE_FLOORING",
    unit: "BAG",
    priceLow: 15,
    priceHigh: 40,
    priceAvg: 25,
    notes: "50 lb bag",
  },
  {
    keywords: ["grout"],
    category: "TILE_FLOORING",
    unit: "BAG",
    priceLow: 12,
    priceHigh: 35,
    priceAvg: 20,
  },
  
  // ==========================================
  // CABINETS
  // ==========================================
  {
    keywords: ["base cabinet"],
    category: "CABINETS",
    unit: "LF",
    priceLow: 100,
    priceHigh: 400,
    priceAvg: 200,
  },
  {
    keywords: ["wall cabinet", "upper cabinet"],
    category: "CABINETS",
    unit: "LF",
    priceLow: 80,
    priceHigh: 350,
    priceAvg: 180,
  },
  {
    keywords: ["countertop", "granite countertop", "quartz countertop"],
    category: "CABINETS",
    unit: "SF",
    priceLow: 40,
    priceHigh: 150,
    priceAvg: 75,
  },
  {
    keywords: ["laminate countertop"],
    category: "CABINETS",
    unit: "SF",
    priceLow: 15,
    priceHigh: 40,
    priceAvg: 25,
  },
  
  // ==========================================
  // APPLIANCES
  // ==========================================
  {
    keywords: ["refrigerator", "fridge"],
    category: "APPLIANCE",
    unit: "EA",
    priceLow: 500,
    priceHigh: 3000,
    priceAvg: 1200,
  },
  {
    keywords: ["range", "stove", "oven"],
    category: "APPLIANCE",
    unit: "EA",
    priceLow: 400,
    priceHigh: 2500,
    priceAvg: 900,
  },
  {
    keywords: ["dishwasher"],
    category: "APPLIANCE",
    unit: "EA",
    priceLow: 350,
    priceHigh: 1200,
    priceAvg: 600,
  },
  {
    keywords: ["microwave"],
    category: "APPLIANCE",
    unit: "EA",
    priceLow: 100,
    priceHigh: 600,
    priceAvg: 280,
  },
  {
    keywords: ["washer", "washing machine"],
    category: "APPLIANCE",
    unit: "EA",
    priceLow: 400,
    priceHigh: 1500,
    priceAvg: 750,
  },
  {
    keywords: ["dryer"],
    category: "APPLIANCE",
    unit: "EA",
    priceLow: 400,
    priceHigh: 1400,
    priceAvg: 700,
  },
  
  // ==========================================
  // HVAC
  // ==========================================
  {
    keywords: ["mini split", "ductless", "ac unit"],
    category: "HVAC",
    unit: "EA",
    priceLow: 800,
    priceHigh: 3500,
    priceAvg: 1800,
  },
  {
    keywords: ["thermostat", "smart thermostat"],
    category: "HVAC",
    unit: "EA",
    priceLow: 25,
    priceHigh: 300,
    priceAvg: 120,
  },
  {
    keywords: ["furnace"],
    category: "HVAC",
    unit: "EA",
    priceLow: 1000,
    priceHigh: 4000,
    priceAvg: 2200,
  },
  
  // ==========================================
  // ROOFING
  // ==========================================
  {
    keywords: ["shingle", "asphalt shingle"],
    category: "ROOFING",
    unit: "SQ",
    priceLow: 80,
    priceHigh: 200,
    priceAvg: 130,
    notes: "Per 100 SF (1 square)",
  },
  {
    keywords: ["underlayment", "roofing felt"],
    category: "ROOFING",
    unit: "ROLL",
    priceLow: 25,
    priceHigh: 80,
    priceAvg: 45,
  },
  {
    keywords: ["drip edge", "flashing"],
    category: "ROOFING",
    unit: "LF",
    priceLow: 1.50,
    priceHigh: 4.00,
    priceAvg: 2.50,
  },
  {
    keywords: ["ridge cap", "ridge vent"],
    category: "ROOFING",
    unit: "LF",
    priceLow: 3.00,
    priceHigh: 8.00,
    priceAvg: 5.00,
  },
  
  // ==========================================
  // RENTAL EQUIPMENT
  // ==========================================
  {
    keywords: ["floor grinder", "concrete grinder", "diamond grinder"],
    category: "RENTAL",
    unit: "DAY",
    priceLow: 200,
    priceHigh: 500,
    priceAvg: 350,
  },
  {
    keywords: ["pressure washer"],
    category: "RENTAL",
    unit: "DAY",
    priceLow: 50,
    priceHigh: 150,
    priceAvg: 90,
  },
  {
    keywords: ["scissor lift"],
    category: "RENTAL",
    unit: "DAY",
    priceLow: 150,
    priceHigh: 350,
    priceAvg: 220,
  },
  {
    keywords: ["boom lift"],
    category: "RENTAL",
    unit: "DAY",
    priceLow: 250,
    priceHigh: 600,
    priceAvg: 400,
  },
  {
    keywords: ["dumpster", "roll off"],
    category: "RENTAL",
    unit: "EA",
    priceLow: 300,
    priceHigh: 700,
    priceAvg: 450,
    notes: "Per haul",
  },
  
  // ==========================================
  // GENERAL CONSUMABLES
  // ==========================================
  {
    keywords: ["screw", "drywall screw"],
    category: "GENERAL",
    unit: "BOX",
    priceLow: 8,
    priceHigh: 35,
    priceAvg: 18,
  },
  {
    keywords: ["nail", "framing nail"],
    category: "GENERAL",
    unit: "BOX",
    priceLow: 15,
    priceHigh: 50,
    priceAvg: 30,
  },
  {
    keywords: ["caulk", "silicone"],
    category: "GENERAL",
    unit: "EA",
    priceLow: 4,
    priceHigh: 15,
    priceAvg: 8,
  },
  {
    keywords: ["tape", "painter tape", "masking tape"],
    category: "GENERAL",
    unit: "ROLL",
    priceLow: 4,
    priceHigh: 12,
    priceAvg: 7,
  },
  {
    keywords: ["joint compound", "mud"],
    category: "GENERAL",
    unit: "GAL",
    priceLow: 12,
    priceHigh: 25,
    priceAvg: 18,
  },
  {
    keywords: ["adhesive", "construction adhesive"],
    category: "GENERAL",
    unit: "EA",
    priceLow: 4,
    priceHigh: 12,
    priceAvg: 7,
  },
];

/**
 * Lookup price from price book
 * Returns the best match for an item name + category
 */
export function lookupPrice(
  itemName: string,
  category?: MaterialCategory,
  state?: string
): PriceBookEntry | null {
  const searchName = itemName.toLowerCase();
  
  // Find best match - prefer exact category match
  let bestMatch: PriceBookEntry | null = null;
  let bestScore = 0;
  
  for (const entry of PRICE_BOOK) {
    // Check if any keyword matches
    let score = 0;
    for (const keyword of entry.keywords) {
      if (searchName.includes(keyword.toLowerCase())) {
        // Longer keyword = better match
        score = Math.max(score, keyword.length);
      }
    }
    
    if (score > 0) {
      // Bonus for matching category
      if (category && entry.category === category) {
        score += 10;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = entry;
      }
    }
  }
  
  // Apply region multiplier if we have a match and state
  if (bestMatch && state) {
    const multiplier = REGION_MULTIPLIERS[state.toUpperCase()] || REGION_MULTIPLIERS.DEFAULT;
    return {
      ...bestMatch,
      priceLow: Math.round(bestMatch.priceLow * multiplier * 100) / 100,
      priceHigh: Math.round(bestMatch.priceHigh * multiplier * 100) / 100,
      priceAvg: Math.round(bestMatch.priceAvg * multiplier * 100) / 100,
    };
  }
  
  return bestMatch;
}

/**
 * Get category-specific price book entries
 */
export function getPriceBookByCategory(category: MaterialCategory): PriceBookEntry[] {
  return PRICE_BOOK.filter(entry => entry.category === category);
}

