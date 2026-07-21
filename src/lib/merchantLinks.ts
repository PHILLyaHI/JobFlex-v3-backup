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

// Real product-page path shapes per retailer domain. Estimates created before
// the index-based matcher let the AI transcribe product URLs, and LLMs
// fabricate plausible retailer links (e.g. homedepot.com/productImage/100000000
// — not a real page shape). A stored URL on one of these domains is only
// trusted when its path matches the retailer's actual product-page shape;
// anything else is a guaranteed 404 and falls back to on-site search. Domains
// not listed keep the trust-as-is behavior.
const PRODUCT_PAGE_SHAPE: { host: RegExp; path: RegExp }[] = [
  { host: /(^|\.)homedepot\.com$/i, path: /^\/p\// },
  { host: /(^|\.)lowes\.com$/i, path: /^\/pd\// },
  { host: /(^|\.)amazon\.com$/i, path: /\/(dp|gp)\// },
  { host: /(^|\.)walmart\.com$/i, path: /^\/ip\// },
  { host: /(^|\.)target\.com$/i, path: /^\/p\// },
  { host: /(^|\.)wayfair\.com$/i, path: /\/pdp\// },
];

// Storefront hosts are never legitimate IMAGE sources in estimator data — real
// thumbnails come from gstatic / serpapi / placehold.co / retailer CDNs (e.g.
// images.thdstatic.com, mobileimages.lowes.com, m.media-amazon.com). An image
// URL sitting directly on a retailer's storefront host is an AI-fabricated
// link that is guaranteed to 404. Exact-host match (after stripping www.) so
// real CDN subdomains stay allowed.
const STOREFRONT_HOSTS = new Set([
  "homedepot.com",
  "lowes.com",
  "menards.com",
  "acehardware.com",
  "amazon.com",
  "walmart.com",
  "target.com",
  "costco.com",
  "wayfair.com",
]);

function isHttp(url: string): boolean {
  try {
    const p = new URL(url).protocol;
    return p === "http:" || p === "https:";
  } catch {
    return false;
  }
}

// True when the URL claims a known retailer's domain but is NOT shaped like
// that retailer's real product pages — the signature of an AI-fabricated link.
function isFabricatedRetailerLink(url: string): boolean {
  try {
    const u = new URL(url);
    const shape = PRODUCT_PAGE_SHAPE.find((s) => s.host.test(u.hostname));
    return shape ? !shape.path.test(u.pathname) : false;
  } catch {
    return false;
  }
}

function hostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * An imageUrl worth rendering, or null. Filters non-http(s) schemes and
 * fabricated storefront-host "images" so the thumb shows its fallback icon
 * instead of firing a request that is guaranteed to 404.
 */
export function usableImageUrl(url: string | null | undefined): string | null {
  if (!url || !isHttp(url)) return null;
  const host = hostname(url)?.toLowerCase().replace(/^www\./, "");
  return host && STOREFRONT_HOSTS.has(host) ? null : url;
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
 *   1. A real merchant link (http(s), not Google, not a fabricated retailer
 *      URL) → trust it as-is.
 *   2. A known store → its own on-site product search for this item. When the
 *      store name is missing but the (rejected) link names a known retailer,
 *      search on the retailer the URL itself claims.
 *   3. Unknown store: keep the existing http(s) link (even Google) rather than
 *      drop the button entirely — but never a fabricated retailer link, which
 *      is a guaranteed 404; null when there's nothing usable.
 */
export function merchantUrl(
  store: string | null | undefined,
  query: string,
  productUrl: string | null | undefined,
): string | null {
  const link = productUrl && isHttp(productUrl) ? productUrl : null;
  const fabricated = link ? isFabricatedRetailerLink(link) : false;
  if (link && !fabricated && !isGoogleLink(link)) return link;
  const search =
    storeSearchUrl(store, query) ??
    (link && fabricated ? storeSearchUrl(hostname(link), query) : null);
  if (search) return search;
  return link && !fabricated ? link : null;
}
