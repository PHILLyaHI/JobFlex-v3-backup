// THE CUSTOM PLAN'S ADMIN SETTINGS.
//
// Every catalog plan carries its trial in its own PricingPlan.trialDays column.
// The custom plan has no such row on purpose — its price is computed from the
// pages a shop ticks (lib/customPlan), so a fixed priceCents row would be a lie
// on every surface that reads the catalog. Its trial therefore needs a home of
// its own, and that home is SyncState (`customPlan:trialDays`), the same
// key→string store the Stripe mode switch and the lead router use.
//
// WHY NOT A PricingPlan ROW WITH active:false. getPlanCatalog() feeds the
// signup step, /pricing and the subscription surfaces, all of which already
// draw their own custom card from lib/customPlan. A catalog row would render a
// SECOND custom card priced at the bare base, and one accidental "active"
// toggle would ship it.
//
// Read by both checkout routes (signup and subscription) so the trial the
// admin sets is the trial Stripe is told about, and by the signup plan step so
// the button label matches.

import { db } from "@/lib/db";
import { DEFAULT_CUSTOM_TRIAL_DAYS } from "@/lib/customPlan";

const TRIAL_KEY = "customPlan:trialDays";
const CACHE_MS = 10_000;
/** Stripe rejects a trial beyond this; the admin field clamps to it too. */
export const MAX_TRIAL_DAYS = 365;

let cache: { days: number; at: number } | null = null;

/** Clamp to a whole number of days Stripe will accept. */
export function normalizeTrialDays(value: unknown): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_TRIAL_DAYS, n);
}

/** The custom plan's trial length. Falls back to the default when unset or
 *  when the database is unreachable — a checkout never fails over this. */
export async function getCustomPlanTrialDays(): Promise<number> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.days;
  let days = DEFAULT_CUSTOM_TRIAL_DAYS;
  try {
    const row = await db.syncState.findUnique({ where: { key: TRIAL_KEY } });
    if (row) days = normalizeTrialDays(row.cursor);
  } catch {
    // DB unreachable — the default stands.
  }
  cache = { days, at: Date.now() };
  return days;
}

/** Write the trial length. Caller must gate with requirePlatformAdmin. */
export async function setCustomPlanTrialDays(value: unknown): Promise<number> {
  const days = normalizeTrialDays(value);
  await db.syncState.upsert({
    where: { key: TRIAL_KEY },
    update: { cursor: String(days) },
    create: { key: TRIAL_KEY, cursor: String(days) },
  });
  cache = { days, at: Date.now() };
  return days;
}
