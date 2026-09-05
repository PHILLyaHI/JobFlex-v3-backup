"use server";

import { REFERRAL_DISCOUNT_PCT } from "@/lib/referralDiscount";

// THE SIGN-UP PAYWALL — what the plan step needs from the server.
//
// Two PUBLIC calls — public because at this point in the flow there is no
// account yet (see actions/signupCheckout: pay first, then the account):
//   · `signupPlans()` reads the live plan catalog (the same /admin/plans rows
//     every other surface reads — never a copy) plus whatever promo the visitor
//     arrived with, so the step can price itself honestly before anyone types
//     anything.
//   · `applySignupPromo(code)` validates a code typed by hand against the SAME
//     promo/referral tables the ?promo and ?ref links use. It stamps nothing:
//     the validated code rides along with the pending signup and is bound to
//     the organization when that organization is created. One discount system,
//     one binding path.
import { getPlanCatalog } from "@/lib/planCatalogServer";
import { getCustomPlanTrialDays } from "@/lib/customPlanConfig";
import { validateAttribution } from "@/lib/attribution";
import { isStripeEnabled } from "@/lib/sdk/stripe";

export interface SignupPlan {
  slug: string;
  name: string;
  description: string | null;
  priceCents: number;
  yearlyPriceCents: number | null;
  trialDays: number;
  features: string[];
  highlight: boolean;
}

export interface SignupPromo {
  code: string;
  /** Whose code it is — an influencer's display name or a member's name. */
  displayName: string;
  /** Percent off for the customer, when the promo carries one. */
  percentOff: number | null;
  kind: "promo" | "ref";
}

export async function signupPlans(): Promise<{
  plans: SignupPlan[];
  /** A code already stamped on this org (from a ?promo / ?ref link). */
  promo: SignupPromo | null;
  /** False when Stripe is not configured — the step then offers only "skip". */
  checkoutReady: boolean;
  /** The custom plan's trial, set in /admin/plans. It has no catalog row, so
   *  it rides alongside the list rather than inside it. */
  customTrialDays: number;
}> {
  const [catalog, customTrialDays] = await Promise.all([
    getPlanCatalog(),
    getCustomPlanTrialDays(),
  ]);
  // Whatever the visitor arrived with is carried in the client's attribution
  // pill and applied at account creation; there is no organization to read a
  // stamp from at this point in the flow.
  const promo: SignupPromo | null = null;

  return {
    // A $0 plan is not a thing to sell on this step; it is what happens when
    // somebody skips.
    plans: catalog
      .filter((p) => !p.isFree)
      .map((p) => ({
        slug: p.slug,
        name: p.name,
        description: p.description,
        priceCents: p.priceCents,
        yearlyPriceCents: p.yearlyPriceCents,
        trialDays: p.trialDays,
        features: p.features,
        highlight: p.highlight,
      })),
    promo,
    checkoutReady: isStripeEnabled(),
    customTrialDays,
  };
}

export async function applySignupPromo(
  rawCode: string,
): Promise<{ ok: true; promo: SignupPromo } | { ok: false; error: string }> {
  const code = String(rawCode ?? "").trim();
  if (!code) return { ok: false, error: "Enter a code first." };

  // A code is a promo or a referral; the visitor does not have to know which.
  const promo = await validateAttribution("promo", code);
  const ref = promo ? null : await validateAttribution("ref", code);
  const hit = promo ?? ref;
  if (!hit) return { ok: false, error: "That code is not valid." };

  // NOTHING IS STAMPED HERE. There is no organization yet (the account is
  // created after checkout), so the validated code travels with the pending
  // signup and `completePendingSignup` binds it to the org it creates — the
  // same `bindAttributionToOrg` every other path uses.
  return {
    ok: true,
    promo: {
      code: hit.code,
      displayName: hit.displayName,
      // A referral is worth REFERRAL_DISCOUNT_PCT to the shop typing it (the
      // referrer's 50% credit is separate, lib/referralRewards); checkout
      // applies the same number as a coupon, so the price the step shows is
      // the price Stripe charges.
      percentOff: hit.kind === "promo" ? hit.percentOff : REFERRAL_DISCOUNT_PCT,
      kind: hit.kind,
    },
  };
}

/** The register page's read of a parked Google identity (`?gsu=`). */
export async function googleSignupIdentity(
  handle: string,
): Promise<{ email: string; name: string | null } | null> {
  const { readGoogleSignup } = await import("@/lib/googleSignup");
  const g = await readGoogleSignup(String(handle ?? ""));
  return g ? { email: g.email, name: g.name } : null;
}
