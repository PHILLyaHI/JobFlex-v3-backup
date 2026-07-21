"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireEstimatorOrManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { getOpenAI, isOpenAIEnabled, OPENAI_MODEL } from "@/lib/sdk/openai";
import { ProposalStatus } from "@/lib/prismaEnums";
import { checkPlanLimit, enforcePlanLimit } from "@/lib/limitsEngine";
import { PLAN_LIMIT_MESSAGE, type LimitKey } from "@/lib/planLimits";
import { readPriceCache, writePriceCache } from "@/lib/priceCache";
import { sellUnitPrice, resolveMarkupRates } from "@/lib/pricing/markup";
import { stateFromAddress, stateTaxRate } from "@/lib/pricing/salesTax";
import {
  estimateSchema,
  lineSchema,
  promptAnalysisSchema,
  type GeneratedEstimate,
  type PromptAnalysis,
} from "@/lib/estimatorSchema";

/**
 * Quota gate for the AI *run* functions. Returned (not thrown) because these
 * actions signal errors via { ok: false } unions and thrown messages are
 * redacted in prod. Runs are capped by the same "estimatorUses" budget that
 * saveEstimate consumes (usage = saved AiEstimate rows).
 */
async function estimatorRunBlocked(
  organizationId: string,
): Promise<{ ok: false; error: string; code: "PLAN_LIMIT_REACHED"; resource: LimitKey } | null> {
  const quota = await checkPlanLimit(organizationId, "estimatorUses");
  if (quota.allowed) return null;
  return {
    ok: false,
    error: PLAN_LIMIT_MESSAGE,
    code: "PLAN_LIMIT_REACHED",
    // estimatorUses is capped by proposalsCreated (every estimate → a proposal),
    // so report whichever actually ran out.
    resource: quota.cappedBy ?? "estimatorUses",
  };
}

const STUB: GeneratedEstimate = {
  title: "Sample Roof Replacement Estimate · AI Disabled",
  scope:
    "Full tear-off, synthetic underlayment, 30-year architectural shingles, new ridge vents, ice & water shield at valleys and eaves, drip edge, pipe collars. Full cleanup and magnetic sweep.",
  assumptions: [
    "No decking replacement needed beyond 2 sheets",
    "Existing chimney flashing to be reused",
    "One-layer tear-off; dumpster on driveway",
    "Pricing placeholders — add OPENAI_API_KEY for real generation",
  ],
  materials: [
    { name: "Architectural shingles (30-yr)", quantity: 24, unitPrice: 115, unit: "square" },
    { name: "Synthetic underlayment", quantity: 24, unitPrice: 32, unit: "square" },
    { name: "Ice & water shield", quantity: 400, unitPrice: 1.1, unit: "sqft" },
    { name: "Ridge vent system", quantity: 60, unitPrice: 6, unit: "ln ft" },
    { name: "Drip edge + flashing", quantity: 1, unitPrice: 480, unit: "lot" },
  ],
  labor: [
    { name: "Tear-off + disposal", quantity: 2400, unitPrice: 0.8, unit: "sqft" },
    { name: "Installation labor", quantity: 2400, unitPrice: 1.8, unit: "sqft" },
    { name: "Cleanup + magnetic sweep", quantity: 1, unitPrice: 380, unit: "lot" },
  ],
  estimatedTimelineDays: 3,
};

interface GenerateInput {
  projectType: string;
  description: string;
  location?: string;
  sqft?: number;
  qualityTier?: "budget" | "standard" | "luxury";
  /** User-edited assumptions fed back in via "Regenerate with AI" — treated as constraints. */
  assumptions?: string[];
}

// ── Live retail product search (SerpAPI · Google Shopping) ──────────────────
interface ProductSearchResult {
  title: string;
  price: number;
  link: string;
  thumbnail: string;
  source: string;
  // Google product id for this listing, when present. Legacy path to a DIRECT
  // merchant link (google_product → online_sellers → direct_link); Google has
  // mostly retired the /shopping/product/{id} pages this engine rides on.
  productId: string | null;
  // Modern path to the same thing: google_immersive_product → stores[].link is
  // the merchant's real product page. Preferred over productId when present.
  // Optional-null so pre-token rows in the price cache stay readable.
  pageToken?: string | null;
}

// Deterministic, realistic-looking products for dev/offline mode so the
// estimator never crashes when SERPAPI_API_KEY is absent or the request fails.
// Price is derived from the query so the same search is stable across calls.
function mockProductResults(query: string): ProductSearchResult[] {
  const stores = ["Home Depot", "Lowe's", "Amazon"];
  const grades = ["Value", "Pro", "Premium"];
  const seed = Array.from(query).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const slug = encodeURIComponent(query.trim().replace(/\s+/g, "-").toLowerCase());
  return stores.map((store, i) => {
    const dollars = 6 + ((seed * (i + 3)) % 240); // ~$6–$246
    const cents = ((seed + i * 17) % 100) / 100;
    const price = Math.round((dollars + cents) * 100) / 100;
    return {
      title: `${query} (${grades[i]} grade)`,
      price,
      link: `https://www.${store.toLowerCase().replace(/[^a-z]/g, "")}.com/s/${slug}`,
      thumbnail: `https://placehold.co/120x120?text=${slug}`,
      source: store,
      // Mock links already point at the store's own search (not Google), so
      // there is nothing to resolve offline.
      productId: null,
      pageToken: null,
    };
  });
}

// Fallback used whenever SerpAPI can't return live prices. Order: the
// persistent cache first — it survives an outage and its products are returned
// SILENTLY, no markers. On a true cache miss: mock products ONLY when the API
// key isn't configured at all (dev demo mode, `allowMock`) — a transient
// failure WITH a key configured returns [] instead, because mock links are
// store-search URLs and placehold.co thumbnails that would be silently stored
// on a real estimate as broken "products". [] just means that line prices from
// the model's knowledge and carries no link — honest degradation. Mock data
// additionally never leaves NODE_ENV === "development".
async function pricesFallback(
  query: string,
  location: string | null | undefined,
  allowMock = false,
): Promise<ProductSearchResult[]> {
  const cached = await readPriceCache(query, location);
  if (cached && cached.length > 0) return cached;
  return allowMock && process.env.NODE_ENV === "development" ? mockProductResults(query) : [];
}

