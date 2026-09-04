"use server";
import type Stripe from "stripe";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { getStripe, isStripeEnabled } from "@/lib/sdk/stripe";
import { getMonthlyCentsBySlugUpper } from "@/lib/planCatalogServer";
import {
  computeMetrics,
  modalValue,
  PAID_STATUSES,
  STRIPE_MAX_PAGES,
  STRIPE_PAGE_SIZE,
  type BillingFacts,
  type BillingMetrics,
  type ChangeKind,
  type MatchedBy,
  type MrrExclusion,
  type PricedBy,
} from "@/components/v3/admin-subscribers/billing-metrics";

// The MRR rule itself lives in that module — see its header. This file only
// establishes the FACTS each rule reads: which organization a subscription
// belongs to, what it bills a month, in what currency, and when it last moved.
// No price is ever invented here: a plan whose amount no source can name
// contributes 0 and is counted, not guessed at.

export interface SubscriberRow extends BillingFacts {
  /** Stripe subscription id when Stripe-sourced; the Subscription row id otherwise. */
  id: string;
  source: "stripe" | "record";
  organizationId: string | null;
  /** Org name when linked, else the Stripe customer's name/email. */
  orgName: string;
  ownerEmail: string | null;
  customerEmail: string | null;
  /** "STRIPE" | "MANUAL". */
  provider: string;
  stripeBacked: boolean;
  externalSubId: string | null;
  stripeCustomerId: string | null;
  influencerName: string | null;
  currentPeriodEnd: Date | null;
  createdAt: Date;
  /** The newest timestamp the source actually reports — never a synthesised now(). */
  changedAt: Date;
  /** What that timestamp IS, so no creation date reads as a change. */
  changeKind: ChangeKind;
}

export interface SubscribersData {
  rows: SubscriberRow[];
  metrics: BillingMetrics;
  /** STRIPE_SECRET_KEY is set. */
  stripeEnabled: boolean;
  /** The rows + metrics came from a live Stripe call. */
  stripeLive: boolean;
  /** Set only when Stripe IS configured and the live call failed. */
  stripeError: string | null;
  /** More Stripe subscriptions exist than were fetched — the metrics are partial. */
  truncated: boolean;
}

/** One organization, however it was reached. */
interface OrgInfo {
  id: string;
  name: string;
  billingEmail: string | null;
  ownerEmail: string | null;
}


/** Owner email + billing email for a row's "who is this" line. */
const ORG_FIELDS = {
  id: true,
  name: true,
  billingEmail: true,
  memberships: {
    where: { role: "OWNER" },
    orderBy: { createdAt: "asc" },
    take: 1,
    select: { user: { select: { email: true } } },
  },
} as const;

type OrgShape = {
  id: string;
  name: string;
  billingEmail: string | null;
  memberships: { user: { email: string } | null }[];
};

function orgInfo(o: OrgShape): OrgInfo {
  return {
    id: o.id,
    name: o.name,
    billingEmail: o.billingEmail,
    ownerEmail: o.memberships[0]?.user?.email ?? null,
  };
}

/**
 * Index rows by a Stripe id, DROPPING any id two rows share. Neither
 * `externalSubId` nor `externalCustomerId` is @unique in the schema while
 * `organizationId` is — so a shared id means two organizations claim the same
 * Stripe object. Keeping whichever row came back last is how a paid plan lands
 * on the wrong org; an ambiguous id resolves to nobody instead.
 */
function uniqueBy<T>(rows: readonly T[], key: (r: T) => string | null): Map<string, T> {
  const map = new Map<string, T>();
  const shared = new Set<string>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    if (map.has(k)) shared.add(k);
    else map.set(k, r);
  }
  for (const k of shared) map.delete(k);
  return map;
}

