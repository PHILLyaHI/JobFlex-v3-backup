// PAYMENT SCHEDULE — the one place money is derived from a proposal's
// installments. Pure: no db, no "use server", no Stripe. Imported by the
// builders (preview + lock warnings), the public portal (what the client can
// pay), the pay routes (what to charge) and the settle path (what a landed
// payment covers). Every amount here is an integer in minor units (cents) so
// three 33.33% stages add up to the total to the cent.
//
// Rules of record:
//   · A PAID/WAIVED stage is FROZEN at `paidAmount`. Editing the proposal
//     total never recomputes it.
//   · Unpaid percent stages recompute from the CURRENT total (largest-
//     remainder rounding); unpaid fixed stages keep their amount.
//   · `remainingMinor = total − paid` is authoritative. The stages are a
//     suggestion of how to split it; if they over-schedule, the last ones
//     clamp; if they under-schedule, a synthetic "Balance" row appears.
//   · Stages are paid in order: only the earliest UNPAID/PENDING stage is
//     `payable`, plus "pay remaining" for everything at once.

export type StageStatus = "UNPAID" | "PENDING" | "PAID" | "WAIVED";
export type PayProvider = "STRIPE" | "SQUARE";

export interface StageInput {
  id: string;
  label: string;
  amount: number;
  isPercent: boolean;
  position: number;
  status?: string | null;
  paidAmount?: number | null;
}

export interface ResolvedStage {
  id: string;
  label: string;
  position: number;
  status: StageStatus;
  isPercent: boolean;
  /** Percent of total for percent stages (display), else null. */
  pct: number | null;
  /** What this stage is worth right now (frozen when PAID/WAIVED). */
  amountMinor: number;
  paidAmountMinor: number;
  /** True only for the earliest unpaid stage with money on it. */
  payable: boolean;
  /** Synthetic rows (implicit full-payment / balance) have no DB row. */
  synthetic: boolean;
}

export interface ResolvedSchedule {
  currency: string;
  totalMinor: number;
  paidMinor: number;
  /** total − paid. What the client still owes, whatever the stages say. */
  remainingMinor: number;
  /** Sum of unpaid stage amounts after clamping to `remainingMinor`. */
  scheduledUnpaidMinor: number;
  /** paid + raw unpaid − total. >0 over-scheduled, <0 under-scheduled, 0 exact. */
  mismatchMinor: number;
  /** remaining − scheduledUnpaid when the stages under-schedule. */
  balanceMinor: number;
  hasBalanceRow: boolean;
  stages: ResolvedStage[];
  nextPayableId: string | null;
  /** No DB installments: one synthetic 100% stage stands in. */
  implicit: boolean;
  /** How many DB-backed stages are still collectable. */
  unpaidCount: number;
}

export const IMPLICIT_STAGE_ID = "__total__";
export const BALANCE_STAGE_ID = "__balance__";
export const IMPLICIT_STAGE_LABEL = "Full payment";
export const BALANCE_STAGE_LABEL = "Balance";

/** Provider minimum charge in minor units (USD). Stripe $0.50, Square $1.00. */
export const MIN_MINOR: Record<PayProvider, number> = { STRIPE: 50, SQUARE: 100 };

export function toMinor(dollars: number): number {
  return Math.round((Number.isFinite(dollars) ? dollars : 0) * 100);
}
export function fromMinor(minor: number): number {
  return Math.round(minor) / 100;
}

function normStatus(s: string | null | undefined): StageStatus {
  return s === "PAID" || s === "PENDING" || s === "WAIVED" ? s : "UNPAID";
}

