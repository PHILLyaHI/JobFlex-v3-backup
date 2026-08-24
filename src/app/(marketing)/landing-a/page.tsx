// JobFlex marketing landing — Version A, route `/landing-a`.
//
// A NEW route alongside the live ones, not a replacement. `/` and `/landing`
// (src/components/v3/landing/) are untouched; nothing here imports them.
//
// Server component so the metadata and viewport exports below stay static.
// All markup and behaviour live in the client component it renders. Public
// route: no auth, no Prisma, no server actions, no API calls — every figure on
// the page is copy.

import type { Metadata, Viewport } from "next";
import { LandingA } from "@/components/v3/landing-a/landing-a";

export const metadata: Metadata = {
  title: "JobFlex — Price the job before you leave the driveway",
  description:
    "The operating system for contractors. Measure a roof from the air, trace a fence on a map, or walk the job on video — then send a line-itemed proposal with live material prices, and run the schedule, the crew and the invoice from the same workspace.",
};

// `maximumScale` is deliberately not set. Pinning it suppresses pinch-zoom and
// fails WCAG 2.2 SC 1.4.4 (Resize Text), which is not a trade worth making on
// a public page — least of all one read outdoors on a phone.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function LandingAPage() {
  return <LandingA />;
}
