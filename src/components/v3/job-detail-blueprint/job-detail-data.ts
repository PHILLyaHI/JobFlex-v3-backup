// JOB DETAIL — BLUEPRINT · the shapes both editions read, and nothing else.
//
// ── THIS FILE USED TO BE THE DONOR'S FIXTURE ───────────────────────────────
// It held the demo job ("Roof tear-off & reroof — 4812 Maple Ave"), its crew,
// change orders, photos and expenses, and BOTH editions rendered it for every
// `[id]`. That is gone: the page reads the real Job row now (see
// ./job-detail-load.ts) and this module keeps only what a fixture never was —
// the type of a record, the status vocabulary, and the money formatter.
//
// Nothing here touches the database, so it is safe to import from a client
// component; the load module is the server half and imports these types back.
//
// DATES ARE STRINGS ON PURPOSE. Every field below that reads like a date is
// pre-formatted on the server (same rule as client-detail-data.ts): a `Date`
// formatted inside a client component is formatted twice, once per
// environment, and the first machine whose clock or locale disagreed would
// produce a hydration mismatch.

/** The donor's four status keys. They are the UI vocabulary — the database
 *  column is `Job.status` ("SCHEDULED" | "IN_PROGRESS" | "COMPLETED" |
 *  "CANCELED") and the two maps below are the only place they meet. */
export type StatusKey = "sch" | "prog" | "done" | "can";

/** Donor: `const ST = { … }` — label + status-badge modifier per state. */
export const ST = {
  sch: { l: "Scheduled", cls: "jd-st--sch" },
  prog: { l: "In progress", cls: "" },
  done: { l: "Completed", cls: "jd-st--done" },
  can: { l: "Canceled", cls: "jd-st--can" },
} as const;

/** Donor: the four status buttons, in order. */
export const STATUS_BUTTONS: Array<[StatusKey, string]> = [
  ["sch", "Scheduled"],
  ["prog", "In progress"],
  ["done", "Completed"],
  ["can", "Canceled"],
];

/** `Job.status` values, exactly as `updateJob`'s zod schema accepts them. */
export type JobStatusValue = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";

export const STATUS_TO_KEY: Record<string, StatusKey> = {
  SCHEDULED: "sch",
  IN_PROGRESS: "prog",
  COMPLETED: "done",
  CANCELED: "can",
};

export const KEY_TO_STATUS: Record<StatusKey, JobStatusValue> = {
  sch: "SCHEDULED",
  prog: "IN_PROGRESS",
  done: "COMPLETED",
  can: "CANCELED",
};

/** Donor: `const fmt = n => '$' + n.toLocaleString('en-US')`. */
export const fmt = (n: number): string => "$" + Math.round(n).toLocaleString("en-US");

/** One JobEvent row — the job's real calendar entries, ascending. */
export type JdEvent = {
  id: string;
  /** JobEvent.title. */
  title: string;
  /** "Aug 11 · 7:00 AM" — pre-formatted (see the header). */
  when: string;
  /** JobEvent.notes, or the span, or null. */
  meta: string | null;
};

/** One JobAssignment row. `state` is the donor's badge vocabulary; DECLINED
 *  gets its own value rather than being folded into "wait" — a crew list that
 *  prints a decline as "Pending" is a crew list that gets someone stood up. */
export type JdCrew = {
  assignmentId: string;
  workerId: string;
  name: string;
  /** "Crew · (425) 555-0134" — role/specialty and phone where known. */
  meta: string;
  state: "ok" | "wait" | "no";
};

/** One ChangeOrder row. `state` mirrors ChangeOrder.status. */
export type JdChange = {
  id: string;
  /** "CO-1" — positional, the way the donor numbered them. */
  ref: string;
  title: string;
  meta: string;
  amount: number;
  state: "draft" | "sent" | "ok" | "no";
  /** The client-facing approval token — /co/<token>. */
  publicToken: string;
};

/** One JobPhoto row. `url` may be a data: URL — uploadJobPhoto persists the
 *  data URL inline when Vercel Blob isn't configured. */
export type JdPhoto = {
  id: string;
  url: string;
  /** "Before" / "Progress" / "After", title-cased for the plate. */
  kind: string;
  caption: string;
};

/** One JobExpense row. */
export type JdExpense = {
  id: string;
  vendor: string;
  meta: string;
  amount: number;
};

/** A WorkerProfile the org can still put on this job. */
export type JdWorkerOption = {
  id: string;
  name: string;
  meta: string | null;
};

/** The window "Add to schedule" would book, decided on the server so the
 *  button can name it without a clock read during render. */
export type JdBooking = {
  startsAtISO: string;
  endsAtISO: string;
  /** "Aug 18 · 9:00 AM – 2:00 PM". */
  label: string;
};

export type JobDetailRecord = {
  id: string;
  title: string;
  status: StatusKey;
  /** Page head: "Aug 11 → Aug 14, 2026", or "Unscheduled". */
  dates: string;
  /** Overview's Dates cell — the same span, terser. */
  fieldDates: string;
  clientName: string | null;
  scopeOfWork: string | null;
  notes: string | null;
  contact: {
    name: string;
    phone: string | null;
    phoneHref: string | null;
    email: string | null;
    address: string | null;
  } | null;
  /** Null unless `Job.proposalId` resolves. The proposal section renders ONLY
   *  when this is set — no linked proposal, no section. */
  proposal: { id: string; title: string; total: number } | null;
  events: JdEvent[];
  crew: JdCrew[];
  changes: JdChange[];
  photos: JdPhoto[];
  expenses: JdExpense[];
  /** Roster minus the workers already on the job. */
  roster: JdWorkerOption[];
  booking: JdBooking;
  /** False for the SALES / ESTIMATOR roles, which requireManager rejects: the
   *  page renders as a record and hides the controls rather than offering
   *  buttons that can only fail. */
  canWrite: boolean;
};
