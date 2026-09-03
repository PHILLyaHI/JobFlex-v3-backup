// Create account — Blueprint edition. Pixel-identical port of the donor
// `jobflex-auth-register-blueprint.html`.
//
// REPLACED IN PLACE, not forked. /auth/register is the live registration
// surface and now serves the blueprint build directly; there is deliberately no
// parallel /auth/register-blueprint route. This REVERSES the earlier
// side-by-side convention recorded in the header of
// /dashboard/subscription-blueprint/page.tsx ("a donor surface is never
// overwritten by its successor") — replacement is the instruction now.
//
// Public route: registration necessarily runs before a session exists, so there
// is no auth check here, exactly as before.
//
// All registration logic is unchanged — registerAccount (server action) +
// next-auth signIn + the promo/referral attribution capture. No server action,
// API route or Prisma model was added or altered by the restyle.

// VIEWPORT SWITCH: this route now serves the handheld rebuild at ≤768px and the
// blueprint desktop build above it, from this one URL — see
// ./register-responsive.tsx for the mechanism and why it is a sibling file
// rather than inline. /mobile-v1/auth/register remains as a direct preview URL.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isPlaceholderOrgName, needsCompanySetup } from "@/lib/orgSetup";
import { RegisterResponsive, type SetupPrefill } from "./register-responsive";

// Title is the donor's <head> verbatim. The mockup ships no <meta
// name="description">; the line below is this repo's own convention.
export const metadata: Metadata = {
  title: "JobFlex · Create account",
  description: "Set up your shop — your organization, your login, your first quote.",
};

// GOOGLE SIGNUPS finish here. The auth callback provisions the account + a
// placeholder org and signs the person in; the dashboard layout sends an
// owner whose org still has no address/trades to this URL, and this page
// opens straight on step 2 with what Google gave us (name, email) filled in.
// A signed-in owner whose org IS set up, arriving here without a Stripe
// return token, belongs in the app.
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  let setup: SetupPrefill | null = null;
  let sendToApp = false;
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (userId && session.user.principal !== "INFLUENCER") {
      const m = await db.membership.findFirst({
        where: { userId, role: "OWNER", organization: { deletedAt: null } },
        orderBy: { createdAt: "asc" },
        select: {
          user: { select: { name: true, email: true, phone: true } },
          organization: { select: { name: true, address: true, phone: true, tradeTypesJson: true } },
        },
      });
      if (m && needsCompanySetup(m.organization)) {
        setup = {
          name: m.user.name ?? "",
          email: m.user.email ?? "",
          phone: m.user.phone ?? "",
          businessName: isPlaceholderOrgName(m.organization.name) ? "" : m.organization.name,
          companyPhone: m.organization.phone ?? "",
        };
      } else if (m && !sp.signup) {
        sendToApp = true;
      }
    }
  } catch {
    // Session read hiccup: render the normal signup.
  }
  if (sendToApp) redirect("/dashboard");
  return <RegisterResponsive setup={setup} />;
}
