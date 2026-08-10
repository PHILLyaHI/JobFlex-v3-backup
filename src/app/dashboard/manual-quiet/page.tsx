// Manual proposal builder — "Quiet" variant (route: /dashboard/manual-quiet).
//
// Design thesis: nothing collapses. All ten cards are open, always, and the
// calm comes from typography and air alone — 32px inside a card against 48px
// between cards, a 720px measure, one 20px title per card and a label register
// that is deliberately hard to make loud. Cards are lighter surfaces on the
// paper grid with a soft blurred shadow instead of the house's 2px ink border,
// which is what "lifted but quiet" costs. One persistent device: a slim sticky
// bar at the foot carrying the grand total and the three actions, and nothing
// else.
//
// Lab sibling of the live builder at /dashboard/proposals/new — it replaces
// nothing. Top-level route on purpose: a child route would inherit its parent's
// page key and stylesheet from the blueprint shell, and this page carries its
// own self-scoped module instead (see manual-quiet.module.css for the scoping
// note — "manual-quiet" is deliberately absent from the shell's PAGE_STYLES).
//
// Content is a fixture by design: the data layer is out of scope until the
// layout is signed off. Save, Save & send and the draft-state chip are UI state
// and write nothing, and the page says so rather than faking success.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { ManualQuietContent } from "@/components/v3/manual-card-lab/manual-quiet/manual-quiet-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Quiet",
  description:
    "Build a proposal by hand down one column — every card open, nothing hidden, nothing crowded.",
};

export default async function ManualQuietPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fmanual-quiet");
  }

  return <ManualQuietContent />;
}
