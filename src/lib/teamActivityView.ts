// Team-activity VIEW vocabulary — the row shape plus the pure derivations both
// editions of the feed share (the classic React feed in
// components/company/TeamActivity.tsx and the Blueprint company sheet's
// imperative feed in components/v3/company-blueprint).
//
// Pure by design: no db, no React, no framer-motion — so a client bundle can
// import it, and so `lib/teamActivity.ts` (server) no longer has to reach into a
// client component for its return type. Presentation that is edition-specific
// (Tailwind classes, blueprint tokens) stays with each edition.

export type TeamActivityRow = {
  id: string;
  kind: string;
  summary: string;
  createdAt: string; // ISO string
  actorId: string | null;
  actorName: string | null;
  /** The actor's membership role (2026-09-24) — "who did the estimate, the manager or the estimator". */
  actorRole: string | null;
  /** The event's meta JSON; `jobId` ties it to a job. */
  meta: string | null;
  proposalId: string | null;
  proposalTitle: string | null;
  clientId: string | null;
  clientName: string | null;
  leadId: string | null;
  leadName: string | null;
};

export type TeamMember = { id: string; name: string; role: string | null };

// Each event reads as a sentence; the verb carries the meaning.
export const VERB: Record<string, string> = {
  CREATED: "created",
  EDITED: "edited",
  SENT: "sent",
  VIEWED: "viewed",
  ACCEPTED: "accepted",
  PAID: "marked paid",
  SCHEDULED: "scheduled",
  COMPLETED: "completed",
  DECLINED: "declined",
  UPDATED: "updated",
};

// ── Category lens ───────────────────────────────────────────────────────────
// ActivityEvent has no jobId relation, so category is derived. The trail
// kinds (lib/activityLog TRAIL_KINDS) and the payment kinds name their own
// category outright; for the older proposal-shaped kinds the object the row
// points at wins, then job-shaped verbs, then everything else is team /
// system chatter (invites, workspace, password resets).
export type Category =
  | "all"
  | "proposals"
  | "estimates"
  | "money"
  | "jobs"
  | "leads"
  | "stock"
  | "photos"
  | "team";

export const CATEGORIES: { key: Category; label: string }[] = [
  { key: "all", label: "All" },
  { key: "proposals", label: "Proposals" },
  { key: "estimates", label: "Estimates" },
  { key: "money", label: "Money" },
  { key: "jobs", label: "Jobs" },
  { key: "leads", label: "Leads & clients" },
  { key: "stock", label: "Stock" },
  { key: "photos", label: "Photos" },
  { key: "team", label: "Team" },
];

const KIND_CATEGORY: Record<string, Exclude<Category, "all">> = {
  ESTIMATE: "estimates",
  ESTIMATE_ROOF: "estimates",
  ESTIMATE_HVAC: "estimates",
  EXPENSE: "money",
  PAY: "money",
  PAID: "money",
  PAYMENT_RECEIVED: "money",
  PAYMENT_REFUNDED: "money",
  PAYMENT_MARKED: "money",
  PAYMENT_UNMARKED: "money",
  PAYMENT_ALERT: "money",
  PAYMENT_CONNECTED: "money",
  PAYMENT_DISCONNECTED: "money",
  STOCK: "stock",
  MATERIALS: "stock",
  STOCK_LOW: "stock",
  STOCK_SHORT_JOB: "stock",
  PURCHASE_ORDER_SENT: "stock",
  PHOTO: "photos",
  JOB: "jobs",
  PROJECT: "jobs",
  SCHEDULED: "jobs",
  COMPLETED: "jobs",
  CLIENT: "leads",
  APPOINTMENT: "leads",
  FOLLOW_UP: "leads",
  BOOKING_NEW: "leads",
  BOOKING_MOVED: "leads",
  BOOKING_CANCELED: "leads",
  TEAM: "team",
  SETTINGS: "team",
  PASSWORD_RESET: "team",
  AUTH_GOOGLE_LINKED: "team",
  PLAN_CHANGE: "team",
  USAGE_RESET: "team",
};

export function categoryOf(row: TeamActivityRow): Exclude<Category, "all"> {
  const byKind = KIND_CATEGORY[row.kind];
  if (byKind) return byKind;
  // An invoice going out is money, not correspondence.
  if (row.kind === "EMAIL" && /invoice|receipt|deposit|payment/i.test(row.summary)) return "money";
  if (row.proposalId) return "proposals";
  if (row.leadId || row.clientId) return "leads";
  return "team";
}

/** Kinds a client fires from the public portal; with no actor they read as
 *  "Client", every other actor-less row is the system (a cron, a webhook). */
export const CLIENT_KINDS = new Set<string>(["VIEWED", "ACCEPTED", "DECLINED", "LISTENED"]);

export function actorLabel(row: Pick<TeamActivityRow, "kind" | "actorId" | "actorName">): string {
  if (row.actorName) return row.actorName;
  return CLIENT_KINDS.has(row.kind) ? "Client" : "System";
}

// ── Range ───────────────────────────────────────────────────────────────────
// The owner reads the feed by window — Today · 7 days · 30 days · 90 days —
// and the page filters client-side over what the loader brought (90 days).
export type RangeDays = 1 | 7 | 30 | 90;

export const RANGES: { days: RangeDays; label: string }[] = [
  { days: 1, label: "Today" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

/** Inclusive of today: "7 days" is today and the six before it, from midnight. */
export function rangeStart(days: RangeDays, now = new Date()): number {
  return startOfDay(now) - (days - 1) * 86400000;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(d);
}

export function timeOfDay(iso: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(
    new Date(iso),
  );
}
