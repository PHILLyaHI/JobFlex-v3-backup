/**
 * Location-based tax rate lookup
 * Primary: ZIP code lookup via API for accurate combined rates
 * Fallback: State-based estimates
 */

export type StateCode = 
  | 'AL' | 'AK' | 'AZ' | 'AR' | 'CA' | 'CO' | 'CT' | 'DE' | 'FL' | 'GA'
  | 'HI' | 'ID' | 'IL' | 'IN' | 'IA' | 'KS' | 'KY' | 'LA' | 'ME' | 'MD'
  | 'MA' | 'MI' | 'MN' | 'MS' | 'MO' | 'MT' | 'NE' | 'NV' | 'NH' | 'NJ'
  | 'NM' | 'NY' | 'NC' | 'ND' | 'OH' | 'OK' | 'OR' | 'PA' | 'RI' | 'SC'
  | 'SD' | 'TN' | 'TX' | 'UT' | 'VT' | 'VA' | 'WA' | 'WV' | 'WI' | 'WY'
  | 'DC';

/**
 * Fallback: Average combined state + local rates (as decimals)
 * Used when ZIP lookup fails
 */
const STATE_COMBINED_RATES: Record<string, number> = {
  'AL': 0.0924, 'AK': 0.0176, 'AZ': 0.0840, 'AR': 0.0947, 'CA': 0.0868,
  'CO': 0.0777, 'CT': 0.0635, 'DE': 0.0000, 'FL': 0.0708, 'GA': 0.0732,
  'HI': 0.0444, 'ID': 0.0603, 'IL': 0.0882, 'IN': 0.0700, 'IA': 0.0694,
  'KS': 0.0871, 'KY': 0.0600, 'LA': 0.0955, 'ME': 0.0550, 'MD': 0.0600,
  'MA': 0.0625, 'MI': 0.0600, 'MN': 0.0749, 'MS': 0.0707, 'MO': 0.0825,
  'MT': 0.0000, 'NE': 0.0694, 'NV': 0.0823, 'NH': 0.0000, 'NJ': 0.0663,
  'NM': 0.0783, 'NY': 0.0852, 'NC': 0.0698, 'ND': 0.0696, 'OH': 0.0723,
  'OK': 0.0895, 'OR': 0.0000, 'PA': 0.0634, 'RI': 0.0700, 'SC': 0.0746,
  'SD': 0.0640, 'TN': 0.0955, 'TX': 0.0820, 'UT': 0.0719, 'VT': 0.0624,
  'VA': 0.0575, 'WA': 0.0929, 'WV': 0.0655, 'WI': 0.0543, 'WY': 0.0536,
  'DC': 0.0600,
};

/**
 * ZIP code to combined tax rate cache
 * Populated from API calls, persists during session
 */
const ZIP_RATE_CACHE: Record<string, number> = {};

/**
 * Common ZIP code tax rates (pre-populated for major areas)
 * Format: ZIP prefix (3-5 digits) -> combined rate
 */
