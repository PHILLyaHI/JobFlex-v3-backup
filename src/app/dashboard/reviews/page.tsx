// Main reviews — Blueprint edition. Pixel-identical port of the canonical
// reviews donor (jobflex-reviews-blueprint_3.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// The one symbol the shell's sprite lacks (`i-star`) ships with the content.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { ReviewsContent } from "@/components/v3/reviews-blueprint/reviews-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Reviews",
  description: "Reviews — rating stats, the review feed, score spread and the requests still awaiting a response.",
};

export default async function ReviewsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Freviews");
  }

  return <ReviewsContent />;
}
