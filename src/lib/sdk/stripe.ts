import Stripe from "stripe";
import { IntegrationDisabledError } from "./base";
import { getStripeMode, stripeKeyFor, type StripeMode } from "@/lib/stripeMode";
import { mockStripeClient } from "./stripeMock";

/**
 * THE DEVELOPMENT STAND-IN (lib/sdk/stripeMock). With STRIPE_MOCK_FILE set,
 * every client below is the file-backed mock, whatever keys `.env.local`
 * holds — so a rehearsal of the admin plan editor or the reconcile cron never
 * reaches the live account. Refused under NODE_ENV=production outright: the
 * variable is simply ignored there, and the real keys decide as before.
 */
function mockIfEnabled(): Stripe | null {
  const file = process.env.STRIPE_MOCK_FILE?.trim();
  if (!file || process.env.NODE_ENV === "production") return null;
  return mockStripeClient(file);
}

/** True while the mock stands in for Stripe (development only). */
export function isStripeMocked(): boolean {
  return mockIfEnabled() !== null;
}

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
  if (mockIfEnabled()) return true;
  return Boolean(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_TEST);
}

/**
 * The client for the CURRENT admin-selected mode. Use this on every path that
 * moves or promises money (checkout, subscription verify, plan sync) — it is
 * what makes the /admin/integrations switch actually decide where payments go.
 */
export async function getStripeClient(): Promise<{ stripe: Stripe; mode: StripeMode }> {
  const mode = await getStripeMode();
  const mock = mockIfEnabled();
  if (mock) return { stripe: mock, mode };
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
 * The client for an EXPLICIT mode, or null when that mode has no key. The
 * Connect webhook uses this: an event says `livemode` itself, and any follow-up
 * call must go to that account regardless of the admin switch.
 */
export function stripeClientForMode(mode: StripeMode): Stripe | null {
  const mock = mockIfEnabled();
  if (mock) return mock;
  const key = stripeKeyFor(mode);
  return key ? clientFor(key) : null;
}

/**
 * A client on a CONTRACTOR'S OWN key — Settings → Payments → "Use API key"
 * (lib/payments/stripeConnect.ts decrypts it). Cached like the platform
 * clients, keyed by the key; the key never leaves the server.
 */
export function stripeClientForKey(key: string): Stripe {
  return clientFor(key);
}

/**
 * The LIVE-key client (falling back to the test key only when no live key is
 * set). The webhook, reconciliation, payouts and the admin's subscriber reads
 * stay on this: they mirror the account of record, and must not silently start
 * reading the sandbox because someone flipped the trial switch.
 */
export function getStripe() {
  const mock = mockIfEnabled();
  if (mock) return mock;
  const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_TEST;
  if (!key) {
    throw new IntegrationDisabledError("Stripe", "STRIPE_SECRET_KEY");
  }
  return clientFor(key);
}
