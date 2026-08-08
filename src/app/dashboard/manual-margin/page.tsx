// Manual proposal builder — "Price First" variant
// (route: /dashboard/manual-margin).
//
// Design thesis: contractors do not build a scope and discover a price — they
// know the number they have to hit and reconcile the job against it. So the
// page is INVERTED. Card 01 is the price: an editable TARGET as the biggest
// numeral on the page, the live contract total on an inverse strip beneath it,
// the gap between them, the four markup controls, the tax rate, the estimate
// ledger, and a bar showing the five bands the total is made of. Everything
// below — line items, client, scope, options, terms, payments, files — is an
// INPUT THAT FEEDS THE NUMBER, and every card head states its price effect: a
// contribution percentage when it moves money, "no price effect" when it does
// not. A reduced form of the reconciliation pins under the topbar as card 01
// scrolls away, so the gap never leaves the frame. The one solve on the page —
// "what profit percentage reaches the target" — is computed live and applied
// only on a press.
//
// Lab sibling of the live builder at /dashboard/proposals/new — it replaces
// nothing. Top-level route on purpose: a child route would share its parent's
// page key and stylesheet from the blueprint shell, and this page carries its
// own self-scoped CSS module instead (see the scoping note at the top of
// manual-margin.module.css — "manual-margin" is deliberately absent from the
// shell's PAGE_STYLES map).
//
// Content is a fixture by design: the data layer is out of scope until the
// layout is signed off. There is no Prisma, no server action, no network call
// and no shared draft store behind any control. Save and Save & send are UI
// state and write nothing, and the page says so on its masthead.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { ManualMarginContent } from "@/components/v3/manual-card-lab/manual-margin/manual-margin-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Price First",
  description:
    "Build a proposal from the price down — set the number the job has to hit and reconcile every input against it.",
};

export default async function ManualMarginPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fmanual-margin");
  }

  return <ManualMarginContent />;
}
