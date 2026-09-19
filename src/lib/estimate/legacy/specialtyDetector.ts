/**
 * Specialty auto-detection from a free-form project description.
 *
 * The advanced-estimate route doesn't ask the user to pick a trade — it
 * accepts a description and infers everything via GPT. That worked when
 * the prompt was generic, but now that trade-aware prompt assembly exists
 * (specialty preamble + filtered PriceBook + curated material profile),
 * we need a way to pick the right specialty for descriptions like
 * "remodel my master bath" or "install vinyl plank in 1,200 sqft of basement".
 *
 * Approach: keyword scoring against the 229 specialties. We harvest tokens
 * from each specialty's id, name, and description, weight by token length
 * (longer tokens = rarer = more discriminative), and return the top match
 * when its score clears a confidence threshold. When nothing scores high
 * enough we return null and the caller falls back to the unfiltered path.
 *
 * Pure function, no external calls. Cheap enough to run on every request.
 */

import { AI_SPECIALTIES, type AiSpecialty } from './specialties';

/** Tokens this short or in this stop list never count as evidence. */
const MIN_TOKEN_LEN = 4;
const STOP_WORDS = new Set([
  'with', 'from', 'into', 'this', 'that', 'have', 'they', 'will', 'your',
  'their', 'what', 'when', 'where', 'about', 'after', 'over', 'than',
  'such', 'project', 'work', 'job', 'install', 'service', 'services',
  'contractor', 'company', 'need', 'want', 'looking', 'home', 'house',
  'help', 'please', 'thank', 'thanks',
]);

/** Tokens that unambiguously name a base trade. When one of these appears in
 *  the description, the named specialty gets a giant bonus that beats any
 *  hyper-specific sub-specialty competing on shared keywords. Keys must be
 *  lowercase; values must be valid specialty ids in `lib/ai/specialties.ts`. */
const PRIMARY_TRADE_TOKEN: Record<string, string> = {
  fence: 'fencing', fencing: 'fencing', fences: 'fencing',
  roof: 'roofing', roofing: 'roofing', shingle: 'roofing', shingles: 'roofing', asphalt: 'roofing',
  electrical: 'electrical', electrician: 'electrical', wiring: 'electrical', breaker: 'electrical', panel: 'electrical',
  plumbing: 'plumbing', plumber: 'plumbing',
  hvac: 'hvac', minisplit: 'hvac', condenser: 'hvac', furnace: 'hvac',
  epoxy: 'epoxy-flooring', polyaspartic: 'epoxy-flooring', polyurea: 'epoxy-flooring',
  kitchen: 'kitchen-remodel',
  bathroom: 'bathroom-remodel', bath: 'bathroom-remodel',
  concrete: 'concrete-contractor', slab: 'concrete-contractor',
  masonry: 'masonry', brickwork: 'masonry',
  painting: 'painting', paint: 'painting',
  drywall: 'drywall', sheetrock: 'drywall',
  siding: 'siding-installation',
  gutter: 'gutter-installation', gutters: 'gutter-installation',
  flooring: 'flooring-installation',
  tile: 'tile-stone', tiling: 'tile-stone',
  countertop: 'countertop-installer', countertops: 'countertop-installer',
  window: 'window-door', windows: 'window-door',
  demolition: 'demolition', demo: 'demolition',
  framing: 'framing-contractor', studs: 'framing-contractor',
  foundation: 'foundation-retaining',
  solar: 'solar', photovoltaic: 'solar',
  pool: 'pool-spa', spa: 'pool-spa',
  irrigation: 'irrigation-contractor',
  landscaping: 'landscaping', landscape: 'landscaping',
  pest: 'pest-control', termite: 'pest-control',
  snow: 'snow-removal', plow: 'snow-removal',
  restoration: 'restoration', mold: 'restoration', flood: 'restoration',
  deck: 'decking', decking: 'decking',
  insulation: 'insulation-weatherization', weatherization: 'insulation-weatherization',
};

/**
 * Phrase votes (2026-09-18): briefs whose single words mislead the token pass.
 * "Tub to shower conversion" scored as a garage conversion; "finish the
 * basement with a bathroom" as a bathroom remodel; "replace toilet", "install
 * a dishwasher" and "vent the range hood" matched nothing. A phrase vote lands
 * even on a specialty with no keyword overlap. Repairs are left to the
 * keyword pass (appliance repair, plumbing).
 */
