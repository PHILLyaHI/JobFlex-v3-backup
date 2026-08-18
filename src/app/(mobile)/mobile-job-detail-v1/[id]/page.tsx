// MOBILE JOB DETAIL — /mobile-job-detail-v1/<id>
//
// The direct-review entry point for the handheld job-detail build: always the
// mobile design, at any width, so the composition can be opened on a desktop
// browser without resizing. The desktop page at /dashboard/jobs/[id] serves its
// own build above 768px and the SAME handheld build below it — this route
// stands beside them, per the mobile route strategy.
//
// REAL DATA, NOT A FIXTURE. Both this route and /dashboard/jobs/[id] read the
// Job behind `[id]` through the one loader in
// src/components/v3/job-detail-blueprint/job-detail-load.ts, so the preview URL
// and the live URL describe the same record and cannot drift. An id that
// resolves to nothing this org owns is a 404 here too.
//
// Auth: middleware only matches /dashboard and /admin, so this route enforces
// its own redirect-to-login like every other (mobile) design route — the same
// requireOrg / UnauthorizedError / NoOrgError shape as
// src/app/(mobile)/mobile-project-detail-v2/[id]/page.tsx.

import { notFound, redirect } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { requireOrg, NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { loadJobDetail } from "@/components/v3/job-detail-blueprint/job-detail-load";
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

  let organizationId: string;
  let role: string;
  let userId: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
    role = ctx.role;
    userId = ctx.user.id;
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect(`/auth/login?next=${encodeURIComponent(`/mobile-job-detail-v1/${id}`)}`);
    }
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  // `userId` is what lets the loader take its assignment-scoped branch for a
  // field worker (the record it returns is narrower — see the loader); for
  // every other role it is read and ignored.
  const record = await loadJobDetail(id, organizationId, role, userId);
  if (!record) notFound();

  // Keyed on the record — see the note on the same line in
  // src/app/dashboard/jobs/[id]/page.tsx.
  return <MobileJobDetail key={record.id} record={record} />;
}
