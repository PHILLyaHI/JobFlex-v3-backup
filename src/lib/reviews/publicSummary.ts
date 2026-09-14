// What the OUTSIDE world sees of an org's reviews — the portal badge, the
// public /r/[slug] page and the "your public page" line on the dashboard all
// read through here, so "public" means the same thing everywhere: a COMPLETED
// request with a rating that the contractor has not hidden.
//
// Not for admin or routing: the Lead Center and the dashboard average count
// hidden reviews too (a contractor cannot game the score by hiding a 1-star).
import { db } from "@/lib/db";

export type PublicRating = { avg: number | null; count: number };

export type PublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  photos: string[];
  /** "Maria H." — never the full name, never the email. */
  reviewer: string;
  /** "Mar 2026" */
  when: string;
  /** What was done — the proposal's title, else the job's. */
  title: string | null;
  completedAt: Date;
};

const PUBLIC_WHERE = { status: "COMPLETED", rating: { not: null }, hiddenAt: null } as const;

export async function orgPublicRating(organizationId: string): Promise<PublicRating> {
  const agg = await db.reviewRequest.aggregate({
    where: { organizationId, ...PUBLIC_WHERE },
    _avg: { rating: true },
    _count: { rating: true },
  });
  return { avg: agg._avg.rating, count: agg._count.rating };
}

/** Same aggregate for many orgs at once (the Lead Center roster). Hidden
 *  reviews are EXCLUDED unless `includeHidden` — admin surfaces pass it. */
export async function orgRatingsByIds(
  orgIds: string[],
  opts: { includeHidden?: boolean } = {},
): Promise<Map<string, PublicRating>> {
  const out = new Map<string, PublicRating>();
  if (!orgIds.length) return out;
  const rows = await db.reviewRequest.groupBy({
    by: ["organizationId"],
    where: {
      organizationId: { in: orgIds },
      status: "COMPLETED",
      rating: { not: null },
      ...(opts.includeHidden ? {} : { hiddenAt: null }),
    },
    _avg: { rating: true },
    _count: { rating: true },
  });
  for (const r of rows) out.set(r.organizationId, { avg: r._avg.rating, count: r._count.rating });
  return out;
}

export async function orgPublicReviews(organizationId: string, take = 50): Promise<PublicReview[]> {
  const rows = await db.reviewRequest.findMany({
    where: { organizationId, ...PUBLIC_WHERE },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    take,
    select: {
      id: true,
      rating: true,
      comment: true,
      photosJson: true,
      completedAt: true,
      createdAt: true,
      client: { select: { name: true } },
      proposal: { select: { title: true } },
      job: { select: { title: true } },
    },
  });
  return rows.map((r) => {
    const completedAt = r.completedAt ?? r.createdAt;
    return {
      id: r.id,
      rating: r.rating as number,
      comment: r.comment?.trim() ? r.comment.trim() : null,
      photos: parsePhotos(r.photosJson),
      reviewer: publicReviewerName(r.client?.name),
      when: monthYear(completedAt),
      title: r.proposal?.title?.trim() || r.job?.title?.trim() || null,
      completedAt,
    };
  });
}

export type SpreadRow = { star: 1 | 2 | 3 | 4 | 5; count: number; pct: number };

/** Reviews per star for the public page — counted in the database, so the
 *  bars stay right even when the page shows only the newest N reviews. */
export async function orgPublicSpread(organizationId: string): Promise<SpreadRow[]> {
  const rows = await db.reviewRequest.groupBy({
    by: ["rating"],
    where: { organizationId, ...PUBLIC_WHERE },
    _count: { _all: true },
  });
  const counts: Record<number, number> = {};
  for (const r of rows) if (r.rating != null) counts[r.rating] = r._count._all;
  return ratingSpread(counts);
}

/** The reviews-per-star histogram, from a {star: count} map. */
export function ratingSpread(counts: Record<number, number>): SpreadRow[] {
  const max = Math.max(1, ...[5, 4, 3, 2, 1].map((n) => counts[n] ?? 0));
  return ([5, 4, 3, 2, 1] as const).map((star) => {
    const count = counts[star] ?? 0;
    return { star, count, pct: (count / max) * 100 };
  });
}

/** "Maria Hernandez" → "Maria H.", "Maria" → "Maria", nothing → "Verified client". */
export function publicReviewerName(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Verified client";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export function parsePhotos(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((u): u is string => typeof u === "string" && u.length > 0) : [];
  } catch {
    return [];
  }
}

export function monthYear(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(d);
}

/** "4.8" — one decimal, never "4.75"; null when there are no ratings. */
export function formatAvg(avg: number | null): string | null {
  return avg == null ? null : (Math.round(avg * 10) / 10).toFixed(1);
}

export function publicReviewsPath(slug: string): string {
  return `/r/${encodeURIComponent(slug)}`;
}
