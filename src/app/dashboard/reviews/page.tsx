// Main reviews — Blueprint edition. Pixel-identical port of the canonical
// reviews donor (jobflex-reviews-blueprint_3.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// The one symbol the shell's sprite lacks (`i-star`) ships with the content.
//
// Unlike the fixture ports, the rows here are REAL: ./load-reviews runs the
// archived classic page's query and hands the result to BOTH editions through
// ./reviews-responsive — the desktop sheet above 768px, the handheld build at
// or below — so both describe the same book and both send requests through
// `createReviewRequest`.

import type { Metadata } from "next";
import { MarkNavSeen } from "@/components/layout/MarkNavSeen";
import { loadReviewsProps } from "./load-reviews";
import { ReviewsResponsive } from "./reviews-responsive";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Reviews",
  description: "Reviews — rating stats, the review feed, score spread and the requests still awaiting a response.",
};

export default async function ReviewsPage() {
  const props = await loadReviewsProps("/dashboard/reviews");

  return (
    <>
      {/* Viewing this page clears the reviews badge (per-user, via NavSeen).
          Both editions: the page owns the viewport switch, so this mounts on a
          phone too (the shell's HANDHELD_SEEN stamp for this route is gone). */}
      <MarkNavSeen surface="reviews" />
      <ReviewsResponsive {...props} />
    </>
  );
}
