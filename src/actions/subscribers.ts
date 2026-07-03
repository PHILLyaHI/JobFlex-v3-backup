"use server";
import type Stripe from "stripe";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { getStripe, isStripeEnabled } from "@/lib/sdk/stripe";

// Server-safe monthly price fallback (cents), used for MRR/plan inference when
// Stripe is unavailable (the fallback mirror path only).
const FALLBACK_MONTHLY_CENTS: Record<string, number> = {
  FREE: 0,
  STARTER: 2900,
  PROFESSIONAL: 9900,
  ENTERPRISE: 29900,
};

export interface SubscriberRow {
  /** Stripe subscription id when Stripe-sourced; local Subscription id in fallback. */
  id: string;
  source: "stripe" | "local";
  organizationId: string | null;
  /** Org name when matched, else the Stripe customer name/email, else "Unknown". */
  orgName: string;
  ownerEmail: string | null;
  customerEmail: string | null;
  plan: string;
  /** Normalized, uppercased status (ACTIVE, TRIALING, PAST_DUE, CANCELED, …). */
  status: string;
  /** Paid & current: active or trialing. */
  paid: boolean;
  /** How the JobFlex org was resolved. "id" = reliable (userId/Stripe id); "none" = unmatched. */
  matchedBy: "id" | "none";
  stripeBacked: boolean;
  externalSubId: string | null;
  stripeCustomerId: string | null;
  /** Monthly-normalized amount for this subscription, in cents. */
  amountCents: number;
  promoCode: string | null;
  influencerName: string | null;
  currentPeriodEnd: Date | null;
  createdAt: Date;
}

export interface BillingMetrics {
  mrrCents: number;
  payingCount: number;
  /** Subscriptions that owe money but haven't paid: past_due / unpaid / incomplete. */
  notPaidCount: number;
  canceledCount: number;
  perPlan: { plan: string; count: number }[];
  promoUsage: { code: string; count: number }[];
  promoTotal: number;
}

export interface SubscribersData {
  rows: SubscriberRow[];
  metrics: BillingMetrics;
  /** True when the list + metrics were sourced from a live Stripe call. */
  stripeLive: boolean;
  /** True when more Stripe subscriptions exist than were fetched (metrics are partial). */
  truncated: boolean;
}

const PAID_STATUSES = new Set(["ACTIVE", "TRIALING"]);
const NOT_PAID_STATUSES = new Set(["PAST_DUE", "UNPAID", "INCOMPLETE", "INCOMPLETE_EXPIRED"]);

/** Normalize a monthly-equivalent amount (cents) for any recurring price. */
function monthlyCentsFor(price: Stripe.Price | null | undefined, quantity: number): number {
  if (!price || !price.recurring) return 0; // one-time prices don't contribute to MRR
  const amt = price.unit_amount ?? 0;
  const count = price.recurring.interval_count ?? 1;
  const perMonth =
    price.recurring.interval === "year"
      ? amt / (12 * count)
      : price.recurring.interval === "week"
        ? (amt * 52) / (12 * count)
        : price.recurring.interval === "day"
          ? (amt * 365) / (12 * count)
          : amt / count;
  return Math.round(perMonth * quantity);
}

/** Plan label, preferring the planTier metadata stamped on the subscription at checkout. */
function planFor(sub: Stripe.Subscription): string {
  const m = sub.metadata ?? {};
  if (m.planTier) return m.planTier.toUpperCase();
  if (m.planName) return m.planName.toUpperCase();
  const price = sub.items.data[0]?.price;
  const pm = price?.metadata ?? {};
  if (pm.planName) return pm.planName.toUpperCase();
  if (pm.planSlug) return pm.planSlug.toUpperCase();
  return price?.nickname?.toUpperCase() ?? "—";
}

function expandedCustomer(sub: Stripe.Subscription): Stripe.Customer | null {
  const c = sub.customer;
  if (!c || typeof c === "string" || ("deleted" in c && c.deleted)) return null;
  return c as Stripe.Customer;
}
function customerIdOf(sub: Stripe.Subscription): string {
  return typeof sub.customer === "string" ? sub.customer : sub.customer.id;
}

