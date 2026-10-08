"use server";

// THE TRIAL WATCH'S READ (2026-09-24) — platform admin only.
//
// Every company signed up in the last TRIAL_WINDOW_DAYS, with what its
// members looked at (PageView), what they made (clients, proposals sent,
// jobs, leads), their email domains, and whether another trial in the window
// was seen on the same device — scored by lib/trialWatch. When the PageView
// table is not in this database yet, the page still lists the companies and
// the signals that need no page views, and says so.

import { countedOrgs, statsHiddenIds } from "@/lib/statsHidden";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { scoreTrial, sortAssessments, TRIAL_WINDOW_DAYS, WATCH_DAYS, type TrialAssessment, type ViewIn } from "@/lib/trialWatch";
import type { CardlessRecord } from "@/lib/trialState";
import { meterSpendCents, readTrialMeters } from "@/lib/trialMeter";
import type { PaidService } from "@/lib/paidApiCosts";
import type { TrialCapKey } from "@/lib/trialCaps";
import type Stripe from "stripe";
import { getStripe, isStripeEnabled } from "@/lib/sdk/stripe";
import { CARD_EXPAND, paymentCardsFor, type PaymentCard } from "@/lib/paymentCard";
import { STRIPE_MAX_PAGES, STRIPE_PAGE_SIZE } from "@/components/v3/admin-subscribers/billing-metrics";

/** Where a company's card stands on a card-less trial (lib/cardlessTrial):
 *  null for a company that did not start one (a card-first signup). */
export type TrialCard = "none" | "on-file" | "ended" | "restarted";

/** What the trial cost us in paid APIs (lib/trialMeter): estimated cents, by
 *  service, with the request counts, and the trial ceilings used. */
export type TrialSpend = {
  cents: number;
  byService: Array<{ service: PaidService; cents: number; calls: number }>;
  uses: Partial<Record<TrialCapKey, number>>;
};

export type TrialWatchData = {
  now: string;
  windowDays: number;
  watchDays: number;
  /** False when the PageView table could not be read — not pushed to this database yet. */
  viewsAvailable: boolean;
  rows: Array<TrialAssessment & { card: TrialCard | null; spend: TrialSpend; winback: { sent: number; offerUntil: string | null } | null }>;
};

/** How each listed company's subscription pays, by organization id
 *  (lib/paymentCard). A company missing from it has nothing to show: no
 *  Stripe subscription, Stripe not read, or a subscription the read did not
 *  return (a sandbox one on a test clock is left out of every list). */
export type TrialPayments = Record<string, PaymentCard>;

/**
 * THE CARD BESIDE EACH TRIAL (owner, 2026-10-07), off ONE subscriptions.list —
 * the subscriptions created since the window opened, with a day of slack
 * (Checkout makes the subscription before the account exists) — read with the
 * same client as /admin/subscribers. The page streams it: the table renders
 * from the database first and the cards follow when Stripe answers, so a slow
 * Stripe never holds the watch back.
 */
