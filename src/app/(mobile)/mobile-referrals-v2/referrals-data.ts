// Mobile referrals (mobile-referrals-v2) — row shape + pure helpers.
//
// The eight-row Seattle demo fixture that used to live here (BELL-4T9K, three
// PAID roofers, two CONVERTED, three PENDING) is gone: the build now takes the
// org's real ReferralCode and ReferralConversion rows as props from
// app/dashboard/referrals/load-referrals, the same loader the desktop sheet
// reads. The row type is the desktop's, re-exported so the two editions cannot
// drift; what this module still owns is the handheld list's paging constant,
// the filter menu and the pure formatters.

import type {
  Conversion,
  ConversionStatus,
} from "@/components/v3/referrals-blueprint/referrals-data";

export type { Conversion, ConversionStatus };

/**
 * The desktop list renders up to forty at once. A handheld row is three lines
 * tall, so it pages at 6 — the same reasoning that took the clients ledger from
 * 12 to 8 and the proposals ledger from 8 to 6.
 */
export const PAGE_SIZE = 6;

export const ALL = "ALL";
export type FilterKey = typeof ALL | ConversionStatus;

/** The desktop chip rail's four buckets, in its order. */
export const FILTERS: { k: FilterKey; l: string }[] = [
  { k: ALL, l: "All" },
  { k: "PAID", l: "Credited" },
  { k: "CONVERTED", l: "Converted" },
  { k: "PENDING", l: "Pending" },
];

/** The donor's wording: a credited referral reads "credited", not "paid". */
export function statusLabel(st: ConversionStatus): string {
  return st === "PAID" ? "Credited" : st === "CONVERTED" ? "Converted" : "Pending";
}

/** `money(4900)` → "$49". Rounds so it is safe to call mid count-up. */
export function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

/**
 * Two letters from the mailbox, so a page of rows is scannable at a glance:
 * "ops@…" → OP, "t.mercer@…" → TM. Punctuation is stripped first, which is what
 * keeps "t.mercer" from rendering as "T." — the donor's raw slice(0, 2).
 */
export function initials(email: string): string {
  const local = email.split("@")[0] ?? "";
  const letters = local.replace(/[^A-Za-z]/g, "");
  return (letters.slice(0, 2) || "?").toUpperCase();
}

/** The domain, which is how a contractor recognises the shop behind the email. */
export function domainOf(email: string): string {
  return email.split("@")[1] ?? email;
}

export function matchesStatus(c: Conversion, key: FilterKey): boolean {
  return key === ALL || c.status === key;
}

/** The whole address answers the search box — mailbox and domain both. */
export function matchesQuery(c: Conversion, query: string): boolean {
  if (!query) return true;
  return c.email.toLowerCase().includes(query.trim().toLowerCase());
}

export function statusCount(list: Conversion[], key: FilterKey): number {
  return list.filter((c) => matchesStatus(c, key)).length;
}

/** Credit approved but not yet applied — the masthead's first annotation.
 *  Summed over the rows on the sheet (the newest forty), which is also what
 *  the desktop tiles read. */
export function pendingCents(list: Conversion[]): number {
  return list.filter((c) => c.status === "CONVERTED").reduce((a, c) => a + c.reward, 0);
}
