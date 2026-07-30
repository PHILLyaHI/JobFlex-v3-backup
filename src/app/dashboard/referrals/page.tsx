// Referrals — Blueprint edition. Pixel-identical port of the canonical
// referrals donor (jobflex-referrals-blueprint_1.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// The classic page was archived to old-design-pages/dashboard/referrals.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { ReferralsContent } from "@/components/v3/referrals-blueprint/referrals-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Referrals",
  description: "Referrals — your code, the reward, and every conversion it has earned on one sheet.",
};

export default async function ReferralsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Freferrals");
  }

  return <ReferralsContent />;
}
