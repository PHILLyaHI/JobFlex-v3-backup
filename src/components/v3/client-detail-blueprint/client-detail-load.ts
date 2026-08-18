// CLIENT DETAIL / BLUEPRINT — the server read.
//
// This is the file that turns the page from a design preview into a record.
//
// THERE IS NO LONGER A FIXTURE FALLBACK. The loader used to answer a missing or
// unresolvable `?client=` id with an invented client — name, address, billing
// note, six proposals, six payments, eight activity lines — so a stale link, a
// typo, or an id belonging to another org rendered a fabricated person as
// though the org owned the record. It now returns a NOT-FOUND view and the page
// draws an empty state. Nothing on this surface is invented.
//
// The query is the archived classic record page's, verbatim in intent:
// `client.findUnique` with proposals, payments, activities and tags, then an
// organizationId check. Same scoping, same includes, so both editions describe
// the same client.
//
// DATES ARE FORMATTED HERE, ON THE SERVER, and travel as strings — the rule the
// fixture's own header states. A `Date` formatted inside the client component
// would be formatted twice, once per environment, and the first machine whose
// clock or timezone disagreed would produce a hydration mismatch. The
// formatters below are hand-rolled for the same reason `money()` is: Intl
// depends on the runtime's ICU build, and the drawing style wants a padded
// "Aug 08, 2026" rather than Intl's "Aug 8, 2026".

import { db } from "@/lib/db";
import {
  splitAddress,
  type ActivityRow,
  type ClientRecord,
  type PaymentRow,
  type PaymentStatus,
  type ProposalRow,
  type ProposalStatus,
} from "./client-detail-data";

/** The page has nothing to draw, and WHY decides the words on the empty state:
 *  `none` is the bare route with no id in the URL, `missing` is an id that
 *  resolved to nothing in this org (deleted, mistyped, or another org's). */
export type ClientDetailMiss = { found: false; reason: "none" | "missing" };

export type ClientDetailRecord = {
  found: true;
  /** The real row's id. Every write on the page goes through it, and the type
   *  guarantees it exists — the old nullable id was how a fixture could sit in
   *  the record's chair with its Save button quietly switched off. */
  clientId: string;
  client: ClientRecord;
  proposals: ProposalRow[];
  payments: PaymentRow[];
  activity: ActivityRow[];
  /** The raw columns behind `client`, for the Edit dialog.
   *
   *  Carried SEPARATELY rather than parsed back out of the display strings.
   *  `client.address` is one sentence joined from four columns and
   *  `client.email` is "—" when empty; a form seeded from either would write
   *  an em dash into the database the first time someone pressed Save without
   *  touching the field. These are the values `updateClient`'s schema takes,
   *  in the shape it takes them. */
  editable: {
    name: string;
    email: string;
    phone: string;
    /** Street line. See splitAddress() — the second line travels separately. */
    address: string;
    /** Suite / unit / "leave at the side gate". Stored as the SECOND LINE of
     *  the same `address` column: Client has no address2 field and this page
     *  does not add schema. A newline is the one separator that survives a
     *  round trip — splitting on commas is how "Suite B, Building 2" gets
     *  quietly rearranged by an edit nobody made. */
    address2: string;
    city: string;
    state: string;
    zip: string;
    notes: string;
  };
};

export type ClientDetailView = ClientDetailRecord | ClientDetailMiss;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "Aug 08, 2026" — the band's date style. */
function dateLong(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${pad(d.getDate())}, ${d.getFullYear()}`;
}

/** "Aug 09 · 9:04 AM" — the activity stamp style. */
function stamp(d: Date): string {
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${MONTHS[d.getMonth()]} ${pad(d.getDate())} · ${h12}:${pad(d.getMinutes())} ${h < 12 ? "AM" : "PM"}`;
}

/** "Aug 07, 2026" for the ledger's UPDATED annotation. */
const dateShort = dateLong;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** The ledger has five states and the database has more. EXPIRED and ARCHIVED
 *  land on DECLINED because the chip they belong under is "Lost" — a proposal
 *  that timed out is not open, and pretending otherwise inflates the acceptance
 *  rate the KPI strip computes from these rows. PAID and COMPLETED are ACCEPTED
 *  for the mirror reason: the client said yes, and what happened after is the
 *  job's business, not the proposal's. */
function proposalStatus(raw: string): ProposalStatus {
  switch (raw.toUpperCase()) {
    case "SENT":
      return "SENT";
    case "VIEWED":
      return "VIEWED";
    case "ACCEPTED":
    case "PAID":
    case "COMPLETED":
      return "ACCEPTED";
    case "DECLINED":
    case "EXPIRED":
    case "ARCHIVED":
      return "DECLINED";
    default:
      return "DRAFT";
  }
}

function paymentStatus(raw: string): PaymentStatus {
  switch (raw.toUpperCase()) {
    case "PAID":
    case "SUCCEEDED":
      return "PAID";
    case "FAILED":
    case "CANCELED":
    case "CANCELLED":
      return "FAILED";
    default:
      return "PENDING";
  }
}