const ZIP_RATES: Record<string, number> = {
  // California
  '900': 0.0950, '901': 0.0950, '902': 0.0950, // Los Angeles
  '903': 0.0950, '904': 0.0950, '905': 0.0950,
  '906': 0.0950, '907': 0.0950, '908': 0.0950,
  '910': 0.0975, '911': 0.0975, '912': 0.0975, // Pasadena/Glendale
  '913': 0.0925, '914': 0.0925, // Van Nuys
  '917': 0.0775, // Industry
  '920': 0.0775, '921': 0.0775, // San Diego
  '922': 0.0775, '923': 0.0775,
  '925': 0.0775, // Escondido
  '926': 0.0775, '927': 0.0775, // Santa Ana/Anaheim
  '928': 0.0775, // Anaheim
  '930': 0.0775, // Ventura
  '931': 0.0825, // Santa Barbara
  '932': 0.0863, // Bakersfield
  '933': 0.0863,
  '934': 0.0913, // San Luis Obispo
  '935': 0.0825, // Mojave
  '936': 0.0875, // Fresno
  '937': 0.0875,
  '940': 0.0925, // San Francisco
  '941': 0.0875, // San Francisco
  '942': 0.0925, // Sacramento
  '943': 0.0925,
  '944': 0.1025, // San Mateo
  '945': 0.1025, // Oakland
  '946': 0.1025,
  '947': 0.0975, // Berkeley
  '948': 0.0975, // Richmond
  '949': 0.0925, // San Rafael
  '950': 0.0913, // San Jose
  '951': 0.0913,
  '952': 0.0925, // Stockton
  '953': 0.0775, // Modesto
  '954': 0.0875, // Santa Rosa
  '955': 0.0875, // Eureka
  '956': 0.0775, // Sacramento
  '957': 0.0863, // Sacramento
  '958': 0.0863,
  '959': 0.0775, // Marysville
  '960': 0.0725, // Redding
  '961': 0.0775, // Susanville
  
  // Texas
  '750': 0.0825, '751': 0.0825, '752': 0.0825, // Dallas
  '753': 0.0825, '754': 0.0825, '755': 0.0825,
  '760': 0.0825, '761': 0.0825, '762': 0.0825, // Fort Worth
  '763': 0.0825,
  '770': 0.0825, '771': 0.0825, '772': 0.0825, // Houston
  '773': 0.0825, '774': 0.0825, '775': 0.0825,
  '776': 0.0825, '777': 0.0825,
  '780': 0.0825, '781': 0.0825, '782': 0.0825, // San Antonio
  '783': 0.0825, '784': 0.0825, '785': 0.0825,
  '786': 0.0825, '787': 0.0825, '788': 0.0825, // Austin
  '789': 0.0825,
  '790': 0.0825, '791': 0.0825, // Amarillo
  '792': 0.0825, '793': 0.0825, // Lubbock
  '794': 0.0825, '795': 0.0825,
  '796': 0.0825, '797': 0.0825, // Waco
  '798': 0.0825, '799': 0.0825, // El Paso
  
  // Florida
  '320': 0.0700, '321': 0.0700, // Jacksonville
  '322': 0.0700, '323': 0.0750, // Tallahassee
  '324': 0.0700, '325': 0.0700,
  '326': 0.0700, '327': 0.0650, // Orlando
  '328': 0.0650,
  '329': 0.0700, // Melbourne
  '330': 0.0700, '331': 0.0700, // Miami
  '332': 0.0700, '333': 0.0700,
  '334': 0.0700, '335': 0.0700, // Tampa
  '336': 0.0750, '337': 0.0750,
  '338': 0.0700, // Lakeland
  '339': 0.0700, // Fort Myers
  '340': 0.0700,
  '341': 0.0700, // Naples
  '342': 0.0700,
  '344': 0.0700, // Gainesville
  '346': 0.0700, // Tampa
  '347': 0.0700,
  
  // New York
  '100': 0.0888, '101': 0.0888, '102': 0.0888, // Manhattan
  '103': 0.0888, '104': 0.0888,
  '105': 0.0838, // Westchester
  '106': 0.0838, '107': 0.0838,
  '108': 0.0838, '109': 0.0838,
  '110': 0.0888, '111': 0.0888, // Queens
  '112': 0.0888, '113': 0.0888, // Brooklyn
  '114': 0.0888, '115': 0.0888,
  '116': 0.0888, // Bronx
  '117': 0.0863, // Long Island
  '118': 0.0863, '119': 0.0863,
  '120': 0.0800, '121': 0.0800, // Albany
  '122': 0.0800, '123': 0.0800,
  '124': 0.0800, // Kingston
  '125': 0.0800, '126': 0.0800,
  '127': 0.0800, // Poughkeepsie
  '128': 0.0800, '129': 0.0800,
  '130': 0.0800, // Syracuse
  '131': 0.0800, '132': 0.0800,
  '140': 0.0800, '141': 0.0800, // Buffalo
  '142': 0.0800, '143': 0.0800,
  '144': 0.0800, '145': 0.0800, // Rochester
  '146': 0.0800, '147': 0.0800,
  '148': 0.0800, '149': 0.0800,
  
  // Illinois
  '600': 0.1025, '601': 0.1025, // Chicago
  '602': 0.1025, '603': 0.1025,
  '604': 0.1025, '605': 0.1025,
  '606': 0.1025, '607': 0.1025,
  '608': 0.1025,
  '609': 0.0750, // Kankakee
  '610': 0.0825, // Rockford
  '611': 0.0825, '612': 0.0825,
  '613': 0.0825, // La Salle
  '614': 0.0825, '615': 0.0825,
  '616': 0.0825, // Peoria
  '617': 0.0825, '618': 0.0825,
  '619': 0.0825, // Champaign
  '620': 0.0875, // Springfield
  '621': 0.0875, '622': 0.0875,
  '623': 0.0875, // Quincy
  '624': 0.0825, // Effingham
  '625': 0.0825, // Decatur
  '626': 0.0825, '627': 0.0825,
  '628': 0.0825, // Centralia
  '629': 0.0825, // Carbondale
  
  // Washington
  '980': 0.1025, '981': 0.1025, // Seattle
  '982': 0.1025, '983': 0.1025,
  '984': 0.1030, // Tacoma
  '985': 0.0890, // Olympia
  '986': 0.0810, // Portland area
  '988': 0.0810, // Wenatchee
  '989': 0.0810, // Yakima
  '990': 0.0890, // Spokane
  '991': 0.0890, '992': 0.0890,
  '993': 0.0810, // Pasco
  '994': 0.0810, // Clarkston
  
  // Colorado
  '800': 0.0877, '801': 0.0877, // Denver
  '802': 0.0877, '803': 0.0877,
  '804': 0.0877, '805': 0.0877,
  '806': 0.0829, // Brighton
  '807': 0.0829, // Fort Morgan
  '808': 0.0820, // Colorado Springs
  '809': 0.0820,
  '810': 0.0775, // Pueblo
  '811': 0.0775, // Alamosa
  '812': 0.0290, // Salida (state only)
  '813': 0.0740, // Durango
  '814': 0.0690, // Grand Junction
  '815': 0.0290, // Montrose
  '816': 0.0290, // Glenwood Springs
  
  // Arizona
  '850': 0.0800, '851': 0.0800, // Phoenix
  '852': 0.0800, '853': 0.0800,
  '854': 0.0800,
  '855': 0.0800, // Globe
  '856': 0.0810, // Tucson
  '857': 0.0810,
  '859': 0.0560, // Show Low (state only)
  '860': 0.0956, // Flagstaff
  '863': 0.0840, // Prescott
  '864': 0.0560, // Kingman (state only)
  '865': 0.0560, // Gallup (state only)
  
  // Georgia
  '300': 0.0890, '301': 0.0890, // Atlanta
  '302': 0.0890, '303': 0.0890,
  '304': 0.0800, // Swainsboro
  '305': 0.0800, // Gainesville
  '306': 0.0800, // Athens
  '307': 0.0800, // Dalton
  '308': 0.0800, // Augusta
  '309': 0.0800,
  '310': 0.0700, // Macon
  '311': 0.0800, // Atlanta
  '312': 0.0800,
  '313': 0.0700, // Savannah
  '314': 0.0700,
  '315': 0.0800, // Waycross
  '316': 0.0800, // Valdosta
  '317': 0.0800, // Albany
  '318': 0.0800, // Columbus
  '319': 0.0800,
  
  // North Carolina
  '270': 0.0675, // Greensboro
  '271': 0.0675, '272': 0.0675,
  '273': 0.0675, // Raleigh
  '274': 0.0675, '275': 0.0750,
  '276': 0.0750, '277': 0.0750,
  '278': 0.0700, // Rocky Mount
  '279': 0.0700,
  '280': 0.0725, // Charlotte
  '281': 0.0725, '282': 0.0725,
  '283': 0.0725, '284': 0.0725,
  '285': 0.0700, // Kinston
  '286': 0.0700, // Hickory
  '287': 0.0700, '288': 0.0700,
  '289': 0.0700, // Asheville
  
  // Tennessee
  '370': 0.0975, '371': 0.0975, // Nashville
  '372': 0.0975, '373': 0.0975,
  '374': 0.0975, // Chattanooga
  '375': 0.0925,
  '376': 0.0925, // Johnson City
  '377': 0.0925, '378': 0.0925,
  '379': 0.0925, // Knoxville
  '380': 0.0975, '381': 0.0975, // Memphis
  '382': 0.0975, '383': 0.0975,
  '384': 0.0975, // Columbia
  '385': 0.0975, // Cookeville
  
  // Pennsylvania
  '150': 0.0700, '151': 0.0700, // Pittsburgh
  '152': 0.0700, '153': 0.0700,
  '154': 0.0600, // Uniontown
  '155': 0.0600, '156': 0.0600,
  '157': 0.0600, // Indiana
  '158': 0.0600, // DuBois
  '159': 0.0600, // Johnstown
  '160': 0.0600, // Butler
  '161': 0.0600, '162': 0.0600,
  '163': 0.0600, // Oil City
  '164': 0.0600, // Erie
  '165': 0.0600, '166': 0.0600,
  '167': 0.0600, // Bradford
  '168': 0.0600, // State College
  '169': 0.0600, // Wellsboro
  '170': 0.0600, // Harrisburg
  '171': 0.0600, '172': 0.0600,
  '173': 0.0600, // York
  '174': 0.0600, '175': 0.0600,
  '176': 0.0600, // Lancaster
  '177': 0.0600, // Williamsport
  '178': 0.0600, // Sunbury
  '179': 0.0600, // Pottsville
  '180': 0.0600, // Lehigh Valley
  '181': 0.0600, '182': 0.0600,
  '183': 0.0600, // Stroudsburg
  '184': 0.0600, '185': 0.0600,
  '186': 0.0600, // Scranton
  '187': 0.0600, '188': 0.0600,
  '189': 0.0600, // Doylestown
  '190': 0.0800, '191': 0.0800, // Philadelphia
  '192': 0.0800, '193': 0.0600,
  '194': 0.0600, '195': 0.0600,
  '196': 0.0600, // Reading
  
  // New Jersey (uniform 6.625%)
  '070': 0.0663, '071': 0.0663, '072': 0.0663,
  '073': 0.0663, '074': 0.0663, '075': 0.0663,
  '076': 0.0663, '077': 0.0663, '078': 0.0663,
  '079': 0.0663, '080': 0.0663, '081': 0.0663,
  '082': 0.0663, '083': 0.0663, '084': 0.0663,
  '085': 0.0663, '086': 0.0663, '087': 0.0663,
  '088': 0.0663, '089': 0.0663,
  
  // Massachusetts (uniform 6.25%)
  '010': 0.0625, '011': 0.0625, '012': 0.0625,
  '013': 0.0625, '014': 0.0625, '015': 0.0625,
  '016': 0.0625, '017': 0.0625, '018': 0.0625,
  '019': 0.0625, '020': 0.0625, '021': 0.0625,
  '022': 0.0625, '023': 0.0625, '024': 0.0625,
  '025': 0.0625, '026': 0.0625, '027': 0.0625,
  
  // Ohio
  '430': 0.0750, '431': 0.0750, // Columbus
  '432': 0.0750, '433': 0.0750,
  '434': 0.0700, // Bowling Green
  '435': 0.0725, // Toledo
  '436': 0.0725,
  '437': 0.0700, // Zanesville
  '438': 0.0700,
  '439': 0.0800, // Steubenville
  '440': 0.0800, '441': 0.0800, // Cleveland
  '442': 0.0800, '443': 0.0800,
  '444': 0.0800, '445': 0.0800,
  '446': 0.0775, // Youngstown
  '447': 0.0700, // Canton
  '448': 0.0700, // Massillon
  '449': 0.0700, // Mansfield
  '450': 0.0750, '451': 0.0750, // Cincinnati
  '452': 0.0750, '453': 0.0750,
  '454': 0.0750, // Dayton
  '455': 0.0750, '456': 0.0750,
  '457': 0.0750, // Athens
  '458': 0.0750, // Lima
  
  // Michigan
  '480': 0.0600, '481': 0.0600, // Detroit
  '482': 0.0600, '483': 0.0600,
  '484': 0.0600, '485': 0.0600,
  '486': 0.0600, // Saginaw
  '487': 0.0600, '488': 0.0600,
  '489': 0.0600, // Lansing
  '490': 0.0600, // Kalamazoo
  '491': 0.0600, '492': 0.0600,
  '493': 0.0600, // Grand Rapids
  '494': 0.0600, '495': 0.0600,
  '496': 0.0600, // Traverse City
  '497': 0.0600, // Gaylord
  '498': 0.0600, // Iron Mountain
  '499': 0.0600, // Iron Mountain
};