// SerpAPI burst-throttles (429) when a whole bill of materials fans out at
// once. Transient statuses (429 / 5xx) get two short backoff retries before
// the caller degrades; deterministic 4xx (e.g. unresolvable location) returns
// immediately so the caller's own handling runs.
async function serpFetch(url: string): Promise<Response> {
  let res = await fetch(url);
  for (const delay of [400, 1200]) {
    if (res.ok || (res.status !== 429 && res.status < 500)) return res;
    await new Promise((r) => setTimeout(r, delay));
    res = await fetch(url);
  }
  return res;
}

// Promise.all with a concurrency cap — the whole-bill fan-out (10+ searches,
// then per-listing direct-link lookups) is what tripped SerpAPI's per-second
// throttle in the first place. Order-preserving.
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (let i = next++; i < items.length; i = next++) {
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}
const SERP_CONCURRENCY = 4;

/**
 * Search live retail prices for a single material via SerpAPI's Google Shopping
 * engine. Returns the top 3 results mapped to {title, price, link, thumbnail,
 * source}. When `location` is given (normalized "City, ST" from the intake
 * gate) prices are localized to that market; a location SerpAPI can't resolve
 * gets one retry without it (national prices). Transient failures (429/5xx)
 * are retried with backoff by serpFetch, then degrade to the price cache or
 * empty — deterministic mock products appear ONLY when no API key is
 * configured (offline dev demo), never on a failure with a real key.
 */
