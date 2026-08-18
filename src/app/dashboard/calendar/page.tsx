// Calendar — Blueprint edition. Pixel-identical port of the canonical calendar
// donor (jobflex-calendar-blueprint_5.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// The classic calendar page was archived to
// old-design-pages/dashboard/calendar/page.tsx and stays restorable by moving
// it back into src/app/(dashboard)/dashboard/calendar/.
//
// This page is NOT a fixture: the grid, the dispatch tray, the crew inbox and
// the link picker are all read from the database, and every mutation the
// behavior module performs goes through the existing calendar server actions
// (appointments.ts / blockedTime.ts / jobs.ts / workers.ts). The read itself
// lives in ./calendar-query.ts — one copy, shared with the handheld edition's
// ./calendar-actions.ts, so the two editions cannot drift.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { CalendarContent } from "@/components/v3/calendar-blueprint/calendar-content";
import type { CalendarSeed } from "@/components/v3/calendar-blueprint/calendar-data";
import { buildCalendarSeed } from "./calendar-query";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Calendar",
  description: "Calendar — month, week and crew views with an unscheduled-work tray on one sheet.",
};

export default async function CalendarPage() {
  let seed: CalendarSeed;
  try {
    seed = await buildCalendarSeed();
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard%2Fcalendar");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  return <CalendarContent seed={seed} />;
}
