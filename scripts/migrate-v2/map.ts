// Pure transforms from the old JobFlex shapes to v3's. No database access here, so
// every rule below can be reasoned about (and corrected) on its own.
//
// The shapes encoded here were read off the live database by probe.ts, not off the
// old schema.prisma — the old app patches its own DB outside Prisma's ledger.

export type Json = Record<string, unknown>;

const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** First value that parses as a finite number, else `fallback`. */
const firstNum = (vals: unknown[], fallback = 0): number => {
  for (const v of vals) {
    const n = num(v);
    if (n !== null) return n;
  }
  return fallback;
};

/** First non-empty trimmed string, else null. */
const firstStr = (vals: unknown[]): string | null => {
  for (const v of vals) {
    const s = str(v);
    if (s) return s;
  }
  return null;
};

export const asObject = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
export const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * The old app stored some tax rates as a fraction (0.102) and, in older rows, as a
 * percentage (10.2). v3's own validation caps taxRate at 1, and a 100x error would
 * be invisible until the first re-save, so normalise on the way in.
 */
export function normalizeTaxRate(v: unknown): number {
  const n = num(v);
  if (n === null || n <= 0) return 0;
  const rate = n > 1 ? n / 100 : n;
  return Math.min(Math.max(rate, 0), 1);
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  );
}

// ── status / role / plan maps ─────────────────────────────────────────────────

const PROPOSAL_STATUS: Record<string, string> = {
  DRAFT: "DRAFT",
  SENT: "SENT",
  VIEWED: "VIEWED",
  ACCEPTED: "ACCEPTED",
  REJECTED: "DECLINED",
  // The old app had no PAID status; a fully paid job shows as INVOICED, and
  // SCHEDULED only meant "accepted, work booked" — v3 carries that on the Job.
  INVOICED: "ACCEPTED",
  SCHEDULED: "ACCEPTED",
  /**
   * COMPLETED -> PAID, which reads backwards but is the faithful mapping.
   *
   * v3's proposals page (both viewports) has a Completed tab, and its own
   * "Mark completed" button writes `PAID` — see runStatus in
   * src/components/v3/proposals-blueprint/proposals-behavior.ts and
   * src/app/(mobile)/mobile-proposals-v2/mobile-proposals.tsx, where the mobile
   * status map literally labels PAID as "Completed". The tab filters on PAID and
   * never lists v3's COMPLETED, which means something else there: the linked job
   * finished, stamped by the worker job-status route. So the old app's terminal
   * "this job is done" state is v3's PAID, and mapping it to COMPLETED would
   * leave the proposal invisible in the tab the contractor looks for it in.
   */
  COMPLETED: "PAID",
};
export const proposalStatus = (old: string | null): string => PROPOSAL_STATUS[(old ?? "").toUpperCase()] ?? "DRAFT";

const JOB_STATUS: Record<string, string> = {
  PENDING: "SCHEDULED",
  ACCEPTED: "SCHEDULED",
  DECLINED: "CANCELED",
  CANCELLED: "CANCELED",
  CANCELED: "CANCELED",
  ARCHIVED: "CANCELED",
  COMPLETED: "COMPLETED",
};
export const jobStatus = (old: string | null): string => JOB_STATUS[(old ?? "").toUpperCase()] ?? "SCHEDULED";

/** One Job spans several JobEvents; the job's status is the consensus of theirs. */
export function jobStatusFromEvents(eventStatuses: (string | null)[]): string {
  const mapped = eventStatuses.map(jobStatus);
  if (mapped.length && mapped.every((s) => s === "COMPLETED")) return "COMPLETED";
  if (mapped.length && mapped.every((s) => s === "CANCELED")) return "CANCELED";
  return "SCHEDULED";
}

const APPOINTMENT_STATUS: Record<string, string> = {
  PROPOSED: "SCHEDULED",
  PENDING_CONFIRMATION: "SCHEDULED",
  CONFIRMED: "SCHEDULED",
  RESCHEDULE_REQUESTED: "SCHEDULED",
  PENDING: "SCHEDULED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELED",
  CANCELED: "CANCELED",
  REJECTED: "CANCELED",
  NO_SHOW: "NO_SHOW",
};
export const appointmentStatus = (old: string | null): string =>
  APPOINTMENT_STATUS[(old ?? "").toUpperCase()] ?? "SCHEDULED";

const ROLE: Record<string, string> = {
  COMPANY_OWNER: "OWNER",
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  SALES: "SALES",
  ESTIMATOR: "ESTIMATOR",
  INSTALLER: "INSTALLER",
  ACCOUNTANT: "ACCOUNTANT",
};
export const membershipRole = (old: string | null): string => ROLE[(old ?? "").toUpperCase()] ?? "USER";