async function searchProductPrices(
  query: string,
  location?: string | null
): Promise<ProductSearchResult[]> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    console.info(`[advancedEstimator] SERPAPI_API_KEY missing — price fallback (cache, then dev mock) for "${query}"`);
    // No key configured at all → the only branch where dev-mock products are OK.
    return pricesFallback(query, location, true);
  }
  const loc = location?.trim() || null;
  try {
    const base = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(
      query
    )}&gl=us&hl=en&api_key=${apiKey}`;
    let localized = Boolean(loc);
    let res = await serpFetch(loc ? `${base}&location=${encodeURIComponent(loc)}` : base);
    if (!res.ok && localized) {
      // Unresolvable location (SerpAPI 400s on strings outside its locations
      // DB) — retry national rather than lose live prices entirely.
      console.warn(
        `[advancedEstimator] SerpAPI ${res.status} for "${query}" localized to "${loc}" — retrying national`
      );
      localized = false;
      res = await serpFetch(base);
    }
    if (!res.ok) {
      // Still failing after backoff retries (e.g. hard plan limit). Degrade to
      // cache-or-empty — NEVER mock, so fake links can't reach a real estimate.
      console.warn(
        `[advancedEstimator] SerpAPI ${res.status} for "${query}" — price fallback (cache, else none)`
      );
      return pricesFallback(query, location);
    }
    const json: any = await res.json();
    const shopping: any[] = Array.isArray(json?.shopping_results) ? json.shopping_results : [];
    const mapped: ProductSearchResult[] = shopping.slice(0, 3).map((r) => ({
      title: String(r?.title ?? query),
      // SerpAPI exposes `extracted_price` (number) plus a formatted `price`
      // string (e.g. "$24.99"). Always normalize to a number so a string can
      // never flow into the matcher's numeric `unitPrice` and break the parse.
      price:
        typeof r?.extracted_price === "number"
          ? r.extracted_price
          : Number(String(r?.price ?? "").replace(/[^0-9.]/g, "")) || 0,
      link: String(r?.product_link ?? r?.link ?? ""),
      thumbnail: String(r?.thumbnail ?? ""),
      source: String(r?.source ?? "Google Shopping"),
      productId: extractProductId(r),
      pageToken: String(r?.immersive_product_page_token ?? "") || null,
    }));
    if (mapped.length === 0) {
      console.warn(`[advancedEstimator] SerpAPI returned 0 products for "${query}" — price fallback (cache, else none)`);
      return pricesFallback(query, location);
    }
    console.info(
      `[advancedEstimator] SerpAPI returned ${mapped.length} products for "${query}" (${localized ? `localized to "${loc}"` : "national"})`
    );
    // Cache the live prices (keyed by normalized query + requested location) so a
    // later SerpAPI outage can still serve them. Best-effort — writePriceCache
    // swallows its own errors, so this never breaks estimate generation.
    await writePriceCache(query, location, mapped, "serpapi");
    return mapped;
  } catch (err: any) {
    console.warn(
      `[advancedEstimator] SerpAPI request failed for "${query}": ${err?.message ?? err} — price fallback (cache, else none)`
    );
    return pricesFallback(query, location);
  }
}

// ── Direct-merchant-link resolution (SerpAPI · Google Product) ───────────────
// Google Shopping returns a Google *product page* (product_link), not the
// store's own page. To send buyers straight to e.g. Home Depot, we take the
// chosen listing's product_id, ask the Google Product engine for that product's
// online sellers, and use the matching seller's `direct_link`.

// Pull the numeric Google product id from a shopping result — it may be a
// top-level field, embedded in a legacy URL (.../shopping/product/{id}), or
// packed into the modern ?ibp=oshop link's prds param (cid:{id} / pid:{id}).
function extractProductId(r: any): string | null {
  const direct = r?.product_id ?? r?.productId;
  if (direct != null && String(direct).trim()) return String(direct).trim();
  const haystack = `${r?.product_link ?? ""} ${r?.serpapi_product_api ?? ""} ${r?.link ?? ""}`;
  const m =
    haystack.match(/\/shopping\/product\/(\d+)/) ??
    haystack.match(/[?&,=](?:catalogid|gpcid|cid|pid):(\d+)/);
  return m ? m[1] : null;
}

// SerpAPI seller links are often Google redirects (google.com/url?q=<merchant>).
// Unwrap to the embedded merchant URL when present.
function unwrapGoogleRedirect(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith("google.com") && u.pathname === "/url") {
      const q = u.searchParams.get("q") || u.searchParams.get("url");
      if (q) return q;
    }
  } catch {
    /* not a URL — fall through */
  }
  return url;
}

// Only ever return http(s) — never let a javascript:/data: scheme from the
// SerpAPI payload reach the stored productUrl (mirrors the read-side guard in
// MaterialPurchasingList).
function safeHttp(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const p = new URL(url);
    return p.protocol === "http:" || p.protocol === "https:" ? p.href : null;
  } catch {
    return null;
  }
}

// Loose store-name key so "The Home Depot" ~ "Home Depot" ~ "homedepot".
function normStore(s: string): string {
  return s.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();
}

interface OnlineSeller {
  name?: string;
  link?: string;
  direct_link?: string;
}

// Fetch the online sellers for a product id. Returns [] on any failure so
// resolution degrades to the existing link rather than throwing.
async function fetchOnlineSellers(productId: string, apiKey: string): Promise<OnlineSeller[]> {
  const url = `https://serpapi.com/search.json?engine=google_product&product_id=${encodeURIComponent(
    productId
  )}&gl=us&hl=en&api_key=${apiKey}`;
  const res = await serpFetch(url);
  if (!res.ok) {
    console.warn(`[advancedEstimator] google_product ${res.status} for product ${productId}`);
    return [];
  }
  const json: any = await res.json();
  const sellers = json?.sellers_results?.online_sellers;
  return Array.isArray(sellers) ? sellers : [];
}

// Modern replacement for the sellers lookup: the Immersive Product API's
// stores[] each carry the merchant's REAL product-page link. more_stores lifts
// the list from 3-5 to up to 13, so the chosen store is usually present.
// Returns [] on any failure — resolution degrades, never throws.
async function fetchImmersiveStores(pageToken: string, apiKey: string): Promise<OnlineSeller[]> {
  const url = `https://serpapi.com/search.json?engine=google_immersive_product&page_token=${encodeURIComponent(
    pageToken
  )}&more_stores=true&api_key=${apiKey}`;
  const res = await serpFetch(url);
  if (!res.ok) {
    console.warn(`[advancedEstimator] google_immersive_product ${res.status}`);
    return [];
  }
  const json: any = await res.json();
  const stores = json?.product_results?.stores;
  // {name, link} rows — the OnlineSeller shape pickSellerDirectLink matches on.
  return Array.isArray(stores) ? stores : [];
}

// Resolve the chosen store's direct product page for a picked option:
// immersive stores first (modern), google_product sellers as legacy fallback.
// `cache` de-dupes API calls across materials sharing a listing; null = miss.
async function directLinkFor(
  opt: ProductSearchResult,
  store: string | null | undefined,
  apiKey: string,
  cache: Map<string, Promise<OnlineSeller[]>>,
): Promise<string | null> {
  if (opt.pageToken) {
    const key = `imm:${opt.pageToken}`;
    let pending = cache.get(key);
    if (!pending) {
      pending = fetchImmersiveStores(opt.pageToken, apiKey);
      cache.set(key, pending);
    }
    const direct = pickSellerDirectLink(await pending, store);
    if (direct) return direct;
  }
  if (opt.productId) {
    const key = `pid:${opt.productId}`;
    let pending = cache.get(key);
    if (!pending) {
      pending = fetchOnlineSellers(opt.productId, apiKey);
      cache.set(key, pending);
    }
    const direct = pickSellerDirectLink(await pending, store);
    if (direct) return direct;
  }
  return null;
}

// Return the chosen store's DIRECT product URL from the sellers list. Only
// upgrades when the SAME store is found, so we never relabel "Buy at Home Depot"
// with a different merchant's link — a non-match leaves the existing URL intact.
function pickSellerDirectLink(sellers: OnlineSeller[], store: string | null | undefined): string | null {
  if (!store) return null;
  const want = normStore(store);
  if (!want) return null;
  const match = sellers.find((s) => {
    const have = normStore(String(s?.name ?? ""));
    return have !== "" && (have === want || have.includes(want) || want.includes(have));
  });
  if (!match) return null;
  return safeHttp(match.direct_link) ?? safeHttp(unwrapGoogleRedirect(String(match.link ?? "")));
}

// Step 1 output — the material planner's bill of materials.
const plannerItemSchema = z.object({
  category: z.string(),
  materialName: z.string(),
  estimatedQuantity: z.number(),
  unit: z.string(),
  searchQuery: z.string(),
});
const plannerSchema = z.object({
  materials: z.array(plannerItemSchema).default([]),
});

/**
 * Intake gate — runs BEFORE generation. Corrects the location and judges whether
 * the brief is descriptive enough for an accurate proposal. When it's thin, it
 * returns 3-8 targeted clarifying questions (scaled to how under-specified the
 * brief is). Never blocks: on any failure it returns enoughDetail=true.
 */
export async function analyzeEstimatePrompt(input: {
  projectType: string;
  description: string;
  location?: string;
  sqft?: number;
}): Promise<
  | { ok: true; data: PromptAnalysis }
  | { ok: false; error: string; code?: "PLAN_LIMIT_REACHED"; resource?: LimitKey }
> {
  let organizationId: string;
  try {
    ({ organizationId } = await requireEstimatorOrManager());
    const { requireFeatureOrThrow } = await import("@/lib/entitlements");
    const { getOrgPlanById } = await import("@/lib/orgPlan");
    const plan = await getOrgPlanById(organizationId);
    requireFeatureOrThrow(plan, "advanced_estimator");
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Upgrade required" };
  }
  const blocked = await estimatorRunBlocked(organizationId);
  if (blocked) return blocked;

  const passthrough: PromptAnalysis = {
    correctedLocation: input.location?.trim() || null,
    enoughDetail: true,
    questions: [],
  };
  if (!isOpenAIEnabled()) return { ok: true, data: passthrough };

  try {
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            'You are a senior estimator\'s intake assistant. Return JSON ONLY matching: {"correctedLocation": string|null, "enoughDetail": boolean, "questions": [{"id": string, "question": string, "kind": "select"|"number"|"text", "options"?: string[], "unit"?: string, "placeholder"?: string}]}. ' +
            "(1) correctedLocation: if a location is given, fix typos and normalize to \"City, ST\" (2-letter US state). If none or clearly not a place, null. " +
            "(2) Decide if the description carries enough specifics (materials, dimensions/quantities, finish/quality level, site conditions) to produce an ACCURATE, line-itemed proposal for this project type. If yes: enoughDetail=true, questions=[]. If not: enoughDetail=false and write between 3 and 8 clarifying questions that close the BIGGEST gaps first — the thinner the brief, the more questions (hard max 8). " +
            "Each question: use kind 'select' for a finite choice (give 2-5 concrete realistic options), 'number' for a measurement (set a `unit` like sqft, ft, count), or 'text' for open detail (set a short `placeholder`). Keep them concrete, contractor-answerable in seconds, non-redundant. `id` is a short kebab slug. Return JSON only.",
        },
        {
          role: "user",
          content: `Project type: ${input.projectType}
