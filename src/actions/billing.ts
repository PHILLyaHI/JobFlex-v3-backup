"use server";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { isStripeEnabled, getStripeClient } from "@/lib/sdk/stripe";
import { getPlanBySlug, getOrgPlanContext, revalidatePlanSurfaces } from "@/lib/planCatalogServer";
import { ensureRecurringPrice } from "@/lib/stripePriceCache";
import { SubscriptionStatus } from "@/lib/prismaEnums";
import {
  CUSTOM_PAGES,
  CUSTOM_PAGE_CENTS,
  CUSTOM_PLAN_SLUG,
  CUSTOM_YEAR_MULTIPLIER,
  customPriceCents,
  normalizeCustomPages,
} from "@/lib/customPlan";

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
/** The next bill, previewed by Stripe with every discount and credit that
 *  will apply — so a referral reward or coupon shows up BEFORE it is charged. */
export interface UpcomingInvoice {
  /** Epoch seconds the invoice will be attempted (period end). */
  dueAt: number | null;
  amountDueCents: number;
  subtotalCents: number;
  /** Coupons / promotion codes on the subscription, summed. */
  discountCents: number;
  /** Customer balance (referral rewards) applied against this invoice. */
  creditCents: number;
  /** Human lines: "Referral coupon −$2.50", "Referral credit −$39.50". */
  notes: string[];
}

export async function listSubscriptionInvoices(): Promise<{
  available: boolean;
  invoices: SubscriptionInvoice[];
  upcoming?: UpcomingInvoice | null;
}> {
  const { organizationId } = await requireOwner();
  const sub = await db.subscription.findUnique({ where: { organizationId } });

  if (!isStripeEnabled() || !sub?.externalCustomerId) {
    return { available: false, invoices: [] };
  }

  try {
    // Mode-aware: a subscription started on the sandbox has its invoices on
    // the sandbox. The live-only client returned nothing for it.
    const { stripe } = await getStripeClient();
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

    /* THE NEXT BILL (owner, 2026-09-02): Stripe's own preview of the upcoming
       invoice for this subscription, which already nets out every coupon on
       the subscription and the customer's credit balance — the referral
       reward lands as a negative balance, so "$50 off" is visible here weeks
       before the charge. Best-effort: a preview failure leaves the history. */
    let upcoming: UpcomingInvoice | null = null;
    if (sub.externalSubId) {
      try {
        const pre = await stripe.invoices.createPreview({
          customer: sub.externalCustomerId,
          subscription: sub.externalSubId,
          expand: ["discounts.coupon", "total_discount_amounts.discount"],
        });
        const subtotal = pre.subtotal ?? 0;
        const total = pre.total ?? 0;
        const due = pre.amount_due ?? 0;
        const discountCents = (pre.total_discount_amounts ?? []).reduce((n, d) => n + (d.amount ?? 0), 0);
        // Credit applied = what the total was brought down by from the balance.
        const creditCents = Math.max(0, total - due);
        const notes: string[] = [];
        for (const d of pre.total_discount_amounts ?? []) {
          const disc = d.discount as unknown as { coupon?: { name?: string | null } } | string;
          const name = typeof disc === "object" && disc?.coupon?.name ? disc.coupon.name : "Discount";
          if (d.amount) notes.push(`${name} −$${(d.amount / 100).toFixed(2)}`);
        }
        if (creditCents > 0) notes.push(`Referral credit −$${(creditCents / 100).toFixed(2)}`);
        const firstLine = pre.lines?.data?.[0];
        upcoming = {
          dueAt: pre.next_payment_attempt ?? firstLine?.period?.end ?? pre.period_end ?? null,
          amountDueCents: due,
          subtotalCents: subtotal,
          discountCents,
          creditCents,
          notes,
        };
      } catch (err) {
        console.warn("[billing] upcoming invoice preview failed:", err);
      }
    }
    return { available: true, invoices, upcoming };
  } catch {
    // Stripe reachable-but-erroring shouldn't blow up the page.
    return { available: false, invoices: [] };
  }
}

/* ── CHANGE PLAN IN PLACE ────────────────────────────────────────────────
   Until 2026-09-02 every plan button led to /dashboard/upgrade, whose only
   move was a NEW Checkout session — a second subscription beside the first,
   and no way down at all. A shop that already has a Stripe subscription now
   has its price swapped on that subscription:
     · UPGRADE  — `always_invoice`: the prorated difference is charged now.
     · DOWNGRADE — `none`: the lower price starts at once, nothing is charged.
   A shop with no subscription yet (or a cancelled one) is sent through
   checkout as before — the caller handles `mode: "checkout"`. */