/**
 * Old plan -> the v3 plan of the same name (owner's call, 2026-09-04: "same name
 * they pay for"). Names and prices differ a little between the two catalogues:
 *
 *   old STARTER      $45  -> v3 starter       $25
 *   old PROFESSIONAL $75  -> v3 professional  $79
 *   old ADVANCED     $149 -> v3 enterprise    $199  (its catalogue name IS "Advanced";
 *                                                     Stripe's product calls it Enterprise)
 *
 * This is also what Stripe's own metadata names each subscription, so the import
 * and every later Stripe sync agree. Known trade-off: v3's starter is stingier
 * than the old one (5 proposals/mo, 5 clients, 1 worker vs 15/mo, 3 workers); no
 * migrated Starter account is over any of those today, and the admin page can
 * hand-grant a higher tier per account if it ever bites.
 *
 * Upper-case on purpose: that is what signup, the admin grants and the Stripe
 * sync write, and entitlements.ts compares tier names case-sensitively.
 */
const PLAN: Record<string, string> = {
  FREE: "FREE",
  STARTER: "STARTER",
  PROFESSIONAL: "PROFESSIONAL",
  ADVANCED: "ENTERPRISE",
  ENTERPRISE: "ENTERPRISE",
};
export const planSlug = (old: string | null): string => PLAN[(old ?? "").toUpperCase()] ?? "FREE";

const SUB_STATUS: Record<string, string> = {
  INACTIVE: "FREE",
  TRIALING: "TRIALING",
  ACTIVE: "ACTIVE",
  PAST_DUE: "PAST_DUE",
  CANCELED: "CANCELED",
  CANCELLED: "CANCELED",
};
export const subscriptionStatus = (old: string | null): string => SUB_STATUS[(old ?? "").toUpperCase()] ?? "FREE";

/**
 * Mirrors src/lib/limitsEngine.ts isLapsed. A lapsed subscription silently drops the
 * org onto DEFAULT_FREE_LIMITS (3 proposals / 10 clients / 3 jobs), which would brick
 * a migrated account on arrival, so the caller reports this before writing.
 */
export function isLapsed(
  sub: { status: string; currentPeriodEnd: Date | null; trialEndsAt: Date | null },
  now = new Date(),
): boolean {
  if (sub.status === "FREE") return false;
  if (["PAST_DUE", "CANCELED", "EXPIRED"].includes(sub.status)) return true;
  if (sub.status === "TRIALING") return sub.trialEndsAt ? sub.trialEndsAt.getTime() < now.getTime() : false;
  if (sub.status === "ACTIVE" && sub.currentPeriodEnd) {
    return sub.currentPeriodEnd.getTime() + 3 * 24 * 60 * 60 * 1000 < now.getTime();
  }
  return false;
}

// ── line items ────────────────────────────────────────────────────────────────

const MEASUREMENT_PATTERNS: [RegExp, string][] = [
  [/^(sq\s*ft|sqft|square|sf)/i, "SQFT"],
  [/(linear|lin\b|^lf$)/i, "LINEAR_FT"],
  [/(cubic|^cf$|^cy$)/i, "CUBIC_FT"],
  [/(hour|^hr$|hourly)/i, "HOUR"],
  [/(lump|fixed|flat|per\s*job|^ls$)/i, "LUMP_SUM"],
];

export function measurementType(...hints: unknown[]): string {
  for (const hint of hints) {
    const s = str(hint);
    if (!s) continue;
    for (const [re, out] of MEASUREMENT_PATTERNS) if (re.test(s)) return out;
  }
  return "UNIT";
}

export interface MappedLine {
  name: string;
  description: string | null;
  measurementType: string;
  quantity: number;
  unitPrice: number;
  materialCost: number;
  laborCost: number;
  total: number;
  position: number;
}

/**
 * One old line-item blob -> one v3 LineItem.
 *
 * The pricing has to be expressed the way v3 recomputes it, or the proposal changes
 * price the first time the contractor saves it. src/lib/pricing/markup.ts
 * sellUnitPrice returns materialCost + laborCost (marked up) whenever that pair is
 * non-zero, and src/actions/proposals.ts computeTotals then does
 * `subtotal = Σ quantity × sellUnitPrice(line)`. The old blob stores material/labor
 * as LINE totals, so they must be divided by the quantity — otherwise a 22 sq ft
 * line worth $3,114 would re-price to $68,508 on the first save.
 */
