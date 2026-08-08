// Manual proposal builder — "Worklist" variant
// (route: /dashboard/manual-worklist).
//
// Design thesis: the page tells you what is LEFT, and finishing something
// visibly removes work from view. Eight cards sit in ONE column split by a
// heavy labelled seam — OPEN above it in priority order (blocking first, since
// a proposal with no client and no named lines cannot be sent), SETTLED below
// it as one-line receipts carrying an ink check-stamp and the card's actual
// content. Every card prints its own done-condition on a rule line, and meeting
// that condition MOVES the card across the seam: animated, reduced-motion
// respected, deferred until blur so typing is never yanked out from under you,
// and always with an undo offer that names the cause. A sticky ledger reads
// "4 of 8 settled · $13,319.02" so the two numbers that matter — how much work
// is left and how much the job is worth — stay one glance apart.
//
// Lab sibling of the live builder at /dashboard/proposals/new — it replaces
// nothing. Top-level route on purpose: a child route would share its parent's
// page key and stylesheet from the blueprint shell, and this page carries its
// own self-scoped module instead (see manual-worklist.module.css for the
// scoping note — "manual-worklist" is deliberately absent from PAGE_STYLES).
//
// Content is a fixture by design: the data layer is out of scope until the
// layout is signed off. Save, Save & send, "Save these as company defaults" and
// the file drop zone are UI state and write nothing, anywhere.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { ManualWorklistContent } from "@/components/v3/manual-card-lab/manual-worklist/manual-worklist-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Worklist",
  description:
    "Build a proposal by hand down one column — a self-sorting worklist where settled cards sink below the seam.",
};

export default async function ManualWorklistPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fmanual-worklist");
  }

  return <ManualWorklistContent />;
}