/**
 * State name to code mapping
 */
const STATE_NAME_MAP: Record<string, string> = {
  'ALABAMA': 'AL', 'ALASKA': 'AK', 'ARIZONA': 'AZ', 'ARKANSAS': 'AR',
  'CALIFORNIA': 'CA', 'COLORADO': 'CO', 'CONNECTICUT': 'CT', 'DELAWARE': 'DE',
  'FLORIDA': 'FL', 'GEORGIA': 'GA', 'HAWAII': 'HI', 'IDAHO': 'ID',
  'ILLINOIS': 'IL', 'INDIANA': 'IN', 'IOWA': 'IA', 'KANSAS': 'KS',
  'KENTUCKY': 'KY', 'LOUISIANA': 'LA', 'MAINE': 'ME', 'MARYLAND': 'MD',
  'MASSACHUSETTS': 'MA', 'MICHIGAN': 'MI', 'MINNESOTA': 'MN', 'MISSISSIPPI': 'MS',
  'MISSOURI': 'MO', 'MONTANA': 'MT', 'NEBRASKA': 'NE', 'NEVADA': 'NV',
  'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', 'OHIO': 'OH', 'OKLAHOMA': 'OK',
  'OREGON': 'OR', 'PENNSYLVANIA': 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD', 'TENNESSEE': 'TN', 'TEXAS': 'TX', 'UTAH': 'UT',
  'VERMONT': 'VT', 'VIRGINIA': 'VA', 'WASHINGTON': 'WA', 'WEST VIRGINIA': 'WV',
  'WISCONSIN': 'WI', 'WYOMING': 'WY', 'DISTRICT OF COLUMBIA': 'DC', 'WASHINGTON DC': 'DC',
};