export type ChangePlanResult =
  | { ok: true; mode: "switched"; direction: "up" | "down"; planName: string }
  | { ok: true; mode: "checkout" }
  | { ok: false; error: string };

export async function changePlan(
  planSlug: string,
  interval: "MONTH" | "YEAR" = "MONTH",
): Promise<ChangePlanResult> {
  const { organizationId } = await requireOwner();
  const plan = await getPlanBySlug(planSlug);
  if (!plan || !plan.active) return { ok: false, error: "That plan is not available." };
  if (plan.isFree) return { ok: false, error: "That plan can't be switched to here." };
  if (interval === "YEAR" && !plan.yearlyPriceCents) {
    return { ok: false, error: "This plan has no yearly option." };
  }
  if (!isStripeEnabled()) return { ok: false, error: "Checkout is not configured." };

  const [sub, ctx] = await Promise.all([
    db.subscription.findUnique({ where: { organizationId } }),
    getOrgPlanContext(organizationId),
  ]);
  if (!sub?.externalSubId) return { ok: true, mode: "checkout" };
  if (ctx.plan?.slug === plan.slug) return { ok: false, error: "That is already your plan." };

  const { stripe, mode } = await getStripeClient();
  let current;
  try {
    current = await stripe.subscriptions.retrieve(sub.externalSubId);
  } catch {
    return { ok: true, mode: "checkout" };
  }
  if (current.status === "canceled" || current.status === "incomplete_expired") {
    return { ok: true, mode: "checkout" };
  }
  const item = current.items.data[0];
  if (!item) return { ok: true, mode: "checkout" };

  // The price of record for the target plan, by Stripe mode (same rule as
  // the checkout route).
  let priceId: string | null = null;
  if (mode === "live") {
    const price = await db.planPrice.findFirst({
      where: { planSlug: plan.slug, interval, active: true },
    });
    if (!price) return { ok: false, error: "That plan isn't available for checkout yet." };
    priceId = price.stripePriceId;
  } else {
    const cents = interval === "YEAR" ? (plan.yearlyPriceCents ?? 0) : plan.priceCents;
    priceId = await ensureRecurringPrice({
      stripe,
      mode,
      kind: plan.slug,
      name: `JobFlex ${plan.name}`,
      interval,
      cents,
    });
  }

  const currentCents = ctx.plan?.priceCents ?? 0;
  const direction: "up" | "down" = plan.priceCents > currentCents ? "up" : "down";

  try {
    const updated = await stripe.subscriptions.update(current.id, {
      items: [{ id: item.id, price: priceId }],
      proration_behavior: direction === "up" ? "always_invoice" : "none",
      // A trial in progress keeps its end date either way.
      ...(current.status === "trialing" ? { trial_end: current.trial_end ?? undefined } : {}),
      metadata: { ...(current.metadata ?? {}), organizationId, planSlug: plan.slug, interval },
    });
    const trialEnd = updated.trial_end ? new Date(updated.trial_end * 1000) : null;
    const periodEnd = updated.current_period_end
      ? new Date(updated.current_period_end * 1000)
      : null;
    await db.subscription.update({
      where: { organizationId },
      data: {
        plan: plan.slug.toUpperCase(),
        status: updated.status === "trialing" ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE,
        stripePriceId: priceId,
        trialEndsAt: trialEnd,
        currentPeriodEnd: periodEnd,
      },
    });
  } catch (err) {
    console.warn("[billing] changePlan failed:", err);
    const msg = err instanceof Error ? err.message : "";
    return {
      ok: false,
      error: /payment|card|declined/i.test(msg)
        ? "The card on file was declined for the difference. Update it in Stripe and try again."
        : "Couldn't switch the plan. Try again.",
    };
  }
  revalidatePlanSurfaces();
  revalidatePath("/dashboard/subscription");
  return { ok: true, mode: "switched", direction, planName: plan.name };
}

/* ── ADD PAGES TO A CUSTOM PLAN ─────────────────────────────────────────
   (owner's rule, 2026-09-02) An org on the custom plan adds a page and:
     1. pays for the new page(s) ONCE, now — $10 each, a one-off invoice
        charged to the card on the subscription;
     2. the subscription's price steps up with NO proration, so the next
        regular bill is simply the new total (e.g. $40 → $50) and the base is
        never charged twice.
   During a trial nothing is charged now — the new price is what the trial
   rolls into. Pages are recorded in the same SyncState row the signup wrote
   (`orgPages:<orgId>`), which is what the page gate and the sidebar read. */
