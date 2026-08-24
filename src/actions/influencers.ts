"use server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requirePlatformAdmin, requireInfluencer } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { getStripe, isStripeEnabled } from "@/lib/sdk/stripe";
import { assertStripeWriteAllowed, isStripeWriteAllowed } from "@/lib/stripeSafety";
import { ledgerBalances } from "@/lib/commission";
import {
  InfluencerStatus,
  CommissionType,
  CommissionBasis,
  PromoDurationType,
  PayoutRequestStatus,
} from "@/lib/prismaEnums";

// ── shared promo validation ───────────────────────────
const commissionShape = z.object({
  customerPercentOff: z.number().min(0).max(100).default(10),
  commissionType: z.enum([CommissionType.PERCENT, CommissionType.FLAT]),
  // For PERCENT: percentage points (e.g. 20). For FLAT: dollars (e.g. 15).
  commissionValue: z.number().min(0),
  commissionBasis: z.enum([CommissionBasis.NET, CommissionBasis.GROSS]).default(CommissionBasis.NET),
  durationType: z.enum([
    PromoDurationType.ONCE,
    PromoDurationType.REPEATING,
    PromoDurationType.FOREVER,
  ]),
  durationMonths: z.number().int().min(1).max(120).optional(),
});

function commissionColumns(c: z.infer<typeof commissionShape>) {
  return {
    commissionType: c.commissionType,
    commissionRateBps: c.commissionType === CommissionType.PERCENT ? Math.round(c.commissionValue * 100) : null,
    commissionFlatCents: c.commissionType === CommissionType.FLAT ? Math.round(c.commissionValue * 100) : null,
    commissionBasis: c.commissionBasis,
    durationType: c.durationType,
    durationMonths: c.durationType === PromoDurationType.REPEATING ? (c.durationMonths ?? 1) : null,
  };
}

// Provision the Stripe coupon + promotion_code that the customer redeems at
// checkout. Degrades to local-only placeholders when Stripe isn't configured,
// so the admin flow works in dev without keys.
async function provisionStripePromo(opts: {
  code: string;
  customerPercentOff: number;
  label: string;
}): Promise<{ stripeCouponId: string; stripePromotionCodeId: string }> {
  if (isStripeEnabled()) {
    assertStripeWriteAllowed("create a Stripe promo code");
    const stripe = getStripe();
    const coupon = await stripe.coupons.create({
      percent_off: opts.customerPercentOff,
      duration: "forever",
      name: opts.label,
    });
    const promo = await stripe.promotionCodes.create({
      coupon: coupon.id,
      code: opts.code,
    });
    return { stripeCouponId: coupon.id, stripePromotionCodeId: promo.id };
  }
  // Local-only: unique synthetic ids so uniqueness constraints still hold.
  return {
    stripeCouponId: `local_coupon_${randomUUID()}`,
    stripePromotionCodeId: `local_promo_${randomUUID()}`,
  };
}

// ── admin: create influencer + first promo code ───────
const createInfluencerInput = z
  .object({
    email: z.string().email(),
    displayName: z.string().min(1),
    code: z.string().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, - and _ only"),
    password: z.string().min(8).optional(),
  })
  .merge(commissionShape);

export async function createInfluencer(raw: unknown) {
  await requirePlatformAdmin();
  const data = createInfluencerInput.parse(raw);
  const code = data.code.toUpperCase();

  const existingCode = await db.promoCode.findUnique({ where: { code } });
  if (existingCode) throw new Error(`Promo code "${code}" is already in use.`);
  const existingEmail = await db.influencer.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existingEmail) throw new Error("An influencer with that email already exists.");

  // Admin-set password → account is immediately usable. No password → the
  // influencer gets an invite email with a set-password link instead (the
  // login provider rejects null-password accounts until they complete it).
  const hashedPassword = data.password ? await bcrypt.hash(data.password, 10) : null;
  const stripeIds = await provisionStripePromo({
    code,
    customerPercentOff: data.customerPercentOff,
    label: `${data.displayName} (${code})`,
  });

  const influencer = await db.influencer.create({
    data: {
      email: data.email.toLowerCase(),
      displayName: data.displayName,
      hashedPassword,
      status: InfluencerStatus.ACTIVE,
      promoCodes: {
        create: {
          code,
          stripeCouponId: stripeIds.stripeCouponId,
          stripePromotionCodeId: stripeIds.stripePromotionCodeId,
          // Local mirror of the (immutable) Stripe coupon percent — drives the
          // "· 20% off" phrase on the signup pill without a Stripe call.
          customerPercentOff: data.customerPercentOff,
          ...commissionColumns(data),
        },
      },
    },
  });

  // Invite email (set-password link) whenever the admin didn't hand over a
  // password themselves. The link is also returned for the admin sheet's copy
  // row so the flow works even when email is stubbed in dev.
  let inviteUrl: string | null = null;
  if (!data.password) {
    const { sendInfluencerInviteEmail } = await import("@/lib/influencerInvite");
    const sent = await sendInfluencerInviteEmail({
      email: data.email.toLowerCase(),
      displayName: data.displayName,
      code,
    });
    inviteUrl = sent.inviteUrl;
  }

  revalidatePath("/admin/influencers");
  return { id: influencer.id, code, inviteUrl };
}

