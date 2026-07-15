// Home of the estimator "price cache" feature. For now it holds only the query
// normalizer; the persistent cache (read/write against a ProductPriceCache
// table) lands in the next, schema step — this file is where it will live.

/**
 * Canonicalize a material search query so equivalent phrasings collapse to one
 * cache key. Deliberately simple and predictable: lowercase → unify common
 * units (in/inch/", ft/foot/', the "x" between sizes) → strip junk punctuation →
 * collapse whitespace → sort the words (so word order doesn't matter).
 *
 * Sorting the tokens is what makes "1/2 in drywall 4x8" and
 * "drywall 1/2 inch 4x8" land in the same cell.
 *
 * Examples:
 *   normalizeSearchQuery('1/2 in drywall 4x8')   // → '1/2 4x8 drywall inch'
 *   normalizeSearchQuery('drywall 1/2 inch 4x8') // → '1/2 4x8 drywall inch'  (same key)
 *   normalizeSearchQuery('2" PVC pipe, 10ft')    // → '10 2 foot inch pipe pvc'
 */
export function normalizeSearchQuery(query: string): string {
  return query
    .toLowerCase()
    // Canonicalize units BEFORE stripping punctuation. A digit must sit just
    // before the unit so plain words like "install" / "interior" are untouched.
    .replace(/(\d)\s*(?:"|inches|inch|in\b)/g, "$1 inch")
    .replace(/(\d)\s*(?:'|feet|foot|ft\b)/g, "$1 foot")
    // Normalize the size separator: "4 x 8" / "4×8" → "4x8".
    .replace(/(\d)\s*[x×]\s*(\d)/g, "$1x$2")
    // Drop punctuation, but keep letters, digits, "/" (for fractions like 1/2),
    // and whitespace.
    .replace(/[^a-z0-9/\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}
