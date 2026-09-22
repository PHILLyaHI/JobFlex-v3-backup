// Server-only: the lines of a partner's ledger that need saying in words.
//
// A number that moved for a reason the partner did not cause — frozen by a
// customer's dispute, taken back by a lost one — reads as a mistake unless the
// page says what happened and when. These are built here, from the ledger and
// the dispute record, and shown by the portal (components/v3/influencer-portal).
// Nothing here names or identifies the customer: the dispute is "a customer",
// the payment is an amount and a date.

import { db } from "@/lib/db";
import { disputesOnCharge, readDispute } from "@/lib/stripeSync";
import { LedgerEntryState, LedgerEntryType } from "@/lib/prismaEnums";
import type { MoneyNoteDTO } from "@/components/v3/influencer-portal/portal-data";

export async function moneyNotes(influencerId: string): Promise<MoneyNoteDTO[]> {
  const [held, chargebacks] = await Promise.all([
    db.commissionLedger.findMany({
      where: { influencerId, state: LedgerEntryState.HELD },
      select: { amountCents: true, stripeChargeId: true, createdAt: true },
    }),
    db.commissionLedger.findMany({
      where: {
        influencerId,
        entryType: LedgerEntryType.REVERSED,
        idempotencyKey: { startsWith: "dispute:" },
      },
      select: { id: true, amountCents: true, createdAt: true, stripeChargeId: true, idempotencyKey: true },
    }),
  ]);

  // One line per disputed payment: its accrual and any refund reversal of it are
  // frozen together, so their sum is what the dispute is holding.
  const byCharge = new Map<string, { cents: number; firstSeen: Date }>();
  for (const r of held) {
    const key = r.stripeChargeId ?? "unknown";
    const cur = byCharge.get(key);
    if (cur) {
      cur.cents += r.amountCents;
      if (r.createdAt < cur.firstSeen) cur.firstSeen = r.createdAt;
    } else {
      byCharge.set(key, { cents: r.amountCents, firstSeen: r.createdAt });
    }
  }

  const notes: MoneyNoteDTO[] = [];
  for (const [chargeId, v] of byCharge) {
    // A payment can have had disputes before; the one holding it is the open one.
    const dispute =
      chargeId === "unknown" ? null : (await disputesOnCharge(chargeId)).find((d) => d.status === "open");
    notes.push({
      id: `held:${chargeId}`,
      kind: "held",
      amountCents: v.cents,
      date: dispute?.openedAt ?? v.firstSeen.toISOString(),
    });
  }
  for (const r of chargebacks) {
    // Dated by the day the dispute was LOST, from that dispute's record — named
    // in the row's key, dispute:<disputeId>:<accrualId> — not by the moment our
    // webhook happened to write the row.
    const disputeId = r.idempotencyKey.split(":")[1];
    const dispute = r.stripeChargeId && disputeId ? await readDispute(r.stripeChargeId, disputeId) : null;
    notes.push({
      id: r.id,
      kind: "chargeback",
      amountCents: r.amountCents,
      date: dispute?.closedAt ?? r.createdAt.toISOString(),
    });
  }
  return notes.sort((a, b) => (a.date < b.date ? 1 : -1));
}
