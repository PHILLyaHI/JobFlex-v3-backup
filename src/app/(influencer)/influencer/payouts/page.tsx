// PARTNER PORTAL — PAYOUTS. Route: /influencer/payouts.
//
// The Connect status, what can be requested now, the requests and the transfers
// they became. A declined request carries its reason and a failed transfer its
// failure — both are already on the record, and a status word with no sentence
// beside it is what makes a partner write in.
//
// The Stripe transfer id is deliberately NOT sent to the browser: it is a handle
// on our platform account, and a partner sees their own transfers in their own
// Stripe dashboard. Amount, date and status are what this page is for.

import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireInfluencer } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { ledgerBalances } from "@/lib/commission";
import { payoutRequestRefusal } from "@/lib/payouts";
import { PayoutRequestStatus } from "@/lib/prismaEnums";
import { InfluencerPayoutsContent } from "@/components/v3/influencer-portal/payouts-content";
import type {
  PartnerDTO,
  PayoutRequestDTO,
  TransferDTO,
} from "@/components/v3/influencer-portal/portal-data";

export default async function InfluencerPayoutsPage() {
  const partner = await requireInfluencer().catch(() => null);
  if (!partner) redirect("/influencer/login" as Route);

  const [ledger, requests, transfers] = await Promise.all([
    db.commissionLedger.findMany({
      where: { influencerId: partner.id },
      select: { entryType: true, amountCents: true, state: true },
    }),
    db.payoutRequest.findMany({
      where: { influencerId: partner.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        amountCents: true,
        status: true,
        rejectedReason: true,
        createdAt: true,
        approvedAt: true,
      },
    }),
    db.payoutTransfer.findMany({
      where: { influencerId: partner.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        amountCents: true,
        status: true,
        failureReason: true,
        createdAt: true,
        paidAt: true,
      },
    }),
  ]);

  const balances = ledgerBalances(ledger);
  const openRequest = requests.find((r) =>
    [PayoutRequestStatus.PENDING, PayoutRequestStatus.APPROVED, PayoutRequestStatus.PROCESSING].includes(
      r.status as never,
    ),
  );

  const requestDto: PayoutRequestDTO[] = requests.map((r) => ({
    id: r.id,
    amountCents: r.amountCents,
    status: r.status,
    rejectedReason: r.rejectedReason,
    createdAt: r.createdAt.toISOString(),
    approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
  }));

  const transferDto: TransferDTO[] = transfers.map((t) => ({
    id: t.id,
    amountCents: t.amountCents,
    status: t.status,
    failureReason: t.failureReason,
    createdAt: t.createdAt.toISOString(),
    paidAt: t.paidAt ? t.paidAt.toISOString() : null,
  }));

  const partnerDto: PartnerDTO = {
    displayName: partner.displayName,
    holdDays: partner.holdDays,
    minPayoutCents: partner.minPayoutCents,
    currency: partner.defaultCurrency,
    connect: { payoutsEnabled: partner.payoutsEnabled, status: partner.connectStatus },
  };

  const payoutReason = payoutRequestRefusal({
    payoutsEnabled: partner.payoutsEnabled,
    connectStatus: partner.connectStatus,
    minPayoutCents: partner.minPayoutCents,
    clearedCents: balances.clearedCents,
    openRequestStatus: openRequest?.status ?? null,
  });

  return (
    <InfluencerPayoutsContent
      partner={partnerDto}
      balances={balances}
      requests={requestDto}
      transfers={transferDto}
      payoutReason={payoutReason}
    />
  );
}
