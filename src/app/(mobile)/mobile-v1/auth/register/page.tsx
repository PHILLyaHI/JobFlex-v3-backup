// MOBILE · Create account — /mobile-v1/auth/register
//
// A SEPARATE URL, deliberately. The desktop blueprint register page stays live
// and untouched at /auth/register; this is the handheld composition of the same
// surface, side by side with it, per the Mobile Route Strategy in CLAUDE.md
// ("mobile pages live side-by-side with existing routes — they do NOT replace
// (dashboard), (admin), etc.").
//
// Public route: registration necessarily runs before a session exists, so there
// is no auth check here — exactly as on the desktop page.
//
// This file is a SERVER component that renders the client component, which is
// why `metadata` can be exported from it and no sibling layout.tsx is needed.
//
// No server action, API route or Prisma model was added or altered by this
// page: it reuses `registerAccount` and `validateAttributionCode` as they are.

import type { Metadata } from "next";
import { MobileRegisterContent } from "@/components/v3/mobile-auth-register/mobile-register-content";

export const metadata: Metadata = {
  title: "JobFlex · Create account",
  description: "Set up your shop — your organization, your login, your first quote.",
};

export default function MobileRegisterPage() {
  return <MobileRegisterContent />;
}
