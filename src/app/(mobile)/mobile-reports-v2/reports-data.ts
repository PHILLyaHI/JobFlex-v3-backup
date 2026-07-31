// Mobile reports (mobile-reports-v2) — demo fixture.
//
// The tables below are carried over VERBATIM from the desktop donor
// (src/components/v3/reports-blueprint/reports-data.ts): every number, label,
// order and string is the donor's exact value, including the en dashes in the
// range notes, so the handheld composition is judged against the same report as
// the desktop sheet. Only the derivations underneath are new, and each one is
// the donor renderer's own formula lifted out of reports-behavior.ts.
//
// This is a design surface: the data layer is out of scope, so nothing here
// touches Prisma, a server action or the network. CREW is cloned per mount by
// the component (the row sheet can exclude a crew member from the report), so
// runtime mutations never leak between mounts.

/** The four range keys the page switches between. */
export type RangeKey = "mtd" | "q" | "ytd" | "12m";

export type Range = { key: RangeKey; label: string; note: string };
export type MonthPoint = { m: string; invoiced: number; collected: number };
/** A funnel step: [label, count]. */
export type FunnelStep = [string, number];
export type CrewMember = {
  name: string;
  role: string;
  jobs: number;
  hours: number;
  revenue: number;
  rating: number;
};
export type ExportFormat = { id: string; t: string; h: string };

/** Ranges from the page description: revenue, funnel, conversion, crew work. */
export const RANGES: Range[] = [
  { key: 'mtd', label: 'This month', note: 'Jul 1 – Jul 22, 2026' },
  { key: 'q', label: 'Quarter', note: 'Apr 1 – Jul 22, 2026' },
  { key: 'ytd', label: 'Year', note: 'Jan 1 – Jul 22, 2026' },
  { key: '12m', label: 'Last 12 months', note: 'Aug 2025 – Jul 2026' }
];

export const MONTHS: MonthPoint[] = [
  { m: 'Aug', invoiced: 44100, collected: 38200 },
  { m: 'Sep', invoiced: 49800, collected: 44100 },
  { m: 'Oct', invoiced: 56200, collected: 51600 },
  { m: 'Nov', invoiced: 42700, collected: 39800 },
  { m: 'Dec', invoiced: 31100, collected: 28400 },
  { m: 'Jan', invoiced: 34600, collected: 31200 },
  { m: 'Feb', invoiced: 39200, collected: 35800 },
  { m: 'Mar', invoiced: 50100, collected: 46300 },
  { m: 'Apr', invoiced: 57400, collected: 52900 },
  { m: 'May', invoiced: 63800, collected: 58400 },
  { m: 'Jun', invoiced: 66200, collected: 61700 },
  { m: 'Jul', invoiced: 54900, collected: 48250 }
];

/** How many trailing months each range covers. */
export const RANGE_MONTHS: Record<RangeKey, number> = { mtd: 1, q: 4, ytd: 7, '12m': 12 };

export const FUNNEL: Record<RangeKey, FunnelStep[]> = {
  mtd:  [['Leads', 34], ['Quoted', 21], ['Accepted', 12], ['Completed', 8]],
  q:    [['Leads', 128], ['Quoted', 82], ['Accepted', 47], ['Completed', 41]],
  ytd:  [['Leads', 226], ['Quoted', 148], ['Accepted', 86], ['Completed', 78]],
  '12m':[['Leads', 384], ['Quoted', 251], ['Accepted', 147], ['Completed', 136]]
};

export const CREW: CrewMember[] = [
  { name: 'Marcus Bell',   role: 'Lead installer', jobs: 14, hours: 412, revenue: 96400, rating: 4.9 },
  { name: 'Dan Kowalski',  role: 'Installer',      jobs: 11, hours: 368, revenue: 71200, rating: 4.7 },
  { name: 'Sofia Ramos',   role: 'Estimator',      jobs: 6,  hours: 154, revenue: 41800, rating: 4.8 },
  { name: 'Grant Mueller', role: 'Installer',      jobs: 7,  hours: 246, revenue: 38600, rating: 4.4 }
];

/** Export dialog options. */
export const FORMATS: ExportFormat[] = [
  { id: 'csv', t: 'CSV', h: 'Raw rows for a spreadsheet' },
  { id: 'pdf', t: 'PDF', h: 'Formatted summary with charts' },
  { id: 'xlsx', t: 'Excel', h: 'One tab per section' }
];

/* ============================================================
   DERIVATIONS — the donor renderer's formulas, lifted out of
   reports-behavior.ts so the figures cannot drift from the
   desktop sheet.
   ============================================================ */