/** Provider codes are stored SHOUTING ("STRIPE"). The card prints them as
 *  names, so they are cased here rather than in CSS — `text-transform` would
 *  also capitalise the instrument beside it. */
function providerName(raw: string): string {
  const known: Record<string, string> = { STRIPE: "Stripe", PAYPAL: "PayPal", SQUARE: "Square" };
  const key = raw.toUpperCase();
  return known[key] ?? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

/** Every id below was checked against blueprint-shell's sprite. Unknown kinds
 *  fall to `file` rather than to nothing: a row with a missing symbol renders a
 *  26px empty box, which reads as a broken image and not as "no icon". */
const ACTIVITY_ICON: Record<string, string> = {
  SENT: "send",
  EMAIL: "send",
  TEXT: "msg",
  CALL: "phone",
  NOTE: "msg",
  CREATED: "plus",
  UPDATED: "pen",
  EDITED: "pen",
  DELETED: "trash",
  ACCEPTED: "check",
  COMPLETED: "check",
  DECLINED: "ban",
  SCHEDULED: "cal",
  APPOINTMENT: "cal",
  PAYMENT: "bank",
  PAID: "bank",
  INVOICE: "bank",
  JOB: "jobs",
};

/**
 * Read one client for the record page.
 *
 * @param id  the `?client=` param the clients list puts in the URL.
 * @param organizationId  the caller's org. A client from another org is treated
 *   as absent, not as forbidden — answering "missing" for a row that exists in
 *   someone else's org is what stops this page confirming an id by the shape of
 *   its error.
 */
export async function loadClientDetail(
  id: string | undefined,
  organizationId: string,
): Promise<ClientDetailView> {
  if (!id) return { found: false, reason: "none" };

  const row = await db.client.findUnique({
    where: { id },
    include: {
      proposals: { orderBy: { updatedAt: "desc" }, take: 50 },
      payments: { orderBy: { createdAt: "desc" }, take: 50 },
      activities: { orderBy: { createdAt: "desc" }, take: 30 },
      tags: { include: { tag: true } },
    },
  });
  if (!row || row.organizationId !== organizationId || row.deletedAt) {
    return { found: false, reason: "missing" };
  }

  const lastActivity = row.activities[0]?.createdAt ?? row.updatedAt;
  const addr = splitAddress(row.address);

  const client: ClientRecord = {
    // Not rendered — the masthead is titled by the person, not by a filing
    // code. Carried because the type does and a future sheet header may want it.
    recordNo: row.id.slice(-6).toUpperCase(),
    name: row.name,
    initials: initialsOf(row.name),
    // Client has no company column. The lockup keeps the NAME beside its
    // monogram rather than inventing an employer or standing empty; a monogram
    // with nothing next to it is a stamp on a blank line.
    company: row.name,
    email: row.email ?? "—",
    phone: row.phone ?? "—",
    // The two address lines read as one sentence here: the newline that keeps
    // them separable in the database would collapse to a space in HTML, which
    // would print "Suite B Seattle" with nothing between them.
    address:
      [addr.line1, addr.line2, row.city, row.state, row.zip].filter(Boolean).join(", ") || "—",
    city: [row.city, row.state].filter(Boolean).join(", ") || "—",
    since: dateLong(row.createdAt),
    lastContact: dateLong(lastActivity),
    tags: row.tags.map((t) => t.tag.label),
    // The band's fourth fact. It used to read "Net 15 · invoiced to the
    // company" — a fixture sentence, and the moment this page started showing
    // a real record it became a billing term the contractor never agreed to,
    // printed under a real client's name. There is no terms column on Client;
    // `notes` is the free-text field that actually exists, so the slot says
    // what is written there and "—" when nothing is.
    notes: row.notes?.trim() || "—",
  };

  return {
    found: true,
    clientId: row.id,
    client,
    editable: {
      name: row.name,
      email: row.email ?? "",
      phone: row.phone ?? "",
      address: addr.line1,
      address2: addr.line2,
      city: row.city ?? "",
      state: row.state ?? "",
      zip: row.zip ?? "",
      notes: row.notes ?? "",
    },
    proposals: row.proposals.map((p) => ({
      id: p.id,
      title: p.title,
      status: proposalStatus(p.status),
      amount: p.total,
      updated: dateShort(p.updatedAt),
      // publicId is the reference a client would ever be asked to quote, so it
      // is the one printed on the sheet.
      ref: `PRO-${p.publicId.slice(-4).toUpperCase()}`,
    })),
    payments: row.payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      method: providerName(p.provider),
      instrument: p.method ?? "—",
      date: dateLong(p.paidAt ?? p.createdAt),
      status: paymentStatus(p.status),
    })),
    activity: row.activities.map((a) => ({
      id: a.id,
      icon: ACTIVITY_ICON[a.kind.toUpperCase()] ?? "file",
      text: a.summary,
      stamp: stamp(a.createdAt),
    })),
  };
}
