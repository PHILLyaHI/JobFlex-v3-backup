// BILLING — the MRR rule, written once.
//
// It lives here rather than in src/actions/subscribers.ts for one reason: a
// "use server" module may export nothing but async functions, so a pure
// function cannot live there — and /admin/subscribers has to recompute the
// strip over the FILTERED rows without a second copy of the rule. The server
// read model imports it; so does the table that renders the result.
//
// Nothing in this file reads a clock, a database or Stripe. It is arithmetic
// over facts the caller already established.

/* ── THE MRR RULE — one definition, one place ──────────────────────────────
   Monthly recurring revenue is the recurring amount currently being earned:
     · ACTIVE only. A trial bills nothing until it converts; past_due, unpaid,
       incomplete and canceled are not revenue being earned.
     · Not paused. `pause_collection` leaves a subscription ACTIVE in Stripe
       and collects nothing, so Stripe leaves it out of MRR too.
     · Not an admin grant. provider MANUAL is a comp — a plan someone was
       given, never an invoice.
     · One currency. Amounts in anything but the account's primary currency
       are reported beside the total, never added into it.
     · A subscription set to cancel at period end still counts while it is
       active — the money is still being earned this period. Stripe stamps
       `canceled_at` when that cancellation is SCHEDULED, so that field alone
       never means a subscription is over; `ended_at` / status `canceled` do.
     · Only what the account we just read confirms. A platform record row Stripe
       did not return is listed, never added — "unconfirmed" says so.
     · Recurring prices only, normalised to one month, times quantity, less a
       standing coupon (a `once` coupon reduces one invoice, not the run rate).
   Everything on screen that says "MRR" comes from computeMetrics(). Nothing
   else may re-derive it. */

/**
 * How a subscription was tied to a JobFlex organization.
 * The two unlinked values are NOT interchangeable: "none" means Stripe named
 * nobody, "stale-id" means Stripe named an id this database cannot resolve.
 */
export type MatchedBy = "stripe-org" | "record" | "stripe-user" | "stale-id" | "none";

/** Neither value means the subscription is linked. */
export function isUnlinked(m: MatchedBy): boolean {
  return m === "none" || m === "stale-id";
}

/**
 * Where the monthly amount came from. "none" = no source could name one;
 * "stripe-partial" = only some recurring items carry a unit amount (a metered
 * or tiered item prices at null), so the figure is a floor.
 */
export type PricedBy = "stripe" | "stripe-partial" | "price-row" | "catalog" | "none";

/** Why an otherwise-live subscription is not in the MRR total. */
export type MrrExclusion =
  | "status"
  | "paused"
  | "comped"
  | "currency"
  | "unconfirmed"
  | null;

/** What the row's `changedAt` timestamp actually is. */
export type ChangeKind =
  | "created"
  | "cancel-scheduled"
  | "canceled"
  | "ended"
  | "updated";

/* ── THE STRIPE SCAN CEILING ───────────────────────────────────────────────
   One pass over Stripe's subscription list reads this many pages of 100. Both
   readers (actions/subscribers.ts, actions/adminUsers.ts) page to it and both
   report when they hit it, and every sentence on screen that names the number
   derives it from here — a "use server" module may export only async
   functions, which is why the constant lives in this one. */
export const STRIPE_PAGE_SIZE = 100;
export const STRIPE_MAX_PAGES = 20;
export const STRIPE_SCAN_CEILING = STRIPE_MAX_PAGES * STRIPE_PAGE_SIZE;
/** The ceiling as it is written in copy — one formatting, server and client. */
export const STRIPE_SCAN_CEILING_LABEL = new Intl.NumberFormat("en-US").format(
  STRIPE_SCAN_CEILING,
);

/* ── THE HAND-GRANT RULE — one definition, one place ───────────────────────
   provider MANUAL means the row is the operator's own record, not a mirror of
   any Stripe subscription. Two things follow, and both are enforced from this
   one sentence:
     · a write that stamps MANUAL clears externalSubId and stripePriceId
       (actions/adminUsers.ts). externalCustomerId stays — that is an
       org ↔ customer fact, and it is how a later subscription finds its way
       back to this organization;
     · nothing Stripe says may silently replace or hide a live grant. The sync
       refuses to write over one (conflict, or kept when Stripe has lapsed) and
       the subscribers read model never drops one, whatever id it carries.
   A row written before that rule existed still carries the subscription the
   org checked out with and later canceled, so neither half may lean on the id
   being absent. */

