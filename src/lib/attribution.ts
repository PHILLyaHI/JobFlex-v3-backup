import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  ATTR_COOKIE,
  CODE_RE,
  parseAttr,
  type AttributionKind,
  type CapturedAttribution,
} from "@/lib/attributionShared";

// Server side of the pre-signup attribution loop. The cookie is captured
// intent from untrusted client code — everything here re-resolves the raw
// code against the database before acting on it.
//
// Two kinds, two records:
//   promo (influencer) → stamp on Organization (first-write-wins). The money
//     record stays Stripe-truth (Attribution model, created by stripeSync);
//     the stamp only drives the signup pill + checkout auto-apply.
//   ref (member referral) → a PENDING ReferralConversion, advanced to
//     CONVERTED by the Stripe webhook on the referred org's first paid invoice.

export type ValidatedAttribution =
  | {
      kind: "promo";
      code: string;
      promoId: string;
      stripePromotionCodeId: string;
      displayName: string;
      percentOff: number | null;
    }
  | { kind: "ref"; code: string; refCodeId: string; displayName: string; referrerEmail: string | null };

/** Read the captured attribution cookie in a server context (null outside a request). */
export async function readAttributionCookie(): Promise<CapturedAttribution | null> {
  try {
    return parseAttr((await cookies()).get(ATTR_COOKIE)?.value);
  } catch {
    return null;
  }
}

/**
 * Resolve a captured code to its live owner. Null for anything that shouldn't
 * attract signups: unknown code, deactivated promo, non-ACTIVE influencer.
 */
export async function validateAttribution(
  kind: AttributionKind,
  rawCode: string
): Promise<ValidatedAttribution | null> {
  const code = rawCode.trim().toUpperCase();
  if (!CODE_RE.test(code)) return null;

  if (kind === "promo") {
    const promo = await db.promoCode.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        active: true,
        customerPercentOff: true,
        stripePromotionCodeId: true,
        influencer: { select: { displayName: true, status: true } },
      },
    });
    if (!promo?.active || promo.influencer.status !== "ACTIVE") return null;
    return {
      kind: "promo",
      code: promo.code,
      promoId: promo.id,
      stripePromotionCodeId: promo.stripePromotionCodeId,
      displayName: promo.influencer.displayName,
      percentOff: promo.customerPercentOff ?? null,
    };
  }

  const ref = await db.referralCode.findUnique({
    where: { code },
    select: { id: true, code: true, user: { select: { name: true, email: true } } },
  });
  if (!ref) return null;
  return {
    kind: "ref",
    code: ref.code,
    refCodeId: ref.id,
    displayName: ref.user.name?.trim() || "a JobFlex member",
    referrerEmail: ref.user.email ?? null,
  };
}

/**
 * Permanently link a freshly created org to its captured code. Best-effort by
 * design — callers wrap it in try/catch; a bad code silently binds nothing.
 * First-write-wins is enforced in SQL (the null predicate), not in JS.
 */
export async function bindAttributionToOrg(
  orgId: string,
  signupEmail: string,
  kind: AttributionKind,
  code: string
): Promise<void> {
  const valid = await validateAttribution(kind, code);
  if (!valid) return;

  if (valid.kind === "promo") {
    await db.organization.updateMany({
      where: { id: orgId, signupPromoCodeId: null },
      data: {
        signupPromoCode: valid.code,
        signupPromoCodeId: valid.promoId,
        attributionCapturedAt: new Date(),
      },
    });
    return;
  }

  // Referral: no self-referrals, one conversion per signup org.
  if (valid.referrerEmail && valid.referrerEmail.toLowerCase() === signupEmail.toLowerCase()) return;
  const existing = await db.referralConversion.findFirst({
    where: { signupOrgId: orgId },
    select: { id: true },
  });
  if (existing) return;
  await db.referralConversion.create({
    data: { codeId: valid.refCodeId, signupEmail, signupOrgId: orgId, status: "PENDING" },
  });
}
