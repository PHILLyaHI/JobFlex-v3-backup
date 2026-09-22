import { requirePlatformAdmin } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { splitReversedRows } from "@/lib/payouts";
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
        transfers: { select: { id: true } },
      },
    }),
    db.payoutTransfer.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { influencer: { select: { displayName: true } } },
    }),
  ]);

  // What Write off would close for each reversed request — the net of the
  // commissions its transfer carried, which refunds and chargebacks since the
  // payout may have changed — so the sheet states the real amount.
  const reversedTransferIds = requests
    .filter((r) => r.status === "REVERSED")
    .flatMap((r) => r.transfers.map((t) => t.id));
  const heldRows = reversedTransferIds.length
    ? await db.commissionLedger.findMany({
        where: { payoutTransferId: { in: reversedTransferIds }, state: "REVERSED_TRANSFER" },
        select: { id: true, amountCents: true, entryType: true, stripeInvoiceId: true, payoutTransferId: true },
      })
    : [];
  const writeOff = (transferIds: string[]) => {
    const split = splitReversedRows(
      heldRows.filter((row) => row.payoutTransferId && transferIds.includes(row.payoutTransferId)),
    );
    return { closesCents: split.closesCents, standsCents: split.stands.reduce((n, row) => n + row.amountCents, 0) };
  };

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
    writeOff: r.status === "REVERSED" ? writeOff(r.transfers.map((t) => t.id)) : null,
  }));

  const transferDto: TransferDTO[] = transfers.map((t) => ({
    id: t.id,
    influencerName: t.influencer.displayName,
    amountCents: t.amountCents,
    status: t.status,
    stripeTransferId: t.stripeTransferId,
    failureReason: t.failureReason,
    partialReversal: (t.failureReason ?? "").startsWith("Partially reversed"),
    createdAt: t.createdAt.toISOString(),
    paidAt: t.paidAt ? t.paidAt.toISOString() : null,
  }));

  return <AdminPayoutsContent requests={requestDto} transfers={transferDto} />;
}