/** JobFlex User id linked at checkout — subscription metadata, else customer metadata. */
function userIdOf(sub: Stripe.Subscription): string | null {
  const fromSub = sub.metadata?.userId;
  if (fromSub) return fromSub;
  return expandedCustomer(sub)?.metadata?.userId ?? null;
}

export async function getSubscribersData(): Promise<SubscribersData> {
  await requirePlatformAdmin();

  // ── Stripe-sourced path (the list IS the set of Stripe subscriptions) ──────
  if (isStripeEnabled()) {
    try {
      const stripe = getStripe();
      const subs: Stripe.Subscription[] = [];
      let startingAfter: string | undefined;
      let truncated = false;
      // Only expand the customer. Price/plan are included by default on items;
      // expanding `data.items.data.price.product` is 5 levels deep and Stripe
      // rejects expansion beyond 4 levels (that error used to be swallowed).
      const MAX_PAGES = 20; // 2000 subscriptions
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await stripe.subscriptions.list({
          status: "all",
          limit: 100,
          ...(startingAfter ? { starting_after: startingAfter } : {}),
          expand: ["data.customer"],
        });
        subs.push(...res.data);
        if (!res.has_more || res.data.length === 0) break;
        startingAfter = res.data[res.data.length - 1].id;
        if (page === MAX_PAGES - 1) truncated = true;
      }

      // Enrichment keys.
      const userIds = Array.from(new Set(subs.map(userIdOf).filter(Boolean) as string[]));
      const subIds = subs.map((s) => s.id);
      const custIds = Array.from(new Set(subs.map(customerIdOf)));

      const [users, localSubs, attributions] = await Promise.all([
        userIds.length
          ? db.user.findMany({
              where: { id: { in: userIds } },
              select: {
                id: true,
                email: true,
                name: true,
                memberships: {
                  select: { role: true, organization: { select: { id: true, name: true } } },
                },
              },
            })
          : Promise.resolve([]),
        db.subscription.findMany({
          where: { OR: [{ externalSubId: { in: subIds } }, { externalCustomerId: { in: custIds } }] },
          include: { organization: { select: { id: true, name: true, billingEmail: true } } },
        }),
        db.attribution.findMany({
          where: { stripeSubscriptionId: { in: subIds } },
          include: {
            promoCode: { select: { code: true } },
            influencer: { select: { displayName: true } },
          },
        }),
      ]);

      const userById = new Map(users.map((u) => [u.id, u]));
      const localBySubId = new Map(
        localSubs.filter((s) => s.externalSubId).map((s) => [s.externalSubId!, s]),
      );
      const localByCustomerId = new Map(
        localSubs.filter((s) => s.externalCustomerId).map((s) => [s.externalCustomerId!, s]),
      );
      const attrBySub = new Map(attributions.map((a) => [a.stripeSubscriptionId, a]));

      const rows: SubscriberRow[] = subs.map((sub) => {
        const uid = userIdOf(sub);
        const user = uid ? userById.get(uid) : undefined;
        const local = localBySubId.get(sub.id) ?? localByCustomerId.get(customerIdOf(sub));
        const cust = expandedCustomer(sub);
        const attr = attrBySub.get(sub.id);

        // Prefer the user's OWNER org, else their first org, else the local mirror's org.
        const ownerMembership =
          user?.memberships.find((m) => m.role === "OWNER") ?? user?.memberships[0];
        const org = ownerMembership?.organization ?? local?.organization ?? null;
        // "id" must reflect that an ORG was actually resolved — a user with no
        // membership (and no local mirror) leaves organizationId null.
        const matchedBy: SubscriberRow["matchedBy"] = org ? "id" : "none";

        const amountCents = sub.items.data.reduce(
          (a, item) => a + monthlyCentsFor(item.price, item.quantity ?? 1),
          0,
        );
        const status = sub.status.toUpperCase();
        const custEmail = cust?.email ?? null;

        return {
          id: sub.id,
          source: "stripe",
          organizationId: org?.id ?? null,
          orgName: org?.name ?? user?.name ?? cust?.name ?? custEmail ?? "Unknown customer",
          ownerEmail: user?.email ?? local?.organization.billingEmail ?? custEmail,
          customerEmail: custEmail,
          plan: planFor(sub),
          status,
          paid: PAID_STATUSES.has(status),
          matchedBy,
          stripeBacked: true,
          externalSubId: sub.id,
          stripeCustomerId: customerIdOf(sub),
          amountCents,
          promoCode: attr?.promoCode.code ?? null,
          influencerName: attr?.influencer.displayName ?? null,
          currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
          createdAt: new Date(sub.created * 1000),
        };
      });

      return { rows, metrics: computeMetrics(rows), stripeLive: true, truncated };
    } catch (err) {
      // Surface the reason (was previously swallowed, hiding real API errors)
      // then fall back to the local mirror so the page still renders.
      console.error("[subscribers] live Stripe fetch failed, using local mirror:", err);
    }
  }

  // ── Fallback path: local mirror (dev without Stripe, or Stripe error) ──────
  const [localSubs, attributions] = await Promise.all([
    db.subscription.findMany({
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            billingEmail: true,
            memberships: {
              where: { role: "OWNER" },
              take: 1,
              include: { user: { select: { email: true } } },
            },
          },
        },
      },
    }),
    db.attribution.findMany({
      include: {
        promoCode: { select: { code: true } },
        influencer: { select: { displayName: true } },
      },
    }),
  ]);
  const attrBySub = new Map(attributions.map((a) => [a.stripeSubscriptionId, a]));

  const rows: SubscriberRow[] = localSubs.map((s) => {
    const attr = s.externalSubId ? attrBySub.get(s.externalSubId) : undefined;
    const status = s.status.toUpperCase();
    return {
      id: s.id,
      source: "local",
      organizationId: s.organization.id,
      orgName: s.organization.name,
      ownerEmail: s.organization.memberships[0]?.user?.email ?? s.organization.billingEmail ?? null,
      customerEmail: null,
      plan: s.plan,
      status,
      paid: PAID_STATUSES.has(status),
      matchedBy: "id",
      stripeBacked: Boolean(s.externalSubId),
      externalSubId: s.externalSubId,
      stripeCustomerId: s.externalCustomerId,
      amountCents: FALLBACK_MONTHLY_CENTS[s.plan.toUpperCase()] ?? 0,
      promoCode: attr?.promoCode.code ?? null,
      influencerName: attr?.influencer.displayName ?? null,
      currentPeriodEnd: s.currentPeriodEnd,
      createdAt: s.createdAt,
    };
  });

  return { rows, metrics: computeMetrics(rows), stripeLive: false, truncated: false };
}