${input.location ? `Location: ${input.location}` : "Location: (none given)"}
${input.sqft ? `Approx size: ${input.sqft} sqft` : ""}
Description: ${input.description}`,
        },
      ],
      response_format: { type: "json_object" },
    });
    const text = completion.choices[0]?.message?.content ?? "{}";
    const parsed = promptAnalysisSchema.parse(JSON.parse(text));
    // Clamp to 8, and downgrade an option-less "select" to "text" so the UI never
    // renders an unanswerable question. If "not enough" but zero questions came
    // back, treat the brief as enough rather than showing an empty modal.
    const questions = parsed.questions
      .slice(0, 8)
      .map((q) =>
        q.kind === "select" && (!q.options || q.options.length === 0)
          ? { ...q, kind: "text" as const }
          : q,
      );
    return {
      ok: true,
      data: { ...parsed, questions, enoughDetail: parsed.enoughDetail || questions.length === 0 },
    };
  } catch (err: any) {
    console.warn(`[analyzeEstimatePrompt] failed, proceeding without clarify: ${err?.message ?? err}`);
    return { ok: true, data: passthrough };
  }
}

/**
 * Two-step AI estimating system with a live pricing loop in the middle:
 *   1. Material Planner — OpenAI reads the description and lists required
 *      materials, each with an optimized retail searchQuery.
 *   2. Search Loop — searchProductPrices() runs in parallel for every query.
 *   3. Matcher & Estimator — OpenAI picks the best product per qualityTier,
 *      applies waste factors + package rounding, and prices trade labor.
 */
export async function generateAdvancedEstimate(input: GenerateInput): Promise<
  | { ok: true; data: GeneratedEstimate; disabled?: false }
  | { ok: true; data: GeneratedEstimate; disabled: true }
  | { ok: false; error: string; code?: "PLAN_LIMIT_REACHED"; resource?: LimitKey }
> {
  let organizationId: string;
  try {
    ({ organizationId } = await requireEstimatorOrManager());
    const { requireFeatureOrThrow } = await import("@/lib/entitlements");
    const { getOrgPlanById } = await import("@/lib/orgPlan");
    const plan = await getOrgPlanById(organizationId);
    requireFeatureOrThrow(plan, "advanced_estimator");
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Upgrade required" };
  }
  const blocked = await estimatorRunBlocked(organizationId);
  if (blocked) return blocked;

  if (!isOpenAIEnabled()) {
    return { ok: true, data: { ...STUB, title: `${input.projectType} estimate · AI disabled` }, disabled: true };
  }

  const qualityTier = input.qualityTier ?? "standard";
  // "Regenerate with AI" feeds the user's edited assumptions in as constraints.
  const cleanAssumptions = (input.assumptions ?? []).map((a) => a.trim()).filter(Boolean);
  const assumptionsBlock =
    cleanAssumptions.length > 0
      ? `\n\nHonor these user assumptions/constraints as ground truth (adjust materials, quantities, and pricing to fit them):\n${cleanAssumptions
          .map((a) => `- ${a}`)
          .join("\n")}`
      : "";

  try {
    const client = getOpenAI();

    // ── Step 1 · Material Planner ───────────────────────────────────────────
    console.info(
      `[advancedEstimator] Step 1 (planner) · type="${input.projectType}" tier=${qualityTier}`
    );
    const plannerCompletion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            'You are a senior construction material planner. From a project description, output the full bill of materials needed to complete the job. Return JSON only matching: {"materials": [{"category": string, "materialName": string, "estimatedQuantity": number, "unit": string, "searchQuery": string}]}. ' +
            "Rules: `category` is the trade grouping (e.g. 'Drywall', 'Framing', 'Tile', 'Fixtures'); `estimatedQuantity` is the raw measured quantity needed BEFORE waste or packaging; `unit` is the natural measurement unit (sqft, ln ft, sheet, each, box, roll); `searchQuery` is a highly optimized retail search term a buyer would type into Home Depot, Lowe's, or Amazon to find the exact product, including dimensions and spec (e.g. '1/2 in. moisture resistant greenboard drywall 4x8'). Include 5-12 line items covering both materials and key fixtures. Return JSON only.",
        },
        {
          role: "user",
          content: `Project type: ${input.projectType}
