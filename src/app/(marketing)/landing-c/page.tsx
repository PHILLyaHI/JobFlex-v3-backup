// JobFlex — LANDING C route.
//
// Server component so `metadata` and `viewport` stay static; every piece of
// behavior (the mobile menu sheet, the scroll reveal) lives in the client
// component it renders.
//
// Static public surface: no auth check, no Prisma, no server action, no API
// route. There is no src/app/(marketing)/layout.tsx, so nothing wraps this but
// the root layout — the page carries its own nav and footer and neither is
// doubled.
//
// This route is additive. /landing, / and src/components/v3/landing/ are live
// and untouched; Landing C sits beside them as a candidate design.

import type { Metadata, Viewport } from "next";

import { LandingC } from "@/components/v3/landing-c/landing-c";

export const metadata: Metadata = {
  title: "JobFlex — Quote the job before you leave the driveway",
  description:
    "The operating system for contractors. Describe a job in plain English or walk it on video, and get back a line-itemed proposal with live retail material pricing — plus roof and fence estimators, scheduling, jobs, invoicing and a trade network.",
};

// `maximumScale` is deliberately unset: pinning it suppresses pinch-zoom and
// fails WCAG 2.2 SC 1.4.4 (Resize Text), which is not a trade worth making on
// a public page. `viewportFit: cover` matches the root layout so the fixed nav
// clears a notch.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function LandingCPage() {
  return <LandingC />;
}
