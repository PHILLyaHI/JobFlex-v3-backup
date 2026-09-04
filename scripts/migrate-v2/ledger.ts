// v3 names a Stripe-managed subscription's plan through its PlanPrice ledger
// (src/lib/stripeSync.ts planSlugForPrice, src/actions/adminUsers.ts
// planForStripeSub — ledger first, Stripe metadata second). The old app's prices
// are not in it, so before this seeding every sync fell back to the old price
// metadata and rewrote whatever the import had chosen.
//
// Rows go in ARCHIVED (`active: false`): checkout only ever picks an active price
// per (plan, interval), and the "at most one active price" rule is the catalogue's
// to keep. An archived row still resolves a plan name — that is all a sync needs.
import type { Writer } from "./client";
import { ledgerKey } from "./config";
import type { LedgerPrice } from "./stripe";

export interface LedgerResult {
  added: string[];
  present: number;
}

export async function ensureLegacyPriceLedger(
  writer: Writer,
  prices: LedgerPrice[],
  dryRun: boolean,
): Promise<LedgerResult> {
  const result: LedgerResult = { added: [], present: 0 };
  for (const p of prices) {
    const exists = await writer.planPrice.findUnique({
      where: { stripePriceId: p.stripePriceId },
      select: { id: true },
    });
    if (exists) {
      result.present += 1;
      continue;
    }
    result.added.push(p.stripePriceId);
    if (dryRun) continue;
    await writer.planPrice.create({
      data: {
        planSlug: p.planSlug,
        interval: p.interval,
        stripeProductId: p.stripeProductId,
        stripePriceId: p.stripePriceId,
        unitAmountCents: p.unitAmountCents,
        currency: p.currency,
        active: false,
      },
    });
  }

  // Recorded for transparency; not undone by an account rollback — a ledger
  // entry that names an old price correctly is never wrong to keep.
  if (!dryRun && result.added.length) {
    const key = ledgerKey();
    const prior = await writer.syncState.findUnique({ where: { key } });
    let previous: string[] = [];
    try {
      previous = prior ? (JSON.parse(prior.cursor) as { added: string[] }).added : [];
    } catch {
      previous = [];
    }
    const cursor = JSON.stringify({
      added: [...new Set([...previous, ...result.added])],
      updatedAt: new Date().toISOString(),
    });
    await writer.syncState.upsert({ where: { key }, create: { key, cursor }, update: { cursor } });
  }
  return result;
}
