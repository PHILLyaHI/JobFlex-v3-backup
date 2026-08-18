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
// ── ONE PAGE, TWO AUDIENCES ────────────────────────────────────────
// A field worker used to take a whole separate branch here: `WorkerJobView`, a
// 370-line Tailwind "Field Command" bento with its own query, its own date
// helpers and its own palette. It was the last pre-blueprint surface on the
// blueprint field, and on 2026-08-18 it was briefly replaced by a SECOND
// blueprint component (components/v3/worker-job-blueprint) — a fork of a page
// that already existed. Both are gone.
//
// The worker's record is now the same components as the office's, read for a
// different audience: `loadJobDetail` takes the role, and for a worker runs its
// assignment-scoped query — the job is found by
// `{ id, organizationId, assignments: { some: { workerId } } }`, so a worker
// still cannot open a job they are not on, and no WorkerProfile is still a 404.
// It returns the same `JobDetailRecord`, narrower: no expenses, no change
// orders, no roster, no proposal, no money at all, and a client reduced to the
// name on the door and the address to drive to. The components read
// `record.viewer` and drop the two sections and add the assignment stamp. See
// the "ALSO THE FIELD WORKER'S RECORD" block in job-detail-content.tsx.
//
// So this file has ONE branch again, and the handheld chrome question answers
// itself: the viewport switch below serves every role, and MobileJobDetail
// brings MobileNav with it.

import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireOrg, NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { loadJobDetail } from "@/components/v3/job-detail-blueprint/job-detail-load";
// The VIEWPORT SWITCH, not the desktop content directly: above 768px it is
// JobDetailContent and at or below it the handheld rebuild in
// src/components/v3/mobile-job-detail/. Exactly one of the two mounts, and both
// render the record read below. The switch lives here rather than in
// responsive-dashboard-shell.tsx because this route is dynamic and no literal
// pathname key can match it — see the header of job-detail-viewport-switch.tsx.
import { JobDetailViewportSwitch } from "@/components/v3/mobile-job-detail/job-detail-viewport-switch";

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

  // `userId` is what lets the loader take its assignment-scoped branch for a
  // worker; for every other role it is read and ignored.
  const record = await loadJobDetail(id, organizationId, role, userId);
  if (!record) notFound();

  // Keyed on the record: /dashboard/jobs/A → /dashboard/jobs/B reconciles the
  // same component in the same slot, so without this the next job would open
  // carrying the previous one's tab, open roster and optimistic status.
  return <JobDetailViewportSwitch key={record.id} record={record} />;
}
