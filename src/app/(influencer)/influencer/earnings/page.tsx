// PARTNER PORTAL — EARNINGS. Route: /influencer/earnings.
//
// The ledger grouped by month, with accruals and refund reversals kept apart
// rather than netted, because "March was smaller than I counted" is answered by
// the deduction being visible.
//
// PAID entries are excluded from the monthly figures on purpose: a payout is not
// a month's earnings leaving, it is money already earned being moved. It shows on
// /influencer/payouts, where it belongs.

import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireInfluencer } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { ledgerBalances } from "@/lib/commission";
import { LedgerEntryType } from "@/lib/prismaEnums";
import { moneyNotes } from "@/lib/influencerNotes";
import { InfluencerEarningsContent } from "@/components/v3/influencer-portal/earnings-content";
import type { MonthEarningsDTO, PartnerDTO } from "@/components/v3/influencer-portal/portal-data";

export default async function InfluencerEarningsPage() {
  const partner = await requireInfluencer().catch(() => null);
  if (!partner) redirect("/influencer/login" as Route);

  const ledger = await db.commissionLedger.findMany({
    where: { influencerId: partner.id },
    select: { entryType: true, amountCents: true, state: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const balances = ledgerBalances(ledger);
  const notes = await moneyNotes(partner.id);

  const byMonth = new Map<string, { accrued: number; reversed: number }>();
  for (const e of ledger) {
    // A payout — and the ADJUSTMENT that offsets one Stripe reversed, or records
    // its write-off — moves money already earned; it is not a month's earnings.
    if (e.entryType === LedgerEntryType.PAID || e.entryType === LedgerEntryType.ADJUSTMENT) continue;
    const d = e.createdAt;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const row = byMonth.get(key) ?? { accrued: 0, reversed: 0 };
    // Signed amounts: accruals are positive, reversals negative. An ADJUSTMENT
    // lands on whichever side its sign puts it, which is the honest reading.
    if (e.amountCents >= 0) row.accrued += e.amountCents;
    else row.reversed += -e.amountCents;
    byMonth.set(key, row);
  }

  const months: MonthEarningsDTO[] = [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, v]) => ({
      key,
      label: new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
      accruedCents: v.accrued,
      reversedCents: v.reversed,
      netCents: v.accrued - v.reversed,
    }));

  const partnerDto: PartnerDTO = {
    displayName: partner.displayName,
    holdDays: partner.holdDays,
    minPayoutCents: partner.minPayoutCents,
    currency: partner.defaultCurrency,
    connect: { payoutsEnabled: partner.payoutsEnabled, status: partner.connectStatus },
  };

  return <InfluencerEarningsContent partner={partnerDto} balances={balances} months={months} notes={notes} />;
}
