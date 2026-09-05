// Mobile reports (mobile-reports-v2) — derivations over the org's real rollup.
//
// The twelve-month demo table, the four funnels and the four-name crew that
// used to live here are gone: the build now takes the org's ReportsRollup as a
// prop (app/dashboard/reports/load-reports, the same getReportsRollup() the
// desktop sheet reads) and every helper below is a pure function OF that
// rollup. The formulas are the donor renderer's own, lifted out of
// reports-behavior.ts so the figures cannot drift from the desktop sheet.

import { toCsv } from "@/lib/csv";
// Types come from the desktop's own data module, which re-exports them from
// @/actions/reports. Going through it rather than straight at the action keeps
// a "use server" module out of this client bundle's import graph.
import type {
  CrewMember,
  MonthPoint,
  RangeDef,
  RangeKey,
  ReportsRollup,
} from "@/components/v3/reports-blueprint/reports-data";

export type { CrewMember, MonthPoint, RangeDef, RangeKey, ReportsRollup };

export type ExportFormat = { id: string; t: string; h: string; available: boolean };

/** Export dialog options. Only CSV is built today — the desktop sheet offers
 *  the same three and disables the two it cannot produce. */
export const FORMATS: ExportFormat[] = [
  { id: "csv", t: "CSV", h: "Raw rows for a spreadsheet", available: true },
  { id: "pdf", t: "PDF", h: "Not available yet", available: false },
  { id: "xlsx", t: "Excel", h: "Not available yet", available: false },
];

/* ============================================================
   DERIVATIONS
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

export function rangeOf(r: ReportsRollup, key: RangeKey): RangeDef {
  return r.ranges.find((x) => x.key === key) ?? r.ranges[0] ?? { key, label: key, note: "" };
}

/** The trailing slice of the rollup's months the selected range covers. */
export function monthsFor(r: ReportsRollup, range: RangeKey): MonthPoint[] {
  const n = r.rangeMonths[range] ?? r.months.length;
  return r.months.slice(Math.max(0, r.months.length - n));
}

