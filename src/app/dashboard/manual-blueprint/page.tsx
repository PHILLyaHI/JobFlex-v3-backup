// Manual proposal builder — house blueprint skin
// (route: /dashboard/manual-blueprint).
//
// The "Quiet" card-lab variant (/dashboard/manual-blueprint's donor lives at
// /dashboard/manual-quiet) rebuilt in the fleet's own visual system: 2px ink
// frames, hard offset shadows with no blur, near-square corners, caps 900 card
// titles, JetBrains Mono restricted to the drawing-annotation layer, and the
// Motion System "Balanced" entrance cascade.
//
// The donor route is deliberately NOT replaced. The two exist side by side so
// the composition (which was approved) can be judged separately from the skin
// (which is what changed).
//
// Top-level route under /dashboard on purpose: blueprint-shell's pageKey()
// reads the first path segment, so a child route would inherit its parent's
// page key and stylesheet. "manual-blueprint" is deliberately absent from the
// shell's PAGE_STYLES map — this page carries its own self-scoped module
// instead (see the scoping note at the top of manual-blueprint.module.css).
//
// ── NO LONGER A FIXTURE ─────────────────────────────────────────────
// The demo client, the seeded roof job and its five line items are gone. The
// page reads the org's real clients, projects and saved defaults, opens EMPTY,
// and Save / Save & send write through the existing `saveProposal` /
// `sendProposal` actions. Two URL parameters drive it:
//
//   ?client=<id>    the record to file against, the spelling every estimator
//                   already receives from the estimator picker;
//   ?proposal=<id>  an existing proposal to reopen. Written into the URL by the
//                   page itself after the first successful save, so navigating
//                   away and back finds the row instead of a blank sheet.
//
// See manual-blueprint-bridge.ts for what round-trips and what does not.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { NoOrgError, UnauthorizedError, requireOrg } from "@/lib/orgContext";
import { ManualBlueprintContent } from "@/components/v3/manual-card-lab/manual-blueprint/manual-blueprint-content";
import { loadManualBuilder } from "@/components/v3/manual-card-lab/manual-blueprint/manual-blueprint-load";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Manual proposal",
  description:
    "Build a proposal by hand down one column, in the house blueprint system.",
};

/** First value only — `?client=a&client=b` is a malformed link, not a choice. */
function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ManualBlueprintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let ctx;
  try {
    ctx = await requireOrg();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect("/auth/login?next=%2Fdashboard%2Fmanual-blueprint");
    }
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  const params = await searchParams;
  const data = await loadManualBuilder({
    organizationId: ctx.organizationId,
    role: ctx.role,
    userId: ctx.user.id,
    clientId: one(params.client),
    proposalId: one(params.proposal),
  });

  return <ManualBlueprintContent data={data} />;
}
