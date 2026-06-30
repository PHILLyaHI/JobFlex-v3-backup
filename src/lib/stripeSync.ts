// Server-only: reconcile Stripe → our cached mirror + commission ledger.
// Shared by the webhook (event-driven) and the reconciliation cron (backstop),
// so the ledger is fully rebuildable from Stripe. Every money effect is keyed by
// a unique idempotencyKey, so re-processing the same invoice/refund is a no-op.

import type Stripe from "stripe";
import { db } from "@/lib/db";
import { PLAN_TIERS } from "@/lib/entitlements";
import {
  AttributionStatus,
  LedgerEntryType,
  LedgerEntryState,
  SubscriptionStatus,
  PayoutTransferStatus,
  ConnectStatus,
} from "@/lib/prismaEnums";
import {
  computeCommissionCents,
  commissionBasisCents,
  isWithinCommissionWindow,
} from "@/lib/commission";

// ── small helpers ─────────────────────────────────────
function idOf(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

function mapStripeStatus(s: Stripe.Subscription.Status): string {
  switch (s) {
    case "active":
      return SubscriptionStatus.ACTIVE;
    case "trialing":
      return SubscriptionStatus.TRIALING;
    case "past_due":
    case "unpaid":
      return SubscriptionStatus.PAST_DUE;
    case "canceled":
    case "incomplete_expired":
      return SubscriptionStatus.CANCELED;
    default:
      return SubscriptionStatus.PAST_DUE; // incomplete / paused — not yet active
  }
}

async function planTierForPrice(stripePriceId: string | null): Promise<string | null> {
  if (!stripePriceId) return null;
  const pp = await db.planPrice.findUnique({ where: { stripePriceId } });
  if (!pp) return null;
  const tier = pp.planSlug.toUpperCase();
  return (PLAN_TIERS as readonly string[]).includes(tier) ? tier : null;
}

// Resolve a Stripe discount (promotion_code preferred, else coupon) to our PromoCode.
async function resolvePromoCode(discount: Stripe.Discount | null | undefined) {
  if (!discount) return null;
  const promoId = idOf(discount.promotion_code);
  if (promoId) {
    const byPromo = await db.promoCode.findUnique({ where: { stripePromotionCodeId: promoId } });
    if (byPromo) return byPromo;
  }
  const couponId = discount.coupon?.id ?? null;
  if (couponId) {
    const byCoupon = await db.promoCode.findFirst({ where: { stripeCouponId: couponId } });
    if (byCoupon) return byCoupon;
  }
  return null;
}

// ── subscription lifecycle → Subscription mirror + Attribution ──
export async function syncSubscriptionFromStripe(sub: Stripe.Subscription) {
  const externalSubId = sub.id;
  const customerId = idOf(sub.customer);
  const metaOrg = sub.metadata?.organizationId ?? null;

  // Resolve which org this subscription belongs to: metadata first, then an
  // existing mirror row keyed by the Stripe subscription id.
  let organizationId: string | null = metaOrg;
  if (!organizationId) {
    const existing = await db.subscription.findFirst({ where: { externalSubId } });
    organizationId = existing?.organizationId ?? null;
  }
  if (!organizationId) return; // can't map — leave for reconciliation once metadata is present

  const stripePriceId = sub.items.data[0]?.price?.id ?? null;
  const planTier = await planTierForPrice(stripePriceId);
  const promo = await resolvePromoCode(sub.discount);
  const status = mapStripeStatus(sub.status);

  await db.subscription.upsert({
    where: { organizationId },
    update: {
      status,
      provider: "STRIPE",
      externalCustomerId: customerId,
      externalSubId,
      stripePriceId,
      ...(planTier && { plan: planTier }),
      currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
      canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
      appliedPromotionCodeId: idOf(sub.discount?.promotion_code),
      appliedCouponId: sub.discount?.coupon?.id ?? null,
    },
    create: {
      organizationId,
      plan: planTier ?? "FREE",
      status,
      provider: "STRIPE",
      externalCustomerId: customerId,
      externalSubId,
      stripePriceId,
      currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
      appliedPromotionCodeId: idOf(sub.discount?.promotion_code),
      appliedCouponId: sub.discount?.coupon?.id ?? null,
    },
  });

  if (promo && customerId) {
    // Confirm/create the attribution off the Stripe-issued subscription discount.
    const attribution = await db.attribution.upsert({
      where: { stripeSubscriptionId: externalSubId },
      update: {
        organizationId,
        status: AttributionStatus.ACTIVE,
        influencerId: promo.influencerId,
        promoCodeId: promo.id,
      },
      create: {
        influencerId: promo.influencerId,
        promoCodeId: promo.id,
        organizationId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: externalSubId,
        status: AttributionStatus.ACTIVE,
      },
    });
    await db.subscription.update({ where: { organizationId }, data: { attributionId: attribution.id } });
  } else {
    // Discount removed → stop future accrual (keep history).
    await db.attribution.updateMany({
      where: { stripeSubscriptionId: externalSubId, status: AttributionStatus.ACTIVE },
      data: { status: AttributionStatus.ENDED, endedAt: new Date() },
    });
  }
}

export async function markSubscriptionCanceled(sub: Stripe.Subscription) {
  const externalSubId = sub.id;
  await db.subscription.updateMany({
    where: { externalSubId },
    data: { status: SubscriptionStatus.CANCELED, canceledAt: new Date() },
  });
  await db.attribution.updateMany({
    where: { stripeSubscriptionId: externalSubId, status: AttributionStatus.ACTIVE },
    data: { status: AttributionStatus.ENDED, endedAt: new Date() },
  });
}

export async function markSubscriptionPastDue(invoice: Stripe.Invoice) {
  const subId = idOf(invoice.subscription);
  if (!subId) return;
  await db.subscription.updateMany({
    where: { externalSubId: subId },
    data: { status: SubscriptionStatus.PAST_DUE },
  });
}

// ── commission accrual (the trigger: a successfully PAID invoice) ──
export async function accrueForInvoice(invoice: Stripe.Invoice, eventId?: string) {
  if (!invoice.paid || (invoice.amount_paid ?? 0) <= 0) return { skipped: "not-paid" as const };
  const subId = idOf(invoice.subscription);
  if (!subId) return { skipped: "no-subscription" as const };

  const attribution = await db.attribution.findUnique({
    where: { stripeSubscriptionId: subId },
    include: { promoCode: true, influencer: true },
  });
  if (!attribution || attribution.status !== AttributionStatus.ACTIVE) {
    return { skipped: "no-active-attribution" as const };
  }

  const promo = attribution.promoCode;
  if (!isWithinCommissionWindow(promo, attribution.qualifyingMonths)) {
    return { skipped: "outside-window" as const };
  }

  const basisCents = commissionBasisCents(promo, {
    amountPaidCents: invoice.amount_paid,
    subtotalCents: invoice.subtotal ?? invoice.amount_paid,
  });
  const commissionCents = computeCommissionCents(promo, basisCents);
  if (commissionCents <= 0) return { skipped: "zero-commission" as const };

  const clearsAt = new Date(Date.now() + attribution.influencer.holdDays * 24 * 60 * 60 * 1000);
  const idempotencyKey = `accrue:${invoice.id}`;

  try {
    await db.commissionLedger.create({
      data: {
        influencerId: attribution.influencerId,
        attributionId: attribution.id,
        entryType: LedgerEntryType.ACCRUED,
        amountCents: commissionCents,
        currency: (invoice.currency ?? "usd").toLowerCase(),
        stripeInvoiceId: invoice.id,
        stripeChargeId: idOf(invoice.charge),
        stripeEventId: eventId ?? null,
        clearsAt,
        state: LedgerEntryState.PENDING,
        idempotencyKey,
      },
    });
  } catch (e: unknown) {
    // Unique-violation on idempotencyKey = already accrued for this invoice → no-op.
    if (isUniqueViolation(e)) return { skipped: "already-accrued" as const };
    throw e;
  }

  await db.attribution.update({
    where: { id: attribution.id },
    data: {
      qualifyingMonths: { increment: 1 },
      firstPaidInvoiceAt: attribution.firstPaidInvoiceAt ?? new Date(),
    },
  });
  return { accruedCents: commissionCents };
}

// ── refund / dispute → reverse commission (proportional, idempotent) ──
export async function reverseForCharge(charge: Stripe.Charge, eventId?: string) {
  const refundedCents = charge.amount_refunded ?? 0;
  if (refundedCents <= 0 || charge.amount <= 0) return { skipped: "no-refund" as const };
  const ratio = Math.min(1, refundedCents / charge.amount);

  // Accruals tied to this charge (one per invoice).
  const accruals = await db.commissionLedger.findMany({
    where: { stripeChargeId: charge.id, entryType: LedgerEntryType.ACCRUED },
  });

  let reversedTotal = 0;
  for (const accrual of accruals) {
    const desiredReversed = Math.round(accrual.amountCents * ratio);

    // How much we've already reversed for this accrual's invoice.
    const priorReversals = await db.commissionLedger.aggregate({
      where: { stripeInvoiceId: accrual.stripeInvoiceId, entryType: LedgerEntryType.REVERSED },
      _sum: { amountCents: true },
    });
    const alreadyReversed = -(priorReversals._sum.amountCents ?? 0); // stored negative
    const delta = desiredReversed - alreadyReversed;
    if (delta <= 0) continue;

    // Match the bucket so pending/cleared math stays consistent; a clawback on an
    // already-PAID accrual lands as CLEARED so it nets against the next payout.
    const reversalState =
      accrual.state === LedgerEntryState.PAID ? LedgerEntryState.CLEARED : accrual.state;

    try {
      await db.commissionLedger.create({
        data: {
          influencerId: accrual.influencerId,
          attributionId: accrual.attributionId,
          entryType: LedgerEntryType.REVERSED,
          amountCents: -delta,
          currency: accrual.currency,
          stripeInvoiceId: accrual.stripeInvoiceId,
          stripeChargeId: charge.id,
          stripeEventId: eventId ?? null,
          state: reversalState,
          // A reversal of a still-pending accrual clears with it, so the clear
          // cron's "flip PENDING where clearsAt<=now" rule nets them together.
          clearsAt: reversalState === LedgerEntryState.PENDING ? accrual.clearsAt : null,
          idempotencyKey: `reverse:${charge.id}:${accrual.id}:${refundedCents}`,
          memo: `Refund reversal (${Math.round(ratio * 100)}% of charge ${charge.id})`,
        },
      });
      reversedTotal += delta;
    } catch (e: unknown) {
      if (!isUniqueViolation(e)) throw e; // duplicate refund event → skip
    }
  }
  return { reversedCents: reversedTotal };
}

// ── Connect account + transfer webhooks (Phase 4 reconcile) ──
export async function handleConnectAccountUpdate(account: Stripe.Account) {
  const inf = await db.influencer.findUnique({ where: { connectAccountId: account.id } });
  if (!inf) return;
  const enabled = Boolean(account.payouts_enabled);
  await db.influencer.update({
    where: { id: inf.id },
    data: {
      payoutsEnabled: enabled,
      connectStatus: enabled
        ? ConnectStatus.ENABLED
        : account.details_submitted
          ? ConnectStatus.RESTRICTED
          : ConnectStatus.ONBOARDING,
    },
  });
}

export async function handleTransferEvent(transfer: Stripe.Transfer, reversed: boolean) {
  const row = await db.payoutTransfer.findUnique({ where: { stripeTransferId: transfer.id } });
  if (!row) return;
  if (reversed) {
    await db.payoutTransfer.update({ where: { id: row.id }, data: { status: PayoutTransferStatus.REVERSED } });
  }
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "P2002"
  );
}
