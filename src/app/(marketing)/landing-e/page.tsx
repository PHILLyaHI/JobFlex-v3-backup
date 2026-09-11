// LANDING-E — the test copy of landing-d (2026-09-10), for A/B work.
//
// Renders <LandingE /> from components/v3/landing-e: the same sections and
// data as landing-d (data imported, not copied), the same ?industry= and
// utm handling, the same register links, sticky bar, consent and pixel.
// Its events carry variant "e". Not for search engines: noindex, nofollow.

import type { Metadata, Viewport } from "next";

import { LandingE } from "@/components/v3/landing-e/landing-e-page";
import { readLandingVariant } from "@/components/v3/landing-e/landing-variant-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "[E] JobFlex — Turn your trade into a business",
  description:
    "JobFlex is the operating system for small-shop contractors: estimating, proposals, scheduling, jobs, and invoicing in one workspace.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function LandingEPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const landing = readLandingVariant(await searchParams);
  return <LandingE {...landing} />;
}
