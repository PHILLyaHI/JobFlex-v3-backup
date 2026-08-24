/* JobFlex marketing landing — VERSION B, route entry.
 *
 * Server component, so `metadata` and `viewport` below stay static. It
 * renders one client component; every piece of behaviour lives there.
 *
 * There is no src/app/(marketing)/layout.tsx, so nothing wraps this page
 * but the root layout — the nav and footer it draws are its own and
 * nothing is doubled.
 *
 * Public route by design: no auth, no Prisma, no server actions, no API
 * calls. Every figure on the page is copy.
 *
 * This is a parallel exploration living beside the live surfaces. It does
 * not touch src/app/page.tsx, /landing, or src/components/v3/landing/*.
 */

import type { Metadata, Viewport } from "next";

import { LandingB } from "@/components/v3/landing-b/landing-b";

export const metadata: Metadata = {
  title: "JobFlex — Quote the job before you leave the driveway",
  description:
    "The operating system for contractors. Describe the work in plain English and get a line-itemed estimate with a live retail price on every material — then run the schedule, the crew and the invoice from the same file.",
};

/* Read at true device width: the page has a real handheld build, not a
   scaled desktop one. `maximumScale` is deliberately left unset — pinning
   it suppresses pinch-zoom and fails WCAG 2.2 SC 1.4.4 (Resize Text). */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function LandingBPage() {
  return <LandingB />;
}
