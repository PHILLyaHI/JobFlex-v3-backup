// Reviews — the ONE loader both editions read.
//
// /dashboard/reviews (desktop sheet + handheld build behind the viewport
// switch) and the /mobile-reviews-v2 preview route call this. The query is the
// archived classic page's — same joins, same ordering, same average /
// response-rate inputs — plus the token each pending row needs to hand over
// the client's review link, the list of jobs that have no review request
// yet (what the request sheet sends against via `createReviewRequest`), and
// since 2026-09-13 the org's public page (/r/<slug>) with its public rating,
// the photos on each review and whether the contractor hid it.

import { redirect } from "next/navigation";
import { NoOrgError, UnauthorizedError, requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { relative } from "@/lib/format";
import { formatAvg, orgPublicRating, parsePhotos, publicReviewsPath } from "@/lib/reviews/publicSummary";
import type {
  EligibleJob,
  ReviewEntry,
  ReviewStatus,
} from "@/components/v3/reviews-blueprint/reviews-data";

export type ReviewsProps = {
  entries: ReviewEntry[];
  jobs: EligibleJob[];
  /** /r/<slug> — the contractor's public reviews page. */
  publicHref: string;
  /** What the public page and the portal badge show: not-hidden reviews only. */
  publicRating: { avg: string | null; count: number };
};

/** The model's status column is a free string; the page only knows three. */
function toStatus(raw: string): ReviewStatus {
  return raw === "COMPLETED" || raw === "SENT" ? raw : "PENDING";
}

/**
 * @param nextPath where the login redirect should return to — the route that
 *   called this, so a preview URL comes back to the preview.
 */
export async function loadReviewsProps(nextPath: string): Promise<ReviewsProps> {
  let organizationId: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
    }
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  const [requests, openJobs, org, pub] = await Promise.all([
    db.reviewRequest.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { name: true } },
        job: { select: { id: true, title: true } },
        proposal: { select: { id: true, title: true } },
      },
    }),
    // The request sheet's options. A job that already has a request is
    // excluded because `createReviewRequest` is idempotent per job — offering
    // one would look like a send and do nothing.
    db.job.findMany({
      where: {
        organizationId,
        reviewRequests: { none: {} },
        // …and neither does the proposal behind it: a proposal completed by
        // hand already holds the one request its jobs would share.
        OR: [{ proposalId: null }, { proposal: { is: { reviewRequests: { none: {} } } } }],
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { id: true, title: true, status: true, client: { select: { name: true } } },
    }),
    db.organization.findUnique({ where: { id: organizationId }, select: { slug: true } }),
    orgPublicRating(organizationId),
  ]);

  const entries: ReviewEntry[] = requests.map((r) => ({
    id: r.id,
    jobId: r.jobId,
    proposalId: r.proposalId,
    status: toStatus(r.status),
    rating: r.rating,
    client: r.client?.name ?? "Client",
    job: r.job?.title ?? r.proposal?.title ?? "Proposal",
    when: relative(r.completedAt ?? r.sentAt ?? r.createdAt),
    comment: r.comment,
    photos: parsePhotos(r.photosJson),
    hidden: r.hiddenAt != null,
    token: r.publicToken,
  }));

  // Completed jobs are the ones a review is actually owed on, so they lead the
  // list; the rest stay selectable for the manager who asks early.
  const jobs: EligibleJob[] = openJobs
    .map((j) => ({
      id: j.id,
      title: j.title,
      client: j.client?.name ?? "No client",
      status: j.status,
    }))
    .sort((a, b) => Number(b.status === "COMPLETED") - Number(a.status === "COMPLETED"));

  return {
    entries,
    jobs,
    publicHref: publicReviewsPath(org?.slug ?? ""),
    publicRating: { avg: formatAvg(pub.avg), count: pub.count },
  };
}
