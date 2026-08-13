// JOB DETAIL — BLUEPRINT · the donor's fixture, verbatim.
//
// Every string and number below is copied character-for-character from the
// `// ================= ДАННЫЕ =================` block of
// `jobflex-jobdetail-blueprint (14).html`. The donor's `·` / `→`
// escapes are written as the literal characters they denote (·, →, —), which
// is the same text.
//
// This is a FIXTURE, not a query. The page it replaces read the real Job
// record; shipping the donor's content verbatim was the explicit call for this
// port, so the demo job ("Roof tear-off & reroof — 4812 Maple Ave") is what
// renders. See the header of ./job-detail-content.tsx.

/** Donor: `const ST = { … }` — label + status-badge modifier per state. */
export const ST = {
  sch: { l: "Scheduled", cls: "jd-st--sch" },
  prog: { l: "In progress", cls: "" },
  done: { l: "Completed", cls: "jd-st--done" },
  can: { l: "Canceled", cls: "jd-st--can" },
} as const;

export type StatusKey = keyof typeof ST;

/** Donor: `let status = 'prog'`. */
export const INITIAL_STATUS: StatusKey = "prog";

/** Donor: the four status buttons, in order. */
export const STATUS_BUTTONS: Array<[StatusKey, string]> = [
  ["sch", "Scheduled"],
  ["prog", "In progress"],
  ["done", "Completed"],
  ["can", "Canceled"],
];

export type JobEvent = { d: string; t: string; m: string };
export const EVENTS: JobEvent[] = [
  { d: "Aug 11 · 7:00 AM", t: "Tear-off crew dispatch", m: "4 workers · dumpster on site" },
  { d: "Aug 12 · 8:30 AM", t: "Material delivery", m: "Pacific Building Supply · 24 sq shingles" },
  { d: "Aug 14 · 4:00 PM", t: "Final walkthrough", m: "with M. Henderson · punch list" },
];

export type CrewMember = { n: string; r: string; ph: string; st: "ok" | "wait" };
export const CREW: CrewMember[] = [
  { n: "Diego Reyes", r: "Crew lead", ph: "(425) 555-0134", st: "ok" },
  { n: "Sam Whitaker", r: "Roofer", ph: "(425) 555-0118", st: "ok" },
  { n: "Lena Novak", r: "Laborer", ph: "(206) 555-0177", st: "wait" },
];

export type ChangeOrder = { id: string; t: string; m: string; amt: number; st: "ok" | "warn" };
export const CHANGES: ChangeOrder[] = [
  { id: "CO-1", t: "Add second skylight", m: "Velux FS · flashing kit included", amt: 640, st: "ok" },
  { id: "CO-2", t: "Rotten sheathing — 6 sheets", m: "found at tear-off · $85/sheet", amt: 510, st: "warn" },
];

export type JobPhoto = { k: string; c: string };
export const PHOTOS: JobPhoto[] = [
  { k: "Before", c: "Street side · two layers" },
  { k: "Before", c: "Chimney flashing rust" },
  { k: "Progress", c: "Deck exposed · day 1" },
  { k: "After", c: "Ridge line finished" },
];

export type Expense = { v: string; m: string; amt: number };
export const EXPENSES: Expense[] = [
  { v: "Pacific Building Supply", m: "shingles · underlayment", amt: 1120 },
  { v: "North Bend Transfer", m: "dump fee · 2 loads", amt: 180 },
  { v: "Fastener Depot", m: "coil nails · caps", amt: 92 },
  { v: "Fuel · crew trucks", m: "week of Aug 10", amt: 450 },
];

/** Donor: `const fmt = n => '$' + n.toLocaleString('en-US')`. */
export const fmt = (n: number): string => "$" + n.toLocaleString("en-US");

/** Donor page head, `.content` block 1. */
export const JOB = {
  title: "Roof tear-off & reroof — 4812 Maple Ave",
  dates: "Aug 11 → Aug 14, 2026",
  /** Donor `.jd-fields` — the Dates cell states the span more tersely. */
  fieldDates: "Aug 11 → 14",
  client: "M. Henderson",
  scopeOfWork:
    "Two-layer tear-off to the deck, synthetic underlayment, CertainTeed Landmark architectural shingles, new chimney flashing and continuous ridge vent. Rotten sheathing replaced at $85 per sheet as found.",
  notes:
    "Gate code 4821. Dog stays inside — confirm with the client before opening the run. Dumpster sits on the street side, permit taped to the lid.",
  contact: {
    name: "Mark Henderson",
    phone: "(425) 555-0172",
    phoneHref: "tel:+14255550172",
    email: "mhenderson@gmail.com",
    address: "4812 Maple Ave, Bothell, WA 98012",
  },
} as const;
