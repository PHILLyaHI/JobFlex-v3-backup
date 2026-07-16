// Home of the estimator "price cache" feature: the query normalizer plus the
// read/write helpers against the ProductPriceCache table.
import { db } from "@/lib/db";

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

// The product shape we persist. Structurally identical to the estimator's
// ProductSearchResult, kept local so this module stays dependency-light.
export interface CachedProduct {
  title: string;
  price: number;
  link: string;
  thumbnail: string;
  source: string;
  productId: string | null;
}

// Canonical location component of the cache key. Lowercased + trimmed so minor
// casing/whitespace differences still hit the same cell; null = no location
// (national). Read and write MUST use the same key, so both go through here.
function locationKey(location: string | null | undefined): string | null {
  return location?.trim().toLowerCase() || null;
}

/**
 * Read cached products for a query+location. Returns null on a miss OR any error
 * (parse/db) — a cache problem must never break estimate generation.
 */
export async function readPriceCache(
  query: string,
  location: string | null | undefined,
): Promise<CachedProduct[] | null> {
  try {
    const row = await db.productPriceCache.findFirst({
      where: { normalizedQuery: normalizeSearchQuery(query), location: locationKey(location) },
    });
    if (!row) return null;
    const parsed = JSON.parse(row.productsJson);
    return Array.isArray(parsed) ? (parsed as CachedProduct[]) : null;
  } catch {
    return null;
  }
}

/**
 * Save products for a query+location. Best-effort — never throws, so a cache
 * write failure can't break the estimate. Uses find-then-update/create (not
 * upsert) because SQL treats a NULL location as distinct in the unique key, so a
 * plain upsert on null could pile up duplicate rows; this reuses the existing row.
 */
export async function writePriceCache(
  query: string,
  location: string | null | undefined,
  products: CachedProduct[],
  source?: string | null,
): Promise<void> {
  try {
    const normalizedQuery = normalizeSearchQuery(query);
    const loc = locationKey(location);
    const productsJson = JSON.stringify(products);
    const existing = await db.productPriceCache.findFirst({
      where: { normalizedQuery, location: loc },
      select: { id: true },
    });
    if (existing) {
      await db.productPriceCache.update({
        where: { id: existing.id },
        data: { productsJson, source: source ?? null },
      });
    } else {
      await db.productPriceCache.create({
        data: { normalizedQuery, location: loc, productsJson, source: source ?? null },
      });
    }
  } catch (err) {
    console.warn("[priceCache] write failed (non-fatal):", err);
  }
}
