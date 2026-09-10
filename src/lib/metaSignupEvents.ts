/* The server-side Meta events of a signup's life (2026-09-09):
   CompleteRegistration when the organization is created (signupCheckout),
   StartTrial when Stripe's checkout comes back trialing, Purchase on the
   first paid invoice. All three read the person from what the signup wrote
   on the organization (Organization.metaSignupJson) and its landing
   attribution, and each carries an event_id the browser's copy shares. */

import type Stripe from "stripe";
import { db } from "@/lib/db";
import { parseMetaSignup, sendMetaEvent, type MetaEvent, type MetaSignupContext } from "@/lib/metaCapi";

type OrgRow = {
  id: string;
  billingEmail: string | null;
  phone: string | null;
  landingIndustry: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  metaSignupJson: string | null;
};

const ORG_SELECT = {
  id: true, billingEmail: true, phone: true, landingIndustry: true,
  utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true, metaSignupJson: true,
} as const;

function eventFor(org: OrgRow, ctx: MetaSignupContext, base: Pick<MetaEvent, "eventName" | "eventId" | "value" | "currency"> & { custom?: MetaEvent["custom"] }): MetaEvent {
  return {
    ...base,
    sourceUrl: ctx.sourceUrl ?? null,
    consent: ctx.consent,
    user: {
      email: org.billingEmail,
      phone: org.phone,
      fbp: ctx.fbp ?? null,
      fbc: ctx.fbc ?? null,
      clientIp: ctx.clientIp ?? null,
      userAgent: ctx.userAgent ?? null,
      externalId: org.id,
    },
    custom: {
      industry: org.landingIndustry ?? "default",
      utm_source: org.utmSource,
      utm_medium: org.utmMedium,
      utm_campaign: org.utmCampaign,
      utm_content: org.utmContent,
      ...(base.custom ?? {}),
    },
  };
}

/** Stripe's checkout came back for a subscription: StartTrial when it is trialing. */
export async function metaOnCheckoutCompleted(session: Stripe.Checkout.Session, sub: Stripe.Subscription): Promise<void> {
  if (sub.status !== "trialing") return;
  const mirror = await db.subscription.findFirst({ where: { externalSubId: sub.id }, select: { organizationId: true, plan: true } });
  if (!mirror) return;
  const org = await db.organization.findUnique({ where: { id: mirror.organizationId }, select: ORG_SELECT });
  const ctx = org ? parseMetaSignup(org.metaSignupJson) : null;
  if (!org || !ctx || ctx.trialSentAt) return;
  const amount = session.amount_total != null ? session.amount_total / 100 : undefined;
  await sendMetaEvent(
    eventFor(org, ctx, {
      eventName: "StartTrial",
      eventId: `${sub.id}:trial`,
      value: amount,
      currency: session.currency?.toUpperCase() ?? "USD",
      custom: { plan: mirror.plan, predicted_ltv: amount },
    }),
  );
  await db.organization.update({
    where: { id: org.id },
    data: { metaSignupJson: JSON.stringify({ ...ctx, trialSentAt: new Date().toISOString() }) },
  }).catch(() => {});
}

/** The first paid invoice of a subscription is the Purchase; renewals are not. */
export async function metaOnInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  if (!invoice.amount_paid || invoice.amount_paid <= 0) return;
  const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
  if (!subId) return;
  const mirror = await db.subscription.findFirst({ where: { externalSubId: subId }, select: { organizationId: true, plan: true } });
  if (!mirror) return;
  const org = await db.organization.findUnique({ where: { id: mirror.organizationId }, select: ORG_SELECT });
  const ctx = org ? parseMetaSignup(org.metaSignupJson) : null;
  if (!org || !ctx || ctx.purchaseSentAt) return;
  await sendMetaEvent(
    eventFor(org, ctx, {
      eventName: "Purchase",
      eventId: invoice.id,
      value: invoice.amount_paid / 100,
      currency: invoice.currency.toUpperCase(),
      custom: { plan: mirror.plan },
    }),
  );
  await db.organization.update({
    where: { id: org.id },
    data: { metaSignupJson: JSON.stringify({ ...ctx, purchaseSentAt: new Date().toISOString() }) },
  }).catch(() => {});
}
