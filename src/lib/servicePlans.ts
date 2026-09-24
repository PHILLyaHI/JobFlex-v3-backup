// SERVICE PLANS — THE PLAIN RULES (2026-09-22). Pure, no imports: what a
// plan is, when its visits fall, when it bills, what it is worth a month,
// and the wall-clock hour a visit is put on the calendar. The database side
// lives in lib/servicePlanBook.
//
// Owner (Housecall Pro comparison): "we need that too — make it smart and
// easy". A plan is sold once, then it runs itself: the seasonal visits land
// on the calendar, the invoices go out on schedule, the member's discount
// rides on every proposal, and the office hears before it expires.

export type Billing = "MONTHLY" | "YEARLY";
export type PlanStatus = "DRAFT" | "SENT" | "ACTIVE" | "EXPIRED" | "CANCELED";

export interface PlanTerms {
  name: string;
  description?: string | null;
  trade: string;
  visitsPerYear: number;
  termMonths: number;
  priceCents: number;
  billing: Billing;
  discountPct: number;
  benefits: string[];
  priorityScheduling: boolean;
  waivedDiagnostic: boolean;
}

/** The three plans a shop can start selling today; edit any number. */
export const STARTER_PLANS: Array<PlanTerms & { sortOrder: number }> = [
  {
    sortOrder: 1,
    name: "Comfort Plan",
    description: "Our most popular plan. Stay ahead of breakdowns with two seasonal tune-ups — one before cooling season, one before heating season — plus 15% off all repairs and priority emergency response.",
    trade: "hvac",
    visitsPerYear: 2,
    termMonths: 12,
    priceCents: 2100,
    billing: "MONTHLY",
    discountPct: 15,
    benefits: ["2 seasonal tune-ups a year (spring cooling, fall heating)", "15% off every repair and service", "Priority scheduling and 24-hour emergency response", "Diagnostic fee waived on covered visits", "1 filter replacement per visit"],
    priorityScheduling: true,
    waivedDiagnostic: true,
  },
  {
    sortOrder: 2,
    name: "Essential Plan",
    description: "One yearly tune-up to keep the system safe and efficient, with 10% off any repair the visit finds.",
    trade: "hvac",
    visitsPerYear: 1,
    termMonths: 12,
    priceCents: 14900,
    billing: "YEARLY",
    discountPct: 10,
    benefits: ["1 tune-up a year, before the season you use most", "10% off every repair", "Priority scheduling", "1 filter replacement at the visit"],
    priorityScheduling: true,
    waivedDiagnostic: false,
  },
  {
    sortOrder: 3,
    name: "Premium Plan",
    description: "Two seasonal tune-ups, 20% off repairs, no diagnostic fees, and the first slot when something breaks.",
    trade: "hvac",
    visitsPerYear: 2,
    termMonths: 12,
    priceCents: 2900,
    billing: "MONTHLY",
    discountPct: 20,
    benefits: ["2 seasonal tune-ups a year (spring cooling, fall heating)", "20% off every repair and service", "No diagnostic fee, ever", "Same-day priority when the system is down", "Filters included at every visit"],
    priorityScheduling: true,
    waivedDiagnostic: true,
  },
];

const MONTH = 1;
function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + months);
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out;
}
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86400000);

export function planEndsAt(startsAt: Date, termMonths: number): Date {
  return addMonths(startsAt, termMonths);
}

export interface VisitSlot {
  seq: number;
  label: string;
  /** The day of the visit, at UTC midnight; the calendar hour is the shop's (atLocalHour). */
  dueAt: Date;
}

/**
 * When the visits fall. HVAC with two visits a year is seasonal — the
 * cooling tune-up around April 15, the heating tune-up around October 1 —
 * so the first visit is the next season after signing (a day out at least —
 * the office can move it), the rest follow in order. One visit a year is the next season.
 * Anything else is spread evenly through the term, the first a month in.
 */
export function visitSchedule(startsAt: Date, termMonths: number, visitsPerYear: number, trade = "hvac"): VisitSlot[] {
  const count = Math.max(0, Math.round((visitsPerYear * termMonths) / 12));
  if (!count) return [];
  const endsAt = planEndsAt(startsAt, termMonths);
  const seasonal = trade === "hvac" && (visitsPerYear === 1 || visitsPerYear === 2);
  if (seasonal) {
    const earliest = addDays(startsAt, 1);
    const anchors: Array<{ dueAt: Date; label: string }> = [];
    for (let y = startsAt.getUTCFullYear() - 1; y <= endsAt.getUTCFullYear() + 1; y++) {
      anchors.push({ dueAt: new Date(Date.UTC(y, 3, 15)), label: "Spring cooling tune-up" });
      anchors.push({ dueAt: new Date(Date.UTC(y, 9, 1)), label: "Fall heating tune-up" });
    }
    const inTerm = anchors.filter((a) => a.dueAt >= earliest && a.dueAt < endsAt).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
    // One a year: the next season, then the same season each following year.
    const picked = visitsPerYear === 1 ? inTerm.filter((a, i) => i === 0 || a.label === inTerm[0].label) : inTerm;
    const slots = picked.slice(0, count).map((a, i) => ({ seq: i + 1, label: visitsPerYear === 1 ? `Annual tune-up (${a.label.toLowerCase().replace(" tune-up", "")})` : a.label, dueAt: a.dueAt }));
    if (slots.length === count) return slots;
    // A short term or a late signing left a gap: fill evenly after the last season.
    const from = slots.length ? slots[slots.length - 1].dueAt : startsAt;
    const left = count - slots.length;
    const step = Math.max(1, Math.floor((endsAt.getTime() - from.getTime()) / 86400000 / (left + 1)));
    for (let i = 0; i < left; i++) slots.push({ seq: slots.length + 1, label: `Tune-up visit ${slots.length + 1}`, dueAt: addDays(from, step * (i + 1)) });
    return slots;
  }
  const stepMonths = termMonths / count;
  return Array.from({ length: count }, (_, i) => ({ seq: i + 1, label: `Tune-up visit ${i + 1}`, dueAt: addMonths(startsAt, Math.round(MONTH + stepMonths * i)) }));
}