/** Normalize a monthly-equivalent amount (cents) for any recurring Stripe price. */
function monthlyCentsFor(price: Stripe.Price | null | undefined, quantity: number): number {
  if (!price || !price.recurring) return 0; // one-time prices don't recur
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

/** A PlanPrice ledger row, normalised to one month. */
function monthlyCentsFromPlanPrice(unitAmountCents: number, interval: string): number {
  return interval.toUpperCase() === "YEAR"
    ? Math.round(unitAmountCents / 12)
    : unitAmountCents;
}

/**
 * The coupon that keeps reducing the run rate. A subscription discount
 * overrides a customer-wide one (Stripe's own precedence); a `once` coupon
 * reduces a single invoice, not recurring revenue; a repeating coupon whose
 * run has ended reduces nothing.
 */
function standingDiscount(
  sub: Stripe.Subscription,
  cust: Stripe.Customer | null,
): Stripe.Discount | null {
  const d = sub.discount ?? cust?.discount ?? null;
  if (!d?.coupon) return null;
  if (d.coupon.duration === "once") return null;
  if (d.end && d.end * 1000 <= Date.now()) return null;
  return d;
}

/**
 * A coupon narrowed by `applies_to.products` reduces only the items carrying
 * those products, but nothing here knows which item is which product (the
 * product is two expansion levels past what Stripe will return in one call).
 * The coupon is still taken off the whole subscription — the pre-existing
 * behaviour, so the total does not move — and the row is counted as understated
 * rather than left looking exact.
 */
function isProductRestricted(d: Stripe.Discount | null): boolean {
  const products = d?.coupon?.applies_to?.products;
  return Array.isArray(products) && products.length > 0;
}

function afterDiscount(cents: number, currency: string, d: Stripe.Discount | null): number {
  const c = d?.coupon;
  if (!c) return cents;
  if (c.percent_off) return Math.round(cents * (1 - c.percent_off / 100));
  // A fixed coupon is denominated in its own currency — subtracting euros
  // from dollars would be worse than reporting the undiscounted amount.
  if (c.amount_off && (!c.currency || c.currency.toLowerCase() === currency)) {
    return Math.max(0, cents - c.amount_off);
  }
  return cents;
}

/**
 * The newest timestamp Stripe reports, and which one it is.
 *
 * `canceled_at` is NOT the moment a subscription ended. Stripe stamps it when
 * a cancellation is BOOKED, so a trialing subscription with
 * `cancel_at_period_end: true` carries it while still running and still
 * billing — reading it as "canceled" printed CANCELED beside a live TRIALING
 * badge. A subscription is over only when `ended_at` is set or the status
 * itself says `canceled`; the booking is a real event with its own wording.
 */
function lastEventOf(sub: Stripe.Subscription): { at: Date; kind: ChangeKind } {
  const ended = sub.ended_at ?? 0;
  const canceled = sub.canceled_at ?? 0;
  const over = Boolean(ended) || sub.status === "canceled";
  if (ended && ended >= canceled && ended >= sub.created) {
    return { at: new Date(ended * 1000), kind: "ended" };
  }
  if (canceled && canceled >= sub.created) {
    return { at: new Date(canceled * 1000), kind: over ? "canceled" : "cancel-scheduled" };
  }
  return { at: new Date(sub.created * 1000), kind: "created" };
}

/**
 * Plan label. The PlanPrice ledger comes first: it is what every write path
 * (the webhooks, the reconcile cron, the admin sync) names a plan by, so the
 * badge here must say the same thing — a subscription on an older Stripe price
 * otherwise read as one plan in this list and another in its stored row. Only
 * a price the ledger has never seen falls through to the checkout metadata.
 */
function planFor(sub: Stripe.Subscription, slugByPrice: ReadonlyMap<string, string>): string {
  const priceId = sub.items.data[0]?.price?.id;
  const ledgerSlug = priceId ? slugByPrice.get(priceId) : undefined;
  if (ledgerSlug) return ledgerSlug;
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

/** A metadata key off the subscription, falling back to its expanded customer. */
function metaOf(sub: Stripe.Subscription, key: string): string | null {
  return sub.metadata?.[key] || expandedCustomer(sub)?.metadata?.[key] || null;
}

/** The one deterministic membership: an OWNER seat, else the oldest seat. */
function pickMembership<T extends { role: string }>(memberships: T[]): T | undefined {
  return memberships.find((m) => m.role === "OWNER") ?? memberships[0];
}

export async function getSubscribersData(): Promise<SubscribersData> {
  await requirePlatformAdmin();
  const stripeEnabled = isStripeEnabled();

  if (stripeEnabled) {
    try {
      return await fromStripe();
    } catch (err) {
      // Configured but unreachable is NOT the same as not configured, and the
      // page says which. Fall through to the platform's own record so the
      // list still renders.
      const message = err instanceof Error ? err.message : String(err);
      console.error("[subscribers] live Stripe fetch failed, using the platform record:", err);
      return await fromRecord(true, message.slice(0, 300));
    }
  }
  return await fromRecord(false, null);
}

// ── Stripe-sourced: the list IS the set of Stripe subscriptions ────────────

async function fromStripe(): Promise<SubscribersData> {
  const stripe = getStripe();
  const subs: Stripe.Subscription[] = [];
  let startingAfter: string | undefined;
  let truncated = false;
  // Only expand the customer. Price/plan are included by default on items;
  // expanding `data.items.data.price.product` is 5 levels deep and Stripe
  // rejects expansion beyond 4.
  for (let page = 0; page < STRIPE_MAX_PAGES; page++) {
    const res = await stripe.subscriptions.list({
      status: "all",
      limit: STRIPE_PAGE_SIZE,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
      expand: ["data.customer"],
    });
    subs.push(...res.data);
    if (!res.has_more || res.data.length === 0) break;
    startingAfter = res.data[res.data.length - 1].id;
    if (page === STRIPE_MAX_PAGES - 1) truncated = true;
  }

  // Link keys, in the order they are trusted.
  const metaOrgIds = new Set<string>();
  const metaUserIds = new Set<string>();
  const subIds: string[] = [];
  for (const sub of subs) {
    const o = metaOf(sub, "organizationId");
    if (o) metaOrgIds.add(o);
    const u = metaOf(sub, "userId");
    if (u) metaUserIds.add(u);
    subIds.push(sub.id);
  }

  const [accountCurrency, orgs, users, records, attributions] = await Promise.all([
    accountDefaultCurrency(stripe),
    metaOrgIds.size
      ? db.organization.findMany({ where: { id: { in: [...metaOrgIds] } }, select: ORG_FIELDS })
      : Promise.resolve([]),
    metaUserIds.size
      ? db.user.findMany({
          where: { id: { in: [...metaUserIds] } },
          select: {
            id: true,
            memberships: {
              // Deterministic: the same membership every time this runs.
              orderBy: [{ createdAt: "asc" }, { organizationId: "asc" }],
              select: { role: true, organization: { select: ORG_FIELDS } },
            },
          },
        })
      : Promise.resolve([]),
    // Every record row, not just the ones Stripe can be matched to: the
    // admin grants among them have no Stripe subscription by definition, and
    // leaving them out is what let this page and /admin/users disagree about
    // who is on a plan.
    db.subscription.findMany({ include: { organization: { select: ORG_FIELDS } } }),
    db.attribution.findMany({
      where: { stripeSubscriptionId: { in: subIds } },
      include: {
        promoCode: { select: { code: true } },
        influencer: { select: { displayName: true } },
      },
    }),
  ]);

  const orgById = new Map(orgs.map((o) => [o.id, orgInfo(o)]));
  const userById = new Map(users.map((u) => [u.id, u]));
  // Neither externalSubId nor externalCustomerId is @unique in the schema, so
  // two record rows can hold the same Stripe id. A plain Map would keep
  // whichever Prisma returned last and hand this subscription to a coin-flip
  // organization; an ambiguous key resolves to nobody instead.
  const recordBySubId = uniqueBy(records, (r) => r.externalSubId);
  const recordByCustId = uniqueBy(records, (r) => r.externalCustomerId);
  const attrBySub = new Map(attributions.map((a) => [a.stripeSubscriptionId, a]));
  // Small table, read whole: the ledger names a plan for any price it knows,
  // archived rows included — an old price that still bills is still that plan.
  const ledger = await db.planPrice.findMany({ select: { stripePriceId: true, planSlug: true } });
  const slugByPrice = new Map(ledger.map((p) => [p.stripePriceId, p.planSlug.toUpperCase()]));

  // The account's own currency decides what the total is denominated in. A
  // restricted key may not read the account; the commonest currency on the
  // subscriptions themselves answers instead.
  const primaryCurrency =
    accountCurrency ?? modalValue(subs.map((s) => s.currency ?? "")) ?? "usd";

  const rows: SubscriberRow[] = subs.map((sub) => {
    const cust = expandedCustomer(sub);
    const custEmail = cust?.email ?? null;
    const attr = attrBySub.get(sub.id);

    // ── the link, most direct first ──────────────────────────────────
    // 1. organizationId, stamped on the subscription at checkout
    //    (src/app/api/checkout/subscription/route.ts).
    // 2. the platform's own Subscription row, keyed by the Stripe ids.
    // 3. metadata.userId — legacy; this deployment has never written it.
    // Never by name or email.
    let org: OrgInfo | null = null;
    let matchedBy: MatchedBy = "none";
    // Did Stripe name ANYONE? "named an id this database can't resolve" and
    // "named nobody" are different failures and the operator has to tell them
    // apart — one is a data-migration problem, the other is a checkout that
    // never stamped its metadata.
    const metaOrgId = metaOf(sub, "organizationId");
    const metaUserId = metaOf(sub, "userId");

    if (metaOrgId) {
      const hit = orgById.get(metaOrgId);
      if (hit) {
        org = hit;
        matchedBy = "stripe-org";
      }
    }
    if (!org) {
      const record = recordBySubId.get(sub.id) ?? recordByCustId.get(customerIdOf(sub));
      if (record) {
        org = orgInfo(record.organization);
        matchedBy = "record";
      }
    }
    if (!org) {
      const user = metaUserId ? userById.get(metaUserId) : undefined;
      const membership = user ? pickMembership(user.memberships) : undefined;
      if (membership) {
        org = orgInfo(membership.organization);
        matchedBy = "stripe-user";
      }
    }
    if (!org && (metaOrgId || metaUserId)) matchedBy = "stale-id";

    // ── the amount ────────────────────────────────────────────────────
    const currency = (sub.currency || primaryCurrency).toLowerCase();
    // Only recurring items belong in a run rate. Of those, one that prices at
    // null (metered, tiered) contributes nothing it can name — the subscription
    // is then priced from the REST, which is a floor, and the row says so
    // instead of reading as an exact figure.
    const recurringItems = sub.items.data.filter((i) => i.price?.recurring);
    const priceable = recurringItems.filter((i) => i.price?.unit_amount != null);
    const gross = priceable.reduce((a, i) => a + monthlyCentsFor(i.price, i.quantity ?? 1), 0);
    const discount = standingDiscount(sub, cust);
    const amountCents = afterDiscount(gross, currency, discount);
    const pricedBy: PricedBy =
      priceable.length === 0
        ? "none"
        : priceable.length < recurringItems.length
          ? "stripe-partial"
          : "stripe";

    // ── the rule ──────────────────────────────────────────────────────
    const status = sub.status.toUpperCase();
    const paused = Boolean(sub.pause_collection);
    const mrrExcludedFor: MrrExclusion =
      status !== "ACTIVE"
        ? "status"
        : paused
          ? "paused"
          : currency !== primaryCurrency
            ? "currency"
            : null;

    const event = lastEventOf(sub);

    return {
      id: sub.id,
      source: "stripe",
      organizationId: org?.id ?? null,
      orgName: org?.name ?? cust?.name ?? custEmail ?? "Unknown customer",
      ownerEmail: org?.ownerEmail ?? org?.billingEmail ?? custEmail,
      customerEmail: custEmail,
      plan: planFor(sub, slugByPrice),
      status,
      paid: PAID_STATUSES.has(status) && !paused,
      paused,
      comped: false, // a Stripe subscription is an invoice, never a grant
      stripeConfirmed: true,
      restrictedDiscount: isProductRestricted(discount),
      countsTowardMrr: mrrExcludedFor === null,
      mrrExcludedFor,
      matchedBy,
      pricedBy,
      provider: "STRIPE",
      stripeBacked: true,
      externalSubId: sub.id,
      stripeCustomerId: customerIdOf(sub),
      amountCents,
      currency,
      promoCode: attr?.promoCode.code ?? null,
      influencerName: attr?.influencer.displayName ?? null,
      currentPeriodEnd: sub.current_period_end
        ? new Date(sub.current_period_end * 1000)
        : null,
      createdAt: new Date(sub.created * 1000),
      changedAt: event.at,
      changeKind: event.kind,
    };
  });

  // ── the platform's own rows, reconciled against what Stripe returned ──
  //
  // A MIRROR row survives unless the Stripe read already returned the very
  // subscription it mirrors. A HAND GRANT always survives — see the hand-grant
  // rule in billing-metrics.ts. Two kinds of row reach the list this way and
  // both used to vanish:
  //   · an admin grant (provider MANUAL). It was dropped whenever it carried
  //     the id of a subscription Stripe returned — which is exactly the
  //     churn-then-comp case: the org checked out, canceled, and was comped on
  //     top of the row that still named the canceled `sub_…`. The limits engine
  //     goes on obeying the grant, so dropping it made this page contradict
  //     both the product and /admin/users;
  //   · a provider "STRIPE" row whose subscription the account did not return
  //     (key rotation, a deleted subscription). It vanished here while
  //     /admin/users still showed it — the disagreement this read model exists
  //     to end.
  // Neither is ever added to MRR: a grant is not an invoice, and an
  // unconfirmed row is money the account we just read did not confirm.
  const returnedSubIds = new Set(rows.map((r) => r.externalSubId).filter(Boolean) as string[]);
  for (const r of records) {
    const comped = r.provider === "MANUAL";
    if (!comped && r.externalSubId && returnedSubIds.has(r.externalSubId)) continue;
    const org = orgInfo(r.organization);
    const status = r.status.toUpperCase();
    const attr = r.externalSubId ? attrBySub.get(r.externalSubId) : undefined;
    rows.push({
      id: r.id,
      source: "record",
      organizationId: org.id,
      orgName: org.name,
      ownerEmail: org.ownerEmail ?? org.billingEmail,
      customerEmail: null,
      plan: r.plan,
      status,
      // Stripe is the source on this path and it did not bill for this row.
      paid: false,
      paused: false,
      comped,
      // Stripe was read. It confirmed this row only if it returned the very
      // subscription the row names — and a grant mirrors no subscription, so
      // it is not something Stripe can confirm or deny at all, whether or not
      // it still carries an id from before it was granted.
      stripeConfirmed: comped ? null : false,
      restrictedDiscount: false,
      countsTowardMrr: false,
      mrrExcludedFor: status !== "ACTIVE" ? "status" : comped ? "comped" : "unconfirmed",
      matchedBy: "record",
      pricedBy: "none",
      provider: r.provider,
      // A grant mirrors no subscription, even when an older write left an id on it.
      stripeBacked: !comped && Boolean(r.externalSubId),
      externalSubId: r.externalSubId,
      stripeCustomerId: r.externalCustomerId,
      amountCents: 0,
      currency: primaryCurrency,
      promoCode: attr?.promoCode.code ?? null,
      influencerName: attr?.influencer.displayName ?? null,
      currentPeriodEnd: r.currentPeriodEnd,
      createdAt: r.createdAt,
      changedAt: r.updatedAt,
      changeKind: "updated",
    });
  }

  return {
    rows,
    metrics: computeMetrics(rows, primaryCurrency),
    stripeEnabled: true,
    stripeLive: true,
    stripeError: null,
    truncated,
  };
}

/**
 * The account's own currency, or null when the key may not read the account
 * (a restricted key often cannot) — the commonest currency on the
 * subscriptions then answers instead. Memoised: an account's currency does
 * not change, and three admin pages each ask on every render.
 */
let currencyMemo: { at: number; value: string | null } | null = null;
const CURRENCY_TTL_MS = 10 * 60 * 1000;

async function accountDefaultCurrency(stripe: Stripe): Promise<string | null> {
  if (currencyMemo && Date.now() - currencyMemo.at < CURRENCY_TTL_MS) return currencyMemo.value;
  let value: string | null = null;
  try {
    const account = await stripe.accounts.retrieve();
    value = account.default_currency?.toLowerCase() ?? null;
  } catch {
    value = null;
  }
  currencyMemo = { at: Date.now(), value };
  return value;
}

// ── The platform's own record: dev without Stripe, or Stripe unreachable ───

async function fromRecord(
  stripeEnabled: boolean,
  stripeError: string | null,
): Promise<SubscribersData> {
  const records = await db.subscription.findMany({
    include: { organization: { select: ORG_FIELDS } },
  });
  const priceIds = [
    ...new Set(records.map((r) => r.stripePriceId).filter(Boolean) as string[]),
  ];

  const [attributions, planPrices, catalogCents] = await Promise.all([
    db.attribution.findMany({
      include: {
        promoCode: { select: { code: true } },
        influencer: { select: { displayName: true } },
      },
    }),
    priceIds.length
      ? db.planPrice.findMany({
          where: { stripePriceId: { in: priceIds } },
          select: { stripePriceId: true, unitAmountCents: true, interval: true, currency: true },
        })
      : Promise.resolve([]),
    getMonthlyCentsBySlugUpper(),
  ]);

  const attrBySub = new Map(attributions.map((a) => [a.stripeSubscriptionId, a]));
  const priceById = new Map(planPrices.map((p) => [p.stripePriceId, p]));
  const primaryCurrency = modalValue(planPrices.map((p) => p.currency)) ?? "usd";

  const rows: SubscriberRow[] = records.map((r) => {
    const org = orgInfo(r.organization);
    const attr = r.externalSubId ? attrBySub.get(r.externalSubId) : undefined;
    const status = r.status.toUpperCase();
    const comped = r.provider === "MANUAL";

    // The price the subscription actually carries, normalised to a month.
    // Only when there is no price link does the catalog's list price stand in
    // — and then the row says so, because a yearly plan priced from the
    // monthly catalog would overstate by a fifth.
    let amountCents = 0;
    let pricedBy: PricedBy = "none";
    let currency = primaryCurrency;
    const priceRow = r.stripePriceId ? priceById.get(r.stripePriceId) : undefined;
    if (priceRow) {
      amountCents = monthlyCentsFromPlanPrice(priceRow.unitAmountCents, priceRow.interval);
      currency = priceRow.currency.toLowerCase();
      pricedBy = "price-row";
    } else {
      const key = r.plan.toUpperCase();
      if (Object.prototype.hasOwnProperty.call(catalogCents, key)) {
        amountCents = catalogCents[key];
        pricedBy = "catalog";
      }
    }
    // A comp bills nothing, whatever the plan lists at.
    if (comped) {
      amountCents = 0;
      pricedBy = "none";
    }

    const mrrExcludedFor: MrrExclusion =
      status !== "ACTIVE"
        ? "status"
        : comped
          ? "comped"
          : currency !== primaryCurrency
            ? "currency"
            : null;

    return {
      id: r.id,
      source: "record",
      organizationId: org.id,
      orgName: org.name,
      ownerEmail: org.ownerEmail ?? org.billingEmail,
      customerEmail: null,
      plan: r.plan,
      status,
      paid: PAID_STATUSES.has(status) && !comped,
      paused: false, // the record has no pause column; only Stripe knows
      comped,
      // Stripe was never read on this path, so nothing here confirms or
      // denies the row — that is not the same as Stripe denying it.
      stripeConfirmed: null,
      restrictedDiscount: false, // the record stores no coupon terms
      countsTowardMrr: mrrExcludedFor === null,
      mrrExcludedFor,
      matchedBy: "record",
      pricedBy,
      provider: r.provider,
      // A grant mirrors no subscription, even when an older write left an id on it.
      stripeBacked: !comped && Boolean(r.externalSubId),
      externalSubId: r.externalSubId,
      stripeCustomerId: r.externalCustomerId,
      amountCents,
      currency,
      promoCode: attr?.promoCode.code ?? null,
      influencerName: attr?.influencer.displayName ?? null,
      currentPeriodEnd: r.currentPeriodEnd,
      createdAt: r.createdAt,
      changedAt: r.updatedAt,
      changeKind: "updated",
    };
  });

  return {
    rows,
    metrics: computeMetrics(rows, primaryCurrency),
    stripeEnabled,
    stripeLive: false,
    stripeError,
    truncated: false,
  };
}

// Live Stripe status for one subscriber's subscription — powers the row detail
// sheet's "verified through Stripe" confirmation (not assumed from the record).
// `found: false` is its own answer: Stripe replied and holds no such
// subscription, which is not the same as Stripe failing to reply.
export type SubscriberStripeStatus =
  | { found: false }
  | {
      found: true;
      status: string;
      paused: boolean;
      currentPeriodEnd: string | null;
      cancelAtPeriodEnd: boolean;
      promotionCode: string | null;
      couponId: string | null;
    };

export async function getSubscriberStripeStatus(
  externalSubId: string,
): Promise<SubscriberStripeStatus | null> {
  await requirePlatformAdmin();
  if (!isStripeEnabled() || !externalSubId) return null;
  const stripe = getStripe();
  let sub: Stripe.Subscription;
  try {
    sub = await stripe.subscriptions.retrieve(externalSubId);
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "resource_missing") return { found: false };
    throw err;
  }
  return {
    found: true,
    status: sub.status,
    paused: Boolean(sub.pause_collection),
    currentPeriodEnd: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    promotionCode:
      typeof sub.discount?.promotion_code === "string"
        ? sub.discount.promotion_code
        : (sub.discount?.promotion_code?.id ?? null),
    couponId: sub.discount?.coupon?.id ?? null,
  };
}
