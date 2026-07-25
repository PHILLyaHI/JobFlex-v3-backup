// Mobile dashboard (mobile-v2) — demo fixture.
//
// Carried over verbatim from the jobflex-page-styler donor
// (.claude/skills/jobflex-page-styler/assets/jobflex-dashboard-blueprint.html)
// so the mobile composition is judged against the same content as the
// reference dashboard. Seattle-area roofing/fence contractor texture:
// Bothell / Kirkland / Redmond / Kenmore / Everett / Woodinville / Bellevue,
// amounts $1,600–$24,600, real material names, diverse client names.
//
// This is a design surface: the data layer is out of scope, so nothing here
// touches Prisma or a server action. Swapping these arrays for live queries is
// the follow-up once the layout is signed off.

export const TODAY = 22; // JUL 22 — the donor's "today"

export type WeekEvent = { m: number; t: string; title: string };

/**
 * Keyed by day-of-month; `m` is minutes-from-midnight for sorting.
 * Mon–Fri window. Tuesday is deliberately clear so the empty state and the
 * dot-off day are both reachable in the fixture.
 */
export const weekEvents: Record<number, WeekEvent[]> = {
  20: [
    { m: 510, t: "8:30 AM", title: "Gutter repair — 2214 Birch Ln" },
    { m: 435, t: "7:15 AM", title: "Crew safety briefing — Shop" },
    { m: 930, t: "3:30 PM", title: "Estimate visit — 77 Pine St" },
  ],
  21: [],
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

/**
 * Five days, not seven. At 320px seven cells fall under the 44px touch
 * target (7 × 44 > the usable width); five clear it on every handheld. The
 * window is the work week, which is also what a contractor actually plans.
 */
export const WEEK_DAYS = [
  { day: 20, lbl: "MO", dot: true },
  { day: 21, lbl: "TU", dot: false },
  { day: 22, lbl: "WE", dot: true },
  { day: 23, lbl: "TH", dot: true },
  { day: 24, lbl: "FR", dot: true },
] as const;

export const WEEK_LABEL = { range: "Jul 20 – 24", count: 9 } as const;

export type Job = {
  /** Sort key: MMDD as an integer, so "nearest first" is a numeric sort. */
  k: number;
  mo: string;
  dd: string;
  title: string;
  sub: string;
  st: "ok" | "wait";
};

export const jobsData: Job[] = [
  { k: 728, mo: "JUL", dd: "28", title: "Okafor — Gutter replacement", sub: "77 Pine St, Redmond", st: "wait" },
  { k: 722, mo: "JUL", dd: "22", title: "Nguyen — Fence repair, 60 ft", sub: "1409 Fern St, Bothell", st: "ok" },
  { k: 723, mo: "JUL", dd: "23", title: "Henderson — Asphalt reroof", sub: "4812 Maple Ave, Bothell", st: "ok" },
  { k: 730, mo: "JUL", dd: "30", title: "Marsh — Skylight install", sub: "1180 Juniper Way, Woodinville", st: "wait" },
  { k: 724, mo: "JUL", dd: "24", title: "Reyes — Cedar fence, 140 ft", sub: "902 Alder Ct, Kirkland", st: "ok" },
  { k: 802, mo: "AUG", dd: "02", title: "Delgado — Vinyl fence, 220 ft", sub: "4416 Larch St, Kenmore", st: "wait" },
  { k: 725, mo: "JUL", dd: "25", title: "Tran — Deck power wash", sub: "55 Cedar Loop, Bothell", st: "ok" },
  { k: 806, mo: "AUG", dd: "06", title: "Foster — Metal roof repair", sub: "214 Hemlock Dr, Everett", st: "wait" },
  { k: 804, mo: "AUG", dd: "04", title: "Kim — Composite deck rebuild", sub: "3308 Meridian Pl, Bellevue", st: "ok" },
  { k: 810, mo: "AUG", dd: "10", title: "Patel — Siding replacement", sub: "910 Willow Ct, Mill Creek", st: "wait" },
  { k: 808, mo: "AUG", dd: "08", title: "Ivanov — Chain-link fence, 90 ft", sub: "168 Spruce Ave, Lynnwood", st: "ok" },
  { k: 812, mo: "AUG", dd: "12", title: "Wong — Pergola build", sub: "4020 Vine Rd, Sammamish", st: "wait" },
  { k: 814, mo: "AUG", dd: "14", title: "Ortiz — Roof inspection", sub: "61 Cypress Ln, Bothell", st: "wait" },
];

export type Activity = { i: string; t: string; m: string };

export const activities: Activity[] = [
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
];

export const STAGE_KEYS = ["new", "routed", "claimed", "contacted", "quoted"] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

export const LEAD_STAGES: { key: StageKey; label: string }[] = [
  { key: "new", label: "New" },
  { key: "routed", label: "Routed" },
  { key: "claimed", label: "Claimed" },
  { key: "contacted", label: "Contacted" },
  { key: "quoted", label: "Quoted" },
];

export type Lead = {
  id: number;
  stage: StageKey;
  name: string;
  job: string;
  city: string;
  val: number;
  age: string;
};

export const leadsData: Lead[] = [
  { id: 1, stage: "new", name: "M. Alvarez", job: "Asphalt reroof", city: "Bothell", val: 14800, age: "2h" },
  { id: 2, stage: "new", name: "K. Sorensen", job: "Cedar fence, 90 ft", city: "Kirkland", val: 6200, age: "5h" },
  { id: 3, stage: "new", name: "D. Pham", job: "Gutter guards", city: "Redmond", val: 2400, age: "1d" },
  { id: 13, stage: "new", name: "C. Ferreira", job: "Chain-link gate", city: "Bothell", val: 1600, age: "2d" },
  { id: 4, stage: "routed", name: "J. Whitfield", job: "Metal roof repair", city: "Everett", val: 9600, age: "3h" },
  { id: 5, stage: "routed", name: "S. Rao", job: "Vinyl fence, 160 ft", city: "Kenmore", val: 8900, age: "1d" },
  { id: 6, stage: "claimed", name: "T. Bishop", job: "Skylight install", city: "Woodinville", val: 5400, age: "6h" },
  { id: 7, stage: "claimed", name: "L. Moreau", job: "Composite deck", city: "Bellevue", val: 18200, age: "1d" },
  { id: 8, stage: "contacted", name: "R. Okafor", job: "Gutter replacement", city: "Redmond", val: 3800, age: "6d" },
  { id: 9, stage: "contacted", name: "A. Kim", job: "Deck rebuild", city: "Bellevue", val: 21500, age: "2w" },
  { id: 10, stage: "contacted", name: "P. Delgado", job: "Vinyl fence, 220 ft", city: "Kenmore", val: 11300, age: "1mo" },
  { id: 11, stage: "quoted", name: "M. Henderson", job: "Asphalt reroof", city: "Bothell", val: 24600, age: "1h" },
  { id: 12, stage: "quoted", name: "D. Reyes", job: "Cedar fence, 140 ft", city: "Kirkland", val: 12400, age: "1d" },
];

// ---- Revenue chart -------------------------------------------------------
// Mobile plot box. The desktop donor uses viewBox 860×332 with symmetric 70px
// margins; scaled into a 320px-wide phone that renders the 13px mono axis
// labels at ~4px. The box is re-cut for the phone — everything else (square
// points, computed peak, self-drawing line) is the reference behaviour.
export const PLOT = { x0: 38, x1: 328, y0: 10, y1: 170 } as const;
export const Y_ROWS = [10, 50, 90, 130, 170] as const;

export type RangeKey = "7d" | "30d" | "90d";

export const chartDatasets: Record<RangeKey, { labels: string[]; values: number[]; yMax: number; ticks: string[] }> = {
  "7d": {
    labels: ["THU", "FRI", "SAT", "SUN", "MON", "TUE", "WED"],
    values: [1200, 2800, 1900, 900, 3600, 4400, 3200],
    yMax: 8000,
    ticks: ["8K", "6K", "4K", "2K", "0"],
  },
  "30d": {
    labels: ["6/25", "6/28", "7/1", "7/4", "7/7", "7/10", "7/13", "7/16", "7/19", "7/22"],
    values: [4200, 6800, 3900, 7400, 5100, 8600, 6200, 9800, 7300, 8100],
    yMax: 12000,
    ticks: ["12K", "9K", "6K", "3K", "0"],
  },
  "90d": {
    labels: ["4/29", "5/6", "5/13", "5/20", "5/27", "6/3", "6/10", "6/17", "6/24", "7/1", "7/8", "7/15", "7/22"],
    values: [8400, 12600, 9800, 15200, 11400, 17800, 13600, 16400, 14200, 19600, 15800, 18400, 16800],
    yMax: 24000,
    ticks: ["24K", "18K", "12K", "6K", "0"],
  },
};

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
];

