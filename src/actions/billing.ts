"use server";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { isStripeEnabled, getStripe } from "@/lib/sdk/stripe";
import { getPlanBySlug } from "@/lib/planCatalogServer";

/**
 * Directly assign the org a plan from the catalog. One legitimate use since
 * the Free tier was removed (2026-08-17): the Stripe-disabled dev/demo
 * fallback. Paid plans with Stripe configured MUST go through checkout —
 * without this guard any owner could self-grant a paid tier without paying.
 * (The isFree branches below stay: they keep any admin-created $0 plan and
 * legacy FREE-status rows behaving sanely.)
 */
export async function setOrgPlan(planSlug: string) {
  const { organizationId } = await requireOwner();
  const plan = await getPlanBySlug(planSlug); // active plans only
  if (!plan) throw new Error("Invalid plan");
  if (!plan.isFree && isStripeEnabled()) {
    throw new Error("Paid plans go through checkout.");
  }

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);
  const stored = plan.slug.toUpperCase();

  await db.subscription.upsert({
    where: { organizationId },
    update: {
      plan: stored,
      status: plan.isFree ? "FREE" : "ACTIVE",
      currentPeriodEnd: plan.isFree ? null : periodEnd,
    },
    create: {
      organizationId,
      plan: stored,
      status: plan.isFree ? "FREE" : "ACTIVE",
      provider: "STRIPE",
      currentPeriodEnd: plan.isFree ? null : periodEnd,
    },
  });
  revalidatePath("/dashboard/settings/account");
  revalidatePath("/dashboard/subscription");
  // The responsive staging build still serves this surface too; both refresh.
  revalidatePath("/dashboard/subscription-blueprint");
  revalidatePath("/dashboard");
  return { ok: true };
}

export interface SubscriptionInvoice {
  id: string;
  number: string | null;
  amountPaidCents: number;
  currency: string;
  status: string | null;
  created: number; // epoch seconds
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
}

/**
 * Real subscription billing history, pulled read-only from Stripe (the org's
 * subscription invoices — what the contractor paid JobFlex). This is distinct
 * from the `Payment` table, which records the contractor's *customers'* payments.
 *
 * Read-only (`invoices.list`) — no live-write guard / env flag needed. Returns
 * `{ available: false }` when Stripe isn't configured or the org has no Stripe
 * customer yet, so the UI can show a clear empty state instead of fake rows.
 */
export async function listSubscriptionInvoices(): Promise<{
  available: boolean;
  invoices: SubscriptionInvoice[];
}> {
  const { organizationId } = await requireOwner();
  const sub = await db.subscription.findUnique({ where: { organizationId } });

  if (!isStripeEnabled() || !sub?.externalCustomerId) {
    return { available: false, invoices: [] };
  }

  try {
    const stripe = getStripe();
    const res = await stripe.invoices.list({
      customer: sub.externalCustomerId,
      limit: 12,
    });
    const invoices: SubscriptionInvoice[] = res.data.map((inv) => ({
      id: inv.id,
      number: inv.number ?? null,
      amountPaidCents: inv.amount_paid ?? 0,
      currency: (inv.currency ?? "usd").toUpperCase(),
      status: inv.status ?? null,
      created: inv.created,
      hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
      invoicePdf: inv.invoice_pdf ?? null,
    }));
    return { available: true, invoices };
  } catch {
    // Stripe reachable-but-erroring shouldn't blow up the page.
    return { available: false, invoices: [] };
  }
}
