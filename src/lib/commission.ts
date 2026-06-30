// Pure commission math — no DB, no Stripe. Shared by the influencer/admin reads
// (balances) and the webhook accrual/reversal engine (Phase 3). All money is
// integer cents. The ledger is the source of truth; balances are derived from it.

import {
  CommissionType,
  CommissionBasis,
  PromoDurationType,
  LedgerEntryState,
  LedgerEntryType,
} from "@/lib/prismaEnums";

export interface PromoCommissionRule {
  commissionType: string; // CommissionType
  commissionRateBps?: number | null;
  commissionFlatCents?: number | null;
  commissionBasis?: string | null; // CommissionBasis
  durationType: string; // PromoDurationType
  durationMonths?: number | null;
}

export interface LedgerEntryLite {
  entryType: string; // LedgerEntryType
  amountCents: number; // signed
  state: string; // LedgerEntryState
}

export interface LedgerBalances {
  /** Accrued but still inside the hold window — not yet payable. */
  pendingCents: number;
  /** Past the hold window, non-refunded — available to pay out. */
  clearedCents: number;
  /** Total already transferred to the influencer (positive number). */
  paidOutCents: number;
  /** Gross commission ever accrued (positive accruals only). */
  lifetimeEarnedCents: number;
  /** Net of every ledger entry — the true running balance owed. */
  balanceCents: number;
}

export function ledgerBalances(entries: LedgerEntryLite[]): LedgerBalances {
  let pendingCents = 0;
  let clearedCents = 0;
  let paidOutCents = 0;
  let lifetimeEarnedCents = 0;
  let balanceCents = 0;

  for (const e of entries) {
    balanceCents += e.amountCents;
    if (e.state === LedgerEntryState.PENDING) pendingCents += e.amountCents;
    if (e.state === LedgerEntryState.CLEARED) clearedCents += e.amountCents;
    if (e.entryType === LedgerEntryType.PAID) paidOutCents += -e.amountCents;
    if (e.entryType === LedgerEntryType.ACCRUED && e.amountCents > 0) {
      lifetimeEarnedCents += e.amountCents;
    }
  }

  return { pendingCents, clearedCents, paidOutCents, lifetimeEarnedCents, balanceCents };
}

/** Commission owed on a single paid invoice, given the promo rule + the basis amount. */
export function computeCommissionCents(rule: PromoCommissionRule, basisCents: number): number {
  if (basisCents <= 0) return 0;
  if (rule.commissionType === CommissionType.PERCENT) {
    const bps = rule.commissionRateBps ?? 0;
    return Math.round((basisCents * bps) / 10000);
  }
  if (rule.commissionType === CommissionType.FLAT) {
    return Math.max(0, rule.commissionFlatCents ?? 0);
  }
  return 0;
}

/** The basis the commission is computed on — NET (collected) vs GROSS (subtotal). */
export function commissionBasisCents(
  rule: PromoCommissionRule,
  opts: { amountPaidCents: number; subtotalCents: number },
): number {
  return rule.commissionBasis === CommissionBasis.GROSS
    ? opts.subtotalCents
    : opts.amountPaidCents;
}

/**
 * Whether THIS paid invoice still falls inside the promo's commission window.
 * `qualifyingMonths` is how many paid invoices have already accrued for the
 * attribution (incremented as each accrues).
 */
export function isWithinCommissionWindow(
  rule: PromoCommissionRule,
  qualifyingMonths: number,
): boolean {
  switch (rule.durationType) {
    case PromoDurationType.ONCE:
      return qualifyingMonths < 1;
    case PromoDurationType.REPEATING:
      return qualifyingMonths < (rule.durationMonths ?? 0);
    case PromoDurationType.FOREVER:
      return true;
    default:
      return false;
  }
}

/** Human label for a commission rule, e.g. "20% · 12 months" or "$15 flat · once". */
export function describeCommission(rule: PromoCommissionRule): string {
  const amount =
    rule.commissionType === CommissionType.PERCENT
      ? `${((rule.commissionRateBps ?? 0) / 100).toFixed(rule.commissionRateBps && rule.commissionRateBps % 100 ? 1 : 0)}%`
      : `$${((rule.commissionFlatCents ?? 0) / 100).toFixed(0)} flat`;
  let duration = "";
  switch (rule.durationType) {
    case PromoDurationType.ONCE:
      duration = "once";
      break;
    case PromoDurationType.REPEATING:
      duration = `${rule.durationMonths ?? 0} months`;
      break;
    case PromoDurationType.FOREVER:
      duration = "lifetime";
      break;
  }
  return `${amount} · ${duration}`;
}
