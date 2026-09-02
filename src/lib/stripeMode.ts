// STRIPE MODE — which account the app charges against: the LIVE account or the
// TEST sandbox. One switch, flipped from /admin/integrations, so a trial run
// of the whole paid signup can be made with Stripe's test cards and then the
// switch goes back without touching a single env var.
//
// WHERE THE TRUTH LIVES. The mode is a SyncState row (`stripe:mode`) — the
// same key→string store the Lead Center's routing mode uses — because an env
// var cannot be changed from the admin panel and a module variable does not
// survive a serverless instance boundary. The row is read through a short
// in-process cache so the checkout path costs one extra query every few
// seconds, not one per request.
//
// KEYS. `.env.local` carries both: STRIPE_SECRET_KEY (live) and
// STRIPE_SECRET_KEY_TEST (sandbox). Missing one simply makes that mode
// unavailable — pickStripeKey throws the same IntegrationDisabledError the
// old single-key path did.
//
// WHAT TEST MODE CHANGES DOWNSTREAM (the checkout routes read the mode):
//   · Catalog plans are priced with inline `price_data` from the PricingPlan
//     row, NOT the PlanPrice mirror — the mirror holds LIVE price_… ids,
//     which do not exist in the sandbox. Same amounts, same trial.
//   · Stored Stripe promotion-code ids (promo_… on the live account) are not
//     auto-applied; the code field on Stripe's page still works.
//   · The live webhook endpooint never sees sandbox events, so flows that
//     need an answer verify the checkout session directly on return — the
//     signup flow already works this way in both modes.

import { db } from "@/lib/db";

export type StripeMode = "live" | "test";

const MODE_KEY = "stripe:mode";
const CACHE_MS = 10_000;

let cache: { mode: StripeMode; at: number } | null = null;

/** The mode when nothing was ever set: whatever key exists. Both present →
 *  live, which is what the app was before the switch existed. */
function defaultMode(): StripeMode {
  if (process.env.STRIPE_SECRET_KEY) return "live";
  if (process.env.STRIPE_SECRET_KEY_TEST) return "test";
  return "live";
}

export async function getStripeMode(): Promise<StripeMode> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.mode;
  let mode = defaultMode();
  try {
    const row = await db.syncState.findUnique({ where: { key: MODE_KEY } });
    if (row?.cursor === "test" || row?.cursor === "live") mode = row.cursor;
  } catch {
    // DB unreachable — the env default stands.
  }
  cache = { mode, at: Date.now() };
  return mode;
}

/** Write the switch. Caller must gate with requirePlatformAdmin. */
export async function setStripeMode(mode: StripeMode): Promise<void> {
  await db.syncState.upsert({
    where: { key: MODE_KEY },
    update: { cursor: mode },
    create: { key: MODE_KEY, cursor: mode },
  });
  cache = { mode, at: Date.now() };
}

/** The secret key for a mode, or null when that mode is not configured. */
export function stripeKeyFor(mode: StripeMode): string | null {
  return (
    (mode === "live" ? process.env.STRIPE_SECRET_KEY : process.env.STRIPE_SECRET_KEY_TEST) || null
  );
}