${input.location ? `Location: ${input.location}` : ""}
${input.sqft ? `Approximate size: ${input.sqft} sqft` : ""}
Quality tier: ${qualityTier}
Description: ${input.description}${assumptionsBlock}`,
        },
      ],
      response_format: { type: "json_object" },
    });
    const plannerText = plannerCompletion.choices[0]?.message?.content ?? "{}";
    const planned = plannerSchema.parse(JSON.parse(plannerText));
    console.info(`[advancedEstimator] Step 1 produced ${planned.materials.length} planned materials`);

    // ── Step 2 · Search Loop (throttled live pricing) ───────────────────────
    // Bounded concurrency: an unbounded fan-out tripped SerpAPI's per-second
    // throttle mid-batch, and the rate-limited queries silently degraded.
    console.info(
      `[advancedEstimator] Step 2 (search) · ${planned.materials.length} queries, ${SERP_CONCURRENCY} at a time`
    );
    const searchResults = await mapLimit(planned.materials, SERP_CONCURRENCY, (m) =>
      searchProductPrices(m.searchQuery, input.location)
    );
    const research = planned.materials.map((m, i) => ({
      category: m.category,
      materialName: m.materialName,
      estimatedQuantity: m.estimatedQuantity,
      unit: m.unit,
      searchQuery: m.searchQuery,
      options: searchResults[i],
    }));

    // ── Step 3 · Matcher & Estimator ────────────────────────────────────────
    // The model CHOOSES a product per line but never transcribes URLs: options
    // are sent index-only (no link/thumbnail — long high-entropy URLs that an
    // LLM reliably corrupts into plausible fakes like
    // homedepot.com/productImage/100000000), and the choice comes back as
    // {sourceIndex, optionIndex}. Store/link/image are then attached
    // server-side from the real SerpAPI data, so a hallucinated URL can never
    // reach the estimate.
    console.info(`[advancedEstimator] Step 3 (matcher) · pricing final purchase quantities`);
    const promptResearch = research.map((r, index) => ({
      index,
      category: r.category,
      materialName: r.materialName,
      estimatedQuantity: r.estimatedQuantity,
      unit: r.unit,
      searchQuery: r.searchQuery,
      options: r.options.map((o, oi) => ({
        option: oi,
        title: o.title,
        price: o.price,
        store: o.source,
      })),
    }));
    const matcherLineSchema = lineSchema.extend({
      sourceIndex: z.number().int().nullish(),
      optionIndex: z.number().int().nullish(),
    });
    const matcherSchema = estimateSchema.extend({
      materials: z.array(matcherLineSchema).default([]),
    });
    const matcherCompletion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            'You are a senior contractor AI estimator and purchasing agent. You receive a planned bill of materials (each with an `index`) where each item carries up to 3 live retail product "options" (each with an `option` number) from web search. Produce a final, purchase-ready estimate as JSON matching: {title, scope, assumptions: string[], materials: [{name, quantity, unitPrice, unit, sourceIndex, optionIndex, dimensions, notes}], labor: [{name, quantity, unitPrice, unit}], estimatedTimelineDays: number}. ' +
            `For every planned material: (1) choose the single best product option fitting the "${qualityTier}" quality tier — budget = lowest cost that does the job, standard = mid-grade contractor quality, luxury = premium/high-end — set \`sourceIndex\` to the planned material's \`index\`, set \`optionIndex\` to the chosen option's \`option\` number, and use the chosen option's price as \`unitPrice\`. If an item has no options, set optionIndex to null and price it from your own market knowledge. NEVER output store names, product URLs, or image URLs — they are attached automatically from your chosen option; ` +
            "(2) apply standard construction waste factors to the estimatedQuantity: 10% for tile and drywall, 15% for lumber and trim, 0% for fixtures and fittings; " +
            "(3) infer the purchase package from the chosen product (sold by box, roll, sheet, or each) and round the final purchase quantity UP to the nearest whole package so the crew never runs short — set `quantity` to that final purchase count and `unit` to the package unit; " +
            "(4) ALWAYS set `dimensions` to the chosen product's real size/pack spec (never omit it) — e.g. '4x8 sheet', '12x12 in tile', '5 gal', '16 oz', '50 lb bag', '8 ft board'; if a precise size is unknown, give the sell-unit (e.g. 'per sheet', 'per box'). " +
            "(5) in `notes`, briefly explain the waste factor and any package rounding (e.g. 'Added 10% waste: 20 -> 22 sqft, rounded to 1 box of 30 sqft'). " +
            "For labor: estimate 2-4 trade labor line items as DOLLAR amounts based on the final scope; each labor line's quantity x unitPrice must equal its labor dollars (e.g. quantity 1 with unitPrice = crew cost, or hours x hourly rate). Apply realistic US pricing adjusted for the stated location. Return JSON only.",
        },
        {
          role: "user",
          content: `Project type: ${input.projectType}
${input.location ? `Location: ${input.location}` : ""}
${input.sqft ? `Approximate size: ${input.sqft} sqft` : ""}
Quality tier: ${qualityTier}
Description: ${input.description}${assumptionsBlock}

Planned materials with live product options (JSON):
${JSON.stringify(promptResearch)}`,
        },
      ],
      response_format: { type: "json_object" },
    });
    const matcherText = matcherCompletion.choices[0]?.message?.content ?? "{}";
    const parsed = matcherSchema.parse(JSON.parse(matcherText));
    // Attach product identity (store/link/image) from the REAL option the model
    // picked — never from model-authored text. Lines without a valid index pair
    // carry no product link, exactly like an option-less line today.
    const chosen: (ProductSearchResult | null)[] = [];
    const materials = parsed.materials.map(({ sourceIndex, optionIndex, ...line }) => {
      const opt =
        sourceIndex != null && optionIndex != null
          ? research[sourceIndex]?.options[optionIndex] ?? null
          : null;
      chosen.push(opt);
      return {
        ...line,
        store: opt?.source ?? undefined,
        productUrl: (opt && safeHttp(opt.link)) ?? undefined,
        imageUrl: (opt && safeHttp(opt.thumbnail)) ?? undefined,
      };
    });
    const estimate: GeneratedEstimate = { ...parsed, materials };
    console.info(
      `[advancedEstimator] Step 3 complete · ${materials.length} materials (${chosen.filter(Boolean).length} matched to live products), ${parsed.labor.length} labor lines`
    );

    // ── Step 4 · Resolve direct merchant links ──────────────────────────────
    // Each chosen listing's productUrl is its GOOGLE product page. Trade it for
    // the store's OWN product-detail page (e.g. homedepot.com/p/…) via the
    // Immersive Product API's stores list (google_product sellers as legacy
    // fallback). One extra call per listing — parallelized, de-duped, key-gated,
    // and fully best-effort: any miss leaves the existing link untouched so the
    // estimate never regresses or throws.
    const serpKey = process.env.SERPAPI_API_KEY;
    if (serpKey) {
      const linkCache = new Map<string, Promise<OnlineSeller[]>>();
      let upgraded = 0;
      await mapLimit(materials, SERP_CONCURRENCY, async (mat, i) => {
        const opt = chosen[i];
        if (!opt) return;
        try {
          const direct = await directLinkFor(opt, mat.store, serpKey, linkCache);
          if (direct) {
            mat.productUrl = direct;
            upgraded += 1;
          }
        } catch (err: any) {
          console.warn(
            `[advancedEstimator] direct-link resolve failed for "${mat.name}": ${err?.message ?? err}`
          );
        }
      });
      console.info(
        `[advancedEstimator] Step 4 (direct links) · upgraded ${upgraded}/${materials.length} to merchant URLs`
      );
    }

    return { ok: true, data: estimate };
  } catch (err: any) {
    console.error(`[advancedEstimator] generation failed: ${err?.message ?? err}`);
    return { ok: false, error: err?.message ?? "AI generation failed" };
  }
}

