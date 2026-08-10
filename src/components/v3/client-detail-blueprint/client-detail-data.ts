// CLIENT DETAIL / BLUEPRINT — the fixture.
//
// Everything this page renders is a module constant. There is no Prisma call,
// no server action and no fetch, because the data layer is out of scope until
// the layout is signed off — the page says so in its masthead rather than
// faking a save.
//
// The shape of the fixture is the shape decisions.md asks for: a roofing /
// fence contractor working the Seattle north-east corridor (Bothell, Kirkland,
// Redmond, Kenmore, Everett, Woodinville, Bellevue), individual amounts inside
// the $1,600–$24,600 band, and a client roster with real name diversity.
//
// DATES ARE PRE-FORMATTED STRINGS, not Date objects. This module is imported by
// a client component that Next also renders on the server; a `Date` formatted at
// render time is a hydration mismatch waiting for the first machine whose clock
// or timezone disagrees. A string renders identically in both places.
//
// The KPI figures are NOT stored here. They are derived from these arrays in the
// content component, so a fixture edit can never leave a headline number lying.

export type ProposalStatus = "DRAFT" | "SENT" | "VIEWED" | "ACCEPTED" | "DECLINED";
export type PaymentStatus = "PAID" | "PENDING" | "FAILED";

/** The chip set over the proposal ledger. `all` is the resting filter. */
export type ProposalFilter = "all" | "draft" | "open" | "won" | "lost";

export type ClientRecord = {
  recordNo: string;
  name: string;
  initials: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  since: string;
  lastContact: string;
  tags: string[];
};

export type ProposalRow = {
  id: string;
  title: string;
  status: ProposalStatus;
  amount: number;
  /** Last movement on the record, already formatted. */
  updated: string;
  /** The drawing-annotation reference printed on the sheet. */
  ref: string;
};

export type PaymentRow = {
  id: string;
  amount: number;
  /** How it arrived — provider first, instrument second. */
  method: string;
  instrument: string;
  date: string;
  status: PaymentStatus;
};

export type ActivityRow = {
  id: string;
  /** Sprite id, verified present in blueprint-shell's sprite. */
  icon: string;
  text: string;
  stamp: string;
};

export const CLIENT: ClientRecord = {
  recordNo: "CLT-0428",
  name: "Marisol Alvarez",
  initials: "MA",
  company: "Alvarez Property Group",
  email: "marisol@alvarezproperty.com",
  phone: "(425) 555-0147",
  address: "14208 NE 182nd St, Woodinville, WA 98072",
  city: "Woodinville, WA",
  since: "Mar 12, 2023",
  lastContact: "Aug 08, 2026",
  tags: ["Repeat client", "Referral source", "Net 15"],
};

// Sorted newest-first on `updated` and nothing else. A ledger must never sort on
// something reading it changes (decisions.md, session 3) — a status-first sort
// would make a proposal jump the moment it is opened and marked viewed.
export const PROPOSALS: ProposalRow[] = [
  {
    id: "p-1",
    title: "Detached garage re-roof — GAF Timberline HDZ",
    status: "SENT",
    amount: 11275,
    updated: "Aug 07, 2026",
    ref: "PRO-2291",
  },
  {
    id: "p-2",
    title: "Gutter & downspout replacement — full perimeter",
    status: "VIEWED",
    amount: 4820,
    updated: "Aug 04, 2026",
    ref: "PRO-2288",
  },
  {
    id: "p-3",
    title: "Deck rebuild — PT frame, cedar deck boards",
    status: "SENT",
    amount: 9940,
    updated: "Aug 01, 2026",
    ref: "PRO-2284",
  },
  {
    id: "p-4",
    title: "Cedar privacy fence — rear lot line, 168 ft",
    status: "ACCEPTED",
    amount: 18450,
    updated: "Jul 28, 2026",
    ref: "PRO-2260",
  },
  {
    id: "p-5",
    title: "Composition roof replacement — main house",
    status: "ACCEPTED",
    amount: 24600,
    updated: "May 14, 2026",
    ref: "PRO-2141",
  },
  {
    id: "p-6",
    title: "Front walkway paver replacement",
    status: "DECLINED",
    amount: 6310,
    updated: "Feb 19, 2026",
    ref: "PRO-2077",
  },
];

export const PAYMENTS: PaymentRow[] = [
  {
    id: "y-1",
    amount: 9180,
    method: "Stripe",
    instrument: "Invoice 2291-B",
    date: "Aug 09, 2026",
    status: "PENDING",
  },
  {
    id: "y-2",
    amount: 9225,
    method: "Stripe",
    instrument: "Visa ···· 4417",
    date: "Aug 02, 2026",
    status: "PAID",
  },
  {
    id: "y-3",
    amount: 12300,
    method: "Bank transfer",
    instrument: "ACH · Progress 2 of 2",
    date: "Jun 06, 2026",
    status: "PAID",
  },
  {
    id: "y-4",
    amount: 12300,
    method: "Bank transfer",
    instrument: "ACH · Progress 1 of 2",
    date: "May 20, 2026",
    status: "PAID",
  },
  {
    id: "y-5",
    amount: 5535,
    method: "Square",
    instrument: "Card present · on site",
    date: "Apr 11, 2026",
    status: "PAID",
  },
  {
    id: "y-6",
    amount: 4180,
    method: "Check",
    instrument: "No. 2291",
    date: "Mar 03, 2026",
    status: "PAID",
  },
];

export const ACTIVITY: ActivityRow[] = [
  { id: "a-1", icon: "bank", text: "Invoice 2291-B issued for the deck rebuild deposit", stamp: "Aug 09 · 9:04 AM" },
  { id: "a-2", icon: "file", text: "Opened the detached garage re-roof proposal", stamp: "Aug 08 · 4:12 PM" },
  { id: "a-3", icon: "send", text: "Detached garage re-roof sent to marisol@alvarezproperty.com", stamp: "Aug 07 · 8:35 AM" },
  { id: "a-4", icon: "msg", text: "Replied about gutter colour — match the fascia, not the roof", stamp: "Aug 04 · 1:47 PM" },
  { id: "a-5", icon: "bank", text: "Payment received — Visa ···· 4417 via Stripe", stamp: "Aug 02 · 11:20 AM" },
  { id: "a-6", icon: "phone", text: "Call, 6 min — booked the Woodinville site walk", stamp: "Jul 29 · 3:58 PM" },
  { id: "a-7", icon: "check", text: "Signed the cedar privacy fence proposal", stamp: "Jul 28 · 10:02 AM" },
  { id: "a-8", icon: "thumb", text: "Left a review, 5 of 5, after the roof replacement", stamp: "Jul 21 · 5:14 PM" },
];

/** Which chip a proposal answers to. `open` is everything still in play. */
export function bucketOf(status: ProposalStatus): Exclude<ProposalFilter, "all"> {
  if (status === "DRAFT") return "draft";
  if (status === "ACCEPTED") return "won";
  if (status === "DECLINED") return "lost";
  return "open";
}

/** Whole dollars, hand-rolled. `toLocaleString` depends on the runtime's ICU
 *  build, and this string is produced on the server AND in the browser. */
export function money(n: number): string {
  const whole = Math.round(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${n < 0 ? "−" : ""}$${whole}`;
}
