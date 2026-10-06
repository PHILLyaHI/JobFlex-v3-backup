// THE INVESTOR FIGURES (owner, 2026-10-06): "how much we spend on ads, how
// many users we get on free trial, what is projected if all pay, what is
// realistic — say 60% — and the main thing: how soon we cover the ad spend
// with the trials' potential, the accounts already paying, and the ones
// projected to pay." Pure: dates and cents in, figures and a day-by-day
// curve out. The server gathers the rows (lib/investors); this decides what
// they mean, and the QA script pins every rule.
//
// THE CURVE. Each day from the ad launch to the horizon has three running
// totals:
//   · ad spend — every dollar booked so far, then the projected daily spend;
//   · revenue if every trial pays — each paying account earns its monthly
//     price a thirtieth a day from the day it started paying; each trial
//     earns from the day its trial ends; signups still to come arrive at the
//     recent pace, start their trial, and pay from the day it ends;
//   · realistic revenue — the same, with only the realistic share of trials
//     (the owner's percentage, 60 by default) paying.
// The break-even is the first day realistic revenue stands at or above the
// spend. Revenue is at LIST price per month, not Stripe's collections:
// discounts, taxes and churn are not modelled — the page says so.

/** Where an ad dollar went. Pure, so the admin page (a client component) can list it. */
export const PLATFORMS = ["meta", "google", "tiktok", "other"] as const;
export type SpendPlatform = (typeof PLATFORMS)[number];
export const PLATFORM_LABEL: Record<SpendPlatform, string> = { meta: "Meta (Facebook · Instagram)", google: "Google", tiktok: "TikTok", other: "Other" };

export interface SpendDay {
  /** YYYY-MM-DD, in the page's zone. */
  date: string;
  cents: number;
}
export interface PayingAccount {
  /** The day it started paying, YYYY-MM-DD. */
  startedAt: string;
  monthlyCents: number;
}
export interface TrialAccount {
  createdAt: string;
  /** The day the trial ends (pays from then), YYYY-MM-DD; null = unknown, read as createdAt + trialDays. */
  endsAt: string | null;
  /** null = no price on record; counted, not valued. */
  monthlyCents: number | null;
  /** The behaviour model's chance (lib/trialProjection), for the "by behaviour" reading. */
  chance: number;
}
export interface InvestorAssumptions {
  /** The share of trials that will pay, 0–100. The owner's number. */
  realisticPct: number;
  /** Projected ad spend per day from tomorrow; null = the recent average. */
  spendPerDayCents: number | null;
  /** How far the curve runs past today. */
  horizonDays: number;
  /** A trial's length, days. */
  trialDays: number;
}
export interface ModelInput {
  since: string;
  today: string;
  spend: SpendDay[];
  paying: PayingAccount[];
  trials: TrialAccount[];
  /** Trials that ended with no payment — the record the realistic share is checked against. */
  lapsed: number;
  assumptions: InvestorAssumptions;
  /** Unique visitors since the launch, when the analytics answered. */
  visitors: number | null;
}

export interface CurvePoint {
  date: string;
  spendCents: number;
  allPayCents: number;
  realisticCents: number;
  /** Past today: projected, not booked. */
  projected: boolean;
}

export interface InvestorFigures {
  since: string;
  today: string;
  daysLive: number;
  spend: { totalCents: number; perDayRecentCents: number; perDayProjectedCents: number; daysWithSpend: number; lastDate: string | null };
  visitors: number | null;
  signups: number;
  trials: { count: number; priced: number; maxMrrCents: number; realisticMrrCents: number; byBehaviourMrrCents: number; byBehaviourPct: number | null; avgMonthlyCents: number };
  paying: { count: number; mrrCents: number; arrCents: number; revenueToDateCents: number };
  lapsed: number;
  /** Trials that already ended: paid vs lapsed, the observed share. */
  observed: { paid: number; lapsed: number; pct: number | null };
  projected: { mrrAllPayCents: number; mrrRealisticCents: number; mrrByBehaviourCents: number };
  unit: {
    costPerVisitorCents: number | null;
    costPerSignupCents: number | null;
    costPerPayingRealisticCents: number | null;
    visitorToSignupPct: number | null;
    signupsPerDay: number;
    /** Spend ÷ realistic monthly revenue — months to recover the spend at today's run rate. */
    paybackMonths: number | null;
    /** Revenue to date at list price ÷ spend to date. */
    returnToDatePct: number | null;
  };
  breakEven: { date: string | null; daysFromToday: number | null; withinHorizon: boolean };
  curve: CurvePoint[];
}