export async function getTrialPayments(orgIds: string[]): Promise<TrialPayments> {
  await requirePlatformAdmin();
  const out: TrialPayments = {};
  if (!orgIds.length || !isStripeEnabled()) return out;
  const since = new Date(Date.now() - TRIAL_WINDOW_DAYS * 86_400_000);
  try {
    const billed = await db.subscription.findMany({
      where: { organizationId: { in: orgIds }, provider: "STRIPE", externalSubId: { not: null } },
      select: { organizationId: true, externalSubId: true, externalCustomerId: true },
    });
    if (!billed.length) return out;
    const stripe = getStripe();
    const subs: Stripe.Subscription[] = [];
    let startingAfter: string | undefined;
    for (let page = 0; page < STRIPE_MAX_PAGES; page++) {
      const res = await stripe.subscriptions.list({
        status: "all",
        limit: STRIPE_PAGE_SIZE,
        created: { gte: Math.floor(since.getTime() / 1000) - 86_400 },
        ...(startingAfter ? { starting_after: startingAfter } : {}),
        expand: [...CARD_EXPAND],
      });
      subs.push(...res.data);
      if (!res.has_more || res.data.length === 0) break;
      startingAfter = res.data[res.data.length - 1].id;
    }
    const byId = new Map(subs.map((sub) => [sub.id, sub]));
    // Stripe lists newest first, so the first one seen is the customer's latest.
    const byCustomer = new Map<string, Stripe.Subscription>();
    for (const sub of subs) {
      const cid = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      if (!byCustomer.has(cid)) byCustomer.set(cid, sub);
    }
    const subOf = new Map<string, Stripe.Subscription>();
    for (const b of billed) {
      const hit = byId.get(b.externalSubId!) ?? (b.externalCustomerId ? byCustomer.get(b.externalCustomerId) : undefined);
      if (hit) subOf.set(b.organizationId, hit);
    }
    const { cards } = await paymentCardsFor(stripe, [...new Set(subOf.values())]);
    for (const [orgId, sub] of subOf) {
      const card = cards.get(sub.id);
      if (card) out[orgId] = card;
    }
    return out;
  } catch (err) {
    console.error("[trial-watch] Stripe card read failed:", err);
    return {};
  }
}

const countBy = (rows: Array<{ organizationId: string; _count: { _all: number } }>) => new Map(rows.map((r) => [r.organizationId, r._count._all]));

