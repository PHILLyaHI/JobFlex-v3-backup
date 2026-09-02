// REUSABLE STRIPE PRICES — one Product per thing sold, one Price per distinct
// (amount, interval), on WHICHEVER account the current key reaches.
//
// WHY. Two flows used to send inline `price_data` with `product_data`, and
// Stripe mints a brand-new Product AND Price for every such session:
//   · the CUSTOM plan (its amount is $20 + $10 × pages, no catalog row), and
//   · every catalog checkout in SANDBOX mode (the PlanPrice mirror holds the
//     live account's ids, which do not exist there).
// A few dozen signups would have littered the Stripe dashboard with a product
// per checkout — the owner's exact worry, 2026-08-31. The custom plan's price
// space is actually tiny (base + 9 pages = 10 monthly + 10 yearly amounts at
// most), so caching turns "unbounded clutter" into at most one product and a
// handful of prices that repeat forever.
//
// HOW. SyncState (the app's key→string store) maps
//   stripeProduct:<mode>:<kind>              → prod_…
//   stripePrice:<mode>:<kind>:<interval>:<cents> → price_…
// per MODE, because live and sandbox are different accounts with different
// ids. A cached price is trusted; a cached product is verified by USE — if
// creating a price under it fails (deleted product, wiped sandbox), the
// product is re-minted once and the price retried.

import type Stripe from "stripe";
import { db } from "@/lib/db";
import type { StripeMode } from "@/lib/stripeMode";

async function readKey(key: string): Promise<string | null> {
  const row = await db.syncState.findUnique({ where: { key } }).catch(() => null);
  return row?.cursor || null;
}

async function writeKey(key: string, value: string): Promise<void> {
  await db.syncState
    .upsert({ where: { key }, update: { cursor: value }, create: { key, cursor: value } })
    .catch(() => {});
}

async function ensureProduct(
  stripe: Stripe,
  mode: StripeMode,
  kind: string,
  name: string,
  fresh = false,
): Promise<string> {
  const cacheKey = `stripeProduct:${mode}:${kind}`;
  if (!fresh) {
    const cached = await readKey(cacheKey);
    if (cached) return cached;
  }
  const product = await stripe.products.create({ name, metadata: { jfKind: kind } });
  await writeKey(cacheKey, product.id);
  return product.id;
}

/**
 * The reusable recurring Price for (kind, interval, cents) on the account the
 * given client reaches. `kind` is a stable slug ("custom", or a plan slug for
 * sandbox catalog checkouts); `name` is the Product display name minted the
 * first time that kind is seen.
 */
export async function ensureRecurringPrice(opts: {
  stripe: Stripe;
  mode: StripeMode;
  kind: string;
  name: string;
  interval: "MONTH" | "YEAR";
  cents: number;
}): Promise<string> {
  const { stripe, mode, kind, name, interval, cents } = opts;
  const priceKey = `stripePrice:${mode}:${kind}:${interval}:${cents}`;
  const cached = await readKey(priceKey);
  if (cached) return cached;

  const recurring = { interval: interval === "YEAR" ? ("year" as const) : ("month" as const) };
  let productId = await ensureProduct(stripe, mode, kind, name);
  let price: Stripe.Price;
  try {
    price = await stripe.prices.create({
      product: productId,
      currency: "usd",
      unit_amount: cents,
      recurring,
      metadata: { jfKind: kind, interval },
    });
  } catch {
    // Stale product id (deleted, or a wiped sandbox): re-mint once and retry.
    productId = await ensureProduct(stripe, mode, kind, name, true);
    price = await stripe.prices.create({
      product: productId,
      currency: "usd",
      unit_amount: cents,
      recurring,
      metadata: { jfKind: kind, interval },
    });
  }
  await writeKey(priceKey, price.id);
  return price.id;
}
