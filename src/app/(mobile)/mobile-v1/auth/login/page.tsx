"use client";

// MOBILE AUTH · SIGN IN — the route.  /mobile-v1/auth/login
//
// A handheld-first Blueprint build of the login surface, shipped BESIDE the
// desktop /auth/login rather than replacing it (CLAUDE.md → Mobile Route
// Strategy). The desktop route and its login.module.css are untouched.
//
// Deliberately NOT auth-gated: middleware only matches /dashboard, /admin,
// /influencer and /v3, and this is the sign-in page — the other (mobile) pages
// redirect here, not the other way round.
//
// The component lives in src/components/v3/mobile-auth-login/ so the route
// file stays a thin entry point; all markup, styles and auth wiring are there.
//
// useSearchParams() must sit under a Suspense boundary for static prerender
// (Next.js CSR-bailout requirement) — same boundary the desktop page uses.
// This file is a client component and so cannot export `metadata` or
// `viewport`; both live in the sibling ./layout.tsx, exactly as the desktop
// port does it.

import * as React from "react";
import { MobileLoginContent } from "@/components/v3/mobile-auth-login/mobile-login-content";

export default function MobileAuthLoginPage() {
  return (
    <React.Suspense fallback={null}>
      <MobileLoginContent />
    </React.Suspense>
  );
}
