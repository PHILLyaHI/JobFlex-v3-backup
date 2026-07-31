// Blueprint reports — the donor's demo tables (jobflex-reports-blueprint.html),
// kept ONLY as the fallback the behavior module renders when no rollup is
// supplied. The live route (/dashboard/reports) reads the real numbers with
// getReportsRollup() and hands them down, exactly like the workers page does
// with its roster; nothing below is used there.
//
// Every number, label, order and string is still the donor's exact value
// (including the en dashes in the range notes); only the container shape
// changed, so the fixture and the database agree on one type.

import type {
  CrewMember,
  FunnelStep,
  MonthPoint,
  RangeDef,
  RangeKey,
  ReportsRollup,
} from "@/actions/reports";

export type { CrewMember, FunnelStep, MonthPoint, RangeDef, RangeKey, ReportsRollup };

/** Export dialog option. `available` is false for the formats this app cannot
 *  actually produce yet — the dialog shows them greyed instead of pretending. */
export type ExportFormat = { id: string; t: string; h: string; available: boolean };

const MONTHS: MonthPoint[] = [
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

const FUNNEL: Record<RangeKey, FunnelStep[]> = {
  mtd:  [['Leads', 34], ['Quoted', 21], ['Accepted', 12], ['Completed', 8]],
  q:    [['Leads', 128], ['Quoted', 82], ['Accepted', 47], ['Completed', 41]],
  ytd:  [['Leads', 226], ['Quoted', 148], ['Accepted', 86], ['Completed', 78]],
  '12m':[['Leads', 384], ['Quoted', 251], ['Accepted', 147], ['Completed', 136]]
};

const CREW_BASE: CrewMember[] = [
  { name: 'Marcus Bell',   role: 'Lead installer', jobs: 14, hours: 412, revenue: 96400, rating: 4.9 },
  { name: 'Dan Kowalski',  role: 'Installer',      jobs: 11, hours: 368, revenue: 71200, rating: 4.7 },
  { name: 'Sofia Ramos',   role: 'Estimator',      jobs: 6,  hours: 154, revenue: 41800, rating: 4.8 },
  { name: 'Grant Mueller', role: 'Installer',      jobs: 7,  hours: 246, revenue: 38600, rating: 4.4 }
];

const RANGE_MONTHS: Record<RangeKey, number> = { mtd: 1, q: 4, ytd: 7, '12m': 12 };

const RANGES: RangeDef[] = [
  { key: 'mtd', label: 'This month', note: 'Jul 1 – Jul 22, 2026' },
  { key: 'q', label: 'Quarter', note: 'Apr 1 – Jul 22, 2026' },
  { key: 'ytd', label: 'Year', note: 'Jan 1 – Jul 22, 2026' },
  { key: '12m', label: 'Last 12 months', note: 'Aug 2025 – Jul 2026' }
];

/** The donor scaled its one crew table per range by `RANGE_MONTHS/12 * 1.6`;
 *  pre-computing that here keeps the fixture pixel-identical to the donor. */
function scaledCrew(key: RangeKey): CrewMember[] {
  const k = (RANGE_MONTHS[key] / 12) * 1.6;
  return CREW_BASE.map((c) => ({
    ...c,
    jobs: Math.max(1, Math.round(c.jobs * k)),
    hours: Math.round(c.hours * k),
    revenue: Math.round(c.revenue * k),
  }));
}

/** The donor's whole sheet, in the shape the live query returns. */
export const FIXTURE_ROLLUP: ReportsRollup = {
  ranges: RANGES,
  months: MONTHS,
  rangeMonths: RANGE_MONTHS,
  funnel: FUNNEL,
  crew: {
    mtd: scaledCrew('mtd'),
    q: scaledCrew('q'),
    ytd: scaledCrew('ytd'),
    '12m': scaledCrew('12m'),
  },
  avgDaysToClose: { mtd: 4.2, q: 5.1, ytd: 5.8, '12m': 5.8 },
};

/** Export dialog options. CSV is generated in the browser from the sheet that
 *  is on screen; PDF and Excel have no generator anywhere in this app yet. */
export const FORMATS: ExportFormat[] = [
  { id: 'csv', t: 'CSV', h: 'Raw rows for a spreadsheet', available: true },
  { id: 'pdf', t: 'PDF', h: 'Not available yet', available: false },
  { id: 'xlsx', t: 'Excel', h: 'Not available yet', available: false },
];
