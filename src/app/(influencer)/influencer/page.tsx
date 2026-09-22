// PARTNER PORTAL — OVERVIEW. Route: /influencer.
//
// Balances, the codes to share, and who came in through them. Reads only; the
// one write on the page (Request payout) goes through actions/influencers.
//
// PRIVACY IS ENFORCED HERE, not in the component: the referred-client rows are
// built with no organisation name, no email, no slug, no Stripe ids and not even
// the organisation id — see components/v3/influencer-portal/portal-data.ts. A
// field that never crosses into the DTO cannot be rendered by accident later.

import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireInfluencer } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { ledgerBalances, describeCommission } from "@/lib/commission";
import { payoutRequestRefusal } from "@/lib/payouts";
import { PayoutRequestStatus } from "@/lib/prismaEnums";
import { InfluencerOverviewContent } from "@/components/v3/influencer-portal/overview-content";
import type {
  PartnerDTO,
  PromoCodeDTO,
  ReferredClientDTO,
} from "@/components/v3/influencer-portal/portal-data";

/** "March 2026" — a month, never the day a particular business started paying. */
function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default async function InfluencerOverviewPage() {
  const partner = await requireInfluencer().catch(() => null);
  if (!partner) redirect("/influencer/login" as Route);

  const [codes, attributions, ledger, openRequest] = await Promise.all([
    db.promoCode.findMany({ where: { influencerId: partner.id }, orderBy: { createdAt: "asc" } }),
    db.attribution.findMany({
      where: { influencerId: partner.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        firstPaidInvoiceAt: true,
        createdAt: true,
        stripeSubscriptionId: true,
        promoCode: { select: { code: true } },
      },
    }),
    db.commissionLedger.findMany({
      where: { influencerId: partner.id },
      select: { entryType: true, amountCents: true, state: true },
    }),
    db.payoutRequest.findFirst({
      where: {
        influencerId: partner.id,
        status: {
          in: [PayoutRequestStatus.PENDING, PayoutRequestStatus.APPROVED, PayoutRequestStatus.PROCESSING],
        },
      },
      select: { status: true },
    }),
  ]);

  const balances = ledgerBalances(ledger);
  const appUrl = await appBaseUrl();

  // The plan comes from the Subscription mirror, joined on the Stripe id. That
  // id is used HERE and left behind: it identifies a customer at Stripe and has
  // no business crossing to the browser.
  const subIds = attributions.map((a) => a.stripeSubscriptionId);
  const subs = subIds.length
    ? await db.subscription.findMany({
        where: { externalSubId: { in: subIds } },
        select: { externalSubId: true, plan: true },
      })
    : [];
  const planByExt = new Map(subs.map((s) => [s.externalSubId, s.plan]));

  const codeDto: PromoCodeDTO[] = codes.map((c) => ({
    id: c.id,
    code: c.code,
    active: c.active,
    terms: describeCommission(c),
    customerPercentOff: c.customerPercentOff,
    clicks: c.clicks,
    shareUrl: `${appUrl}/?promo=${c.code}`,
  }));

  const clientDto: ReferredClientDTO[] = attributions.map((a) => ({
    id: a.id,
    code: a.promoCode.code,
    since: a.firstPaidInvoiceAt ? monthLabel(a.firstPaidInvoiceAt) : null,
    plan: planByExt.get(a.stripeSubscriptionId)?.toLowerCase() ?? null,
    status: a.status,
  }));

  const partnerDto: PartnerDTO = {
    displayName: partner.displayName,
    holdDays: partner.holdDays,
    minPayoutCents: partner.minPayoutCents,
    currency: partner.defaultCurrency,
    connect: { payoutsEnabled: partner.payoutsEnabled, status: partner.connectStatus },
  };

  // The same sentence the server action would answer with, from the same helper.
  const payoutReason = payoutRequestRefusal({
    payoutsEnabled: partner.payoutsEnabled,
    connectStatus: partner.connectStatus,
    minPayoutCents: partner.minPayoutCents,
    clearedCents: balances.clearedCents,
    openRequestStatus: openRequest?.status ?? null,
  });

  return (
    <InfluencerOverviewContent
      partner={partnerDto}
      balances={balances}
      codes={codeDto}
      clients={clientDto}
      payoutReason={payoutReason}
    />
  );
}
