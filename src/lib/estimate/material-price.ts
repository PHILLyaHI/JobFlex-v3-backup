// The material price behind a computed line — one implementation, two callers.
//
// The Smart Proposal action already shops SerpAPI, but that function is private
// inside a "use server" file (every export there becomes a public server
// action), so it cannot be shared. This module is the shareable half: the same
// Google Shopping engine, the same ProductPriceCache, reached from the action
// and from the measurement harness alike, so what a run measures is what a
// customer gets.
//
// READ-THROUGH, unlike the estimator's own path, which only consults the cache
// when SerpAPI fails. Two reasons, and the second is the important one:
//   1. a computed line asks for the same handful of materials on every estimate;
//   2. determinism. A live listing that moves between two runs of the same
//      brief puts the run-to-run spread straight back, which is the entire
//      thing computed lines exist to remove.
import { readPriceCache, writePriceCache } from "@/lib/priceCache";
import type { MaterialQuote } from "./computed-lines";

interface ShoppingRow {
  title: string;
  price: number;
  link: string;
  thumbnail: string;
  source: string;
  productId: string | null;
}

/** Median of the listings, not the first: one $9 sample swatch at the top of
 *  the results should not become the price of a job's paint. */
function median(rows: { price: number }[]): number | null {
  const prices = rows
    .map((r) => r.price)
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  return prices.length ? prices[Math.floor(prices.length / 2)] : null;
}

async function searchShopping(query: string, location: string | null): Promise<ShoppingRow[]> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) return [];
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_shopping");
  url.searchParams.set("q", query);
  url.searchParams.set("gl", "us");
  url.searchParams.set("hl", "en");
  url.searchParams.set("api_key", apiKey);
  if (location?.trim()) url.searchParams.set("location", location.trim());

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) return [];
  const json = (await res.json()) as { shopping_results?: unknown };
  const rows = Array.isArray(json.shopping_results) ? json.shopping_results : [];
  return rows
    .slice(0, 3)
    .map((raw) => {
      const r = raw as Record<string, unknown>;
      // SerpAPI gives extracted_price as a number and price as "$123.45".
      const price =
        typeof r.extracted_price === "number"
          ? r.extracted_price
          : Number(String(r.price ?? "").replace(/[^0-9.]/g, ""));
      return {
        title: String(r.title ?? ""),
        price: Number.isFinite(price) ? price : 0,
        link: String(r.link ?? r.product_link ?? ""),
        thumbnail: String(r.thumbnail ?? ""),
        source: String(r.source ?? ""),
        productId: r.product_id ? String(r.product_id) : null,
      };
    })
    .filter((r) => r.price > 0);
}

/**
 * Price one material. Cache first, merchant second, nothing third.
 *
 * Never throws: a computed line whose material cannot be shopped falls to its
 * trade anchor, which is the documented and disclosed fallback. A returned
 * price is the LISTING's package price — it is the caller's sanity corridor,
 * not this function, that decides whether that number belongs on a per-unit
 * line.
 */
export async function priceMaterial(
  query: string,
  location: string | null | undefined,
): Promise<MaterialQuote | null> {
  try {
    const cached = await readPriceCache(query, location);
    if (cached?.length) {
      const price = median(cached);
      if (price) return { price, source: "cached", via: cached[0]?.source ?? "" };
    }
    const live = await searchShopping(query, location ?? null);
    if (live.length) {
      await writePriceCache(query, location, live, "serpapi");
      const price = median(live);
      if (price) return { price, source: "live", via: live[0]?.source ?? "" };
    }
  } catch {
    /* the anchor is the fallback; an estimate is never blocked on a search */
  }
  return null;
}
