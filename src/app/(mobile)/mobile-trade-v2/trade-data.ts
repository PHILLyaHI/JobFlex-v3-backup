// Mobile trade board (mobile-trade-v2) — row shape + pure helpers.
//
// The seven-post Seattle fixture that used to live here (Marcus Bell's dump
// trailer, Ivan Petrov as "you") is gone: the build now takes the org's real
// TradePost rows and the signed-in contractor's name as props from
// app/dashboard/trade/load-trade, the same loader the desktop board reads. The
// row type and the category list are the desktop's, re-exported so the two
// editions cannot drift; what this module still owns is the handheld board's
// paging constant and the pure helpers.

import { CATEGORIES, type TradeCategory, type TradePost } from "@/components/v3/trade-blueprint/trade-data";

export { CATEGORIES };
export type { TradeCategory, TradePost };

/**
 * The desktop renders every post at once in a 330px auto-fill grid. A handheld
 * row is three lines tall, so the board pages — same reasoning that took the
 * proposals ledger from 8 to 6 and the clients book from 12 to 8.
 */
export const PAGE_SIZE = 6;

/** The "no category" filter key — the donor's own `cat` state default. */
export const ALL = "all";

/**
 * Two letters, so the board is scannable: "Marcus Bell" → MB, "Dan Kowalski"
 * → DK, a single word → its first two letters. The donor's function, verbatim.
 */
export function initials(n: string): string {
  const p = n.replace(/[^A-Za-z. ]/g, "").split(" ").filter(Boolean);
  if (!p.length) return "?";
  return p.length === 1
    ? p[0].slice(0, 2).toUpperCase()
    : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

/** Donor `catLabel`: the badge text, lower-cased; the badge caps it in CSS. */
export function catLabel(k: string): string {
  const c = CATEGORIES.find((x) => x.key === k);
  return c ? c.label.toLowerCase() : k.replace("-", " ");
}

export function matchesCat(p: TradePost, key: string): boolean {
  return key === ALL || p.cat === key;
}

/** Title, body, author and category all answer the search box. */
export function matchesQuery(p: TradePost, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    p.title.toLowerCase().includes(q) ||
    p.body.toLowerCase().includes(q) ||
    p.author.toLowerCase().includes(q) ||
    catLabel(p.cat).includes(q)
  );
}

export function catCount(list: TradePost[], key: string): number {
  return list.filter((p) => matchesCat(p, key)).length;
}

/** Server actions reject with an Error whose message is written for the user
 *  ("Only the author can close this post."). Surface that text; fall back to a
 *  generic line for anything unrecognisable. */
export function actionError(err: unknown): string {
  const msg = err instanceof Error ? err.message.trim() : "";
  if (!msg || msg.toLowerCase().includes("fetch failed")) {
    return "Something went wrong. Check your connection and try again.";
  }
  return msg;
}