// ── Incremental refine ──────────────────────────────────────────────────────
// The "Apply changes" path. Unlike generateAdvancedEstimate, this does NOT
// re-plan or re-fetch live prices — it makes a single surgical pass that edits
// the EXISTING estimate per the contractor's request, preserving every
// untouched line, price, and product link. Same costing rules, applied only
// where asked.
const refineInputSchema = z.object({
  projectType: z.string(),
  description: z.string().default(""),
  location: z.string().optional(),
  qualityTier: z.enum(["budget", "standard", "luxury"]).optional(),
  instructions: z.string().default(""),
  assumptions: z.array(z.string()).default([]),
  current: estimateSchema,
});

export async function refineAdvancedEstimate(raw: unknown): Promise<
  | { ok: true; data: GeneratedEstimate; disabled?: boolean }
  | { ok: false; error: string; code?: "PLAN_LIMIT_REACHED"; resource?: LimitKey }
> {
  let input: z.infer<typeof refineInputSchema>;
  try {
    input = refineInputSchema.parse(raw);
  } catch {
    return { ok: false, error: "Invalid estimate payload" };
  }

  let organizationId: string;
  try {
    ({ organizationId } = await requireEstimatorOrManager());
    const { requireFeatureOrThrow } = await import("@/lib/entitlements");
    const { getOrgPlanById } = await import("@/lib/orgPlan");
    const plan = await getOrgPlanById(organizationId);
    requireFeatureOrThrow(plan, "advanced_estimator");
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Upgrade required" };
  }
  const blocked = await estimatorRunBlocked(organizationId);
  if (blocked) return blocked;

  const cleanAssumptions = input.assumptions.map((a) => a.trim()).filter(Boolean);
  const instructions = input.instructions.trim();

  // No AI configured — echo the current estimate back (folding in any edited
  // assumptions) so the UI stays consistent in demo mode.
  if (!isOpenAIEnabled()) {
    return {
      ok: true,
      data: {
        ...input.current,
        assumptions: cleanAssumptions.length ? cleanAssumptions : input.current.assumptions,
      },
      disabled: true,
    };
  }

  const qualityTier = input.qualityTier ?? "standard";
  try {
    const client = getOpenAI();
    console.info(
      `[advancedEstimator] refine · "${instructions.slice(0, 80)}" · ${input.current.materials.length} materials`
    );
    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            'You are a senior contractor AI estimator EDITING an existing estimate. You receive the current estimate as JSON plus a plain-English change request from the contractor. Apply ONLY the requested changes and return the COMPLETE updated estimate as JSON matching: {title, scope, assumptions: string[], materials: [{name, quantity, unitPrice, unit, store, productUrl, imageUrl, dimensions, notes}], labor: [{name, quantity, unitPrice, unit, notes}], estimatedTimelineDays: number}. ' +
            "Rules: (1) Preserve every line, price, store, productUrl, imageUrl, and dimensions that the request does NOT touch — copy them through unchanged; do not re-price or re-shop untouched items. " +
            `(2) Keep the same costing formula as the original: quality tier "${qualityTier}", waste factors (10% tile/drywall, 15% lumber/trim, 0% fixtures), and round purchase quantities UP to whole packages. EXCEPT if the instructions or assumptions explicitly ask for a different quality/grade for specific items, adjust those items. ` +
            "(3) Keep `dimensions` set to each product's real size/pack spec. " +
            "(4) If you add a new material, OR if you upgrade/change a material's specification based on the instructions or assumptions, you MUST leave its store, productUrl, and imageUrl empty (or null) so it will be re-shopped live. Do not reuse the old link for a changed material. " +
            "(5) Treat the contractor's assumptions as ground truth. If an assumption conflicts with the current estimate (e.g. requires a different material, quantity, or scope), you MUST update the estimate to match. Return JSON only.",
        },
        {
          role: "user",
          content: `Project type: ${input.projectType}
${input.location ? `Location: ${input.location}` : ""}
Quality tier: ${qualityTier}

Change request from the contractor:
${instructions || "(no free-text request — apply the updated assumptions below)"}

${
  cleanAssumptions.length
    ? `Assumptions to honor:\n${cleanAssumptions.map((a) => `- ${a}`).join("\n")}\n\n`
    : ""
}Current estimate (JSON) — edit this and return the full updated version:
${JSON.stringify(input.current)}`,
        },
      ],
      response_format: { type: "json_object" },
    });
    const text = completion.choices[0]?.message?.content ?? "{}";
    const parsed = estimateSchema.parse(JSON.parse(text));

    // The model transcribes the whole estimate JSON, and long product/image
    // URLs do NOT survive LLM transcription reliably — they come back subtly
    // corrupted or outright fabricated (e.g. homedepot.com/productImage/…).
    // So the model's URL text is only ever treated as a SIGNAL: on a
    // name-matched line, non-null product fields mean "untouched" and are
    // replaced with the authoritative stored values, while nulls (rule 4)
    // mean "re-shop me" and are respected. Lines with no original counterpart
    // (new/renamed) get their product fields cleared so the re-shop below
    // links them to real products.
    const originalByName = new Map(
      input.current.materials.map((m) => [m.name.trim().toLowerCase(), m])
    );
    for (const mat of parsed.materials) {
      const orig = originalByName.get(mat.name.trim().toLowerCase());
      if (orig) {
        if (mat.store != null) mat.store = orig.store;
        if (mat.productUrl != null) mat.productUrl = orig.productUrl;
        if (mat.imageUrl != null) mat.imageUrl = orig.imageUrl;
      } else {
        mat.store = undefined;
        mat.productUrl = undefined;
        mat.imageUrl = undefined;
      }
    }

    // ── Re-shop changed lines ────────────────────────────────────────────────
    // The edit can introduce or alter a material the model has no live product
    // for: it returns that line WITHOUT a productUrl (or keeps a stale link from
    // the old product). Such lines carry only an AI-guessed price and drop out of
    // the shoppable Materials request (which requires a productUrl). Detect them
    // (no link, OR a name the original estimate didn't have) and run live pricing
    // for JUST those, then let the AI match each to a real product so the edited
    // line becomes genuinely priced, linked, and shoppable.
    const originalNames = new Set(originalByName.keys());
    const toPrice = parsed.materials
      .map((m, idx) => ({ m, idx }))
      .filter(({ m }) => !m.productUrl || !originalNames.has(m.name.trim().toLowerCase()));

    if (toPrice.length > 0) {
      try {
        console.info(`[advancedEstimator] refine · re-shopping ${toPrice.length} changed line(s)`);
        // One retail query per changed line, from its name + size.
        const queries = toPrice.map(({ m }) =>
          [m.name, m.dimensions].filter(Boolean).join(" ").trim()
        );
        const searchResults = await mapLimit(queries, SERP_CONCURRENCY, (q) =>
          searchProductPrices(q, input.location)
        );
        const research = toPrice.map(({ m }, i) => ({
          index: i,
          name: m.name,
          quantity: m.quantity,
          unit: m.unit ?? null,
          dimensions: m.dimensions ?? null,
          // Index-only options — the model must never transcribe URLs (it
          // fabricates them); store/link/image are attached server-side from
          // the chosen option.
          options: searchResults[i].map((o, oi) => ({
            option: oi,
            title: o.title,
            price: o.price,
            store: o.source,
          })),
        }));

        // Scoped matcher — picks a real product per line. Keeps the edit's quantity
        // (we don't have the raw measurement to re-derive packaging here); only the
        // price, dimensions, and unit come from the product; store/link/image are
        // attached from the chosen optionIndex after the parse.
        const reMatchSchema = z.object({
          materials: z
            .array(lineSchema.extend({ optionIndex: z.number().int().nullish() }))
            .default([]),
        });
        const matchCompletion = await client.chat.completions.create({
          model: OPENAI_MODEL,
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content:
                'You are a senior contractor purchasing agent. You receive specific material lines, each with up to 3 live retail product "options" (each with an `option` number) from web search. Return JSON only: {"materials": [{name, quantity, unitPrice, unit, optionIndex, dimensions, notes}]}. ' +
                `For EACH line: (1) keep \`name\` and \`quantity\` EXACTLY as given — do NOT recompute the quantity; (2) choose the single best option fitting the contractor's request. Consider any change requests or assumptions provided. If no specific grade is requested for the item, default to the "${qualityTier}" quality tier (budget = lowest cost that does the job, standard = mid-grade contractor quality, luxury = premium/high-end). Set \`optionIndex\` to the chosen option's \`option\` number (or null if it has no options), unitPrice to its price, dimensions to its real size/pack spec, and unit to its sell-unit (e.g. bundle, roll, sheet, each). NEVER output store names, product URLs, or image URLs — they are attached automatically from your chosen option; ` +
                "(3) in `notes`, one short line noting it was priced to the chosen product. Return ONE line per input, in the SAME order. Return JSON only.",
            },
            {
              role: "user",
              content: `Quality tier: ${qualityTier}
${instructions ? `Change request: ${instructions}` : ""}
${cleanAssumptions.length ? `Assumptions: ${cleanAssumptions.join("; ")}` : ""}

Lines to price, each with live product options (JSON):
${JSON.stringify(research)}`,
            },
          ],
          response_format: { type: "json_object" },
        });
        const matched = reMatchSchema.parse(
          JSON.parse(matchCompletion.choices[0]?.message?.content ?? "{}")
        );

        // Merge re-priced lines back, attaching store/link/image from the REAL
        // chosen option (never model text). Prefer index alignment (one line
        // per input, same order); fall back to matching by name. `inputIdx` is
        // the position in toPrice/searchResults, `slotIdx` the position in
        // parsed.materials.
        const chosenBySlot = new Map<number, ProductSearchResult>();
        const applyLine = (
          pm: (typeof matched.materials)[number],
          inputIdx: number,
          slotIdx: number,
        ) => {
          const { optionIndex, ...line } = pm;
          const opt =
            optionIndex != null ? searchResults[inputIdx]?.[optionIndex] ?? null : null;
          if (opt) chosenBySlot.set(slotIdx, opt);
          parsed.materials[slotIdx] = {
            ...line,
            store: opt?.source ?? undefined,
            productUrl: (opt && safeHttp(opt.link)) ?? undefined,
            imageUrl: (opt && safeHttp(opt.thumbnail)) ?? undefined,
          };
        };
        if (matched.materials.length === toPrice.length) {
          toPrice.forEach(({ idx }, i) => applyLine(matched.materials[i], i, idx));
        } else {
          const byName = new Map(
            matched.materials.map((pm) => [pm.name.trim().toLowerCase(), pm])
          );
          toPrice.forEach(({ m, idx }, i) => {
            const pm = byName.get(m.name.trim().toLowerCase());
            if (pm) applyLine(pm, i, idx);
          });
        }

        // Trade the Google product page for the store's own product-detail page
        // (parity with generate's Step 4: immersive stores → legacy sellers).
        // Best-effort; a miss leaves the SerpAPI link intact.
        const serpKey = process.env.SERPAPI_API_KEY;
        if (serpKey) {
          const linkCache = new Map<string, Promise<OnlineSeller[]>>();
          await mapLimit(toPrice, SERP_CONCURRENCY, async ({ idx }) => {
            const mat = parsed.materials[idx];
            const opt = chosenBySlot.get(idx);
            if (!opt) return;
            try {
              const direct = await directLinkFor(opt, mat.store, serpKey, linkCache);
              if (direct) mat.productUrl = direct;
            } catch {
              /* leave the existing link */
            }
          });
        }
        console.info(
          `[advancedEstimator] refine · re-priced ${matched.materials.length} line(s) with live products`
        );
      } catch (err: any) {
        // Best-effort — a re-shop failure leaves the AI-estimated lines in place
        // rather than failing the whole refine.
        console.warn(`[advancedEstimator] refine re-shop failed: ${err?.message ?? err}`);
      }
    }

    console.info(
      `[advancedEstimator] refine complete · ${parsed.materials.length} materials, ${parsed.labor.length} labor`
    );
    return { ok: true, data: parsed };
  } catch (err: any) {
    console.error(`[advancedEstimator] refine failed: ${err?.message ?? err}`);
    return { ok: false, error: err?.message ?? "Couldn't apply changes" };
  }
}

