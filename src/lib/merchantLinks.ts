// Direct-merchant link resolution for shoppable material line items.
//
// The AI estimator stores a `productUrl` per material. In the happy path that
// is the retailer's own product page, but it frequently ends up being a Google
// Shopping interstitial (google.com/shopping/product/…) — the live "Step 4"
// upgrade in advancedEstimator is best-effort and misses often, and any
// proposal created before that step existed permanently stored a Google link.
//
// `merchantUrl()` runs at RENDER time so it fixes both new and legacy data with
// no database migration: a real merchant link is trusted as-is, a Google link
// (or a missing one) is replaced with a direct on-site product search on the
// named store. Result is always a safe http(s) URL or null.

type SearchBuilder = (query: string) => string;

// Known retailers → their own on-site product-search URL. Matched loosely
// against the stored store name (case-insensitive substring/alias) so
// "The Home Depot", "Home Depot", and "homedepot.com" all resolve.
const STORE_SEARCH: { match: RegExp; build: SearchBuilder }[] = [
  { match: /home\s*depot/, build: (q) => `https://www.homedepot.com/s/${encodeURIComponent(q)}` },
  { match: /lowe'?s?\b|lowes/, build: (q) => `https://www.lowes.com/search?searchTerm=${encodeURIComponent(q)}` },
  { match: /menard/, build: (q) => `https://www.menards.com/main/search.html?search=${encodeURIComponent(q)}` },
  { match: /ace\s*hardware|\bace\b/, build: (q) => `https://www.acehardware.com/search?query=${encodeURIComponent(q)}` },
  { match: /amazon/, build: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}` },
  { match: /walmart/, build: (q) => `https://www.walmart.com/search?q=${encodeURIComponent(q)}` },
  { match: /\btarget\b/, build: (q) => `https://www.target.com/s?searchTerm=${encodeURIComponent(q)}` },
  { match: /costco/, build: (q) => `https://www.costco.com/CatalogSearch?keyword=${encodeURIComponent(q)}` },
  { match: /ferguson/, build: (q) => `https://www.ferguson.com/search/${encodeURIComponent(q)}` },
  { match: /build\.com/, build: (q) => `https://www.build.com/search?term=${encodeURIComponent(q)}` },
  { match: /wayfair/, build: (q) => `https://www.wayfair.com/keyword.php?keyword=${encodeURIComponent(q)}` },
  { match: /floor\s*&?\s*decor/, build: (q) => `https://www.flooranddecor.com/search?q=${encodeURIComponent(q)}` },
  { match: /harbor\s*freight/, build: (q) => `https://www.harborfreight.com/search?q=${encodeURIComponent(q)}` },
  { match: /tractor\s*supply/, build: (q) => `https://www.tractorsupply.com/tsc/search/products?searchTerm=${encodeURIComponent(q)}` },
  { match: /northern\s*tool/, build: (q) => `https://www.northerntool.com/search/${encodeURIComponent(q)}` },
  { match: /grainger/, build: (q) => `https://www.grainger.com/search?searchQuery=${encodeURIComponent(q)}` },
  { match: /sherwin/, build: (q) => `https://www.sherwin-williams.com/en-us/search?q=${encodeURIComponent(q)}` },
  { match: /supply\s*house/, build: (q) => `https://www.supplyhouse.com/search?q=${encodeURIComponent(q)}` },
];

function isHttp(url: string): boolean {
  try {
    const p = new URL(url).protocol;
    return p === "http:" || p === "https:";
  } catch {
    return false;
  }
}

// True for any google.com host (incl. google.com/shopping product pages and
// google.com/url?q= redirect wrappers) — the destinations we want to avoid.
function isGoogleLink(url: string): boolean {
  try {
    return /(^|\.)google\.[a-z.]+$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Build a direct on-site product search URL for a known retailer, or null when
 * the store name doesn't map to one we know.
 */
export function storeSearchUrl(store: string | null | undefined, query: string): string | null {
  if (!store) return null;
  const key = store.toLowerCase();
  const hit = STORE_SEARCH.find((s) => s.match.test(key));
  return hit ? hit.build(query.trim() || store) : null;
}

/**
 * Resolve the best "Buy" destination for a material line:
 *   1. A real merchant link (http(s), not Google) → trust it as-is.
 *   2. A known store → its own on-site product search for this item.
 *   3. Unknown store: keep the existing http(s) link (even Google) rather than
 *      drop the button entirely; null only when there's nothing usable.
 */
export function merchantUrl(
  store: string | null | undefined,
  query: string,
  productUrl: string | null | undefined,
): string | null {
  if (productUrl && isHttp(productUrl) && !isGoogleLink(productUrl)) return productUrl;
  const search = storeSearchUrl(store, query);
  if (search) return search;
  return productUrl && isHttp(productUrl) ? productUrl : null;
}
