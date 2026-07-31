// Main reviews — Blueprint edition. Pixel-identical port of the canonical
// reviews donor (jobflex-reviews-blueprint_3.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// The one symbol the shell's sprite lacks (`i-star`) ships with the content.
//
// Unlike the fixture ports, the rows here are REAL: the query is the archived
// classic page's (old-design-pages/dashboard/reviews/page.tsx) — same joins,
// same ordering, same average / response-rate inputs — plus the token each
// pending row needs to hand over the client's review link, and the list of
// jobs that have no review request yet, which is what the request dialog
// sends against via `createReviewRequest`.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { NoOrgError, UnauthorizedError, requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { relative } from "@/lib/format";
import { MarkNavSeen } from "@/components/layout/MarkNavSeen";
import { ReviewsContent } from "@/components/v3/reviews-blueprint/reviews-content";
import type {
  EligibleJob,
  ReviewEntry,
  ReviewStatus,
} from "@/components/v3/reviews-blueprint/reviews-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Reviews",
  description: "Reviews — rating stats, the review feed, score spread and the requests still awaiting a response.",
};

/** The model's status column is a free string; the page only knows three. */
function toStatus(raw: string): ReviewStatus {
  return raw === "COMPLETED" || raw === "SENT" ? raw : "PENDING";
}

export default async function ReviewsPage() {
  let organizationId: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard%2Freviews");
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
    // The request dialog's options. A job that already has a request is
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

  return (
    <>
      {/* Viewing this page clears the reviews badge (per-user, via NavSeen) —
          the classic page's behavior, restored. Renders null. */}
      <MarkNavSeen surface="reviews" />
      <ReviewsContent entries={entries} jobs={jobs} />
    </>
  );
}