export async function getTrialWatch(): Promise<TrialWatchData> {
  await requirePlatformAdmin();
  const since = new Date(Date.now() - TRIAL_WINDOW_DAYS * 86_400_000);
  const orgs = await db.organization.findMany({
    where: { createdAt: { gte: since }, ...countedOrgs(await statsHiddenIds()) },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      name: true,
      createdAt: true,
      subscription: { select: { plan: true, status: true, trialEndsAt: true } },
      memberships: { select: { role: true, user: { select: { email: true } } } },
    },
  });
  const ids = orgs.map((o) => o.id);
  if (!ids.length) return { now: new Date().toISOString(), windowDays: TRIAL_WINDOW_DAYS, watchDays: WATCH_DAYS, viewsAvailable: true, rows: [] };
  const inOrgs = { organizationId: { in: ids } };
  const [clients, proposals, sent, jobs, leads] = await Promise.all([
    db.client.groupBy({ by: ["organizationId"], where: inOrgs, _count: { _all: true } }),
    db.proposal.groupBy({ by: ["organizationId"], where: inOrgs, _count: { _all: true } }),
    db.proposal.groupBy({ by: ["organizationId"], where: { ...inOrgs, sentAt: { not: null } }, _count: { _all: true } }),
    db.job.groupBy({ by: ["organizationId"], where: inOrgs, _count: { _all: true } }),
    db.lead.groupBy({ by: ["organizationId"], where: inOrgs, _count: { _all: true } }).catch(() => [] as Array<{ organizationId: string; _count: { _all: number } }>),
  ]);
  const c = countBy(clients), p = countBy(proposals), s = countBy(sent), j = countBy(jobs), l = countBy(leads);
  // The card-less trials' own records (SyncState cardlessTrial:<orgId>): which
  // of these companies started with no card, and whether one has arrived.
  const cardRows = await db.syncState
    .findMany({ where: { key: { in: ids.map((id) => `cardlessTrial:${id}`) } }, select: { key: true, cursor: true } })
    .catch(() => [] as Array<{ key: string; cursor: string }>);
  const cardOf = new Map<string, TrialCard>();
  for (const r of cardRows) {
    try {
      const rec = JSON.parse(r.cursor) as CardlessRecord;
      cardOf.set(r.key.slice("cardlessTrial:".length), rec.restartedAt ? "restarted" : rec.cardAt ? "on-file" : rec.endedAt ? "ended" : "none");
    } catch {
      /* a malformed record reads as no record */
    }
  }

  let viewsAvailable = true;
  const viewsByOrg = new Map<string, ViewIn[]>();
  const orgsByDevice = new Map<string, Set<string>>();
  try {
    const views = await db.pageView.findMany({
      where: inOrgs,
      orderBy: { at: "asc" },
      take: 40_000,
      select: { organizationId: true, userId: true, route: true, at: true, ipHash: true, uaHash: true },
    });
    for (const v of views) {
      viewsByOrg.set(v.organizationId, [...(viewsByOrg.get(v.organizationId) ?? []), { route: v.route, at: v.at.toISOString(), userId: v.userId, ipHash: v.ipHash, uaHash: v.uaHash }]);
      if (v.ipHash && v.uaHash) {
        const key = `${v.uaHash}|${v.ipHash}`;
        orgsByDevice.set(key, (orgsByDevice.get(key) ?? new Set()).add(v.organizationId));
      }
    }
  } catch {
    viewsAvailable = false;
  }

  const rows = orgs.map((o) => {
    const views = viewsByOrg.get(o.id) ?? [];
    const others = new Set<string>();
    for (const v of views) if (v.ipHash && v.uaHash) for (const id of orgsByDevice.get(`${v.uaHash}|${v.ipHash}`) ?? []) if (id !== o.id) others.add(id);
    const owner = o.memberships.find((m) => m.role === "OWNER")?.user.email ?? o.memberships[0]?.user.email ?? null;
    return scoreTrial({
      id: o.id,
      name: o.name,
      createdAt: o.createdAt.toISOString(),
      plan: o.subscription?.plan ?? "FREE",
      status: o.subscription?.status ?? "FREE",
      trialEndsAt: o.subscription?.trialEndsAt?.toISOString() ?? null,
      ownerEmail: owner,
      emails: o.memberships.map((m) => m.user.email).filter((e): e is string => !!e),
      views,
      records: { clients: c.get(o.id) ?? 0, proposals: p.get(o.id) ?? 0, sent: s.get(o.id) ?? 0, jobs: j.get(o.id) ?? 0, leads: l.get(o.id) ?? 0 },
      sharedDeviceTrials: others.size,
    });
  });
  const withCard = sortAssessments(rows).map((r) => {
    const card = cardOf.get(r.id) ?? null;
    // A trial past its end with no card reads "ended" before the sweep stamps it.
    const org = orgs.find((o) => o.id === r.id);
    const lapsed = card === "none" && (org?.subscription?.status === "TRIAL_ENDED" || (org?.subscription?.trialEndsAt && org.subscription.trialEndsAt.getTime() < Date.now()));
    return { ...r, card: lapsed ? ("ended" as const) : card };
  });
  // Paid API spend during the trial (lib/trialMeter: recorded only while an
  // organization is TRIALING, priced by lib/paidApiCosts).
  const meters = await readTrialMeters(ids);
  // The win-back (lib/trialWinback): how many mails an ended trial has had, and the 10% offer's last day.
  const { readWinbacks } = await import("@/lib/trialWinback");
  const winbacks = await readWinbacks(ids).catch(() => new Map());
  const rowsOut = withCard.map((r) => {
    const m = meters.get(r.id);
    const wb = winbacks.get(r.id);
    const winback = wb ? { sent: Object.values(wb.sent).filter((v) => typeof v === "string" && !v.startsWith("skipped:")).length, offerUntil: wb.offerUntil ?? null } : null;
    const byService = m
      ? (Object.keys(m.spend) as PaidService[])
          .map((service) => ({ service, cents: m.spend[service] ?? 0, calls: m.calls[service] ?? 0 }))
          .sort((a, b) => b.cents - a.cents)
      : [];
    return { ...r, spend: { cents: meterSpendCents(m), byService, uses: m?.uses ?? {} }, winback };
  });
  return { now: new Date().toISOString(), windowDays: TRIAL_WINDOW_DAYS, watchDays: WATCH_DAYS, viewsAvailable, rows: rowsOut };
}