export function mapLineItem(raw: unknown, position: number): MappedLine | null {
  const l = asObject(raw);
  const kind = firstStr([l.measurementType, l.pricingType, l.unit, l.uom]);
  const type = measurementType(kind, l.system);

  // sqft-priced lines carry the area in `sqft` and leave `quantity` at 0.
  const sqft = num(l.sqft);
  const qtyRaw =
    type === "SQFT" && sqft && sqft > 0 ? sqft : firstNum([l.quantity, l.qty, l.count, sqft], 0);
  const quantity = qtyRaw > 0 ? qtyRaw : 1;

  const material = firstNum([l.materialCostWithOverhead, l.materialCost, l.materials], 0);
  const labor = firstNum([l.laborCostWithOverhead, l.laborCost, l.labor], 0);
  const unitPriceRaw = firstNum([l.unitPrice, l.price, l.rate, l.unit_price], 0);

  const total = firstNum(
    [l.total, l.lineTotal, l.amount, l.fixedPrice],
    unitPriceRaw > 0 ? unitPriceRaw * quantity : material + labor,
  );

  const name =
    firstStr([l.name, l.title, l.label, l.item, l.service, l.description]) ?? `Item ${position + 1}`;
  const description = firstStr([l.description, l.notes, l.detail]);

  // Nothing priced and nothing named — a placeholder row, not a line item.
  if (total === 0 && unitPriceRaw === 0 && material + labor === 0 && !firstStr([l.name, l.title, l.label])) {
    return null;
  }

  // Split the cost pair per unit, scaled so it reconstructs `total` exactly.
  const costSum = material + labor;
  const scale = costSum > 0 ? total / costSum : 0;
  return {
    name,
    description: description && description !== name ? description : null,
    measurementType: type,
    quantity,
    unitPrice: total / quantity,
    materialCost: costSum > 0 ? (material * scale) / quantity : 0,
    laborCost: costSum > 0 ? (labor * scale) / quantity : 0,
    total,
    position,
  };
}

export interface MappedItems {
  lines: MappedLine[];
  fallback: boolean;
}

/** Line items from `lineItems` then `addOns`, sharing one index space. */
export function mapLineItems(lineItems: unknown, addOns: unknown, calc: Json, title: string): MappedItems {
  const raws = [...asArray(lineItems), ...asArray(addOns), ...asArray(calc.upsells)];
  const lines: MappedLine[] = [];
  for (const raw of raws) {
    const mapped = mapLineItem(raw, lines.length);
    if (mapped) lines.push(mapped);
  }
  if (lines.length) return { lines, fallback: false };

  // Nothing parsed: carry the money as one lump-sum line so the proposal still
  // reads correctly and re-saves to the same total.
  const subtotal = money(calc, 0).subtotal;
  return {
    lines: [
      {
        name: title || "Project",
        description: null,
        measurementType: "LUMP_SUM",
        quantity: 1,
        unitPrice: subtotal,
        materialCost: 0,
        laborCost: 0,
        total: subtotal,
        position: 0,
      },
    ],
    fallback: true,
  };
}

// ── money ─────────────────────────────────────────────────────────────────────

export interface MappedMoney {
  subtotal: number;
  discountTotal: number;
  taxRate: number;
  taxTotal: number;
  total: number;
}

/** Totals come from the old `calc` blob, never from re-summing the line items. */
export function money(calc: Json, quoteTaxRate: unknown): MappedMoney {
  const subtotal = firstNum([calc.subtotalBeforeTax, calc.preTax, calc.costSubtotal, calc.sellingPrice], 0);
  const discountTotal = Math.max(0, firstNum([calc.discountAmount], 0));
  const taxRate = normalizeTaxRate(calc.taxRate ?? quoteTaxRate);
  const taxTotal = firstNum([calc.taxAmount, calc.tax], 0);
  const total = firstNum([calc.grandTotal, calc.total, calc.sellingPrice], subtotal - discountTotal + taxTotal);
  return { subtotal, discountTotal, taxRate, taxTotal, total };
}

export interface MappedInstallment {
  label: string;
  amount: number;
  isPercent: boolean;
  position: number;
}

/**
 * `calc.schedule` is the payment split the client already agreed to
 * (Deposit 30 / Start 50 / Completion 20). Written as UNPAID percent rows with no
 * checkout reference, so the payments-reconcile cron never tries to verify them
 * against the new platform's Stripe or Square account.
 */
export function mapInstallments(calc: Json): MappedInstallment[] {
  if (calc.showPaymentSchedule === false) return [];
  return asArray(calc.schedule)
    .map((raw, i) => {
      const s = asObject(raw);
      const amount = firstNum([s.percent, s.amount, s.value], 0);
      if (amount <= 0) return null;
      return {
        label: firstStr([s.name, s.label]) ?? `Payment ${i + 1}`,
        amount,
        isPercent: s.percent !== undefined || s.isPercent === true,
        position: i,
      };
    })
    .filter((x): x is MappedInstallment => x !== null);
}

// ── photos ────────────────────────────────────────────────────────────────────

/**
 * `beforeAfterPhotos` is `{ before: [...], after: [...] }` holding a mix of base64
 * data URLs (which move with the row) and Vercel Blob URLs that live in the OLD
 * project's store — those keep resolving only while that project exists.
 */
export function mapPhotos(blob: unknown): { before: string; after: string; blobUrls: number } {
  const o = asObject(blob);
  const pick = (v: unknown) => asArray(v).filter((x): x is string => typeof x === "string" && x.length > 0);
  const before = pick(o.before);
  const after = pick(o.after);
  const blobUrls = [...before, ...after].filter((u) => u.includes("blob.vercel-storage.com")).length;
  return { before: JSON.stringify(before), after: JSON.stringify(after), blobUrls };
}

export { str, num, firstStr, firstNum };