export async function setInfluencerStatus(id: string, status: string) {
  await requirePlatformAdmin();
  if (!Object.values(InfluencerStatus).includes(status as never)) {
    throw new Error("Invalid status");
  }
  await db.influencer.update({ where: { id }, data: { status } });
  revalidatePath("/admin/influencers");
}

const profileInput = z.object({
  id: z.string(),
  displayName: z.string().min(1).optional(),
  minPayoutCents: z.number().int().min(0).optional(),
  holdDays: z.number().int().min(0).max(180).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function updateInfluencerProfile(raw: unknown) {
  await requirePlatformAdmin();
  const { id, ...rest } = profileInput.parse(raw);
  await db.influencer.update({
    where: { id },
    data: {
      ...(rest.displayName !== undefined && { displayName: rest.displayName }),
      ...(rest.minPayoutCents !== undefined && { minPayoutCents: rest.minPayoutCents }),
      ...(rest.holdDays !== undefined && { holdDays: rest.holdDays }),
      ...(rest.notes !== undefined && { notes: rest.notes }),
    },
  });
  revalidatePath("/admin/influencers");
}

// ── admin: promo codes ────────────────────────────────
const createPromoInput = z
  .object({
    influencerId: z.string(),
    code: z.string().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/),
  })
  .merge(commissionShape);

export async function createPromoCode(raw: unknown) {
  await requirePlatformAdmin();
  const data = createPromoInput.parse(raw);
  const code = data.code.toUpperCase();

  const influencer = await db.influencer.findUnique({ where: { id: data.influencerId } });
  if (!influencer) throw new Error("Influencer not found");
  const dupe = await db.promoCode.findUnique({ where: { code } });
  if (dupe) throw new Error(`Promo code "${code}" is already in use.`);

  const stripeIds = await provisionStripePromo({
    code,
    customerPercentOff: data.customerPercentOff,
    label: `${influencer.displayName} (${code})`,
  });

  await db.promoCode.create({
    data: {
      influencerId: data.influencerId,
      code,
      stripeCouponId: stripeIds.stripeCouponId,
      stripePromotionCodeId: stripeIds.stripePromotionCodeId,
      customerPercentOff: data.customerPercentOff,
      ...commissionColumns(data),
    },
  });
  revalidatePath("/admin/influencers");
}

export async function setPromoActive(promoId: string, active: boolean) {
  await requirePlatformAdmin();
  // Best-effort mirror to Stripe; never blocks the local state change.
  const promo = await db.promoCode.findUnique({ where: { id: promoId } });
  if (promo && isStripeEnabled() && isStripeWriteAllowed() && !promo.stripePromotionCodeId.startsWith("local_")) {
    try {
      await getStripe().promotionCodes.update(promo.stripePromotionCodeId, { active });
    } catch {
      // ignore — local state is the UI source of truth; reconcile can repair.
    }
  }
  await db.promoCode.update({ where: { id: promoId }, data: { active } });
  revalidatePath("/admin/influencers");
}

const commissionEditInput = z.object({ promoId: z.string() }).merge(commissionShape);

export async function updatePromoCommission(raw: unknown) {
  await requirePlatformAdmin();
  const { promoId, ...rest } = commissionEditInput.parse(raw);
  await db.promoCode.update({ where: { id: promoId }, data: commissionColumns(rest) });
  revalidatePath("/admin/influencers");
}

// ── payouts: admin approval (transfer executed by Phase 4 cron) ──
export async function approvePayoutRequest(id: string) {
  const admin = await requirePlatformAdmin();
  const reqRow = await db.payoutRequest.findUnique({ where: { id } });
  if (!reqRow) throw new Error("Payout request not found");
  if (reqRow.status !== PayoutRequestStatus.PENDING) throw new Error("Request is not pending");
  await db.payoutRequest.update({
    where: { id },
    data: { status: PayoutRequestStatus.APPROVED, approvedBy: admin.id, approvedAt: new Date() },
  });
  revalidatePath("/admin/influencers");
}

export async function rejectPayoutRequest(id: string, reason?: string) {
  const admin = await requirePlatformAdmin();
  await db.payoutRequest.update({
    where: { id },
    data: {
      status: PayoutRequestStatus.REJECTED,
      approvedBy: admin.id,
      approvedAt: new Date(),
      rejectedReason: reason ?? null,
    },
  });
  revalidatePath("/admin/influencers");
}

// ── influencer (self): request a payout of cleared balance ──
export async function requestPayout() {
  const influencer = await requireInfluencer();

  // Block stacking requests.
  const open = await db.payoutRequest.findFirst({
    where: {
      influencerId: influencer.id,
      status: { in: [PayoutRequestStatus.PENDING, PayoutRequestStatus.APPROVED, PayoutRequestStatus.PROCESSING] },
    },
  });
  if (open) throw new Error("You already have a payout request in progress.");

  const entries = await db.commissionLedger.findMany({
    where: { influencerId: influencer.id },
    select: { entryType: true, amountCents: true, state: true },
  });
  const { clearedCents } = ledgerBalances(entries);
  if (clearedCents < influencer.minPayoutCents) {
    throw new Error(
      `You need at least $${(influencer.minPayoutCents / 100).toFixed(0)} in cleared commission to request a payout.`,
    );
  }

  await db.payoutRequest.create({
    data: {
      influencerId: influencer.id,
      amountCents: clearedCents,
      currency: influencer.defaultCurrency,
      status: PayoutRequestStatus.PENDING,
      requestedBy: null,
    },
  });
  revalidatePath("/influencer");
}

// ── admin: dashboard rollup for /admin/influencers ───
// One read shape for the strip at the top of the admin page: totals across
// every partner, the commission ledger netted out, and the five codes that
// have actually converted. Read-only; the page's table comes from its own
// findMany so the two never disagree on what counts as a conversion (an
// Attribution row, whatever its status — a cancelled subscriber still
// converted once).
export interface InfluencerRollup {
  total: number;
  active: number;
  pending: number;
  suspended: number;
  terminated: number;
  clicks: number;
  conversions: number;
  /** Net of every ledger entry — what is still owed across all partners. */
  owedCents: number;
  /** Inside the hold window, not yet payable. */
  pendingCents: number;
  /** Past the hold window, payable now. */
  clearedCents: number;
  paidOutCents: number;
  topCodes: {
    promoId: string;
    code: string;
    influencerId: string;
    influencerName: string;
    conversions: number;
    clicks: number;
    active: boolean;
  }[];
}

export async function getInfluencerRollup(): Promise<InfluencerRollup> {
  await requirePlatformAdmin();

  const [statusGroups, clickAgg, conversions, ledger, topGroups] = await Promise.all([
    db.influencer.groupBy({ by: ["status"], _count: { _all: true } }),
    db.promoCode.aggregate({ _sum: { clicks: true } }),
    db.attribution.count(),
    db.commissionLedger.findMany({ select: { entryType: true, amountCents: true, state: true } }),
    db.attribution.groupBy({
      by: ["promoCodeId"],
      _count: { _all: true },
      orderBy: { _count: { promoCodeId: "desc" } },
      take: 5,
    }),
  ]);

  const byStatus = new Map(statusGroups.map((g) => [g.status, g._count._all]));
  const total = statusGroups.reduce((n, g) => n + g._count._all, 0);
  const balances = ledgerBalances(ledger);

  const topIds = topGroups.map((g) => g.promoCodeId);
  const topPromos = topIds.length
    ? await db.promoCode.findMany({
        where: { id: { in: topIds } },
        select: {
          id: true,
          code: true,
          clicks: true,
          active: true,
          influencer: { select: { id: true, displayName: true } },
        },
      })
    : [];
  const promoById = new Map(topPromos.map((p) => [p.id, p]));
  const topCodes = topGroups.flatMap((g) => {
    const p = promoById.get(g.promoCodeId);
    if (!p) return [];
    return [
      {
        promoId: p.id,
        code: p.code,
        influencerId: p.influencer.id,
        influencerName: p.influencer.displayName,
        conversions: g._count._all,
        clicks: p.clicks,
        active: p.active,
      },
    ];
  });

  return {
    total,
    active: byStatus.get(InfluencerStatus.ACTIVE) ?? 0,
    pending: byStatus.get(InfluencerStatus.PENDING) ?? 0,
    suspended: byStatus.get(InfluencerStatus.SUSPENDED) ?? 0,
    terminated: byStatus.get(InfluencerStatus.TERMINATED) ?? 0,
    clicks: clickAgg._sum.clicks ?? 0,
    conversions,
    owedCents: balances.balanceCents,
    pendingCents: balances.pendingCents,
    clearedCents: balances.clearedCents,
    paidOutCents: balances.paidOutCents,
    topCodes,
  };
}
