// Blueprint reports — demo data, hardcoded verbatim from the donor file's
// <script> (jobflex-reports-blueprint.html). Every number, label, order and
// string is the donor's exact value (including the en dashes in the range
// notes); only the TypeScript shapes are added.
//
// Nothing here is mutated at runtime — the page only ever reads these tables
// and recomputes its figures per selected range, exactly like the donor.

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