/** One funnel step's count, or 0 when the range has no such step. */
function step(r: ReportsRollup, range: RangeKey, i: number): number {
  return r.funnel[range]?.[i]?.[1] ?? 0;
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

export function summaryFor(r: ReportsRollup, range: RangeKey): Summary {
  const ms = monthsFor(r, range);
  const collected = ms.reduce((a, m) => a + m.collected, 0);
  const invoiced = ms.reduce((a, m) => a + m.invoiced, 0);
  const quoted = step(r, range, 1);
  const accepted = step(r, range, 2);
  const jobs = step(r, range, 3);
  return {
    invoiced,
    collected,
    outstanding: Math.max(0, invoiced - collected),
    rate: invoiced ? Math.round((collected / invoiced) * 100) : 0,
    jobs,
    win: quoted ? (accepted / quoted) * 100 : 0,
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

export function funnelFor(r: ReportsRollup, range: RangeKey): FunnelRow[] {
  const f = r.funnel[range] ?? [];
  const top = f[0]?.[1] ?? 0;
  return f.map((row, i) => {
    const prev = i > 0 ? f[i - 1][1] : null;
    const drop = prev ? ((prev - row[1]) / prev) * 100 : null;
    return {
      label: row[0],
      count: row[1],
      pct: top ? (row[1] / top) * 100 : 0,
      drop,
      bad: drop !== null && drop > 40,
      from: i > 0 ? f[i - 1][0].toLowerCase() : "",
    };
  });
}

export type ConversionRow = { l: string; s: string; v: number; tone: "ok" | "warn" };

export function conversionFor(r: ReportsRollup, range: RangeKey): ConversionRow[] {
  const leads = step(r, range, 0);
  const quoted = step(r, range, 1);
  const accepted = step(r, range, 2);
  const done = step(r, range, 3);
  const quoteRate = leads ? (quoted / leads) * 100 : 0;
  const closeRate = quoted ? (accepted / quoted) * 100 : 0;
  const deliverRate = accepted ? (done / accepted) * 100 : 0;
  return [
    {
      l: "Lead to quote",
      s: `${quoted} of ${leads} leads quoted`,
      v: quoteRate,
      tone: quoteRate >= 60 ? "ok" : "warn",
    },
    {
      l: "Quote to close",
      s: `${accepted} of ${quoted} quotes accepted`,
      v: closeRate,
      tone: closeRate >= 50 ? "ok" : "warn",
    },
    {
      l: "Close to delivered",
      s: `${done} of ${accepted} jobs finished`,
      v: deliverRate,
      tone: deliverRate >= 85 ? "ok" : "warn",
    },
  ];
}

/** Jobs completed in the range — the last funnel step. */
export function jobsFor(r: ReportsRollup, range: RangeKey): number {
  return step(r, range, 3);
}

/** Proposal sent → signature, in days; null when nothing closed in the range. */
export function avgDaysFor(r: ReportsRollup, range: RangeKey): string | null {
  const v = r.avgDaysToClose[range];
  return v == null ? null : v.toFixed(1);
}

export function crewFor(r: ReportsRollup, range: RangeKey): CrewMember[] {
  return r.crew[range] ?? [];
}

export type CrewFigures = { jobs: number; hours: number; revenue: number; perHour: number };

/** The rollup already scopes each member's figures to the range; only $/hr is
 *  derived here. */
export function crewFigures(c: CrewMember): CrewFigures {
  return { jobs: c.jobs, hours: c.hours, revenue: c.revenue, perHour: c.hours ? c.revenue / c.hours : 0 };
}

/**
 * The CSV the Download button hands over: the same five blocks that are on
 * screen, for the selected range, built from the same numbers the sheet just
 * rendered — the desktop's buildCsv(), as a pure function of the rollup.
 * Sections are stacked with a blank line between them — the shape every
 * spreadsheet reads as separate tables. `toCsv` carries the formula-injection
 * guard that matters here, because crew names are free text.
 */
export function buildReportCsv(r: ReportsRollup, range: RangeKey, excluded: string[] = []): string {
  const cur = rangeOf(r, range);
  const ms = monthsFor(r, range);
  const sum = summaryFor(r, range);
  const avg = avgDaysFor(r, range);
  const sections: string[] = [];
  sections.push(
    "Summary\n" +
      toCsv(
        [
          { metric: "Range", value: `${cur.label} (${cur.note})` },
          { metric: "Invoiced", value: sum.invoiced },
          { metric: "Collected", value: sum.collected },
          { metric: "Outstanding", value: sum.outstanding },
          { metric: "Jobs completed", value: sum.jobs },
          { metric: "Win rate %", value: Math.round(sum.win) },
          { metric: "Avg job", value: Math.round(sum.avg) },
          { metric: "Avg days to close", value: avg ?? "" },
        ],
        ["metric", "value"],
      ),
  );
  sections.push(
    "Revenue by month\n" +
      toCsv(
        ms.map((m) => ({ month: m.m, invoiced: m.invoiced, collected: m.collected })),
        ["month", "invoiced", "collected"],
      ),
  );
  sections.push(
    "Pipeline\n" +
      toCsv(
        (r.funnel[range] ?? []).map((s) => ({ stage: s[0], count: s[1] })),
        ["stage", "count"],
      ),
  );
  sections.push(
    "Conversion\n" +
      toCsv(
        conversionFor(r, range).map((c) => ({ step: c.l, detail: c.s, rate: Math.round(c.v) })),
        ["step", "detail", "rate"],
      ),
  );
  sections.push(
    "Crew\n" +
      toCsv(
        crewFor(r, range)
          .filter((c) => !excluded.includes(c.name))
          .map((c) => ({
            name: c.name,
            role: c.role,
            rating: c.rating ?? "",
            jobs: c.jobs,
            hours: c.hours,
            revenue: c.revenue,
          })),
        ["name", "role", "rating", "jobs", "hours", "revenue"],
      ),
  );
  return sections.join("\n\n");
}
