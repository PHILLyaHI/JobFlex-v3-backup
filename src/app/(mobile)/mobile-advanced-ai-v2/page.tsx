// Mobile Smart Proposal — mobile-advanced-ai-v2. A handheld-first rebuild of the
// Smart Proposal surface in the Blueprint design system, sibling to /mobile-v2
// (Overview), /mobile-proposals-v2 and /mobile-clients-v2. Lives beside the
// desktop /dashboard/advanced-ai rather than replacing it, per the mobile route
// strategy. (The route slug is historical; the feature is called Smart Proposal
// everywhere it is visible.)
//
// Built with the jobflex-page-styler skill (visual system: tokens, palette, type
// scale, Motion System "Balanced", FLUID SCALE) and the mobile-app-ui-design
// skill (structure: one step per screen, thumb-zone commit bar, ≥44px targets,
// bottom sheets over modals, a designed peak moment on generation). Where the
// two disagree the house system wins — hard 3px offset shadows, 2px radii and
// Inter 900 caps stay, rather than the mobile skill's soft-shadow / rounded-3xl
// defaults.
//
// Content is the donor demo fixture by design: the data layer is out of scope
// until the layout is signed off.
//
// Auth: middleware only matches /dashboard and /admin, so this page enforces
// its own redirect-to-login like the other design routes.

import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { MobileSmartProposal } from "./mobile-advanced-ai";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Smart Proposal · JobFlex Mobile",
  description:
    "Blueprint-edition mobile Smart Proposal: describe the job step by step and get a priced, editable estimate.",
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

export default async function MobileAdvancedAiV2Page() {
  const session = await auth();
  if (!session?.user?.id) {
    // Literal, not V3_PORTED_ROUTES: the registry key for this surface is added
    // by the orchestrator after every page in the batch has landed.
    redirect(`/auth/login?next=${encodeURIComponent("/mobile-advanced-ai-v2")}`);
  }

  return <MobileSmartProposal />;
}
