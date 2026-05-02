import Link from "next/link";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { StaggerGrid } from "@/components/ui/StaggerGrid";
import { EmptyState } from "@/components/ui/EmptyState";
import { StarRating } from "@/components/reviews/StarRating";
import { relative } from "@/lib/format";
import { Star } from "lucide-react";

export default async function ReviewsPage() {
  const { organizationId } = await requireOrg();

  const [reviews, requested, completed] = await Promise.all([
    db.reviewRequest.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { name: true } },
        job: { select: { title: true, id: true } },
      },
    }),
    db.reviewRequest.count({ where: { organizationId } }),
    db.reviewRequest.count({ where: { organizationId, status: "COMPLETED" } }),
  ]);

  const completedReviews = reviews.filter((r) => r.status === "COMPLETED" && r.rating);
  const avg = completedReviews.length
    ? completedReviews.reduce((a, r) => a + (r.rating ?? 0), 0) / completedReviews.length
    : 0;
  const responseRate = requested ? Math.round((completed / requested) * 100) : 0;

  return (
    <>
      <PageHeader
        eyebrow="Reputation"
        title="Reviews"
        description="Clients receive a review link automatically when you mark a job completed. Scores land here."
      />

      <StaggerGrid className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Average rating"
          value={avg ? avg.toFixed(2) : "—"}
          hint={`${completedReviews.length} review${completedReviews.length === 1 ? "" : "s"}`}
        />
        <StatCard label="Total reviews" value={String(completedReviews.length)} />
        <StatCard
          label="Response rate"
          value={`${responseRate}%`}
          hint={`${completed} of ${requested} requested`}
        />
      </StaggerGrid>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Recent reviews</CardTitle>
            <CardSubtitle>Completed submissions come through here</CardSubtitle>
          </div>
        </CardHeader>
        {completedReviews.length === 0 ? (
          <EmptyState
            icon={<Star className="h-5 w-5" />}
            title="No reviews yet"
            description="Mark a job as Completed and we'll email the client a review link. Their submission appears here."
          />
        ) : (
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {completedReviews.map((r) => (
              <li key={r.id} className="flex items-start gap-4 py-4">
                <div className="stat-numeric text-[32px] leading-none text-[color:var(--ink)] tabular shrink-0 w-[60px]">
                  {r.rating ?? 0}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <StarRating value={r.rating ?? 0} size={15} />
                    <span className="text-[11px] text-[color:var(--ink-muted)] tabular">
                      {relative(r.completedAt ?? r.createdAt)}
                    </span>
                  </div>
                  <div className="text-[13px] font-medium text-[color:var(--ink)]">
                    {r.client?.name ?? "Client"}
                    {r.job?.title && (
                      <span className="text-[color:var(--ink-muted)] font-normal">
                        {" · "}
                        <Link
                          href={`/dashboard/jobs/${r.job.id}` as any}
                          className="hover:text-[color:var(--accent)]"
                        >
                          {r.job.title}
                        </Link>
                      </span>
                    )}
                  </div>
                  {r.comment && (
                    <blockquote className="mt-2 font-display italic text-[14px] leading-relaxed text-[color:var(--ink-soft)] border-l-2 border-[color:var(--accent)] pl-3">
                      "{r.comment}"
                    </blockquote>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
