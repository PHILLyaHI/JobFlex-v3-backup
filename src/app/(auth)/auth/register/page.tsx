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
import { RegisterResponsive } from "./register-responsive";

// Title is the donor's <head> verbatim. The mockup ships no <meta
// name="description">; the line below is this repo's own convention.
export const metadata: Metadata = {
  title: "JobFlex · Create account",
  description: "Set up your shop — your organization, your login, your first quote.",
};

export default function RegisterPage() {
  return <RegisterResponsive />;
}
