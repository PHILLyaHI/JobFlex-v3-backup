// Line-item lab (route: /dashboard/manual-lines).
//
// Three competing designs of card 03 — the priced work — from the manual
// proposal builder at /dashboard/manual-blueprint, stacked down one column and
// driven by ONE piece of state, so the comparison is of the designs rather than
// of whatever fixture each was seeded with.
//
// All three implement the same `LineItemsProps` (see lines-lab/lines-contract.ts),
// which is what makes the winner a one-line import swap in the builder and what
// makes this page possible at all.
//
// Top-level route under /dashboard on purpose: blueprint-shell's pageKey() reads
// the first path segment, so a child route would inherit its parent's page key
// and stylesheet. "manual-lines" is deliberately absent from the shell's
// PAGE_STYLES — the page and each variant carry their own self-scoped modules.
//
// Temporary by design. Once a variant wins, this route, the two losing folders
// and the contract's lab-only bits go away together.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { LinesLabContent } from "@/components/v3/manual-card-lab/lines-lab/lines-lab-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Line items — three designs",
  description:
    "Three designs of the proposal line-item table, side by side on one shared draft.",
};

export default async function LinesLabPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fmanual-lines");
  }

  return <LinesLabContent />;
}
