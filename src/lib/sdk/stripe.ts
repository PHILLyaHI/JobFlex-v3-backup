import Stripe from "stripe";
import { IntegrationDisabledError } from "./base";
import { getStripeMode, stripeKeyFor, type StripeMode } from "@/lib/stripeMode";

// One client per secret key, cached for the life of the process. Two can be
// alive at once — the live one and the sandbox one — since the admin switch
// (lib/stripeMode) can flip between requests.
const clients = new Map<string, Stripe>();

function clientFor(key: string): Stripe {
  let c = clients.get(key);
  if (!c) {
    c = new Stripe(key, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion });
    clients.set(key, c);
  }
  return c;
}

/** Configured at all — in either mode. The mode-specific answer is
 *  `stripeKeyFor(await getStripeMode())`. */
export function isStripeEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_TEST);
}

/**
 * The client for the CURRENT admin-selected mode. Use this on every path that
 * moves or promises money (checkout, subscription verify, plan sync) — it is
 * what makes the /admin/integrations switch actually decide where payments go.
 */
export async function getStripeClient(): Promise<{ stripe: Stripe; mode: StripeMode }> {
  const mode = await getStripeMode();
  const key = stripeKeyFor(mode);
  if (!key) {
    throw new IntegrationDisabledError(
      "Stripe",
      mode === "live" ? "STRIPE_SECRET_KEY" : "STRIPE_SECRET_KEY_TEST",
    );
  }
  return { stripe: clientFor(key), mode };
}

/**
 * The LIVE-key client (falling back to the test key only when no live key is
 * set). The webhook, reconciliation, payouts and the admin's subscriber reads
 * stay on this: they mirror the account of record, and must not silently start
 * reading the sandbox because someone flipped the trial switch.
 */
export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_TEST;
  if (!key) {
    throw new IntegrationDisabledError("Stripe", "STRIPE_SECRET_KEY");
  }
  return clientFor(key);
}