export function resolveSchedule(input: {
  total: number;
  currency?: string;
  installments: StageInput[];
}): ResolvedSchedule {
  const currency = (input.currency ?? "USD").toUpperCase();
  const totalMinor = Math.max(0, toMinor(input.total));
  const sorted = [...input.installments].sort((a, b) => a.position - b.position);

  const implicit = sorted.length === 0;
  const source: StageInput[] = implicit
    ? [
        {
          id: IMPLICIT_STAGE_ID,
          label: IMPLICIT_STAGE_LABEL,
          amount: 100,
          isPercent: true,
          position: 0,
          status: "UNPAID",
        },
      ]
    : sorted;

  // ── settled stages: frozen ────────────────────────────────────────────
  const stages: ResolvedStage[] = source.map((s) => {
    const status = normStatus(s.status);
    const settled = status === "PAID" || status === "WAIVED";
    const paidAmountMinor = status === "PAID" ? Math.max(0, toMinor(s.paidAmount ?? 0)) : 0;
    return {
      id: s.id,
      label: s.label,
      position: s.position,
      status,
      isPercent: s.isPercent,
      pct: s.isPercent ? s.amount : null,
      amountMinor: settled ? paidAmountMinor : 0, // unpaid filled below
      paidAmountMinor,
      payable: false,
      synthetic: s.id === IMPLICIT_STAGE_ID,
    };
  });

  const paidMinor = stages.reduce((n, s) => n + (s.status === "PAID" ? s.paidAmountMinor : 0), 0);
  const remainingMinor = Math.max(0, totalMinor - paidMinor);

  // ── unpaid percent stages: largest-remainder over the current total ───
  const unpaid = stages.filter((s) => s.status === "UNPAID" || s.status === "PENDING");
  const pctStages = unpaid.filter((s) => s.isPercent);
  if (pctStages.length) {
    const sumPct = pctStages.reduce((n, s) => n + (s.pct ?? 0), 0);
    const target = Math.round((totalMinor * sumPct) / 100);
    const raws = pctStages.map((s) => (totalMinor * (s.pct ?? 0)) / 100);
    const floors = raws.map((r) => Math.floor(r));
    let leftover = target - floors.reduce((n, f) => n + f, 0);
    const order = raws
      .map((r, i) => ({ i, frac: r - Math.floor(r) }))
      .sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (const { i } of order) {
      if (leftover <= 0) break;
      floors[i] += 1;
      leftover -= 1;
    }
    pctStages.forEach((s, i) => {
      s.amountMinor = Math.max(0, floors[i]);
    });
  }
  for (const s of unpaid) {
    if (!s.isPercent) s.amountMinor = Math.max(0, toMinor(source.find((x) => x.id === s.id)!.amount));
  }

  const rawUnpaid = unpaid.reduce((n, s) => n + s.amountMinor, 0);
  const mismatchMinor = paidMinor + rawUnpaid - totalMinor;

  // ── clamp in order so Σ unpaid ≤ remaining ────────────────────────────
  let running = 0;
  for (const s of unpaid) {
    const allowed = Math.max(0, remainingMinor - running);
    if (s.amountMinor > allowed) s.amountMinor = allowed;
    running += s.amountMinor;
  }
  const scheduledUnpaidMinor = running;
  const balanceMinor = Math.max(0, remainingMinor - scheduledUnpaidMinor);
  const hasBalanceRow = balanceMinor > 0;

  const next = unpaid.find((s) => s.amountMinor > 0) ?? null;
  if (next) next.payable = true;

  return {
    currency,
    totalMinor,
    paidMinor,
    remainingMinor,
    scheduledUnpaidMinor,
    mismatchMinor,
    balanceMinor,
    hasBalanceRow,
    stages,
    nextPayableId: next?.id ?? null,
    implicit,
    unpaidCount: unpaid.filter((s) => s.amountMinor > 0).length,
  };
}

export type PayTarget = { installmentId: string } | "remaining";

export class NotPayableError extends Error {
  constructor(
    public readonly reason:
      | "nothing_due"
      | "not_next"
      | "unknown_stage"
      | "already_paid"
      | "zero_amount",
  ) {
    super(`Stage not payable: ${reason}`);
    this.name = "NotPayableError";
  }
}

export interface PayAmount {
  kind: "installment" | "remaining";
  amountMinor: number;
  /** DB-backed stage ids this charge covers (synthetic ids excluded). */
  installmentIds: string[];
  label: string;
}

/** What to charge for a target. Enforces the sequential rule. */
export function amountForTarget(schedule: ResolvedSchedule, target: PayTarget): PayAmount {
  if (schedule.remainingMinor <= 0) throw new NotPayableError("nothing_due");
  if (target === "remaining") {
    const ids = schedule.stages
      .filter((s) => (s.status === "UNPAID" || s.status === "PENDING") && s.amountMinor > 0)
      .map((s) => s.id);
    return {
      kind: "remaining",
      amountMinor: schedule.remainingMinor,
      installmentIds: ids.filter((id) => id !== IMPLICIT_STAGE_ID),
      label: ids.length > 1 || schedule.hasBalanceRow ? "Remaining balance" : stageLabel(schedule, ids[0]),
    };
  }
  const stage = schedule.stages.find((s) => s.id === target.installmentId);
  if (!stage) throw new NotPayableError("unknown_stage");
  if (stage.status === "PAID" || stage.status === "WAIVED") throw new NotPayableError("already_paid");
  if (stage.amountMinor <= 0) throw new NotPayableError("zero_amount");
  if (schedule.nextPayableId !== stage.id) throw new NotPayableError("not_next");
  return {
    kind: "installment",
    amountMinor: stage.amountMinor,
    installmentIds: stage.id === IMPLICIT_STAGE_ID ? [] : [stage.id],
    label: stage.label,
  };
}

