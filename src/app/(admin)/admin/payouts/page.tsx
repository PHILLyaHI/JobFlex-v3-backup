import { requirePlatformAdmin } from "@/lib/orgContext";
import { db } from "@/lib/db";
import {
  AdminPayoutsContent,
  type PayoutRequestDTO,
  type TransferDTO,
} from "@/components/v3/admin-payouts/payouts-content";

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
    approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
  }));

  const transferDto: TransferDTO[] = transfers.map((t) => ({
    id: t.id,
    influencerName: t.influencer.displayName,
    amountCents: t.amountCents,
    status: t.status,
    stripeTransferId: t.stripeTransferId,
    failureReason: t.failureReason,
    createdAt: t.createdAt.toISOString(),
    paidAt: t.paidAt ? t.paidAt.toISOString() : null,
  }));

  return <AdminPayoutsContent requests={requestDto} transfers={transferDto} />;
}
