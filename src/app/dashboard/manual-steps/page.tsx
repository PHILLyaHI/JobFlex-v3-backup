// Manual proposal builder — "Steps" variant (route: /dashboard/manual-steps).
//
// Design thesis: least ink on screen wins. Ten sections stack down one column
// and exactly ONE is open; the other nine shut to a 72px row that still prints
// its real content ("Deposit 30% · Start 30% · Completion 40%", "Tear off,
// Architectural shingle +2 · tax 8.25%"), so the shut stack works as the
// contents page of the document being built and "what did I put in there?" is
// answerable without a click. Opening is scroll-anchored in JS, because closing
// a card above the one you clicked would otherwise drag several hundred pixels
// of column out from under the pointer. The grand total rides in a sticky bar.
//
// Lab sibling of /dashboard/manual-focus and of the live builder at
// /dashboard/proposals/new — it replaces neither. Top-level route on purpose:
// the blueprint shell's pageKey() reads the first segment after /dashboard, so
// a child route would inherit its parent's stylesheet. "manual-steps" is
// deliberately absent from the shell's PAGE_STYLES and this page carries its
// own self-scoped module instead (see manual-steps.module.css).
//
// Content is a fixture by design: the data layer is out of scope until the
// layout is signed off. Save and Save & send write nothing and the UI says so.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { ManualStepsContent } from "@/components/v3/manual-card-lab/manual-steps/manual-steps-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Steps",
  description:
    "Build a proposal by hand down one column — one section open, the other nine readable at a glance.",
};

export default async function ManualStepsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fmanual-steps");
  }

  return <ManualStepsContent />;
}
