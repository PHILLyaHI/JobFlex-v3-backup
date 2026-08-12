// /auth/forgot — the password-reset request page.
//
// A verbatim port of the approved mockup `jobflex-auth-forgot-blueprint.html`.
//
// REPLACED IN PLACE, NOT FORKED. This route's previous Tailwind implementation
// is gone; there is no `/auth/forgot-blueprint` twin. That reverses the older
// side-by-side convention still described in the headers of
// `src/app/(marketing)/landing/page.tsx` and
// `src/app/dashboard/manual-blueprint/page.tsx` ("a donor surface and its
// successor live side by side until the owner picks one") — the owner has
// since picked replacement. Those two files belong to other surfaces and were
// left untouched; their headers are now stale.
//
// The page body is a client component (the two states, the validation box and
// the submit call all need the browser); this file stays a server component so
// the donor's <title> ships as real route metadata.
//
// DATA LAYER UNTOUCHED. The `requestPasswordReset` server action, its
// VerificationToken issuance and its reset email are exactly as they were —
// this port changed markup and styles only.

import type { Metadata } from "next";
import { ForgotContent } from "@/components/v3/auth-forgot-blueprint/forgot-content";

export const metadata: Metadata = {
  title: "JobFlex · Forgot password",
};

export default function ForgotPasswordPage() {
  return <ForgotContent />;
}
