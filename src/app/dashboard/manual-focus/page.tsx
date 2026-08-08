// Manual proposal builder — "Focus Card" variant
// (route: /dashboard/manual-focus).
//
// Design thesis: attention is the scarce resource, not screen space. Ten cards
// stack down ONE column and nothing ever collapses or hides — but only one card
// is ever LIVE, at full ink strength with every control open. The other nine
// stand down to a quiet summary face at reduced weight that still prints their
// real content ("4 named · 1 unnamed", "Anjali Patel · Austin, TX",
// "30% / 30% / 40%"), so "what did I put in scope?" is answerable without a
// single click. Promotion is a change of WEIGHT rather than a height animation,
// and it is scroll-anchored in JS so the column never jumps under the cursor.
// The grand total rides in a slim sticky strip under the topbar.
//
// Lab sibling of the live builder at /dashboard/proposals/new — it replaces
// nothing. Top-level route on purpose: a child route would inherit its parent's
// page key and stylesheet from the blueprint shell, and this page carries its
// own self-scoped module instead (see manual-focus.module.css for the scoping
// note — "manual-focus" is deliberately absent from the shell's PAGE_STYLES).
//
// Content is a fixture by design: the data layer is out of scope until the
// layout is signed off. Save, Save & send, "save as company defaults" and the
// autosave chip are UI state and write nothing.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { ManualFocusContent } from "@/components/v3/manual-card-lab/manual-focus/manual-focus-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Focus Card",
  description:
    "Build a proposal by hand down one column — one card live at a time, the rest still readable.",
};

export default async function ManualFocusPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fmanual-focus");
  }

  return <ManualFocusContent />;
}