/**
 * Statuses that mean a stored subscription row is still running — the standing
 * arrangement, not an ended one. A row in one of these is never replaced or
 * dropped on anyone's behalf; ending it (Canceled / Expired) is what hands it
 * back to Stripe.
 */
export const LIVE_RECORD_STATUSES = new Set(["ACTIVE", "TRIALING", "PAST_DUE"]);

export const PAID_STATUSES = new Set(["ACTIVE", "TRIALING"]);
export const NOT_PAID_STATUSES = new Set([
  "PAST_DUE",
  "UNPAID",
  "INCOMPLETE",
  "INCOMPLETE_EXPIRED",
]);

/** The rule under the MRR numeral. Short enough to sit in a KPI annotation. */
export const MRR_RULE = "Active · billed · no trials";
/** The rule under the Paying numeral. */
export const PAYING_RULE = "Active · trialing · billed";

/** Everything computeMetrics reads. Both the server row and its DTO satisfy it. */
export interface BillingFacts {
  status: string;
  /** Active or trialing AND actually billed — not comped, not paused. */
  paid: boolean;
  /** Stripe is holding invoices for this subscription (`pause_collection`). */
  paused: boolean;
  /** An admin grant (provider MANUAL) — a plan given, never invoiced. */
  comped: boolean;
  /**
   * true  — Stripe returned this subscription on the read behind these rows.
   * false — Stripe answered and did NOT return it (a platform record row whose
   *         subscription is gone: key rotation, a deleted sub).
   * null  — Stripe was never read, so nothing here can confirm anything.
   */
  stripeConfirmed: boolean | null;
  /**
   * The standing coupon is limited to some products (`applies_to.products`)
   * but is subtracted from the whole subscription, so the amount is a floor.
   */
  restrictedDiscount: boolean;
  countsTowardMrr: boolean;
  mrrExcludedFor: MrrExclusion;
  matchedBy: MatchedBy;
  pricedBy: PricedBy;
  /** Monthly-normalised amount in the row's own currency, in cents. */
  amountCents: number;
  /** Lowercase ISO currency code. */
  currency: string;
  plan: string;
  promoCode: string | null;
}

export interface BillingMetrics {
  /** The currency mrrCents is denominated in — money() is told this. */
  currency: string;
  mrrCents: number;
  /** How many subscriptions the MRR figure is the sum of. */
  mrrSubCount: number;
  /** Of those, how many resolve to no JobFlex organization (either reason). */
  mrrUnmatched: number;
  /** Of those, how many name an id this database cannot resolve — the rest name nobody. */
  mrrNamedUnknown: number;
  /** Of those, how many carry an amount no source could name (they add 0). */
  mrrUnpriced: number;
  /** Of those, how many priced only some of their recurring items — a floor. */
  mrrPartlyPriced: number;
  /** Of those, how many carry a product-limited coupon taken off the whole amount. */
  mrrRestrictedDiscount: number;
  /** Of those, how many were priced from the plan catalog, not the subscription. */
  mrrFromCatalog: number;
  payingCount: number;
  /** Active in Stripe, collection paused. */
  pausedCount: number;
  /** Admin grants (provider MANUAL). */
  compedCount: number;
  /** Platform record rows Stripe answered about and did not return. */
  unconfirmedCount: number;
  /** Live subscriptions billed in another currency — beside the total, not in it. */
  otherCurrencyCount: number;
  /** Those currencies, uppercased. */
  otherCurrencies: string[];
  /** Owes money and hasn't paid: past_due / unpaid / incomplete. */
  notPaidCount: number;
  canceledCount: number;
  perPlan: { plan: string; count: number }[];
  promoUsage: { code: string; count: number }[];
  promoTotal: number;
}

