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
  payoutRequestRefusal,
  releaseReversedPayout,
  settlePartialReversal,
  writeOffReversedPayout,
} from "@/lib/payouts";
import { setTestTwinActive } from "@/lib/influencerPromoMode";
import { refusal, refused, type ActionResult } from "@/lib/actionResult";
import { cheapestPaidPlanCents, commissionRefusal } from "@/lib/commissionLimits";
import { mailPayoutApproved, mailPayoutDeclined } from "@/lib/influencerMail";
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

/* A RATE IS A PERCENTAGE. There was no upper bound, so a "2000" typed into the
   Rate (%) field — someone thinking in basis points — became 200000 bps and
   accrued twenty times the invoice. The bound lives HERE, on the server, because
   both admin forms are noValidate and an input's `max` blocks nothing.

   A refinement applied AFTER each merge, not on commissionShape itself: a refined
   schema cannot be .merge()d, and all three writers (createInfluencer,
   createPromoCode, updatePromoCommission) merge it. FLAT gets no invented
   ceiling — it is capped per invoice at the money actually collected
   (lib/commission, and the accrual in lib/stripeSync). */
function boundRate(c: { commissionType: string; commissionValue: number }, ctx: z.RefinementCtx) {
  if (c.commissionType === CommissionType.PERCENT && c.commissionValue > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["commissionValue"],
      message: "A commission rate is a percentage — 20 means 20%. Enter 100 or less.",
    });
  }
}

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
    // FIRST MONTH ONLY (owner, 2026-09-02). `repeating` for one month rather
    // than `once`, because a trial's $0 first invoice spends a once-coupon —
    // see lib/referralDiscount for the arithmetic. Coupons already minted
    // stay as they were: Stripe coupons are immutable.
    const coupon = await stripe.coupons.create({
      percent_off: opts.customerPercentOff,
      duration: "repeating",
      duration_in_months: 1,
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
  .merge(commissionShape)
  .superRefine(boundRate);

// EVERY REFUSAL IS A VALUE (lib/actionResult): production redacts a thrown
// Server Action message, so "already in use" and "enter 100 or less" only ever
// reached the admin on the dev server. The sheets read the envelope.
export async function createInfluencer(
  raw: unknown,
): Promise<ActionResult<{ id: string; code: string; inviteUrl: string | null }>> {
  await requirePlatformAdmin();
  const parsed = createInfluencerInput.safeParse(raw);
  if (!parsed.success) return refusal(parsed.error);
  const data = parsed.data;
  const code = data.code.toUpperCase();

  const existingCode = await db.promoCode.findUnique({ where: { code } });
  if (existingCode) return refused(`Promo code "${code}" is already in use.`);
  const existingEmail = await db.influencer.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existingEmail) return refused("An influencer with that email already exists.");
  const overLimit = commissionRefusal(data, await cheapestPaidPlanCents());
  if (overLimit) return refused(overLimit);

  // Admin-set password → account is immediately usable, ACTIVE. No password →
  // the influencer gets an invite email with a set-password link instead (the
  // login provider rejects null-password accounts until they complete it), and
  // the account is PENDING until completeInfluencerSetPassword flips it: the
  // admin page's "pending invite" count is exactly these. Their code is live
  // from this moment either way — a PENDING partner's referrals are theirs
  // (lib/attribution, and the accrual in lib/stripeSync).
  const hashedPassword = data.password ? await bcrypt.hash(data.password, 10) : null;
  let stripeIds: { stripeCouponId: string; stripePromotionCodeId: string };
  try {
    stripeIds = await provisionStripePromo({
      code,
      customerPercentOff: data.customerPercentOff,
      label: `${data.displayName} (${code})`,
    });
  } catch (err) {
    return refusal(err); // "Refusing to create a Stripe promo code against a LIVE account…"
  }

  const influencer = await db.influencer.create({
    data: {
      email: data.email.toLowerCase(),
      displayName: data.displayName,
      hashedPassword,
      status: hashedPassword ? InfluencerStatus.ACTIVE : InfluencerStatus.PENDING,
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
  return { ok: true, id: influencer.id, code, inviteUrl };
}

export async function setInfluencerStatus(id: string, status: string): Promise<ActionResult> {
  await requirePlatformAdmin();
  if (!Object.values(InfluencerStatus).includes(status as never)) {
    return refused("Invalid status");
  }
  await db.influencer.update({ where: { id }, data: { status } });
  revalidatePath("/admin/influencers");
  return { ok: true };
}

const profileInput = z.object({
  id: z.string(),
  displayName: z.string().min(1).optional(),
  minPayoutCents: z.number().int().min(0).optional(),
  holdDays: z.number().int().min(0).max(180).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function updateInfluencerProfile(raw: unknown): Promise<ActionResult> {
  await requirePlatformAdmin();
  const parsed = profileInput.safeParse(raw);
  if (!parsed.success) return refusal(parsed.error);
  const { id, ...rest } = parsed.data;
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
  return { ok: true };
}

// ── admin: promo codes ────────────────────────────────
const createPromoInput = z
  .object({
    influencerId: z.string(),
    code: z.string().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/),
  })
  .merge(commissionShape)
  .superRefine(boundRate);

export async function createPromoCode(raw: unknown): Promise<ActionResult> {
  await requirePlatformAdmin();
  const parsed = createPromoInput.safeParse(raw);
  if (!parsed.success) return refusal(parsed.error);
  const data = parsed.data;
  const code = data.code.toUpperCase();

  const influencer = await db.influencer.findUnique({ where: { id: data.influencerId } });
  if (!influencer) return refused("Influencer not found");
  const dupe = await db.promoCode.findUnique({ where: { code } });
  if (dupe) return refused(`Promo code "${code}" is already in use.`);
  const overLimit = commissionRefusal(data, await cheapestPaidPlanCents());
  if (overLimit) return refused(overLimit);

  let stripeIds: { stripeCouponId: string; stripePromotionCodeId: string };
  try {
    stripeIds = await provisionStripePromo({
      code,
      customerPercentOff: data.customerPercentOff,
      label: `${influencer.displayName} (${code})`,
    });
  } catch (err) {
    return refusal(err);
  }

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
  return { ok: true };
}

export async function setPromoActive(promoId: string, active: boolean): Promise<ActionResult> {
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
  // The sandbox twin, if one was ever minted, moves with it. Without this a code
  // switched off here stays redeemable in a test run, which is exactly the kind
  // of difference that makes a rehearsal worthless.
  await setTestTwinActive(promoId, active);
  await db.promoCode.update({ where: { id: promoId }, data: { active } });
  revalidatePath("/admin/influencers");
  return { ok: true };
}

const commissionEditInput = z
  .object({ promoId: z.string() })
  .merge(commissionShape)
  .superRefine(boundRate);

export async function updatePromoCommission(raw: unknown): Promise<ActionResult> {
  await requirePlatformAdmin();
  const parsed = commissionEditInput.safeParse(raw);
  if (!parsed.success) return refusal(parsed.error);
  const { promoId, ...rest } = parsed.data;
  // A code written before the limit stays as it is until its terms are edited;
  // the edit has to bring it under.
  const overLimit = commissionRefusal(rest, await cheapestPaidPlanCents());
  if (overLimit) return refused(overLimit);
  await db.promoCode.update({ where: { id: promoId }, data: commissionColumns(rest) });
  revalidatePath("/admin/influencers");
  return { ok: true };
}

// ── payouts: admin approval (transfer executed by Phase 4 cron) ──
export async function approvePayoutRequest(id: string): Promise<ActionResult> {
  const admin = await requirePlatformAdmin();
  // A conditional write: two admins pressing Approve at once, or an Approve
  // landing after the cron already claimed the row, cannot both succeed.
  const res = await db.payoutRequest.updateMany({
    where: { id, status: PayoutRequestStatus.PENDING },
    data: { status: PayoutRequestStatus.APPROVED, approvedBy: admin.id, approvedAt: new Date() },
  });
  if (res.count === 0) {
    const reqRow = await db.payoutRequest.findUnique({ where: { id }, select: { status: true } });
    return refused(reqRow ? `This request is ${reqRow.status.toLowerCase().replace("_", " ")} — only a pending request can be approved.` : "Payout request not found");
  }
  await mailPayoutApproved(id); // best-effort; the approval stands either way
  revalidatePath("/admin/influencers");
  revalidatePath("/admin/payouts");
  return { ok: true };
}

export async function rejectPayoutRequest(id: string, reason?: string): Promise<ActionResult> {
  const admin = await requirePlatformAdmin();
  // Only a request no money has moved for can be rejected. There was no guard
  // here (approve has always required PENDING), so a request already PAID, or
  // PROCESSING with a transfer in flight, could be relabelled REJECTED — the
  // partner's portal would then call a payment that reached their bank
  // "declined", and runApprovedPayouts would stop driving a transfer that may
  // already exist. The conditional write makes it atomic against the cron
  // claiming the same row.
  const res = await db.payoutRequest.updateMany({
    where: { id, status: { in: [PayoutRequestStatus.PENDING, PayoutRequestStatus.APPROVED] } },
    data: {
      status: PayoutRequestStatus.REJECTED,
      approvedBy: admin.id,
      approvedAt: new Date(),
      rejectedReason: reason ?? null,
    },
  });
  if (res.count === 0) {
    return refused("This request can no longer be rejected — a payout is already being sent or has been sent.");
  }
  await mailPayoutDeclined(id); // best-effort; the reason is on the request either way
  revalidatePath("/admin/influencers");
  revalidatePath("/admin/payouts");
  return { ok: true };
}

// ── payouts: after Stripe reversed a transfer ─────────
// The admin's two choices for a request marked REVERSED (lib/payouts). Both
// answer with an envelope, not a throw — production redacts a thrown Server
// Action message, and "already handled" is exactly the sentence a second click
// needs to read.
// The amounts come back from the ledger, not from the request: refunds and
// chargebacks since the payout change what is owed, and the admin's toast
// should say what actually moved.
export async function retryReversedPayout(
  id: string,
): Promise<{ ok: true; releasedCents: number; held: boolean } | { ok: false; error: string }> {
  await requirePlatformAdmin();
  const res = await releaseReversedPayout(id);
  revalidatePath("/admin/payouts");
  revalidatePath("/admin/influencers");
  return res.ok
    ? { ok: true, releasedCents: res.releasedCents, held: res.heldRows > 0 }
    : { ok: false, error: "This payout is not waiting on a reversed transfer any more — it was already handled." };
}

export async function writeOffPayout(
  id: string,
  note: string,
): Promise<{ ok: true; writtenOffCents: number } | { ok: false; error: string }> {
  await requirePlatformAdmin();
  const clean = String(note ?? "").slice(0, 500);
  const res = await writeOffReversedPayout(id, clean);
  revalidatePath("/admin/payouts");
  revalidatePath("/admin/influencers");
  return res.ok
    ? { ok: true, writtenOffCents: res.writtenOffCents }
    : { ok: false, error: "This payout is not waiting on a reversed transfer any more — it was already handled." };
}

export async function settlePartialPayoutReversal(
  transferId: string,
  note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePlatformAdmin();
  const res = await settlePartialReversal(transferId, String(note ?? "").slice(0, 500));
  revalidatePath("/admin/payouts");
  revalidatePath("/admin/health");
  return res.ok ? { ok: true } : { ok: false, error: "This transfer has no partial reversal left to settle." };
}

// ── influencer (self): request a payout of cleared balance ──
/**
 * Answers with an envelope, not a throw: Next.js redacts a thrown Server Action
 * message in production, so a refusal has to be RETURNED to reach the partner as
 * words. The wording itself lives in lib/payouts so the button's disabled hint
 * and the server's answer cannot drift apart.
 */
export async function requestPayout(): Promise<{ ok: true } | { ok: false; error: string }> {
  const influencer = await requireInfluencer();

  const open = await db.payoutRequest.findFirst({
    where: {
      influencerId: influencer.id,
      status: { in: [PayoutRequestStatus.PENDING, PayoutRequestStatus.APPROVED, PayoutRequestStatus.PROCESSING] },
    },
    select: { status: true },
  });

  const entries = await db.commissionLedger.findMany({
    where: { influencerId: influencer.id },
    select: { entryType: true, amountCents: true, state: true },
  });
  const { clearedCents } = ledgerBalances(entries);

  const refusal = payoutRequestRefusal({
    payoutsEnabled: influencer.payoutsEnabled,
    connectStatus: influencer.connectStatus,
    minPayoutCents: influencer.minPayoutCents,
    clearedCents,
    openRequestStatus: open?.status ?? null,
  });
  if (refusal) return { ok: false, error: refusal };

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
  revalidatePath("/influencer/payouts");
  return { ok: true };
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
