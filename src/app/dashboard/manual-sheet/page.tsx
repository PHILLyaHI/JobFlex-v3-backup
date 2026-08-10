// Manual proposal builder — "Chapters" variant (route: /dashboard/manual-sheet).
//
// Design thesis: ten sections is not ten cards. The rejected build gave each of
// the brief's ten sections its own bordered, shadowed, badged card, and the sum
// of ten individually reasonable boxes was a page that read as busy before a
// single field was drawn. Here the same ten sections are regrouped into FIVE
// chapters — the job, the money, the words, the deal, what they get — one card
// each, with the original section numbers surviving as sub-block ordinals inside
// them. Fewer surfaces, fewer edges, and the saved chrome spent on air: a
// five-rung spacing ladder (6 / 16 / 32 / 32 / 48px) where every boundary is
// exactly one rung louder than the boundary inside it, so nothing needs a rule
// line to be legible as a group. Elevation is a lighter card surface plus a soft
// blurred shadow on the paper ground, never the house 2px ink border.
//
// One persistent device: a sticky chapter rail carrying five short labels, a
// sliding blueprint marker for where you are, and the running total. No actions
// in it — those live once, at the foot, where a document is signed.
//
// Lab sibling of the live builder at /dashboard/proposals/new — it replaces
// nothing. Top-level route on purpose: a child route would inherit its parent's
// page key and stylesheet from the blueprint shell, and this page carries its
// own self-scoped module instead (see manual-sheet.module.css for the scoping
// note — "manual-sheet" is deliberately absent from the shell's PAGE_STYLES).
//
// Content is a fixture by design: the data layer is out of scope until the
// layout is signed off. Save and Save & send are UI state and write nothing.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { ManualSheetContent } from "@/components/v3/manual-card-lab/manual-sheet/manual-sheet-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Chapters",
  description:
    "Build a proposal by hand down one column — ten sections regrouped into five chapters.",
};

export default async function ManualSheetPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fmanual-sheet");
  }

  return <ManualSheetContent />;
}