export type AddCustomPagesResult =
  | { ok: true; pages: string[]; added: number; chargedCents: number; monthlyCents: number }
  | { ok: false; error: string };

export async function addCustomPages(rawIds: unknown): Promise<AddCustomPagesResult> {
  const { organizationId } = await requireOwner();
  const sub = await db.subscription.findUnique({ where: { organizationId } });
  if ((sub?.plan ?? "").toUpperCase() !== CUSTOM_PLAN_SLUG.toUpperCase()) {
    return { ok: false, error: "Pages can only be added to the Custom plan." };
  }
  const key = `orgPages:${organizationId}`;
  const row = await db.syncState.findUnique({ where: { key } }).catch(() => null);
  let owned: string[] = [];
  try {
    owned = normalizeCustomPages(row ? (JSON.parse(row.cursor) as string[]) : []);
  } catch {
    owned = [];
  }
  const wanted = normalizeCustomPages(Array.isArray(rawIds) ? rawIds.map(String) : []);
  const added = wanted.filter((id) => !owned.includes(id));
  if (added.length === 0) return { ok: false, error: "Pick a page you don't have yet." };
  const next = [...owned, ...added];
  const labels = added.map((id) => CUSTOM_PAGES.find((p) => p.id === id)?.label ?? id);

  let chargedCents = 0;
  if (sub?.externalSubId && isStripeEnabled()) {
    const { stripe, mode } = await getStripeClient();
    let current;
    try {
      current = await stripe.subscriptions.retrieve(sub.externalSubId);
    } catch {
      return { ok: false, error: "Couldn't reach your subscription. Try again." };
    }
    const item = current.items.data[0];
    if (!item) return { ok: false, error: "Your subscription has no plan line to update." };
    const interval: "MONTH" | "YEAR" = item.price.recurring?.interval === "year" ? "YEAR" : "MONTH";
    const monthlyMultiplier = interval === "YEAR" ? CUSTOM_YEAR_MULTIPLIER : 1;
    const priceId = await ensureRecurringPrice({
      stripe,
      mode,
      kind: "custom",
      name: "JobFlex Custom plan",
      interval,
      cents: customPriceCents(next, interval),
    });
    try {
      await stripe.subscriptions.update(current.id, {
        items: [{ id: item.id, price: priceId }],
        // No proration: the base was paid for this cycle; the step-up starts
        // on the next bill. The pages themselves are charged just below.
        proration_behavior: "none",
        metadata: { ...(current.metadata ?? {}), customPages: next.join(",") },
      });
    } catch (err) {
      console.warn("[billing] addCustomPages price update failed:", err);
      return { ok: false, error: "Couldn't update your plan. Try again." };
    }
    if (current.status !== "trialing") {
      const customer = typeof current.customer === "string" ? current.customer : current.customer.id;
      const amount = added.length * CUSTOM_PAGE_CENTS * monthlyMultiplier;
      try {
        await stripe.invoiceItems.create({
          customer,
          amount,
          currency: "usd",
          description: `JobFlex Custom plan — ${labels.join(", ")} added`,
        });
        const invoice = await stripe.invoices.create({
          customer,
          collection_method: "charge_automatically",
          auto_advance: false,
          description: "Pages added to your Custom plan",
        });
        await stripe.invoices.finalizeInvoice(invoice.id);
        const pm =
          typeof current.default_payment_method === "string"
            ? current.default_payment_method
            : current.default_payment_method?.id;
        await stripe.invoices.pay(invoice.id, pm ? { payment_method: pm } : {});
        chargedCents = amount;
      } catch (err) {
        // The card was refused for the add-on: put the price back so the
        // next bill does not include pages that were not paid for.
        console.warn("[billing] addCustomPages charge failed:", err);
        await stripe.subscriptions
          .update(current.id, {
            items: [{ id: item.id, price: item.price.id }],
            proration_behavior: "none",
          })
          .catch(() => {});
        return {
          ok: false,
          error: "The card on file was declined for the new pages. Nothing was changed.",
        };
      }
    }
    await db.subscription.update({ where: { organizationId }, data: { stripePriceId: priceId } });
  }

  await db.syncState.upsert({
    where: { key },
    update: { cursor: JSON.stringify(next) },
    create: { key, cursor: JSON.stringify(next) },
  });
  revalidatePlanSurfaces();
  revalidatePath("/dashboard/upgrade");
  revalidatePath("/dashboard", "layout");
  return {
    ok: true,
    pages: next,
    added: added.length,
    chargedCents,
    monthlyCents: customPriceCents(next),
  };
}