/**
 * Two letters, so a crew row scans at a glance: "Marcus Bell" → MB. Punctuation
 * is stripped first, which is what keeps an initial like "M." from becoming ".".
 */
export function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z ]/g, " ").split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function rangeOf(key: RangeKey): Range {
  // `key` is only ever one of the four, so the fallback is unreachable — it
  // exists so the return type is not `Range | undefined`.
  return RANGES.find((r) => r.key === key) ?? RANGES[1];
}

/** The trailing slice of MONTHS the selected range covers. */
export function monthsFor(range: RangeKey): MonthPoint[] {
  return MONTHS.slice(MONTHS.length - RANGE_MONTHS[range]);
}

/** Donor `scale()` — the fraction of a year the range covers. */
export function scaleFor(range: RangeKey): number {
  return RANGE_MONTHS[range] / 12;
}

export type Summary = {
  invoiced: number;
  collected: number;
  outstanding: number;
  /** Collected as a percentage of invoiced, rounded — the donor's stat delta. */
  rate: number;
  jobs: number;
  win: number;
  avg: number;
};

export function summaryFor(range: RangeKey): Summary {
  const ms = monthsFor(range);
  const collected = ms.reduce((a, m) => a + m.collected, 0);
  const invoiced = ms.reduce((a, m) => a + m.invoiced, 0);
  const f = FUNNEL[range];
  const jobs = f[3][1];
  return {
    invoiced,
    collected,
    outstanding: invoiced - collected,
    rate: invoiced ? Math.round((collected / invoiced) * 100) : 0,
    jobs,
    win: f[1][1] ? (f[2][1] / f[1][1]) * 100 : 0,
    avg: jobs ? collected / jobs : 0,
  };
}

export type FunnelRow = {
  label: string;
  count: number;
  /** Share of the first step, as drawn by the track fill. */
  pct: number;
  /** Fall-out from the step above, or null for the first row. */
  drop: number | null;
  /** The donor's threshold: a drop past 40% is called out in the danger tone. */
  bad: boolean;
  from: string;
};

export function funnelFor(range: RangeKey): FunnelRow[] {
  const f = FUNNEL[range];
  const top = f[0][1];
  return f.map((row, i) => {
    const prev = i > 0 ? f[i - 1][1] : null;
    const drop = prev ? ((prev - row[1]) / prev) * 100 : null;
    return {
      label: row[0],
      count: row[1],
      pct: (row[1] / top) * 100,
      drop,
      bad: drop !== null && drop > 40,
      from: i > 0 ? f[i - 1][0].toLowerCase() : "",
    };
  });
}

export type ConversionRow = { l: string; s: string; v: number; tone: "ok" | "warn" };

export function conversionFor(range: RangeKey): ConversionRow[] {
  const f = FUNNEL[range];
  const quoteRate = f[0][1] ? (f[1][1] / f[0][1]) * 100 : 0;
  const closeRate = f[1][1] ? (f[2][1] / f[1][1]) * 100 : 0;
  const deliverRate = f[2][1] ? (f[3][1] / f[2][1]) * 100 : 0;
  return [
    {
      l: "Lead to quote",
      s: `${f[1][1]} of ${f[0][1]} leads quoted`,
      v: quoteRate,
      tone: quoteRate >= 60 ? "ok" : "warn",
    },
    {
      l: "Quote to close",
      s: `${f[2][1]} of ${f[1][1]} quotes accepted`,
      v: closeRate,
      tone: closeRate >= 50 ? "ok" : "warn",
    },
    {
      l: "Close to delivered",
      s: `${f[3][1]} of ${f[2][1]} jobs finished`,
      v: deliverRate,
      tone: deliverRate >= 85 ? "ok" : "warn",
    },
  ];
}

/** Jobs completed in the range — the last funnel step. */
export function jobsFor(range: RangeKey): number {
  return FUNNEL[range][3][1];
}

/** Donor value: proposal sent → signature, in days. */
export function avgDaysFor(range: RangeKey): string {
  return range === "mtd" ? "4.2" : range === "q" ? "5.1" : "5.8";
}

export type CrewFigures = { jobs: number; hours: number; revenue: number; perHour: number };

/** Donor `renderCrew()` — a crew member's numbers, scaled to the range. */
export function crewInRange(c: CrewMember, range: RangeKey): CrewFigures {
  const k = scaleFor(range) * 1.6;
  const jobs = Math.max(1, Math.round(c.jobs * k));
  const hours = Math.round(c.hours * k);
  const revenue = Math.round(c.revenue * k);
  return { jobs, hours, revenue, perHour: hours ? revenue / hours : 0 };
}
