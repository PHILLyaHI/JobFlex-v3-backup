import { requirePlatformAdmin } from "@/lib/orgContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { db } from "@/lib/db";
import { ledgerBalances } from "@/lib/commission";
import { AttributionStatus } from "@/lib/prismaEnums";
import { InfluencersClient, type InfluencerDTO } from "./influencers-client";

export default async function AdminInfluencersPage() {
  await requirePlatformAdmin();

  const influencers = await db.influencer.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      promoCodes: { orderBy: { createdAt: "asc" } },
      ledgerEntries: { select: { entryType: true, amountCents: true, state: true } },
      attributions: { select: { status: true } },
      payoutRequests: { orderBy: { createdAt: "desc" } },
    },
  });

  const dto: InfluencerDTO[] = influencers.map((inf) => ({
    id: inf.id,
    displayName: inf.displayName,
    email: inf.email,
    status: inf.status,
    connectStatus: inf.connectStatus,
    payoutsEnabled: inf.payoutsEnabled,
    minPayoutCents: inf.minPayoutCents,
    holdDays: inf.holdDays,
    notes: inf.notes,
    hasPassword: Boolean(inf.hashedPassword),
    createdAt: inf.createdAt.toISOString(),
    promoCodes: inf.promoCodes.map((p) => ({
      id: p.id,
      code: p.code,
      active: p.active,
      commissionType: p.commissionType,
      commissionRateBps: p.commissionRateBps,
      commissionFlatCents: p.commissionFlatCents,
      commissionBasis: p.commissionBasis,
      durationType: p.durationType,
      durationMonths: p.durationMonths,
      customerPercentOff: p.customerPercentOff,
      clicks: p.clicks,
    })),
    confirmedSubscribers: inf.attributions.filter((a) => a.status === AttributionStatus.ACTIVE).length,
    balances: ledgerBalances(inf.ledgerEntries),
    payoutRequests: inf.payoutRequests.map((r) => ({
      id: r.id,
      amountCents: r.amountCents,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      rejectedReason: r.rejectedReason,
    })),
  }));

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Influencers"
        description="Create affiliate accounts, issue promo codes with commission terms, and approve payouts. Commission accrues only from Stripe-confirmed charges."
      />
      <InfluencersClient influencers={dto} />
    </>
  );
}
