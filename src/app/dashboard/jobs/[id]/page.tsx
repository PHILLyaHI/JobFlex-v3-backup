// Job detail — Blueprint edition. Port of the job detail donor
// (jobflex-jobdetail-blueprint (14).html), on the real Job record.
//
// This REPLACES the classic record page that lived at
// src/app/(dashboard)/dashboard/jobs/[id]/ — same URL, no parallel
// "-blueprint" route beside it. Moving the folder into src/app/dashboard/ is
// what puts it on the blueprint shell: ../../layout.tsx mounts the sidebar,
// topbar, sprite and `.content` wrapper once, and the page renders only the
// donor's `.content` children. Its sibling /new still lives under the
// (dashboard) route group on the classic layout; a static segment outranks a
// dynamic one, so /dashboard/jobs/new is unaffected.
//
// ── THE FIXTURE IS GONE ────────────────────────────────────────────
// The port originally shipped the donor's demo content verbatim, so
// "Roof tear-off & reroof — 4812 Maple Ave" and its crew, change orders,
// photos and expenses rendered for every id. It now reads the Job behind
// `[id]` — title, client, address, span, status, crew, calendar events, change
// orders, photos, expenses and the linked proposal — through
// job-detail-blueprint/job-detail-load.ts, and a 404 is a 404 rather than a
// fabricated job. Every `revalidatePath('/dashboard/jobs/<id>')` already in
// src/actions/ now lands on a page that reflects it.
//
// ── THE WORKER BRANCH IS PRESERVED ─────────────────────────────────
// Field workers still get the read-only, assignment-scoped WorkerJobView on
// REAL data (no expenses, change orders, crew management or messages). That
// view was the one part of the classic page with its own access rule, so it was
// carried across rather than dropped with the rest; it renders on the blueprint
// shell now, in the old design's visual language.

import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireOrg, isWorkerRole, NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { loadJobDetail } from "@/components/v3/job-detail-blueprint/job-detail-load";
// The VIEWPORT SWITCH, not the desktop content directly: above 768px it is
// JobDetailContent and at or below it the handheld rebuild in
// src/components/v3/mobile-job-detail/. Exactly one of the two mounts, and both
// render the record read below. The switch lives here rather than in
// responsive-dashboard-shell.tsx because this route is dynamic and no literal
// pathname key can match it — see the header of job-detail-viewport-switch.tsx.
import { JobDetailViewportSwitch } from "@/components/v3/mobile-job-detail/job-detail-viewport-switch";
import { WorkerJobView } from "./worker-job-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Job",
  description:
    "One job — its status, crew, schedule, change orders, photos and expenses on a single sheet.",
};

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // The blueprint layout deliberately swallows an auth failure so the PAGE can
  // decide; the classic tree let requireOrg throw into its own boundary.
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
      redirect(`/auth/login?next=${encodeURIComponent(`/dashboard/jobs/${id}`)}`);
    }
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  if (isWorkerRole(role)) {
    return <WorkerJobView id={id} organizationId={organizationId} userId={userId} />;
  }

  const record = await loadJobDetail(id, organizationId, role);
  if (!record) notFound();

  // Keyed on the record: /dashboard/jobs/A → /dashboard/jobs/B reconciles the
  // same component in the same slot, so without this the next job would open
  // carrying the previous one's tab, open roster and optimistic status.
  return <JobDetailViewportSwitch key={record.id} record={record} />;
}