function computeMetrics(rows: SubscriberRow[]): BillingMetrics {
  const mrrCents = rows.filter((r) => r.paid).reduce((a, r) => a + r.amountCents, 0);
  const payingCount = rows.filter((r) => r.paid).length;
  const notPaidCount = rows.filter((r) => NOT_PAID_STATUSES.has(r.status)).length;
  const canceledCount = rows.filter((r) => r.status === "CANCELED").length;

  const perPlanMap = new Map<string, number>();
  for (const r of rows) perPlanMap.set(r.plan, (perPlanMap.get(r.plan) ?? 0) + 1);
  const perPlan = [...perPlanMap.entries()]
    .map(([plan, count]) => ({ plan, count }))
    .sort((a, b) => b.count - a.count);

  const promoMap = new Map<string, number>();
  for (const r of rows) if (r.promoCode) promoMap.set(r.promoCode, (promoMap.get(r.promoCode) ?? 0) + 1);
  const promoUsage = [...promoMap.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count);
  const promoTotal = promoUsage.reduce((a, p) => a + p.count, 0);

  return { mrrCents, payingCount, notPaidCount, canceledCount, perPlan, promoUsage, promoTotal };
}

// Live Stripe status for one subscriber's subscription — powers the row detail
// sheet's "verified through Stripe" confirmation (not assumed from the mirror).
export async function getSubscriberStripeStatus(externalSubId: string) {
  await requirePlatformAdmin();
  if (!isStripeEnabled() || !externalSubId) return null;
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(externalSubId);
  return {
    status: sub.status,
    currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    promotionCode:
      typeof sub.discount?.promotion_code === "string"
        ? sub.discount.promotion_code
        : (sub.discount?.promotion_code?.id ?? null),
    couponId: sub.discount?.coupon?.id ?? null,
  };
}
