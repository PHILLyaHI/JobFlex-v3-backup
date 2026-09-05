// Mobile reviews (mobile-reviews-v2) — row shape + pure helpers.
//
// The eleven-record Seattle fixture that used to live here (M. Henderson's
// reroof, the 4.13 average, the static jobflex.app/r/northline-roofing link)
// is gone: the build now takes the org's real ReviewRequest rows and its
// eligible jobs as props from app/dashboard/reviews/load-reviews, the same
// loader the desktop sheet reads. The row types are the desktop's, re-exported
// so the two editions cannot drift; what this module still owns is the filter
// vocabulary, the tone scale, the feed grouping and the formatters.

import type {
  EligibleJob,
  ReviewEntry,
  ReviewStatus,
} from "@/components/v3/reviews-blueprint/reviews-data";

export type { EligibleJob, ReviewEntry, ReviewStatus };
/** The handheld build's historical name for the row. */
export type ReviewRequest = ReviewEntry;

/** A COMPLETED request that carries a score — what the feed, the masthead and
 *  the spread all work from. Same predicate as the desktop `completed()`; the
 *  type just lets TypeScript see the narrowing. */
export type CompletedReview = ReviewRequest & { rating: number };

export function isCompleted(r: ReviewRequest): r is CompletedReview {
  return r.status === "COMPLETED" && r.rating !== null;
}

export function isOpenRequest(r: ReviewRequest): boolean {
  return r.status !== "COMPLETED";
}

/** The client's public submission link for an open request — the same URL the
 *  desktop's per-row "Copy link" puts on the clipboard. Null when the row has
 *  no token (a completed review no longer needs one). */
export function reviewLink(r: ReviewRequest): string | null {
  if (!r.token || typeof window === "undefined") return null;
  return `${window.location.origin}/review/${r.token}`;
}

/* ---------------------------------------------------------------- filter -- */

export const ALL = "ALL";

/** The desktop's chip rail was All + 5/4/3/2/1. Same dimension, one dropdown. */
export const SCORE_KEYS = ["5", "4", "3", "2", "1"] as const;

export const FILTER_KEYS: string[] = [ALL, ...SCORE_KEYS];

export function filterLabel(key: string): string {
  return key === ALL ? "All scores" : `Score ${key}`;
}

export function matchesScore(r: CompletedReview, key: string): boolean {
  return key === ALL || r.rating === Number(key);
}

export function scoreCount(rows: CompletedReview[], key: string): number {
  return rows.filter((r) => matchesScore(r, key)).length;
}

/* ----------------------------------------------------------------- tone --- */

export type Tone = "hi" | "mid" | "low";

/**
 * Ratings are a STATUS on this surface, so they take the three-tone status
 * scale rather than a decorative ramp: a 4+ job is a win, a 3 is a warning you
 * should call about, a 2 or below is damage. The desktop drew the same split
 * across its score badge (hi / low) and its spread bars.
 */
export function scoreTone(score: number): Tone {
  if (score >= 4) return "hi";
  if (score >= 3) return "mid";
  return "low";
}

/* ------------------------------------------------------------- grouping --- */

/** Feed dividers, newest bucket first. */
export const BUCKETS = ["This week", "Last week", "This month", "Earlier"];

/**
 * `when` is `relative(date)` from the server ("2d ago", "1w ago", "1mo ago"),
 * the same string the desktop renders, so the bucket is parsed back out of it.
 * Anything unparseable falls into the oldest bucket, which is where an unknown
 * age belongs.
 */
export function bucketOf(when: string): number {
  const w = when.trim().toLowerCase();
  if (w === "just now" || w === "now" || w === "today") return 0;
  const m = /^(\d+)\s*(m|h|d|w|mo|y)/.exec(w);
  if (!m) return 3;
  const n = Number(m[1]);
  if (m[2] === "m" || m[2] === "h") return 0;
  if (m[2] === "d") return n < 7 ? 0 : 1;
  if (m[2] === "w") return n <= 1 ? 1 : 2;
  return 3;
}

/** `bucket` is the divider identity; `key` is React's, and carries the run's
 *  first record so two runs of the same bucket can never collide. */
export type FeedGroup = { key: string; bucket: number; label: string; rows: CompletedReview[] };

/**
 * Consecutive-run grouping, not a bucket sort: the feed is already newest-first
 * and a chronological list should never re-order itself around a divider. Same
 * rule the company activity feed uses for its day headers.
 */
export function groupByAge(rows: CompletedReview[]): FeedGroup[] {
  const out: FeedGroup[] = [];
  rows.forEach((r) => {
    const b = bucketOf(r.when);
    const last = out[out.length - 1];
    if (last && last.bucket === b) last.rows.push(r);
    else out.push({ key: `${b}-${r.id}`, bucket: b, label: BUCKETS[b] ?? BUCKETS[3], rows: [r] });
  });
  return out;
}

/* ------------------------------------------------------------- initials --- */

/**
 * Two letters, so a feed of entries is scannable: "M. Henderson" → MH,
 * "Cascade PM" → CP, a single word → its first two letters. Punctuation is
 * stripped first, which is what keeps the "M." initial from becoming ".".
 */
export function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z ]/g, " ").split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Server actions reject with an Error whose message is written for the user
 *  ("You've reached the review-request limit on your plan."). Surface that
 *  text; fall back to a generic line for anything unrecognisable. */
export function actionError(err: unknown): string {
  const msg = err instanceof Error ? err.message.trim() : "";
  if (!msg || msg.toLowerCase().includes("fetch failed")) {
    return "Something went wrong. Check your connection and try again.";
  }
  return msg;
}
