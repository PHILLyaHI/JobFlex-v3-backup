// Open-checkout bookkeeping: a PENDING installment holds the provider +
// session/link it was minted with. When the schedule changes, the contractor
// disconnects, or a checkout goes stale, the session is expired at the
// provider and the stage goes back to UNPAID. A session that turns out to be
// already COMPLETE is left alone — the webhook / reconcile path settles it.
import { db } from "@/lib/db";
import { InstallmentStatus } from "@/lib/prismaEnums";
import { expireStripeSession } from "./stripeConnect";
import { deleteSquarePaymentLink } from "./squareConnect";

type PendingRow = {
  id: string;
  checkoutProvider: string | null;
  checkoutRef: string | null;
  proposal: { organizationId: string };
};

async function expireOne(row: PendingRow): Promise<"released" | "paid" | "kept"> {
  if (!row.checkoutRef || !row.checkoutProvider) {
    await release([row.id]);
    return "released";
  }
  const conn = await db.paymentConnection.findUnique({
    where: {
      organizationId_provider: {
        organizationId: row.proposal.organizationId,
        provider: row.checkoutProvider,
      },
    },
  });
  if (row.checkoutProvider === "STRIPE") {
    const r = conn ? await expireStripeSession(conn, row.checkoutRef) : "unavailable";
    if (r === "complete") return "paid";
    await release([row.id]);
    return "released";
  }
  if (row.checkoutProvider === "SQUARE") {
    if (conn) await deleteSquarePaymentLink(conn, row.checkoutRef);
    // A Square link that was already paid produced a payment.updated; the
    // stage is PAID by then and never reaches this function.
    await release([row.id]);
    return "released";
  }
  await release([row.id]);
  return "released";
}

async function release(ids: string[]) {
  if (!ids.length) return;
  await db.installment.updateMany({
    where: { id: { in: ids }, status: InstallmentStatus.PENDING },
    data: {
      status: InstallmentStatus.UNPAID,
      checkoutProvider: null,
      checkoutRef: null,
      checkoutOrderId: null,
      checkoutOpenedAt: null,
    },
  });
}

export async function expireOpenCheckoutsForProposal(
  proposalId: string,
  opts: { except?: string[] } = {},
): Promise<{ released: number; paid: number }> {
  const rows = await db.installment.findMany({
    where: { proposalId, status: InstallmentStatus.PENDING, id: { notIn: opts.except ?? [] } },
    select: {
      id: true,
      checkoutProvider: true,
      checkoutRef: true,
      proposal: { select: { organizationId: true } },
    },
  });
  return expireRows(rows);
}

export async function expireOpenCheckoutsForOrg(
  organizationId: string,
  provider?: "STRIPE" | "SQUARE",
): Promise<{ released: number; paid: number }> {
  const rows = await db.installment.findMany({
    where: {
      status: InstallmentStatus.PENDING,
      proposal: { organizationId },
      ...(provider ? { checkoutProvider: provider } : {}),
    },
    select: {
      id: true,
      checkoutProvider: true,
      checkoutRef: true,
      proposal: { select: { organizationId: true } },
    },
  });
  return expireRows(rows);
}

async function expireRows(rows: PendingRow[]) {
  // Group by checkoutRef so a "pay remaining" session (N stages, one ref) is
  // expired once and every stage it held is released together.
  const byRef = new Map<string, PendingRow[]>();
  for (const r of rows) {
    const key = `${r.checkoutProvider ?? ""}:${r.checkoutRef ?? r.id}`;
    byRef.set(key, [...(byRef.get(key) ?? []), r]);
  }
  let released = 0;
  let paid = 0;
  for (const group of byRef.values()) {
    const outcome = await expireOne(group[0]);
    if (outcome === "paid") {
      paid += group.length;
      continue;
    }
    await release(group.map((g) => g.id));
    released += group.length;
  }
  return { released, paid };
}

/** Stale PENDING rows with no ref (a mint that crashed) or older than the
 *  provider expiry get released without a provider call. */
export async function releaseStaleClaims(olderThanMs = 60 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const r = await db.installment.updateMany({
    where: {
      status: InstallmentStatus.PENDING,
      OR: [{ checkoutRef: null }, { checkoutOpenedAt: { lt: cutoff } }],
    },
    data: {
      status: InstallmentStatus.UNPAID,
      checkoutProvider: null,
      checkoutRef: null,
      checkoutOrderId: null,
      checkoutOpenedAt: null,
    },
  });
  return r.count;
}
