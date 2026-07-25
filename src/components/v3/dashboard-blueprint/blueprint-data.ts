// Blueprint dashboard — demo fixture data, verbatim from the donor file
// .claude/skills/jobflex-page-styler/assets/jobflex-dashboard-blueprint.html
// (script section). Values must not be edited independently of the donor:
// the page is a pixel-identical port, content included.

export type WeekEvent = { m: number; t: string; title: string };
export type JobRow = { k: number; date: string; title: string; sub: string; st: "ok" | "wait" };
export type ActivityRow = { i: string; t: string; m: string };
export type Lead = {
  id: number;
  stage: string;
  name: string;
  job: string;
  city: string;
  val: number;
  age: string;
  ageH: number;
};
export type ChartDataset = {
  labels: string[];
  values: number[];
  yMax: number;
  ticks: string[];
};

export const TODAY = 22; // JUL 22

export const weekEvents: Record<number, WeekEvent[]> = {
  19: [],
  20: [
    { m: 510, t: "8:30 AM", title: "Gutter repair — 2214 Birch Ln" },
    { m: 435, t: "7:15 AM", title: "Crew safety briefing — Shop" },
  ],
  21: [{ m: 930, t: "3:30 PM", title: "Estimate visit — 77 Pine St" }],
  22: [
    { m: 780, t: "1:00 PM", title: "Dumpster swap — Maple Ave site" },
    { m: 420, t: "7:00 AM", title: "Roof tear-off — 4812 Maple Ave" },
  ],
  23: [
    { m: 600, t: "10:00 AM", title: "Shingle install — day 1" },
    { m: 570, t: "9:30 AM", title: "Material drop: GAF Timberline HDZ" },
  ],
  24: [
    { m: 840, t: "2:00 PM", title: "Final inspection — Reyes fence" },
    { m: 450, t: "7:30 AM", title: "Shingle install — day 2" },
  ],
  25: [
    { m: 960, t: "4:00 PM", title: "Client walkthrough — Henderson" },
    { m: 600, t: "10:00 AM", title: "Deck power wash — 55 Cedar Loop" },
  ],
};

export const jobsData: JobRow[] = [
  { k: 728, date: "JUL 28", title: "Okafor — Gutter replacement", sub: "77 Pine St, Redmond", st: "wait" },
  { k: 722, date: "JUL 22", title: "Nguyen — Fence repair, 60 ft", sub: "1409 Fern St, Bothell", st: "ok" },
  { k: 723, date: "JUL 23", title: "Henderson — Asphalt reroof", sub: "4812 Maple Ave, Bothell", st: "ok" },
  { k: 730, date: "JUL 30", title: "Marsh — Skylight install", sub: "1180 Juniper Way, Woodinville", st: "wait" },
  { k: 724, date: "JUL 24", title: "Reyes — Cedar fence, 140 ft", sub: "902 Alder Ct, Kirkland", st: "ok" },
  { k: 802, date: "AUG 02", title: "Delgado — Vinyl fence, 220 ft", sub: "4416 Larch St, Kenmore", st: "wait" },
  { k: 725, date: "JUL 25", title: "Tran — Deck power wash", sub: "55 Cedar Loop, Bothell", st: "ok" },
  { k: 806, date: "AUG 06", title: "Foster — Metal roof repair", sub: "214 Hemlock Dr, Everett", st: "wait" },
  { k: 804, date: "AUG 04", title: "Kim — Composite deck rebuild", sub: "3308 Meridian Pl, Bellevue", st: "ok" },
  { k: 810, date: "AUG 10", title: "Patel — Siding replacement", sub: "910 Willow Ct, Mill Creek", st: "wait" },
  { k: 808, date: "AUG 08", title: "Ivanov — Chain-link fence, 90 ft", sub: "168 Spruce Ave, Lynnwood", st: "ok" },
  { k: 812, date: "AUG 12", title: "Wong — Pergola build", sub: "4020 Vine Rd, Sammamish", st: "wait" },
  { k: 814, date: "AUG 14", title: "Ortiz — Roof inspection", sub: "61 Cypress Ln, Bothell", st: "wait" },
];

