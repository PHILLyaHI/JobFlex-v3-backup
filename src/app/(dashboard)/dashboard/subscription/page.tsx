// Subscription surface. "The Well-Kept Ledger" — a tier-tinted billing view
// wired to real data: current plan, next bill, real Stripe invoices, and the
// org's referral code. Server component; the (dashboard) layout supplies auth +
// the page container, so this just fetches and hands off to the view.
//
// Plan data comes from the live catalog (admin-managed PricingPlan rows) and
// usage comes from the limits engine — the same caps that actually enforce.
//
// RESPONSIVE, 2026-08-12. One URL, two designs: the desktop view above 768px
// and the Blueprint handheld build at or below it, switched by a media query in
// ./subscription-responsive.tsx (never by user agent, exactly one tree
// mounted). The fetch and the owner-only guard below are unchanged and still
// run on the server for both — the switch is presentation only.

import { redirect } from "next/navigation";
import { requireOrg, isOwnerRole } from "@/lib/orgContext";
import { loadSubscriptionData } from "./subscription-load";
import { SubscriptionResponsive } from "./subscription-responsive";

export const dynamic = "force-dynamic";

export default async function SubscriptionPage() {
  const { organizationId, role } = await requireOrg();
  // Billing is owner-only; managers and other roles bounce back to the dashboard
  // (the nav already hides the link — this is the fail-closed side).
  if (!isOwnerRole(role)) redirect("/dashboard");

  const data = await loadSubscriptionData(organizationId);

  return <SubscriptionResponsive {...data} />;
}
