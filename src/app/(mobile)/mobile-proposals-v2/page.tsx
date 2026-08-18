// Mobile proposals — mobile-proposals-v2. A handheld-first rebuild of the
// Proposals surface in the Blueprint design system, sibling to /mobile-v2
// (the mobile Overview). Lives beside the desktop /dashboard/proposals rather
// than replacing it, per the mobile route strategy, and ALSO serves that route
// at ≤768px through components/v3/responsive-shell/responsive-dashboard-shell.
//
// Built with the jobflex-page-styler skill (visual system: tokens, palette,
// type scale, Motion System "Balanced", the Proposals page patterns) and the
// mobile-app-ui-design skill (structure: thumb zone, ≥44px targets, bottom
// sheets over modals, expose-don't-hide). Where the two disagree the house
// system wins — hard 3px offset shadows, 2px radii and Inter 900 caps stay,
// rather than the mobile skill's soft-shadow / rounded-3xl defaults.
//
// The content is NOT a fixture any more (2026-08-13). This route reads the
// org's real proposal book here, in the server component, through the same
// readProposalBook() the desktop sheet renders from, and hands it down. The
// shell-mounted copy at /dashboard/proposals gets no props, so it loads the
// same book itself — see ./proposals-actions.ts.
//
// Auth: middleware only matches /dashboard and /admin, so this page enforces
// its own redirect-to-login like the other design routes. readProposalBook()
// throws UnauthorizedError when there is no session, which is the same gate.

import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { readProposalBook } from "@/components/v3/proposals-blueprint/proposals-query";
import type { ProposalRow } from "@/components/v3/proposals-blueprint/proposals-data";
import { V3_PORTED_ROUTES } from "@/lib/v3/routes";
import { MobileProposals } from "./mobile-proposals";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Proposals · JobFlex Mobile",
  description:
    "Blueprint-edition mobile proposals: the open pipeline, signed contracts, and filed jobs on one sheet.",
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

export default async function MobileProposalsV2Page() {
  let rows: ProposalRow[];
  try {
    rows = await readProposalBook();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect(`/auth/login?next=${encodeURIComponent(V3_PORTED_ROUTES.mobileProposalsV2)}`);
    }
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  return <MobileProposals rows={rows} />;
}
