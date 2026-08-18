// Mobile calendar — mobile-calendar-v2. A handheld-first rebuild of the
// Calendar surface in the Blueprint design system, fourth sibling to
// /mobile-v2 (Overview), /mobile-proposals-v2 (Proposals) and
// /mobile-clients-v2 (Clients). Lives beside the desktop /dashboard/calendar
// rather than replacing it, per the mobile route strategy.
//
// Built with the jobflex-page-styler skill (visual system: tokens, palette,
// type scale, Motion System "Balanced", FLUID SCALE) and the
// mobile-app-ui-design skill (structure: thumb zone, ≥44px targets, bottom
// sheets over modals, search over paging, selection over manual entry).
// Where the two disagree the house system wins — hard 3px offset shadows, 2px
// radii and Inter 900 caps stay, rather than the mobile skill's soft-shadow /
// rounded-3xl defaults.
//
// Content is the ORG'S REAL CALENDAR, read by the same builder the desktop
// /dashboard/calendar page awaits (app/dashboard/calendar/calendar-query.ts).
// It used to be the donor demo fixture "until the layout is signed off" — but
// ResponsiveDashboardShell maps /dashboard/calendar → MobileCalendar, so that
// fixture was what a real contractor saw on a real phone. Creating an event is
// a real write as of 2026-08-15 (the three guarded create actions the desktop
// sheet uses); editing, completing, pushing and deleting are still local to the
// mount.
//
// Auth: middleware only matches /dashboard and /admin, so this page enforces
// its own redirect-to-login like the other design routes. The redirect target
// is the literal path — the shared V3_PORTED_ROUTES key for this surface is
// registered separately. `buildCalendarSeed` re-checks the session through
// `requireOrg()`, which is also what supplies the org and role scoping.

import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { buildCalendarSeed } from "@/app/dashboard/calendar/calendar-query";
import type { CalendarSeed } from "@/components/v3/calendar-blueprint/calendar-data";
import { MobileCalendar } from "./mobile-calendar";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Calendar · JobFlex Mobile",
  description: "Blueprint-edition mobile calendar: month, week and crew views with a scheduling tray and crew confirmations.",
};

// Handheld build: lock the scale so the layout is read at true device width,
// and pay out the notch / home-indicator insets the shell reserves.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default async function MobileCalendarV2Page() {
  let seed: CalendarSeed;
  try {
    seed = await buildCalendarSeed();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect(`/auth/login?next=${encodeURIComponent("/mobile-calendar-v2")}`);
    }
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  return <MobileCalendar data={seed} />;
}
