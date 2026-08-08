// Manual proposal builder — "Proof Card" variant
// (route: /dashboard/manual-proof).
//
// Design thesis: in a quote, every section should show its own consequence on
// the price, in place, so the grand total is never a surprise at the bottom.
// Every card in this single column ends with a PROOF FOOTER — a mono,
// tabular-numeral strip cut off from the body by a 2px ink rule — stating in
// plain arithmetic what that card contributes: "5 rows · 4 priced, 1 unnamed →
// $12,400.20 base cost", "markups + overhead + profit → +$1,802.44", "Texas
// 8.25% on $14,202.64 → +$1,171.72". Read only the footers, top to bottom, and
// you have read the whole estimate as a running derivation ending in the
// proposal total on the last card. Cards that cannot move the price still carry
// a footer, stating coverage instead of money, so the grammar never breaks. Any
// control that moves a figure flashes ONLY the footer it moved, so cause and
// effect are visible without scrolling.
//
// Lab sibling of the live builder at /dashboard/proposals/new — it replaces
// nothing. Top-level route on purpose: a child route would inherit its parent's
// page key and stylesheet from the blueprint shell, and this page carries its
// own self-scoped module instead (see manual-proof.module.css for the scoping
// note — "manual-proof" is deliberately absent from the shell's PAGE_STYLES
// map).
//
// Content is a fixture by design: the data layer is out of scope until the
// layout is signed off. Every id carries an `mc_` prefix, nothing is persisted,
// and Save, Save & send and the state chip are UI state that write nothing.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { ManualProofContent } from "@/components/v3/manual-card-lab/manual-proof/manual-proof-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Proof Card",
  description:
    "Build a proposal by hand down one column — every card proves what it adds to the price.",
};

export default async function ManualProofPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fmanual-proof");
  }

  return <ManualProofContent />;
}
