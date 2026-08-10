// Subscription — house blueprint skin (route: /dashboard/subscription-blueprint).
//
// A verbatim port of the approved single-file mockup
// "jobflex-subscription-blueprint (8).html". It is a TRANSFER, not a redesign:
// every string of copy, every figure and every CSS declaration is the source's.
//
// /dashboard/subscription IS LIVE and is deliberately NOT replaced. The two
// stand side by side until the owner promotes one — the standing repo
// convention a donor surface is never overwritten by its successor (see the
// header of /dashboard/manual-blueprint/page.tsx, which records the same
// decision).
//
// TOP-LEVEL ROUTE ON PURPOSE. blueprint-shell's pageKey() reads the FIRST path
// segment after /dashboard, so a nested route (…/subscription/blueprint) would
// inherit its parent's page key and stylesheet. "subscription-blueprint" is
// also deliberately absent from the shell's PAGE_STYLES map — a port must not
// edit shell files — so this page carries its own self-scoped CSS module
// instead, and the same key is what its token block hangs off via
// `[data-page="subscription-blueprint"]`. See the scoping note at the top of
// subscription.module.css.
//
// Content is a fixture by design: no server action, no API route, no Prisma
// and — on a billing surface, emphatically — no Stripe call. The plan CTAs,
// the Change plan link and the Copy button are UI state and write nothing.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { SubscriptionContent } from "@/components/v3/subscription-blueprint/subscription-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Verbatim from the source's <title>. The mockup ships no <meta
  // name="description">; the line below is this repo's own convention for a
  // dashboard route and is never rendered on the page.
  title: "JobFlex · Subscription",
  description: "Plan, usage, billing history and the full plan comparison.",
};

export default async function SubscriptionBlueprintPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fsubscription-blueprint");
  }

  return <SubscriptionContent />;
}
