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
  actorLabel,
  categoryOf,
  dayLabel,
  timeOfDay,
  type TeamActivityRow,
  type TeamMember,
} from "@/lib/teamActivityView";
import { whoColor } from "@/lib/team/who";

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
  /** Whether the org has a geocoded pin. The matcher hard-filters on it
   *  (lib/leadCenter/matching), so the Lead matching badge is wrong without
   *  it: until 2026-09-17 the badge read "Matching on" off trades + toggle
   *  alone, and said so to every shop the router could not see. */
  geocoded: boolean;
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
export { CATEGORIES as ACT_CATS, RANGES as ACT_RANGES } from "@/lib/teamActivityView";

export type ActivityEntry = {
  day: string;
  /** Epoch ms of createdAt — the range control filters on it client-side. */
  at: number;
  kind: string;
  /** The person's name; "System" for a cron or webhook, "Client" for a portal
   *  click (VIEWED / ACCEPTED / DECLINED with no actor). */
  actor: string;
  /** Membership user id, or "" for a client-side / system event. The person
   *  filter matches on this, not on the display name. */
  actorId: string;
  /** Membership role (OWNER, ESTIMATOR, …) for the mark; null off the team. */
  actorRole: string | null;
  /** The person's own color (lib/team/who) — the same on every page. */
  actorColor: string;
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
  PAYMENT_RECEIVED: "var(--success)",
  PAYMENT_MARKED: "var(--success)",
  PAY: "var(--success)",
  PAYMENT_REFUNDED: "var(--danger)",
  PAYMENT_ALERT: "var(--danger)",
  STOCK_LOW: "var(--warning)",
  STOCK_SHORT_JOB: "var(--warning)",
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
  estimates: "Estimate",
  money: "Money",
  jobs: "Job",
  leads: "Lead",
  stock: "Stock",
  photos: "Photo",
  team: "Team",
};

/**
 * Map real ActivityEvent rows onto the donor's feed row shape.
 *
 * The STORED summary carries the line — it is the one sentence the writer
 * chose, with the amount, the stage, the file count ("Added a $240 expense to
 * Roof replacement — dumpster"). Until 2026-09-24 this rebuilt "verb object"
 * from the kind and lost all of that. The object the row points at (proposal,
 * lead, client) is appended in bold only when the sentence does not already
 * name it; a row with no summary at all falls back to the verb.
 */
export function toActivityEntries(rows: TeamActivityRow[]): ActivityEntry[] {
  return rows.map((row) => {
    const verb = VERB[row.kind] ?? row.kind.toLowerCase().replace(/_/g, " ");
    const cat = categoryOf(row);
    const object = row.proposalTitle ?? row.leadName ?? row.clientName ?? null;
    const stored = (row.summary ?? "").trim();
    const names = object ? stored.toLowerCase().includes(object.trim().toLowerCase()) : true;
    let summary: string;
    if (stored && names) summary = escapeHtml(stored);
    else if (stored) summary = escapeHtml(stored) + " · <b>" + escapeHtml(object as string) + "</b>";
    else if (object) summary = escapeHtml(verb) + " <b>" + escapeHtml(object) + "</b>";
    else summary = escapeHtml(verb);
    const meta = object
      ? CAT_LABEL[cat] +
        (row.proposalId && row.clientName && !stored.toLowerCase().includes(row.clientName.toLowerCase())
          ? " · " + row.clientName
          : "")
      : CAT_LABEL[cat];
    return {
      day: dayLabel(row.createdAt),
      at: new Date(row.createdAt).getTime(),
      kind: row.kind,
      actor: actorLabel(row),
      actorId: row.actorId ?? "",
      actorRole: row.actorId ? row.actorRole : null,
      actorColor: whoColor(row.actorId),
      cat,
      summary,
      meta: escapeHtml(meta),
      time: timeOfDay(row.createdAt),
      tone: TONE[row.kind] ?? "",
    };
  });
}
