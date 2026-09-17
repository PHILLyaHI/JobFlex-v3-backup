// CLIENT REVIEW — /review/<token>, the page a homeowner opens from the
// "How did we do?" email. A server component: it loads the request, decides
// form-vs-done, and hands the client form its props. The look is the plain
// stylesheet ./review.css (root `.jf-review`) — the sibling of /r/[slug].
import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { parsePhotos, publicReviewerName, publicReviewsPath } from "@/lib/reviews/publicSummary";
import { ReviewForm } from "./review-form";
import "./review.css";

// One query serves both the metadata and the page.
const loadRequest = cache(async (token: string) =>
  db.reviewRequest.findUnique({
    where: { publicToken: token },
    include: {
      organization: { select: { name: true, slug: true, deletedAt: true } },
      client: { select: { name: true } },
      proposal: { select: { title: true } },
      job: { select: { title: true } },
    },
  }),
);

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const rr = await loadRequest(token);
  const live = rr && !rr.organization.deletedAt;
  return {
    title: live ? `Review ${rr.organization.name} · JobFlex` : "Review · JobFlex",
    // A tokened page addressed to one person; never a search result.
    robots: { index: false, follow: false },
  };
}

export default async function ReviewPublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rr = await loadRequest(token);
  if (!rr || rr.organization.deletedAt) return notFound();

  const submitted =
    rr.status === "COMPLETED" && rr.rating
      ? { rating: rr.rating, comment: rr.comment }
      : null;
  const clientName = rr.client?.name ?? null;

  return (
    <main className="jf-review">
      <ReviewForm
        token={token}
        orgName={rr.organization.name}
        clientName={clientName}
        publicName={clientName ? publicReviewerName(clientName) : null}
        title={rr.proposal?.title ?? rr.job?.title ?? null}
        submitted={submitted}
        photos={parsePhotos(rr.photosJson)}
        publicHref={publicReviewsPath(rr.organization.slug)}
      />
    </main>
  );
}