/**
 * Navigation drawer — the reference sidebar's full map, pulled out by the
 * burger. This replaced the bottom tab bar at the owner's call (2026-07-24).
 * Account is deliberately NOT in the nav: it lives in the drawer's pinned
 * footer, same as the desktop shell.
 */
export const NAV_SECTIONS = [
  {
    label: "Work",
    items: [
      { label: "Overview", icon: "i-grid" },
      { label: "Proposals", icon: "i-file" },
      { label: "Clients", icon: "i-users" },
      { label: "Leads", icon: "i-target" },
      { label: "Projects", icon: "i-folder" },
      { label: "CRM", icon: "i-crm" },
    ],
  },
  {
    label: "Delivery",
    items: [
      { label: "Calendar", icon: "i-cal" },
      { label: "Jobs", icon: "i-jobs" },
      { label: "Workers", icon: "i-hardhat" },
      { label: "Hire", icon: "i-userplus" },
      { label: "Company", icon: "i-building" },
    ],
  },
  { label: "Money", items: [{ label: "Financials", icon: "i-bank" }] },
  {
    label: "Automation",
    items: [
      { label: "Smart Proposal", icon: "i-bulb" },
      { label: "Roof estimator", icon: "i-roof" },
      { label: "Fence estimator", icon: "i-fence" },
      { label: "Phone", icon: "i-phone" },
      { label: "Messages", icon: "i-msg" },
      { label: "Announcements", icon: "i-megaphone" },
      { label: "Reviews", icon: "i-thumb" },
      { label: "Trade board", icon: "i-board" },
      { label: "Referrals", icon: "i-gift" },
      { label: "Reports", icon: "i-chart" },
    ],
  },
] as const;