const DAY_MS = 86_400_000;
export const dayOf = (iso: string) => iso.slice(0, 10);
const toMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (date: string, n: number) => toDate(toMs(date) + n * DAY_MS);
export const daysBetween = (from: string, to: string) => Math.round((toMs(to) - toMs(from)) / DAY_MS);
const clampPct = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));
const r0 = (n: number) => Math.round(n);

/** The recent pace of something that happened on `dates`: per day over the last `window` days (or since the launch, when younger). */
export function perDay(dates: readonly string[], since: string, today: string, window = 7): number {
  const live = Math.max(1, daysBetween(since, today) + 1);
  const span = Math.min(window, live);
  const from = addDays(today, -(span - 1));
  const n = dates.filter((d) => d >= from && d <= today).length;
  return n / span;
}

export function investorFigures(input: ModelInput): InvestorFigures {
  const { since, today, assumptions: a } = input;
  const pct = clampPct(a.realisticPct) / 100;
  const horizon = Math.max(30, Math.min(730, Math.round(a.horizonDays) || 180));
  const trialDays = Math.max(1, Math.min(90, Math.round(a.trialDays) || 7));
  const daysLive = Math.max(1, daysBetween(since, today) + 1);

  // ── spend
  const spendByDay = new Map<string, number>();
  for (const s of input.spend) if (s.date >= since && s.date <= today && s.cents > 0) spendByDay.set(s.date, (spendByDay.get(s.date) ?? 0) + s.cents);
  const totalSpend = [...spendByDay.values()].reduce((x, y) => x + y, 0);
  const recentFrom = addDays(today, -6);
  const recentDays = Math.min(7, daysLive);
  const recentSpend = [...spendByDay].filter(([d]) => d >= recentFrom).reduce((x, [, c]) => x + c, 0);
  const perDayRecent = r0(recentSpend / recentDays);
  const perDayProjected = a.spendPerDayCents !== null && Number.isFinite(a.spendPerDayCents) ? Math.max(0, r0(a.spendPerDayCents)) : perDayRecent;
  const spendDates = [...spendByDay.keys()].sort();

  // ── trials and paying
  const trials = input.trials;
  const priced = trials.filter((t) => t.monthlyCents !== null);
  const maxMrr = priced.reduce((x, t) => x + (t.monthlyCents ?? 0), 0);
  const byBehaviour = priced.reduce((x, t) => x + r0((t.monthlyCents ?? 0) * t.chance), 0);
  const avgTrialMonthly = priced.length ? r0(maxMrr / priced.length) : 0;
  const payingMrr = input.paying.reduce((x, p) => x + p.monthlyCents, 0);
  const revenueToDate = input.paying.reduce((x, p) => x + r0((p.monthlyCents * Math.max(0, daysBetween(p.startedAt, today) + 1)) / 30), 0);
  const signups = trials.length + input.paying.length + input.lapsed;
  const signupsPerDay = perDay([...trials.map((t) => t.createdAt), ...input.paying.map((p) => p.startedAt)].map(dayOf), since, today);
  const observedPaid = input.paying.length;
  const observedDone = observedPaid + input.lapsed;

  // ── the curve
  const trialEnd = (t: TrialAccount) => {
    const end = t.endsAt ? dayOf(t.endsAt) : addDays(dayOf(t.createdAt), trialDays);
    // A trial past its end that is still a trial pays, if it pays, from today.
    return end < today ? today : end;
  };
  const curve: CurvePoint[] = [];
  let spendRun = 0;
  let allRun = 0;
  let realRun = 0;
  const last = addDays(today, horizon);
  const futureCohorts: number[] = []; // monthly cents paying from each future day, all-pay basis
  for (let d = since; d <= last; d = addDays(d, 1)) {
    const projected = d > today;
    spendRun += projected ? perDayProjected : (spendByDay.get(d) ?? 0);
    let allDay = 0;
    let realDay = 0;
    for (const p of input.paying) if (dayOf(p.startedAt) <= d) { allDay += p.monthlyCents; realDay += p.monthlyCents; }
    for (const t of priced) if (trialEnd(t) <= d) { allDay += t.monthlyCents ?? 0; realDay += (t.monthlyCents ?? 0) * pct; }
    if (projected) {
      // Signups keep arriving at the recent pace; each day's cohort pays from the day its trial ends.
      futureCohorts.push(signupsPerDay * avgTrialMonthly);
      const payingCohorts = futureCohorts.length - trialDays;
      for (let i = 0; i < payingCohorts; i++) { allDay += futureCohorts[i]; realDay += futureCohorts[i] * pct; }
    }
    allRun += allDay / 30;
    realRun += realDay / 30;
    curve.push({ date: d, spendCents: r0(spendRun), allPayCents: r0(allRun), realisticCents: r0(realRun), projected });
  }
  const cross = totalSpend > 0 ? curve.find((p) => p.realisticCents >= p.spendCents && p.date >= today) ?? null : null;
  const breakEven = cross
    ? { date: cross.date, daysFromToday: daysBetween(today, cross.date), withinHorizon: true }
    : { date: null, daysFromToday: null, withinHorizon: false };

  const realisticMrr = r0(maxMrr * pct);
  const mrrRealistic = payingMrr + realisticMrr;
  // A cost needs both a spend and something to divide it by; without either there is no figure.
  const div = (n: number, d: number) => (n > 0 && d > 0 ? r0(n / d) : null);
  return {
    since,
    today,
    daysLive,
    spend: { totalCents: totalSpend, perDayRecentCents: perDayRecent, perDayProjectedCents: perDayProjected, daysWithSpend: spendDates.length, lastDate: spendDates.at(-1) ?? null },
    visitors: input.visitors,
    signups,
    trials: { count: trials.length, priced: priced.length, maxMrrCents: maxMrr, realisticMrrCents: realisticMrr, byBehaviourMrrCents: byBehaviour, byBehaviourPct: maxMrr > 0 ? Math.round((byBehaviour / maxMrr) * 100) : null, avgMonthlyCents: avgTrialMonthly },
    paying: { count: input.paying.length, mrrCents: payingMrr, arrCents: payingMrr * 12, revenueToDateCents: revenueToDate },
    lapsed: input.lapsed,
    observed: { paid: observedPaid, lapsed: input.lapsed, pct: observedDone > 0 ? Math.round((observedPaid / observedDone) * 100) : null },
    projected: { mrrAllPayCents: payingMrr + maxMrr, mrrRealisticCents: mrrRealistic, mrrByBehaviourCents: payingMrr + byBehaviour },
    unit: {
      costPerVisitorCents: input.visitors ? div(totalSpend, input.visitors) : null,
      costPerSignupCents: div(totalSpend, signups),
      costPerPayingRealisticCents: totalSpend > 0 && input.paying.length + trials.length * pct > 0 ? r0(totalSpend / (input.paying.length + trials.length * pct)) : null,
      visitorToSignupPct: input.visitors ? Math.round((signups / input.visitors) * 1000) / 10 : null,
      signupsPerDay: Math.round(signupsPerDay * 100) / 100,
      paybackMonths: mrrRealistic > 0 && totalSpend > 0 ? Math.round((totalSpend / mrrRealistic) * 10) / 10 : null,
      returnToDatePct: totalSpend > 0 ? Math.round((revenueToDate / totalSpend) * 100) : null,
    },
    breakEven,
    curve,
  };
}