export function computeMetrics(
  rows: readonly BillingFacts[],
  currency: string,
): BillingMetrics {
  const mrrRows = rows.filter((r) => r.countsTowardMrr);
  const otherCurrency = rows.filter((r) => r.mrrExcludedFor === "currency");

  const perPlanMap = new Map<string, number>();
  for (const r of rows) perPlanMap.set(r.plan, (perPlanMap.get(r.plan) ?? 0) + 1);
  const perPlan = [...perPlanMap.entries()]
    .map(([plan, count]) => ({ plan, count }))
    .sort((a, b) => b.count - a.count || a.plan.localeCompare(b.plan));

  const promoMap = new Map<string, number>();
  for (const r of rows) {
    if (r.promoCode) promoMap.set(r.promoCode, (promoMap.get(r.promoCode) ?? 0) + 1);
  }
  const promoUsage = [...promoMap.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

  return {
    currency,
    mrrCents: mrrRows.reduce((a, r) => a + r.amountCents, 0),
    mrrSubCount: mrrRows.length,
    mrrUnmatched: mrrRows.filter((r) => isUnlinked(r.matchedBy)).length,
    mrrNamedUnknown: mrrRows.filter((r) => r.matchedBy === "stale-id").length,
    mrrUnpriced: mrrRows.filter((r) => r.pricedBy === "none").length,
    mrrPartlyPriced: mrrRows.filter((r) => r.pricedBy === "stripe-partial").length,
    mrrRestrictedDiscount: mrrRows.filter((r) => r.restrictedDiscount).length,
    mrrFromCatalog: mrrRows.filter((r) => r.pricedBy === "catalog").length,
    payingCount: rows.filter((r) => r.paid).length,
    pausedCount: rows.filter((r) => r.paused).length,
    compedCount: rows.filter((r) => r.comped).length,
    unconfirmedCount: rows.filter((r) => r.stripeConfirmed === false).length,
    otherCurrencyCount: otherCurrency.length,
    otherCurrencies: [...new Set(otherCurrency.map((r) => r.currency.toUpperCase()))].sort(),
    notPaidCount: rows.filter((r) => NOT_PAID_STATUSES.has(r.status)).length,
    canceledCount: rows.filter((r) => r.status === "CANCELED").length,
    perPlan,
    promoUsage,
    promoTotal: promoUsage.reduce((a, p) => a + p.count, 0),
  };
}

/** What tied this subscription to an organization — shown in the row detail. */
export function matchedByLabel(m: MatchedBy): string {
  switch (m) {
    case "stripe-org":
      return "Stripe metadata · organizationId";
    case "record":
      return "Platform record";
    case "stripe-user":
      return "Stripe metadata · userId";
    case "stale-id":
      // Stripe DID name someone. The id just does not exist in this database —
      // a different deployment's account, or a deleted org/user.
      return "Not linked · Stripe names an id this database has no record of";
    default:
      return "Not linked · Stripe names nobody";
  }
}

/** The same distinction in a table sub-line's worth of characters. */
export function unlinkedShort(m: MatchedBy): string {
  return m === "stale-id" ? "No org · Stripe names an unknown id" : "No org · Stripe names nobody";
}

/** What established the monthly amount — shown in the row detail. */
export function pricedByLabel(p: PricedBy): string {
  switch (p) {
    case "stripe":
      return "Stripe price";
    case "stripe-partial":
      return "Stripe price · some items price at nothing";
    case "price-row":
      return "Plan price ledger";
    case "catalog":
      return "Plan catalog · list price";
    default:
      return "No amount";
  }
}

/** The verb for a row's `changedAt`, so no creation date reads as a change. */
export function changeKindLabel(k: ChangeKind): string {
  switch (k) {
    case "cancel-scheduled":
      // Stripe stamps `canceled_at` the moment a cancellation is BOOKED. The
      // subscription is still running and still billing until it ends.
      return "Cancellation scheduled";
    case "canceled":
      return "Canceled";
    case "ended":
      return "Ended";
    case "updated":
      return "Updated";
    default:
      return "Started";
  }
}

/** The most common value, or null when there is nothing to count. */
export function modalValue(values: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    const k = v.toLowerCase();
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [k, n] of [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}
