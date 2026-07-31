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
  proposalId: string | null;
  proposalTitle: string | null;
  clientId: string | null;
  clientName: string | null;
  leadId: string | null;
  leadName: string | null;
};

export type TeamMember = { id: string; name: string };

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
// ActivityEvent has no jobId relation, so category is derived: the object it
// points at wins first, then job-shaped verbs, then everything else is team /
// system chatter (invites, workspace, password resets).
export type Category = "all" | "proposals" | "leads" | "jobs" | "team";

export const CATEGORIES: { key: Category; label: string }[] = [
  { key: "all", label: "All" },
  { key: "proposals", label: "Proposals" },
  { key: "leads", label: "Leads & clients" },
  { key: "jobs", label: "Jobs" },
  { key: "team", label: "Team" },
];

export function categoryOf(row: TeamActivityRow): Exclude<Category, "all"> {
  if (row.proposalId) return "proposals";
  if (row.leadId || row.clientId) return "leads";
  if (row.kind === "SCHEDULED" || row.kind === "COMPLETED") return "jobs";
  return "team";
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