const REPAIR_WORDS = /\b(?:repair|fix|broken|not\s+working|won'?t|doesn'?t|leak\w*|clog\w*|running|noisy|stuck)\b/i;
const PHRASE_VOTES: Array<{ re: RegExp; id: string; bonus: number; unlessRepair?: boolean }> = [
  { re: /\btub[\s-]*to[\s-]*shower|\bshower\s+conversion|\bconvert\w*\s+(?:the\s+|a\s+|my\s+)?(?:bath)?tub\b|\bwalk[-\s]in\s+shower/i, id: 'bathroom-remodel', bonus: 150 },
  { re: /\b(?:replace|replacing|install|installing|new|swap|add|adding|set)\b[^.]{0,30}\b(?:toilets?|vanit(?:y|ies)|(?:bath)?tubs?|lavator(?:y|ies)|bathroom\s+sink|bath\s+fan)\b/i, id: 'bathroom-remodel', bonus: 150, unlessRepair: true },
  { re: /\b(?:replace|replacing|install|installing|new|swap|add|adding|vent|move|moving)\b[^.]{0,30}\b(?:dish\s?washer|(?:garbage\s+)?disposal|range\s+hood|hood|cook\s?top|wall\s+oven|(?:gas|electric|induction)\s+range|range|over[-\s]the[-\s]range\s+microwave|microwave|ice\s?maker|kitchen\s+sink|kitchen\s+faucet)\b/i, id: 'kitchen-remodel', bonus: 150, unlessRepair: true },
  { re: /\bfinish\w*\s+(?:the\s+|my\s+|a\s+|an\s+|our\s+)?(?:\d[\d,]*\s*(?:sq\.?\s*ft|sqft|sf)\s+)?basement|\bbasement\s+(?:finish\w*|remodel\w*|renovation|build[-\s]?out)/i, id: 'interior-remodel', bonus: 220 },
  { re: /\breplac\w*\s+(?:\w+\s+){0,3}windows?\b|\bwindow\s+replacement/i, id: 'window-replacement', bonus: 200 },
  { re: /\b(?:sewer|drain|main\s+line|toilet|sink|tub)\b[^.]{0,30}\b(?:backed\s+up|backing\s+up|clog\w*|slow|roots?|jet\w*|snak\w*)\b|\b(?:backed\s+up|clog\w*|snake|hydro[-\s]?jet\w*|roots?)\b[^.]{0,30}\b(?:sewer|drain|main\s+line)\b/i, id: 'drain-cleaning', bonus: 150 },
  { re: /\bpocket\s+doors?\b/i, id: 'interior-remodel', bonus: 150 },
  { re: /\b(?:front|entry|exterior|patio|sliding|french|back|storm)\s+doors?\b/i, id: 'window-door', bonus: 150 },
  { re: /\binterior\s+doors?\b|\bprehung\s+doors?\b|\bpre-hung\s+doors?\b|\bbarn\s+doors?\b|\bbifold\s+doors?\b|\bcloset\s+doors?\b/i, id: 'finish-carpentry', bonus: 150 },
  { re: /\bre-?til\w*|\btil(?:e|ing)\s+(?:the\s+|a\s+|my\s+)?(?:shower|tub|bath\w*|floor|backsplash|wall)/i, id: 'tile-stone', bonus: 150 },
  { re: /\b(?:lawn|yard|garden|landscape|irrigation|drip)\b[^.]{0,25}\bsprinklers?\b|\bsprinklers?\b[^.]{0,25}\b(?:lawn|yard|garden|zones?|heads?|timer|controller)\b/i, id: 'irrigation-contractor', bonus: 150 },
];

/** Tokens we hand-tune up because they're highly discriminative trade signals. */
const HIGH_VALUE_TOKENS = new Set([
  'roofing', 'roof', 'shingle', 'shingles', 'asphalt',
  'plumbing', 'plumber', 'pipe', 'pipes', 'drain', 'drains', 'toilet', 'sink', 'faucet',
  'electrical', 'electric', 'electrician', 'wiring', 'panel', 'breaker', 'outlet',
  'hvac', 'furnace', 'mini-split', 'minisplit', 'condenser', 'thermostat',
  'epoxy', 'polyaspartic', 'polyurea',
  'kitchen', 'bathroom', 'bath',
  'cabinet', 'cabinets', 'countertop', 'countertops', 'granite', 'quartz', 'marble',
  'drywall', 'sheetrock',
  'paint', 'painting', 'painter', 'primer',
  'concrete', 'slab', 'foundation', 'footing',
  'masonry', 'brick', 'block', 'stone',
  'fencing', 'fence', 'fences',
  'siding', 'fascia', 'soffit',
  'gutter', 'gutters', 'downspout',
  'flooring', 'tile', 'hardwood', 'laminate', 'carpet', 'vinyl',
  'window', 'windows', 'door', 'doors',
  'demolition', 'demo',
  'framing', 'studs', 'rafter', 'truss',
  'insulation', 'weatherization',
  'pool', 'spa',
  'solar', 'photovoltaic',
  'landscape', 'landscaping', 'irrigation', 'sprinkler', 'sod',
  'deck', 'decking',
  'pest', 'termite', 'rodent',
  'snow', 'plow',
  'restoration', 'mold', 'flood',
]);

interface PreparedSpecialty {
  spec: AiSpecialty;
  /** Token map: token → weight (length-squared, so a 9-char token outweighs three 3-char tokens). */
  tokens: Map<string, number>;
}

let prepared: PreparedSpecialty[] | null = null;

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= MIN_TOKEN_LEN && !STOP_WORDS.has(t));
}

