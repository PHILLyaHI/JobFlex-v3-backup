// WHERE A CARD-LESS TRIAL STANDS (owner, 2026-10-01).
//
// The trial that starts without a card (lib/cardlessTrial) is an ordinary
// Stripe subscription in `trialing`, with no payment method and
// trial_settings.end_behavior.missing_payment_method = "cancel". This module
// reads it back for the app: how many days are left, whether a card is on
// file, and — once the trial is over with no card — TRIAL_ENDED, in which the
// workspace requires a subscription before business pages or actions open.
//
// THE RECORD. What Stripe knows is mirrored on the Subscription row (status,
// trialEndsAt). What only this flow knows — that the trial is card-less, the
// plan and pages it was started on, when a card arrived, which reminder
// emails went out — is one SyncState row per organization,
// `cardlessTrial:<orgId>`, the app's key→string store (no schema change).
//
// Database only — no Stripe client — so the write guard in lib/orgContext
// can ask it on every server action without loading the SDK.
import { db } from "@/lib/db";
import { SubscriptionStatus } from "@/lib/prismaEnums";

export type CardlessRecord = {
  simulationPending?: boolean;
  subId: string;
  customerId: string;
  /** The plan the trial runs on: a catalog slug, or "custom". */
  planSlug: string;
  interval: "MONTH" | "YEAR";
  customPages: string[];
  mode: "live" | "test";
  startedAt: string;
  endsAt: string;
  /** Set when a card was attached during the trial (it converts on its own). */
  cardAt?: string | null;
  /** Set when the trial ended without one (webhook or the daily sweep). */
  endedAt?: string | null;
  /** Set when a card restarted the plan after the end. */
  restartedAt?: string | null;
  /** The reminder emails, once each. */
  mailedSoonAt?: string | null;
  mailedTodayAt?: string | null;
  mailedEndedAt?: string | null;
};

export const cardlessKey = (orgId: string) => `cardlessTrial:${orgId}`;

export async function readCardlessRecord(orgId: string): Promise<CardlessRecord | null> {
  const row = await db.syncState.findUnique({ where: { key: cardlessKey(orgId) } });
  if (!row) return null;
  try {
    const rec = JSON.parse(row.cursor) as CardlessRecord;
    if (!rec?.subId || !Number.isFinite(Date.parse(rec.endsAt))) throw new Error("Invalid trial record");
    return rec;
  } catch {
    throw new Error("Unable to verify trial access");
  }
}

export async function writeCardlessRecord(orgId: string, rec: CardlessRecord): Promise<void> {
  const cursor = JSON.stringify(rec);
  await db.syncState.upsert({ where: { key: cardlessKey(orgId) }, update: { cursor }, create: { key: cardlessKey(orgId), cursor } });
}

export async function patchCardlessRecord(orgId: string, patch: Partial<CardlessRecord>): Promise<CardlessRecord | null> {
  const rec = await readCardlessRecord(orgId);
  if (!rec) return null;
  const next = { ...rec, ...patch };
  await writeCardlessRecord(orgId, next);
  return next;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type CardlessTrialState =
  | { kind: "trialing"; endsAt: Date; daysLeft: number; hasCard: boolean; record: CardlessRecord }
  | { kind: "ended"; endedAt: Date; record: CardlessRecord };

/**
 * Null for every organization that is not on (or past) a card-less trial —
 * a paid signup, a converted trial, a comp, a free account. Ended when the
 * mirror says TRIAL_ENDED, or when the trial's end has passed with no card
 * on file and the webhook has not landed yet: the lock does not wait for it.
 */
export async function cardlessTrialState(orgId: string, now = new Date()): Promise<CardlessTrialState | null> {
  const rec = await readCardlessRecord(orgId);
  if (!rec || rec.restartedAt) return null;
  const sub = await db.subscription.findUnique({
    where: { organizationId: orgId },
    select: { status: true, trialEndsAt: true, externalSubId: true },
  });
  if (!sub || sub.externalSubId !== rec.subId) {
    if (sub?.status === SubscriptionStatus.ACTIVE && sub.externalSubId) return null;
    return { kind: "ended", endedAt: new Date(rec.endsAt), record: rec };
  }
  const endsAt = sub.trialEndsAt ?? new Date(rec.endsAt);
  if (sub.status === SubscriptionStatus.TRIAL_ENDED) {
    return { kind: "ended", endedAt: rec.endedAt ? new Date(rec.endedAt) : endsAt, record: rec };
  }
  if (sub.status === SubscriptionStatus.ACTIVE) return null;
  if (sub.status !== SubscriptionStatus.TRIALING) return { kind: "ended", endedAt: endsAt, record: rec };
  const hasCard = Boolean(rec.cardAt);
  if (!hasCard && endsAt.getTime() <= now.getTime()) {
    return { kind: "ended", endedAt: endsAt, record: rec };
  }
  // Whole days, rounded up — the first day reads "7 days left" — except the
  // last 24 hours, which read as the day it ends (daysLeft 0, "Ends today").
  const leftMs = endsAt.getTime() - now.getTime();
  const daysLeft = leftMs <= DAY_MS ? 0 : Math.ceil(leftMs / DAY_MS);
  return { kind: "trialing", endsAt, daysLeft, hasCard, record: rec };
}

/** The same rule for a route handler (a POST that writes for the
 *  organization): a 403 with the lock's own text, or null to go on. Route
 *  handlers are not server actions, so requireOrg cannot note them. */
export async function trialEndedResponse(orgId: string): Promise<Response | null> {
  if (!(await isTrialWriteLocked(orgId))) return null;
  const { TRIAL_ENDED_MESSAGE } = await import("@/lib/trialLock");
  return Response.json({ ok: false, error: TRIAL_ENDED_MESSAGE, trialEnded: true }, { status: 403 });
}

/** True while the organization is past a card-less trial with no card. */
export async function isTrialWriteLocked(orgId: string): Promise<boolean> {
  return (await cardlessTrialState(orgId))?.kind === "ended";
}
