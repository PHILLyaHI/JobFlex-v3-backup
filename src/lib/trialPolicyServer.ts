import "server-only";
// THE TRIAL'S CARD, SWITCHED BY THE OWNER (2026-10-07: "a switch in admin so
// I can turn on card needed or no card for free trials — smart, works right,
// and I don't have to worry about it").
//
// ONE ROW decides for every door at once — the landing's trial line, the
// pricing cards, the terms, the register page's plan step, the checkout
// route and the signup actions all ask trialRequiresCard() here: SyncState
// `trialPolicy` = { requiresCard, by, at }. No row yet = the deployment's
// default (lib/trialPolicy: a card up front unless TRIAL_REQUIRES_CARD=false),
// exactly as before the switch.
//
// WHAT CANNOT GO WRONG BY DESIGN:
//   · a flip reaches a signup already on its way: the actions re-check at
//     submit (requestCardlessTrial / confirmCardlessTrial answer
//     requiresCard: true and the register page moves to the card step);
//   · trials already running keep their terms — the switch is read only when
//     a new trial starts;
//   · the day's ceiling on card-less trials (lib/trialDailyCap) still applies
//     when the switch says "no card": past it, new signups take a card;
//   · the read is cached ten seconds per server instance, so the landing
//     page costs no extra round trip and a flip lands within a minute.
import { db } from "@/lib/db";
import { trialRequiresCardEnv } from "@/lib/trialPolicy";
import { cardlessStartsInLastDay, cardlessTrialsPaused, cardlessTrialsPerDay } from "@/lib/trialDailyCap";

export const TRIAL_POLICY_KEY = "trialPolicy";
const CACHE_MS = 10_000;

export interface TrialPolicy {
  /** The switch: a card at the plan step (true) or a card-less trial (false). */
  requiresCard: boolean;
  /** Where the answer came from: the owner's switch, or the deployment's default. */
  source: "admin" | "env";
  by: string | null;
  at: string | null;
  /** The deployment's own TRIAL_REQUIRES_CARD, for the admin page to show. */
  envDefault: boolean;
}

let cache: { at: number; value: TrialPolicy } | null = null;

/** The policy in force, from the row or the deployment. Never throws: a
 *  database hiccup falls back to the deployment's default for that read. */
export async function readTrialPolicy(): Promise<TrialPolicy> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.value;
  const envDefault = trialRequiresCardEnv();
  let value: TrialPolicy = { requiresCard: envDefault, source: "env", by: null, at: null, envDefault };
  try {
    const row = await db.syncState.findUnique({ where: { key: TRIAL_POLICY_KEY }, select: { cursor: true } });
    if (row?.cursor) {
      const r = JSON.parse(row.cursor) as Record<string, unknown>;
      if (typeof r.requiresCard === "boolean") {
        value = { requiresCard: r.requiresCard, source: "admin", by: typeof r.by === "string" ? r.by : null, at: typeof r.at === "string" ? r.at : null, envDefault };
      }
    }
  } catch (err) {
    console.warn("[trial-policy] read failed, using the deployment's default:", err);
    return value; // not cached: the next read tries the row again
  }
  cache = { at: now, value };
  return value;
}

/** True when signup takes a card up front. Every door asks this. */
export async function trialRequiresCard(): Promise<boolean> {
  return (await readTrialPolicy()).requiresCard;
}

/** The owner's switch. */
export async function setTrialRequiresCard(requiresCard: boolean, by: string | null): Promise<TrialPolicy> {
  const cursor = JSON.stringify({ requiresCard, by, at: new Date().toISOString() });
  await db.syncState.upsert({ where: { key: TRIAL_POLICY_KEY }, create: { key: TRIAL_POLICY_KEY, cursor }, update: { cursor } });
  cache = null;
  return readTrialPolicy();
}

/** The whole picture for the admin page: the switch, and the day's ceiling. */
export interface TrialPolicyStatus extends TrialPolicy {
  /** The ceiling on card-less trials per day, and how many started in the last 24 h. */
  perDay: number;
  startsLastDay: number;
  paused: boolean;
  /** What a signup gets right now: the switch, or the ceiling, says a card. */
  requiresCardNow: boolean;
}
export async function trialPolicyStatus(): Promise<TrialPolicyStatus> {
  const [policy, startsLastDay, paused] = await Promise.all([readTrialPolicy(), cardlessStartsInLastDay(), cardlessTrialsPaused()]);
  return { ...policy, perDay: cardlessTrialsPerDay(), startsLastDay, paused, requiresCardNow: policy.requiresCard || paused };
}
