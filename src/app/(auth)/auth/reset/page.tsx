// /auth/reset — set a new password from an emailed reset link.
//
// REPLACED IN PLACE, not forked. The blueprint mockup
// `jobflex-auth-reset-blueprint.html` is now what this route renders; the old
// Tailwind card layout is gone. There is no `/auth/reset-blueprint` twin — the
// earlier side-by-side convention (see `/dashboard/subscription-blueprint`) is
// reversed for this port: ported pages replace the surface they redesign.
//
// The page body is a client component (query-string token, show/hide password,
// the form's two states); this file stays a server component so the donor's
// <title> ships as real route metadata. useSearchParams() must sit under a
// Suspense boundary for static prerender.
//
// Behaviour and data flow are unchanged: same `resetPassword` server action,
// same `{ token, password }` contract, same no-token guard. No server action,
// API route or Prisma model was touched.

import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthResetContent } from "@/components/v3/auth-reset-blueprint/auth-reset-content";

export const metadata: Metadata = {
  title: "JobFlex · Set a new password",
};

export default function ResetPage() {
  return (
    <Suspense fallback={null}>
      <AuthResetContent />
    </Suspense>
  );
}