// Persist estimate
export async function saveEstimate(raw: {
  projectType: string;
  location?: string | null;
  data: GeneratedEstimate;
}) {
  const { organizationId } = await requireEstimatorOrManager();
  await enforcePlanLimit(organizationId, "estimatorUses");
  const total =
    raw.data.materials.reduce((a, l) => a + l.quantity * l.unitPrice, 0) +
    raw.data.labor.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const est = await db.aiEstimate.create({
    data: {
      organizationId,
      projectType: raw.projectType,
      location: raw.location ?? null,
      materials: JSON.stringify(raw.data.materials),
      labor: JSON.stringify(raw.data.labor),
      categories: JSON.stringify({
        title: raw.data.title,
        assumptions: raw.data.assumptions,
        estimatedTimelineDays: raw.data.estimatedTimelineDays,
      }),
      assumptions: raw.data.assumptions.join("\n"),
      total,
    },
  });
  revalidatePath("/dashboard/advanced-ai");
  return { id: est.id };
}

// Convert estimate → new Proposal
const convertInput = z.object({
  projectType: z.string(),
  title: z.string(),
  scope: z.string().optional(),
  materials: z.array(lineSchema).default([]),
  labor: z.array(lineSchema).default([]),
  assumptions: z.array(z.string()).default([]),
  // Pre-links the proposal to a client when converted from a client's page.
  clientId: z.string().optional().nullable(),
  // The estimate's job location ("City, ST") — becomes the proposal's job
  // address and, when its state resolves, seeds the tax rate for that market.
  location: z.string().optional().nullable(),
});