export const activities: ActivityRow[] = [
  { i: "i-file", t: "Proposal #2851 sent to M. Henderson", m: "Sent · 25 min ago" },
  { i: "i-target", t: "New lead: cedar fence, 140 ft — Bothell", m: "Lead · 1h ago" },
  { i: "i-msg", t: "SMS reply from D. Reyes", m: "Message · 1h ago" },
  { i: "i-check", t: "Invoice #1032 paid — $8,400", m: "Paid · 3h ago" },
  { i: "i-cal", t: "Tear-off scheduled at 4812 Maple Ave", m: "Scheduled · 5h ago" },
  { i: "i-bulb", t: "Smart draft ready: Okafor gutters", m: "Draft · 6h ago" },
  { i: "i-users", t: "Client added: R. Tran", m: "Client · 8h ago" },
  { i: "i-phone", t: "Missed call — (425) 555-0132", m: "Call · 9h ago" },
  { i: "i-file", t: "Proposal #2849 viewed by K. Marsh", m: "Viewed · 12h ago" },
  { i: "i-check", t: "Deposit received — Reyes fence", m: "Paid · 1d ago" },
  { i: "i-thumb", t: "New 5-star review from Delgado", m: "Review · 1d ago" },
  { i: "i-bank", t: "Payout sent to operating account", m: "Payout · 1d ago" },
  { i: "i-target", t: "Lead marked qualified — skylight", m: "Lead · 1d ago" },
  { i: "i-cal", t: "Estimate visit booked — 77 Pine St", m: "Scheduled · 1d ago" },
  { i: "i-file", t: "Ivan created the workspace", m: "Created · 1d ago" },
];

// Mutated at runtime by drag & drop — init clones this seed per mount.
export const LEADS_SEED: Lead[] = [
  { id: 1, stage: "new", name: "M. Alvarez", job: "Asphalt reroof", city: "Bothell", val: 14800, age: "2h", ageH: 2 },
  { id: 2, stage: "new", name: "K. Sorensen", job: "Cedar fence, 90 ft", city: "Kirkland", val: 6200, age: "5h", ageH: 5 },
  { id: 3, stage: "new", name: "D. Pham", job: "Gutter guards", city: "Redmond", val: 2400, age: "1d", ageH: 24 },
  { id: 13, stage: "new", name: "C. Ferreira", job: "Chain-link gate", city: "Bothell", val: 1600, age: "2d", ageH: 48 },
  { id: 4, stage: "routed", name: "J. Whitfield", job: "Metal roof repair", city: "Everett", val: 9600, age: "3h", ageH: 3 },
  { id: 5, stage: "routed", name: "S. Rao", job: "Vinyl fence, 160 ft", city: "Kenmore", val: 8900, age: "1d", ageH: 24 },
  { id: 6, stage: "claimed", name: "T. Bishop", job: "Skylight install", city: "Woodinville", val: 5400, age: "6h", ageH: 6 },
  { id: 7, stage: "claimed", name: "L. Moreau", job: "Composite deck", city: "Bellevue", val: 18200, age: "1d", ageH: 24 },
  { id: 8, stage: "contacted", name: "R. Okafor", job: "Gutter replacement", city: "Redmond", val: 3800, age: "6d", ageH: 144 },
  { id: 9, stage: "contacted", name: "A. Kim", job: "Deck rebuild", city: "Bellevue", val: 21500, age: "2w", ageH: 336 },
  { id: 10, stage: "contacted", name: "P. Delgado", job: "Vinyl fence, 220 ft", city: "Kenmore", val: 11300, age: "1mo", ageH: 720 },
  { id: 11, stage: "quoted", name: "M. Henderson", job: "Asphalt reroof", city: "Bothell", val: 24600, age: "1h", ageH: 1 },
  { id: 12, stage: "quoted", name: "D. Reyes", job: "Cedar fence, 140 ft", city: "Kirkland", val: 12400, age: "1d", ageH: 24 },
];

export const LEAD_STAGES = ["new", "routed", "claimed", "contacted", "quoted"] as const;

export const chartDatasets: Record<string, ChartDataset> = {
  "7d": {
    labels: ["THU", "FRI", "SAT", "SUN", "MON", "TUE", "WED"],
    values: [1200, 2800, 1900, 900, 3600, 4400, 3200],
    yMax: 8000,
    ticks: ["$8K", "$6K", "$4K", "$2K", "$0"],
  },
  "30d": {
    labels: ["6/25", "6/28", "7/1", "7/4", "7/7", "7/10", "7/13", "7/16", "7/19", "7/22"],
    values: [4200, 6800, 3900, 7400, 5100, 8600, 6200, 9800, 7300, 8100],
    yMax: 12000,
    ticks: ["$12K", "$9K", "$6K", "$3K", "$0"],
  },
  "90d": {
    labels: ["4/29", "5/6", "5/13", "5/20", "5/27", "6/3", "6/10", "6/17", "6/24", "7/1", "7/8", "7/15", "7/22"],
    values: [8400, 12600, 9800, 15200, 11400, 17800, 13600, 16400, 14200, 19600, 15800, 18400, 16800],
    yMax: 24000,
    ticks: ["$24K", "$18K", "$12K", "$6K", "$0"],
  },
};
