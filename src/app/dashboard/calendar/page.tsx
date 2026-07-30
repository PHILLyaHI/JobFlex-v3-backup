// Calendar — Blueprint edition. Pixel-identical port of the canonical calendar
// donor (jobflex-calendar-blueprint_5.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// The classic calendar page was archived to
// old-design-pages/dashboard/calendar/page.tsx and stays restorable by moving
// it back into src/app/(dashboard)/dashboard/calendar/.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { CalendarContent } from "@/components/v3/calendar-blueprint/calendar-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Calendar",
  description: "Calendar — month, week and crew views with an unscheduled-work tray on one sheet.",
};

export default async function CalendarPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fcalendar");
  }

  return <CalendarContent />;
}