export async function convertEstimateToProposal(raw: unknown) {
  const { organizationId, user } = await requireEstimatorOrManager();
  await enforcePlanLimit(organizationId, "proposalsCreated");
  const data = convertInput.parse(raw);

  // Never trust a client id from the browser — it must belong to this org.
  const clientId = data.clientId
    ? (
        await db.client.findFirst({
          where: { id: data.clientId, organizationId },
          select: { id: true },
        })
      )?.id ?? null
    : null;

  // Hidden profit markup: seed this proposal from the org-wide default, then
  // apply it so each line's unitPrice is the SELL price (0% → equals cost).
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { materialMarkupPct: true, laborMarkupPct: true, defaultTaxRate: true },
  });
  const markupRates = resolveMarkupRates(null, org);

  const lines = [
    ...data.materials.map((l) => {
      // Fold the product size into the line name so the proposal reads e.g.
      // "Asphalt shingles (4x8 sheet)" — the buyer sees how big each unit is,
      // not just the material name. Skip if the name already states the size.
      const size = l.dimensions?.trim() || (l.unit?.trim() ? `per ${l.unit.trim()}` : "");
      const name =
        size && !l.name.toLowerCase().includes(size.toLowerCase())
          ? `${l.name} (${size})`
          : l.name;
      const sell = sellUnitPrice({ unitPrice: l.unitPrice, materialCost: l.unitPrice, laborCost: 0 }, markupRates);
      return {
        name,
        description: l.unit ? `Measured in ${l.unit}` : null,
        measurementType: l.unit === "sqft" ? "SQFT" : l.unit === "ln ft" ? "LINEAR_FT" : l.unit === "hour" ? "HOUR" : "UNIT",
        quantity: l.quantity,
        unitPrice: sell,
        materialCost: l.unitPrice,
        laborCost: 0,
        total: l.quantity * sell,
        // Carry the live-pricing product data so the Materials Request view can
        // render a shoppable line. Empty strings normalize to null.
        store: l.store?.trim() || null,
        productUrl: l.productUrl?.trim() || null,
        imageUrl: l.imageUrl?.trim() || null,
        dimensions: l.dimensions?.trim() || null,
      };
    }),
    ...data.labor.map((l) => ({
      name: l.name,
      description: l.unit ? `Measured in ${l.unit}` : null,
      measurementType: l.unit === "hour" ? "HOUR" : l.unit === "sqft" ? "SQFT" : "UNIT",
      quantity: l.quantity,
      unitPrice: sellUnitPrice({ unitPrice: l.unitPrice, materialCost: 0, laborCost: l.unitPrice }, markupRates),
      materialCost: 0,
      laborCost: l.unitPrice,
      total:
        l.quantity *
        sellUnitPrice({ unitPrice: l.unitPrice, materialCost: 0, laborCost: l.unitPrice }, markupRates),
      store: null,
      productUrl: null,
      imageUrl: null,
      dimensions: null,
    })),
  ];

  const subtotal = lines.reduce((a, l) => a + l.total, 0);
  // Tax sits on top of the marked-up subtotal (sell price), applied once.
  // The estimate's location wins when its state resolves (the contractor gave
  // a market, so tax that market); the org default is the fallback. taxRate is
  // a FRACTION (0.08 = 8%), not a percent.
  const address = data.location?.trim() || null;
  const taxRate = stateTaxRate(stateFromAddress(address)) ?? org?.defaultTaxRate ?? 0;
  const taxTotal = subtotal * taxRate;

  // Scope only — assumptions stay on the estimate (AiEstimate), never baked into
  // the proposal's scope, so the preview / calendar / job detail stay clean.
  const scope = (data.scope ?? "").trim();

  const proposal = await db.proposal.create({
    data: {
      publicId: randomUUID(),
      organizationId,
      ownerId: user.id,
      clientId,
      title: data.title,
      scopeOfWork: scope || null,
      address,
      status: ProposalStatus.DRAFT,
      subtotal,
      taxRate,
      taxTotal,
      total: subtotal + taxTotal,
      materialMarkupPct: markupRates.materialMarkupPct,
      laborMarkupPct: markupRates.laborMarkupPct,
      validUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
      lineItems: {
        create: lines.map((l, i) => ({ ...l, position: i })),
      },
      installments: {
        create: [
          { label: "Deposit", amount: 30, isPercent: true, position: 0 },
          { label: "Completion", amount: 70, isPercent: true, position: 1 },
        ],
      },
    },
  });

  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      proposalId: proposal.id,
      kind: "CREATED",
      summary: `Converted "${data.projectType}" AI estimate to proposal "${proposal.title}"`,
    },
  });

  revalidatePath("/dashboard/proposals");
  return { id: proposal.id };
}
