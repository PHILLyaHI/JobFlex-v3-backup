// Mobile reviews (mobile-reviews-v2) — demo fixture.
//
// Carried over VERBATIM from the desktop reviews donor fixture
// (src/components/v3/reviews-blueprint/reviews-data.ts): same eleven records,
// same field names, same values, so the handheld composition is judged against
// the same content as the desktop sheet. Seattle-area contractor texture:
// eight completed submissions scored 2–5, two SENT requests still open, one
// PENDING request never sent, and one completed review with no comment at all
// (r7, R. Tran) — that last one is what makes the row sheet's disabled state
// reachable.
//
// This is a design surface: the data layer is out of scope, so nothing here
// touches Prisma or a server action. The array is mutated at runtime by the row
// sheet (delete / cancel request), the nudge button and the request form, so
// the component clones this seed per mount.

export type ReviewStatus = "PENDING" | "SENT" | "COMPLETED";

export type ReviewRequest = {
  id: string;
  status: ReviewStatus;
  rating: number | null;
  client: string;
  job: string;
  when: string;
  comment: string | null;
};

export const REVIEWS_SEED: ReviewRequest[] = [
  { id: 'r1', status: 'COMPLETED', rating: 5, client: 'M. Henderson', job: 'Asphalt reroof — 4812 Maple Ave', when: '2d ago',
    comment: 'Crew showed up when they said they would, tarped the garden beds without being asked, and the site was cleaner than when they arrived.' },
  { id: 'r2', status: 'COMPLETED', rating: 5, client: 'D. Reyes', job: 'Cedar fence — 902 Alder Ct', when: '5d ago',
    comment: 'Straight lines, tight gaps, gate swings perfectly. Worth every dollar.' },
  { id: 'r3', status: 'COMPLETED', rating: 4, client: 'K. Sorensen', job: 'Cedar privacy fence — Kirkland', when: '1w ago',
    comment: 'Great work overall. Took one extra day because of the rain, which was fine, but I would have liked a heads-up sooner.' },
  { id: 'r4', status: 'COMPLETED', rating: 5, client: 'Cascade PM', job: 'Q3 turnovers — unit 12', when: '1w ago',
    comment: 'Third property they have handled for us this year. Invoicing is clean and the crews never need babysitting.' },
  { id: 'r5', status: 'COMPLETED', rating: 3, client: 'D. Pham', job: 'Gutter guards — Redmond', when: '2w ago',
    comment: 'Guards work well but there was a mix-up on the scheduled day and nobody called.' },
  { id: 'r6', status: 'COMPLETED', rating: 5, client: 'C. Ferreira', job: 'Punch list — Cypress Ln', when: '3w ago',
    comment: 'Fast, fair price, no surprises on the invoice.' },
  { id: 'r7', status: 'COMPLETED', rating: 4, client: 'R. Tran', job: 'Deck power wash — 55 Cedar Loop', when: '3w ago', comment: null },
  { id: 'r8', status: 'COMPLETED', rating: 2, client: 'L. Wong', job: 'Pergola repair — Sammamish', when: '1mo ago',
    comment: 'Post caps were the wrong color and it took two visits to sort out.' },
  { id: 'r9', status: 'SENT', rating: null, client: 'A. Kim', job: 'Composite deck rebuild', when: '3d ago', comment: null },
  { id: 'r10', status: 'SENT', rating: null, client: 'S. Patel', job: 'Siding patch — Mill Creek', when: '6d ago', comment: null },
  { id: 'r11', status: 'PENDING', rating: null, client: 'T. Bishop', job: 'Skylight install — 210 Fir St', when: '1d ago', comment: null }
];

/** The public submission link the head's ghost action copies. Static string —
 *  nothing on this surface talks to the network. */
export const REVIEW_LINK = "https://jobflex.app/r/northline-roofing";

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
 * The fixture stores pre-formatted ages ("2d ago", "1w ago", "1mo ago"), the
 * same strings the desktop renders, so the bucket is parsed back out of them
 * rather than from a timestamp the fixture never had. Anything unparseable
 * falls into the oldest bucket, which is where an unknown age belongs.
 */
export function bucketOf(when: string): number {
  const w = when.trim().toLowerCase();
  if (w === "just now" || w === "now" || w === "today") return 0;
  const m = /^(\d+)\s*(d|w|mo|y)/.exec(w);
  if (!m) return 3;
  const n = Number(m[1]);
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
 * Two letters, so eight entries are scannable: "M. Henderson" → MH,
 * "Cascade PM" → CP, a single word → its first two letters. Punctuation is
 * stripped first, which is what keeps the "M." initial from becoming ".".
 */
export function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z ]/g, " ").split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
