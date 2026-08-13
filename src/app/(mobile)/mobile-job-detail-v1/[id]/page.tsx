// MOBILE JOB DETAIL — /mobile-job-detail-v1/<id>
//
// The direct-review entry point for the handheld job-detail build: always the
// mobile design, at any width, so the composition can be opened on a desktop
// browser without resizing. The desktop page at /dashboard/jobs/[id] is
// untouched and keeps serving its own build at every width — this route stands
// beside it, per the mobile route strategy.
//
// NO DATA LAYER. Like the desktop page, this surface is a FIXTURE: the content
// comes from src/components/v3/job-detail-blueprint/job-detail-data.ts,
// imported verbatim. `[id]` resolves so the segment exists (and so a link from
// a job list keeps its shape), but it selects no content.
//
// Auth: middleware only matches /dashboard and /admin, so this route enforces
// its own redirect-to-login like every other (mobile) design route — the same
// requireOrg / UnauthorizedError / NoOrgError shape as
// src/app/(mobile)/mobile-project-detail-v2/[id]/page.tsx.

import { redirect } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { requireOrg, NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { MobileJobDetail } from "@/components/v3/mobile-job-detail/mobile-job-detail";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Job · JobFlex Mobile",
  description: "One job on a phone — status, schedule, crew, change orders, photos and expenses.",
};

// Handheld build: lock the scale so the layout is read at true device width,
// and pay out the notch / home-indicator insets the shell reserves.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default async function MobileJobDetailV1Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    await requireOrg();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect(`/auth/login?next=${encodeURIComponent(`/mobile-job-detail-v1/${id}`)}`);
    }
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  return <MobileJobDetail />;
}