/** The next bill after `from`: monthly or yearly anniversaries. */
export function advanceBilling(from: Date, billing: Billing): Date {
  return addMonths(from, billing === "MONTHLY" ? 1 : 12);
}

/** What one bill is for: the period it covers, in the client's words. */
export function billingPeriodLabel(periodStart: Date, billing: Billing): string {
  const end = addDays(advanceBilling(periodStart, billing), -1);
  const f = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return billing === "MONTHLY" ? `${f(periodStart)} – ${f(end)}` : `${f(periodStart)} – ${f(end)} (the year)`;
}

/** Monthly recurring revenue of the active plans, in cents. */
export function mrrCents(plans: Array<{ status: string; priceCents: number; billing: string }>): number {
  return plans.filter((p) => p.status === "ACTIVE").reduce((a, p) => a + (p.billing === "YEARLY" ? Math.round(p.priceCents / 12) : p.priceCents), 0);
}

export type PlanPhase = "draft" | "sent" | "active" | "expiring" | "lapsed" | "expired" | "canceled";

/** The status the office reads: an active plan inside its last 30 days is "expiring"; past its end and not yet handled, "lapsed". */
export function planPhase(plan: { status: string; endsAt: Date | null }, now = new Date()): PlanPhase {
  if (plan.status === "ACTIVE") {
    if (plan.endsAt && plan.endsAt.getTime() <= now.getTime()) return "lapsed";
    if (plan.endsAt && plan.endsAt.getTime() - now.getTime() <= 30 * 86400000) return "expiring";
    return "active";
  }
  return plan.status.toLowerCase() as PlanPhase;
}

/** The instant when the wall clock in `timeZone` reads `hour`:00 on the calendar day of `day` (its UTC date). */
export function atLocalHour(day: Date, hour: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, 0, 0));
  try {
    const dtf = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const p = Object.fromEntries(dtf.formatToParts(guess).map((x) => [x.type, x.value])) as Record<string, string>;
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    const offsetMs = asUtc - guess.getTime();
    return new Date(guess.getTime() - offsetMs);
  } catch {
    return guess;
  }
}

export const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** "2 visits a year · 12 months · $21 a month · 15% off repairs" */
export function planTermsLine(t: { visitsPerYear: number; termMonths: number; priceCents: number; billing: string; discountPct: number }): string {
  const visits = `${t.visitsPerYear} visit${t.visitsPerYear === 1 ? "" : "s"} a year`;
  const term = t.termMonths === 12 ? "12 months" : `${t.termMonths} months`;
  const price = t.billing === "YEARLY" ? `${money(t.priceCents)} a year` : `${money(t.priceCents)} a month`;
  const off = t.discountPct > 0 ? ` · ${t.discountPct}% off repairs` : "";
  return `${visits} · ${term} · ${price}${off}`;
}

export function parseBenefits(json: string | null | undefined): string[] {
  try {
    const v = JSON.parse(json ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()).slice(0, 12) : [];
  } catch {
    return [];
  }
}

/** The crew's tune-up checklist for a visit, as the appointment's notes. */
export function tuneUpChecklist(label: string, trade = "hvac"): string {
  if (trade !== "hvac") return `${label}: inspection and maintenance per the plan.`;
  const cooling = /cooling|spring/i.test(label) || /annual.*cooling/i.test(label);
  const heating = /heating|fall/i.test(label) || /annual.*heating/i.test(label);
  const both = !cooling && !heating;
  const lines = [
    `${label} — plan visit. Bring: filters (size on the client record), coil cleaner, capacitor tester, manometer, combustion analyzer.`,
    "Thermostat: settings, batteries, calibration. Filter: replace, note the size.",
  ];
  if (cooling || both) lines.push("Cooling: condenser coil rinsed, refrigerant pressures and superheat/subcool, capacitor µF vs. plate, contactor, amps (compressor, fan), condensate drain cleared and float switch tested, ΔT across the coil, static pressure.");
  if (heating || both) lines.push("Heating: burners and igniter cleaned, flame sensor µA, heat exchanger inspected, gas pressure, CO at the register and in the flue, inducer and pressure switch, limit test, blower wheel; heat pump: defrost cycle, reversing valve, strips.");
  lines.push("Write down every reading, photograph the plates, and list anything the client should hear about (age, refrigerant, wear) — repairs at the member discount.");
  return lines.join("\n");
}
