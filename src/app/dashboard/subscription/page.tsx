// Subscription — house blueprint skin, PROMOTED (route: /dashboard/subscription).
//
// A verbatim port of the approved single-file mockup
// "jobflex-subscription-blueprint (8).html". It is a TRANSFER, not a redesign:
// every string of copy, every figure and every CSS declaration is the source's.
//
// PROMOTION (owner's call, 2026-08-12): this page previously stood at
// /dashboard/subscription-blueprint beside the live classic-shell surface,
// per the standing side-by-side convention (see the header of
// /dashboard/manual-blueprint/page.tsx). The owner picked the blueprint
// version; the donor page — (dashboard)/dashboard/subscription/page.tsx +
// subscription-view.tsx ("The Well-Kept Ledger") — was deleted with it, and
// this route took over its URL. Git history has the donor.
//
// pageKey() reads the FIRST path segment after /dashboard, so this route's
// shell key is now "subscription" — the token block in
// subscription.module.css hangs off `[data-page="subscription"]`. The key is
// still deliberately absent from the shell's PAGE_STYLES map: the page keeps
// carrying its own self-scoped CSS module instead of editing shell files. See
// the scoping note at the top of subscription.module.css.
//
// Content is a fixture by design: no server action, no API route, no Prisma
// and — on a billing surface, emphatically — no Stripe call. The plan CTAs,
// the Change plan link and the Copy button are UI state and write nothing.
// Wiring the live data (plan catalog, usage, invoices, referral) into this
// skin is a separate, not-yet-assigned task.
//
// The donor page was owner-only (billing is fail-closed to OWNER; the navs
// already hide the link from other roles). That gate is preserved here — the
// fixture shows plan figures and invoices, so it inherits the surface's
// access rule even before real data lands.

import { redirect } from "next/navigation";
// RESPONSIVE, 2026-08-18: this route now answers a phone as well as a desktop —
// above 768px the blueprint port, at or below it the handheld build in
// components/v3/mobile-subscription, switched by a media query in
// ./subscription-responsive.tsx. The handheld half runs on REAL data, so the
// page performs the live surface's read (loadSubscriptionData — the existing
// loader, no new query, no new action, no schema change). The desktop half is
// still the mockup's fixture; the two halves therefore disagree on the numbers
// until the blueprint port is wired to the same loader, which is separate work.

import type { Metadata } from "next";
import { requireOrg, isOwnerRole, NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { loadSubscriptionData } from "@/app/(dashboard)/dashboard/subscription/subscription-load";
import { SubscriptionResponsive } from "./subscription-responsive";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Verbatim from the source's <title>. The mockup ships no <meta
  // name="description">; the line below is this repo's own convention for a
  // dashboard route and is never rendered on the page.
  title: "JobFlex · Subscription",
  description: "Plan, usage, billing history and the full plan comparison.",
};

export default async function SubscriptionPage() {
  let organizationId: string;
  let role: string;
  try {
    ({ organizationId, role } = await requireOrg());
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard%2Fsubscription");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }
  // Billing is owner-only. The nav hides the entry from every other role; this
  // is the fail-closed side, and it also has to run BEFORE the loader, whose
  // invoice and referral calls assert ownership themselves.
  if (!isOwnerRole(role)) redirect("/dashboard");

  const data = await loadSubscriptionData(organizationId);

  return <SubscriptionResponsive {...data} />;
}
