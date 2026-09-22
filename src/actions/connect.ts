"use server";
import { requireInfluencer } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { getStripe, isStripeEnabled } from "@/lib/sdk/stripe";
import { assertStripeWriteAllowed } from "@/lib/stripeSafety";
import { ConnectStatus } from "@/lib/prismaEnums";
import { refusal, refused, type ActionResult } from "@/lib/actionResult";

// Influencer-initiated Stripe Connect (Express) onboarding. Creates the
// connected account on first use, then returns a single-use hosted onboarding
// link. The account.updated webhook flips payoutsEnabled/connectStatus when KYC
// completes — we never store the (short-lived) account link.
export async function createConnectOnboardingLink(): Promise<ActionResult<{ url: string }>> {
  const influencer = await requireInfluencer();
  if (!isStripeEnabled()) {
    return refused("Payouts aren't available yet — Stripe isn't configured.");
  }
  try {
    assertStripeWriteAllowed("create a Stripe Connect account");
  } catch (err) {
    return refusal(err);
  }
  const stripe = getStripe();

  let accountId = influencer.connectAccountId;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: influencer.email,
      capabilities: { transfers: { requested: true } },
      metadata: { influencerId: influencer.id },
    });
    accountId = account.id;
    await db.influencer.update({
      where: { id: influencer.id },
      data: { connectAccountId: accountId, connectStatus: ConnectStatus.ONBOARDING },
    });
  }

  const origin = await appBaseUrl();
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${origin}/influencer?connect=refresh`,
    return_url: `${origin}/influencer?connect=done`,
  });
  return { ok: true, url: link.url };
}