/** "$1,234" — whole dollars; cents only under ten dollars. */
export function dollars(cents: number): string {
  const d = cents / 100;
  return `$${d.toLocaleString("en-US", { maximumFractionDigits: d > 0 && d < 10 ? 2 : 0, minimumFractionDigits: 0 })}`;
}

/** One sentence investors read first: when the ads pay for themselves. */
export function paybackSentence(f: InvestorFigures): string {
  if (f.spend.totalCents === 0) return "No ad spend is booked yet, so there is nothing to recover.";
  const run = dollars(f.projected.mrrRealisticCents);
  if (f.breakEven.date && f.breakEven.daysFromToday !== null) {
    if (f.breakEven.daysFromToday <= 0) return `The ad spend to date (${dollars(f.spend.totalCents)}) is already covered by revenue at list price; the run rate is ${run} a month.`;
    return `At today's pace — ${dollars(f.spend.perDayProjectedCents)} a day on ads, ${f.unit.signupsPerDay} signups a day, ${Math.round(100 * (f.projected.mrrRealisticCents - f.paying.mrrCents) / Math.max(1, f.trials.maxMrrCents))}% of trials paying — the ads pay for themselves in ${f.breakEven.daysFromToday} days, on ${longDate(f.breakEven.date)}. Monthly revenue then runs at ${run} and up.`;
  }
  return `At today's pace the ads do not pay for themselves within ${f.curve.length - f.daysLive} days: ${dollars(f.spend.perDayProjectedCents)} a day goes out against ${run} a month of realistic revenue. Fewer dollars a day, more signups, or a higher share paying moves the date in.`;
}

export function longDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}
