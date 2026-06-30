"use server";
import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PLAN_TIERS, type Plan } from "@/lib/entitlements";
import { isStripeEnabled, getStripe } from "@/lib/sdk/stripe";

export async function setOrgPlan(plan: Plan) {
  const { organizationId } = await requireManager();
  if (!PLAN_TIERS.includes(plan)) throw new Error("Invalid plan");

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);

  await db.subscription.upsert({
    where: { organizationId },
    update: {
      plan,
      status: plan === "FREE" ? "FREE" : "ACTIVE",
      currentPeriodEnd: plan === "FREE" ? null : periodEnd,
    },
    create: {
      organizationId,
      plan,
      status: plan === "FREE" ? "FREE" : "ACTIVE",
      provider: "STRIPE",
      currentPeriodEnd: plan === "FREE" ? null : periodEnd,
    },
  });
  revalidatePath("/dashboard/settings/billing");
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
  const { organizationId } = await requireManager();
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
