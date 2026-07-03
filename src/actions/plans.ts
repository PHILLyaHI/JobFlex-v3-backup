"use server";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { getStripe, isStripeEnabled } from "@/lib/sdk/stripe";
import { assertStripeWriteAllowed } from "@/lib/stripeSafety";
import { BillingInterval } from "@/lib/prismaEnums";

// Sync a PricingPlan's monthly (+ optional yearly) price to Stripe.
//
// Stripe Prices are immutable, so "changing a price" means: create a new Price,
// archive the old one, and repoint our PlanPrice mirror — all in one txn so at
// most one PlanPrice is active per (slug, interval). The Product is reused
// across re-syncs (looked up from any existing PlanPrice for the slug).
export async function syncPlanToStripe(planId: string) {
  await requirePlatformAdmin();
  if (!isStripeEnabled()) {
    throw new Error("Connect Stripe (set STRIPE_SECRET_KEY) before syncing plans.");
  }
  assertStripeWriteAllowed("sync this plan to Stripe");
  const plan = await db.pricingPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error("Plan not found");

  const stripe = getStripe();
  const currency = "usd";

  // Reuse an existing Stripe Product for this slug if we already minted one.
  const existing = await db.planPrice.findFirst({
    where: { planSlug: plan.slug },
    orderBy: { createdAt: "desc" },
  });
  let productId = existing?.stripeProductId;
  if (!productId) {
    const product = await stripe.products.create({
      name: plan.name,
      metadata: { planSlug: plan.slug },
    });
    productId = product.id;
  } else {
    // Keep the product name in step with the plan.
    await stripe.products.update(productId, { name: plan.name }).catch(() => {});
  }

  const intervals: { interval: string; recurring: "month" | "year"; amount: number | null }[] = [
    { interval: BillingInterval.MONTH, recurring: "month", amount: plan.priceCents },
    { interval: BillingInterval.YEAR, recurring: "year", amount: plan.yearlyPriceCents },
  ];

  for (const spec of intervals) {
    if (!spec.amount || spec.amount <= 0) continue;

    const newPrice = await stripe.prices.create({
      product: productId,
      currency,
      unit_amount: spec.amount,
      recurring: { interval: spec.recurring },
      metadata: { planSlug: plan.slug, interval: spec.interval },
    });

    // Archive previously-active prices for this (slug, interval) in Stripe…
    const stale = await db.planPrice.findMany({
      where: { planSlug: plan.slug, interval: spec.interval, active: true },
    });
    await Promise.all(
      stale.map((s) => stripe.prices.update(s.stripePriceId, { active: false }).catch(() => {})),
    );

    // …then flip the mirror + insert the new active row atomically.
    await db.$transaction([
      db.planPrice.updateMany({
        where: { planSlug: plan.slug, interval: spec.interval, active: true },
        data: { active: false },
      }),
      db.planPrice.create({
        data: {
          planSlug: plan.slug,
          interval: spec.interval,
          stripeProductId: productId,
          stripePriceId: newPrice.id,
          unitAmountCents: spec.amount,
          currency,
          active: true,
        },
      }),
    ]);
  }

  revalidatePath("/admin/plans");
  return { ok: true };
}
