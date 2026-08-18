// Mobile projects — mobile-projects-v2. A handheld-first rebuild of the Projects
// surface in the Blueprint design system, fourth sibling to /mobile-v2
// (Overview), /mobile-proposals-v2 (Proposals) and /mobile-clients-v2 (Clients).
// Lives beside the desktop /v3/projects rather than replacing it, per the mobile
// route strategy.
//
// Built with the jobflex-page-styler skill (visual system: tokens, palette, type
// scale, status tones, Motion System "Balanced", FLUID SCALE) and the
// mobile-app-ui-design skill (structure: thumb zone, ≥44px targets, bottom
// sheets over modals, search over paging, no blank empty states). Where the two
// disagree the house system wins — hard 3px offset shadows, 2px radii and Inter
// 900 caps stay, rather than the mobile skill's soft-shadow / rounded-3xl
// defaults.
//
// Content is the org's REAL project book: the client component reads it through
// the `listProjects` server action on mount — the desktop page's own org-scoped
// query — and writes through createProject / updateProject / archiveProject.
// It reads rather than being handed props because the same component is mounted
// props-less by the responsive shell at /dashboard/projects ≤768px, and one data
// path beats two.
//
// Auth: middleware only matches /dashboard and /admin, so this page enforces its
// own redirect-to-login like the other design routes. The route key is not read
// from V3_PORTED_ROUTES yet — registration is the orchestrator's serial step, so
// the redirect target is the literal path.

import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { MobileProjects } from "./mobile-projects";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Projects · JobFlex Mobile",
  description:
    "Blueprint-edition mobile projects: every multi-phase build, its budget, its delivery window and how far through it is.",
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

export default async function MobileProjectsV2Page() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile-projects-v2")}`);
  }

  return <MobileProjects />;
}
