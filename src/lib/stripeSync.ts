// Server-only: reconcile Stripe → our cached mirror + commission ledger.
// Shared by the webhook (event-driven) and the reconciliation cron (backstop),
// so the ledger is fully rebuildable from Stripe. Every money effect is keyed by
// a unique idempotencyKey, so re-processing the same invoice/refund is a no-op.

import type Stripe from "stripe";
import { db } from "@/lib/db";
import {
  AttributionStatus,
  LedgerEntryType,
  LedgerEntryState,
  SubscriptionStatus,
  PayoutTransferStatus,
  ConnectStatus,
  Role,
  InfluencerStatus,
} from "@/lib/prismaEnums";
import {
  computeCommissionCents,
  commissionBasisCents,
  isWithinCommissionWindow,
} from "@/lib/commission";
import { planSnapshot, reportPlanChange } from "@/lib/activation-events";

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

async function planSlugForPrice(stripePriceId: string | null): Promise<string | null> {
  if (!stripePriceId) return null;
  const pp = await db.planPrice.findUnique({ where: { stripePriceId } });
  // Store whatever slug was purchased (uppercased to match existing rows like
  // "STARTER") — custom admin-created plans must not collapse to FREE. Feature
  // gating resolves custom slugs to ENTERPRISE (orgPlan.ts) and their quotas
  // come from the plan's own limitsJson; readers match case-insensitively.
  return pp ? pp.planSlug.toUpperCase() : null;
}

/**
 * SELF-REFERRAL — the influencer IS the organization paying the invoice.
 *
 * Without this the commission is a standing discount on the partner's own
 * subscription: they pay list-minus-coupon and we hand a share of it back every
 * month, for as long as the promo's window runs. On a $79 plan with a 20%-off
 * code and 20% NET commission that is $63.20 out and $12.64 back — $50.56 a
 * month, forever, off a public-facing referral programme.
 *
 * Two legs, because neither alone is enough:
 *   · the LINKED ACCOUNT — Influencer.userId owning the org (the strong leg;
 *     set when the partner also has an app login);
 *   · the EMAIL — an OWNER membership whose user email is the influencer's
 *     (catches the common case where the two accounts were never linked).
 *
 * What it cannot catch, and the owner should know: a partner who signs up with
 * a different email address and never links the accounts. That needs payment
 * -instrument or identity matching, which is Stripe Radar's job, not ours. This
 * closes the open door, it is not proof of identity.
 */
