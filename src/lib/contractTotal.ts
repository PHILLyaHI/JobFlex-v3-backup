// The CONTRACT VALUE of a proposal: what the client owes in total, which is the
// proposal's own total plus every approved change order. The proposal's
// subtotal / tax / total are never mutated by a change order (2026-09-13) —
// they are the original figures, kept for the record; the contract value is
// derived wherever money is read.
//
// Legacy rule: an APPROVED change order whose `total` is null was approved by
// the old code, which added its `amount` straight onto the proposal's total.
// Counting it again would double it, so it contributes nothing here.
//
// Pure and client-safe. Server callers get the rows from
// lib/changeOrders/extras.approvedChangeOrders.
import { fromMinor, toMinor } from "@/lib/paymentSchedule";

export interface ContractCo {
  status: string;
  total: number | null;
}

/** Σ approved change-order totals in minor units; credits (negative) count. */
export function extrasMinor(cos: readonly ContractCo[]): number {
  let n = 0;
  for (const c of cos) {
    if (c.status !== "APPROVED" || c.total == null || !Number.isFinite(c.total)) continue;
    n += toMinor(c.total);
  }
  return n;
}

export function contractTotalMinor(proposalTotal: number, cos: readonly ContractCo[]): number {
  return Math.max(0, toMinor(proposalTotal) + extrasMinor(cos));
}

export function contractTotal(proposalTotal: number, cos: readonly ContractCo[]): number {
  return fromMinor(contractTotalMinor(proposalTotal, cos));
}

/**
 * The two totals resolveSchedule needs: the contract value the client owes,
 * and the ORIGINAL proposal total that percent stages are percentages of.
 * Spread into the resolver's input at every call site.
 */
export function contractSchedule(proposalTotal: number, cos: readonly ContractCo[]): { total: number; pctBase: number } {
  return { total: contractTotal(proposalTotal, cos), pctBase: proposalTotal };
}

/** Prisma select for the rows the helpers above need. */
export const APPROVED_CO_SELECT = {
  where: { status: "APPROVED" },
  select: { id: true, status: true, total: true, amount: true, number: true, title: true },
} as const;
