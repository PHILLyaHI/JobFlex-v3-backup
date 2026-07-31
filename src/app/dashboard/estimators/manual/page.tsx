// Manual builder (route: /dashboard/estimators/manual) — the hand-built cost
// sheet: typed line items grouped into sections, a price book to pull priced
// items and whole templates from, and a live totals rail. The no-AI,
// no-geometry counterpart to the Roof and Fence estimators, and the one
// estimator that works for a trade with no engine of its own.
//
// Child of /dashboard/estimators, which means it shares that route's page key
// and therefore its stylesheet — see estimators.module.css.
//
// Content is a fixture by design: the data layer is out of scope until the
// layout is signed off. "Convert to proposal" opens the proposal builder
// WITHOUT persisting anything.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { ManualBuilderContent } from "@/components/v3/estimators-blueprint/manual-builder-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Manual Builder",
  description:
    "Build an estimate by hand — line items, price book, live totals.",
};

export default async function ManualBuilderPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Festimators%2Fmanual");
  }

  return <ManualBuilderContent />;
}
