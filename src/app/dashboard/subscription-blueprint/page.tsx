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

// RESPONSIVE + PROMOTED, 2026-08-13. The sidebar's Subscription button now
// points HERE rather than at /dashboard/subscription, so this route has to
// answer a phone as well as a desktop: above 768px the blueprint port below,
// at or below it the handheld build in components/v3/mobile-subscription,
// switched by a media query in ./subscription-blueprint-responsive.tsx.
//
// The handheld half runs on REAL data, so this page now performs the live
// surface's read (loadSubscriptionData — the existing loader, no new query, no
// new action, no schema change) and its owner-only guard. The desktop half is
// still the mockup's fixture; the two halves therefore disagree on the numbers
// until the blueprint port is wired to the same loader, which is separate work.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireOrg, isOwnerRole, NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { loadSubscriptionData } from "@/app/(dashboard)/dashboard/subscription/subscription-load";
import { SubscriptionBlueprintResponsive } from "./subscription-blueprint-responsive";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Verbatim from the source's <title>. The mockup ships no <meta
  // name="description">; the line below is this repo's own convention for a
  // dashboard route and is never rendered on the page.
  title: "JobFlex · Subscription",
  description: "Plan, usage, billing history and the full plan comparison.",
};

export default async function SubscriptionBlueprintPage() {
  // The blueprint layout swallows an auth failure so the PAGE can decide, which
  // is why this is a try/catch rather than a bare requireOrg().
  let organizationId: string;
  let role: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
    role = ctx.role;
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect("/auth/login?next=%2Fdashboard%2Fsubscription-blueprint");
    }
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  // Billing is owner-only. The nav hides the entry from every other role; this
  // is the fail-closed side, and it also has to run BEFORE the loader, whose
  // invoice and referral calls assert ownership themselves.
  if (!isOwnerRole(role)) redirect("/dashboard");

  const data = await loadSubscriptionData(organizationId);

  return <SubscriptionBlueprintResponsive {...data} />;
}
