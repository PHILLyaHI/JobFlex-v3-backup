"use server";
import { requireInfluencer } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { getStripe, isStripeEnabled } from "@/lib/sdk/stripe";
import { assertStripeWriteAllowed } from "@/lib/stripeSafety";
import { ConnectStatus } from "@/lib/prismaEnums";

// Influencer-initiated Stripe Connect (Express) onboarding. Creates the
// connected account on first use, then returns a single-use hosted onboarding
// link. The account.updated webhook flips payoutsEnabled/connectStatus when KYC
// completes — we never store the (short-lived) account link.
export async function createConnectOnboardingLink() {
  const influencer = await requireInfluencer();
  if (!isStripeEnabled()) {
    throw new Error("Payouts aren't available yet — Stripe isn't configured.");
  }
  assertStripeWriteAllowed("create a Stripe Connect account");
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

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${origin}/influencer?connect=refresh`,
    return_url: `${origin}/influencer?connect=done`,
  });
  return { url: link.url };
}