export async function isSelfReferral(
  influencerId: string,
  organizationId: string | null | undefined,
): Promise<boolean> {
  if (!organizationId) return false;
  const inf = await db.influencer.findUnique({
    where: { id: influencerId },
    select: { userId: true, email: true },
  });
  if (!inf) return false;

  const owners = await db.membership.findMany({
    where: { organizationId, role: Role.OWNER },
    select: { userId: true, user: { select: { email: true } } },
  });
  const email = inf.email.toLowerCase();
  return owners.some(
    (m) =>
      (inf.userId && m.userId === inf.userId) ||
      (m.user.email ?? "").toLowerCase() === email,
  );
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
  // A SANDBOX TWIN has neither stored id — it was minted on the test account by
  // lib/influencerPromoMode and carries the PromoCode row's id in its coupon
  // metadata instead. A live coupon is created without metadata
  // (actions/influencers.ts), so on live this branch cannot fire; it is reached
  // only after both lookups above have already missed.
  const metaPromoId = discount.coupon?.metadata?.jfPromoCodeId;
  if (metaPromoId) {
    const byMeta = await db.promoCode.findUnique({ where: { id: metaPromoId } });
    if (byMeta) return byMeta;
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
  const planSlug = await planSlugForPrice(stripePriceId);
  const promo = await resolvePromoCode(sub.discount);
  const status = mapStripeStatus(sub.status);

  const planWas = await planSnapshot(organizationId);
  await db.subscription.upsert({
    where: { organizationId },
    update: {
      status,
      provider: "STRIPE",
      externalCustomerId: customerId,
      externalSubId,
      stripePriceId,
      ...(planSlug && { plan: planSlug }),
      currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
      canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
      appliedPromotionCodeId: idOf(sub.discount?.promotion_code),
      appliedCouponId: sub.discount?.coupon?.id ?? null,
    },
    create: {
      organizationId,
      plan: planSlug ?? "FREE",
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
  reportPlanChange(organizationId, "stripe", planWas);

  if (promo && customerId) {
    // A partner's own organization is recorded, not paid: the row still exists
    // so the admin can see the code was used, but VOID keeps it out of every
    // accrual. The upsert rewrites status on every subscription.updated, so the
    // verdict is recomputed here each time rather than being set once — and
    // accrueForInvoice re-checks anyway, because this state is not durable.
    const selfReferral = await isSelfReferral(promo.influencerId, organizationId);
    // Named apart from `status` above — that one is the SUBSCRIPTION's state.
    const attrStatus = selfReferral ? AttributionStatus.VOID : AttributionStatus.ACTIVE;
    const attribution = await db.attribution.upsert({
      where: { stripeSubscriptionId: externalSubId },
      update: {
        organizationId,
        status: attrStatus,
        influencerId: promo.influencerId,
        promoCodeId: promo.id,
      },
      create: {
        influencerId: promo.influencerId,
        promoCodeId: promo.id,
        organizationId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: externalSubId,
        status: attrStatus,
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
  // plan_changed → "CANCELED" is per organization; a subscription never mirrored has none.
  const mirror = await db.subscription.findFirst({ where: { externalSubId }, select: { organizationId: true } });
  const planWas = mirror ? await planSnapshot(mirror.organizationId) : undefined;
  await db.subscription.updateMany({
    where: { externalSubId },
    data: { status: SubscriptionStatus.CANCELED, canceledAt: new Date() },
  });
  if (mirror) reportPlanChange(mirror.organizationId, "stripe", planWas);
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

  // Checked at the money moment, not only when the attribution was written:
  // syncSubscriptionFromStripe's upsert rewrites status on every
  // subscription.updated, so a VOID stamp is not something to rely on.
  if (await isSelfReferral(attribution.influencerId, attribution.organizationId)) {
    return { skipped: "self-referral" as const };
  }

  // A suspended or terminated partner stops earning. requireInfluencer already
  // refuses them the portal, so without this the ledger kept growing money they
  // could not see, request or be told about — and the admin's owed-across-all
  // -partners total kept climbing for a relationship that had ended.
  //
  // PENDING is deliberately NOT here: that is a partner who has an invite out
  // and has not set a password yet. Their code can already be live, and the
  // referral they brought in is owed to them.
  //
  // PromoCode.active is also deliberately not checked. Switching a code off
  // stops NEW signups (validateAttribution refuses it) and leaves existing
  // subscribers earning — a different lever from ending the relationship, and
  // the one an admin reaches for when they only want to close the code.
  const infStatus = attribution.influencer.status;
  if (infStatus === InfluencerStatus.SUSPENDED || infStatus === InfluencerStatus.TERMINATED) {
    return { skipped: "influencer-inactive" as const };
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

  // A refund that arrived before this invoice parked its numbers; settle it now
  // that there is something to reverse. Both this and the reversal are keyed, so
  // a redelivery of either event cannot double-reverse.
  const reversedFromPark = await drainParkedRefund(idOf(invoice.charge), eventId);

  return reversedFromPark
    ? { accruedCents: commissionCents, reversedCents: reversedFromPark }
    : { accruedCents: commissionCents };
}

// ── refund / dispute → reverse commission (proportional, idempotent) ──

/* A REFUND CAN OUTRUN THE INVOICE IT REFUNDS.
 *
 * Stripe does not order webhook deliveries, and charge.refunded and invoice.paid
 * are separate events. When the refund is processed first there is no accrual to
 * reverse, the handler found nothing and returned, and the accrual that landed a
 * moment later stood forever: full commission owed on a fully refunded charge.
 * Nothing repaired it — the reconcile cron re-runs accrueForInvoice over recent
 * paid invoices (lib/reconcile.ts) but never re-runs a reversal.
 *
 * So an unmatched refund parks its numbers under this key and the accrual
 * consumes them the moment it arrives. Written only for invoice-backed charges,
 * so the one-off proposal payments that share this webhook never touch it, and
 * deleted on use. An unconsumed row is inert: a plain key/value in SyncState
 * that nothing else reads.
 */
const refundParkKey = (chargeId: string) => `refundPending:${chargeId}`;

/** Settle a refund that outran its invoice. Returns the cents reversed, or 0. */
async function drainParkedRefund(chargeId: string | null, eventId?: string): Promise<number> {
  if (!chargeId) return 0;
  const key = refundParkKey(chargeId);
  const parked = await db.syncState.findUnique({ where: { key } }).catch(() => null);
  if (!parked) return 0;
  const parts = parked.cursor.split(":");
  const amount = Number(parts[0]);
  const refunded = Number(parts[1]);
  // Drop the row first: a malformed value must not be retried forever, and the
  // reversal below is idempotent on its own key, so losing the race with a
  // redelivered charge.refunded costs nothing.
  await db.syncState.delete({ where: { key } }).catch(() => {});
  if (!Number.isFinite(amount) || !Number.isFinite(refunded)) return 0;
  const res = await applyRefundReversal({
    chargeId,
    chargeAmountCents: amount,
    refundedCents: refunded,
    invoiceBacked: true,
    eventId,
  });
  const reversed = (res as { reversedCents?: number }).reversedCents;
  return typeof reversed === "number" ? reversed : 0;
}

export async function reverseForCharge(charge: Stripe.Charge, eventId?: string) {
  return applyRefundReversal({
    chargeId: charge.id,
    chargeAmountCents: charge.amount,
    refundedCents: charge.amount_refunded ?? 0,
    invoiceBacked: Boolean(idOf(charge.invoice)),
    eventId,
  });
}

async function applyRefundReversal(opts: {
  chargeId: string;
  chargeAmountCents: number;
  refundedCents: number;
  invoiceBacked: boolean;
  eventId?: string;
}) {
  const { chargeId, chargeAmountCents, refundedCents, eventId } = opts;
  if (refundedCents <= 0 || chargeAmountCents <= 0) return { skipped: "no-refund" as const };
  const ratio = Math.min(1, refundedCents / chargeAmountCents);

  // Accruals tied to this charge (one per invoice).
  const accruals = await db.commissionLedger.findMany({
    where: { stripeChargeId: chargeId, entryType: LedgerEntryType.ACCRUED },
  });

  if (!accruals.length) {
    // Nothing to reverse YET. Park it if a commission could still be accrued
    // against this charge; a charge with no invoice never accrues one.
    if (!opts.invoiceBacked) return { skipped: "no-accrual" as const };
    await db.syncState
      .upsert({
        where: { key: refundParkKey(chargeId) },
        update: { cursor: `${chargeAmountCents}:${refundedCents}` },
        create: { key: refundParkKey(chargeId), cursor: `${chargeAmountCents}:${refundedCents}` },
      })
      .catch(() => {
        /* best effort — a parked refund is a repair, never a reason to 500 the webhook */
      });
    return { skipped: "parked-until-accrual" as const };
  }

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
          stripeChargeId: chargeId,
          stripeEventId: eventId ?? null,
          state: reversalState,
          // A reversal of a still-pending accrual clears with it, so the clear
          // cron's "flip PENDING where clearsAt<=now" rule nets them together.
          clearsAt: reversalState === LedgerEntryState.PENDING ? accrual.clearsAt : null,
          idempotencyKey: `reverse:${chargeId}:${accrual.id}:${refundedCents}`,
          memo: `Refund reversal (${Math.round(ratio * 100)}% of charge ${chargeId})`,
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
