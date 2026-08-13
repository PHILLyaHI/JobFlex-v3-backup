// Mobile subscription — mobile-subscription-v2. The handheld-first rebuild of
// the SUBSCRIPTION / BILLING surface in the Blueprint design system, sibling to
// /mobile-v2 (Overview), /mobile-referrals-v2 and the rest of the handheld
// fleet. It lives beside the live /dashboard/subscription rather than replacing
// it, per the mobile route strategy — and it renders the SAME component that
// URL serves at ≤768px, so this route is a direct preview of the real thing and
// not a second copy that can drift.
//
// Built with the jobflex-page-styler skill (visual system: tokens, palette,
// type scale, Motion System "Balanced", the fluid 320→768 scale) and the
// mobile-app-ui-design skill (structure: thumb zone, ≥44px targets, bottom
// sheets over modal dialogs, values emphasised over labels). Where the two
// disagree the house system wins — hard 3px offset shadows, 2px radii and
// Inter 900 caps stay, rather than the mobile skill's soft-shadow / rounded-3xl
// defaults.
//
// REAL DATA, not a fixture. This is a billing surface, so the preview reads the
// same catalog, limits, Stripe invoices and referral code the live page does,
// through the shared loader in the live route's folder. No new query, no new
// server action, no new API route.
//
// AUTH. Middleware only matches /dashboard and /admin, so this route enforces
// its own gate: signed in, has an org, and is the OWNER — billing is owner-only
// everywhere and a preview URL is not an exception. A non-owner is redirected
// to /dashboard, the same destination the live page uses.

import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrg, isOwnerRole } from "@/lib/orgContext";
import { loadSubscriptionData } from "@/app/(dashboard)/dashboard/subscription/subscription-load";
import { MobileSubscription } from "@/components/v3/mobile-subscription/mobile-subscription";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Subscription · JobFlex Mobile",
  description:
    "Blueprint-edition mobile billing: your plan, what it bills next, the caps you are using, every invoice and your referral code.",
};

// Handheld build: read at true device width and pay out the notch /
// home-indicator insets the shell reserves. `maximumScale` is deliberately NOT
// set — suppressing pinch-zoom fails WCAG 1.4.4, and this is a page where
// people zoom in to read a price.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default async function MobileSubscriptionV2Page() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile-subscription-v2")}`);
  }

  const { organizationId, role } = await requireOrg();
  if (!isOwnerRole(role)) redirect("/dashboard");

  const data = await loadSubscriptionData(organizationId);

  return <MobileSubscription {...data} />;
}
