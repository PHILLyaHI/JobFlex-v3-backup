// Manual proposal builder — "Spec Sheet" variant (route: /dashboard/manual-spec).
//
// Design thesis: a proposal is a technical specification, so the page is built
// like one. The whole column is ONE continuous filled-in spec sheet and each
// card is a sheet-section, numbered SH-01 to SH-09 like a drawing set. Inside
// every card there are no floating form controls — there is a two-track
// grammar of a fixed mono LABEL GUTTER and an ink VALUE TRACK, and every value
// in the document sits on that track, typed straight onto a rule. Repeating
// structures are spec TABLES whose index shares the same gutter, so one
// vertical construction line runs the length of the page. A sticky title
// block carries the revision, the sheet you are on, the running total and both
// terminal actions; the client's copy is the last sheet, drawn in a
// deliberately different grammar so the boundary is never in doubt.
//
// Lab sibling of the live builder at /dashboard/proposals/new — it replaces
// nothing. Top-level route on purpose: a child route would share its parent's
// page key and stylesheet from the blueprint shell, and this page carries its
// own self-scoped CSS module instead (see manual-spec.module.css for the
// scoping note — "manual-spec" is deliberately absent from PAGE_STYLES).
//
// Content is a fixture by design: the data layer is out of scope until the
// layout is signed off. No server actions, no Prisma, no network, and not the
// live builder's shared draft store. Save and Save & send are UI state and
// write nothing.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { ManualSpecContent } from "@/components/v3/manual-card-lab/manual-spec/manual-spec-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Spec Sheet",
  description:
    "Build a proposal by hand down one column of sheet-sections — every value on a label gutter and a value track, like a filled-in specification.",
};

export default async function ManualSpecPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fmanual-spec");
  }

  return <ManualSpecContent />;
}
