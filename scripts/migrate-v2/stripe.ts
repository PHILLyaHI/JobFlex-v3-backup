// Who is actually paying, straight from Stripe.
//
// The old app stopped writing Stripe's answer back into User.subscriptionStatus:
// 8 of the 9 live subscribers are recorded there as TRIALING or CANCELED, and
// several canceled ones still read ACTIVE. Selecting the cohort from that column
// gets both directions wrong, so Stripe is read directly and is the authority on
// plan, status, price and renewal date.
//
// Read-only: this lists subscriptions, products and prices, and never writes to
// Stripe.
import { readFileSync } from "node:fs";
import Stripe from "stripe";

export interface StripeSub {
  email: string;
  customerId: string;
  subId: string;
  priceId: string | null;
  product: string;
  /** The old app's plan key this product corresponds to (see map.ts PLAN). */
  planKey: string;
  status: string;
  currentPeriodEnd: Date;
  trialEnd: Date | null;
}

/** One old Stripe price, ready to be recorded in v3's PlanPrice ledger. */
export interface LedgerPrice {
  stripePriceId: string;
  stripeProductId: string;
  productName: string;
  planSlug: string;
  interval: "MONTH" | "YEAR";
  unitAmountCents: number;
  currency: string;
}

/**
 * Live product / price names -> the old app's plan keys, so one plan table
 * (map.ts) stays in charge of what lands in v3. Stripe calls the $149 tier
 * "Enterprise" on the product and "Advanced" on its prices; the old database
 * calls it ADVANCED; v3's catalogue names its `enterprise` slug "Advanced".
 */
export function legacyPlanKey(name: string | null | undefined): string | null {
  const n = (name ?? "").toLowerCase().replace(/^jobflex\s+/, "").trim();
  if (!n) return null;
  if (n.includes("starter")) return "STARTER";
  if (n.includes("professional") || n === "pro") return "PROFESSIONAL";
  if (n.includes("advanced") || n.includes("enterprise")) return "ADVANCED";
  return null;
}

function envValue(key: string): string | null {
  const fromEnv = process.env[key];
  if (fromEnv) return fromEnv;
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(new RegExp(`^${key}=(.*)$`));
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env.local — fall through */
  }
  return null;
}

function client(): { stripe: Stripe; live: boolean } {
  const key = envValue("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY not found (env or .env.local)");
  return {
    stripe: new Stripe(key, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion }),
    live: key.startsWith("sk_live_"),
  };
}

export interface StripeCohort {
  /** Keyed by lower-cased customer email AND by customer id, so either matches. */
  byKey: Map<string, StripeSub>;
  all: StripeSub[];
  live: boolean;
}

/**
 * Every subscription Stripe considers current. `trialing` only on request: a
 * trial is not a paid plan, though it is a real customer with a card on file.
 */
export async function loadStripeSubscriptions(includeTrialing: boolean): Promise<StripeCohort> {
  const { stripe, live } = client();
  const statuses: Stripe.SubscriptionListParams.Status[] = includeTrialing
    ? ["active", "trialing", "past_due"]
    : ["active", "past_due"];

  const productNames = new Map<string, string>();
  const all: StripeSub[] = [];

  for (const status of statuses) {
    for await (const sub of stripe.subscriptions.list({ status, limit: 100, expand: ["data.customer"] })) {
      const cust = sub.customer as Stripe.Customer;
      const price = sub.items.data[0]?.price;
      const productRef = price?.product;
      let product = "";
      if (typeof productRef === "string") {
        if (!productNames.has(productRef)) {
          productNames.set(productRef, (await stripe.products.retrieve(productRef)).name);
        }
        product = productNames.get(productRef) ?? "";
      } else if (productRef && "name" in productRef) {
        product = productRef.name;
      }
      all.push({
        email: (cust?.email ?? "").toLowerCase(),
        customerId: cust?.id ?? "",
        subId: sub.id,
        priceId: price?.id ?? null,
        product,
        planKey: legacyPlanKey(price?.metadata?.planName) ?? legacyPlanKey(product) ?? "PROFESSIONAL",
        status: sub.status,
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      });
    }
  }

  const byKey = new Map<string, StripeSub>();
  for (const s of all) {
    if (s.email) byKey.set(s.email, s);
    if (s.customerId) byKey.set(s.customerId, s);
  }
  return { byKey, all, live };
}

/**
 * Every price on every product the old app ever sold a subscription on — the
 * rows v3's PlanPrice ledger needs so that its webhooks, reconcile cron and the
 * admin "Sync from Stripe" name these plans the same way the import does.
 */
export async function listLegacyPrices(planSlugFor: (planKey: string) => string): Promise<LedgerPrice[]> {
  const { stripe } = client();
  const products = new Set<string>();
  for await (const sub of stripe.subscriptions.list({ status: "all", limit: 100 })) {
    const p = sub.items.data[0]?.price;
    if (!p) continue;
    products.add(typeof p.product === "string" ? p.product : p.product.id);
  }

  const out: LedgerPrice[] = [];
  for (const productId of products) {
    const product = await stripe.products.retrieve(productId);
    for await (const price of stripe.prices.list({ product: productId, limit: 100 })) {
      const planKey =
        legacyPlanKey(price.metadata?.planName) ??
        legacyPlanKey(price.metadata?.plan_name) ??
        legacyPlanKey(product.metadata?.planName) ??
        legacyPlanKey(product.name);
      const interval = price.recurring?.interval;
      if (!planKey || (interval !== "month" && interval !== "year")) continue;
      out.push({
        stripePriceId: price.id,
        stripeProductId: productId,
        productName: product.name,
        planSlug: planSlugFor(planKey).toLowerCase(),
        interval: interval === "month" ? "MONTH" : "YEAR",
        unitAmountCents: price.unit_amount ?? 0,
        currency: price.currency,
      });
    }
  }
  return out;
}
