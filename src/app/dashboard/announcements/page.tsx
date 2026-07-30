// Announcements — Blueprint edition. Pixel-identical port of the canonical
// announcements donor (jobflex-announcements-blueprint_1.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// The classic build of this page was archived to
// old-design-pages/dashboard/announcements/page.tsx.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { AnnouncementsContent } from "@/components/v3/announcements-blueprint/announcements-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Announcements",
  description: "Announcements — active org-wide banners and the archive of past notices on one sheet.",
};

export default async function AnnouncementsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fannouncements");
  }

  return <AnnouncementsContent />;
}