/**
 * Normalize state input to 2-letter code
 */
function normalizeState(state: string | null | undefined): string | null {
  if (!state) return null;
  const normalized = state.trim().toUpperCase();
  if (normalized.length === 2 && STATE_COMBINED_RATES[normalized]) {
    return normalized;
  }
  return STATE_NAME_MAP[normalized] || null;
}

/**
 * Get tax rate by ZIP code (synchronous, uses local data)
 * Returns combined state + local tax rate
 */
export function getTaxRateByZip(zip: string | null | undefined): number {
  if (!zip) return 0;
  
  const cleanZip = zip.replace(/\D/g, '').slice(0, 5);
  if (cleanZip.length < 3) return 0;
  
  // Check cache first
  if (ZIP_RATE_CACHE[cleanZip]) {
    return ZIP_RATE_CACHE[cleanZip];
  }
  
  // Try exact 5-digit match
  if (cleanZip.length === 5 && ZIP_RATES[cleanZip]) {
    return ZIP_RATES[cleanZip];
  }
  
  // Try 4-digit prefix
  const prefix4 = cleanZip.slice(0, 4);
  if (ZIP_RATES[prefix4]) {
    return ZIP_RATES[prefix4];
  }
  
  // Try 3-digit prefix
  const prefix3 = cleanZip.slice(0, 3);
  if (ZIP_RATES[prefix3]) {
    return ZIP_RATES[prefix3];
  }
  
  return 0;
}

