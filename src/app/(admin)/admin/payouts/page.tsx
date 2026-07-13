import { requirePlatformAdmin } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { PayoutsClient, type PayoutRequestDTO, type TransferDTO } from "./payouts-client";

export default async function AdminPayoutsPage() {
  await requirePlatformAdmin();

  const [requests, transfers] = await Promise.all([
    db.payoutRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        influencer: {
          select: { displayName: true, email: true, payoutsEnabled: true, connectStatus: true },
        },
      },
    }),
    db.payoutTransfer.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { influencer: { select: { displayName: true } } },
    }),
  ]);

  const requestDto: PayoutRequestDTO[] = requests.map((r) => ({
    id: r.id,
    influencerName: r.influencer.displayName,
    influencerEmail: r.influencer.email,
    payoutsEnabled: r.influencer.payoutsEnabled,
    amountCents: r.amountCents,
    status: r.status,
    rejectedReason: r.rejectedReason,
    createdAt: r.createdAt.toISOString(),
  }));

  const transferDto: TransferDTO[] = transfers.map((t) => ({
    id: t.id,
    influencerName: t.influencer.displayName,
    amountCents: t.amountCents,
    status: t.status,
    stripeTransferId: t.stripeTransferId,
    failureReason: t.failureReason,
    createdAt: t.createdAt.toISOString(),
  }));

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Payouts"
        description="Approve partner payout requests. Approved requests are transferred to their Stripe Connect account by the daily payout cron."
      />
      <PayoutsClient requests={requestDto} transfers={transferDto} />
    </>
  );
}
