// Company blueprint — the donor's embedded demo data plus the types and
// mappers the live page uses. Kept in its own module so company-behavior.ts
// stays pure behavior, matching proposals-blueprint/proposals-data.ts.
//
// The page is NOT a fixture any more: `CompanyOrgState` mirrors the
// Organization columns the three company server actions write, and
// `toActivityEntries` turns real ActivityEvent rows (loaded by
// lib/teamActivity) into the donor's feed row shape using the SAME derivations
// the classic feed uses (lib/teamActivityView) — so the two editions can't
// drift apart. The donor's demo activity array and its private 12-item trade
// list are gone: the trades come from the canonical taxonomy the server
// validates against, and the feed comes from ActivityEvent.

import {
  VERB,
  categoryOf,
  dayLabel,
  timeOfDay,
  type TeamActivityRow,
  type TeamMember,
} from "@/lib/teamActivityView";

export type { TeamActivityRow, TeamMember };

/** The Organization fields this sheet reads and writes. Strings are never null
 *  here — the inputs are uncontrolled text fields, so nulls arrive as "". */
export type CompanyOrgState = {
  name: string;
  billingEmail: string;
  phone: string;
  website: string;
  address: string;
  primaryColor: string;
  logoUrl: string | null;
  /** Canonical trades (lib/tradeTypes) the org takes platform leads for. */
  tradeTypes: string[];
  /** What the shop typed under the "Other" chip, or "" when it is not picked. */
  otherTrade: string;
  leadOffersEnabled: boolean;
  publicProfileEnabled: boolean;
  landingHeroTitle: string;
  landingHeroSubtitle: string;
};

export const COLOR_PRESETS = [
  "#1F7A52",
  "#0EA5E9",
  "#059669",
  "#C89450",
  "#E11D48",
  "#7C3AED",
  "#475569",
  "#111113",
];

// The donor shipped a 12-item trade list of its own. The chips have to offer
// the CANONICAL taxonomy instead: `updateLeadProfile` validates the array with
// `z.enum(TRADE_TYPES)` from lib/tradeTypes, so anything outside that list is
// rejected by the server, and the matcher only understands these names.
export { TRADE_TYPES } from "@/lib/tradeTypes";

export type ActCat = { key: string; label: string };

// The donor's five chips ARE the classic feed's category lens, so both editions
// take the list from one place.
export { CATEGORIES as ACT_CATS } from "@/lib/teamActivityView";

export type ActivityEntry = {
  day: string;
  actor: string;
  /** Membership user id, or "" for a client-side / system event. The person
   *  filter matches on this, not on the display name. */
  actorId: string;
  cat: string;
  /** Contains inline <b> markup — written into the feed as HTML. Everything
   *  interpolated from the database is escaped by `toActivityEntries`. */
  summary: string;
  meta: string;
  time: string;
  tone: string;
};

/** Status bead colour per event kind — blueprint tokens, statuses only. */
const TONE: Record<string, string> = {
  SENT: "var(--blueprint)",
  ACCEPTED: "var(--success)",
  PAID: "var(--success)",
  COMPLETED: "var(--success)",
  SCHEDULED: "var(--warning)",
  DECLINED: "var(--danger)",
};

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CAT_LABEL: Record<string, string> = {
  proposals: "Proposal",
  leads: "Lead",
  jobs: "Job",
  team: "Team",
};

/**
 * Map real ActivityEvent rows onto the donor's feed row shape.
 *
 * Same sentence the classic feed builds: actor + verb, then the object it
 * touched. When the event names no object (workspace created, password reset,
 * invite sent) the event's own summary sentence carries the line and the meta
 * falls back to the category.
 */
export function toActivityEntries(rows: TeamActivityRow[]): ActivityEntry[] {
  return rows.map((row) => {
    const verb = VERB[row.kind] ?? row.kind.toLowerCase().replace(/_/g, " ");
    const cat = categoryOf(row);
    const object = row.proposalTitle ?? row.leadName ?? row.clientName ?? null;
    const meta = object
      ? CAT_LABEL[cat] +
        (row.proposalId && row.clientName ? " · " + row.clientName : "")
      : CAT_LABEL[cat];
    return {
      day: dayLabel(row.createdAt),
      actor: row.actorName ?? "Client",
      actorId: row.actorId ?? "",
      cat,
      summary: object
        ? escapeHtml(verb) + " <b>" + escapeHtml(object) + "</b>"
        : escapeHtml(row.summary || verb),
      meta: escapeHtml(meta),
      time: timeOfDay(row.createdAt),
      tone: TONE[row.kind] ?? "",
    };
  });
}
