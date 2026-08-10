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
// Content is a fixture by design: the data layer stays out of scope until the
// layout is signed off. Save, Save & send and the draft-state chip are UI
// state and write nothing, and the page says so rather than faking success.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { ManualBlueprintContent } from "@/components/v3/manual-card-lab/manual-blueprint/manual-blueprint-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Manual proposal",
  description:
    "Build a proposal by hand down one column, in the house blueprint system.",
};

export default async function ManualBlueprintPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fmanual-blueprint");
  }

  return <ManualBlueprintContent />;
}
