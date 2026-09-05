// Reviews — the ONE loader both editions read.
//
// /dashboard/reviews (desktop sheet + handheld build behind the viewport
// switch) and the /mobile-reviews-v2 preview route call this. The query is the
// archived classic page's — same joins, same ordering, same average /
// response-rate inputs — plus the token each pending row needs to hand over
// the client's review link, and the list of jobs that have no review request
// yet, which is what the request sheet sends against via `createReviewRequest`.

import { redirect } from "next/navigation";
import { NoOrgError, UnauthorizedError, requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { relative } from "@/lib/format";
import type {
  EligibleJob,
  ReviewEntry,
  ReviewStatus,
} from "@/components/v3/reviews-blueprint/reviews-data";

export type ReviewsProps = { entries: ReviewEntry[]; jobs: EligibleJob[] };

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

  const [requests, openJobs] = await Promise.all([
    db.reviewRequest.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { name: true } },
        job: { select: { id: true, title: true } },
      },
    }),
    // The request sheet's options. A job that already has a request is
    // excluded because `createReviewRequest` is idempotent per job — offering
    // one would look like a send and do nothing.
    db.job.findMany({
      where: { organizationId, reviewRequests: { none: {} } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { id: true, title: true, status: true, client: { select: { name: true } } },
    }),
  ]);

  const entries: ReviewEntry[] = requests.map((r) => ({
    id: r.id,
    jobId: r.jobId,
    status: toStatus(r.status),
    rating: r.rating,
    client: r.client?.name ?? "Client",
    job: r.job?.title ?? "Job",
    when: relative(r.completedAt ?? r.sentAt ?? r.createdAt),
    comment: r.comment,
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

  return { entries, jobs };
}