function prepareSpecialties(): PreparedSpecialty[] {
  if (prepared) return prepared;
  prepared = AI_SPECIALTIES.map(spec => {
    const tokens = new Map<string, number>();
    // Harvest from id, name, description (preamble has too many generic
    // verbs to be a clean signal — we skip it).
    const sources = [spec.id.replace(/-/g, ' '), spec.name, spec.description];
    for (const src of sources) {
      for (const tok of tokenize(src)) {
        const baseWeight = HIGH_VALUE_TOKENS.has(tok) ? tok.length * 3 : tok.length;
        // Earlier sources weight slightly higher (id > name > description).
        tokens.set(tok, (tokens.get(tok) ?? 0) + baseWeight);
      }
    }
    return { spec, tokens };
  });
  return prepared;
}

export interface DetectionResult {
  specialty: AiSpecialty;
  /** Total scoring weight from matching tokens (higher = more confident). */
  score: number;
  /** The 1–5 highest-scoring tokens that drove the match — useful for telemetry. */
  matches: string[];
  /** Top three runners-up so the caller can log ambiguity if it wants. */
  alternates: { specialtyId: string; score: number }[];
}

/** Minimum score required for a match. Calibrated so generic descriptions
 *  ("just need an estimate") return null rather than picking the trade with
 *  the most boilerplate-overlap. */
const MIN_CONFIDENCE_SCORE = 12;

/** Detect the most likely specialty for a project description. Returns null
 *  when no specialty scores above the confidence threshold. */
export function detectSpecialty(description: string): DetectionResult | null {
  if (!description || description.length < 5) return null;
  const descTokens = tokenize(description);
  if (descTokens.length === 0) return null;

  const list = prepareSpecialties();
  // Description, normalized for substring matching.
  const descLower = description.toLowerCase();
  const tokenSet = new Set(descTokens);

  // Pre-pass: collect primary-trade vote bonuses. When a description token
  // unambiguously names a trade, the corresponding specialty gets a fixed
  // 100-point bump. This is large enough to dominate keyword-overlap noise
  // from unrelated sub-specialties but small enough that multiple primary
  // votes (e.g. "kitchen" + "electrical") still let the better-matched one win.
  const primaryVotes = new Map<string, number>();
  for (const tok of tokenSet) {
    const targetId = PRIMARY_TRADE_TOKEN[tok];
    if (targetId) {
      primaryVotes.set(targetId, (primaryVotes.get(targetId) ?? 0) + 100);
    }
  }
  // Also catch hyphenated tokens like 'mini-split' that the tokenizer split.
  if (/mini[-\s]?split/i.test(description)) {
    primaryVotes.set('hvac', (primaryVotes.get('hvac') ?? 0) + 100);
  }
  const phraseVoted = new Set<string>();
  const repair = REPAIR_WORDS.test(description);
  for (const v of PHRASE_VOTES) {
    if (v.unlessRepair && repair) continue;
    if (!v.re.test(description)) continue;
    primaryVotes.set(v.id, (primaryVotes.get(v.id) ?? 0) + v.bonus);
    phraseVoted.add(v.id);
  }

  // Score each specialty against the description tokens.
  const scores: Array<{ p: PreparedSpecialty; score: number; matches: Map<string, number> }> = [];
  for (const p of list) {
    let score = 0;
    const matches = new Map<string, number>();
    for (const tok of descTokens) {
      const w = p.tokens.get(tok);
      if (!w) continue;
      score += w;
      matches.set(tok, (matches.get(tok) ?? 0) + w);
    }
    if (score === 0 && !phraseVoted.has(p.spec.id)) continue;

    // Base-trade bias: if the specialty id (with hyphens → spaces) is a
    // verbatim substring of the description OR matches a single description
    // token exactly, give it a big bonus. This breaks ties in favor of
    // generic trades ('fencing', 'hvac', 'electrical') over hyper-specific
    // sub-specialties ('residential-fence-repair', 'pump-station') when the
    // user's wording is generic.
    const idAsPhrase = p.spec.id.replace(/-/g, ' ');
    if (descLower.includes(idAsPhrase)) {
      score += idAsPhrase.length * 4;
    } else if (tokenSet.has(p.spec.id)) {
      score += p.spec.id.length * 4;
    }
    // Sub-specialty penalty: ids with 3+ hyphenated parts (e.g.
    // "residential-fence-repair") are usually granular sub-trades. Apply a
    // mild ~15% haircut so they only win when the description specifically
    // names them.
    const partCount = p.spec.id.split('-').length;
    if (partCount >= 3) score *= 0.85;

    // Primary-trade bonus from the pre-pass.
    const bonus = primaryVotes.get(p.spec.id);
    if (bonus) score += bonus;

    scores.push({ p, score, matches });
  }
  if (scores.length === 0) return null;

  scores.sort((a, b) => b.score - a.score);
  const top = scores[0];
  if (top.score < MIN_CONFIDENCE_SCORE) return null;

  const sortedMatches = Array.from(top.matches.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tok]) => tok);

  return {
    specialty: top.p.spec,
    score: top.score,
    matches: sortedMatches,
    alternates: scores.slice(1, 4).map(s => ({ specialtyId: s.p.spec.id, score: s.score })),
  };
}

/** Test-only — reset the prepared cache so unit tests can swap fixtures. */
export function __resetPreparedCache() {
  prepared = null;
}
