// Mobile jobs — mobile-jobs-v2. A handheld-first rebuild of the Jobs surface in
// the Blueprint design system, fourth sibling to /mobile-v2 (Overview),
// /mobile-proposals-v2 and /mobile-clients-v2. Lives beside the desktop
// /dashboard/jobs rather than replacing it, per the mobile route strategy.
//
// Built with the jobflex-page-styler skill (visual system: tokens, palette,
// type scale, Motion System "Balanced", FLUID SCALE) and the
// mobile-app-ui-design skill (structure: thumb reach, ≥44px targets, bottom
// sheets over modals, search over paging, initials over a repeated glyph).
// Where the two disagree the house system wins — hard 3px offset shadows, 2px
// radii and Inter 900 caps stay, rather than the mobile skill's soft-shadow /
// rounded-3xl defaults.
//
// Content is REAL. The board is read from the database by ./jobs-board.ts —
// the desktop page's query, org-scoped through requireOrg — and asked for by
// the component on mount rather than passed down, because the same component is
// mounted props-less by responsive-dashboard-shell on the live /dashboard/jobs
// URL.
//
// Auth: middleware only matches /dashboard and /admin, so this page enforces
// its own redirect-to-login like the other design routes. The board read runs
// its own requireOrg on top of that: the session check here decides whether the
// page renders, and the guard in the read decides whose records it may return —
// a page-level check can never be the thing that scopes a query.

import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { MobileJobs } from "./mobile-jobs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Jobs · JobFlex Mobile",
  description:
    "Blueprint-edition mobile jobs: the whole delivery board, searchable, with schedule, status and crew per job.",
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

export default async function MobileJobsV2Page() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile-jobs-v2")}`);
  }

  return <MobileJobs />;
}
