// Mobile proposals (mobile-proposals-v2) — presentation constants only.
//
// The 16-record demo fixture that used to live here was deleted on 2026-08-13.
// Every row this surface draws is now the org's real proposal book, read by
// components/v3/proposals-blueprint/proposals-query.ts — the same query the
// desktop sheet renders from — so the two designs cannot describe different
// books. The row shape is that module's `ProposalRow`, re-exported here so the
// component keeps one import for its data vocabulary.
//
// What is left below is not data: status labels, the chip list, the tab list
// and the page sizes. Those are the design, and they stay.

import type { Installment, ProposalRow } from "@/components/v3/proposals-blueprint/proposals-data";

export type { Installment, ProposalRow };

/** Three tones per status; Sent = sky, Viewed = deep blueprint. ARCHIVED is not
 *  a donor status but is real in the schema, so it needs a plate too. */
export const PSTATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "" },
  SENT: { label: "Sent", cls: "pstatusSent" },
  VIEWED: { label: "Viewed", cls: "pstatusViewed" },
  ACCEPTED: { label: "Accepted", cls: "pstatusAccepted" },
  DECLINED: { label: "Declined", cls: "pstatusDeclined" },
  EXPIRED: { label: "Expired", cls: "pstatusExpired" },
  PAID: { label: "Completed", cls: "pstatusPaid" },
  ARCHIVED: { label: "Archived", cls: "" },
};

/** The plate a status renders as, with a safe fallback for unknown values. */
export function statusPlate(status: string): { label: string; cls: string } {
  return PSTATUS[status] ?? { label: status, cls: "" };
}

/** Chip rail on the ALL tab. Accepted and Completed have their own tabs, so
 *  they deliberately get no chip — matching the desktop ledger. */
export const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "SENT", label: "Sent" },
  { key: "VIEWED", label: "Viewed" },
  { key: "DECLINED", label: "Declined" },
  { key: "EXPIRED", label: "Expired" },
] as const;

export type FilterKey = (typeof FILTERS)[number]["key"];

export const TABS = [
  { key: "all", label: "All" },
  { key: "accepted", label: "Accepted" },
  { key: "completed", label: "Done" },
] as const;

export type TabKey = (typeof TABS)[number]["key"];

// Page sizes are smaller than the desktop ledger's (8/3/2): a phone row is
// taller, and density drops along the funnel — the tear-sheets are the least
// dense block on the page, so one per page.
export const PAGE_ALL = 6;
export const PAGE_ACC = 2;
export const PAGE_DONE = 1;

/** A percentage instalment resolves against the proposal total. */
export { instDollars } from "@/components/v3/proposals-blueprint/proposals-data";

export const sumOf = (list: ProposalRow[]) => list.reduce((a, p) => a + p.total, 0);
export const OPEN_STATUSES: string[] = ["DRAFT", "SENT", "VIEWED"];