/**
 * Get tax rate by ZIP code as percentage
 */
export function getTaxRateByZipPercent(zip: string | null | undefined): number {
  return getTaxRateByZip(zip) * 100;
}

/**
 * Get combined tax rate - primary by ZIP, fallback to state
 * @param zip - ZIP code (preferred)
 * @param state - State code or name (fallback)
 */
export function getTaxRate(
  zip?: string | null,
  state?: string | null,
): number {
  // Try ZIP first (most accurate)
  if (zip) {
    const zipRate = getTaxRateByZip(zip);
    if (zipRate > 0) return zipRate;
  }
  
  // Fallback to state average
  const stateCode = normalizeState(state);
  if (stateCode) {
    return STATE_COMBINED_RATES[stateCode] || 0;
  }
  
  return 0;
}

/**
 * Get combined tax rate as percentage
 */
export function getTaxRatePercent(
  zip?: string | null,
  state?: string | null,
): number {
  return getTaxRate(zip, state) * 100;
}

/**
 * Cache a ZIP code rate (for API responses)
 */
export function cacheZipRate(zip: string, rate: number): void {
  const cleanZip = zip.replace(/\D/g, '').slice(0, 5);
  if (cleanZip.length === 5) {
    ZIP_RATE_CACHE[cleanZip] = rate;
  }
}

/**
 * Legacy function for backward compatibility
 */
export function getStateTaxRate(state: string | null | undefined): number {
  const stateCode = normalizeState(state);
  return stateCode ? (STATE_COMBINED_RATES[stateCode] || 0) : 0;
}

/**
 * Legacy function for backward compatibility
 */
export function getStateTaxRatePercent(state: string | null | undefined): number {
  return getStateTaxRate(state) * 100;
}