function stageLabel(schedule: ResolvedSchedule, id: string | undefined): string {
  return schedule.stages.find((s) => s.id === id)?.label ?? "Payment";
}

export interface PaymentApplication {
  /** Stages fully covered → PAID at this many cents. */
  markPaid: { id: string; paidAmountMinor: number }[];
  /** A stage only partly covered: record the paid part as its own PAID row
   *  and shrink the original to a fixed remainder. */
  split: { id: string; paidPartMinor: number; remainderMinor: number } | null;
  /** When the payment covered money no stage was holding (balance row) and
   *  no stage was marked in this pass — needs a new PAID "Balance" row. */
  newBalanceStage: { paidAmountMinor: number } | null;
  /** Money beyond what the proposal owes. Never dropped; flagged for refund. */
  unappliedMinor: number;
  /** Stages left unpaid after this payment closed out the proposal. */
  waive: string[];
  /** paid + applied ≥ total. */
  settlesProposal: boolean;
}

/**
 * Greedy, in position order, over the CURRENT schedule. Used when a landed
 * payment cannot be trusted to line up 1:1 with the stages it was minted for
 * (schedule edited under it, second tab paid, manual amount).
 */
export function applyPaymentToSchedule(
  schedule: ResolvedSchedule,
  amountMinor: number,
): PaymentApplication {
  let left = Math.max(0, Math.round(amountMinor));
  const markPaid: PaymentApplication["markPaid"] = [];
  let split: PaymentApplication["split"] = null;
  const unpaid = schedule.stages.filter(
    (s) => (s.status === "UNPAID" || s.status === "PENDING") && !s.synthetic,
  );

  for (const s of unpaid) {
    if (left <= 0) break;
    if (s.amountMinor <= 0) continue;
    if (left >= s.amountMinor) {
      markPaid.push({ id: s.id, paidAmountMinor: s.amountMinor });
      left -= s.amountMinor;
    } else {
      split = { id: s.id, paidPartMinor: left, remainderMinor: s.amountMinor - left };
      left = 0;
    }
  }

  // Money the stages were not holding (under-scheduled balance, or the
  // implicit stage) sticks to the last stage we marked, or becomes its own row.
  const owedBeyondStages = Math.max(
    0,
    schedule.remainingMinor - unpaid.reduce((n, s) => n + s.amountMinor, 0),
  );
  let newBalanceStage: PaymentApplication["newBalanceStage"] = null;
  if (left > 0 && owedBeyondStages > 0) {
    const take = Math.min(left, owedBeyondStages);
    if (markPaid.length) markPaid[markPaid.length - 1].paidAmountMinor += take;
    else newBalanceStage = { paidAmountMinor: take };
    left -= take;
  }
  const appliedMinor = Math.max(0, Math.round(amountMinor)) - left;
  const settlesProposal = schedule.paidMinor + appliedMinor >= schedule.totalMinor;

  const markedIds = new Set(markPaid.map((m) => m.id));
  const waive = settlesProposal
    ? unpaid.filter((s) => !markedIds.has(s.id) && s.id !== split?.id).map((s) => s.id)
    : [];

  return { markPaid, split, newBalanceStage, unappliedMinor: left, waive, settlesProposal };
}

/** JobFlex's cut, in minor units. Stripe: ≤ amount. Square: ≤ 90% of amount. */
export function platformFeeMinor(amountMinor: number, provider: PayProvider, bps: number): number {
  const raw = Math.floor((Math.max(0, amountMinor) * Math.max(0, bps)) / 10_000);
  const cap = provider === "SQUARE" ? Math.floor(amountMinor * 0.9) : amountMinor;
  return Math.max(0, Math.min(raw, cap));
}

export function isBelowMin(amountMinor: number, provider: PayProvider): boolean {
  return amountMinor > 0 && amountMinor < MIN_MINOR[provider];
}

/** Did anything a client could be asked to pay change? Drives scheduleVersion. */
export function diffUnpaid(before: ResolvedSchedule, after: ResolvedSchedule): boolean {
  const pick = (s: ResolvedSchedule) =>
    s.stages
      .filter((x) => x.status === "UNPAID" || x.status === "PENDING")
      .map((x) => `${x.id}|${x.label}|${x.amountMinor}|${x.isPercent ? 1 : 0}`)
      .join("\n");
  return pick(before) !== pick(after) || before.remainingMinor !== after.remainingMinor;
}

/** Percent share a stage represents of the total, for display ("30%"). */
export function stageShare(stage: ResolvedStage, totalMinor: number): string {
  if (stage.pct !== null) return `${trimPct(stage.pct)}%`;
  if (totalMinor <= 0) return "";
  return `${trimPct((stage.amountMinor / totalMinor) * 100)}%`;
}
function trimPct(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}
